--
-- Minimal test seed data for CI/CD
-- Contains just enough data for tests to pass
--

-- Clean up
DROP TABLE IF EXISTS poi_associations CASCADE;
DROP TABLE IF EXISTS poi_events CASCADE;
DROP TABLE IF EXISTS poi_news CASCADE;
DROP TABLE IF EXISTS pois CASCADE;
DROP TABLE IF EXISTS icons CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS surfaces CASCADE;

-- Create minimal schema (will be extended by server.js initDatabase)
CREATE TABLE IF NOT EXISTS pois (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    poi_type VARCHAR(50) DEFAULT 'point',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    description TEXT,
    image_data BYTEA,
    image_mime_type VARCHAR(50),
    geom GEOMETRY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert 20 sample POIs for testing (alphabetically ordered for predictable tests)
INSERT INTO pois (id, name, poi_type, latitude, longitude, description) VALUES
(1, 'Akron Hebrew Cemetery', 'point', 41.0850, -81.5150, 'Historic cemetery'),
(2, 'Boston Store', 'point', 41.2567, -81.5678, 'Visitor center'),
(3, 'Brandywine Falls', 'point', 41.2712, -81.5567, 'Beautiful waterfall'),
(4, 'Canal Exploration Center', 'point', 41.2456, -81.5234, 'Interactive museum'),
(5, 'Cuyahoga Valley Scenic Railroad', 'point', 41.2389, -81.5012, 'Historic train'),
(6, 'Deep Lock Quarry', 'point', 41.2156, -81.5678, 'Historic quarry'),
(7, 'Everett Covered Bridge', 'point', 41.2512, -81.5456, 'Covered bridge'),
(8, 'Frazee House', 'point', 41.2789, -81.5345, 'Historic house'),
(9, 'Happy Days Lodge', 'point', 41.2645, -81.5234, 'Visitor lodge'),
(10, 'Howe Meadow', 'point', 41.2534, -81.5567, 'Nature area'),
(11, 'Hunt Farm Visitor Center', 'point', 41.2678, -81.5123, 'Visitor center'),
(12, 'Indigo Lake', 'point', 41.2845, -81.5678, 'Scenic lake'),
(13, 'Jaite Mill', 'point', 41.2412, -81.5345, 'Historic mill'),
(14, 'Kendall Lake', 'point', 41.2567, -81.5456, 'Fishing lake'),
(15, 'Lock 29', 'point', 41.2456, -81.5234, 'Canal lock'),
(16, 'Beaver Marsh', 'point', 41.2389, -81.5567, 'Wetland area'),
(17, 'Blue Hen Falls', 'point', 41.2712, -81.5012, 'Small waterfall'),
(18, 'Bridal Veil Falls', 'point', 41.2845, -81.5678, 'Seasonal waterfall'),
(19, 'Station Road Bridge', 'point', 41.2534, -81.5345, 'Historic bridge'),
(20, 'Trail Mix', 'point', 41.2678, -81.5123, 'Trail junction')
ON CONFLICT DO NOTHING;

-- Reset sequence
SELECT setval('pois_id_seq', (SELECT MAX(id) FROM pois));
