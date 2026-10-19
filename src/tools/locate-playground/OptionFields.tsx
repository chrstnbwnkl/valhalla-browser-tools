import { Fragment } from "react";
import { CommitInput, Select } from "../../shared/ui/Input";
import { OPTIONS, optionState, type Location, type Option } from "./request";

type Props = {
  locations: Location[];
  onChange: (option: Option, raw: string) => void;
};

export function OptionFields({ locations, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pt-2 pb-3">
      {OPTIONS.map((option, i) => {
        const [key = "", sub] = option.path.split(".");
        const group = sub && OPTIONS[i - 1]?.path.split(".")[0] !== key;
        const { value, mixed } = optionState(locations, option.path);
        return (
          <Fragment key={option.path}>
            {group && (
              <div className="code col-span-full text-ink-muted">{key}</div>
            )}
            <label className="grid min-w-0 gap-1">
              <span className="code">{sub ?? key}</span>
              {option.values ? (
                <Select
                  aria-label={option.path}
                  value={value}
                  onChange={(e) => onChange(option, e.target.value)}
                >
                  <option value="">{mixed ? "mixed" : "default"}</option>
                  {option.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              ) : (
                <CommitInput
                  mono
                  aria-label={option.path}
                  type="number"
                  step="any"
                  placeholder={mixed ? "mixed" : option.hint}
                  value={value}
                  onCommit={(raw) => onChange(option, raw)}
                />
              )}
            </label>
          </Fragment>
        );
      })}
    </div>
  );
}
