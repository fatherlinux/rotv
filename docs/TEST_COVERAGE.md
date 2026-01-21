# Test Coverage Documentation

## Overview

The Roots of The Valley project uses [Vitest](https://vitest.dev/) for testing with a focus on integration tests that verify the full stack including database, API, and external services.

## Test Execution

All tests run **inside the container** with proper test database isolation:

```bash
./run.sh test
```

This command:
1. Stops the main container
2. Starts container with `PGDATABASE=rotv_test`
3. Creates/resets the test database
4. Runs all tests via `podman exec rotv npm test`
5. Stops the test container

## Current Test Suites (27 tests)

### 1. Database Integration Tests (9 tests)
**File:** `backend/tests/database.integration.test.js`

#### Schema Validation
- ✓ Database connection
- ✓ `pois` table structure (id, name, poi_type, latitude, longitude, events_url, news_url)
- ✓ `poi_news` table structure (id, poi_id, title, source_url, published_at, created_at)
- ✓ `poi_events` table structure (id, poi_id, title, start_date, source_url, created_at)
- ✓ Foreign key constraints (poi_news → pois, poi_events → pois)

#### Query Tests
- ✓ Query POIs by type (`poi_type = 'point'`)
- ✓ JOIN queries (news with POI data)
- ✓ JOIN queries (events with POI data, filtered by `start_date >= CURRENT_DATE`)
- ✓ Duplicate prevention constraints

### 2. News & Events API Tests (9 tests)
**File:** `backend/tests/newsEvents.integration.test.js`

#### News Endpoint
- ✓ `GET /api/pois/:id/news` - returns news array
- ✓ `GET /api/pois/:id/news` - handles non-existent POI (returns empty array)
- ✓ `GET /api/pois/:id/news?limit=5` - supports limit parameter

#### Events Endpoint
- ✓ `GET /api/pois/:id/events` - returns events array
- ✓ `GET /api/pois/:id/events` - handles non-existent POI (returns empty array)
- ✓ `GET /api/pois/:id/events` - filters future events only (>= 30 days ago)

#### Destinations Endpoint
- ✓ `GET /api/destinations` - returns POIs with optional news/events counts

#### Admin Endpoints
- ✓ `GET /api/admin/pois/:id/collection-progress` - validates access control (200/401/403/404)

#### Infrastructure
- ✓ Health check - verifies container is running

### 3. JavaScript Renderer Tests (9 tests)
**File:** `backend/tests/jsRenderer.test.js`

#### Detection (`isJavaScriptHeavySite`)
- ✓ Detects Wix sites (*.wixsite.com)
- ✓ Detects force-rendered sites (conservancyforcvnp.org, cvsr.org, etc.)
- ✓ Doesn't false-positive on regular sites
- ✓ Handles invalid URLs gracefully

#### Rendering (`renderJavaScriptPage`)
- ✓ Renders JavaScript-heavy pages (Conservancy news page)
- ✓ Handles timeout with fallback (networkidle → domcontentloaded)
- ✓ Ignores SSL certificate errors (`ignoreHTTPSErrors: true`)

#### Content Extraction (`extractEventContent`)
- ✓ Extracts event-related content from rendered HTML
- ✓ Filters out navigation keywords (privacy, contact, about, etc.)

## What's Covered

| Area | Coverage |
|------|----------|
| Database schema integrity | ✓ Full |
| News & Events API endpoints | ✓ Full |
| Playwright JavaScript rendering | ✓ Full |
| Error handling (404s, timeouts, SSL) | ✓ Full |
| Query performance (JOINs, filters) | ✓ Partial |

## What's NOT Covered

The following areas currently have no automated tests:

### Backend
- **Authentication/Authorization**
  - Google OAuth flow
  - Facebook OAuth flow
  - Session management
  - Admin access control
  - User permissions

- **File Uploads**
  - POI image uploads
  - CSV imports
  - Image processing (Sharp)

- **Background Jobs**
  - News collection workers (pg-boss)
  - Event collection workers
  - Scheduled tasks

- **Admin Endpoints**
  - Most admin routes require authentication
  - POI management (create, update, delete)
  - News/events management
  - User management

- **External Integrations**
  - Google Sheets sync
  - Gemini AI content generation
  - Facebook API interactions

- **Map/GIS Operations**
  - Geometry handling (trails, rivers, boundaries)
  - Coordinate transformations
  - Distance calculations

### Frontend
- **React Components** (no tests)
  - Map component
  - POI detail views
  - News/Events displays
  - Admin interface
  - Authentication UI

### Infrastructure
- **Container Startup**
  - PostgreSQL initialization
  - Database migrations
  - Environment variable handling

## Running Tests with Coverage

### 1. Install Coverage Provider

```bash
cd backend
npm install --save-dev @vitest/coverage-v8
```

### 2. Run Tests with Coverage

```bash
# Inside container
podman exec rotv sh -c "cd /app && npm test -- --coverage"

# Or modify ./run.sh test to accept --coverage flag
```

### 3. View Coverage Report

Coverage is configured in `backend/vitest.config.js`:

```javascript
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  exclude: [
    'node_modules/**',
    'tests/**',
    'test-*.js',
    '*.config.js'
  ]
}
```

**Reports generated:**
- **Terminal** - Table with coverage percentages
- **HTML** - `backend/coverage/index.html` (line-by-line visualization)
- **LCOV** - `backend/coverage/lcov.info` (for CI/CD integration)

### Example Coverage Output

```
┌─────────────────────────┬────────┬──────────┬─────────┬─────────┐
│ File                    │ % Stmts│ % Branch │ % Funcs │ % Lines │
├─────────────────────────┼────────┼──────────┼─────────┼─────────┤
│ server.js               │  45.2  │   32.1   │  38.5   │  45.8   │
│ services/jsRenderer.js  │  82.4  │   75.0   │  90.0   │  83.1   │
│ services/newsService.js │  68.3  │   55.5   │  70.0   │  69.2   │
│ routes/news.js          │  71.2  │   60.0   │  75.0   │  72.1   │
│ routes/events.js        │  70.8  │   58.3   │  73.3   │  71.5   │
└─────────────────────────┴────────┴──────────┴─────────┴─────────┘
```

## Test Database Isolation

Tests use a dedicated `rotv_test` database created automatically by the entrypoint script:

```sql
CREATE DATABASE rotv_test OWNER rotv;
```

**Benefits:**
- Production data is never touched
- Tests can DROP/CREATE tables freely
- Each test run starts with clean state
- No conflicts with running application

**How it works:**
1. Container starts with `PGDATABASE=rotv_test` environment variable
2. Application connects to test database
3. Tests execute against localhost:5432 (inside container)
4. API tests hit localhost:8080 (inside container)

## Adding New Tests

### Integration Test Template

```javascript
import { describe, it, expect } from 'vitest';
import request from 'supertest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8080';

describe('My Feature API', () => {
  it('should do something', async () => {
    const response = await request(BASE_URL)
      .get('/api/my-endpoint')
      .expect(200);

    expect(response.body).toBeDefined();
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

### Database Test Template

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'rotv_test',
  user: 'rotv',
  password: 'rotv'
});

afterAll(async () => {
  await pool.end();
});

describe('Database Tests', () => {
  it('should query data', async () => {
    const result = await pool.query('SELECT * FROM pois LIMIT 1');
    expect(result.rows.length).toBeGreaterThan(0);
  });
});
```

## CI/CD Integration

To integrate tests into GitHub Actions or other CI:

```yaml
- name: Build Container
  run: ./run.sh build

- name: Run Tests
  run: ./run.sh test

- name: Generate Coverage
  run: |
    podman exec rotv sh -c "cd /app && npm test -- --coverage"

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./backend/coverage/lcov.info
```

## Estimated Overall Coverage

Based on the current 27 tests focused on News & Events:

- **Backend Code Coverage:** ~30-40%
  - High coverage: News/Events APIs, JavaScript rendering
  - Low coverage: Auth, uploads, admin routes, background jobs

- **Frontend Code Coverage:** 0%
  - No React component tests

- **Database Coverage:** High for tested tables
  - Full schema validation for `pois`, `poi_news`, `poi_events`
  - No tests for session management, user tables

## Future Test Priorities

1. **Authentication Tests**
   - OAuth flows (mocked)
   - Session management
   - Permission checks

2. **Admin API Tests**
   - POI CRUD operations
   - Batch operations
   - Authorization checks

3. **Background Job Tests**
   - News collection scheduling
   - Job failure handling
   - Retry logic

4. **Frontend Tests**
   - Component rendering
   - User interactions
   - Map functionality

5. **End-to-End Tests**
   - Full user workflows
   - Multi-step processes
   - Browser automation (Playwright)
