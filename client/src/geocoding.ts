export type GeocodedPlace = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
};

export type MapCenter = {
  longitude: number;
  latitude: number;
};

const COORDINATE = /^\s*([+-]?\d+(?:\.\d+)?)\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*$/;

export function parseLatLng(input: string): { latitude: number; longitude: number } | null {
  const match = COORDINATE.exec(input);
  if (!match) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

export async function forwardGeocode(
  query: string,
  token: string,
  proximity: MapCenter,
  signal: AbortSignal,
): Promise<GeocodedPlace[]> {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('proximity', `${proximity.longitude},${proximity.latitude}`);
  url.searchParams.set('language', geocodingLanguage());
  url.searchParams.set('access_token', token);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error('geocode failed');
  }
  return readPlaces(await response.json());
}

export async function labelForPoint(
  longitude: number,
  latitude: number,
  token: string,
  signal: AbortSignal,
): Promise<string> {
  const label = await reverseGeocode(longitude, latitude, token, signal);
  return label ?? `${latitude}, ${longitude}`;
}

export async function reverseGeocode(
  longitude: number,
  latitude: number,
  token: string,
  signal: AbortSignal,
): Promise<string | null> {
  const url = new URL('https://api.mapbox.com/search/geocode/v6/reverse');
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', geocodingLanguage());
  url.searchParams.set('access_token', token);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    return null;
  }
  return readPlaces(await response.json())[0]?.label ?? null;
}

function geocodingLanguage(): string {
  return navigator.language.split('-')[0] || 'en';
}

function readPlaces(body: unknown): GeocodedPlace[] {
  if (typeof body !== 'object' || body === null || !('features' in body) || !Array.isArray(body.features)) {
    return [];
  }
  return body.features.flatMap((feature) => {
    const place = readPlace(feature);
    return place ? [place] : [];
  });
}

function readPlace(feature: unknown): GeocodedPlace | null {
  if (typeof feature !== 'object' || feature === null) {
    return null;
  }
  const record = feature as {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, unknown>;
  };
  const coordinates = readCoordinates(record.geometry?.coordinates) ?? readPropertyCoordinates(record.properties);
  if (!coordinates) {
    return null;
  }
  const properties = record.properties ?? {};
  const label = firstString(properties.full_address, properties.name);
  if (!label) {
    return null;
  }
  const id = firstString(properties.mapbox_id) ?? `${coordinates.longitude},${coordinates.latitude}`;
  return { id, label, ...coordinates };
}

function readPropertyCoordinates(properties: Record<string, unknown> | undefined): MapCenter | null {
  const coordinates = properties?.coordinates;
  if (typeof coordinates !== 'object' || coordinates === null) {
    return null;
  }
  const point = coordinates as Record<string, unknown>;
  if (!isFiniteNumber(point.longitude) || !isFiniteNumber(point.latitude)) {
    return null;
  }
  return { longitude: point.longitude, latitude: point.latitude };
}

function readCoordinates(value: unknown): MapCenter | null {
  if (!Array.isArray(value) || value.length < 2 || !isFiniteNumber(value[0]) || !isFiniteNumber(value[1])) {
    return null;
  }
  return { longitude: value[0], latitude: value[1] };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
