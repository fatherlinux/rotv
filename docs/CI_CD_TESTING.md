# CI/CD Testing Architecture

## Overview

Roots of The Valley uses automated testing via GitHub Actions to ensure code quality and prevent regressions. Every pull request automatically runs a comprehensive test suite covering database operations, API endpoints, News & Events collection, and UI interactions.

**Key Benefits:**
- **Catch bugs early** - Tests run automatically on every PR before code reaches production
- **Fast feedback** - Know within 2-3 minutes if your changes break anything
- **No production dependency** - Tests use committed fixtures, no access to production database needed
- **Consistent environment** - Tests run in the same containerized environment as production

## Test Suite Overview

**39 total tests across 4 test files:**

1. **Database Integration Tests** (`tests/database.integration.test.js`) - 10 tests
   - Table creation and schema validation
   - CRUD operations on POIs
   - Data integrity and constraints

2. **News & Events API Tests** (`tests/newsEvents.integration.test.js`) - 8 tests
   - Content discovery and collection
   - AI-powered summarization
   - API endpoints for news and events

3. **JavaScript Renderer Tests** (`tests/jsRenderer.test.js`) - 15 tests
   - Playwright-based page rendering
   - Dynamic content extraction
   - Timeout handling and SSL errors

4. **UI Integration Tests** (`tests/ui.integration.test.js`) - 6 tests
   - Satellite imagery toggle
   - Map controls functionality
   - Mobile navigation features (carousel, swipe, chevron navigation)

## GitHub Actions Workflow

### Workflow File

`.github/workflows/test.yml` - Runs on every pull request and push to master

### Workflow Steps

```yaml
1. Checkout repository
2. Login to Quay.io (private base image registry)
3. Pull base image: quay.io/fatherlinux/rotv-base:latest
4. Build application image with BUILD_ENV=test
5. Prepare test seed data (20 sample POIs)
6. Run tests:
   - Start container with ephemeral tmpfs storage
   - Wait for server to initialize database
   - Import test seed data
   - Execute npm test
7. Cleanup (always runs, even on failure)
```

### Build Arguments

The workflow uses `BUILD_ENV=test` to install dev dependencies:

```dockerfile
ARG BUILD_ENV=production

RUN if [ "$BUILD_ENV" = "test" ]; then \
      npm install; \
    else \
      npm install --only=production; \
    fi
```

This ensures test tools (vitest, playwright, supertest) are available in CI.

### Test Data

**Minimal Test Fixtures:** `backend/tests/fixtures/test-seed-data.sql`

Contains 20 sample POIs for testing:
- Alphabetically ordered for predictable test results
- Only inserts data (no schema creation - server handles that)
- Safe to commit (no production data)
- Fast to import (~1 second)

**Why committed fixtures?**
- ✅ No dependency on production database
- ✅ Fast test execution (no 384MB download)
- ✅ Consistent test data across all environments
- ✅ Easy to version control and review

## Running Tests Locally

### Quick Start

```bash
# Build container
./run.sh build

# Run all tests
./run.sh test
```

### What Happens

1. **Container starts** with ephemeral tmpfs storage (`--tmpfs /data/pgdata`)
2. **Server initializes** database schema via `initDatabase()`
3. **Test data imported** from `backend/tests/fixtures/test-seed-data.sql`
4. **Tests execute** using vitest test runner
5. **Container cleaned up** automatically

### Test Output

```
 Test Files  4 passed (4)
      Tests  39 passed (39)
   Start at  06:09:40
   Duration  37.16s
```

## Understanding Test Results

### GitHub Actions

View test results:
1. Go to PR page
2. Click "Checks" tab
3. Click "Run Tests" workflow
4. Expand "Run tests" step to see detailed output

### Common Test Failures

**1. Timeout Errors**
```
TimeoutError: locator.click: Timeout 30000ms exceeded
```
**Cause:** Playwright UI tests running slowly in CI environment
**Fix:** Increase timeout (e.g., from 30000 to 40000)

**2. Schema Mismatches**
```
ERROR: column "foo" of relation "pois" does not exist
```
**Cause:** Test seed data doesn't match server schema
**Fix:** Update `backend/tests/fixtures/test-seed-data.sql` to use correct column names

**3. Foreign Key Violations**
```
ERROR: insert or update on table "pois" violates foreign key constraint
```
**Cause:** Test data references non-existent era/owner/icon
**Fix:** Ensure referenced records exist in test data or use NULL

**4. Container Build Failures**
```
ERROR: type "geometry" does not exist
```
**Cause:** Test data tries to create PostGIS types without extension
**Fix:** Let server create schema, only insert data in test fixtures

## Adding New Tests

### 1. Database Tests

**File:** `backend/tests/database.integration.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../server.js';

describe('My Feature', () => {
  it('should do something', async () => {
    const response = await request(app)
      .get('/api/my-endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

### 2. UI Tests

**File:** `backend/tests/ui.integration.test.js`

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';

describe('My UI Feature', () => {
  it('should interact with element', async () => {
    await page.goto('http://localhost:8080');
    await page.click('.my-button');

    const text = await page.locator('.result').textContent();
    expect(text).toBe('Expected Result');
  }, 30000); // 30 second timeout for UI tests
});
```

### 3. Update Test Fixtures

If your feature needs specific test data:

**Edit:** `backend/tests/fixtures/test-seed-data.sql`

```sql
-- Add new test POIs
INSERT INTO pois (id, name, poi_type, latitude, longitude, brief_description) VALUES
(21, 'New Test POI', 'point', 41.2678, -81.5123, 'Test description')
ON CONFLICT (id) DO NOTHING;
```

**Guidelines:**
- Use sequential IDs starting from 21
- Keep alphabetically ordered for predictable tests
- Only insert data, don't create tables
- Use `ON CONFLICT DO NOTHING` for safety

## Critical Schema Fixes (PR #55)

### Problem Discovered

The test suite uncovered a critical schema bug:

**Before (BROKEN):**
```javascript
// server.js line 197
era VARCHAR(255),  // Column type doesn't match queries!
```

**Queries Expected:**
```javascript
LEFT JOIN eras e ON p.era_id = e.id  // Expects INTEGER era_id!
```

This caused 500 errors from `/api/destinations` endpoint.

### Solution

**Reordered table creation** to add foreign key constraint:

```javascript
// 1. Create eras table FIRST (line 176)
CREATE TABLE IF NOT EXISTS eras (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  ...
);

// 2. Create pois table with FK constraint (line 208)
CREATE TABLE IF NOT EXISTS pois (
  ...
  era_id INTEGER REFERENCES eras(id),  // FK constraint!
  ...
);
```

**Benefits:**
- ✅ Schema matches production exactly
- ✅ Database enforces referential integrity
- ✅ Can't reference non-existent eras
- ✅ Can't delete eras that POIs are using

## Branch Protection (Recommended)

### Enable Required Status Checks

Prevent merging PRs with failing tests:

1. Go to: https://github.com/fatherlinux/rotv/settings/branches
2. Click "Add branch protection rule"
3. **Branch name pattern:** `master` (or `main`)
4. Enable: ✅ **Require status checks to pass before merging**
5. Select: ✅ **Run Tests** (wait for it to appear after first PR)
6. Enable: ✅ **Require branches to be up to date before merging**
7. Optional: ✅ **Require approvals** (for team workflows)
8. Click "Create" or "Save changes"

### What This Does

- ❌ **Blocks merging** if any of the 39 tests fail
- ⏳ **Requires waiting** for GitHub Actions workflow to complete
- 🔄 **Forces updates** if master branch changes during PR review
- ✅ **Ensures quality** - only tested code reaches production

## Troubleshooting

### Local Tests Pass, CI Fails

**Common causes:**
1. **Timing issues** - CI runs slower, may need longer timeouts
2. **Environment differences** - Check BUILD_ENV is set correctly
3. **Base image version** - Ensure base image is up to date

**Debug steps:**
```bash
# Pull latest base image
podman pull quay.io/fatherlinux/rotv-base:latest

# Build with test environment
./run.sh build

# Run tests locally
./run.sh test

# Check container logs
./run.sh logs
```

### CI Authentication Failures

```
Error: 401 UNAUTHORIZED pulling quay.io/fatherlinux/rotv-base
```

**Fix:** Ensure GitHub secrets are configured:
- `QUAY_USERNAME` - Quay.io username
- `QUAY_PASSWORD` - Quay.io password/token

Add at: https://github.com/fatherlinux/rotv/settings/secrets/actions

### Tests Timing Out

**Playwright UI tests** may timeout in slower CI environments.

**Current timeouts:**
- Database/API tests: Default (5000ms)
- UI tests: 40000ms (40 seconds)

**Increase if needed:**
```javascript
it('my slow test', async () => {
  // ... test code
}, 60000); // 60 second timeout
```

### Database Schema Errors

**Error:** "column X does not exist"

**Check:**
1. `backend/server.js` `initDatabase()` creates correct schema
2. Test data uses column names that exist
3. Server started and initialized database before importing data

**Workflow order:**
```bash
1. Start container
2. Wait for server (initDatabase() runs)
3. Import test-seed-data.sql (data only, no CREATE TABLE)
4. Run tests
```

## Performance

### Test Execution Time

**Typical run:** 1m30s - 2m30s total

Breakdown:
- Checkout & setup: ~10s
- Pull base image: ~5s (cached)
- Build app image: ~40s
- Start & initialize: ~20s
- Run tests: ~30-60s
- Cleanup: ~5s

### Optimization Tips

1. **Use base image cache** - Don't rebuild base image unless Containerfile changes
2. **Minimal test data** - 20 POIs is enough for comprehensive testing
3. **Parallel test execution** - Vitest runs tests concurrently when possible
4. **Ephemeral storage** - tmpfs is faster than disk for test database

## Test Coverage

Current coverage by feature area:

| Feature Area | Test Files | Tests | Coverage |
|--------------|-----------|-------|----------|
| Database Schema | database.integration.test.js | 10 | ✅ High |
| API Endpoints | database.integration.test.js, newsEvents.integration.test.js | 18 | ✅ High |
| News & Events | newsEvents.integration.test.js | 8 | ✅ High |
| JavaScript Rendering | jsRenderer.test.js | 15 | ✅ High |
| Map UI | ui.integration.test.js | 2 | ⚠️ Medium |
| Mobile Navigation | ui.integration.test.js | 6 | ✅ High |
| **TOTAL** | **4 files** | **39 tests** | **✅ Good** |

### Coverage Gaps

Areas that could use more tests:
- Admin authentication and authorization
- OAuth flow integration
- File upload and Drive sync
- POI associations CRUD
- Error handling edge cases
- Network failure scenarios

## Continuous Integration Best Practices

### Before Creating a PR

1. ✅ **Run tests locally:** `./run.sh test`
2. ✅ **Build succeeds:** `./run.sh build`
3. ✅ **Manual verification:** Test the feature in browser
4. ✅ **Update fixtures:** If schema changed, update test data
5. ✅ **Add new tests:** Cover new functionality

### During PR Review

1. 👀 **Check test results** - All 39 tests should pass
2. 🔍 **Review coverage** - New features should have tests
3. ⏱️ **Monitor duration** - Flag if tests take >3 minutes
4. 🐛 **Fix failures immediately** - Don't merge with broken tests

### After Merging

1. ✅ **Tests pass on master** - GitHub Actions runs on merge too
2. 📊 **Monitor production** - Ensure no issues after deployment
3. 🏷️ **Tag releases** - Use semantic versioning for production deploys

## Related Documentation

- [Development Architecture](./DEVELOPMENT_ARCHITECTURE.md) - Container setup, ephemeral storage, production seeding
- [News & Events Architecture](./NEWS_EVENTS_ARCHITECTURE.md) - AI-powered content collection system
- [CLAUDE.md](../CLAUDE.md) - Development workflow, branch strategy, SemVer

## Quick Reference

```bash
# Run all tests locally
./run.sh test

# Build test container
./run.sh build

# View test logs
./run.sh logs

# Clean up test containers
./run.sh stop

# Check GitHub Actions status
gh run list --limit 5

# Watch latest test run
gh run watch

# View test output from specific run
gh run view 21310471758 --log
```

## Success Metrics

✅ **All 39 tests passing** (100%)
✅ **Test duration** < 2 minutes
✅ **Zero production database dependency**
✅ **Consistent results** across local and CI
✅ **Fast feedback** on every PR

---

**Last Updated:** January 24, 2026
**Related PR:** [#55 - Add automated test workflow](https://github.com/fatherlinux/rotv/pull/55)
