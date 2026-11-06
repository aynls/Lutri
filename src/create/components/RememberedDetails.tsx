import { useState, type ReactNode } from "react";

export function RememberedDetails({
  name,
  title,
  children,
  defaultOpen = false,
  className = "",
}: {
  name: string;
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const key = `lutri.creation.section.${name}`;
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultOpen : stored === "true";
  });
  return (
    <details
      className={`creation-section ${className}`}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        localStorage.setItem(key, String(event.currentTarget.open));
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  );
}
