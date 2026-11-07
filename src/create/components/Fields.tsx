import { Select } from "../../components/Select";
import { Fragment, useId, useEffect, useRef, useState } from "react";
import { DiceFiveIcon } from "@phosphor-icons/react";
import type { Json } from "../../domain/types";
import { localize, t } from "../../i18n";
import type { FieldDefinition, FormProps } from "../../models/types";
import { c } from "../messages";
import { FrameFields } from "./FrameFields";
import { RememberedDetails } from "./RememberedDetails";
import { validateFields } from "../../models/shared";
import { LayerOutputDirectory } from "./LayerOutputDirectory";

function JsonInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Json | undefined;
  onChange: (value: Json | undefined) => void;
}) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText(value === undefined ? "" : JSON.stringify(value, null, 2));
    setInvalid(false);
    input.current?.setCustomValidity("");
  }, [value]);
  return (
    <textarea
      id={id}
      ref={input}
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        setText(event.target.value);
        try {
          if (event.target.value) JSON.parse(event.target.value);
          event.target.setCustomValidity("");
          setInvalid(false);
        } catch {
          event.target.setCustomValidity("JSON");
          setInvalid(true);
        }
      }}
      onBlur={(event) => {
        if (event.target.checkValidity()) onChange(text ? (JSON.parse(text) as Json) : undefined);
        else event.target.reportValidity();
      }}
    />
  );
}

export function ParameterField({
  field,
  draft,
  onChange,
}: Pick<FormProps, "draft" | "onChange"> & { field: FieldDefinition }) {
  const id = useId();
  if (field.visible && !field.visible(draft)) return null;
  const value = draft.parameters[field.key] ?? (field.allowDefault === false ? field.default : undefined);
  const errors = validateFields([field], draft);
  const update = (next: typeof value | undefined) => {
    const parameters = { ...draft.parameters };
    if (next === undefined) delete parameters[field.key];
    else parameters[field.key] = next;
    onChange({ ...draft, parameters });
  };
  return (
    <div
      className={`field field-${field.kind}${errors.length ? " has-error" : ""}`}
      data-field={field.key}
      role="group"
      aria-invalid={!!errors.length || undefined}
      aria-describedby={errors.length ? `${id}-error` : undefined}
    >
      <label id={field.kind === "toggle" ? id : undefined} htmlFor={field.kind === "toggle" ? undefined : id}>
        {localize(field.label)}
      </label>
      {field.kind === "select" && field.options?.length === 1 ? (
        <span className="fixed-field-value">
          {String(value ?? field.options[0])}
          <button type="button" onClick={() => update(field.options![0])} disabled={value === field.options[0]}>
            {t("reset")}
          </button>
        </span>
      ) : field.kind === "select" ? (
        <Select
          id={id}
          value={String(value ?? (field.options?.includes("auto") ? "auto" : ""))}
          onValueChange={(nextValue) => update(nextValue || undefined)}
        >
          {!field.options?.includes("auto") && <option value="">{t("automatic")}</option>}
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {field.optionLabels?.[option] ? localize(field.optionLabels[option]) : option}
            </option>
          ))}
        </Select>
      ) : field.kind === "seed" ? (
        <div className="field-inline">
          <input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            value={value === undefined ? "" : String(value)}
            placeholder={t("random")}
            onChange={(event) => update(event.target.value === "" ? undefined : Number(event.target.value))}
          />
          <button
            type="button"
            title={t("newSeed")}
            aria-label={t("newSeed")}
            onClick={() => update(Math.floor(Math.random() * ((field.max ?? 2147483647) + 1)))}
          >
            <DiceFiveIcon size={16} />
          </button>
        </div>
      ) : field.kind === "toggle" ? (
        <div className="segmented-control" role="group" aria-labelledby={id}>
          {(field.allowDefault === false ? [true, false] : [undefined, true, false]).map((option) => (
            <button key={String(option)} type="button" aria-pressed={value === option} onClick={() => update(option)}>
              {t(option === undefined ? "automatic" : option ? "enabled" : "disabled")}
            </button>
          ))}
        </div>
      ) : field.kind === "json" ? (
        <JsonInput id={id} value={value} onChange={update} />
      ) : (
        <input
          id={id}
          type={field.kind === "number" ? "number" : "text"}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          maxLength={field.maxLength}
          value={value === undefined ? "" : String(value)}
          placeholder={t("automatic")}
          onChange={(event) =>
            update(
              event.target.value === ""
                ? undefined
                : field.kind === "number"
                  ? Number(event.target.value)
                  : event.target.value,
            )
          }
        />
      )}
      {!!errors.length && (
        <small className="field-error error-text" id={`${id}-error`}>
          {errors[0]}
        </small>
      )}
    </div>
  );
}

export function ParameterFields(props: FormProps) {
  const visible = props.combination.fields.filter((field) => !field.visible || field.visible(props.draft));
  const groups = props.combination.groups ?? [{ id: "generation" as const, fields: visible.map((field) => field.key) }];
  const assigned = new Set(groups.flatMap((group) => [...group.fields]));
  const remaining = visible.filter((field) => !assigned.has(field.key));
  const allGroups = remaining.length
    ? [...groups, { id: "advanced" as const, collapsed: true, fields: remaining.map((field) => field.key) }]
    : groups;
  const render = (field: FieldDefinition) => (
    <Fragment key={`${props.combination.id}:${field.key}`}>
      <ParameterField field={field} draft={props.draft} onChange={props.onChange} />
      {field.key === "layer_decomposition" && props.draft.parameters.layer_decomposition === true && (
        <LayerOutputDirectory draft={props.draft} onChange={props.onChange} />
      )}
    </Fragment>
  );
  return (
    <div className="parameter-sections">
      {allGroups.map((group) => {
        const fields = group.fields.flatMap((key) => visible.find((field) => field.key === key) ?? []);
        if (!fields.length) return null;
        return (
          <RememberedDetails
            key={`${props.combination.id}:${group.id}`}
            name={`${props.combination.id}.${group.id}`}
            title={c(group.id)}
            defaultOpen={!group.collapsed}
          >
            {group.id === "frame" ? (
              <FrameFields {...props} fields={fields} />
            ) : (
              <div className="parameter-fields">
                {group.id === "style" && fields.some((field) => field.key === "style_id") ? props.styleControl : null}
                {fields.map(render)}
              </div>
            )}
          </RememberedDetails>
        );
      })}
    </div>
  );
}
