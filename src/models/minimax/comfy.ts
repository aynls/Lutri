import { request } from "../shared";
import { imageApi, imageBody } from "./imageApi";
import { minimax, minimaxModelId } from "./shared";

export const minimaxComfy = (highspeed: boolean) =>
  minimax(highspeed, {
    ...imageApi,
    provider: "comfy",
    compile: (context) => ({
      ...request("comfy", `https://api.comfy.org/v2/models/minimax/${minimaxModelId(highspeed)}`, imageBody(context)),
      authHeader: "X-API-Key",
      authPrefix: "",
    }),
  });
