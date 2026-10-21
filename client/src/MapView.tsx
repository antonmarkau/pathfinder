import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MINSK: mapboxgl.LngLatLike = [27.559, 53.9006];
const CITY_ZOOM = 11;
const USER_ZOOM = 14;

type MapStatus = 'loading' | 'ready' | 'error';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [message, setMessage] = useState('Loading map');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let map: mapboxgl.Map | undefined;
    let cancelled = false;

    async function start(mapContainer: HTMLDivElement) {
      const response = await fetch('/api/mapbox-token');
      if (!response.ok) {
        throw new Error('token unavailable');
      }
      const body: unknown = await response.json();
      if (!isTokenResponse(body) || cancelled) {
        throw new Error('token unavailable');
      }

      mapboxgl.accessToken = body.token;
      map = new mapboxgl.Map({
        container: mapContainer,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: MINSK,
        zoom: CITY_ZOOM,
      });
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      let loaded = false;
      map.on('load', () => {
        loaded = true;
        if (!cancelled) {
          setStatus('ready');
        }
      });
      map.on('error', () => {
        if (!loaded && !cancelled) {
          setStatus('error');
          setMessage('The map could not be loaded. Check the Mapbox token.');
        }
      });
      askForLocation(map);
    }

    start(container).catch(() => {
      if (!cancelled) {
        setStatus('error');
        setMessage('The map could not be loaded. Check the Mapbox token in .env and restart the server.');
      }
    });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  return (
    <section className="map" aria-label="Map">
      <div ref={containerRef} className="map-canvas" />
      {status !== 'ready' ? <p className="map-label">{message}</p> : null}
    </section>
  );
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

function askForLocation(map: mapboxgl.Map) {
  if (!navigator.geolocation) {
    map.setCenter(MINSK);
    map.setZoom(CITY_ZOOM);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      map.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: USER_ZOOM,
      });
    },
    () => {
      map.setCenter(MINSK);
      map.setZoom(CITY_ZOOM);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}
