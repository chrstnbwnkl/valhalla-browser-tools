import { useEffect } from "react";

export const readUrlParam = (name: string) =>
  new URLSearchParams(location.search).get(name);

/** Mirrors `value` into the URL without adding history; null leaves it. */
export function useUrlParam(name: string, value: string | null) {
  useEffect(() => {
    if (value === null) return;
    history.replaceState(
      history.state,
      "",
      `?${new URLSearchParams({ [name]: value })}${location.hash}`,
    );
  }, [name, value]);
}
