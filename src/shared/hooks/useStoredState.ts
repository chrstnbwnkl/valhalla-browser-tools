import { useCallback, useEffect, useState } from "react";

function read<T>(key: string, parse: (raw: unknown) => T): T {
  try {
    return parse(JSON.parse(localStorage.getItem(key) ?? "null"));
  } catch {
    return parse(null);
  }
}

/**
 * State kept in localStorage as JSON and synced across tabs. `parse` turns
 * what is stored (or null) into a valid value; it must be a stable function.
 */
export function useStoredState<T>(key: string, parse: (raw: unknown) => T) {
  const [value, setValue] = useState(() => read(key, parse));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable
      }
    },
    [key],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read(key, parse));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, parse]);

  return [value, update] as const;
}
