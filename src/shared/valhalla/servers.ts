import { useStoredState } from "../hooks/useStoredState";

const DEFAULT_SERVER = "https://valhalla1.openstreetmap.de";
export const PRESET_SERVERS = [DEFAULT_SERVER, "http://localhost:8002"];
export const SERVERS_KEY = "valhalla-browser-tools:server-list";

type Stored = { added: string[]; selected: string };

function parse(raw: unknown): Stored {
  const stored = raw as { added?: unknown; selected?: unknown } | null;
  const added = Array.isArray(stored?.added)
    ? stored.added.filter(
        (url): url is string =>
          typeof url === "string" && !PRESET_SERVERS.includes(url),
      )
    : [];
  const selected =
    typeof stored?.selected === "string" &&
    [...PRESET_SERVERS, ...added].includes(stored.selected)
      ? stored.selected
      : DEFAULT_SERVER;
  return { added, selected };
}

/** Turns typed input into a base URL, or null. Local hosts default to http. */
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

export type Servers = ReturnType<typeof useServers>;

/** The Valhalla servers to pick from and the one in use, shared by all tools. */
export function useServers() {
  const [{ added, selected }, setStored] = useStoredState(SERVERS_KEY, parse);
  const all = [...PRESET_SERVERS, ...added];

  return {
    all,
    selected,
    removable: added.includes(selected),
    select: (url: string) => setStored({ added, selected: url }),
    add: (url: string) =>
      setStored({
        added: all.includes(url) ? added : [...added, url],
        selected: url,
      }),
    /** Forgets the selected server and returns the one used instead. */
    remove: () => {
      setStored({
        added: added.filter((url) => url !== selected),
        selected: DEFAULT_SERVER,
      });
      return DEFAULT_SERVER;
    },
  };
}
