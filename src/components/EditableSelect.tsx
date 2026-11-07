import { useState, type ComponentPropsWithoutRef } from "react";
import { Select } from "./Select";
import "./editable-select.css";

type EditableSelectProps = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange" | "defaultValue"> & {
  value: string;
  suggestions: readonly { value: string; label: string }[];
  defaultLabel: string;
  menuLabel: string;
  onValueChange: (value: string) => void;
};

export function EditableSelect({
  value,
  suggestions,
  defaultLabel,
  menuLabel,
  onValueChange,
  disabled,
  ...props
}: EditableSelectProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const selected = suggestions.find((suggestion) => suggestion.value === value);
  return (
    <div className="editable-select">
      <input
        {...props}
        value={editing ? value : (selected?.label ?? value)}
        disabled={disabled}
        placeholder={defaultLabel}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (!event.nativeEvent.isComposing && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      <Select
        className="editable-select-trigger"
        aria-label={menuLabel}
        title={menuLabel}
        disabled={disabled}
        value={value}
        open={open}
        onOpenChange={setOpen}
        onValueChange={onValueChange}
      >
        <option value="">{defaultLabel}</option>
        {suggestions.map((suggestion) => (
          <option key={suggestion.value} value={suggestion.value}>
            {suggestion.label}
          </option>
        ))}
        {value && !selected ? (
          <option value={value} hidden>
            {value}
          </option>
        ) : null}
      </Select>
    </div>
  );
}
