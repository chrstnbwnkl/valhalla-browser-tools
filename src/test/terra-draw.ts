// A fake terra-draw: tests finish drawings with `finish`.

type Feature = { id: string; geometry: { type: string; coordinates: unknown } };

export class TerraDraw {
  static instances: TerraDraw[] = [];
  mode = "static";
  started = false;
  styles: Record<string, object> = {};
  private features = new Map<string, Feature>();
  private listeners: ((id: string, context: { mode: string }) => void)[] = [];

  constructor(
    public options: { modes: { mode: string; options: { styles: object } }[] },
  ) {
    for (const mode of options.modes)
      this.styles[mode.mode] = mode.options.styles;
    TerraDraw.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    this.started = false;
  }
  setMode(mode: string) {
    this.mode = mode;
  }
  setModeStyles(mode: string, styles: object) {
    this.styles[mode] = styles;
  }
  on(_event: "finish", fn: (id: string, context: { mode: string }) => void) {
    this.listeners.push(fn);
  }
  getSnapshotFeature(id: string) {
    return this.features.get(id);
  }
  removeFeatures(ids: string[]) {
    for (const id of ids) this.features.delete(id);
  }
  /** Finishes a drawing in the current mode, as a user would. */
  finish(coordinates: unknown) {
    const id = String(this.features.size + 1);
    const type = this.mode === "polygon" ? "Polygon" : "LineString";
    this.features.set(id, { id, geometry: { type, coordinates } });
    for (const fn of this.listeners) fn(id, { mode: this.mode });
  }
  get drawn() {
    return this.features.size;
  }
}

class Mode {
  constructor(
    public mode: string,
    public options: { styles: object },
  ) {}
}
export class TerraDrawPolygonMode extends Mode {
  constructor(options: { styles: object }) {
    super("polygon", options);
  }
}
export class TerraDrawLineStringMode extends Mode {
  constructor(options: { styles: object }) {
    super("linestring", options);
  }
}
export class TerraDrawMapLibreGLAdapter {
  constructor(public options: object) {}
}
