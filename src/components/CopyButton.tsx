import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { t } from "../i18n";

export function CopyButton({
  value,
  title = t("copyId"),
  label,
  className,
  onError,
}: {
  value: string;
  title?: string;
  label?: string;
  className?: string;
  onError: (error: unknown) => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={className}
      title={copied ? t("copied") : title}
      aria-label={copied ? t("copied") : title}
      onClick={() =>
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1800);
          })
          .catch(onError)
      }
    >
      {label ? (copied ? t("copied") : label) : copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}
