export const STOPS_STORAGE_KEY = 'pathfinder.stops';
export const MAX_STOPS = 12;

export type Stop = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
};

export function loadStops(): Stop[] {
  try {
    const raw = localStorage.getItem(STOPS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isStop).slice(0, MAX_STOPS);
  } catch {
    return [];
  }
}

export function saveStops(stops: Stop[]) {
  localStorage.setItem(STOPS_STORAGE_KEY, JSON.stringify(stops));
}

function isStop(value: unknown): value is Stop {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const stop = value as Record<string, unknown>;
  return (
    typeof stop.id === 'string' &&
    typeof stop.label === 'string' &&
    stop.label.trim().length > 0 &&
    isLongitude(stop.longitude) &&
    isLatitude(stop.latitude)
  );
}

function isLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}
