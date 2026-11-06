import { Select } from "../../components/Select";
import { useEffect, useId, useState } from "react";
import type { Parameters } from "../../domain/types";
import type { FieldDefinition, FormProps } from "../../models/types";
import { c } from "../messages";
import { ParameterField } from "./Fields";

const pairs = [
  [1024, 1024],
  [1536, 1024],
  [1024, 1536],
  [1536, 864],
  [864, 1536],
  [2048, 2048],
  [2560, 1440],
  [1440, 2560],
  [3072, 2048],
  [2048, 3072],
];

export function FrameFields(props: FormProps & { fields: FieldDefinition[] }) {
  const id = useId();
  const { fields, draft, combination, onChange } = props;
  const width = fields.find((field) => field.key === "width");
  const height = fields.find((field) => field.key === "height");
  const encoded = fields.find((field) => ["size", "image_size"].includes(field.key) && field.kind === "text");
  const custom = width && height ? "dimensions" : encoded ? encoded.key : undefined;
  const updateField = (key: string, next: typeof draft) => {
    const parameters = { ...next.parameters };
    if (combination.provider === "runware") {
      if (["width", "height", "size"].includes(key)) delete parameters.resolution;
      if (key === "resolution" && parameters.resolution !== draft.parameters.resolution) {
        delete parameters.width;
        delete parameters.height;
        delete parameters.size;
      }
    }
    onChange({ ...next, parameters });
  };
  const clean = (parameters: Parameters) => {
    const next = { ...parameters };
    if (width && height) {
      delete next.width;
      delete next.height;
      if (combination.provider === "runware") delete next.resolution;
    } else if (encoded) delete next[encoded.key];
    return next;
  };
  const parametersFor = (w: number, h: number): Parameters =>
    width && height
      ? { ...clean(draft.parameters), width: w, height: h }
      : { ...draft.parameters, [encoded!.key]: `${w}x${h}` };
  const presets = custom
    ? pairs.filter(([w, h]) => {
        if (
          width &&
          height &&
          (
            [
              [w, width],
              [h, height],
            ] as const
          ).some(
            ([value, field]) =>
              value < (field.min ?? 0) || value > (field.max ?? Infinity) || value % (field.step ?? 1) !== 0,
          )
        )
          return false;
        const errors = combination.validate({ ...draft, parameters: parametersFor(w, h) });
        return !errors.some((error) => /width|height|size|ratio|×/i.test(error));
      })
    : [];
  const current =
    width && height
      ? draft.parameters.width && draft.parameters.height
        ? `${draft.parameters.width}x${draft.parameters.height}`
        : ""
      : encoded
        ? String(draft.parameters[encoded.key] ?? "")
        : "";
  const [sides, setSides] = useState<[string, string]>(["", ""]);
  useEffect(() => {
    const match = current.match(/^(\d+)\s*[x×*]\s*(\d+)$/);
    setSides(match ? [match[1], match[2]] : ["", ""]);
  }, [current]);
  return (
    <div className="frame-controls">
      {custom && (
        <label className="frame-presets" htmlFor={id}>
          <span>{c("preset")}</span>
          <Select
            id={id}
            value={!current ? "" : presets.some(([w, h]) => `${w}x${h}` === current) ? current : "custom"}
            onValueChange={(nextValue) => {
              if (nextValue === "custom") return;
              const parameters = nextValue
                ? parametersFor(...(nextValue.split("x").map(Number) as [number, number]))
                : clean(draft.parameters);
              onChange({ ...draft, parameters });
            }}
          >
            <option value="">{c("automatic")}</option>
            {presets.map(([w, h]) => (
              <option key={`${w}x${h}`} value={`${w}x${h}`}>
                {w} × {h}
              </option>
            ))}
            <option value="custom" disabled>
              {c("custom")}
            </option>
          </Select>
        </label>
      )}
      {width && height ? (
        <div className="frame-dimensions">
          <ParameterField {...props} field={width} onChange={(next) => updateField("width", next)} />
          <span aria-hidden="true">×</span>
          <ParameterField {...props} field={height} onChange={(next) => updateField("height", next)} />
        </div>
      ) : null}
      {encoded ? (
        <div className="frame-dimensions">
          {["width", "height"].map((key, index) => {
            return (
              <label key={key}>
                <span>{key === "width" ? "W" : "H"}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={sides[index]}
                  required={sides.some(Boolean)}
                  placeholder={c("automatic")}
                  onChange={(event) => {
                    const next: [string, string] = [...sides];
                    next[index] = event.target.value;
                    setSides(next);
                    const parameters = { ...draft.parameters };
                    if (next.every(Boolean)) {
                      parameters[encoded.key] = next.join("x");
                      onChange({ ...draft, parameters });
                    } else if (next.every((side) => !side)) {
                      delete parameters[encoded.key];
                      onChange({ ...draft, parameters });
                    }
                  }}
                />
              </label>
            );
          })}
        </div>
      ) : null}
      {encoded ? (
        <details className="encoded-size">
          <summary>{c("custom")}</summary>
          <ParameterField {...props} field={encoded} />
        </details>
      ) : null}
      {fields
        .filter((field) => field !== width && field !== height && field !== encoded)
        .map((field) => (
          <ParameterField key={field.key} {...props} field={field} onChange={(next) => updateField(field.key, next)} />
        ))}
    </div>
  );
}
