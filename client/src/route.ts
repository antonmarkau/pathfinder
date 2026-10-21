import type { Stop } from './stops';

export const ROUND_TRIP_STORAGE_KEY = 'pathfinder.roundTrip';

export type RouteGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type RouteResult = {
  order: string[];
  geometry: RouteGeometry;
};

export function loadRoundTrip(): boolean {
  return localStorage.getItem(ROUND_TRIP_STORAGE_KEY) !== 'false';
}

export function saveRoundTrip(roundTrip: boolean) {
  localStorage.setItem(ROUND_TRIP_STORAGE_KEY, String(roundTrip));
}

export function orderStops(stops: Stop[], order: string[]): Stop[] | null {
  if (order.length !== stops.length || new Set(order).size !== order.length) {
    return null;
  }
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const ordered: Stop[] = [];
  for (const id of order) {
    const stop = byId.get(id);
    if (!stop) {
      return null;
    }
    ordered.push(stop);
  }
  return ordered;
}

export function isRouteResult(value: unknown): value is RouteResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.order) || !record.order.every((id) => typeof id === 'string')) {
    return false;
  }
  const geometry = record.geometry;
  if (typeof geometry !== 'object' || geometry === null) {
    return false;
  }
  const line = geometry as Record<string, unknown>;
  if (line.type !== 'LineString' || !Array.isArray(line.coordinates) || line.coordinates.length < 2) {
    return false;
  }
  return line.coordinates.every(
    (coordinate) =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      typeof coordinate[0] === 'number' &&
      typeof coordinate[1] === 'number',
  );
}
