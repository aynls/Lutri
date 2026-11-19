import { t } from "../i18n";
import { c } from "./messages";

export function revealControl(control: HTMLElement) {
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.querySelector(":scope > summary")?.contains(control))
      parent.open = true;
  }
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: "nearest" });
}

export function focusCreationIssue(issue: string, key?: string) {
  const fields = Array.from(document.querySelectorAll<HTMLElement>(".creation-panel [data-field]"));
  const byKey = (key: string) => fields.find((field) => field.dataset.field === key);
  const inline = fields.find((field) => field.querySelector(".field-error")?.textContent === issue);
  const labeled = fields.find((field) => {
    const label = field.dataset.label ?? field.querySelector("label")?.textContent;
    return label && (issue === label || [":", "：", " "].some((separator) => issue.startsWith(label + separator)));
  });
  // Provider diagnostics use native parameter names. Match complete tokens (including single-letter keys like n).
  const tokens: string[] = issue.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  const named = tokens.map(byKey).find(Boolean);
  const related: Record<string, string> = {
    [t("saveDirectoryRequired")]: "autoSave",
    [c("chooseEditTarget")]: byKey("editTargetId") ? "editTargetId" : "references",
    [c("invalidImageContext")]: "context",
    [c("maskNeedsEdit")]: "creationMode",
    [c("maskTargetMismatch")]: "editTargetId",
    [c("tooMany")]: "references",
    [c("singleEditImage")]: "references",
    [c("singleLayerSource")]: "references",
    [c("unsupportedPurpose")]: "references",
    [c("styleInputConflict")]: "style_id",
    [c("styleReferenceRequired")]: "references",
    [c("styleNeedsGenerate")]: "creationMode",
    [t("regionNameError")]: "regions",
  };
  let field = byKey(key ?? "") ?? inline ?? labeled ?? named ?? byKey(related[issue]);
  if (!field && tokens.includes("transparent")) field = byKey("background");
  if (
    !field &&
    (tokens.some((key) => ["width", "height", "size"].includes(key)) || issue.includes(c("invalidDimensions")))
  )
    field = byKey("size") ?? byKey("image_size") ?? byKey("framePreset");
  if (!field) return;
  const controls = 'input:not([type="hidden"]),textarea,button:not(:disabled),[contenteditable="true"],summary';
  const control = field.matches(controls)
    ? field
    : (field.querySelector<HTMLElement>(`[aria-invalid="true"]:is(${controls})`) ??
      field.querySelector<HTMLElement>(controls));
  if (control) revealControl(control);
}
