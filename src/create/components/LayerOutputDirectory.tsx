import { useId, useState } from "react";
import { DirectoryPicker } from "../../components/DirectoryPicker";
import type { FormProps } from "../../models/types";
import { c } from "../messages";

export function LayerOutputDirectory(props: Pick<FormProps, "draft" | "onChange">) {
  const id = useId();
  const [error, setError] = useState("");
  const directory = props.draft.layerOutputDirectory ?? "";
  const missing = !directory.trim();
  return (
    <div className={`field field-text${missing || error ? " has-error" : ""}`} data-field="layerOutputDirectory">
      <label htmlFor={id}>{c("layerDirectory")}</label>
      <DirectoryPicker
        id={id}
        value={directory}
        invalid={missing}
        onError={(value) => setError(String(value))}
        onChange={(selected) => {
          setError("");
          props.onChange({ ...props.draft, layerOutputDirectory: selected });
        }}
      />
      {(missing || error) && <small className="field-error error-text">{error || c("layerDirectoryRequired")}</small>}
    </div>
  );
}
