# Codenames

Full-stack multiplayer Codenames app with:

- React frontend in [apps/frontend](/Users/camilomontero/Documents/Codenames/apps/frontend)
- shared game/domain logic in [apps/backend](/Users/camilomontero/Documents/Codenames/apps/backend)
- a single Bun server at [server.ts](/Users/camilomontero/Documents/Codenames/server.ts) that serves:
  - the built frontend
  - the `/health` endpoint
  - the `/ws` WebSocket game server

## Local Run

Prerequisite: [Bun](https://bun.sh)

```bash
bun install
bun run build:frontend
bun run start
```

Open:

- `http://127.0.0.1:3000`
- `http://127.0.0.1:3000/health`

## Render Deployment

This repo is prepared for [Render](https://render.com/) as a single web service.

Files added for deployment:

- [render.yaml](/Users/camilomontero/Documents/Codenames/render.yaml)
- [.bun-version](/Users/camilomontero/Documents/Codenames/.bun-version)

Render service behavior:

- `buildCommand`: `bun install && bun run build`
- `startCommand`: `bun run start`
- `healthCheckPath`: `/health`

### Deploy Steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint or Web Service from the repo.
3. Render will read [render.yaml](/Users/camilomontero/Documents/Codenames/render.yaml).
4. After deploy finishes, open the Render URL.

### Important Notes

- The app now uses same-origin WebSockets in the frontend, so the browser connects to `/ws` on the same host that serves the frontend.
- Render provides the `PORT` environment variable automatically.
- The blueprint sets `HOST=0.0.0.0` so the Bun server binds correctly inside Render.

## Scripts

From the repo root:

```bash
bun run dev
bun run start
bun run build
bun run build:frontend
bun run build:backend
```
