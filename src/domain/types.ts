export type AssetId = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Parameters = Record<string, Json>;

/** File location and library membership belong to GalleryEntry, not Asset. */
export interface Asset {
  id: AssetId;
  mediaType: string;
  width: number;
  height: number;
}

export interface StoredImage {
  asset: Asset;
  path: string;
  thumbnailPath: string;
}

export interface GalleryEntry extends StoredImage {
  source: "generated" | "imported";
  addedAt: number;
  staged?: boolean;
  /** Saved result outside the gallery; still addressable from feed and history. */
  unlisted?: boolean;
  unprotectedSince?: number;
  favorite: boolean;
  boardIds: string[];
  bytes?: number;
  tags?: string[];
  availability?: "available" | "missing" | "unknown";
  provenance?: {
    kind: "generation" | "import" | "upscale";
    model?: string;
    provider?: string;
    taskId?: string;
    sourceAssetId?: string;
    scale?: number;
    tileSize?: number;
  };
}

export interface Board {
  id: string;
  name: string;
}

/** The same asset can occur twice with distinct reference identities. */
export interface ImageReference {
  id: string;
  assetId: AssetId;
  name: string;
  purpose: "reference" | "style" | "subject";
}

export type Rectangle = [top: number, left: number, bottom: number, right: number];

export interface Region {
  id: string;
  description: string;
  operation?: "place" | "move" | "anchor" | "remove";
  referenceId?: string;
  source?: Rectangle;
  target?: Rectangle;
}

export interface MaskBinding {
  assetId: AssetId;
  referenceId: string;
}

export interface GenerationDraft {
  combinationId: string;
  /** Omitted on older records: preserve the original input-driven routing. */
  creationMode?: "auto" | "generate" | "edit";
  editTargetId?: string;
  prompt: string;
  references: ImageReference[];
  regions: Region[];
  mask?: MaskBinding;
  parameters: Parameters;
  requestCount: number;
  inputPreparation?: { maxEdge?: number; version: 1 };
  layerOutputDirectory?: string;
  /** Automatic copy destination captured when this request is submitted. */
  outputDirectory?: string;
}

export type TaskStatus =
  | "queued"
  | "submitting"
  | "submission-unknown"
  | "generating"
  | "retrieval-failed"
  | "downloading"
  | "download-failed"
  | "completed"
  | "cancelled"
  | "failed";

export interface Recovery {
  remoteId: string;
  statusUrl?: string;
  resultUrl?: string;
  metadata?: Parameters;
  transientCount?: number;
}

/** Transient download inputs, removed after layers are exported and the composite is saved. */
export interface LayerSource {
  url: string;
  zIndex: number;
  bounds?: number[];
  normalizedBounds?: number[];
  name?: string;
  description?: string;
}

export interface GenerationResult {
  id: string;
  remoteId?: string;
  index: number;
  url?: string;
  assetId?: AssetId;
  mediaType?: string;
  status: "pending" | "downloading" | "saved" | "failed";
  error?: string;
  metadata?: Parameters;
  exportError?: string;
  layerSources?: LayerSource[];
  layerDelivery?: {
    status: "pending" | "failed" | "completed";
    compositePath?: string;
    psdPath?: string;
    error?: string;
  };
}

export interface GenerationTask {
  id: string;
  batchId: string;
  createdAt: number;
  updatedAt: number;
  draft: GenerationDraft;
  status: TaskStatus;
  recovery?: Recovery;
  awaitingResults?: boolean;
  feedPublishedThrough?: number;
  results: GenerationResult[];
  error?: string;
  metadata?: Parameters;
  compiledPrompt?: string;
  submittedAt?: number;
  httpStatus?: number;
  providerTaskId?: string;
  historyDeletedAt?: number;
  cloudGroupId?: string;
  draftItemId?: string;
}

export interface GenerationBatch {
  id: string;
  createdAt: number;
  origin: "manual" | "mcp";
  taskIds: string[];
  mcpRequest?: { id: string; fingerprint: string };
  cloud?: { items: BatchDraftItem[]; groups: CloudBatchGroup[] };
}

export type CreationMode = "regular" | "batch";
export interface BatchDraftItem {
  id: string;
  draft: GenerationDraft;
}
export interface CreationWorkspace {
  mode: CreationMode;
  items: BatchDraftItem[];
  regular?: GenerationDraft;
  batch?: GenerationDraft;
  editing?: { id: string; returnDraft: GenerationDraft };
}
export type CloudBatchStatus =
  | "prepared"
  | "uploading"
  | "submitting"
  | "submission-unknown"
  | "submission-failed"
  | "queued"
  | "running"
  | "cancelling"
  | "retrieving"
  | "retrieval-failed"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";
export interface CloudBatchGroup {
  id: string;
  provider: "google" | "openai";
  model: string;
  endpoint: string;
  taskIds: string[];
  status: CloudBatchStatus;
  remoteId?: string;
  inputFileId?: string;
  outputFileIds?: string[];
  remoteState?: string;
  processed?: number;
  failed?: number;
  error?: string;
  updatedAt: number;
}

/** Removing a feed slot never removes its task or result. */
export interface FeedSlot {
  id: string;
  taskId: string;
  resultIndex: number;
}
