import { c } from "../../create/messages";
import { minimaxEndpoints, request } from "../shared";
import { imageApi, imageBody } from "./imageApi";
import { minimax } from "./shared";

const maxBodyBytes = 64 * 1024 * 1024;

export const minimaxOfficial = (highspeed: boolean) =>
  minimax(highspeed, {
    ...imageApi,
    provider: "minimax",
    compile: (context) => {
      const endpoint =
        context.configuration.endpoint === minimaxEndpoints.mainland
          ? minimaxEndpoints.mainland
          : minimaxEndpoints.global;
      const editing = context.images.length > 0;
      const body = {
        ...imageBody(context),
        model: highspeed ? "MiniMax-H3-Image-Highspeed" : "MiniMax-H3-Image",
        response_format: "url",
      };
      if (editing && new TextEncoder().encode(JSON.stringify(body)).byteLength > maxBodyBytes)
        throw new Error(`${c("inputLimit")}: 64 MiB`);
      return request("minimax", `${endpoint}/v1/images/${editing ? "edits" : "generations"}`, body);
    },
  });
