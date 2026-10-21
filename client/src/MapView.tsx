import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapCenter } from './geocoding';
import type { Stop } from './stops';

const MINSK: mapboxgl.LngLatLike = [27.559, 53.9006];
const CITY_ZOOM = 11;
const USER_ZOOM = 14;

type MapStatus = 'loading' | 'ready' | 'error';

type MapViewProps = {
  token: string | null;
  error: boolean;
  stops: Stop[];
  onProximityChange: (center: MapCenter) => void;
};

export function MapView({ token, error, stops, onProximityChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onProximityChangeRef = useRef(onProximityChange);
  const skipNextFly = useRef(true);
  const previousStops = useRef<Stop[]>([]);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [message, setMessage] = useState('Loading map');

  useEffect(() => {
    onProximityChangeRef.current = onProximityChange;
  }, [onProximityChange]);

  useEffect(() => {
    if (error) {
      setStatus('error');
      setMessage('The map could not be loaded. Check the Mapbox token in .env and restart the server.');
    }
  }, [error]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !token) {
      return;
    }

    let mapInstance: mapboxgl.Map | undefined;
    let cancelled = false;

    mapboxgl.accessToken = token;
    mapInstance = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: MINSK,
      zoom: CITY_ZOOM,
    });
    mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const publishCenter = () => {
      const center = mapInstance?.getCenter();
      if (!center) {
        return;
      }
      onProximityChangeRef.current({ longitude: center.lng, latitude: center.lat });
    };

    let loaded = false;
    mapInstance.on('load', () => {
      loaded = true;
      if (cancelled) {
        return;
      }
      setStatus('ready');
      setMap(mapInstance ?? null);
      publishCenter();
    });
    mapInstance.on('moveend', publishCenter);
    mapInstance.on('error', () => {
      if (!loaded && !cancelled) {
        setStatus('error');
        setMessage('The map could not be loaded. Check the Mapbox token.');
      }
    });
    askForLocation(mapInstance);

    return () => {
      cancelled = true;
      setMap(null);
      mapInstance?.remove();
    };
  }, [token]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const markers = stops.map((stop, index) => {
      const element = document.createElement('div');
      element.className = 'stop-marker';
      element.textContent = String(index + 1);
      return new mapboxgl.Marker({ element, anchor: 'center' })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
    });

    const previous = previousStops.current;
    previousStops.current = stops;
    if (skipNextFly.current) {
      skipNextFly.current = false;
    } else {
      const changed = stops.find((stop) => {
        const before = previous.find((item) => item.id === stop.id);
        return !before || before.longitude !== stop.longitude || before.latitude !== stop.latitude;
      });
      if (changed) {
        map.flyTo({
          center: [changed.longitude, changed.latitude],
          zoom: Math.max(map.getZoom(), USER_ZOOM),
        });
      }
    }

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [map, stops]);

  return (
    <section className="map" aria-label="Map">
      <div ref={containerRef} className="map-canvas" />
      {status !== 'ready' ? <p className="map-label">{message}</p> : null}
    </section>
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
