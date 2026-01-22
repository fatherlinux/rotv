# Claude Code Development Guidelines

## Development Governance

### MANDATORY Rules - Read This First

**These rules are non-negotiable and must be followed for every code change:**

#### 1. Branch-Based Development & PR Workflow

🚫 **NEVER work directly on master branch**
🚫 **NEVER create a Pull Request without testing locally first**

**Branch Naming Conventions:**

```
feature/short-description   # New features
fix/short-description       # Bug fixes
refactor/short-description  # Code refactoring
docs/short-description      # Documentation updates
test/short-description      # Test additions
```

**Examples:**
- `feature/add-supertest-integration-tests`
- `fix/playwright-timeout-handling`
- `refactor/simplify-run-script`
- `docs/update-governance-rules`

**Complete Branch & PR Workflow:**

```bash
# 1. Create a new branch for your work
git checkout -b feature/my-new-feature

# 2. Make your code changes

# 3. Build the container locally
./run.sh build

# 4. Run all tests and verify they pass
./run.sh test

# 5. Commit your changes (can be multiple commits)
git add .
git commit -m "feat: add my new feature"

# 6. Ask user to manually verify
# User will test in browser at http://localhost:8080

# 7. After user approves:
# - Update version numbers (SemVer) if releasing
# - Commit version bump
git commit -m "chore: bump version to X.Y.Z"

# 8. Push branch to GitHub
git push -u origin feature/my-new-feature

# 9. Create Pull Request in GitHub
# Use GitHub CLI or web interface:
gh pr create --title "Add my new feature" --body "Description..."

# 10. Create git tag for releases (AFTER PR is merged)
git tag -a vX.Y.Z -m "Release vX.Y.Z - Description"
git push --tags

# 11. Ask user if they want to merge PR
# User reviews and merges via GitHub UI

# 12. After PR is merged, clean up
git checkout master
git pull origin master
git branch -d feature/my-new-feature  # Delete local branch
git push origin --delete feature/my-new-feature  # Delete remote branch
```

**Best Practices:**

✅ **One branch per feature/fix** - Keep branches focused and small
✅ **Keep branches up to date** - Regularly `git pull origin master` and rebase if needed
✅ **Delete branches after merge** - Keeps repository clean
✅ **Use descriptive commit messages** - Follow conventional commits (feat:, fix:, docs:, etc.)
✅ **PR titles match branch purpose** - Makes review easier
✅ **Link PRs to issues** - If tracking work in GitHub Issues

**Why:** Branch-based development allows for:
- Code review before merging
- Parallel development on multiple features
- Easy rollback if something breaks
- Clear history of what changed and why

**Note:** Tags are only created AFTER PR is merged to master, not on feature branches.

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

# 2. Update frontend/package.json and backend/package.json
# Frontend: "version": "1.10.0" → "1.11.0"
# Backend:  "version": "1.5.0" → "1.6.0" (versions independently)

# 3. Update Containerfile LABEL (should match frontend version)
# Edit: LABEL version="1.10.0" → LABEL version="1.11.0"

# 4. Commit version bump
git add frontend/package.json backend/package.json Containerfile
git commit -m "chore: bump version to 1.11.0 (frontend) and 1.6.0 (backend)"

# 5. Create and push git tag
git tag -a v1.11.0 -m "Release v1.11.0 - Description"
git push && git push --tags

# 6. GitHub Actions automatically handles production builds
# DO NOT run ./run.sh build or ./run.sh push manually
# The CI/CD pipeline rebuilds and pushes to quay.io/fatherlinux/rotv
```

**Important Notes:**
- **Frontend and backend version independently** - frontend is source of truth for release version
- **GitHub Actions handles production builds** - pushing tags triggers automated container build and push to quay.io
- **Never manually build production containers** - use CI/CD pipeline for consistency

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
1. Create feature branch       # git checkout -b feature/description
2. Make code changes
3. ./run.sh build              # Build container (must succeed)
4. ./run.sh test               # Run automated tests (must pass)
5. git commit                  # Commit changes
6. Ask user to verify          # User manually tests and approves
7. Update version (SemVer)     # Bump version in package.json & Containerfile (if releasing)
8. git commit                  # Commit version bump
9. git push origin branch      # Push branch to GitHub
10. Create Pull Request        # Create PR in GitHub (via gh CLI or web UI)
11. Ask user to merge PR       # User reviews and merges via GitHub
12. After merge:
    - git checkout master      # Switch to master
    - git pull origin master   # Pull merged changes
    - git tag vX.Y.Z           # Tag the release (AFTER merge)
    - git push --tags          # Push tags (triggers GitHub Actions CI/CD)
    - GitHub Actions builds    # Automated container build & push to quay.io
    - Delete feature branch    # Clean up
```

**Key Points:**
- ✅ Always work in feature branches - NEVER commit directly to master
- ✅ Tests must pass before asking user to verify
- ✅ User approval required before version bump and PR creation
- ✅ User decides when to merge PR
- ✅ Tags are created AFTER PR is merged to master
- ✅ Clean up branches after merge

**This prevents production issues and ensures quality.**

---

## Container-Based Development (Recommended)

**IMPORTANT:** Always develop using containers to ensure consistency with production. This prevents issues like missing dependencies (e.g., Playwright not installed).

**📖 Full Development Architecture:** See `docs/DEVELOPMENT_ARCHITECTURE.md` for comprehensive details on:
- Ephemeral storage with tmpfs vs persistent storage
- Automatic production data seeding workflow
- Container build optimization strategies
- PostgreSQL startup and seed data import
- Testing and validation procedures

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
│   Development: tmpfs /data/pgdata (ephemeral, 2GB in-memory)   │
│   Production:  ~/.rotv/pgdata → /data/pgdata (persistent)      │
│   Seed Data:   ~/.rotv/seed-data.sql → /tmp/seed-data.sql      │
│   Databases:   rotv (main), rotv_test (testing)                │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Start

```bash
# 1. Setup environment
cp .env.example backend/.env  # Fill in your API keys

# 2. Build container
./run.sh build

# 3. Start application (auto-pulls production data on first start)
./run.sh start
# First start: Downloads 384MB production data from server
# Subsequent starts: Uses cached data (~10 seconds)

# 4. Run tests
./run.sh test
```

**Note:** Development mode uses ephemeral tmpfs storage - data is discarded on restart and reimported from cached seed data. This ensures a clean slate every time with real production data.

### Development Workflow

**Making Code Changes:**

🚫 **NEVER use `./run.sh reload-backend` or `./run.sh reload-frontend`**

These hot-reload commands can leave the container in an inconsistent state where code changes appear to work but are lost on restart, or where the running code doesn't match what's in the source files.

✅ **ALWAYS rebuild the container after code changes:**

```bash
./run.sh build && ./run.sh start
```

This ensures:
- All code changes are properly compiled into the container image
- Frontend and backend are always in sync
- No surprises when the container restarts
- Consistent behavior between development and production

**Utility commands (safe to use):**

```bash
# View logs
./run.sh logs

# Access container shell
./run.sh shell

# Run tests
./run.sh test
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

For all major features or significant refactors, create an architecture document in the `docs/` directory following the pattern of existing architecture documents.

**When to create an architecture document:**
- New feature that introduces a multi-step workflow or complex system
- Significant refactor that changes how a major part of the application works
- Integration of new third-party services or APIs
- Implementation of new data collection or processing pipelines
- Changes to development workflow or infrastructure
- Any feature that future developers would benefit from understanding holistically

**What to include:**
1. **Plain English Introduction**: Explain what problem the feature solves, how it works, and the benefits for users, admins, and developers
2. **Architecture Overview**: High-level diagram or description of components and data flow
3. **Key Technologies**: List technologies, libraries, and APIs used
4. **Implementation Details**: Code structure, key functions, error handling
5. **Testing & Validation**: How to verify the feature works correctly
6. **Future Improvements**: Known limitations or planned enhancements

**Examples:**
- `docs/DEVELOPMENT_ARCHITECTURE.md` - Development workflow, ephemeral storage, production seeding, container optimization
- `docs/NEWS_EVENTS_ARCHITECTURE.md` - News & events collection system with AI-powered content discovery
