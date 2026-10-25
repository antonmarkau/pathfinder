import { useEffect, useState } from 'react';
import { AutoComplete, Button, Input, Switch } from 'antd';
import { CarOutlined, CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { forwardGeocode, parseLatLng, reverseGeocode, type GeocodedPlace, type MapCenter } from './geocoding';
import logo from './logo.png';
import { stopColor } from './route';
import { MAX_STOPS, type Stop } from './stops';

type Draft = { mode: 'add' } | { mode: 'edit'; stopId: string };

type StopsToolbarProps = {
  token: string | null;
  stops: Stop[];
  proximity: MapCenter;
  selecting: boolean;
  roundTrip: boolean;
  lockFirst: boolean;
  lockLast: boolean;
  building: boolean;
  routeError: string | null;
  routeActive: boolean;
  onSelectingChange: (selecting: boolean) => void;
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
  roundTrip,
  lockFirst,
  lockLast,
  building,
  routeError,
  routeActive,
  onSelectingChange,
  onRoundTripChange,
  onLockFirstChange,
  onLockLastChange,
  onBuildRoute,
  onStopsChange,
}: StopsToolbarProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GeocodedPlace | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const coordinates = parseLatLng(query);
  const canConfirm = selected !== null || coordinates !== null;
  const draftOpen = draft !== null;

  useEffect(() => {
    if (draft?.mode !== 'edit' || !selected) {
      return;
    }
    const stop = stops.find((item) => item.id === draft.stopId);
    if (!stop) {
      return;
    }
    if (stop.longitude !== selected.longitude || stop.latitude !== selected.latitude) {
      closeDraft();
    }
  }, [draft, selected, stops]);

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
    onSelectingChange(false);
    setDraft(null);
    setQuery('');
    setSelected(null);
    setSuggestions([]);
    setSearchError(null);
  }

  function removeDraft() {
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
    <aside className="toolbar" aria-label="Stops">
      <header className="header">
        <img className="logo" src={logo} alt="" />
        <h1>Pathfinder</h1>
      </header>
      <div className="toolbar-body">
      <h2>Stops</h2>
      <ul className="stop-list">
        {stops.map((stop, index) =>
          draft?.mode === 'edit' && draft.stopId === stop.id ? (
            <li key={stop.id}>{renderDraft(`${index + 1}`, index)}</li>
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
                danger
                icon={<DeleteOutlined />}
                aria-label={`Delete ${stop.label}`}
                onClick={() => removeStop(stop.id)}
              />
            </li>
          ),
        )}
      </ul>
      {draft?.mode === 'add' ? renderDraft(String(stops.length + 1)) : null}
      <Button
        className="toolbar-action"
        block
        icon={<PlusOutlined />}
        aria-label="Add stop"
        disabled={!token || stops.length >= MAX_STOPS || draftOpen}
        onClick={openAdd}
      />
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
      </div>
    </aside>
  );

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
            danger
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
