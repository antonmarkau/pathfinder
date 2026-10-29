import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AutoComplete, Button, Input, Switch } from 'antd';
import { CaretUpOutlined, CarOutlined, CheckOutlined, DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { forwardGeocode, labelForPoint, parseLatLng, reverseGeocode, type GeocodedPlace, type MapCenter } from './geocoding';
import logo from './logo.png';
import { stopColor } from './route';
import { MAX_STOPS, type Stop } from './stops';
import { openInYandex } from './yandex';

type Draft = { mode: 'add' } | { mode: 'edit'; stopId: string };

type StopsToolbarProps = {
  token: string | null;
  stops: Stop[];
  proximity: MapCenter;
  selecting: boolean;
  picked: MapCenter | null;
  mobile: boolean;
  roundTrip: boolean;
  traffic: boolean;
  lockFirst: boolean;
  lockLast: boolean;
  building: boolean;
  routeError: string | null;
  routeActive: boolean;
  onSelectingChange: (selecting: boolean) => void;
  onTrafficChange: (traffic: boolean) => void;
  onRoundTripChange: (roundTrip: boolean) => void;
  onLockFirstChange: (locked: boolean) => void;
  onLockLastChange: (locked: boolean) => void;
  onBuildRoute: () => void;
  onStopsChange: (stops: Stop[]) => void;
};

export function StopsToolbar({
  token,
  stops,
  proximity,
  selecting,
  picked,
  mobile,
  roundTrip,
  traffic,
  lockFirst,
  lockLast,
  building,
  routeError,
  routeActive,
  onSelectingChange,
  onTrafficChange,
  onRoundTripChange,
  onLockFirstChange,
  onLockLastChange,
  onBuildRoute,
  onStopsChange,
}: StopsToolbarProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [collapsed, setCollapsed] = useState(() => mobile && stops.length > 0);
  const wasSelecting = useRef(false);
  const routeWasActive = useRef(routeActive);
  const editOrigin = useRef<{ id: string; longitude: number; latitude: number } | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GeocodedPlace | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const coordinates = parseLatLng(query);
  const canConfirm = selected !== null || coordinates !== null;
  const draftOpen = draft !== null;
  const panel = !mobile ? 'desktop' : !collapsed ? 'open' : selecting && draftOpen ? 'picking' : 'closed';
  const bodyRef = useRef<HTMLDivElement>(null);
  const liveHeight = useRef(0);
  const heightBeforeCommit = useRef(0);
  const skipMotion = useRef(true);
  heightBeforeCommit.current = liveHeight.current;

  useEffect(() => {
    if (!mobile) {
      return;
    }
    if (selecting) {
      setCollapsed(true);
    } else if (wasSelecting.current) {
      setCollapsed(false);
    }
    wasSelecting.current = selecting;
  }, [mobile, selecting]);

  useEffect(() => {
    if (mobile && routeActive && !routeWasActive.current) {
      setCollapsed(true);
    }
    routeWasActive.current = routeActive;
  }, [mobile, routeActive]);

  useEffect(() => {
    if (!selecting) {
      return;
    }
    const blurField = () => {
      const input = document.querySelector('.stop-search input');
      if (input instanceof HTMLInputElement && document.activeElement === input) {
        input.blur();
      }
    };
    blurField();
    const timer = window.setTimeout(blurField, 50);
    return () => window.clearTimeout(timer);
  }, [selecting]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !mobile) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (body.style.height === '' || body.style.height === 'auto') {
        liveHeight.current = body.getBoundingClientRect().height;
      }
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [mobile]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || panel === 'desktop') {
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const settle = (hidden: boolean) => {
      body.style.transition = '';
      body.style.height = hidden ? '0px' : '';
      body.style.overflow = hidden ? 'hidden' : '';
      body.inert = hidden;
      liveHeight.current = hidden ? 0 : body.getBoundingClientRect().height;
    };

    if (skipMotion.current || reduced) {
      skipMotion.current = false;
      settle(panel === 'closed');
      return;
    }

    const visual = body.getBoundingClientRect().height;
    body.style.overflow = 'hidden';
    body.style.height = 'auto';
    const natural = body.getBoundingClientRect().height;
    const end = panel === 'closed' ? 0 : natural;
    const from = Math.abs(visual - end) < 1 ? heightBeforeCommit.current : visual;
    body.inert = panel === 'closed';
    if (Math.abs(from - end) < 1) {
      settle(panel === 'closed');
      return;
    }

    body.style.transition = 'none';
    body.style.height = `${from}px`;
    body.getBoundingClientRect();
    body.style.transition = `height ${CARD_MOTION_MS}ms ${CARD_MOTION_EASING}`;
    body.style.height = `${end}px`;

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      settle(panel === 'closed');
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === body && event.propertyName === 'height') {
        finish();
      }
    };
    body.addEventListener('transitionend', onEnd);
    const timer = window.setTimeout(finish, CARD_MOTION_MS + 50);
    return () => {
      settled = true;
      window.clearTimeout(timer);
      body.removeEventListener('transitionend', onEnd);
    };
  }, [panel]);

  useEffect(() => {
    if (!selecting || !picked || !token || !draftOpen) {
      return;
    }
    const point = picked;
    let active = true;
    const controller = new AbortController();
    setQuery(`${point.latitude}, ${point.longitude}`);
    setSelected(null);
    setSuggestions([]);
    setSearchError(null);
    labelForPoint(point.longitude, point.latitude, token, controller.signal)
      .then((label) => {
        if (!active) {
          return;
        }
        setQuery(label);
        setSelected({
          id: 'picked',
          label,
          longitude: point.longitude,
          latitude: point.latitude,
        });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) {
          return;
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [draftOpen, picked, selecting, token]);

  useEffect(() => {
    if (draft?.mode !== 'edit' || editOrigin.current?.id !== draft.stopId) {
      return;
    }
    const stop = stops.find((item) => item.id === draft.stopId);
    const origin = editOrigin.current;
    if (!stop || !origin) {
      return;
    }
    if (stop.longitude !== origin.longitude || stop.latitude !== origin.latitude) {
      closeDraft();
    }
  }, [draft, stops]);

  useEffect(() => {
    if (!token || !draftOpen || parseLatLng(query) || query.trim().length < 2 || selected?.label === query) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      forwardGeocode(query.trim(), token, proximity, controller.signal)
        .then((places) => {
          setSuggestions(places);
          setSearchError(places.length === 0 ? 'No places found' : null);
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) {
            return;
          }
          setSuggestions([]);
          setSearchError('Search failed');
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftOpen, proximity, query, selected, token]);

  function openAdd() {
    setDraft({ mode: 'add' });
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setSearchError(null);
  }

  function openEdit(stop: Stop) {
    if (draft?.mode === 'edit' && draft.stopId === stop.id) {
      closeDraft();
      return;
    }
    editOrigin.current = { id: stop.id, longitude: stop.longitude, latitude: stop.latitude };
    setDraft({ mode: 'edit', stopId: stop.id });
    setQuery(stop.label);
    setSelected({
      id: stop.id,
      label: stop.label,
      longitude: stop.longitude,
      latitude: stop.latitude,
    });
    setSuggestions([]);
    setSearchError(null);
  }

  function closeDraft() {
    editOrigin.current = null;
    onSelectingChange(false);
    setDraft(null);
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setSearchError(null);
  }

  function removeDraft() {
    setCollapsed(false);
    if (draft?.mode === 'edit') {
      removeStop(draft.stopId);
      return;
    }
    closeDraft();
  }

  function changeQuery(value: string) {
    if (draft?.mode === 'edit' && value.trim() === '') {
      closeDraft();
      return;
    }
    setQuery(value);
    setSelected((current) => (current && current.label === value ? current : null));
    setSuggestions([]);
    setSearchError(null);
  }

  async function confirm() {
    if (!token || !draft || confirming) {
      return;
    }
    setConfirming(true);
    try {
      const place = await resolvePlace(token);
      if (!place) {
        setSearchError('That place could not be added');
        return;
      }
      if (draft.mode === 'add') {
        if (stops.length >= MAX_STOPS) {
          return;
        }
        onStopsChange([
          ...stops,
          {
            id: crypto.randomUUID(),
            label: place.label,
            longitude: place.longitude,
            latitude: place.latitude,
          },
        ]);
      } else {
        onStopsChange(
          stops.map((stop) =>
            stop.id === draft.stopId
              ? { ...stop, label: place.label, longitude: place.longitude, latitude: place.latitude }
              : stop,
          ),
        );
      }
      closeDraft();
      setCollapsed(false);
    } finally {
      setConfirming(false);
    }
  }

  async function resolvePlace(accessToken: string): Promise<GeocodedPlace | null> {
    const typedCoordinates = parseLatLng(query);
    if (typedCoordinates && selected?.label !== query.trim()) {
      const label =
        (await reverseGeocode(typedCoordinates.longitude, typedCoordinates.latitude, accessToken, new AbortController().signal)) ??
        `${typedCoordinates.latitude}, ${typedCoordinates.longitude}`;
      return {
        id: crypto.randomUUID(),
        label,
        longitude: typedCoordinates.longitude,
        latitude: typedCoordinates.latitude,
      };
    }
    return selected;
  }

  function removeStop(id: string) {
    if (draft?.mode === 'edit' && draft.stopId === id) {
      closeDraft();
    }
    onStopsChange(stops.filter((stop) => stop.id !== id));
  }

  return (
    <aside className={toolbarClass()} aria-label="Stops">
      <header className="header">
        <img className="logo" src={logo} alt="" />
        <h1>Pathfinder</h1>
      </header>
      <div className="toolbar-body" ref={bodyRef}>
      <div className="toolbar-body-inner">
      <h2>Stops</h2>
      <p className="stop-hint">Type an address or coordinates, or choose the place on the map.</p>
      <ul className="stop-list">
        {stops.map((stop, index) =>
          draft?.mode === 'edit' && draft.stopId === stop.id ? (
            <li key={stop.id} className="picking-stop">
              {renderDraft(`${index + 1}`, index)}
            </li>
          ) : (
            <li key={stop.id} className="stop-row">
              <span className="stop-index" style={indexStyle(index)}>
                {index + 1}
              </span>
              <span className="stop-label" title={stop.label}>
                {stop.label}
              </span>
              <Button
                color="gold"
                variant="solid"
                icon={<EditOutlined />}
                aria-label={`Edit ${stop.label}`}
                onClick={() => openEdit(stop)}
              />
              <Button
                color="danger"
                variant="solid"
                icon={<DeleteOutlined />}
                aria-label={`Delete ${stop.label}`}
                onClick={() => removeStop(stop.id)}
              />
            </li>
          ),
        )}
      </ul>
      {draft?.mode === 'add' ? <div className="picking-stop">{renderDraft(String(stops.length + 1))}</div> : null}
      <Button
        className="toolbar-action"
        block
        icon={<PlusOutlined />}
        aria-label="Add stop"
        disabled={!token || stops.length >= MAX_STOPS || draftOpen}
        onClick={openAdd}
      />
      <div className="round-trip">
        <span id="traffic-label">Consider current traffic</span>
        <Switch checked={traffic} onChange={onTrafficChange} aria-labelledby="traffic-label" />
      </div>
      <div className="round-trip">
        <span id="round-trip-label">Round trip</span>
        <Switch
          checked={roundTrip}
          disabled={lockFirst && lockLast}
          onChange={onRoundTripChange}
          aria-labelledby="round-trip-label"
        />
      </div>
      <div className="round-trip">
        <span id="lock-first-label">Lock the first point</span>
        <Switch checked={lockFirst} onChange={onLockFirstChange} aria-labelledby="lock-first-label" />
      </div>
      <div className="round-trip">
        <span id="lock-last-label">Lock the last point</span>
        <Switch checked={lockLast} onChange={onLockLastChange} aria-labelledby="lock-last-label" />
      </div>
      {routeError ? <p className="stop-error">{routeError}</p> : null}
      <Button
        className="toolbar-action"
        block
        color="green"
        variant="solid"
        icon={<CarOutlined />}
        disabled={stops.length < 2 || building}
        loading={building}
        onClick={onBuildRoute}
      >
        Build route
      </Button>
      {routeActive ? renderYandexButton() : null}
      </div>
      </div>
      {mobile && collapsed && routeActive && !selecting ? <div className="yandex-strip">{renderYandexButton()}</div> : null}
      {mobile ? (
        <Button
          type="text"
          className="toolbar-pull"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand stops' : 'Collapse stops'}
          onClick={() => setCollapsed((open) => !open)}
        >
          <CaretUpOutlined />
        </Button>
      ) : null}
    </aside>
  );

  function renderYandexButton() {
    return (
      <Button
        className="toolbar-action yandex-action"
        block
        icon={<ExportOutlined />}
        onClick={() => openInYandex(stops, roundTrip, mobile)}
      >
        Open in Yandex Maps
      </Button>
    );
  }

  function toolbarClass() {
    const picking = mobile && collapsed && selecting && draftOpen;
    return ['toolbar', mobile ? 'mobile' : '', mobile && collapsed ? 'collapsed' : '', picking ? 'picking' : '']
      .filter(Boolean)
      .join(' ');
  }

  function indexStyle(index: number): { background: string } | undefined {
    const color = stopColor(index, roundTrip, routeActive);
    return color ? { background: color } : undefined;
  }

  function renderDraft(indexLabel: string, index?: number) {
    return (
      <>
        <div className="stop-row">
          <span className="stop-index" style={index === undefined ? undefined : indexStyle(index)}>
            {indexLabel}
          </span>
          <AutoComplete<string, SuggestionOption>
            className="stop-search"
            value={query}
            options={suggestions.map((place) => ({ value: place.label, place }))}
            filterOption={false}
            disabled={confirming}
            onChange={(value) => changeQuery(value)}
            onSelect={(_value, option) => {
              setSelected(option.place);
              setQuery(option.place.label);
              setSearchError(null);
            }}
          >
            <Input
              placeholder="53.9006, 27.559"
              allowClear
              styles={{ input: { fontSize: 16 } }}
              suffix={
                <Button
                  className="map-pick"
                  size="small"
                  type={selecting ? 'primary' : 'default'}
                  aria-pressed={selecting}
                  aria-label="Select on map"
                  disabled={!token || stops.length >= MAX_STOPS || confirming}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectingChange(!selecting)}
                >
                  Map
                </Button>
              }
            />
          </AutoComplete>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            aria-label="Confirm"
            disabled={!token || !canConfirm}
            loading={confirming}
            onClick={() => void confirm()}
          />
          <Button
            color="danger"
            variant="solid"
            icon={<DeleteOutlined />}
            aria-label={
              draft?.mode === 'edit'
                ? `Delete ${stops.find((stop) => stop.id === draft.stopId)?.label ?? 'stop'}`
                : 'Remove'
            }
            disabled={confirming}
            onClick={removeDraft}
          />
        </div>
        {searchError ? <p className="stop-error">{searchError}</p> : null}
      </>
    );
  }
}

type SuggestionOption = {
  value: string;
  place: GeocodedPlace;
};

const CARD_MOTION_MS = 240;
const CARD_MOTION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
