import { label, localize, t } from "./index";
import type { TaskStatus } from "../domain/types";

const messages = {
  cancelled: label("Cancelled", "已取消", "キャンセル済み"),
  stopQueued: label("Stop queued", "停止剩余", "待機分を停止"),
  deleteSelected: label("Delete selected", "删除所选", "選択を削除"),
  deleteHistory: label("Delete history", "删除历史", "履歴を削除"),
  deleteConfirmation: label(
    "Delete these records? Recoverable tasks may lose their recovery entry. Images are kept.",
    "删除这些记录？可恢复任务可能失去恢复入口。图片将保留。",
    "履歴を削除しますか？未取得の結果を復旧できなくなる場合があります。画像は保持されます。",
  ),
  deletable: label("Can delete", "可删除", "削除可能"),
  skipped: label("Skipped", "跳过", "対象外"),
  providerTask: label("Provider task ID", "供应商任务 ID", "プロバイダーのタスク ID"),
  usage: label("Usage", "用量", "使用量"),
  inputTokens: label("Input tokens", "输入 token", "入力トークン"),
  outputTokens: label("Output tokens", "输出 token", "出力トークン"),
  totalTokens: label("Total tokens", "总 token", "合計トークン"),
  seed: label("Returned seed", "实际 seed", "実際の seed"),
  requestedSeed: label("Requested seed", "请求 seed", "指定 seed"),
  cost: label("Cost", "费用", "料金"),
  credits: label("Credits", "积分", "クレジット"),
  partialUsage: label("Partial usage", "部分用量", "一部の使用量"),
  diagnostics: label("Provider error", "供应商错误", "プロバイダーエラー"),
  select: label("Select", "选择", "選択"),
  retryExport: label("Retry export", "重试导出", "書き出しを再試行"),
  selecting: label("Selected", "已选", "選択済み"),
  relatedImage: label("Related image", "关联图片", "関連画像"),
  exitRelated: label("Exit related view", "退出关联查询", "関連表示を終了"),
  backToSource: label("Back to source", "返回来源", "元の画面に戻る"),
} as const;
export const taskText = (key: keyof typeof messages) => localize(messages[key]);
export const taskStatusLabel = (status: TaskStatus | "missing") =>
  status === "cancelled" ? taskText("cancelled") : t(status);
