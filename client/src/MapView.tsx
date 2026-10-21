import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapCenter } from './geocoding';
import type { RouteGeometry } from './route';
import type { Stop } from './stops';

const MINSK: mapboxgl.LngLatLike = [27.559, 53.9006];
const CITY_ZOOM = 11;
const USER_ZOOM = 14;

type MapStatus = 'loading' | 'ready' | 'error';

type MapViewProps = {
  token: string | null;
  error: boolean;
  stops: Stop[];
  selecting: boolean;
  route: RouteGeometry | null;
  onProximityChange: (center: MapCenter) => void;
  onMapClick: (center: MapCenter) => void;
  onStopDrag: (id: string, center: MapCenter) => void;
};

export function MapView({
  token,
  error,
  stops,
  selecting,
  route,
  onProximityChange,
  onMapClick,
  onStopDrag,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onProximityChangeRef = useRef(onProximityChange);
  const onMapClickRef = useRef(onMapClick);
  const onStopDragRef = useRef(onStopDrag);
  const selectingRef = useRef(selecting);
  const suppressClickUntil = useRef(0);
  const draggedIds = useRef(new Set<string>());
  const skipNextFly = useRef(true);
  const previousStops = useRef<Stop[]>([]);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [message, setMessage] = useState('Loading map');

  useEffect(() => {
    onProximityChangeRef.current = onProximityChange;
    onMapClickRef.current = onMapClick;
    onStopDragRef.current = onStopDrag;
    selectingRef.current = selecting;
  }, [onMapClick, onProximityChange, onStopDrag, selecting]);

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
    mapInstance.on('click', (event) => {
      if (performance.now() < suppressClickUntil.current || !selectingRef.current) {
        return;
      }
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.mapboxgl-ctrl, .stop-marker')) {
        return;
      }
      onMapClickRef.current({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
    });
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
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `Drag stop ${index + 1}`);
      const marker = new mapboxgl.Marker({ element, anchor: 'center', draggable: true })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
      marker.on('dragend', () => {
        suppressClickUntil.current = performance.now() + 300;
        draggedIds.current.add(stop.id);
        const lngLat = marker.getLngLat();
        onStopDragRef.current(stop.id, { longitude: lngLat.lng, latitude: lngLat.lat });
      });
      return marker;
    });

    const previous = previousStops.current;
    previousStops.current = stops;
    const changed = stops.find((stop) => {
      const before = previous.find((item) => item.id === stop.id);
      return !before || before.longitude !== stop.longitude || before.latitude !== stop.latitude;
    });
    const dragged = changed !== undefined && draggedIds.current.has(changed.id);
    if (dragged && changed) {
      draggedIds.current.delete(changed.id);
    }
    if (skipNextFly.current) {
      skipNextFly.current = false;
    } else if (changed && !dragged) {
      map.flyTo({
        center: [changed.longitude, changed.latitude],
        zoom: Math.max(map.getZoom(), USER_ZOOM),
      });
    }

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [map, stops]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const geometry: RouteGeometry = route ?? { type: 'LineString', coordinates: [] };
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry,
    };
    const existing = map.getSource('route');
    if (existing?.type === 'geojson') {
      existing.setData(data);
    } else {
      map.addSource('route', { type: 'geojson', data });
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8 },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1d6fbf', 'line-width': 5 },
      });
    }

    if (route && route.coordinates.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const coordinate of route.coordinates) {
        bounds.extend(coordinate);
      }
      map.fitBounds(bounds, { padding: 72, maxZoom: 14, duration: 700 });
    }

    return () => {
      if (!map.getStyle()) {
        return;
      }
      if (map.getLayer('route')) {
        map.removeLayer('route');
      }
      if (map.getLayer('route-casing')) {
        map.removeLayer('route-casing');
      }
      if (map.getSource('route')) {
        map.removeSource('route');
      }
    };
  }, [map, route]);

  return (
    <section className={selecting ? 'map selecting' : 'map'} aria-label="Map">
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
