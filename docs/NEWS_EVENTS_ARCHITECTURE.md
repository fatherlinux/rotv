# News & Events Collection System Architecture

## Overview

The News & Events system automatically collects and displays current news articles and upcoming events for Points of Interest (POIs) in the Roots of The Valley application. It uses Google Gemini AI with web search grounding to find accurate, relevant information for each location.

**Key Features:**
- **Crash Recovery**: All jobs are managed by pg-boss and will resume after container restarts
- **Checkpointing**: Progress is saved after each batch, allowing jobs to continue from where they left off
- **Parallel Processing**: 15 concurrent API calls (requires paid tier Gemini API)

## System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                            │
├─────────────────────────────────────────────────────────────────────┤
│  Map.jsx                    │  NewsSettings.jsx                      │
│  - "Update News & Events"   │  - "Start Collection" button           │
│    button (Edit mode)       │  - Live progress display               │
│  - Polls job status         │  - Job history display                 │
│  - Shows real-time progress │  - Cleanup controls                    │
└──────────────┬──────────────┴────────────────┬──────────────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Backend API (Express.js)                       │
├─────────────────────────────────────────────────────────────────────┤
│  routes/admin.js                                                     │
│  ├─ POST /api/admin/news/collect-batch  (batch POIs, returns jobId)│
│  ├─ POST /api/admin/news/collect        (all POIs, returns jobId)  │
│  ├─ GET  /api/admin/news/job/:jobId     (poll job status)          │
│  ├─ GET  /api/admin/news/status         (latest job status)        │
│  ├─ POST /api/admin/news/cleanup        (delete old data)          │
│  └─ DELETE /api/admin/news/:id          (delete specific item)     │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Job Scheduler (jobScheduler.js)                   │
├─────────────────────────────────────────────────────────────────────┤
│  pg-boss PostgreSQL-based job queue                                  │
│  ├─ submitBatchNewsJob()    - Submit job for processing             │
│  ├─ registerBatchNewsHandler() - Worker that processes jobs         │
│  ├─ Scheduled job: Daily at 6:00 AM Eastern Time                    │
│  ├─ Auto-resume: Incomplete jobs resubmitted on server start        │
│  └─ Retry logic: Failed jobs retry up to 2 times                    │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    News Service (newsService.js)                     │
├─────────────────────────────────────────────────────────────────────┤
│  createNewsCollectionJob()  - Creates job record with POI list      │
│  processNewsCollectionJob() - pg-boss handler with checkpointing    │
│  ├─ Loads job state from database                                   │
│  ├─ Skips already-processed POIs (resumability)                     │
│  ├─ Processes POIs in parallel (15 concurrent)                      │
│  ├─ Checkpoints progress after each batch                           │
│  └─ Marks job complete/failed when done                             │
│                                                                      │
│  collectNewsForPoi()        - Calls Gemini AI for single POI        │
│  saveNewsItems()            - Persists news to database             │
│  saveEventItems()           - Persists events to database           │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Gemini Service (geminiService.js)                 │
├─────────────────────────────────────────────────────────────────────┤
│  - Calls Google Gemini API with search grounding enabled            │
│  - Uses structured prompts to ensure accuracy                        │
│  - Returns JSON with news[] and events[] arrays                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### poi_news
Stores news articles related to POIs.

```sql
CREATE TABLE poi_news (
  id SERIAL PRIMARY KEY,
  poi_id INTEGER REFERENCES pois(id),
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  source_url TEXT,
  source_name VARCHAR(200),
  news_type VARCHAR(50),        -- general, closure, seasonal, maintenance, wildlife
  published_at TIMESTAMP,
  ai_generated BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### poi_events
Stores upcoming events at POIs.

```sql
CREATE TABLE poi_events (
  id SERIAL PRIMARY KEY,
  poi_id INTEGER REFERENCES pois(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  event_type VARCHAR(50),       -- guided-tour, program, festival, volunteer, educational
  location_details TEXT,
  source_url TEXT,
  ai_generated BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### news_job_status
Tracks job execution history, progress, and checkpoint data for resumability.

```sql
CREATE TABLE news_job_status (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL,  -- batch_collection, scheduled_collection
  status VARCHAR(50),              -- queued, running, completed, failed
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_pois INTEGER DEFAULT 0,
  pois_processed INTEGER DEFAULT 0,
  news_found INTEGER DEFAULT 0,
  events_found INTEGER DEFAULT 0,
  error_message TEXT,
  -- Checkpoint columns for pg-boss resumability
  poi_ids TEXT,                    -- JSON array of all POI IDs to process
  processed_poi_ids TEXT,          -- JSON array of already-processed POI IDs
  pg_boss_job_id VARCHAR(100),     -- pg-boss job ID for correlation
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Data Flow

### 1. Manual Collection (Edit Page)
```
User clicks "Update News & Events" button
    │
    ▼
POST /api/admin/news/collect-batch { poiIds: [...] }
    │
    ▼
Backend creates job record, returns jobId immediately
    │
    ▼
Backend processes POIs asynchronously (3 concurrent)
    │
    ▼
Frontend polls GET /api/admin/news/job/:jobId every 1.5s
    │
    ▼
Progress displayed: "Processing 5/10 POIs - Found 2 news, 1 event"
    │
    ▼
Job completes → Frontend shows final results
```

### 2. Manual Collection (Settings Page)
Same flow as above, but:
- Processes ALL active POIs (up to 100)
- POST /api/admin/news/collect
- Polls every 2 seconds
- Shows progress bar with percentage

### 3. Scheduled Collection
```
pg-boss triggers job at 6 AM ET
    │
    ▼
runNewsCollection() called
    │
    ▼
Fetches all active POIs (limit 100)
    │
    ▼
Processes in parallel batches
    │
    ▼
Updates news_job_status table
    │
    ▼
Job completes (viewable in Settings page)
```

## Parallelization & Checkpointing

The system processes POIs in parallel with checkpointing for crash recovery:

```javascript
// Process 15 POIs concurrently (requires paid tier Gemini API)
const CONCURRENCY = 15;

for (let i = 0; i < pois.length; i += CONCURRENCY) {
  const chunk = pois.slice(i, i + CONCURRENCY);

  const results = await Promise.all(
    chunk.map(poi => collectNewsForPoi(pool, poi))
  );

  // Checkpoint: Save progress and processed POI IDs to database
  // This allows the job to resume from this point after a restart
  await pool.query(`
    UPDATE news_job_status
    SET pois_processed = $1, news_found = $2, events_found = $3, processed_poi_ids = $4
    WHERE id = $5
  `, [processed, newsFound, eventsFound, JSON.stringify(processedPoiIds), jobId]);

  // Small delay between batches (500ms)
}
```

**Crash Recovery Flow:**
1. Server restarts (intentional or crash)
2. On startup, `findIncompleteJobs()` queries for jobs with status 'queued' or 'running'
3. Each incomplete job is resubmitted to pg-boss
4. pg-boss handler loads `processed_poi_ids` from database
5. Handler skips already-processed POIs and continues from checkpoint

## AI Prompt Engineering

The Gemini prompt includes strict requirements:

1. **95%+ Confidence Requirement**: Only include items explicitly mentioning the POI name
2. **Source Priority**: NPS, ODOT, local parks, local news sources
3. **Recency Rules**:
   - News: Last 60 days only
   - Events: Future dates only
4. **Deduplication**: Skips items already in database (by title match)
5. **Structured Output**: Returns JSON with specific fields

## Troubleshooting

### Common Issues

**1. Job appears stuck (status: "running" for a long time)**
- Check server logs: `./run.sh logs | grep "Job"`
- Possible causes: API rate limiting, network issues
- Resolution: Jobs have 5-minute safety timeout on frontend

**2. No news/events being found**
- Check Gemini API key is configured: `settings` table, key `gemini_api_key`
- Verify POI names are specific enough for search
- Check server logs for API errors

**3. Jobs not running on schedule**
- Verify pg-boss initialized: Look for "pg-boss started" in logs
- Check PostgreSQL permissions for pg-boss schema
- Manual trigger works → scheduled trigger issue

**4. Duplicate news/events appearing**
- Database has unique check on (poi_id, title) for news
- Database has unique check on (poi_id, title, start_date) for events
- May see similar items with slightly different titles

### Log Messages

```bash
# Successful job start
[Job 42] Starting batch news collection for 10 POIs

# Per-POI processing
[Job 42] Collecting news for: Brandywine Falls

# Job completion
[Job 42] Completed: 10 POIs, 3 news, 2 events

# Errors
[Job 42] Error processing POI Brandywine Falls: API rate limit exceeded
[Job 42] Failed: Network error
```

### Database Queries for Debugging

```sql
-- Check recent jobs
SELECT id, job_type, status, total_pois, pois_processed,
       news_found, events_found, error_message
FROM news_job_status
ORDER BY created_at DESC
LIMIT 10;

-- Check news for a specific POI
SELECT n.*, p.name as poi_name
FROM poi_news n
JOIN pois p ON n.poi_id = p.id
WHERE p.name ILIKE '%brandywine%'
ORDER BY n.created_at DESC;

-- Count news/events by POI
SELECT p.name,
       COUNT(DISTINCT n.id) as news_count,
       COUNT(DISTINCT e.id) as event_count
FROM pois p
LEFT JOIN poi_news n ON p.id = n.poi_id
LEFT JOIN poi_events e ON p.id = e.poi_id
GROUP BY p.id, p.name
ORDER BY (COUNT(DISTINCT n.id) + COUNT(DISTINCT e.id)) DESC;

-- Check for running jobs
SELECT * FROM news_job_status WHERE status = 'running';
```

## Configuration

### Environment Variables
- `GEMINI_API_KEY`: Google Gemini API key (or stored in database settings)

### Database Settings
```sql
-- Check API key
SELECT * FROM settings WHERE key = 'gemini_api_key';

-- Update API key
UPDATE settings SET value = 'your-key' WHERE key = 'gemini_api_key';
```

### Tuning Parameters

| Parameter | Location | Default | Description |
|-----------|----------|---------|-------------|
| CONCURRENCY | newsService.js | 15 | Parallel POI processing (requires paid tier API) |
| Batch delay | newsService.js | 500ms | Delay between batches |
| Poll interval (Edit) | Map.jsx | 1500ms | Status polling rate |
| Poll interval (Settings) | NewsSettings.jsx | 2000ms | Status polling rate |
| Max POIs (batch) | admin.js | 50 | Max POIs per batch request |
| Max POIs (scheduled) | newsService.js | unlimited | Processes all active POIs |
| News retention | cleanup | 90 days | Auto-delete old news |
| Event retention | cleanup | 30 days | Auto-delete past events |
| Job retry limit | jobScheduler.js | 2 | Max retries for failed jobs |
| Job retry delay | jobScheduler.js | 30s | Wait time before retry |
| Job expiration | jobScheduler.js | 60 min | Job expires if not completed |

## Security Considerations

1. **Admin-only access**: All news collection endpoints require admin authentication
2. **Rate limiting**: Built-in delays prevent API abuse
3. **Input validation**: POI IDs validated before processing
4. **No user content**: All content is AI-generated from public sources
