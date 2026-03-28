# FeedMe Implementation Notes

## What is included

- `backend/`
  - In-memory order controller shared by the API server and CLI demo
  - Node.js HTTP server with REST endpoints and server-sent events
  - Interactive CLI mode for live command handling
  - Unit tests using Node's built-in test runner
- `frontend/`
  - Static Vue.js dashboard with live updates
  - API endpoint override field for connecting to a deployed Render backend
  - Vercel-ready static files with no frontend build step required

## Backend behavior

- Orders are unique and strictly increasing.
- VIP orders always stay ahead of normal orders, while preserving FIFO within the same type.
- Bots process one order at a time.
- Each order takes 10 seconds to complete.
- Removing the newest bot cancels its current order and requeues it in its original priority position.
- State lives only in memory.

## API endpoints

- `GET /health`
- `GET /api/state`
- `GET /api/events`
- `POST /api/orders/normal`
- `POST /api/orders/vip`
- `POST /api/bots/increase`
- `POST /api/bots/decrease`
- `POST /api/reset`

## Local usage

From `se-take-home-assignment/`:

```bash
./scripts/build.sh
./scripts/test.sh
./scripts/run.sh
node backend/server.js
```

Optional interactive CLI:

```bash
node backend/cli.js interactive
```

Interactive commands:

- `normal`
- `vip`
- `+bot`
- `-bot`
- `status`
- `reset`
- `help`
- `exit`

## Vercel deployment

Deploy `frontend/` as a static site.

- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty

After deployment, either:

- edit `frontend/config.js` with your Render backend URL before deploy, or
- use the API field in the UI after opening the site

## Render deployment

Deploy `backend/` as a Node web service.

- Root directory: `se-take-home-assignment/backend`
- Build command: leave empty
- Start command: `node server.js`

Render provides `PORT` automatically. The backend already supports CORS for the Vercel frontend.
