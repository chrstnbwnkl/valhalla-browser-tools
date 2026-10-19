import { json, useStoredState, type Codec } from "../hooks/useStoredState";

export const PRESET_SERVERS = [
  "https://valhalla1.openstreetmap.de",
  "http://localhost:8002",
] as const;
const DEFAULT_SERVER: string = PRESET_SERVERS[0];

// the servers added by hand, shared by the tools like the saved views
export const SERVERS_KEY = "valhalla-browser-tools:servers";
// before the added servers were shared, each tool kept its own under its selected-server key
const LEGACY_SERVER_KEYS = [
  "locate-visualizer:servers",
  "route-debugger:servers",
];

const isPreset = (url: string) =>
  (PRESET_SERVERS as readonly string[]).includes(url);

/** Turns what the user typed into a base URL, or null. Without a scheme, local hosts get http. */
export function normalizeServer(text: string): string | null {
  let value = text.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value))
    value =
      (/^(localhost|\[|\d+\.\d+\.\d+\.\d+)/i.test(value)
        ? "http://"
        : "https://") + value;
  try {
    const url = new URL(value);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

const customOnly = (list: unknown) =>
  Array.isArray(list)
    ? list.filter(
        (url): url is string => typeof url === "string" && !isPreset(url),
      )
    : [];

function parse(stored: string | null): unknown {
  try {
    return JSON.parse(stored ?? "null");
  } catch {
    return null;
  }
}

function legacyCustom() {
  try {
    return LEGACY_SERVER_KEYS.flatMap((key) =>
      customOnly(
        (parse(localStorage.getItem(key)) as { custom?: unknown })?.custom,
      ),
    );
  } catch {
    return []; // storage unavailable
  }
}

// nothing shared yet: start from the servers the tools added on their own
export const CUSTOM_SERVERS: Codec<string[]> = {
  read: (stored) =>
    stored !== null ? customOnly(parse(stored)) : [...new Set(legacyCustom())],
  write: (custom) => JSON.stringify(custom),
};

const SELECTED_SERVER: Codec<string | null> = {
  ...json((raw) => {
    const selected = (raw as { selected?: unknown } | null)?.selected;
    return typeof selected === "string" ? selected : null;
  }),
  write: (selected) => JSON.stringify({ selected }),
};

export type Servers = ReturnType<typeof useServers>;

/** The servers to pick from, and which one this tool uses (kept under `selectedKey`). */
export function useServers(selectedKey: string) {
  const [custom, setCustom] = useStoredState(SERVERS_KEY, CUSTOM_SERVERS);
  const [stored, setSelected] = useStoredState(selectedKey, SELECTED_SERVER);
  const all = [...PRESET_SERVERS, ...custom];
  // falls back when the server in use was removed, maybe in another tab
  const selected =
    stored !== null && all.includes(stored) ? stored : DEFAULT_SERVER;

  return {
    all,
    selected,
    removable: !isPreset(selected),
    select: setSelected,
    /** Adds a server (normalized already) and selects it. */
    add(url: string) {
      if (!all.includes(url)) setCustom([...custom, url]);
      setSelected(url);
    },
    /** Forgets the selected server; returns the one selected instead. */
    remove() {
      setCustom(custom.filter((url) => url !== selected));
      setSelected(DEFAULT_SERVER);
      return DEFAULT_SERVER;
    },
  };
}
