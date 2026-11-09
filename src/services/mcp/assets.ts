import { z } from "zod";
import type { GalleryEntry } from "../../domain/types";
import { importAsset, native } from "../native";
import { refreshGallery } from "../store";
import { identifier, McpError, pagination, success, tool } from "./contracts";

function assetSummary(entry: GalleryEntry) {
  return {
    assetId: entry.asset.id,
    mediaType: entry.asset.mediaType,
    width: entry.asset.width,
    height: entry.asset.height,
    inGallery: (entry.favorite || entry.boardIds.length > 0) && !entry.staged,
    source: entry.source,
    addedAt: entry.addedAt,
    bytes: entry.bytes,
    availability: entry.availability,
    favorite: entry.favorite,
    boardIds: entry.boardIds,
    tags: entry.tags,
    provenance: entry.provenance,
  };
}

export const assetTools = [
  tool(
    "find_assets",
    "Find images explicitly kept in favorites or boards by exact asset ID or ID fragment. Working files remain accessible by asset ID and through creation task records. Defaults: newest first, limit 20.",
    z.strictObject({
      assetId: identifier.optional(),
      query: z.string().optional(),
      source: z.enum(["generated", "imported"]).optional(),
      ...pagination,
    }),
    async (input) => {
      const offset = input.offset ?? 0,
        limit = input.limit ?? 20;
      const page = await native<{ entries: GalleryEntry[]; total: number }>("gallery_query", {
        query: {
          ids: input.assetId ? [input.assetId] : undefined,
          search: input.query,
          collection: input.source ?? "all",
        },
        offset,
        limit,
      });
      return success({
        assets: page.entries.map(assetSummary),
        total: page.total,
        nextOffset: offset + page.entries.length < page.total ? offset + page.entries.length : null,
      });
    },
    { readOnly: true },
  ),
  tool(
    "get_image",
    "Read a gallery image or saved task result by asset ID. Defaults to a small PNG preview. variant=original reads the full image; original SVG is returned as text. Unlisted task results remain readable.",
    z.strictObject({ assetId: identifier, variant: z.enum(["preview", "original"]).optional() }),
    async ({ assetId, variant = "preview" }) => {
      const entries = await native<GalleryEntry[]>("gallery_entries", { ids: [assetId] });
      const entry = entries[0];
      if (!entry) throw new McpError("ASSET_NOT_FOUND", `Image asset not found: ${assetId}`);
      let dataUrl: string;
      try {
        dataUrl = await native<string>("asset_data", { id: assetId, preview: variant === "preview" });
      } catch {
        throw new McpError("ASSET_UNAVAILABLE", "The image file could not be read.", { assetId });
      }
      const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
      if (!match) throw new McpError("INVALID_IMAGE", "The stored image could not be decoded.");
      const result = success({ asset: assetSummary(entry), variant, returnedMediaType: match[1] });
      if (match[1] === "image/svg+xml") {
        const text = new TextDecoder().decode(Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)));
        result.content.push({ type: "text", text });
      } else result.content.push({ type: "image", mimeType: match[1], data: match[2] });
      return result;
    },
    { readOnly: true },
  ),
  tool(
    "import_image",
    "Save an independent local working copy and return its asset ID for subsequent creation. This does not add the image to favorites or boards. Choose one source: an absolute local path or a Base64 data URL.",
    z.strictObject({
      source: z.discriminatedUnion("type", [
        z.strictObject({
          type: z.literal("path"),
          path: z
            .string()
            .regex(/^(?:[A-Za-z]:[\\/]|\\\\|\/)/)
            .describe("Existing absolute image file path."),
        }),
        z.strictObject({
          type: z.literal("dataUrl"),
          dataUrl: z
            .string()
            .regex(/^data:image\/[^;]+;base64,/)
            .describe("Base64 image data URL."),
        }),
      ]),
    }),
    async ({ source }) => {
      const entry = await importAsset(source.type === "path" ? { path: source.path } : { dataUrl: source.dataUrl });
      void refreshGallery([entry.asset.id]).catch(() => {});
      return success({ asset: assetSummary(entry) });
    },
  ),
];
