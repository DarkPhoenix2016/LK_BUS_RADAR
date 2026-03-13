# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LK Bus Radar** is a real-time bus tracking system for Sri Lanka's Southern Province. It consumes GPS and transport data from an external SPGPS API, syncs it to a local MongoDB database, and displays live bus positions on an interactive map.

## Commands

### Frontend (Next.js) — run from `project/`
```bash
npm run dev     # Dev server on http://localhost:3000
npm run build   # Production build
npm run start   # Production server
npm run lint    # ESLint
```

### Backend (Express) — run from `project/server/`
```bash
npm start       # Start API server on port 4000
npm run dev     # Dev mode with hot reload
```

Both must run simultaneously for full functionality. Frontend fetches from backend at `localhost:4000`.

## Architecture

### System Layers

```
Frontend (Next.js :3000)  →  Backend API (Express :4000)  →  MongoDB
                                       ↕
                              External: api.spgps.lk
```

### Backend Data Flow

The backend has two jobs:
1. **Live location sync** (every 15s): Fetches device positions from SPGPS API → upserts `LiveVehicle` + `LiveRouteVehicle` collections
2. **Static data sync** (daily midnight): Fetches all routes (231 total), per-route metadata, stops, and timetables → upserts all MongoDB collections

Sync services are in `server/services/`. Job scheduling is in `server/jobs/cronJobs.js`. Sync can be triggered manually via `POST /admin/sync-static` and `POST /admin/update-live`.

External API endpoints are configured in `server/Resources/apiEndpoints.json`.

### Frontend Data Flow

1. `hooks/useTransportData.ts` — SWR polling fetches routes and live devices from the backend
2. `data/transportBuilder.ts` — Enriches raw device data with route/bus info via relational map lookups
3. `components/map/BusMap.tsx` — Renders Leaflet map with `BusMarker` for each device
4. `components/panels/` — Slide-out detail panels triggered by marker click

### Key Directories

| Path | Purpose |
|------|---------|
| `project/app/` | Next.js App Router pages |
| `project/components/map/` | Leaflet map + markers |
| `project/components/panels/` | Bus/route detail slide panels |
| `project/components/ui/` | Shadcn + custom UI components |
| `project/hooks/` | React data-fetching hooks (SWR) |
| `project/data/` | Client-side data transformation |
| `project/services/` | API endpoint constants + types |
| `project/server/models/` | Mongoose schemas (12 collections) |
| `project/server/services/` | Sync business logic |
| `project/server/jobs/` | node-cron schedulers |
| `project/server/config/` | DB connection + env config |

### Database Collections

**Static transport data:** `Route`, `BusStop`, `RouteStop`, `RoutePermit`, `Bus`, `RunningNumber`, `RunningSlot`, `RunningSlotStop`, `BusTurn`, `Device`

**Live/real-time:** `LiveVehicle` (position, speed, heading per device), `LiveRouteVehicle` (denormalized per-route view)

### Public API Endpoints (Backend)

```
GET  /api/public/routes                                    # All routes
GET  /api/public/withMeta/:routeId                         # Route + stops + geometry
GET  /api/public/timetable/bus-turn-running-slots/:routeId # Route timetable
GET  /api/public/devices-for-live-map                      # All live vehicle positions
GET  /health                                               # Server health check
```

## Environment Variables

**Frontend** (`project/.env`):
- `NEXT_PUBLIC_API_URL` — Backend base URL (default: `http://localhost:4000`)
- Firebase config vars (`NEXT_PUBLIC_FIREBASE_*`)

**Backend** (`project/server/.env`):
- `MONGO_URI` — MongoDB connection string (default: `mongodb://localhost:27017/LKBusRadar`)
- `PORT` — API server port (default: `4000`)
- `NODE_ENV`
- `API_TIMEOUT_MS`, `API_RETRY_COUNT`, `API_RETRY_DELAY_MS` — SPGPS API request settings

## Key Technologies

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI, Leaflet/react-leaflet, SWR, Framer Motion, Firebase
- **Backend:** Express 5, MongoDB/Mongoose 8, Axios, node-cron
