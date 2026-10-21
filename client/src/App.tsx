import { useEffect, useRef, useState } from 'react';
import { ConfigProvider } from 'antd';
import { labelForPoint, type MapCenter } from './geocoding';
import { MapView } from './MapView';
import { StopsToolbar } from './StopsToolbar';
import { loadStops, MAX_STOPS, saveStops, type Stop } from './stops';

const MINSK: MapCenter = { longitude: 27.559, latitude: 53.9006 };

export function App() {
  const { token, error } = useMapboxToken();
  const [stops, setStops] = useState<Stop[]>(loadStops);
  const [proximity, setProximity] = useState<MapCenter>(MINSK);
  const [selecting, setSelecting] = useState(false);
  const dragTicket = useRef(new Map<string, number>());

  useEffect(() => {
    saveStops(stops);
  }, [stops]);

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
    setStops((current) => (current.length >= MAX_STOPS ? current : [...current, stop]));
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
    setStops((current) =>
      current.map((stop) =>
        stop.id === id
          ? { ...stop, label, longitude: center.longitude, latitude: center.latitude }
          : stop,
      ),
    );
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
            onMapClick={(center) => void addStopFromMap(center)}
            onStopDrag={(id, center) => void moveStop(id, center)}
          />
          <StopsToolbar
            token={token}
            stops={stops}
            proximity={proximity}
            selecting={selecting}
            onSelectingChange={setSelecting}
            onStopsChange={setStops}
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
