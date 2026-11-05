import { useId, useEffect, useState } from "react";
import type { Json } from "../../domain/types";
import { localize, t } from "../../i18n";
import type { FieldDefinition, FormProps } from "../../models/types";

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
  useEffect(() => setText(value === undefined ? "" : JSON.stringify(value, null, 2)), [value]);
  return (
    <textarea
      id={id}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        try {
          if (event.target.value) JSON.parse(event.target.value);
          event.target.setCustomValidity("");
        } catch {
          event.target.setCustomValidity("JSON");
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
  const value = draft.parameters[field.key];
  const update = (next: typeof value | undefined) => {
    const parameters = { ...draft.parameters };
    if (next === undefined) delete parameters[field.key];
    else parameters[field.key] = next;
    onChange({ ...draft, parameters });
  };
  return (
    <div className={`field field-${field.kind}`}>
      <label id={field.kind === "toggle" ? id : undefined} htmlFor={field.kind === "toggle" ? undefined : id}>
        {localize(field.label)}
      </label>
      {field.kind === "select" ? (
        <select id={id} value={String(value ?? "")} onChange={(event) => update(event.target.value || undefined)}>
          <option value="">{t("automatic")}</option>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.kind === "toggle" ? (
        <div className="segmented-control" role="group" aria-labelledby={id}>
          {([undefined, true, false] as const).map((option) => (
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
    </div>
  );
}

export function ParameterFields(props: FormProps) {
  return (
    <div className="parameter-fields">
      {props.combination.fields.map((field) => (
        <ParameterField
          key={`${props.combination.id}:${field.key}`}
          field={field}
          draft={props.draft}
          onChange={props.onChange}
        />
      ))}
    </div>
  );
}
