import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { config } from "./config";
import { randomId } from "./crypto";
import type { MediaType } from "./types";

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? "300") * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; type: MediaType }> = {
  "image/jpeg": { ext: "jpg", type: "image" },
  "image/png": { ext: "png", type: "image" },
  "video/mp4": { ext: "mp4", type: "video" },
  "video/quicktime": { ext: "mov", type: "video" },
};

export const ACCEPT_ATTR = Object.keys(ALLOWED).join(",");

export function uploadsDir(): string {
  const dir = path.join(config.dataDir, "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface SavedMedia {
  file: string;
  type: MediaType;
  mime: string;
  size: number;
}

export async function saveUpload(file: File): Promise<SavedMedia> {
  const kind = ALLOWED[file.type];
  if (!kind) throw new Error(`Unsupported file type "${file.type || "unknown"}". Use JPEG, PNG, MP4 or MOV.`);
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(`File is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  const name = `${randomId(18)}.${kind.ext}`;
  const target = path.join(uploadsDir(), name);
  await fs.promises.writeFile(target, Readable.fromWeb(file.stream() as never));
  return { file: name, type: kind.type, mime: file.type, size: file.size };
}

/** Only bare generated names are valid, which blocks path traversal. */
export function mediaPath(file: string): string | null {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|mp4|mov)$/.test(file)) return null;
  return path.join(uploadsDir(), file);
}

export function mediaPublicUrl(file: string): string {
  return `${config.appUrl}/media/${file}`;
}

export function mimeForFile(file: string): string {
  const ext = file.split(".").pop();
  return Object.entries(ALLOWED).find(([, v]) => v.ext === ext)?.[0] ?? "application/octet-stream";
}

export function deleteMedia(file: string | null): void {
  const p = file ? mediaPath(file) : null;
  if (p) fs.rmSync(p, { force: true });
}

/** A fetch() request body that streams a file (or a byte range of it) from disk. */
export function fileBody(file: string, start?: number, end?: number): ReadableStream {
  const p = mediaPath(file);
  if (!p) throw new Error("Invalid media file");
  return Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream;
}
