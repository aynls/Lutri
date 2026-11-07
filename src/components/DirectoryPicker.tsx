import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpenIcon, XIcon } from "@phosphor-icons/react";
import { t } from "../i18n";
import "./directory-picker.css";

interface Props {
  id?: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (directory: string) => void;
  onError: (error: unknown) => void;
}

export function DirectoryPicker(props: Props) {
  const latest = useRef(props);
  const mounted = useRef(false);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const choose = async () => {
    setChoosing(true);
    try {
      const path = await open({ directory: true, defaultPath: props.value || undefined });
      if (mounted.current && typeof path === "string") latest.current.onChange(path);
    } catch (error) {
      if (mounted.current) latest.current.onError(error);
    } finally {
      if (mounted.current) setChoosing(false);
    }
  };
  return (
    <div className="button-row directory-picker">
      <button
        id={props.id}
        type="button"
        className="folder-button"
        disabled={props.disabled || choosing}
        aria-invalid={props.invalid || undefined}
        title={props.value || undefined}
        onClick={() => void choose()}
      >
        <FolderOpenIcon />
        {props.value || t("specifySavePath")}
      </button>
      {props.value && (
        <button
          type="button"
          disabled={props.disabled || choosing}
          title={t("clearDestination")}
          aria-label={t("clearDestination")}
          onClick={() => props.onChange("")}
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
