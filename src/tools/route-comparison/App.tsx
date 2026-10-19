import { useEffect, useEffectEvent, useState } from "react";
import { BasemapToggle, useColourBasemap } from "../../shared/map/basemap";
import { createMapSync } from "../../shared/map/sync";
import { AddDialog } from "./AddDialog";
import { rects, withPane, withoutPane, type Layout } from "./layout";
import { load, searchFor, sourcesFrom, type Source } from "./links";
import { MapControls } from "./MapControls";
import { Pane } from "./Pane";
import type { Response } from "./response";

type PaneData = {
  id: number;
  name: string;
  response: Response;
  /** Where it was loaded from, if from a link. */
  source?: string;
};

const percent = (fraction: number) => `${fraction * 100}%`;

export function App() {
  const [panes, setPanes] = useState<PaneData[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [adding, setAdding] = useState(false);
  const [colour, setColour] = useColourBasemap();
  const [sync] = useState(createMapSync);
  const [sources] = useState(() => sourcesFrom(location.search));
  const [loading, setLoading] = useState(sources.length > 0);
  const [errors, setErrors] = useState<string[]>([]);
  const placed = rects(layout);
  const everything = panes.flatMap(
    ({ response }) => response.routes[0]!.coords,
  );

  const fallbackName = (id: number, source?: string) =>
    source ?? `Response ${id}`;

  function addAll(added: Omit<PaneData, "id">[]) {
    let next = { panes, layout };
    for (const pane of added) {
      const id = Math.max(0, ...next.panes.map((p) => p.id)) + 1;
      next = {
        panes: [
          ...next.panes,
          { ...pane, id, name: pane.name || fallbackName(id, pane.source) },
        ],
        layout: withPane(next.layout, id, next.panes.at(-1)?.id ?? 0),
      };
    }
    setPanes(next.panes);
    setLayout(next.layout);
  }

  // the responses a link asks for, in its order
  const loaded = useEffectEvent((results: PromiseSettledResult<Response>[]) => {
    addAll(
      results.flatMap((result, i) =>
        result.status === "fulfilled"
          ? [
              {
                name: sources[i]!.label ?? "",
                response: result.value,
                source: sources[i]!.url,
              },
            ]
          : [],
      ),
    );
    setErrors(
      results.flatMap((result) =>
        result.status === "rejected" ? [(result.reason as Error).message] : [],
      ),
    );
    setLoading(false);
  });
  useEffect(() => {
    if (!sources.length) return;
    const controller = new AbortController();
    void Promise.allSettled(
      sources.map((source) => load(source, controller.signal)),
    ).then((results) => controller.signal.aborted || loaded(results));
    return () => controller.abort();
  }, [sources]);

  // the link follows the panes loaded from one, so it can be shared or reloaded
  useEffect(() => {
    if (loading) return;
    const linked: Source[] = panes.flatMap(({ name, source }) =>
      source
        ? [{ url: source, label: name === source ? undefined : name }]
        : [],
    );
    const search = searchFor(linked);
    if (search !== location.search)
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${search}${location.hash}`,
      );
  }, [panes, loading]);

  function close(id: number) {
    setPanes(panes.filter((pane) => pane.id !== id));
    setLayout(layout && withoutPane(layout, id));
  }

  function rename(id: number, name: string) {
    setPanes(
      panes.map((pane) =>
        pane.id === id
          ? { ...pane, name: name || fallbackName(id, pane.source) }
          : pane,
      ),
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-surface-sunken">
      {/* side by side rather than nested, so a map stays put when the layout changes */}
      {panes.map(({ id, name, response }) => {
        const rect = placed.get(id)!;
        return (
          <div
            key={id}
            className="absolute border-line data-[left]:border-l data-[top]:border-t"
            data-left={rect.x > 0 || undefined}
            data-top={rect.y > 0 || undefined}
            style={{
              left: percent(rect.x),
              top: percent(rect.y),
              width: percent(rect.width),
              height: percent(rect.height),
            }}
          >
            <Pane
              name={name}
              response={response}
              everything={everything}
              colour={colour}
              sync={sync}
              onRename={(next) => rename(id, next)}
              onClose={() => close(id)}
            />
          </div>
        );
      })}
      {!panes.length && (
        <div className="grid h-full place-items-center p-6 text-center">
          <div>
            <h1 className="heading m-0">Route comparison</h1>
            <p className="m-0 mt-2 text-ink-muted">
              {loading
                ? `Loading ${sources.length} ${sources.length > 1 ? "responses" : "response"}…`
                : "Paste /route responses with the + button; each opens on a map of its own, and the maps move together."}
            </p>
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <div
          role="alert"
          className="caption absolute top-3 left-1/2 z-[5] flex max-w-[min(640px,calc(100%-24px))] -translate-x-1/2 items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-danger shadow-float"
        >
          <div className="grid gap-1">
            {errors.map((error) => (
              <p key={error} className="m-0">
                {error}
              </p>
            ))}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="cursor-pointer text-[18px]/none"
            onClick={() => setErrors([])}
          >
            ×
          </button>
        </div>
      )}

      {panes.length > 0 && (
        <BasemapToggle
          className="top-auto bottom-9 left-24 translate-x-0"
          colour={colour}
          onChange={setColour}
        />
      )}
      <MapControls sync={sync} />
      <button
        type="button"
        aria-label="Add a response"
        title="Add a response"
        className="absolute bottom-6 left-6 z-[4] grid size-14 cursor-pointer place-items-center rounded-full bg-green text-[32px]/none text-on-green shadow-float hover:brightness-108"
        onClick={() => setAdding(true)}
      >
        +
      </button>
      {adding && (
        <AddDialog
          placeholder={`Response ${Math.max(0, ...panes.map((p) => p.id)) + 1}`}
          onAdd={(response, name) => addAll([{ name, response }])}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
