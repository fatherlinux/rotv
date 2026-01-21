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
    - git push --tags          # Push tags
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
