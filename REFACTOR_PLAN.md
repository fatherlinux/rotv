# POI Unification Refactor Plan

## Goal
Merge `destinations` and `linear_features` into a single unified `pois` table that supports both point-based and geometry-based POIs.

## Database Schema

### New `pois` Table (replaces `destinations` and `linear_features`)

```sql
CREATE TABLE IF NOT EXISTS pois (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,

  -- POI type: 'point', 'trail', or 'river'
  poi_type VARCHAR(50) NOT NULL DEFAULT 'point',

  -- Point geometry (for point POIs)
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Linear geometry (for trail/river POIs) - stored as JSONB
  geometry JSONB,
  geometry_drive_file_id VARCHAR(255),  -- GeoJSON stored in Drive "Geospatial" folder

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

  -- Trail-specific fields (NULL for non-trails)
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_point CHECK (
    poi_type != 'point' OR (latitude IS NOT NULL AND longitude IS NOT NULL)
  ),
  CONSTRAINT valid_linear CHECK (
    poi_type = 'point' OR geometry IS NOT NULL
  )
);

-- Index for faster lookups
CREATE INDEX idx_pois_type ON pois(poi_type);
CREATE INDEX idx_pois_name ON pois(name);
```

## Migration Strategy

1. Create new `pois` table
2. Migrate data from `destinations` → `pois` (poi_type = 'point')
3. Migrate data from `linear_features` → `pois` (poi_type = 'trail' or 'river')
4. Drop old tables after verification

## API Changes

### Endpoints (simplified)
- `GET /api/pois` - Get all POIs (replaces /api/destinations and /api/linear-features)
- `GET /api/pois/:id` - Get single POI
- `GET /api/pois/:id/image` - Get POI image
- `POST /api/admin/pois` - Create POI
- `PUT /api/admin/pois/:id` - Update POI
- `DELETE /api/admin/pois/:id` - Delete POI
- `POST /api/admin/pois/:id/image` - Upload image
- `POST /api/admin/pois/import-geojson` - Import from GeoJSON files

## Google Drive Structure

```
Roots of The Valley/
├── Icons/          (existing)
├── Images/         (existing)
└── Geospatial/     (NEW - stores GeoJSON files)
    ├── towpath-trail.geojson
    ├── cuyahoga-river.geojson
    └── ...
```

## Spreadsheet Schema (Destinations tab)

Add columns for unified POIs:
- POI Type (point/trail/river)
- Geometry Drive File ID
- Length (miles) - for trails
- Difficulty - for trails

Latitude/Longitude are optional (empty for linear features).

## Frontend Changes

1. **App.jsx**: Single `pois` state instead of `destinations` + `linearFeatures`
2. **Map.jsx**: Render POIs based on poi_type (markers for points, GeoJSON for linear)
3. **Sidebar.jsx**: Already unified - just update prop names
4. **ImageUploader.jsx**: Update endpoint to `/api/pois`

## Files to Modify

| File | Changes |
|------|---------|
| `backend/server.js` | New `pois` table, migration, unified endpoints |
| `backend/routes/admin.js` | Unified admin CRUD endpoints |
| `backend/services/sheetsSync.js` | Update Destinations sheet schema |
| `backend/services/driveImageService.js` | Add Geospatial folder |
| `frontend/src/App.jsx` | Single `pois` state |
| `frontend/src/components/Map.jsx` | Render based on poi_type |
| `frontend/src/components/Sidebar.jsx` | Update prop names |
| `frontend/src/components/ImageUploader.jsx` | Update endpoint |
