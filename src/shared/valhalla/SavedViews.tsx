import { useState } from "react";
import { useMap } from "../map/context";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useViews, withView } from "./views";

/** The saved map views, to jump to, and a form saving the current one. Saving under a name that exists replaces it. */
export function SavedViews() {
  const map = useMap();
  const [views, setViews] = useViews();
  const [name, setName] = useState("");

  return (
    <div className="flex-none border-t border-line pb-3">
      {views.length > 0 && (
        <div className="mx-3 mt-2 flex max-h-[84px] flex-wrap gap-2 overflow-y-auto">
          {views.map((view) => (
            <span key={view.name} className="flex max-w-full">
              <Button
                size="sm"
                className="block min-w-0 truncate"
                title="Show this view"
                onClick={() =>
                  map?.jumpTo({ center: view.center, zoom: view.zoom })
                }
              >
                {view.name}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title={`Remove "${view.name}"`}
                onClick={() =>
                  setViews(views.filter((other) => other !== view))
                }
              >
                ×
              </Button>
            </span>
          ))}
        </div>
      )}
      <form
        className="mx-3 mt-3 flex flex-none items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || !map) return;
          setName("");
          const { lng, lat } = map.getCenter();
          setViews(
            withView(views, {
              name: trimmed,
              center: [+lng.toFixed(6), +lat.toFixed(6)],
              zoom: +map.getZoom().toFixed(2),
            }),
          );
        }}
      >
        <Input
          className="min-w-0 flex-1"
          placeholder="Save this map view as, e.g. San Francisco"
          spellCheck={false}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit">Save</Button>
      </form>
    </div>
  );
}
