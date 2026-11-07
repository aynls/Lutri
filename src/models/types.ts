import type { ComponentType, ReactNode } from "react";
import type { GenerationDraft, Json, Parameters, Recovery } from "../domain/types";

export type ProviderId =
  | "bfl"
  | "fal"
  | "openai"
  | "openrouter"
  | "runware"
  | "comfy"
  | "google"
  | "qwencloud"
  | "ark"
  | "byteplus"
  | "xai"
  | "azure"
  | "meta"
  | "recraft"
  | "ideogram";
export type Protocol = "bfl" | "fal" | "runware" | "images" | "qwen" | "gemini" | "interactions" | "ideogram";
export type Localized = { en: string; zh: string; ja: string };

export interface FieldDefinition {
  key: string;
  label: Localized;
  kind: "text" | "number" | "select" | "toggle" | "json" | "size" | "seed";
  options?: readonly string[];
  /** Suggestions for a free-text field; values outside this list remain valid. */
  suggestions?: readonly string[];
  optionLabels?: Record<string, Localized>;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  maxLength?: number;
  default?: Json;
  allowDefault?: boolean;
  advanced?: boolean;
  visible?: (draft: GenerationDraft) => boolean;
}

export interface ParameterGroup {
  id: "frame" | "generation" | "style" | "output" | "advanced";
  fields: readonly string[];
  collapsed?: boolean;
}

/** Constraints copied from the combination's documented input schema, never output-size fields. */
export interface InputPolicy {
  minEdge?: number;
  maxEdge?: number;
  minPixels?: number;
  maxPixels?: number;
  maxRatio?: number;
  maxBytes?: number;
  maxEncodedBytes?: number;
  totalBytes?: number;
  maskBytes?: number;
  mediaTypes?: readonly string[];
  opaque?: boolean;
}

export interface FormProps {
  combination: ModelCombination;
  draft: GenerationDraft;
  onChange: (draft: GenerationDraft) => void;
  /** App-owned controls keep model forms independent of application state. */
  styleControl?: ReactNode;
}

export interface CompiledRequest {
  url: string;
  method: "POST" | "GET";
  provider: ProviderId | string;
  authHeader: string;
  authPrefix: string;
  headers?: Record<string, string>;
  body?: Json;
  multipart?: { name: string; text?: string; dataUrl?: string; fileName?: string }[];
}

export interface CompileContext {
  draft: GenerationDraft;
  prompt: string;
  images: string[];
  mask?: string;
  taskId: string;
  configuration: { endpoint?: string; deployment?: string };
}

export interface ModelCombination {
  id: string;
  family: string;
  model: string;
  label: string;
  provider: ProviderId;
  protocol: Protocol;
  maxReferences: number;
  mask?: "alpha" | "white" | "black";
  regions?: "prompt" | "runware" | "fal" | "seedream";
  fields: FieldDefinition[];
  groups?: ParameterGroup[];
  primaryReference?: boolean;
  /** Opt-in creation intent: prompt guidance, native style inputs, or Gemini context. */
  creationControl?: "prompt" | "style" | "context";
  promptLimit?: { min?: number; max: number };
  inputPolicy?: InputPolicy | ((draft: GenerationDraft) => InputPolicy);
  Form: ComponentType<FormProps>;
  docs: string[];
  validate: (draft: GenerationDraft) => string[];
  compile: (context: CompileContext) => CompiledRequest;
  initialRecovery?: (taskId: string) => Recovery;
  outputCount: (parameters: Parameters) => number;
}
