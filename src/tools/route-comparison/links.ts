import { parseResponse, type Response } from "./response";

/** A response a link loads, from res_1, label_1, res_2, … */
export type Source = { url: string; label?: string };

export function sourcesFrom(search: string): Source[] {
  const params = new URLSearchParams(search);
  return [...params.keys()]
    .flatMap((key) => {
      const n = /^res_(\d+)$/.exec(key)?.[1];
      if (!n) return [];
      const label = params.get(`label_${n}`) ?? undefined;
      return [{ n: Number(n), url: params.get(key)!, label }];
    })
    .sort((a, b) => a.n - b.n)
    .map(({ url, label }) => ({ url, label }));
}

/** The query of a link loading `sources`, numbered in order. */
export function searchFor(sources: Source[]) {
  const params = new URLSearchParams();
  sources.forEach(({ url, label }, i) => {
    params.set(`res_${i + 1}`, url);
    if (label) params.set(`label_${i + 1}`, label);
  });
  // readable addresses; both are fine in a query
  const query = params.toString().replace(/%2F/gi, "/").replace(/%3A/gi, ":");
  return query && `?${query}`;
}

/** An address as written in a link: without a scheme, https; a path, on this site. */
export function resolveUrl(value: string, base = location.href) {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value;
  if (/^\.{0,2}\//.test(value)) return new URL(value, base).href;
  return `https://${value}`;
}

export async function load(
  source: Source,
  signal?: AbortSignal,
): Promise<Response> {
  let data: unknown;
  try {
    const res = await fetch(resolveUrl(source.url), { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    throw new Error(`Could not load ${source.url}: ${(e as Error).message}`, {
      cause: e,
    });
  }
  try {
    return parseResponse(data);
  } catch (e) {
    throw new Error(`${source.url}: ${(e as Error).message}`, { cause: e });
  }
}
