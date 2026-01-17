/**
 * News Collection Service
 * Uses Gemini with Google Search grounding to find and summarize news/events for POIs
 *
 * Job execution is managed by pg-boss for crash recovery and resumability.
 * Progress is checkpointed after each batch so jobs can resume after container restarts.
 */

import { generateTextWithCustomPrompt, createGeminiClient } from './geminiService.js';
import { pushNewsToSheets, pushEventsToSheets } from './sheetsSync.js';

// Concurrency for parallel processing (requires paid tier Gemini API)
const CONCURRENCY = 15;

/**
 * Ensure the news_job_status table has checkpoint columns for resumability
 * Call this during server startup
 */
export async function ensureNewsJobCheckpointColumns(pool) {
  try {
    // Add poi_ids column if it doesn't exist
    await pool.query(`
      ALTER TABLE news_job_status
      ADD COLUMN IF NOT EXISTS poi_ids TEXT
    `);

    // Add processed_poi_ids column if it doesn't exist
    await pool.query(`
      ALTER TABLE news_job_status
      ADD COLUMN IF NOT EXISTS processed_poi_ids TEXT
    `);

    // Add pg_boss_job_id column if it doesn't exist
    await pool.query(`
      ALTER TABLE news_job_status
      ADD COLUMN IF NOT EXISTS pg_boss_job_id VARCHAR(100)
    `);

    console.log('News job checkpoint columns verified');
  } catch (error) {
    console.error('Error ensuring checkpoint columns:', error.message);
  }
}

/**
 * Find incomplete jobs that need to be resumed after a restart
 * @param {Pool} pool - Database connection pool
 * @returns {Array} - Array of job records that need resuming
 */
export async function findIncompleteJobs(pool) {
  const result = await pool.query(`
    SELECT * FROM news_job_status
    WHERE status IN ('queued', 'running')
    ORDER BY created_at ASC
  `);
  return result.rows;
}

// Prompt template for news collection
const NEWS_COLLECTION_PROMPT = `You are a precise news researcher for Cuyahoga Valley National Park and surrounding areas in Northeast Ohio.

Search for recent news and upcoming events SPECIFICALLY about: "{{name}}"
Location type: {{poi_type}}

PRIORITY SOURCES TO SEARCH (check these first):
- National Park Service (NPS) - nps.gov/cuva
- Ohio Department of Transportation (ODOT) - transportation.ohio.gov
- Summit Metro Parks - summitmetroparks.org
- Cleveland Metroparks - clevelandmetroparks.com
- Cuyahoga Valley Scenic Railroad - cvsr.org
- Conservancy for Cuyahoga Valley National Park - conservancyforcvnp.org
- Local news: Cleveland.com, Akron Beacon Journal, WKYC, News 5 Cleveland

CRITICAL REQUIREMENTS - BE EXTREMELY STRICT:
- Only include items that EXPLICITLY mention "{{name}}" by name
- The news/event must be DIRECTLY about this specific location, not just the general park area
- You must be 95%+ confident the item is specifically about "{{name}}"
- Do NOT include general park news that doesn't specifically mention this location
- Do NOT include news about similarly-named places in other locations
- Do NOT include news about the general Cuyahoga Valley area unless it specifically names "{{name}}"

Search for:
1. Recent news articles (last 30 days) that specifically mention "{{name}}"
2. Upcoming events happening AT "{{name}}" specifically
3. Closures, road work, or maintenance specifically affecting "{{name}}"
4. Trail conditions, seasonal updates, or access changes for "{{name}}"

Return a JSON object with this exact structure:
{
  "news": [
    {
      "title": "News headline",
      "summary": "2-3 sentence summary - must explain how this relates to {{name}} specifically",
      "source_name": "Source name (e.g., NPS.gov, Cleveland.com)",
      "source_url": "URL if available, or null",
      "published_date": "YYYY-MM-DD or null if unknown",
      "news_type": "general|closure|seasonal|maintenance|wildlife"
    }
  ],
  "events": [
    {
      "title": "Event name",
      "description": "Brief description - must specify this event is at {{name}}",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD or null if single day",
      "event_type": "guided-tour|program|festival|volunteer|educational",
      "location_details": "Must be at or near {{name}} specifically",
      "source_url": "Registration or info URL if available"
    }
  ]
}

IMPORTANT:
- If you are not 95%+ certain an item is specifically about "{{name}}", DO NOT include it
- It is better to return empty arrays than to include false positives
- If no news or events found specifically for "{{name}}", return: {"news": [], "events": []}
- Include the exact JSON structure above, no additional text
- Dates must be in YYYY-MM-DD format
- NEWS must be from the last 60 days only - do NOT include old news
- EVENTS must be upcoming (future dates) or currently happening - do NOT include past events`;

/**
 * Collect news and events for a specific POI
 * @param {Pool} pool - Database connection pool
 * @param {Object} poi - POI object with id, name, poi_type
 * @param {Object} sheets - Optional sheets client for API key restore
 * @returns {Object} - { news: [], events: [] }
 */
export async function collectNewsForPoi(pool, poi, sheets = null) {
  const prompt = NEWS_COLLECTION_PROMPT
    .replace('{{name}}', poi.name)
    .replace('{{poi_type}}', poi.poi_type);

  try {
    const response = await generateTextWithCustomPrompt(pool, prompt, sheets);

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`No JSON found in response for ${poi.name}`);
      return { news: [], events: [] };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      news: result.news || [],
      events: result.events || []
    };
  } catch (error) {
    console.error(`Error collecting news for ${poi.name}:`, error.message);
    return { news: [], events: [] };
  }
}

/**
 * Save news items to database
 * @param {Pool} pool - Database connection pool
 * @param {number} poiId - POI ID
 * @param {Array} newsItems - Array of news items from Gemini
 */
export async function saveNewsItems(pool, poiId, newsItems) {
  let savedCount = 0;
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  for (const item of newsItems) {
    try {
      // Skip news older than 60 days
      if (item.published_date) {
        const publishedDate = new Date(item.published_date);
        if (publishedDate < sixtyDaysAgo) {
          console.log(`Skipping old news item: ${item.title} (${item.published_date})`);
          continue;
        }
      }

      // Check if similar news already exists (by title similarity)
      const existing = await pool.query(
        `SELECT id FROM poi_news WHERE poi_id = $1 AND title = $2`,
        [poiId, item.title]
      );

      if (existing.rows.length > 0) {
        continue; // Skip duplicate
      }

      await pool.query(`
        INSERT INTO poi_news (poi_id, title, summary, source_url, source_name, news_type, published_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        poiId,
        item.title,
        item.summary,
        item.source_url,
        item.source_name,
        item.news_type || 'general',
        item.published_date ? new Date(item.published_date) : null
      ]);
      savedCount++;
    } catch (error) {
      console.error(`Error saving news item for POI ${poiId}:`, error.message);
    }
  }

  return savedCount;
}

/**
 * Save events to database
 * @param {Pool} pool - Database connection pool
 * @param {number} poiId - POI ID
 * @param {Array} eventItems - Array of events from Gemini
 */
export async function saveEventItems(pool, poiId, eventItems) {
  let savedCount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const item of eventItems) {
    try {
      // Skip past events
      if (item.start_date) {
        const startDate = new Date(item.start_date);
        const endDate = item.end_date ? new Date(item.end_date) : startDate;
        if (endDate < today) {
          console.log(`Skipping past event: ${item.title} (${item.start_date})`);
          continue;
        }
      }

      // Check if similar event already exists
      const existing = await pool.query(
        `SELECT id FROM poi_events WHERE poi_id = $1 AND title = $2 AND start_date = $3`,
        [poiId, item.title, new Date(item.start_date)]
      );

      if (existing.rows.length > 0) {
        continue; // Skip duplicate
      }

      await pool.query(`
        INSERT INTO poi_events (poi_id, title, description, start_date, end_date, event_type, location_details, source_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        poiId,
        item.title,
        item.description,
        new Date(item.start_date),
        item.end_date ? new Date(item.end_date) : null,
        item.event_type,
        item.location_details,
        item.source_url
      ]);
      savedCount++;
    } catch (error) {
      console.error(`Error saving event for POI ${poiId}:`, error.message);
    }
  }

  return savedCount;
}

/**
 * Process a batch of POIs in parallel
 * @param {Pool} pool - Database connection pool
 * @param {Array} pois - Array of POI objects
 * @param {Object} sheets - Optional sheets client
 * @param {number} concurrency - Number of concurrent requests
 * @returns {Object} - { newsFound, eventsFound, processed }
 */
async function processPoiBatch(pool, pois, sheets, concurrency = 3) {
  let newsFound = 0;
  let eventsFound = 0;
  let processed = 0;

  // Process in chunks of `concurrency` size
  for (let i = 0; i < pois.length; i += concurrency) {
    const chunk = pois.slice(i, i + concurrency);

    // Process chunk in parallel
    const results = await Promise.all(
      chunk.map(async (poi) => {
        try {
          console.log(`Collecting news for: ${poi.name}`);
          const { news, events } = await collectNewsForPoi(pool, poi, sheets);
          const savedNews = await saveNewsItems(pool, poi.id, news);
          const savedEvents = await saveEventItems(pool, poi.id, events);
          return { newsFound: savedNews, eventsFound: savedEvents, success: true };
        } catch (error) {
          console.error(`Error processing POI ${poi.name}:`, error.message);
          return { newsFound: 0, eventsFound: 0, success: false };
        }
      })
    );

    // Aggregate results
    for (const result of results) {
      newsFound += result.newsFound;
      eventsFound += result.eventsFound;
      processed++;
    }

    // Small delay between batches to avoid rate limiting
    if (i + concurrency < pois.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return { newsFound, eventsFound, processed };
}

/**
 * Create a news collection job record (called before submitting to pg-boss)
 * @param {Pool} pool - Database connection pool
 * @param {Array} poiIds - Array of POI IDs to process
 * @param {string} source - Source of the job ('manual', 'batch', 'scheduled')
 * @returns {Object} - Job info with jobId and totalPois
 */
export async function createNewsCollectionJob(pool, poiIds, source = 'batch') {
  const startTime = new Date();

  // Get POI details to validate they exist
  const poisResult = await pool.query(
    'SELECT id FROM pois WHERE id = ANY($1) AND (deleted IS NULL OR deleted = FALSE)',
    [poiIds]
  );
  const validPoiIds = poisResult.rows.map(r => r.id);
  const totalPois = validPoiIds.length;

  if (totalPois === 0) {
    throw new Error('No valid POIs to process');
  }

  // Record job with status 'queued' and store POI IDs for resumability
  const jobResult = await pool.query(`
    INSERT INTO news_job_status (
      job_type, status, started_at, total_pois, pois_processed,
      news_found, events_found, poi_ids, processed_poi_ids
    )
    VALUES ($1, 'queued', $2, $3, 0, 0, 0, $4, $5)
    RETURNING id
  `, [
    source === 'scheduled' ? 'scheduled_collection' : 'batch_collection',
    startTime,
    totalPois,
    JSON.stringify(validPoiIds),
    JSON.stringify([])
  ]);
  const jobId = jobResult.rows[0].id;

  console.log(`[Job ${jobId}] Created news collection job for ${totalPois} POIs`);

  return { jobId, totalPois, poiIds: validPoiIds };
}

/**
 * Process a news collection job (pg-boss handler)
 * This is the main work function called by pg-boss. It supports resumability
 * by checking which POIs have already been processed.
 *
 * @param {Pool} pool - Database connection pool
 * @param {Object} sheets - Optional sheets client for syncing
 * @param {string} pgBossJobId - The pg-boss job ID
 * @param {Object} jobData - Data passed from pg-boss { jobId, poiIds }
 */
export async function processNewsCollectionJob(pool, sheets, pgBossJobId, jobData) {
  const { jobId } = jobData;

  // Get the job record
  const jobResult = await pool.query('SELECT * FROM news_job_status WHERE id = $1', [jobId]);
  if (jobResult.rows.length === 0) {
    throw new Error(`Job ${jobId} not found`);
  }

  const job = jobResult.rows[0];

  // Parse POI IDs - handle both JSON strings and arrays
  let allPoiIds = job.poi_ids;
  let processedPoiIds = job.processed_poi_ids || [];

  if (typeof allPoiIds === 'string') {
    allPoiIds = JSON.parse(allPoiIds);
  }
  if (typeof processedPoiIds === 'string') {
    processedPoiIds = JSON.parse(processedPoiIds);
  }

  // Filter out already processed POIs (for resumability)
  const processedSet = new Set(processedPoiIds);
  const remainingPoiIds = allPoiIds.filter(id => !processedSet.has(id));

  if (remainingPoiIds.length === 0) {
    console.log(`[Job ${jobId}] All POIs already processed, marking complete`);
    await pool.query(`
      UPDATE news_job_status
      SET status = 'completed', completed_at = $1, pg_boss_job_id = $2
      WHERE id = $3
    `, [new Date(), pgBossJobId, jobId]);
    return;
  }

  // Update job status to running
  await pool.query(`
    UPDATE news_job_status
    SET status = 'running', pg_boss_job_id = $1
    WHERE id = $2
  `, [pgBossJobId, jobId]);

  console.log(`[Job ${jobId}] Starting/resuming news collection: ${remainingPoiIds.length} POIs remaining (${processedPoiIds.length} already done)`);

  // Get POI details for remaining POIs
  const poisResult = await pool.query(
    'SELECT id, name, poi_type FROM pois WHERE id = ANY($1)',
    [remainingPoiIds]
  );
  const pois = poisResult.rows;

  // Initialize counters from existing progress
  let newsFound = job.news_found || 0;
  let eventsFound = job.events_found || 0;
  let processed = processedPoiIds.length;
  const newlyProcessedIds = [...processedPoiIds];

  try {
    // Process in batches with checkpointing
    for (let i = 0; i < pois.length; i += CONCURRENCY) {
      const chunk = pois.slice(i, i + CONCURRENCY);

      const results = await Promise.all(
        chunk.map(async (poi) => {
          try {
            console.log(`[Job ${jobId}] Collecting news for: ${poi.name}`);
            const { news, events } = await collectNewsForPoi(pool, poi, sheets);
            const savedNews = await saveNewsItems(pool, poi.id, news);
            const savedEvents = await saveEventItems(pool, poi.id, events);
            return { poiId: poi.id, newsFound: savedNews, eventsFound: savedEvents, success: true };
          } catch (error) {
            console.error(`[Job ${jobId}] Error processing POI ${poi.name}:`, error.message);
            return { poiId: poi.id, newsFound: 0, eventsFound: 0, success: false };
          }
        })
      );

      // Aggregate results and track processed POIs
      for (const result of results) {
        newsFound += result.newsFound;
        eventsFound += result.eventsFound;
        processed++;
        newlyProcessedIds.push(result.poiId);
      }

      // Checkpoint: Update progress and processed POIs in database
      // This allows the job to resume from this point after a restart
      await pool.query(`
        UPDATE news_job_status
        SET pois_processed = $1, news_found = $2, events_found = $3, processed_poi_ids = $4
        WHERE id = $5
      `, [processed, newsFound, eventsFound, JSON.stringify(newlyProcessedIds), jobId]);

      // Small delay between batches
      if (i + CONCURRENCY < pois.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Mark job complete
    await pool.query(`
      UPDATE news_job_status
      SET status = 'completed', completed_at = $1
      WHERE id = $2
    `, [new Date(), jobId]);

    console.log(`[Job ${jobId}] Completed: ${processed} POIs, ${newsFound} news, ${eventsFound} events`);

    // Sync to Google Sheets if available
    if (sheets && (newsFound > 0 || eventsFound > 0)) {
      try {
        console.log(`[Job ${jobId}] Syncing news and events to Google Sheets...`);
        await pushNewsToSheets(sheets, pool);
        await pushEventsToSheets(sheets, pool);
        console.log(`[Job ${jobId}] Google Sheets sync completed`);
      } catch (syncError) {
        console.error(`[Job ${jobId}] Google Sheets sync failed:`, syncError.message);
      }
    }
  } catch (error) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await pool.query(`
      UPDATE news_job_status
      SET status = 'failed', completed_at = $1, error_message = $2
      WHERE id = $3
    `, [new Date(), error.message, jobId]);
    throw error; // Re-throw so pg-boss knows the job failed
  }
}

/**
 * Legacy function for backward compatibility and scheduled jobs
 * Creates and immediately processes a news collection job (non-pg-boss path)
 * @deprecated Use createNewsCollectionJob + pg-boss for new code
 */
export async function runBatchNewsCollection(pool, poiIds, sheets = null, source = 'batch') {
  const { jobId, totalPois, poiIds: validPoiIds } = await createNewsCollectionJob(pool, poiIds, source);

  // Process in background using setImmediate for backward compatibility
  setImmediate(async () => {
    try {
      await processNewsCollectionJob(pool, sheets, `legacy-${jobId}`, { jobId });
    } catch (error) {
      console.error(`[Job ${jobId}] Background processing failed:`, error);
    }
  });

  return { jobId, totalPois };
}

/**
 * Run news collection for all POIs
 * @param {Pool} pool - Database connection pool
 * @param {Object} sheets - Optional sheets client
 * @returns {Object} - Job status summary
 */
export async function runNewsCollection(pool, sheets = null) {
  // Get all active POIs (no limit - process everything)
  const poisResult = await pool.query(`
    SELECT id FROM pois
    WHERE (deleted IS NULL OR deleted = FALSE)
    ORDER BY
      CASE poi_type
        WHEN 'point' THEN 1
        WHEN 'boundary' THEN 2
        ELSE 3
      END,
      name
  `);

  const poiIds = poisResult.rows.map(p => p.id);
  return runBatchNewsCollection(pool, poiIds, sheets, 'scheduled');
}

/**
 * Get job status by ID
 * @param {Pool} pool - Database connection pool
 * @param {number} jobId - Job ID
 */
export async function getJobStatus(pool, jobId) {
  const result = await pool.query(
    'SELECT * FROM news_job_status WHERE id = $1',
    [jobId]
  );
  return result.rows[0] || null;
}

/**
 * Get news for a specific POI
 * @param {Pool} pool - Database connection pool
 * @param {number} poiId - POI ID
 * @param {number} limit - Max items to return
 */
export async function getNewsForPoi(pool, poiId, limit = 10) {
  const result = await pool.query(`
    SELECT id, title, summary, source_url, source_name, news_type, published_at, created_at
    FROM poi_news
    WHERE poi_id = $1
    ORDER BY COALESCE(published_at, created_at) DESC
    LIMIT $2
  `, [poiId, limit]);

  return result.rows;
}

/**
 * Get events for a specific POI
 * @param {Pool} pool - Database connection pool
 * @param {number} poiId - POI ID
 * @param {boolean} upcomingOnly - Only return future events
 */
export async function getEventsForPoi(pool, poiId, upcomingOnly = true) {
  let query = `
    SELECT id, title, description, start_date, end_date, event_type, location_details, source_url, created_at
    FROM poi_events
    WHERE poi_id = $1
  `;

  if (upcomingOnly) {
    query += ` AND start_date >= CURRENT_DATE`;
  }

  query += ` ORDER BY start_date ASC`;

  const result = await pool.query(query, [poiId]);
  return result.rows;
}

/**
 * Get all recent news across all POIs
 * @param {Pool} pool - Database connection pool
 * @param {number} limit - Max items to return
 */
export async function getRecentNews(pool, limit = 20) {
  const result = await pool.query(`
    SELECT n.id, n.title, n.summary, n.source_url, n.source_name, n.news_type,
           n.published_at, n.created_at, p.id as poi_id, p.name as poi_name, p.poi_type
    FROM poi_news n
    JOIN pois p ON n.poi_id = p.id
    ORDER BY COALESCE(n.published_at, n.created_at) DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

/**
 * Get all upcoming events across all POIs
 * @param {Pool} pool - Database connection pool
 * @param {number} daysAhead - How many days ahead to look
 */
export async function getUpcomingEvents(pool, daysAhead = 30) {
  const result = await pool.query(`
    SELECT e.id, e.title, e.description, e.start_date, e.end_date, e.event_type,
           e.location_details, e.source_url, p.id as poi_id, p.name as poi_name, p.poi_type
    FROM poi_events e
    JOIN pois p ON e.poi_id = p.id
    WHERE e.start_date >= CURRENT_DATE
      AND e.start_date <= CURRENT_DATE + INTERVAL '1 day' * $1
    ORDER BY e.start_date ASC
  `, [daysAhead]);

  return result.rows;
}

/**
 * Get latest job status
 * @param {Pool} pool - Database connection pool
 */
export async function getLatestJobStatus(pool) {
  const result = await pool.query(`
    SELECT * FROM news_job_status
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

/**
 * Clean up old news (older than specified days)
 * @param {Pool} pool - Database connection pool
 * @param {number} daysOld - Delete news older than this many days
 */
export async function cleanupOldNews(pool, daysOld = 90) {
  const result = await pool.query(`
    DELETE FROM poi_news
    WHERE created_at < CURRENT_DATE - INTERVAL '1 day' * $1
  `, [daysOld]);

  return result.rowCount;
}

/**
 * Clean up past events
 * @param {Pool} pool - Database connection pool
 * @param {number} daysOld - Delete events older than this many days
 */
export async function cleanupPastEvents(pool, daysOld = 30) {
  const result = await pool.query(`
    DELETE FROM poi_events
    WHERE end_date < CURRENT_DATE - INTERVAL '1 day' * $1
       OR (end_date IS NULL AND start_date < CURRENT_DATE - INTERVAL '1 day' * $1)
  `, [daysOld]);

  return result.rowCount;
}
