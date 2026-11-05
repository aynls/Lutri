import type { ComponentType } from "react";
import type { GenerationDraft, Json, Parameters, Recovery } from "../domain/types";

export type ProviderId =
  | "bfl"
  | "fal"
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
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  maxLength?: number;
  default?: Json;
  advanced?: boolean;
  visible?: (draft: GenerationDraft) => boolean;
}

export interface FormProps {
  combination: ModelCombination;
  draft: GenerationDraft;
  onChange: (draft: GenerationDraft) => void;
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
  Form: ComponentType<FormProps>;
  docs: string[];
  validate: (draft: GenerationDraft) => string[];
  compile: (context: CompileContext) => CompiledRequest;
  initialRecovery?: (taskId: string) => Recovery;
  outputCount: (parameters: Parameters) => number;
}
