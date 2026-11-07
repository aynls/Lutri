import type { Json } from "../domain/types";
import { imageResults, responseMetadata } from "./results";
import { array, object, string } from "./transport";

// Error objects have no guaranteed per-image ID. Compare canonical diagnostics as
// a multiset within each full task snapshot, never as an append-only event stream.
function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

export function runwareResponse(response: Json, taskId: string, phase: "submit" | "poll") {
  const body = object(response);
  if (body.error) throw new Error(JSON.stringify(body.error));
  const belongs = (value: Json) => !string(object(value).taskUUID) || object(value).taskUUID === taskId;
  const data = array(body.data).filter(belongs);
  const errors = array(body.errors).filter(belongs);
  const failed = [...errors, ...data.filter((item) => object(item).status === "error" || object(item).error)];
  if (phase === "poll") {
    const queryErrors = failed.filter((error) => {
      const value = object(error);
      return !value.taskUUID || value.taskType === "getResponse" || value.taskType === "authentication";
    });
    if (queryErrors.length) throw new Error(JSON.stringify(queryErrors));
  }
  const failures = failed.map((error) => JSON.stringify(canonical(error)));
  const images = imageResults("runware", {
    ...body,
    data: data.filter((item) => object(item).status !== "error" && !object(item).error),
  });
  const processing = data.some((item) => object(item).status === "processing");
  return {
    done: !processing && (images.length > 0 || failures.length > 0),
    images,
    failures: data.length || errors.length ? failures : undefined,
    metadata: responseMetadata(response),
  };
}
