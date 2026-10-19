import { useCallback, useEffect, useState } from 'react';

function read<T>(key: string, parse: (raw: unknown) => T): T {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    // storage unavailable or corrupt
  }
  return parse(raw);
}

/**
 * State kept in localStorage under `key` and shared with other tabs. `parse` turns whatever is stored (possibly
 * null, or something an older version wrote) into a valid value; it should be a stable function.
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
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, parse]);

  return [value, update] as const;
}
