import { useCallback, useEffect, useState } from "react";

/** How a value is kept in storage. Should be defined once, outside components, so it stays stable. */
export type Codec<T> = {
  /** Turns what is stored (null when nothing is, or something an older version wrote) into a valid value. */
  read: (stored: string | null) => T;
  write: (value: T) => string;
};

/** A codec storing JSON; `parse` gets the parsed value, or null when nothing is stored or it doesn't parse. */
export function json<T>(parse: (raw: unknown) => T): Codec<T> {
  return {
    read: (stored) => {
      let raw: unknown = null;
      try {
        raw = JSON.parse(stored ?? "null");
      } catch {
        // corrupt
      }
      return parse(raw);
    },
    write: (value) => JSON.stringify(value),
  };
}

function read<T>(key: string, codec: Codec<T>): T {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // storage unavailable
  }
  return codec.read(stored);
}

/** State kept in localStorage under `key` and shared with other tabs. */
export function useStoredState<T>(key: string, codec: Codec<T>) {
  const [value, setValue] = useState(() => read(key, codec));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, codec.write(next));
      } catch {
        // storage unavailable
      }
    },
    [key, codec],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read(key, codec));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, codec]);

  return [value, update] as const;
}
