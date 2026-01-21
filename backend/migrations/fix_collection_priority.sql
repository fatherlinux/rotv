-- Fix migration: Correct priority assignments
-- Date: 2026-01-21
-- Description: Fixes the initial priority assignment logic

-- Step 1: Reset all priorities to NULL so we can reassign them
UPDATE pois SET collection_priority = NULL
WHERE (deleted IS NULL OR deleted = FALSE);

-- Step 2: Reassign priorities based on actual data

-- Tier 1 (Daily): Organizations and major park systems
-- Priority: Virtual POIs (organizations) and major property owners
UPDATE pois SET collection_priority = 1
WHERE (deleted IS NULL OR deleted = FALSE)
  AND (
    poi_type = 'virtual'
    OR property_owner IN (
      'Summit Metro Parks',
      'Cleveland Metroparks',
      'Cuyahoga Valley National Park',
      'National Park Service'
    )
  );

-- Tier 2 (Every 2 days): Trails (all trails since most lack length data)
-- and hiking-related POIs
UPDATE pois SET collection_priority = 2
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL
  AND (
    poi_type = 'trail'
    OR primary_activities LIKE '%Hiking%'
    OR primary_activities LIKE '%Trail%'
  );

-- Tier 3 (Weekly): Historic sites and other points of interest
UPDATE pois SET collection_priority = 3
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL
  AND (
    (era IS NOT NULL AND era != '')
    OR (historical_description IS NOT NULL AND historical_description != '')
    OR poi_type = 'point'
  );

-- Tier 4 (Bi-weekly): Boundaries, rivers, and remaining low-priority items
UPDATE pois SET collection_priority = 4
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL;

-- Step 3: Display updated priority distribution
SELECT
  collection_priority,
  COUNT(*) as poi_count,
  CASE collection_priority
    WHEN 1 THEN 'Daily (Organizations & Parks)'
    WHEN 2 THEN 'Every 2 days (Trails & Hiking POIs)'
    WHEN 3 THEN 'Weekly (Historic Sites & POIs)'
    WHEN 4 THEN 'Bi-weekly (Boundaries & Rivers)'
    ELSE 'Unknown'
  END as tier_description
FROM pois
WHERE (deleted IS NULL OR deleted = FALSE)
GROUP BY collection_priority
ORDER BY collection_priority;

-- Show breakdown by POI type within each tier
SELECT
  collection_priority,
  poi_type,
  COUNT(*) as count
FROM pois
WHERE (deleted IS NULL OR deleted = FALSE)
GROUP BY collection_priority, poi_type
ORDER BY collection_priority, poi_type;

-- Fix migration complete
