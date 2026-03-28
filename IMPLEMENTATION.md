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

## Local testing

### Prerequisites

- Node.js 18 or newer
- No database or extra services are required
- No `npm install` step is required for this prototype

### 1. Run the assignment checks

From `se-take-home-assignment/`:

```bash
./scripts/build.sh
./scripts/test.sh
./scripts/run.sh
```

What these do:

- `build.sh` checks backend files for syntax errors
- `test.sh` runs the unit tests
- `run.sh` generates `scripts/result.txt` with timestamped demo output

### 2. Run the full app locally

From `se-take-home-assignment/`:

```bash
node backend/server.js
```

Then open:

```text
http://localhost:3000
```

This starts the Node backend and also serves the Vue frontend from the same server, so you can test the whole prototype in one place.

### 3. What to test in the browser

- Click `New Normal Order` and confirm it appears in `Pending Orders`
- Click `New VIP Order` and confirm it appears ahead of normal orders
- Click `+ Bot` and confirm the oldest eligible order moves to processing immediately
- Wait 10 seconds and confirm the order moves to `Completed Orders`
- Click `- Bot` while a bot is processing and confirm that order returns to `Pending Orders` in the correct priority position
- Add a bot while pending orders exist and confirm it picks work up immediately

### 4. Run the interactive CLI locally

From `se-take-home-assignment/`:

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

### 5. Optional frontend-only local testing

If you want to serve the frontend separately, host the `frontend/` folder with any static server and point the UI to your backend URL using the API input field in the top panel.

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

- Service type: `Web Service`
- Environment: `Node`
- Root directory: `backend`
- Build command: leave empty
- Start command: `node server.js`

Render provides `PORT` automatically. The backend already supports CORS for the Vercel frontend.
