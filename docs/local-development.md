# Local development

Pathfinder runs as one container. The image builds the React app, then the Node server serves that build and `GET /health`. The same image is what Render runs later.

## Prerequisites

- Docker Desktop (Compose v2, so the command is `docker compose`)
- The map reads `MAPBOX_ACCESS_TOKEN` from `.env`. Copy the example file and set your public token before starting.

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
```

Open `.env` and set `MAPBOX_ACCESS_TOKEN` to your Mapbox public token (`pk.…`). Restart the container after changing it.

## Start

```powershell
docker compose up --build
```

- App: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/health](http://localhost:3000/health) returns `{ "status": "ok" }`

The first start builds the image, so it takes longer than the ones after it. After you change code, stop the container and run `docker compose up --build` again.

Stop with Ctrl+C, then:

```powershell
docker compose down
```

## Without Docker

Use this when you want the Vite dev server instead of rebuilding the image. Node.js 22 or newer is required.

```powershell
npm install
npm run dev
```

- App: [http://localhost:5173](http://localhost:5173)
- API and health: [http://localhost:3000](http://localhost:3000)

Vite proxies `/health` and `/api` to the Node server. The server reads `MAPBOX_ACCESS_TOKEN` from the repo-root `.env`.
