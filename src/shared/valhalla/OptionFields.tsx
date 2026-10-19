import { Fragment } from "react";
import { CommitInput, Select } from "../ui/Input";
import type { Option } from "./request";

type Props = {
  options: Option[];
  /** What an option's input shows; mixed when the values it stands for differ. */
  valueOf: (option: Option) => { value: string; mixed: boolean };
  onChange: (option: Option, raw: string) => void;
};

const groupOf = (option?: Option) =>
  option &&
  (option.group ??
    (option.path.includes(".") ? option.path.split(".")[0] : undefined));

export function OptionFields({ options, valueOf, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pt-2 pb-3">
      {options.map((option, i) => {
        const group = groupOf(option);
        const { value, mixed } = valueOf(option);
        return (
          <Fragment key={`${group}:${option.path}`}>
            {group && group !== groupOf(options[i - 1]) && (
              <div className="code col-span-full text-ink-muted">{group}</div>
            )}
            <label className="grid min-w-0 gap-1" title={option.title}>
              <span className="code truncate">
                {option.path.split(".").at(-1)}
              </span>
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
