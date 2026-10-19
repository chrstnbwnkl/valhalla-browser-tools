import { useEffect } from "react";

/** A parameter of the URL the page was opened with. */
export const readUrlParam = (name: string) =>
  new URLSearchParams(location.search).get(name);

/**
 * Keeps `value` in the URL as its only parameter, so the address can be shared, without adding history entries.
 * Null leaves the URL as it is.
 */
export function useUrlParam(name: string, value: string | null) {
  useEffect(() => {
    if (value === null) return;
    try {
      history.replaceState(
        history.state,
        "",
        `?${new URLSearchParams({ [name]: value })}${location.hash}`,
      );
    } catch {
      // some browsers refuse this for pages opened from disk
    }
  }, [name, value]);
}
