-- Migration: Add priority-based news collection system
-- Date: 2026-01-21
-- Description: Adds collection_priority, scheduling, and tier tracking to enable
--              tiered news/events collection that reduces API costs

-- Step 1: Add priority tracking columns to pois table
ALTER TABLE pois
  ADD COLUMN IF NOT EXISTS collection_priority INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_news_collection TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_news_collection TIMESTAMP;

-- Step 2: Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pois_collection_priority
  ON pois(collection_priority);

CREATE INDEX IF NOT EXISTS idx_pois_last_collection
  ON pois(last_news_collection);

CREATE INDEX IF NOT EXISTS idx_pois_next_collection
  ON pois(next_news_collection);

-- Step 3: Add tier tracking to job status
ALTER TABLE news_job_status
  ADD COLUMN IF NOT EXISTS priority_tier INTEGER;

-- Step 4: Assign initial priorities based on POI type and metadata

-- Tier 1 (Daily): Organizations and major park systems
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

-- Tier 2 (Every 2 days): Popular trails and major trailheads
UPDATE pois SET collection_priority = 2
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL
  AND (
    (poi_type = 'trail' AND length_miles > 2)
    OR (poi_type = 'point' AND primary_activities LIKE '%Hiking%')
    OR (poi_type = 'point' AND primary_activities LIKE '%Trail%')
  );

-- Tier 3 (Weekly): Historic sites and smaller trails
UPDATE pois SET collection_priority = 3
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL
  AND (
    (era IS NOT NULL AND historical_description IS NOT NULL)
    OR (poi_type = 'trail' AND length_miles <= 2)
    OR poi_type = 'point'
  );

-- Tier 4 (Bi-weekly): Boundaries, rivers, and other low-priority items
UPDATE pois SET collection_priority = 4
WHERE (deleted IS NULL OR deleted = FALSE)
  AND collection_priority IS NULL;

-- Step 5: Display priority distribution
SELECT
  collection_priority,
  COUNT(*) as poi_count,
  CASE collection_priority
    WHEN 1 THEN 'Daily (Organizations & Parks)'
    WHEN 2 THEN 'Every 2 days (Popular Trails)'
    WHEN 3 THEN 'Weekly (Historic Sites & Small Trails)'
    WHEN 4 THEN 'Bi-weekly (Boundaries & Rivers)'
    ELSE 'Unknown'
  END as tier_description
FROM pois
WHERE (deleted IS NULL OR deleted = FALSE)
GROUP BY collection_priority
ORDER BY collection_priority;

-- Migration complete
