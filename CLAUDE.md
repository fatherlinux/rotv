# Claude Code Development Guidelines

## Local Development Setup (Preferred for Development)

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                                 │
│                    http://localhost:8080                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Frontend (Vite) - Port 8080                     │
│                    React + Leaflet Map                          │
│                                                                 │
│   Serves: React app with hot reload                             │
│   Proxies: /api/*  → localhost:3001                             │
│            /auth/* → localhost:3001                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Backend (Node.js) - Port 3001                   │
│                    Express API Server                           │
│                                                                 │
│   /api/*   - REST endpoints (destinations, filters, etc)        │
│   /auth/*  - Google OAuth callbacks                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              PostgreSQL Container - Port 5432                   │
│                   postgres:17-alpine                            │
│                                                                 │
│   Data: ~/.rotv/pgdata                                          │
│   DB: rotv  │  User: rotv  │  Pass: rotv                        │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Restart Script

**After making code changes, use this script to restart dev servers:**

```bash
./restart-dev.sh          # Restart both backend and frontend
./restart-dev.sh backend  # Restart backend only
./restart-dev.sh frontend # Restart frontend only
```

The script:
- Kills existing dev servers
- Starts them in the background
- Logs output to `/tmp/rotv-backend.log` and `/tmp/rotv-frontend.log`
- Verifies servers started successfully

**Important:** Always use this script after modifying `server.js`, routes, or other backend code that requires a restart.

### Start Local Development

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
