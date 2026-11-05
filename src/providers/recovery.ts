import type { Json, Recovery, Parameters } from "../domain/types";
import { request } from "../models/shared";
import type { ModelCombination } from "../models/types";
import { array, object, send, string } from "./transport";
import { imageResults, responseMetadata, type RemoteImage } from "./results";

export function recoveryFrom(combination: ModelCombination, response: Json, taskId: string): Recovery | undefined {
  const data = object(response);
  if (combination.protocol === "bfl" && typeof data.id === "string")
    return { remoteId: data.id, statusUrl: string(data.polling_url) };
  if (combination.protocol === "fal" && typeof data.request_id === "string")
    return { remoteId: data.request_id, statusUrl: string(data.status_url), resultUrl: string(data.response_url) };
  if (combination.protocol === "runware") return { remoteId: taskId };
  if (combination.protocol === "interactions" && typeof data.id === "string")
    return {
      remoteId: data.id,
      statusUrl: `https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(data.id)}`,
    };
  if (combination.protocol === "ideogram" && typeof data.generation_id === "string")
    return { remoteId: data.generation_id, statusUrl: `https://api.ideogram.ai/v2/generations/${data.generation_id}` };
  return undefined;
}

export async function poll(
  combination: ModelCombination,
  recovery: Recovery,
): Promise<{ done: boolean; images: RemoteImage[]; metadata?: Parameters }> {
  let response: Json;
  if (combination.protocol === "runware")
    response = await send(
      request("runware", "https://api.runware.ai/v1", [{ taskType: "getResponse", taskUUID: recovery.remoteId }]),
    );
  else {
    if (!recovery.statusUrl) throw new Error("Original task has no query URL");
    const query = request(combination.provider, recovery.statusUrl, null);
    query.method = "GET";
    if (combination.protocol === "interactions") query.headers = { "Api-Revision": "2026-05-20" };
    delete query.body;
    response = await send(query);
  }
  const data = object(response);
  const status = string(data.status);
  if (combination.protocol === "bfl") {
    if (status === "Pending") return { done: false, images: [] };
    if (status !== "Ready") throw new Error(status ?? JSON.stringify(response));
  }
  if (combination.protocol === "fal") {
    if (status === "IN_QUEUE" || status === "IN_PROGRESS") return { done: false, images: [] };
    if (status !== "COMPLETED" || !recovery.resultUrl) throw new Error(JSON.stringify(response));
    const query = request("fal", recovery.resultUrl, null);
    query.method = "GET";
    delete query.body;
    response = await send(query);
  }
  if (combination.protocol === "runware") {
    const images = imageResults("runware", response);
    images.push(
      ...array(data.errors).map((error, index) => ({ remoteId: `error:${index}`, error: JSON.stringify(error) })),
    );
    const processing = array(data.data).some((item) => object(item).status === "processing");
    return { done: !processing && images.length > 0, images };
  }
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  if (status && ["failed", "error", "cancelled", "canceled"].includes(status.toLowerCase()))
    throw new Error(JSON.stringify(response));
  const images = imageResults(combination.protocol, response);
  if (!images.length && (combination.protocol === "bfl" || combination.protocol === "fal" || status === "completed"))
    throw new Error("The original task completed without an image.");
  return { done: images.length > 0, images, metadata: responseMetadata(response) };
}
