import type { Stop } from './stops';

export const ROUND_TRIP_STORAGE_KEY = 'pathfinder.roundTrip';
export const TRAFFIC_STORAGE_KEY = 'pathfinder.traffic';
export const LOCK_FIRST_STORAGE_KEY = 'pathfinder.lockFirst';
export const LOCK_LAST_STORAGE_KEY = 'pathfinder.lockLast';

export type RouteGeometry = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type RouteResult = {
  order: string[];
  legs: RouteGeometry[];
};

export const STOP_COLORS = [
  '#B91C1C',
  '#1D4ED8',
  '#4D7C0F',
  '#C2410C',
  '#7E22CE',
  '#0E7490',
  '#A16207',
  '#A21CAF',
  '#047857',
  '#4338CA',
  '#9D174D',
  '#7C2D12',
];

export function legDestinationIndex(legIndex: number, stopCount: number, roundTrip: boolean): number {
  return roundTrip ? (legIndex + 1) % stopCount : legIndex + 1;
}

export function legColor(legIndex: number, stopCount: number, roundTrip: boolean): string {
  return STOP_COLORS[legDestinationIndex(legIndex, stopCount, roundTrip)];
}

export function stopColor(index: number, roundTrip: boolean, routeActive: boolean): string | null {
  if (!routeActive || (!roundTrip && index === 0)) {
    return null;
  }
  return STOP_COLORS[index] ?? null;
}

export function loadRoundTrip(): boolean {
  return localStorage.getItem(ROUND_TRIP_STORAGE_KEY) !== 'false';
}

export function saveRoundTrip(roundTrip: boolean) {
  localStorage.setItem(ROUND_TRIP_STORAGE_KEY, String(roundTrip));
}

export function loadLock(key: string): boolean {
  return localStorage.getItem(key) === 'true';
}

export function saveLock(key: string, locked: boolean) {
  localStorage.setItem(key, String(locked));
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
  return Array.isArray(record.legs) && record.legs.length > 0 && record.legs.every(isLineString);
}

function isLineString(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const line = value as Record<string, unknown>;
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
