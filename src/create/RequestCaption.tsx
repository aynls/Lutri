import { useId, useLayoutEffect, useRef, useState } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { c } from "./messages";

export function RequestCaption({ prompt }: { prompt: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    if (expanded) return;
    const caption = ref.current!;
    const measure = () => setOverflows(caption.scrollHeight > caption.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(caption);
    return () => observer.disconnect();
  }, [prompt, expanded]);
  const label = c(expanded ? "collapsePrompt" : "expandPrompt");
  return (
    <div className="request-caption">
      <p id={id} ref={ref} className={expanded ? "expanded" : undefined}>
        {prompt}
      </p>
      {(expanded || overflows) && (
        <button
          title={label}
          aria-label={label}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
        </button>
      )}
    </div>
  );
}
