// A stand-in for maplibre-gl in tests (jsdom has no WebGL): it keeps what is added to the map, so tests can look
// at sources, layers and markers, and lets them fire map events.

type Listener = { type: string; layer?: string; fn: (e: unknown) => void };
type LngLatLike = [number, number] | { lng: number; lat: number };

export class LngLat {
  constructor(
    public lng: number,
    public lat: number,
  ) {}
  static convert(input: LngLatLike) {
    return Array.isArray(input)
      ? new LngLat(input[0], input[1])
      : new LngLat(input.lng, input.lat);
  }
}

export class LngLatBounds {
  sw: LngLat | null = null;
  ne: LngLat | null = null;
  extend(input: LngLatLike) {
    const { lng, lat } = LngLat.convert(input);
    this.sw = new LngLat(
      Math.min(this.sw?.lng ?? lng, lng),
      Math.min(this.sw?.lat ?? lat, lat),
    );
    this.ne = new LngLat(
      Math.max(this.ne?.lng ?? lng, lng),
      Math.max(this.ne?.lat ?? lat, lat),
    );
    return this;
  }
  contains(input: LngLatLike) {
    const { lng, lat } = LngLat.convert(input);
    return (
      !!this.sw &&
      !!this.ne &&
      lng >= this.sw.lng &&
      lng <= this.ne.lng &&
      lat >= this.sw.lat &&
      lat <= this.ne.lat
    );
  }
}

type Layer = {
  id: string;
  source?: string;
  paint?: object;
  layout?: object;
  filter?: unknown;
};

export class Map {
  /** Every map created, latest last. */
  static instances: Map[] = [];

  sources = new globalThis.Map<string, { type: string; data: unknown }>();
  layers: Layer[] = [];
  images = new globalThis.Map<string, unknown>();
  controls = new Set<unknown>();
  markers = new Set<Marker>();
  listeners: Listener[] = [];
  center: LngLat;
  zoom: number;
  /** What getBounds() reports as in view. */
  bounds = new LngLatBounds().extend([-180, -90]).extend([180, 90]);
  fitted: LngLatBounds | null = null;
  removed = false;
  private container: HTMLElement;
  private canvas = document.createElement("canvas");

  constructor(
    public options: {
      container: HTMLElement;
      center?: LngLatLike;
      zoom?: number;
      style?: any;
    },
  ) {
    this.container = options.container;
    this.center = LngLat.convert(options.center ?? [0, 0]);
    this.zoom = options.zoom ?? 0;
    for (const layer of options.style?.layers ?? [])
      this.layers.push(structuredClone(layer));
    Map.instances.push(this);
    queueMicrotask(() => this.fire("load", {}));
  }

  on(
    type: string,
    layerOrFn: string | ((e: any) => void),
    fn?: (e: any) => void,
  ) {
    const listener: Listener =
      typeof layerOrFn === "string"
        ? { type, layer: layerOrFn, fn: fn! }
        : { type, fn: layerOrFn };
    this.listeners.push(listener);
    return {
      unsubscribe: () =>
        (this.listeners = this.listeners.filter((other) => other !== listener)),
    };
  }
  once(type: string, fn: (e: any) => void) {
    const subscription = this.on(type, (e) => {
      subscription.unsubscribe();
      fn(e);
    });
    return this;
  }
  /** Fires a map event, or with `layer`, an event on that layer's features. */
  fire(type: string, event: object, layer?: string) {
    for (const listener of [...this.listeners])
      if (listener.type === type && listener.layer === layer)
        listener.fn({ type, target: this, ...event });
  }

  addSource(id: string, source: { type: string; data: unknown }) {
    if (this.sources.has(id)) throw new Error(`source ${id} exists`);
    this.sources.set(id, { ...source });
  }
  getSource(id: string) {
    const source = this.sources.get(id);
    return (
      source && {
        ...source,
        setData: (data: unknown) => void (source.data = data),
      }
    );
  }
  removeSource(id: string) {
    if (this.layers.some((layer) => layer.source === id))
      throw new Error(`source ${id} is in use`);
    this.sources.delete(id);
  }
  /** The data of a GeoJSON source. */
  data(id: string) {
    return this.sources.get(id)?.data as
      { features: { properties: any; geometry: any }[] } | undefined;
  }

  addLayer(layer: Layer, before?: string) {
    if (this.getLayer(layer.id)) throw new Error(`layer ${layer.id} exists`);
    if (layer.source && !this.sources.has(layer.source))
      throw new Error(`no source ${layer.source}`);
    const copy = structuredClone(layer);
    const at = before
      ? this.layers.findIndex((other) => other.id === before)
      : -1;
    if (at < 0) this.layers.push(copy);
    else this.layers.splice(at, 0, copy);
  }
  getLayer(id: string) {
    return this.layers.find((layer) => layer.id === id);
  }
  removeLayer(id: string) {
    this.layers = this.layers.filter((layer) => layer.id !== id);
  }
  getStyle() {
    return { layers: this.layers };
  }
  setPaintProperty(id: string, key: string, value: unknown) {
    const layer = this.getLayer(id)!;
    layer.paint = { ...layer.paint, [key]: value };
  }
  setLayoutProperty(id: string, key: string, value: unknown) {
    const layer = this.getLayer(id)!;
    layer.layout = { ...layer.layout, [key]: value };
  }
  setFilter(id: string, filter: unknown) {
    this.getLayer(id)!.filter = filter;
  }

  addImage(id: string, image: unknown) {
    this.images.set(id, image);
  }
  updateImage(id: string, image: unknown) {
    this.images.set(id, image);
  }
  hasImage(id: string) {
    return this.images.has(id);
  }
  removeImage(id: string) {
    this.images.delete(id);
  }

  addControl(control: unknown) {
    this.controls.add(control);
    return this;
  }
  removeControl(control: unknown) {
    this.controls.delete(control);
    return this;
  }

  getCanvas() {
    return this.canvas;
  }
  getContainer() {
    return this.container;
  }
  getCenter() {
    return this.center;
  }
  getZoom() {
    return this.zoom;
  }
  getBounds() {
    return this.bounds;
  }
  jumpTo({ center, zoom }: { center?: LngLatLike; zoom?: number }) {
    if (center) this.center = LngLat.convert(center);
    if (zoom !== undefined) this.zoom = zoom;
  }
  fitBounds(bounds: LngLatBounds) {
    this.fitted = bounds;
  }
  remove() {
    this.removed = true;
  }
}

export class Marker {
  private lngLat = new LngLat(0, 0);
  private map: Map | null = null;
  private listeners: Record<string, (() => void)[]> = {};
  element: HTMLElement;
  draggable: boolean;

  constructor({
    element,
    draggable = false,
  }: {
    element: HTMLElement;
    draggable?: boolean;
  }) {
    this.element = element;
    this.draggable = draggable;
  }
  setLngLat(input: LngLatLike) {
    this.lngLat = LngLat.convert(input);
    return this;
  }
  getLngLat() {
    return this.lngLat;
  }
  getElement() {
    return this.element;
  }
  addTo(map: Map) {
    this.map = map;
    map.markers.add(this);
    map.getContainer().append(this.element);
    return this;
  }
  remove() {
    this.map?.markers.delete(this);
    this.element.remove();
    return this;
  }
  on(type: string, fn: () => void) {
    (this.listeners[type] ??= []).push(fn);
    return this;
  }
  /** Drags the marker to `to`, as a user would. */
  drag(to: LngLatLike) {
    this.setLngLat(to);
    for (const fn of this.listeners.dragend ?? []) fn();
  }
}

export const setWorkerUrl = () => {};

export class NavigationControl {
  constructor(public options?: object) {}
}
export class ScaleControl {
  constructor(public options?: object) {}
}
