import { useEffect, useRef, useState } from 'react';
import { ConfigProvider } from 'antd';
import { labelForPoint, type MapCenter } from './geocoding';
import { MapView } from './MapView';
import { isRouteResult, loadRoundTrip, orderStops, saveRoundTrip, type RouteGeometry } from './route';
import { StopsToolbar } from './StopsToolbar';
import { loadStops, MAX_STOPS, saveStops, type Stop } from './stops';

const MINSK: MapCenter = { longitude: 27.559, latitude: 53.9006 };

export function App() {
  const { token, error } = useMapboxToken();
  const [stops, setStops] = useState<Stop[]>(loadStops);
  const [proximity, setProximity] = useState<MapCenter>(MINSK);
  const [selecting, setSelecting] = useState(false);
  const [roundTrip, setRoundTrip] = useState(loadRoundTrip);
  const [route, setRoute] = useState<RouteGeometry[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const dragTicket = useRef(new Map<string, number>());
  const routeRequest = useRef(0);

  useEffect(() => {
    saveStops(stops);
  }, [stops]);

  useEffect(() => {
    saveRoundTrip(roundTrip);
  }, [roundTrip]);

  useEffect(() => {
    if (stops.length >= MAX_STOPS) {
      setSelecting(false);
    }
  }, [stops.length]);

  async function addStopFromMap(center: MapCenter) {
    if (!token || stops.length >= MAX_STOPS) {
      return;
    }
    setSelecting(false);
    const label = await labelForPoint(center.longitude, center.latitude, token, new AbortController().signal);
    const stop: Stop = {
      id: crypto.randomUUID(),
      label,
      longitude: center.longitude,
      latitude: center.latitude,
    };
    updateStops((current) => (current.length >= MAX_STOPS ? current : [...current, stop]));
  }

  async function moveStop(id: string, center: MapCenter) {
    if (!token) {
      return;
    }
    const ticket = (dragTicket.current.get(id) ?? 0) + 1;
    dragTicket.current.set(id, ticket);
    const label = await labelForPoint(center.longitude, center.latitude, token, new AbortController().signal);
    if (dragTicket.current.get(id) !== ticket) {
      return;
    }
    updateStops((current) =>
      current.map((stop) =>
        stop.id === id
          ? { ...stop, label, longitude: center.longitude, latitude: center.latitude }
          : stop,
      ),
    );
  }

  function replaceStops(next: Stop[]) {
    clearRoute();
    setStops(next);
  }

  function updateStops(updater: (current: Stop[]) => Stop[]) {
    clearRoute();
    setStops(updater);
  }

  function changeRoundTrip(next: boolean) {
    clearRoute();
    setRoundTrip(next);
  }

  function clearRoute() {
    routeRequest.current += 1;
    setBuilding(false);
    setRoute(null);
    setRouteError(null);
  }

  async function buildRoute() {
    if (stops.length < 2 || stops.length > MAX_STOPS || building) {
      return;
    }
    const ticket = ++routeRequest.current;
    const snapshot = stops;
    setBuilding(true);
    setRouteError(null);
    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundTrip,
          stops: snapshot.map(({ id, longitude, latitude }) => ({ id, longitude, latitude })),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (ticket !== routeRequest.current) {
        return;
      }
      const expectedLegs = roundTrip ? snapshot.length : snapshot.length - 1;
      const ordered = isRouteResult(body) ? orderStops(snapshot, body.order) : null;
      if (!response.ok || !isRouteResult(body) || !ordered || body.legs.length !== expectedLegs) {
        setRoute(null);
        setRouteError('The route could not be built');
        return;
      }
      setStops(ordered);
      setRoute(body.legs);
    } catch {
      if (ticket === routeRequest.current) {
        setRoute(null);
        setRouteError('The route could not be built');
      }
    } finally {
      if (ticket === routeRequest.current) {
        setBuilding(false);
      }
    }
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: '"Segoe UI", "Helvetica Neue", sans-serif',
          borderRadius: 8,
        },
      }}
    >
      <div className="app">
        <header className="header">
          <h1>Pathfinder</h1>
        </header>
        <main className="stage">
          <MapView
            token={token}
            error={error}
            stops={stops}
            selecting={selecting}
            onProximityChange={setProximity}
            route={route}
            roundTrip={roundTrip}
            onMapClick={(center) => void addStopFromMap(center)}
            onStopDrag={(id, center) => void moveStop(id, center)}
          />
          <StopsToolbar
            token={token}
            stops={stops}
            proximity={proximity}
            selecting={selecting}
            roundTrip={roundTrip}
            building={building}
            routeError={routeError}
            routeActive={route !== null}
            onSelectingChange={setSelecting}
            onRoundTripChange={changeRoundTrip}
            onBuildRoute={() => void buildRoute()}
            onStopsChange={replaceStops}
          />
        </main>
      </div>
    </ConfigProvider>
  );
}

function useMapboxToken(): { token: string | null; error: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/mapbox-token')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('token unavailable');
        }
        const body: unknown = await response.json();
        if (!isTokenResponse(body)) {
          throw new Error('token unavailable');
        }
        if (!cancelled) {
          setToken(body.token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { token, error };
}

function isTokenResponse(body: unknown): body is { token: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'token' in body &&
    typeof body.token === 'string' &&
    body.token.startsWith('pk.')
  );
}
