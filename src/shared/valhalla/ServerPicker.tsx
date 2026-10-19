import { useState } from "react";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { normalizeServer, type Servers } from "./servers";

type Props = {
  servers: Servers;
  /** Called with the server in use after any change. */
  onSelect: (url: string) => void;
  onError: (message: string | null) => void;
};

export function ServerPicker({ servers, onSelect, onError }: Props) {
  const [url, setUrl] = useState("");

  return (
    <>
      <div className="mx-3 mt-3 flex flex-none items-center gap-2">
        <Select
          aria-label="Valhalla server"
          title="Valhalla server"
          className="min-w-0 flex-1"
          value={servers.selected}
          onChange={(e) => {
            servers.select(e.target.value);
            onSelect(e.target.value);
          }}
        >
          {servers.all.map((server) => (
            <option key={server} value={server}>
              {server}
            </option>
          ))}
        </Select>
        <Button
          title="Forget this server"
          disabled={!servers.removable}
          onClick={() => onSelect(servers.remove())}
        >
          Remove
        </Button>
      </div>
      <form
        className="mx-3 mt-2 flex flex-none items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const normalized = normalizeServer(url);
          if (!normalized)
            return onError("That is not a valid server address.");
          onError(null);
          servers.add(normalized);
          setUrl("");
          onSelect(normalized);
        }}
      >
        <Input
          className="min-w-0 flex-1"
          placeholder="Add a server, e.g. localhost:8002"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button type="submit">Add</Button>
      </form>
    </>
  );
}
