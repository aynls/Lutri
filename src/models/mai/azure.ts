import { c } from "../../create/messages";
import type { Parameters } from "../../domain/types";
import { request } from "../shared";
import type { CompileContext } from "../types";

export function maiAzureRequest(context: CompileContext, parameters: Parameters) {
  const { endpoint, deployment } = context.configuration;
  if (!endpoint || !deployment) throw new Error(c("needsConfiguration"));

  const url = `${endpoint.replace(/\/$/, "")}/mai/v1/images`;
  const { images, prompt } = context;
  if (!images.length) return request("azure", `${url}/generations`, { ...parameters, model: deployment, prompt });

  const compiled = request("azure", `${url}/edits`, null);
  delete compiled.body;
  compiled.multipart = [
    { name: "model", text: deployment },
    { name: "prompt", text: prompt },
    ...images.map((dataUrl) => ({ name: "image", dataUrl })),
  ];
  return compiled;
}
