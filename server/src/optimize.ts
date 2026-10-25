import type { Request, Response } from 'express';

const MIN_STOPS = 2;
const MAX_STOPS = 12;

type OptimizeStop = {
  id: string;
  longitude: number;
  latitude: number;
};

type OptimizeRequest = {
  stops: OptimizeStop[];
  roundTrip: boolean;
  lockFirst: boolean;
  lockLast: boolean;
};

type TripEnd = 'any' | 'first' | 'last';

type TripEnds = {
  source: TripEnd;
  destination: TripEnd;
};

type RouteGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export async function optimizeRoute(req: Request, res: Response) {
  const body = readRequest(req.body);
  if (!body) {
    res.status(400).json({ error: 'Send between 2 and 12 stops' });
    return;
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
  if (!token?.startsWith('pk.')) {
    res.status(503).json({ error: 'Set MAPBOX_ACCESS_TOKEN to a public pk. token' });
    return;
  }

  try {
    const roundTrip = body.roundTrip && !(body.lockFirst && body.lockLast);
    const route = roundTrip
      ? (
          await requestTrip(body.stops, true, {
            source: body.lockFirst ? 'first' : 'any',
            destination: body.lockLast ? 'last' : 'any',
          }, token)
        )?.route ?? null
      : await shortestOpenTrip(body.stops, token, body.lockFirst, body.lockLast);
    if (!route) {
      res.status(502).json({ error: 'The route could not be built' });
      return;
    }
    res.json(route);
  } catch {
    res.status(502).json({ error: 'The route could not be built' });
  }
}

async function shortestOpenTrip(
  stops: OptimizeStop[],
  token: string,
  lockFirst: boolean,
  lockLast: boolean,
): Promise<RouteResult | null> {
  const candidates = openCandidates(stops, lockFirst, lockLast);
  const fixedEnds: TripEnds = { source: 'first', destination: 'last' };
  const trips = await mapPool(candidates, 4, (candidate) => requestTrip(candidate, false, fixedEnds, token));
  let best: { duration: number; route: RouteResult } | null = null;
  for (const trip of trips) {
    if (!trip || (best && trip.duration >= best.duration)) {
      continue;
    }
    best = { duration: trip.duration, route: trip.route };
  }
  return best?.route ?? null;
}

function openCandidates(stops: OptimizeStop[], lockFirst: boolean, lockLast: boolean): OptimizeStop[][] {
  if (lockFirst && lockLast) {
    return [[stops[0], ...stops.slice(1, -1), stops[stops.length - 1]]];
  }

  const candidates: OptimizeStop[][] = [];
  for (let start = 0; start < stops.length; start += 1) {
    if (lockFirst && start !== 0) {
      continue;
    }
    for (let end = 0; end < stops.length; end += 1) {
      if (start === end || (lockLast && end !== stops.length - 1)) {
        continue;
      }
      const middle = stops.filter((_, index) => index !== start && index !== end);
      candidates.push([stops[start], ...middle, stops[end]]);
    }
  }
  return candidates;
}

async function requestTrip(
  stops: OptimizeStop[],
  roundTrip: boolean,
  ends: TripEnds,
  token: string,
): Promise<{ duration: number; route: RouteResult } | null> {
  const response = await fetch(optimizationUrl(stops, roundTrip, ends, token));
  if (!response.ok) {
    return null;
  }
  return readTrip(await response.json(), stops, roundTrip);
}

async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

type RouteResult = {
  order: string[];
  legs: RouteGeometry[];
};

function optimizationUrl(stops: OptimizeStop[], roundTrip: boolean, ends: TripEnds, token: string): URL {
  const coordinates = stops.map((stop) => `${stop.longitude.toFixed(6)},${stop.latitude.toFixed(6)}`).join(';');
  const url = new URL(`https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'true');
  url.searchParams.set('roundtrip', roundTrip ? 'true' : 'false');
  const source = roundTrip ? ends.source : 'first';
  const destination = roundTrip ? ends.destination : 'last';
  if (source !== 'any') {
    url.searchParams.set('source', source);
  }
  if (destination !== 'any') {
    url.searchParams.set('destination', destination);
  }
  url.searchParams.set('access_token', token);
  return url;
}

function readRequest(body: unknown): OptimizeRequest | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (
    typeof record.roundTrip !== 'boolean' ||
    typeof record.lockFirst !== 'boolean' ||
    typeof record.lockLast !== 'boolean' ||
    !Array.isArray(record.stops)
  ) {
    return null;
  }
  if (record.stops.length < MIN_STOPS || record.stops.length > MAX_STOPS) {
    return null;
  }
  const stops: OptimizeStop[] = [];
  for (const value of record.stops) {
    const stop = readStop(value);
    if (!stop) {
      return null;
    }
    stops.push(stop);
  }
  return {
    roundTrip: record.roundTrip,
    lockFirst: record.lockFirst,
    lockLast: record.lockLast,
    stops,
  };
}

function readStop(value: unknown): OptimizeStop | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const stop = value as Record<string, unknown>;
  if (typeof stop.id !== 'string' || stop.id.trim() === '') {
    return null;
  }
  if (!isLongitude(stop.longitude) || !isLatitude(stop.latitude)) {
    return null;
  }
  return { id: stop.id, longitude: stop.longitude, latitude: stop.latitude };
}

function readTrip(
  body: unknown,
  stops: OptimizeStop[],
  roundTrip: boolean,
): { duration: number; route: RouteResult } | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const waypoints = record.waypoints;
  const trips = record.trips;
  if (record.code !== 'Ok' || !Array.isArray(waypoints) || !Array.isArray(trips)) {
    return null;
  }
  if (waypoints.length !== stops.length) {
    return null;
  }
  const expectedLegs = roundTrip ? stops.length : stops.length - 1;
  const legs = readLegs(trips[0], expectedLegs);
  const duration = readDuration(trips[0]);
  if (!legs || duration === null) {
    return null;
  }
  const ranked = stops.map((stop, index) => {
    const waypoint = waypoints[index];
    const waypointIndex =
      typeof waypoint === 'object' && waypoint !== null && 'waypoint_index' in waypoint
        ? waypoint.waypoint_index
        : undefined;
    return { id: stop.id, waypointIndex };
  });
  if (ranked.some((item) => typeof item.waypointIndex !== 'number')) {
    return null;
  }
  ranked.sort((left, right) => Number(left.waypointIndex) - Number(right.waypointIndex));
  return { duration, route: { order: ranked.map((item) => item.id), legs } };
}

function readLegs(trip: unknown, expected: number): RouteGeometry[] | null {
  if (typeof trip !== 'object' || trip === null || !('legs' in trip) || !Array.isArray(trip.legs)) {
    return null;
  }
  if (trip.legs.length !== expected) {
    return null;
  }
  const legs: RouteGeometry[] = [];
  for (const leg of trip.legs) {
    const line = readLeg(leg);
    if (!line) {
      return null;
    }
    legs.push(line);
  }
  return legs;
}

function readLeg(leg: unknown): RouteGeometry | null {
  if (typeof leg !== 'object' || leg === null || !('steps' in leg) || !Array.isArray(leg.steps)) {
    return null;
  }
  const coordinates: [number, number][] = [];
  for (const step of leg.steps) {
    const geometry = readGeometry(step);
    if (!geometry) {
      continue;
    }
    for (const point of geometry.coordinates) {
      const last = coordinates[coordinates.length - 1];
      if (last && last[0] === point[0] && last[1] === point[1]) {
        continue;
      }
      coordinates.push(point);
    }
  }
  if (coordinates.length < 2) {
    return null;
  }
  return { type: 'LineString', coordinates };
}

function readDuration(trip: unknown): number | null {
  if (typeof trip !== 'object' || trip === null || !('duration' in trip)) {
    return null;
  }
  return isFiniteNumber(trip.duration) ? trip.duration : null;
}

function readGeometry(trip: unknown): RouteGeometry | null {
  if (typeof trip !== 'object' || trip === null || !('geometry' in trip)) {
    return null;
  }
  const geometry = trip.geometry;
  if (typeof geometry !== 'object' || geometry === null) {
    return null;
  }
  const line = geometry as Record<string, unknown>;
  if (line.type !== 'LineString' || !Array.isArray(line.coordinates) || line.coordinates.length < 2) {
    return null;
  }
  const coordinates: [number, number][] = [];
  for (const value of line.coordinates) {
    if (!Array.isArray(value) || value.length < 2 || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) {
      return null;
    }
    coordinates.push([value[0], value[1]]);
  }
  return { type: 'LineString', coordinates };
}

function isLongitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -180 && value <= 180;
}

function isLatitude(value: unknown): value is number {
  return isFiniteNumber(value) && value >= -90 && value <= 90;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
