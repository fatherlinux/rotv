# Claude Code Development Guidelines

## Development Governance

### MANDATORY Rules - Read This First

**These rules are non-negotiable and must be followed for every code change:**

#### 1. Test Locally Before Pushing

🚫 **NEVER push code to GitHub without testing locally first**

**Required steps before any `git push`:**

```bash
# 1. Build the container locally
./run.sh build

# 2. Start the container
./run.sh start

# 3. Run all tests and verify they pass
./run.sh test

# 4. Manually verify the feature works in the browser
# Open http://localhost:8080 and test your changes

# 5. Only after ALL tests pass and manual verification succeeds:
git push
```

**Why:** We experienced production failures (e.g., Playwright not installed) because code was pushed without testing in the container environment. Container builds catch dependency issues that local Node.js development misses.

#### 2. Semantic Versioning (SemVer)

**Follow [Semantic Versioning 2.0.0](https://semver.org/) strictly:**

Given a version number `MAJOR.MINOR.PATCH`, increment:
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, incompatible API changes
- **MINOR** (1.0.0 → 1.1.0): New features, backward-compatible
- **PATCH** (1.0.0 → 1.0.1): Bug fixes, backward-compatible

**Current version is tracked in:**
- `frontend/package.json` - Source of truth
- `Containerfile` LABEL - Should match frontend version

**Version bump workflow:**

```bash
# 1. Determine version bump type based on changes
# Breaking change → MAJOR
# New feature → MINOR
# Bug fix → PATCH

# 2. Update frontend/package.json
# Edit: "version": "1.10.0" → "1.11.0"

# 3. Update Containerfile LABEL
# Edit: LABEL version="1.10.0" → LABEL version="1.11.0"

# 4. Commit with conventional commit message
git commit -m "feat: add new feature

BREAKING CHANGE: old API removed"

# 5. Create and push git tag
git tag -a v1.11.0 -m "Release v1.11.0 - Description"
git push && git push --tags
```

**Pre-release versions:**
- Use for testing: `1.11.0-alpha.1`, `1.11.0-beta.1`, `1.11.0-rc.1`

#### 3. Testing Requirements for PRs

**Before creating a Pull Request:**

✅ **All tests must pass locally:**
```bash
./run.sh test
```

✅ **Container must build successfully:**
```bash
./run.sh build
```

✅ **Manual verification in running container:**
```bash
./run.sh start
# Test the feature in browser
```

✅ **No breaking changes without MAJOR version bump**

✅ **New features must include tests** (when applicable)

**PR Checklist:**
- [ ] Tests pass locally (`./run.sh test`)
- [ ] Container builds (`./run.sh build`)
- [ ] Manual testing completed
- [ ] Version bumped correctly (SemVer)
- [ ] CLAUDE.md updated (if workflow changed)
- [ ] Architecture doc created (if major feature)

### Workflow Summary

**Every code change should follow this flow:**

```
1. Make code changes
2. ./run.sh build          # Build container
3. ./run.sh start          # Start container
4. Manual test in browser  # Verify it works
5. ./run.sh test           # Run automated tests
6. Update version (SemVer) # If releasing
7. git commit              # Commit changes
8. git tag (if release)    # Tag version
9. git push --tags         # Push to GitHub
```

**This prevents production issues and ensures quality.**

---

## Container-Based Development (Recommended)

**IMPORTANT:** Always develop using containers to ensure consistency with production. This prevents issues like missing dependencies (e.g., Playwright not installed).

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                 │
│                    http://localhost:8080                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Container: quay.io/fatherlinux/rotv                │
│                        Port 8080                                │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ Frontend (Built Static Assets in /app/public)          │  │
│   │ Backend (Node.js Express on :8080)                      │  │
│   │ PostgreSQL 17 (localhost:5432)                          │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   Data Volume: ~/.rotv/pgdata → /data/pgdata                   │
│   Databases: rotv (production), rotv_test (testing)            │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# 1. Setup environment
cp .env.example .env  # Fill in your API keys

# 2. Build container
./run.sh build

# 3. Start application
./run.sh start

# 4. Run tests
./run.sh test
```

### Development Workflow

**Making Code Changes:**

```bash
# Backend changes - hot reload into container
./run.sh reload-backend

# Frontend changes - rebuild and reload
./run.sh reload-frontend

# View logs
./run.sh logs

# Access container shell
./run.sh shell
```

**Complete rebuild (for major changes):**

```bash
./run.sh stop
./run.sh build
./run.sh start
```

### Start Local Development (Alternative - Direct Node.js)

1. **Start PostgreSQL container**:
   ```bash
   podman run -d --name postgres -p 5432:5432 \
     -v ~/.rotv/pgdata:/var/lib/postgresql/data:Z \
     --tmpfs /tmp/pgsocket:rw,mode=1777 \
     -e POSTGRES_USER=rotv \
     -e POSTGRES_PASSWORD=rotv \
     -e POSTGRES_DB=rotv \
     postgres:17-alpine
   ```
   Note: The `--tmpfs` mount is required because the pgdata was created with a custom socket path.

2. **Start Backend** (from backend/ directory):
   ```bash
   cd backend && npm run dev
   ```
   Runs on port 3001 with hot reload.

3. **Start Frontend** (from frontend/ directory):
   ```bash
   cd frontend && npm run dev
   ```
   Runs on port 8080 with Vite HMR. Proxies `/api` and `/auth` to backend on 3001.

4. **Access the app**: http://localhost:8080

### Stop Local Development

```bash
# Stop frontend and backend
pkill -f vite
pkill -f "node.*server.js"

# Stop postgres container
podman stop postgres && podman rm postgres
```

### Google OAuth Note

Google OAuth callbacks are registered for `localhost:8080`. The frontend runs on 8080 so OAuth works correctly.

### Troubleshooting pgdata Permissions

The pgdata directory has special permissions for rootless containers. To inspect:
```bash
podman unshare ls -la ~/.rotv/pgdata/
```

### Build Commands

- **Frontend build**: `cd frontend && npm run build` (outputs to frontend/dist/)
- **Rebuild container**: `./run.sh build`

## Project Structure

- `backend/` - Express.js API server
- `frontend/` - React + Vite frontend
- `frontend/dist/` - Built frontend assets (served by backend in production)
- `run.sh` - Container management script
- `~/.rotv/pgdata` - PostgreSQL data directory

## Database Schema

The app uses a unified `pois` table with `poi_type` to distinguish:
- `point` - Traditional POI markers (188 entries)
- `trail` - Trail geometries (180 entries)
- `river` - River geometries (1 entry)
- `boundary` - Municipal boundaries (9 entries)

The `/api/destinations` endpoint returns `pois WHERE poi_type = 'point'`.

## Documentation Standards

### Architecture Documents

For all major features or significant refactors, create an architecture document in the `docs/` directory following the pattern of `NEWS_EVENTS_ARCHITECTURE.md`.

**When to create an architecture document:**
- New feature that introduces a multi-step workflow or complex system
- Significant refactor that changes how a major part of the application works
- Integration of new third-party services or APIs
- Implementation of new data collection or processing pipelines
- Any feature that future developers would benefit from understanding holistically

**What to include:**
1. **Plain English Introduction**: Explain what problem the feature solves, how it works, and the benefits for users, admins, and developers
2. **Architecture Overview**: High-level diagram or description of components and data flow
3. **Key Technologies**: List technologies, libraries, and APIs used
4. **Implementation Details**: Code structure, key functions, error handling
5. **Testing & Validation**: How to verify the feature works correctly
6. **Future Improvements**: Known limitations or planned enhancements

**Example:** See `docs/NEWS_EVENTS_ARCHITECTURE.md` for a comprehensive example of an architecture document.
