import { BOOLEAN, type Option } from "../../shared/valhalla/request";
import data from "./costing-options.json";

type Spec = {
  name: string;
  type: string;
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  description: string;
};

const { types, costings, schemas } = data as {
  types: string[];
  costings: Record<string, string>;
  schemas: Record<string, Spec[]>;
};

export const COSTINGS = types;

function toOption(spec: Spec, group: string): Option {
  const values = spec.enum ?? (spec.type === "boolean" ? BOOLEAN : undefined);
  const range =
    "minimum" in spec || "maximum" in spec
      ? ` (${spec.minimum ?? ""}–${spec.maximum ?? ""})`
      : "";
  const preset =
    values && spec.default !== undefined ? ` Default: ${spec.default}.` : "";
  return {
    path: spec.name,
    values,
    hint: spec.default === undefined ? "" : String(spec.default),
    title: `${spec.description}${range}${preset}`,
    group,
  };
}

/** The options of `costing`, then those every costing has. */
export function costingOptions(costing: string): Option[] {
  const own = schemas[costings[costing] ?? ""] ?? [];
  const shared = (schemas.Base ?? []).filter(
    (spec) => !own.some((other) => other.name === spec.name),
  );
  return [
    ...own.map((spec) => toOption(spec, costing)),
    ...shared.map((spec) => toOption(spec, "all costings")),
  ];
}
