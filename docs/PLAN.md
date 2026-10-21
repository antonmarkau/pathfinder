# Pathfinder plan

Car navigation app. The user builds a list of addresses and the app draws the fastest driving route that visits every stop.

Do the next unchecked step only. Mark it done in this file as part of that change. Local run instructions live in `docs/local-development.md`.

## Product

- The app name in the header is Pathfinder.
- No accounts. The stop list and the round-trip toggle persist in `localStorage` under `pathfinder.stops` and `pathfinder.roundTrip`.
- Desktop layout first. Keep the header, the upper-left toolbar, and the map as separate regions so a later mobile pass can stack them.
- On load, ask for the browser location. If the user allows it, center the map there. If they deny it, or if geolocation fails, center on Minsk at longitude `27.559`, latitude `53.9006`.
- Stops are two to twelve. The add control stops at twelve.
- Routing uses the Mapbox Optimization API with profile `mapbox/driving`.
- The toolbar has a round-trip / one-way toggle.
  - Round trip: `roundtrip=true`. The route returns to its start. Mapbox chooses which stop is the start of the loop.
  - One-way: `roundtrip=false`, `source=any`, `destination=any`. Mapbox chooses the best start and end.
- A stop is `{ id, label, longitude, latitude }`. Only a geocoded place becomes a stop.

## Runtime

- TypeScript, React, and Node. One process serves the built client and the API.
- Listen on `0.0.0.0` and `process.env.PORT` (default `3000`). `GET /health` returns `200` and `{ "status": "ok" }`.
- One secret: `MAPBOX_ACCESS_TOKEN` in the repo-root `.env`, which is gitignored. `.env.example` lists the name with an empty value. The server reads the token at runtime. The browser fetches that same public `pk.` token from the server before creating the map. Do not add a second token variable, and do not log the token.
- Production is the root `Dockerfile`. Render runs that image as one web service and injects `PORT` and `MAPBOX_ACCESS_TOKEN`.

## Layout

```
client/     Vite + React + TypeScript
server/     Express, serves client/dist and the API
docs/       This plan and local run instructions
```

## API

`GET /api/mapbox-token` returns `{ "token": "pk.…" }`. It responds with 503 when the public token is missing.

`POST /api/optimize`

```json
{ "stops": [{ "id": "string", "longitude": 0, "latitude": 0 }], "roundTrip": true }
```

Response: visit order as stop ids, plus the route as a GeoJSON `LineString`. Reject fewer than 2 or more than 12 stops.

## Steps

- [x] 1. Scaffold. Workspaces, header / toolbar / map shell, `GET /health`, Dockerfile, Compose, `.env.example`, `.gitignore`, this plan, and `docs/local-development.md`. `docker compose up --build` serves the shell on port 3000.
- [x] 2. Map. Serve the token from the server, create the Mapbox map, ask for location, and fall back to Minsk.
- [ ] 3. Stops. Add, edit, and remove up to twelve addresses. Geocode with Mapbox. Show markers. Persist the list.
- [ ] 4. Select on map. A toolbar mode: the next click is reverse-geocoded and appended as a stop.
- [ ] 5. Optimize. Round-trip toggle, `POST /api/optimize`, draw the route, and renumber markers in visit order.
- [ ] 6. Render. Deploy the image, set the token, and confirm `/health` and the map on the public URL.
