export type YandexPoint = {
  longitude: number;
  latitude: number;
};

const HANDOFF_DELAY_MS = 800;

export function yandexMapsUrl(stops: YandexPoint[], roundTrip: boolean): string {
  const rtext = routePoints(stops, roundTrip).map(latLon).join('~');
  return `https://yandex.ru/maps/?rtext=${rtext}&rtt=auto`;
}

export function yandexNaviUrl(stops: YandexPoint[], roundTrip: boolean): string {
  const points = routePoints(stops, roundTrip);
  const first = points[0];
  const last = points[points.length - 1];
  const params = new URLSearchParams();
  params.set('lat_from', coordinate(first.latitude));
  params.set('lon_from', coordinate(first.longitude));
  for (let index = 1; index < points.length - 1; index += 1) {
    const via = points[index];
    params.set(`lat_via_${index - 1}`, coordinate(via.latitude));
    params.set(`lon_via_${index - 1}`, coordinate(via.longitude));
  }
  params.set('lat_to', coordinate(last.latitude));
  params.set('lon_to', coordinate(last.longitude));
  return `yandexnavi://build_route_on_map?${params.toString()}`;
}

export function openInYandex(stops: YandexPoint[], roundTrip: boolean, mobile: boolean): void {
  if (routePoints(stops, roundTrip).length < 2) {
    return;
  }
  const website = yandexMapsUrl(stops, roundTrip);
  if (!mobile) {
    window.open(website, '_blank', 'noopener');
    return;
  }

  const schemes = [yandexMapsAppUrl(website), yandexNaviUrl(stops, roundTrip)];
  let step = 0;
  let timer = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', stop);
    window.removeEventListener('blur', stop);
  };

  const onVisibility = () => {
    if (document.hidden) {
      stop();
    }
  };

  const next = () => {
    if (stopped) {
      return;
    }
    if (step >= schemes.length) {
      stop();
      window.location.assign(website);
      return;
    }
    const url = schemes[step];
    step += 1;
    window.location.href = url;
    timer = window.setTimeout(next, HANDOFF_DELAY_MS);
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', stop);
  window.addEventListener('blur', stop);
  next();
}

function yandexMapsAppUrl(website: string): string {
  return `yandexmaps://maps.yandex.ru/${new URL(website).search}`;
}

function routePoints(stops: YandexPoint[], roundTrip: boolean): YandexPoint[] {
  if (!roundTrip || stops.length === 0) {
    return stops;
  }
  return [...stops, stops[0]];
}

function latLon(point: YandexPoint): string {
  return `${coordinate(point.latitude)},${coordinate(point.longitude)}`;
}

function coordinate(value: number): string {
  return value.toFixed(6);
}
