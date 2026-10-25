# Pathfinder plan

Car navigation app. The user builds a list of addresses and the app draws the fastest driving route that visits every stop.

Do the next unchecked step only. Mark it done in this file as part of that change. Local run instructions live in `docs/local-development.md`.

## Product

- The map fills the page. The toolbar's top is the Pathfinder logo to the left of the name Pathfinder, on the dark header color. The toolbar keeps its width and rounded corners.
- No accounts. The stop list, the toolbar toggles, and the map view persist in `localStorage` under `pathfinder.stops`, `pathfinder.roundTrip`, `pathfinder.lockFirst`, `pathfinder.lockLast`, and `pathfinder.mapView`.
- Desktop layout first. Keep the upper-left toolbar and the map as separate regions so a later mobile pass can stack them.
- On load, restore the saved map center and zoom. If none was saved and there are stops, frame those stops. If there is no saved view and no stops, ask for the browser location. If they deny it, or if geolocation fails, center on Minsk at longitude `27.559`, latitude `53.9006`.
- Stops are two to twelve. The add control stops at twelve.
- Routing uses the Mapbox Optimization API with profile `mapbox/driving`.
- The toolbar has a Round trip switch, then Lock the first point, then Lock the last point. Each label stays fixed. The switch shows whether that option is on.
  - Round trip on: `roundtrip=true`. The route returns to its start. Lock the first point sends `source=first`. Lock the last point sends `destination=last`. With neither lock, Mapbox uses the first stop as the start.
  - Round trip off: the shortest open drive. Mapbox does not implement an open start or an open end, so the server tries each free end with `source=first` and `destination=last` and keeps the shortest trip. A locked end stays fixed.
  - Both locks on: Round trip turns off and its switch is disabled. The trip starts at the current first stop and ends at the current last stop.
- A stop is `{ id, label, longitude, latitude }`. Only a geocoded place becomes a stop.
- Ant Design is for the toolbar. The map stays Mapbox GL.
- Toolbar order: the logo and name, the Stops heading, saved stops, at most one draft search row, a full-width grey Plus button, the Round trip switch, Lock the first point, Lock the last point, then a full-width green Build route button with a car icon. Build route is enabled for 2–12 stops.
- Plus opens the draft and is disabled while a draft or an edit is open, and when 12 stops are saved.
- The draft row is the search field, then a blue checkmark Confirm button, then the red Remove button. A small Map button sits inside the field, on the right, only as wide as the word. Confirm stays disabled until the user picks a suggestion or enters `latitude, longitude` (placeholder `53.9006, 27.559`). Remove on a new draft closes it without adding a stop.
- A saved row shows a numbered circle, a truncated label, a yellow pencil Edit button, and a red trash Delete button. The circle is smaller than the map marker and has no shadow. It uses a white number on the marker color. Before a route is built, and for a one-way start, that color is the neutral marker color. Markers on the map use the same list order, starting at 1.
- Edit turns that row back into the same search row, filled with the current name. The marker stays until Confirm replaces it. Clearing the field cancels the edit. Remove deletes the stop.
- Search calls the Mapbox Geocoding API, debounced, with at most five results. Proximity is the current map center. The language follows the browser. A coordinate pair is reverse-geocoded for its label.
- Map, inside the draft search field, is a toolbar mode. The next map click is reverse-geocoded and appended. The mode ends after that click, or when Map is pressed again. It is disabled at 12 stops.
- Markers are draggable. Dropping a marker reverse-geocodes the new point and updates that stop's label and coordinates in the list and on the map.
- Build route calls `POST /api/optimize`, reorders the stops into visit order, and draws each hop in its own color. The hop and the marker it leads to share a color. A one-way start has no incoming hop, so that marker stays neutral. Adding, editing, deleting, or dragging a stop, or switching round trip or either lock, clears the line until Build route is pressed again.

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
{ "stops": [{ "id": "string", "longitude": 0, "latitude": 0 }], "roundTrip": true, "lockFirst": false, "lockLast": false }
```

Response: visit order as stop ids, plus one GeoJSON `LineString` per hop. The line for a hop is the step geometries of that leg joined in order. Reject fewer than 2 or more than 12 stops.

## Steps

- [x] 1. Scaffold. Workspaces, header / toolbar / map shell, `GET /health`, Dockerfile, Compose, `.env.example`, `.gitignore`, this plan, and `docs/local-development.md`. `docker compose up --build` serves the shell on port 3000.
- [x] 2. Map. Serve the token from the server, create the Mapbox map, ask for location, and fall back to Minsk.
- [x] 3. Stops. Ant Design toolbar: add, edit, and remove up to twelve addresses. Geocode with Mapbox. Show numbered markers. Persist the list. Show Build route disabled.
- [x] 4. Select on map. A toolbar mode: the next click is reverse-geocoded and appended as a stop. Dragging a marker updates that stop in the list and on the map.
- [x] 5. Optimize. Round-trip switch above Build route. Enable that button for 2–12 stops. `POST /api/optimize` draws the route and renumbers markers in visit order. Adding, editing, or deleting a stop clears the line until Build route is pressed again.
- [x] 6. Colored hops. Request the step geometry, join the steps of each leg into one line, and paint that line and the marker it leads to with the same color.
- [x] 7. Add locking the first and last stops. If both are locked, round trip option becomes unavailable.
- [ ] 8. Render. Deploy the image, set the token, and confirm `/health` and the map on the public URL.
