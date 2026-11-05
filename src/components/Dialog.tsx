import { useEffect, useId, useRef, type ReactNode, type KeyboardEventHandler } from "react";
import { XIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export function Dialog({
  title,
  children,
  footer,
  onClose,
  className = "",
  onKeyDown,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDialogElement>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`studio-dialog ${className}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("dialog") === event.currentTarget) onKeyDown?.(event);
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button onClick={onClose} aria-label={t("close")}>
          <XIcon size={18} />
        </button>
      </header>
      <div className="dialog-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}
