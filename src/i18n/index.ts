import { useSyncExternalStore } from "react";
import type { Localized } from "../models/types";

export type Locale = "en" | "zh" | "ja";
export type LocalePreference = Locale | "system";
const resolve = (choice: LocalePreference): Locale => {
  const language = navigator.language.toLowerCase();
  return choice === "system" ? (language.startsWith("zh") ? "zh" : language.startsWith("ja") ? "ja" : "en") : choice;
};
const readLocale = (): LocalePreference => {
  const choice = localStorage.getItem("lutri.locale");
  return choice === "en" || choice === "zh" || choice === "ja" ? choice : "system";
};
export let locale: Locale = resolve(readLocale());
const subscribers = new Set<() => void>();
export function setLocale(choice: LocalePreference) {
  localStorage.setItem("lutri.locale", choice);
  locale = resolve(choice);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  subscribers.forEach((listener) => listener());
}
export const localePreference = readLocale;
window.addEventListener("storage", (event) => {
  if (event.key === "lutri.locale") setLocale(readLocale());
});
window.addEventListener("languagechange", () => setLocale(readLocale()));
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    () => `${locale}:${readLocale()}`,
  );
}
export const localize = (value: Localized) => value[locale];
export const label = (en: string, zh: string, ja: string): Localized => ({ en, zh, ja });

const messages = {
  unsupportedMask: [
    "This model does not support masks.",
    "此模型不支持蒙版。",
    "このモデルはマスクに対応していません。",
  ],
  unsupportedRegions: [
    "This model does not support regions.",
    "此模型不支持区域。",
    "このモデルは領域指定に対応していません。",
  ],
  maskFirstReference: [
    "Move the masked reference to the first position, or remove the mask.",
    "请将蒙版对应的参考图移到首位，或移除蒙版。",
    "マスク対象の参照画像を先頭に移動するか、マスクを削除してください。",
  ],
  promptPlaceholder: ["Describe your image…", "描述想要创作的画面…", "作りたい画像を記述…"],
  enabled: ["On", "开启", "オン"],
  disabled: ["Off", "关闭", "オフ"],
  advanced: ["Advanced", "更多参数", "詳細設定"],
  editLayout: ["Edit layout", "编辑布局", "レイアウトを編集"],
  layout: ["Layout", "布局", "レイアウト"],
  drawRegion: ["Draw region", "绘制区域", "領域を描く"],
  selectTool: ["Select", "选择", "選択"],
  panTool: ["Pan", "平移", "移動"],
  brushTool: ["Brush", "画笔", "ブラシ"],
  eraserTool: ["Eraser", "橡皮", "消しゴム"],
  rectangleTool: ["Rectangle", "矩形", "矩形"],
  undo: ["Undo", "撤销", "元に戻す"],
  redo: ["Redo", "重做", "やり直す"],
  apply: ["Apply", "应用", "適用"],
  duplicate: ["Duplicate", "复制", "複製"],
  moveUp: ["Move up", "上移", "上へ"],
  moveDown: ["Move down", "下移", "下へ"],
  operation: ["Operation", "操作", "操作"],
  placeObject: ["Place / modify", "放置 / 修改", "配置 / 編集"],
  moveObject: ["Move from reference", "从参考图移动", "参照画像から移動"],
  anchorObject: ["Keep in place", "保持原位", "位置を保持"],
  removeObject: ["Remove object", "删除对象", "対象を削除"],
  pickSource: ["Select source region", "框选源区域", "参照領域を選択"],
  backgroundImage: ["Canvas background", "画布底图", "キャンバス背景"],
  noBackground: ["No background", "无底图", "背景なし"],
  opacity: ["Opacity", "不透明度", "不透明度"],
  regionName: ["Region name", "区域名称", "領域名"],
  regionNameError: [
    "Use a unique name with letters, numbers or underscores.",
    "名称须唯一，且只含字母、数字或下划线。",
    "英数字・アンダースコアで重複しない名前を指定してください。",
  ],
  drawRegionHint: ["Right-drag to draw a region", "右键拖动绘制区域", "右ドラッグで領域を描く"],
  canvasHelp: [
    "Right-drag to draw · Left-drag to edit · Scroll to zoom · Space to pan",
    "右键绘框 · 左键移动 / 缩放 · 滚轮缩放 · 空格平移",
    "右ドラッグで描画・左ドラッグで編集・ホイールで拡大・Space で移動",
  ],
  width: ["Width", "宽度", "幅"],
  height: ["Height", "高度", "高さ"],
  importMask: ["Import mask", "导入蒙版", "マスクを読み込む"],
  clearMask: ["Clear mask", "清空蒙版", "マスクをクリア"],
  invertMask: ["Invert mask", "反转蒙版", "マスクを反転"],
  brushSize: ["Brush size", "笔刷大小", "ブラシサイズ"],
  maskSizeError: [
    "Mask dimensions must match the reference image.",
    "蒙版尺寸须与参考图一致。",
    "マスクのサイズを参照画像と合わせてください。",
  ],
  resizePanel: ["Resize panel", "调整面板宽度", "パネル幅を変更"],
  copied: ["Copied", "已复制", "コピー済み"],
  copyPrompt: ["Copy prompt", "复制提示词", "プロンプトをコピー"],
  cancel: ["Cancel", "取消", "キャンセル"],
  confirm: ["Confirm", "确认", "確認"],
  selectAll: ["Select all", "全选", "すべて選択"],
  batchSelect: ["Select multiple", "批量选择", "複数選択"],
  thumbnailSize: ["Thumbnail size", "缩略图大小", "サムネイルのサイズ"],
  deselect: ["Deselect", "取消选择", "選択を解除"],
  selectedCount: ["Selected", "已选", "選択済み"],
  newest: ["Newest first", "最新优先", "新しい順"],
  oldest: ["Oldest first", "最早优先", "古い順"],
  nameOrder: ["Name", "名称", "名前"],
  searchImages: ["Search asset ID", "搜索资产 ID", "アセット ID を検索"],
  searchModels: ["Search models", "搜索模型", "モデルを検索"],
  filters: ["Filters", "筛选", "絞り込み"],
  fromDate: ["From", "起始日期", "開始日"],
  toDate: ["Until", "截止日期", "終了日"],
  orientation: ["Orientation", "画幅", "向き"],
  landscape: ["Landscape", "横向", "横長"],
  portrait: ["Portrait", "纵向", "縦長"],
  square: ["Square", "方形", "正方形"],
  reset: ["Reset", "重置", "リセット"],
  rename: ["Rename", "重命名", "名前変更"],
  deleteBoard: ["Delete board", "删除图板", "ボードを削除"],
  deleteBoardNotice: [
    "Remove this board? Images stay in the library.",
    "删除此图板？图片仍保留在图库中。",
    "このボードを削除しますか？画像はギャラリーに残ります。",
  ],
  removeFromBoard: ["Remove from board", "移出图板", "ボードから外す"],
  addToBoard: ["Add to board", "加入图板", "ボードに追加"],
  removeFavorite: ["Unfavorite", "取消收藏", "お気に入りを解除"],
  before: ["Before", "处理前", "処理前"],
  after: ["After", "处理后", "処理後"],
  fit: ["Fit", "适应窗口", "全体表示"],
  zoomIn: ["Zoom in", "放大", "拡大"],
  zoomOut: ["Zoom out", "缩小", "縮小"],
  compare: ["Compare", "前后对比", "比較"],
  viewerHelp: [
    "Scroll to zoom · Drag to pan · Double-click to fit / 100%",
    "滚轮缩放 · 拖动平移 · 双击切换适应窗口 / 100%",
    "ホイールで拡大・ドラッグで移動・ダブルクリックで全体表示 / 100%",
  ],
  reveal: ["Show in folder", "在文件夹中显示", "フォルダーに表示"],
  details: ["Details", "详情", "詳細"],
  results: ["Results", "生成结果", "生成結果"],
  activeTasks: ["Active", "进行中", "実行中"],
  allStatuses: ["All statuses", "全部状态", "すべての状態"],
  searchHistory: ["Search prompt or asset ID", "搜索提示词或资产 ID", "プロンプト・アセット ID を検索"],
  request: ["Request", "请求", "リクエスト"],
  dropImages: ["Drop images to import", "拖入图片以添加", "画像をドロップして追加"],
  chooseImages: ["Choose images", "选择图片", "画像を選択"],
  noMatches: ["No matching images", "没有匹配的图片", "一致する画像はありません"],
  single: ["Single", "单图", "単一"],
  batch: ["Batch", "批处理", "一括処理"],
  clearCompleted: ["Clear completed", "清理已完成", "完了分をクリア"],
  pauseQueue: ["Pause after this image", "完成当前图片后暂停", "この画像の後に一時停止"],
  continueQueue: ["Continue", "继续处理", "続行"],
  pendingJobs: ["Pending images", "待处理图片", "待機中の画像"],
  clearDestination: ["Clear output folder", "清除输出位置", "出力先を解除"],
  saveToGallery: ["Save to gallery", "保存到图库", "ギャラリーに保存"],
  runAgain: ["Process again", "重新处理", "再処理"],
  processing: ["Processing", "处理中", "処理中"],
  validateParameters: ["Check parameters", "检查参数", "設定を確認"],
  referencesLimit: ["Reference limit", "参考图上限", "参照画像の上限"],
  importedCount: ["Imported", "已导入", "読み込み済み"],
  exportedCount: ["Exported", "已导出", "書き出し済み"],
  creation: ["Creation", "创作", "制作"],
  upscale: ["Upscale", "超分辨率", "高解像度化"],
  gallery: ["Gallery", "图库", "ギャラリー"],
  history: ["History", "历史", "履歴"],
  settings: ["Settings", "设置", "設定"],
  prompt: ["Prompt", "提示词", "プロンプト"],
  parameters: ["Parameters", "参数", "パラメーター"],
  generate: ["Generate", "开始生成", "生成"],
  writers: ["Write", "生成提示词", "プロンプト作成"],
  referenceAlias: ["Reference", "参考图", "参照画像"],
  references: ["References", "参考图", "参照画像"],
  add: ["Add", "添加", "追加"],
  import: ["Import", "导入", "読み込む"],
  remove: ["Remove", "移除", "取り除く"],
  delete: ["Delete", "删除", "削除"],
  close: ["Close", "关闭", "閉じる"],
  back: ["Back", "返回", "戻る"],
  save: ["Save", "保存", "保存"],
  saveAs: ["Save as", "另存为", "名前を付けて保存"],
  specifySavePath: ["Specify save path", "指定另存为路径", "保存先を指定"],
  autoSave: ["Auto save as", "自动另存为", "自動で別名保存"],
  saveDirectoryRequired: ["Choose a save folder", "请选择另存为目录", "保存先フォルダーを選択してください"],
  retry: ["Resume task", "继续获取结果", "結果を再取得"],
  restore: ["Restore parameters", "恢复参数", "設定を復元"],
  requestCount: ["Requests", "请求次数", "リクエスト数"],
  model: ["Model", "模型", "モデル"],
  provider: ["Provider", "供应商", "プロバイダー"],
  automatic: ["Default", "默认", "既定"],
  all: ["All images", "全部", "すべて"],
  generated: ["Generated", "生成结果", "生成画像"],
  imported: ["References", "参考素材", "参照素材"],
  favorites: ["Favorites", "收藏", "お気に入り"],
  boards: ["Boards", "图板", "ボード"],
  newBoard: ["New board", "新建图板", "新規ボード"],
  boardName: ["Board name", "图板名", "ボード名"],
  boardNameTaken: ["A board with this name already exists.", "已存在同名图板。", "同名のボードが既に存在します。"],
  search: ["Search asset ID", "搜索资产 ID", "アセット ID を検索"],
  empty: ["No images yet", "暂无图片", "画像はありません"],
  emptyHistory: ["No matching batches", "暂无匹配批次", "一致するバッチはありません"],
  clear: ["Clear feed", "清理瀑布流", "一覧をクリア"],
  copyId: ["Copy asset ID", "复制资产 ID", "アセット ID をコピー"],
  related: ["Find related history", "查找相关历史", "関連履歴を検索"],
  useReference: ["Use as reference", "用作参考图", "参照画像に使用"],
  missing: ["Image unavailable", "图片不可用", "画像を利用できません"],
  missingWarning: [
    "Some references are unavailable. Continue?",
    "部分参考图缺失，是否继续？",
    "一部の参照画像がありません。続行しますか？",
  ],
  confirmDelete: ["Delete selected images?", "删除选中的图片？", "選択した画像を削除しますか？"],
  confirmDeleteImage: ["Delete this image?", "删除这张图片？", "この画像を削除しますか？"],
  key: ["API key", "API 密钥", "API キー"],
  connected: ["Configured", "已配置", "設定済み"],
  notConnected: ["Not configured", "未配置", "未設定"],
  endpoint: ["Endpoint", "接口地址", "エンドポイント"],
  deployment: ["Deployment", "部署名称", "デプロイ名"],
  system: ["System", "跟随系统", "システム"],
  cleanup: ["Automatic cleanup", "自动清理", "自動整理"],
  capacity: ["Image capacity", "图片容量", "画像上限"],
  regions: ["Regions", "区域", "領域"],
  description: ["Description", "描述", "説明"],
  source: ["Source", "来源", "ソース"],
  target: ["Target", "目标", "ターゲット"],
  mask: ["Mask", "蒙版", "マスク"],
  queued: ["Queued", "等待提交", "待機中"],
  submitting: ["Submitting", "提交中", "送信中"],
  "submission-unknown": ["Submission unknown", "提交结果未知", "送信結果不明"],
  generating: ["Generating", "生成中", "生成中"],
  downloading: ["Downloading", "下载中", "ダウンロード中"],
  "download-failed": ["Download failed", "下载失败", "ダウンロード失敗"],
  completed: ["Completed", "已完成", "完了"],
  cancelled: ["Cancelled", "已取消", "キャンセル済み"],
  failed: ["Failed", "生成失败", "失敗"],
  pending: ["Pending", "等待中", "待機中"],
  saved: ["Saved", "已保存", "保存済み"],
  random: ["Random", "随机", "ランダム"],
  newSeed: ["New seed", "换一个", "別の値"],
  editTarget: ["Edit target", "编辑主图", "編集対象"],
  imageCount: ["images", "张", "枚"],
  requestPreview: ["Request preview", "请求预览", "リクエスト確認"],
} as const;

export type MessageKey = keyof typeof messages;
export function t(key: MessageKey): string {
  return messages[key][locale === "en" ? 0 : locale === "zh" ? 1 : 2];
}
