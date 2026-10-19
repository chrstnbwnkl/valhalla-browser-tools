export const fmt = (n: unknown, unit = "") =>
  typeof n === "number" ? `${+n.toFixed(3)}${unit}` : "–";

export const fmtValue = (value: unknown) =>
  typeof value === "number"
    ? fmt(value)
    : value === undefined
      ? "–"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
