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
  favorite: boolean;
  boardIds: string[];
  bytes?: number;
  tags?: string[];
  availability?: "available" | "missing" | "unknown";
  provenance?: { kind: "generation" | "import" | "upscale"; model?: string; provider?: string; taskId?: string };
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
}

export type TaskStatus =
  | "queued"
  | "submitting"
  | "submission-unknown"
  | "generating"
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
}

export interface GenerationBatch {
  id: string;
  createdAt: number;
  origin: "manual" | "mcp";
  taskIds: string[];
}

/** Removing a feed slot never removes its task or result. */
export interface FeedSlot {
  id: string;
  taskId: string;
  resultIndex: number;
}

export interface CleanupPolicy {
  enabled: boolean;
  capacity: number;
}
