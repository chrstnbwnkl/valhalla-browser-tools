import { useEffect, useState } from "react";
import { useStoredState } from "../hooks/useStoredState";

const DEFAULT_SERVER = "https://valhalla1.openstreetmap.de";
export const PRESET_SERVERS = [DEFAULT_SERVER, "http://localhost:8002"];
export const SERVERS_KEY = "valhalla-browser-tools:server-list";
export const TAB_SERVER_KEY = "valhalla-browser-tools:tab-server";

/** `selected` is only the last pick in any tab, which new tabs start from. */
type Stored = { added: string[]; selected: string };

function readTabServer() {
  try {
    return sessionStorage.getItem(TAB_SERVER_KEY);
  } catch {
    return null;
  }
}

function writeTabServer(url: string) {
  try {
    sessionStorage.setItem(TAB_SERVER_KEY, url);
  } catch {
    // storage unavailable
  }
}

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

/**
 * The Valhalla servers to pick from, shared by all tools and tabs, and the one
 * in use, which each tab keeps for itself.
 */
export function useServers() {
  const [{ added, selected: lastPicked }, setStored] = useStoredState(
    SERVERS_KEY,
    parse,
  );
  const [selected, setSelected] = useState(() => readTabServer() ?? lastPicked);
  useEffect(() => writeTabServer(selected), [selected]);

  const known = [...PRESET_SERVERS, ...added];

  return {
    // another tab may have forgotten the server this one is still using
    all: known.includes(selected) ? known : [...known, selected],
    selected,
    removable: added.includes(selected),
    select: (url: string) => {
      setSelected(url);
      setStored({ added, selected: url });
    },
    add: (url: string) => {
      setSelected(url);
      setStored({
        added: known.includes(url) ? added : [...added, url],
        selected: url,
      });
    },
    /** Forgets the selected server and returns the one used instead. */
    remove: () => {
      setSelected(DEFAULT_SERVER);
      setStored({
        added: added.filter((url) => url !== selected),
        selected: DEFAULT_SERVER,
      });
      return DEFAULT_SERVER;
    },
  };
}
