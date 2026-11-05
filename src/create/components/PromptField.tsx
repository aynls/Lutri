import { SparkleIcon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import type { GenerationDraft, ImageReference } from "../../domain/types";
import { insertReference } from "../../domain/references";
import { t } from "../../i18n";

function serialize(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node instanceof HTMLElement && node.dataset.referenceId) return `[[ref:${node.dataset.referenceId}]]`;
  if (node.nodeName === "BR") return "\n";
  return Array.from(node.childNodes).map(serialize).join("");
}
function pill(id: string, name: string, missing = false) {
  const span = document.createElement("span");
  span.dataset.referenceId = id;
  span.contentEditable = "false";
  span.className = `prompt-reference${missing ? " missing-reference" : ""}`;
  span.textContent = name;
  return span;
}
export function PromptField({
  draft,
  onChange,
  onWriters,
}: {
  draft: GenerationDraft;
  onChange: (draft: GenerationDraft) => void;
  onWriters: () => void;
}) {
  const input = useRef<HTMLDivElement>(null),
    selection = useRef<Range | null>(null);
  const publish = () => {
    if (input.current) onChange({ ...draft, prompt: serialize(input.current) });
  };
  const remember = () => {
    const current = window.getSelection();
    if (current?.rangeCount && input.current?.contains(current.anchorNode))
      selection.current = current.getRangeAt(0).cloneRange();
  };
  useLayoutEffect(() => {
    const editor = input.current;
    if (!editor) return;
    if (serialize(editor) !== draft.prompt) {
      editor.replaceChildren();
      let cursor = 0;
      for (const match of draft.prompt.matchAll(/\[\[ref:([^\]]+)\]\]/g)) {
        editor.append(document.createTextNode(draft.prompt.slice(cursor, match.index)));
        const reference = draft.references.find((ref) => ref.id === match[1]);
        editor.append(pill(match[1], reference?.name ?? t("missing"), !reference));
        cursor = match.index! + match[0].length;
      }
      editor.append(document.createTextNode(draft.prompt.slice(cursor)));
      selection.current = null;
    }
    for (const node of editor.querySelectorAll<HTMLElement>("[data-reference-id]")) {
      const reference = draft.references.find((ref) => ref.id === node.dataset.referenceId);
      node.textContent = reference?.name ?? t("missing");
      node.classList.toggle("missing-reference", !reference);
    }
  }, [draft.prompt, draft.references]);
  const insert = (reference: ImageReference) => {
    const editor = input.current;
    if (!editor) return;
    editor.focus();
    const savedSelection = selection.current;
    const validSelection = savedSelection && editor.contains(savedSelection.startContainer);
    const range = validSelection ? savedSelection : document.createRange();
    if (!validSelection) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const token = pill(reference.id, reference.name);
    range.insertNode(token);
    range.setStartAfter(token);
    range.collapse(true);
    const current = window.getSelection();
    current?.removeAllRanges();
    current?.addRange(range);
    remember();
    publish();
  };
  return (
    <section className="prompt-field">
      <div className="section-heading">
        <label id="prompt-label">{t("prompt")}</label>
        <button className="writer-launch" onClick={onWriters}>
          <SparkleIcon size={14} />
          {t("writers")}
        </button>
      </div>
      <div
        className="prompt-editor"
        data-placeholder={t("promptPlaceholder")}
        ref={input}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby="prompt-label"
        onInput={publish}
        onKeyUp={remember}
        onMouseUp={remember}
        onBlur={remember}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            document.execCommand("insertText", false, "\n");
            publish();
          }
        }}
        onPaste={(event) => {
          if (event.clipboardData.files.length) return;
          event.preventDefault();
          document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
          publish();
        }}
      />
      <div className="reference-tokens">
        {draft.references.map((reference) => (
          <button
            key={reference.id}
            title={insertReference(reference)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(reference)}
          >
            {reference.name}
          </button>
        ))}
      </div>
    </section>
  );
}
