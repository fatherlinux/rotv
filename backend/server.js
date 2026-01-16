import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { configurePassport } from './config/passport.js';
import authRoutes from './routes/auth.js';
import { createAdminRouter } from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const app = express();

// Trust reverse proxy (for secure cookies behind CloudFlare/Apache)
app.set('trust proxy', 1);

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'rotv',
  user: process.env.PGUSER || 'rotv',
  password: process.env.PGPASSWORD || 'rotv',
});

// CORS configuration - allow credentials for session cookies
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173'],
  credentials: true
}));

// Increase JSON body limit for large GeoJSON geometry in linear features
app.use(express.json({ limit: '10mb' }));

// Session configuration with PostgreSQL store
const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'sessions',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Initialize Passport
configurePassport(pool);
app.use(passport.initialize());
app.use(passport.session());

// Mount auth routes
app.use('/auth', authRoutes);

// Mount admin routes
app.use('/api/admin', createAdminRouter(pool));

// Import trails and rivers from GeoJSON files into unified pois table
async function importGeoJSONFeatures(client) {
  const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../frontend/public');
  const dataPath = path.join(staticPath, 'data');

  // Helper to consolidate features by name
  function consolidateFeatures(features) {
    const byName = {};
    for (const feature of features) {
      const name = feature.properties?.name || 'Unnamed';
      if (!byName[name]) byName[name] = [];
      byName[name].push(feature.geometry);
    }

    const consolidated = [];
    for (const [name, geometries] of Object.entries(byName)) {
      let geometry;
      if (geometries.length === 1) {
        geometry = geometries[0];
      } else {
        const allCoords = geometries.map(g =>
          g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]
        ).flat();
        geometry = { type: 'MultiLineString', coordinates: allCoords };
      }
      consolidated.push({ name, geometry });
    }
    return consolidated;
  }

  try {
    // Import trails
    const trailsFile = path.join(dataPath, 'cvnp-trails.geojson');
    const trailsData = JSON.parse(await fs.readFile(trailsFile, 'utf-8'));
    const consolidatedTrails = consolidateFeatures(trailsData.features);

    for (const trail of consolidatedTrails) {
      await client.query(
        `INSERT INTO pois (name, poi_type, geometry)
         VALUES ($1, 'trail', $2)
         ON CONFLICT (name) DO UPDATE SET geometry = EXCLUDED.geometry WHERE pois.poi_type = 'trail'`,
        [trail.name, JSON.stringify(trail.geometry)]
      );
    }
    console.log(`Imported ${consolidatedTrails.length} trails`);

    // Import rivers
    const riverFile = path.join(dataPath, 'cvnp-river.geojson');
    const riverData = JSON.parse(await fs.readFile(riverFile, 'utf-8'));
    const consolidatedRivers = consolidateFeatures(riverData.features);

    for (const river of consolidatedRivers) {
      await client.query(
        `INSERT INTO pois (name, poi_type, geometry)
         VALUES ($1, 'river', $2)
         ON CONFLICT (name) DO UPDATE SET geometry = EXCLUDED.geometry WHERE pois.poi_type = 'river'`,
        [river.name, JSON.stringify(river.geometry)]
      );
    }
    console.log(`Imported ${consolidatedRivers.length} rivers`);

  } catch (err) {
    console.error('Error importing GeoJSON features:', err.message);
  }
}

// Create tables if not exists
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Unified POIs table (replaces destinations and linear_features)
    await client.query(`
      CREATE TABLE IF NOT EXISTS pois (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,

        -- POI type: 'point', 'trail', or 'river'
        poi_type VARCHAR(50) NOT NULL DEFAULT 'point',

        -- Point geometry (for point POIs)
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),

        -- Linear geometry (for trail/river POIs)
        geometry JSONB,
        geometry_drive_file_id VARCHAR(255),

        -- Shared metadata fields
        property_owner VARCHAR(255),
        brief_description TEXT,
        era VARCHAR(255),
        historical_description TEXT,
        primary_activities TEXT,
        surface VARCHAR(255),
        pets VARCHAR(50),
        cell_signal INTEGER,
        more_info_link TEXT,

        -- Trail-specific fields
        length_miles DECIMAL(6, 2),
        difficulty VARCHAR(50),

        -- Image storage
        image_data BYTEA,
        image_mime_type VARCHAR(50),
        image_drive_file_id VARCHAR(255),

        -- Sync fields
        locally_modified BOOLEAN DEFAULT FALSE,
        deleted BOOLEAN DEFAULT FALSE,
        synced BOOLEAN DEFAULT FALSE,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster lookups by type
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pois_type ON pois(poi_type)
    `);

    // Migrate data from old tables if they exist
    const destTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'destinations'
      )
    `);

    if (destTableExists.rows[0].exists) {
      // Migrate destinations to pois table
      const migrated = await client.query(`
        INSERT INTO pois (name, poi_type, latitude, longitude, property_owner, brief_description,
                          era, historical_description, primary_activities, surface, pets,
                          cell_signal, more_info_link, image_data, image_mime_type, image_drive_file_id,
                          locally_modified, deleted, synced, created_at, updated_at)
        SELECT name, 'point', latitude, longitude, property_owner, brief_description,
               era, historical_description, primary_activities, surface, pets,
               cell_signal, more_info_link, image_data, image_mime_type, image_drive_file_id,
               COALESCE(locally_modified, FALSE), COALESCE(deleted, FALSE), COALESCE(synced, FALSE),
               created_at, updated_at
        FROM destinations
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ON CONFLICT (name) DO NOTHING
        RETURNING id
      `);
      if (migrated.rowCount > 0) {
        console.log(`Migrated ${migrated.rowCount} destinations to pois table`);
      }
    }

    const linearTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'linear_features'
      )
    `);

    if (linearTableExists.rows[0].exists) {
      // Migrate linear_features to pois table
      const migrated = await client.query(`
        INSERT INTO pois (name, poi_type, geometry, property_owner, brief_description,
                          era, historical_description, primary_activities, surface, pets,
                          cell_signal, more_info_link, length_miles, difficulty,
                          image_data, image_mime_type, image_drive_file_id,
                          locally_modified, deleted, synced, created_at, updated_at)
        SELECT name, feature_type, geometry, property_owner, brief_description,
               era, historical_description, primary_activities, surface, pets,
               cell_signal, more_info_link, length_miles, difficulty,
               image_data, image_mime_type, image_drive_file_id,
               COALESCE(locally_modified, FALSE), COALESCE(deleted, FALSE), COALESCE(synced, FALSE),
               created_at, updated_at
        FROM linear_features
        ON CONFLICT (name) DO UPDATE SET
          geometry = EXCLUDED.geometry,
          poi_type = EXCLUDED.poi_type
        WHERE pois.poi_type IN ('trail', 'river')
        RETURNING id
      `);
      if (migrated.rowCount > 0) {
        console.log(`Migrated ${migrated.rowCount} linear features to pois table`);
      }
    }

    // Sync queue table for async operations
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id SERIAL PRIMARY KEY,
        operation VARCHAR(20) NOT NULL,
        table_name VARCHAR(50) NOT NULL,
        record_id INTEGER NOT NULL,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sync status table for tracking sync state
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_status (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        picture_url TEXT,
        oauth_provider VARCHAR(50) NOT NULL,
        oauth_provider_id VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT FALSE,
        preferences JSONB DEFAULT '{}',
        favorite_destinations INTEGER[] DEFAULT '{}',
        oauth_credentials JSONB DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP,
        UNIQUE(oauth_provider, oauth_provider_id)
      )
    `);

    // Add oauth_credentials column if it doesn't exist (for existing databases)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'oauth_credentials'
        ) THEN
          ALTER TABLE users ADD COLUMN oauth_credentials JSONB DEFAULT NULL;
        END IF;
      END $$;
    `);

    // Admin settings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id)
      )
    `);

    // Standardized activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default activities if table is empty
    const activityCount = await client.query('SELECT COUNT(*) FROM activities');
    if (parseInt(activityCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO activities (name, sort_order) VALUES
        ('Hiking', 1),
        ('Biking', 2),
        ('Photography', 3),
        ('Bird Watching', 4),
        ('Fishing', 5),
        ('Picnicking', 6),
        ('Camping', 7),
        ('Cross-Country Skiing', 8),
        ('Snowshoeing', 9),
        ('Kayaking', 10),
        ('Wildlife Viewing', 11),
        ('Historical Tours', 12),
        ('Train Rides', 13),
        ('Nature Study', 14),
        ('Scenic Drives', 15)
        ON CONFLICT (name) DO NOTHING
      `);
    }

    // Standardized eras table
    await client.query(`
      CREATE TABLE IF NOT EXISTS eras (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        year_start INTEGER,
        year_end INTEGER,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default eras if table is empty
    const eraCount = await client.query('SELECT COUNT(*) FROM eras');
    if (parseInt(eraCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO eras (name, year_start, year_end, description, sort_order) VALUES
        ('Pre-Colonial', NULL, 1750, 'Native American settlement and early history', 1),
        ('Early Settlement', 1750, 1827, 'European settlement and early farming communities', 2),
        ('Canal Era', 1827, 1913, 'Ohio & Erie Canal construction and operation', 3),
        ('Railroad Era', 1880, 1950, 'Valley Railroad and industrial transportation', 4),
        ('Industrial Era', 1870, 1970, 'Manufacturing, quarrying, and industrial development', 5),
        ('Conservation Era', 1970, 2000, 'Park establishment and early preservation efforts', 6),
        ('Modern Era', 2000, NULL, 'National Park status and current stewardship', 7)
        ON CONFLICT (name) DO NOTHING
      `);
    }

    // Standardized surfaces table
    await client.query(`
      CREATE TABLE IF NOT EXISTS surfaces (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default surfaces if table is empty
    const surfaceCount = await client.query('SELECT COUNT(*) FROM surfaces');
    if (parseInt(surfaceCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO surfaces (name, description, sort_order) VALUES
        ('Paved', 'Asphalt or concrete surface, suitable for all users', 1),
        ('Gravel', 'Gravel or crushed stone surface', 2),
        ('Boardwalk', 'Wooden planks, often over wetlands', 3),
        ('Dirt', 'Dirt or earth trail, varies with weather', 4),
        ('Grass', 'Mowed grass paths through fields', 5),
        ('Sand', 'Sandy surface, common near waterways', 6),
        ('Rocky', 'Natural rock outcroppings, uneven terrain', 7),
        ('Water', 'River or lake', 8),
        ('Rail', 'Historic railroad bed', 9),
        ('Mixed', 'Combination of multiple surface types', 10)
        ON CONFLICT (name) DO NOTHING
      `);
    }

    // Icons table for map icon configuration
    await client.query(`
      CREATE TABLE IF NOT EXISTS icons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        svg_filename VARCHAR(255),
        title_keywords TEXT,
        activity_fallbacks TEXT,
        sort_order INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add svg_content column if it doesn't exist (for AI-generated icons)
    await client.query(`
      ALTER TABLE icons ADD COLUMN IF NOT EXISTS svg_content TEXT
    `);

    // Add drive_file_id column for Google Drive storage
    await client.query(`
      ALTER TABLE icons ADD COLUMN IF NOT EXISTS drive_file_id VARCHAR(255)
    `);

    // Drive settings table for folder IDs
    await client.query(`
      CREATE TABLE IF NOT EXISTS drive_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Note: linear_features table is deprecated - data migrated to pois table above

    // Seed default icons if table is empty
    const iconCount = await client.query('SELECT COUNT(*) FROM icons');
    if (parseInt(iconCount.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO icons (name, label, svg_filename, title_keywords, activity_fallbacks, sort_order) VALUES
        ('visitor-center', 'Visitor Center', 'visitor-center.svg', 'visitor center,info,information', 'Info', 1),
        ('waterfall', 'Waterfall', 'waterfall.svg', 'falls,waterfall,cascade', NULL, 2),
        ('trail', 'Trail', 'trail.svg', 'trail,path,towpath', 'Hiking', 3),
        ('historic', 'Historic Site', 'historic.svg', 'historic,history,museum,house,mill,lock', 'Historical Tours', 4),
        ('bridge', 'Bridge', 'bridge.svg', 'bridge,covered bridge', NULL, 5),
        ('train', 'Train Station', 'train.svg', 'train,station,depot,railroad', 'Train Rides', 6),
        ('nature', 'Nature Area', 'nature.svg', 'nature,preserve,wetland,marsh,ledges', 'Nature Study,Wildlife Viewing', 7),
        ('skiing', 'Skiing', 'skiing.svg', 'ski,winter', 'Cross-Country Skiing,Snowshoeing', 8),
        ('biking', 'Biking', 'biking.svg', 'bike,cycling', 'Biking', 9),
        ('picnic', 'Picnic Area', 'picnic.svg', 'picnic,shelter', 'Picnicking', 10),
        ('camping', 'Camping', 'camping.svg', 'camp,campground', 'Camping', 11),
        ('music', 'Music Venue', 'music.svg', 'music,blossom,concert', 'Music', 12),
        ('river', 'River/Waterway', 'river.svg', 'river,creek,stream,cuyahoga', 'Kayaking,Fishing', 13),
        ('default', 'Other', 'default.svg', NULL, NULL, 14)
        ON CONFLICT (name) DO NOTHING
      `);
    }

    // Remove icon column from activities if it exists (moved to icons table)
    await client.query(`
      ALTER TABLE activities DROP COLUMN IF EXISTS icon
    `);

    // Import trails and rivers from GeoJSON if no linear features exist in pois table
    const linearCount = await client.query(`SELECT COUNT(*) FROM pois WHERE poi_type IN ('trail', 'river')`);
    if (parseInt(linearCount.rows[0].count) === 0) {
      console.log('Importing trails and rivers from GeoJSON...');
      await importGeoJSONFeatures(client);
    }

    console.log('Database initialized');
  } finally {
    client.release();
  }
}

// API Routes - Unified POIs
app.get('/api/pois', async (req, res) => {
  try {
    // Get all POIs (points, trails, rivers) - exclude image_data (large binary)
    const result = await pool.query(`
      SELECT id, name, poi_type, latitude, longitude, geometry, geometry_drive_file_id,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             length_miles, difficulty, image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois
      WHERE (deleted IS NULL OR deleted = FALSE)
      ORDER BY poi_type, name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching POIs:', error);
    res.status(500).json({ error: 'Failed to fetch POIs' });
  }
});

app.get('/api/pois/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, poi_type, latitude, longitude, geometry, geometry_drive_file_id,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             length_miles, difficulty, image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'POI not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching POI:', error);
    res.status(500).json({ error: 'Failed to fetch POI' });
  }
});

// Serve POI images from database (public endpoint)
app.get('/api/pois/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT image_data, image_mime_type FROM pois WHERE id = $1 AND image_data IS NOT NULL',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { image_data, image_mime_type } = result.rows[0];
    res.setHeader('Content-Type', image_mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image_data);
  } catch (error) {
    console.error('Error serving POI image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

app.get('/api/filters', async (req, res) => {
  try {
    const owners = await pool.query('SELECT DISTINCT property_owner FROM pois WHERE property_owner IS NOT NULL ORDER BY property_owner');
    const eras = await pool.query('SELECT DISTINCT era FROM pois WHERE era IS NOT NULL ORDER BY era');
    const surfaces = await pool.query('SELECT DISTINCT surface FROM pois WHERE surface IS NOT NULL ORDER BY surface');

    res.json({
      owners: owners.rows.map(r => r.property_owner),
      eras: eras.rows.map(r => r.era),
      surfaces: surfaces.rows.map(r => r.surface)
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

// Legacy API endpoints for backward compatibility during transition
app.get('/api/destinations', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, poi_type, latitude, longitude,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois
      WHERE poi_type = 'point'
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND (deleted IS NULL OR deleted = FALSE)
      ORDER BY name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching destinations:', error);
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

app.get('/api/destinations/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, poi_type, latitude, longitude,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Destination not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching destination:', error);
    res.status(500).json({ error: 'Failed to fetch destination' });
  }
});

// Legacy destination image endpoint - redirect to unified pois endpoint
app.get('/api/destinations/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT image_data, image_mime_type FROM pois WHERE id = $1 AND image_data IS NOT NULL',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { image_data, image_mime_type } = result.rows[0];
    res.setHeader('Content-Type', image_mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image_data);
  } catch (error) {
    console.error('Error serving destination image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Legacy linear-features endpoints for backward compatibility
app.get('/api/linear-features', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, poi_type as feature_type, geometry,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             length_miles, difficulty, image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois
      WHERE poi_type IN ('trail', 'river')
        AND (deleted IS NULL OR deleted = FALSE)
      ORDER BY poi_type, name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching linear features:', error);
    res.status(500).json({ error: 'Failed to fetch linear features' });
  }
});

app.get('/api/linear-features/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, poi_type as feature_type, geometry,
             property_owner, brief_description, era, historical_description,
             primary_activities, surface, pets, cell_signal, more_info_link,
             length_miles, difficulty, image_mime_type, image_drive_file_id,
             locally_modified, deleted, synced, created_at, updated_at
      FROM pois WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Linear feature not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching linear feature:', error);
    res.status(500).json({ error: 'Failed to fetch linear feature' });
  }
});

app.get('/api/linear-features/:id/image', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT image_data, image_mime_type FROM pois WHERE id = $1 AND image_data IS NOT NULL',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].image_data) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { image_data, image_mime_type } = result.rows[0];
    res.setHeader('Content-Type', image_mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image_data);
  } catch (error) {
    console.error('Error serving linear feature image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve generated icons from database (public endpoint)
app.get('/api/icons/:name.svg', async (req, res) => {
  try {
    const iconName = req.params.name;
    const result = await pool.query(
      'SELECT svg_content FROM icons WHERE name = $1 AND svg_content IS NOT NULL',
      [iconName]
    );

    if (result.rows.length === 0 || !result.rows[0].svg_content) {
      return res.status(404).json({ error: 'Icon not found' });
    }

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(result.rows[0].svg_content);
  } catch (error) {
    console.error('Error serving icon:', error);
    res.status(500).json({ error: 'Failed to serve icon' });
  }
});

// Serve static frontend files in production
const staticPath = process.env.STATIC_PATH || path.join(__dirname, '../frontend/dist');
app.use(express.static(staticPath));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  }
});

// Start server
const PORT = process.env.PORT || 3001;

async function start() {
  await initDatabase();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Roots of The Valley API running on port ${PORT}`);
  });
}

start().catch(console.error);
