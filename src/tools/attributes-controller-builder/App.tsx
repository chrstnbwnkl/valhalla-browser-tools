import { useMemo, useState } from 'react';
import { Card } from '../../shared/ui/Card';
import { CopyButton } from '../../shared/ui/CopyButton';
import { Input, TextArea } from '../../shared/ui/Input';
import { useStoredState } from '../../shared/hooks/useStoredState';
import { AttributeList, ExtraItem } from './AttributeList';
import { KNOWN, filterJson, sections, type Action } from './attributes';
import { NO_MARKS } from './marks';

export const STORAGE_KEY = 'attributes-controller-builder:state';

type Stored = { selected: string[]; action: Action };

// accepts whatever an earlier version, or another tab, left in storage
function parseStored(raw: unknown): Stored {
  const saved = raw as { selected?: unknown; action?: unknown } | null;
  return {
    selected: Array.isArray(saved?.selected)
      ? saved.selected.filter((name): name is string => typeof name === 'string')
      : [],
    action: saved?.action === 'exclude' ? 'exclude' : 'include',
  };
}

const HEADER = 'flex items-center gap-3 border-b border-line px-4 py-3';

export function App() {
  const [stored, setStored] = useStoredState(STORAGE_KEY, parseStored);
  const selected = useMemo(() => new Set(stored.selected), [stored.selected]);
  const [filterInput, setFilterInput] = useState('');
  const [availableMarks, setAvailableMarks] = useState(NO_MARKS);
  const [selectedMarks, setSelectedMarks] = useState(NO_MARKS);

  const filter = filterInput.trim().toLowerCase();
  const available = sections(selected, (name) => !selected.has(name) && name.includes(filter));
  const availableNames = available.flatMap((section) => section.attributes);
  const canAddCustom = filter && !KNOWN.has(filter) && !selected.has(filter);

  const add = (names: string[]) => {
    setStored({ ...stored, selected: [...new Set([...stored.selected, ...names])] });
    setAvailableMarks(NO_MARKS);
  };
  const remove = (names: string[]) => {
    setStored({ ...stored, selected: stored.selected.filter((name) => !names.includes(name)) });
    setSelectedMarks(NO_MARKS);
  };
  const addCustom = (name: string) => {
    setFilterInput('');
    add([name]);
  };

  return (
    <div className="mx-auto flex h-screen max-w-[1120px] flex-col gap-4 p-4">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <header className={HEADER}>
            <b className="label flex-none">Available</b>
            <Input
              type="search"
              className="min-w-0 flex-1"
              placeholder="Filter, or type a custom attribute and press Enter"
              autoFocus
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              // Enter adds the only match, or the typed text as a custom attribute when nothing matches
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (availableNames.length === 1) addCustom(availableNames[0]!);
                else if (filter && !availableNames.length && !selected.has(filter)) addCustom(filter);
              }}
            />
          </header>
          <AttributeList
            label="Available"
            sections={available}
            marks={availableMarks}
            onMarks={setAvailableMarks}
            onMove={add}
            moveLabel="add all"
            empty="Nothing matches."
            first={
              canAddCustom && (
                <ExtraItem note="custom" onClick={() => addCustom(filter)}>
                  Add "{filter}"
                </ExtraItem>
              )
            }
          />
        </Card>
        <Card className="flex min-h-0 flex-col overflow-hidden p-0">
          <header className={HEADER}>
            <b className="label flex-none">Selected</b>
            <small className="caption text-ink-muted">
              {selected.size} of {KNOWN.size}
            </small>
            <div className="caption flex flex-1 justify-end gap-4">
              {(['include', 'exclude'] as const).map((action) => (
                <label key={action} className="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="action"
                    className="m-0 accent-green"
                    checked={stored.action === action}
                    onChange={() => setStored({ ...stored, action })}
                  />
                  {action}
                </label>
              ))}
            </div>
          </header>
          <AttributeList
            label="Selected"
            sections={sections(selected, (name) => selected.has(name))}
            marks={selectedMarks}
            onMarks={setSelectedMarks}
            onMove={remove}
            moveLabel="remove all"
            empty="Click attributes on the left to add them. Ctrl+click or Shift+click marks several; clicking a marked one moves them all."
          />
        </Card>
      </div>
      <div className="flex flex-none items-start gap-3">
        <TextArea
          mono
          aria-label="Filter JSON"
          className="h-40 flex-1 resize-y"
          readOnly
          spellCheck={false}
          value={filterJson(selected, stored.action)}
        />
        <CopyButton variant="primary" text={filterJson(selected, stored.action)} />
      </div>
    </div>
  );
}
