import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapCenter } from './geocoding';
import { legColor, stopColor, type RouteGeometry } from './route';
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
  route: RouteGeometry[] | null;
  roundTrip: boolean;
  onProximityChange: (center: MapCenter) => void;
  onPick: (center: MapCenter) => void;
  onStopDrag: (id: string, center: MapCenter) => void;
};

export function MapView({
  token,
  error,
  stops,
  selecting,
  route,
  roundTrip,
  onProximityChange,
  onPick,
  onStopDrag,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onProximityChangeRef = useRef(onProximityChange);
  const onPickRef = useRef(onPick);
  const onStopDragRef = useRef(onStopDrag);
  const suppressClickUntil = useRef(0);
  const draggedIds = useRef(new Set<string>());
  const skipNextFly = useRef(true);
  const previousStops = useRef<Stop[]>([]);
  const stopsRef = useRef(stops);
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [message, setMessage] = useState('Loading map');

  stopsRef.current = stops;

  useEffect(() => {
    onProximityChangeRef.current = onProximityChange;
    onPickRef.current = onPick;
    onStopDragRef.current = onStopDrag;
  }, [onPick, onProximityChange, onStopDrag]);

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

    const savedView = loadMapView();
    const openingStops = stopsRef.current;
    const openingCenter = savedView
      ? ([savedView.longitude, savedView.latitude] as mapboxgl.LngLatLike)
      : openingStops.length > 0
        ? stopBounds(openingStops).getCenter()
        : MINSK;
    const openingZoom = savedView?.zoom ?? (openingStops.length === 1 ? USER_ZOOM : CITY_ZOOM);
    let remember = savedView !== null;

    mapboxgl.accessToken = token;
    mapInstance = new mapboxgl.Map({
      container,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: openingCenter,
      zoom: openingZoom,
      bearing: 0,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapInstance.touchZoomRotate.disableRotation();
    mapInstance.keyboard.disableRotation();

    const publishCenter = () => {
      const center = mapInstance?.getCenter();
      if (!center || !mapInstance) {
        return;
      }
      onProximityChangeRef.current({ longitude: center.lng, latitude: center.lat });
      if (remember) {
        saveMapView({ longitude: center.lng, latitude: center.lat, zoom: mapInstance.getZoom() });
      }
    };

    let loaded = false;
    mapInstance.on('load', () => {
      loaded = true;
      if (cancelled) {
        return;
      }
      if (!savedView && openingStops.length > 0 && mapInstance) {
        mapInstance.fitBounds(stopBounds(openingStops), { padding: 72, maxZoom: USER_ZOOM, duration: 0 });
        remember = true;
      } else if (!savedView && mapInstance) {
        askForLocation(mapInstance, () => cancelled, () => {
          remember = true;
        });
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
    return () => {
      cancelled = true;
      setMap(null);
      mapInstance?.remove();
    };
  }, [token]);

  useEffect(() => {
    if (!map || !selecting) {
      return;
    }

    const element = document.createElement('div');
    element.className = 'pick-anchor';
    const pin = document.createElement('div');
    pin.className = 'pick-pin pick-marker';
    const circle = document.createElement('div');
    circle.className = 'stop-marker';
    const stick = document.createElement('div');
    stick.className = 'pick-stick';
    pin.append(circle, stick);
    element.appendChild(pin);
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'Drag to choose a stop');
    const marker = new mapboxgl.Marker({ element, anchor: 'bottom', draggable: true })
      .setLngLat(map.getCenter())
      .addTo(map);

    const report = () => {
      const lngLat = marker.getLngLat();
      onPickRef.current({ longitude: lngLat.lng, latitude: lngLat.lat });
    };
    report();
    marker.on('dragend', () => {
      suppressClickUntil.current = performance.now() + 300;
      report();
    });

    const onClick = (event: mapboxgl.MapMouseEvent) => {
      if (performance.now() < suppressClickUntil.current) {
        return;
      }
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.mapboxgl-ctrl, .stop-marker, .pick-anchor')) {
        return;
      }
      marker.setLngLat(event.lngLat);
      report();
    };
    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      marker.remove();
    };
  }, [map, selecting]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const markers = stops.map((stop, index) => {
      const element = document.createElement('div');
      element.className = 'stop-marker';
      element.textContent = String(index + 1);
      const color = stopColor(index, roundTrip, route !== null);
      if (color) {
        element.style.background = color;
      }
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
  }, [map, route, roundTrip, stops]);

  useEffect(() => {
    if (!map) {
      return;
    }

    const data = {
      type: 'FeatureCollection' as const,
      features: (route ?? []).map((leg, index) => ({
        type: 'Feature' as const,
        properties: { color: legColor(index, stops.length, roundTrip) },
        geometry: leg,
      })),
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
        paint: { 'line-color': ['get', 'color'], 'line-width': 5 },
      });
    }

    if (route && route.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const leg of route) {
        for (const coordinate of leg.coordinates) {
          bounds.extend(coordinate);
        }
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
  }, [map, route, roundTrip, stops.length]);

  return (
    <section className={selecting ? 'map selecting' : 'map'} aria-label="Map">
      <div ref={containerRef} className="map-canvas" />
      {status !== 'ready' ? <p className="map-label">{message}</p> : null}
    </section>
  );
}

const MAP_VIEW_STORAGE_KEY = 'pathfinder.mapView';

type SavedMapView = {
  longitude: number;
  latitude: number;
  zoom: number;
};

function loadMapView(): SavedMapView | null {
  try {
    const raw = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const view = parsed as Record<string, unknown>;
    if (
      !isCoordinate(view.longitude, -180, 180) ||
      !isCoordinate(view.latitude, -90, 90) ||
      !isCoordinate(view.zoom, 0, 22)
    ) {
      return null;
    }
    return { longitude: view.longitude, latitude: view.latitude, zoom: view.zoom };
  } catch {
    return null;
  }
}

function saveMapView(view: SavedMapView) {
  localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
}

function isCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function stopBounds(stops: Stop[]): mapboxgl.LngLatBounds {
  const bounds = new mapboxgl.LngLatBounds();
  for (const stop of stops) {
    bounds.extend([stop.longitude, stop.latitude]);
  }
  return bounds;
}

function askForLocation(map: mapboxgl.Map, isCancelled: () => boolean, onReady: () => void) {
  const show = (center: mapboxgl.LngLatLike, zoom: number) => {
    if (isCancelled()) {
      return;
    }
    onReady();
    map.flyTo({ center, zoom });
  };

  if (!navigator.geolocation) {
    show(MINSK, CITY_ZOOM);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      show([position.coords.longitude, position.coords.latitude], USER_ZOOM);
    },
    () => {
      show(MINSK, CITY_ZOOM);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}
