import { t } from "../i18n";
import { native } from "./native";
import { flushWrites, getState, inUseAssetIds, refreshGallery } from "./store";

export interface CleanupReport {
  deleted: string[];
  skipped: { id: string; reason: string }[];
  errors: { id: string; message: string }[];
}

let cleaning: Promise<void> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

function runCleanup(): Promise<void> {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const policy = getState().preferences.localCleanup;
    if (policy === undefined) return;
    if (
      policy === null ||
      typeof policy.enabled !== "boolean" ||
      !Number.isInteger(policy.retentionDays) ||
      policy.retentionDays < 1 ||
      policy.retentionDays > 3650
    )
      throw new Error(t("invalidCleanup"));
    if (!policy.enabled) return;
    await flushWrites();
    const report = await native<CleanupReport>("local_files_cleanup", { keepIds: inUseAssetIds() });
    if (report.deleted.length || report.errors.length) await refreshGallery();
    if (report.errors.length) throw new Error(report.errors.map((entry) => `${entry.id}: ${entry.message}`).join("\n"));
  })().finally(() => {
    cleaning = undefined;
  });
  return cleaning;
}

export function startLocalCleanup(onError: (error: unknown) => void) {
  if (timer) return () => {};
  const run = () => void runCleanup().catch(onError);
  run();
  timer = setInterval(run, 3_600_000);
  return () => {
    clearInterval(timer);
    timer = undefined;
  };
}
