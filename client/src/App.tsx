import { useEffect, useState } from 'react';
import { ConfigProvider } from 'antd';
import type { MapCenter } from './geocoding';
import { MapView } from './MapView';
import { StopsToolbar } from './StopsToolbar';
import { loadStops, saveStops, type Stop } from './stops';

const MINSK: MapCenter = { longitude: 27.559, latitude: 53.9006 };

export function App() {
  const { token, error } = useMapboxToken();
  const [stops, setStops] = useState<Stop[]>(loadStops);
  const [proximity, setProximity] = useState<MapCenter>(MINSK);

  useEffect(() => {
    saveStops(stops);
  }, [stops]);

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
          <MapView token={token} error={error} stops={stops} onProximityChange={setProximity} />
          <StopsToolbar token={token} stops={stops} proximity={proximity} onStopsChange={setStops} />
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
