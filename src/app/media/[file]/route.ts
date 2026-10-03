import fs from "node:fs";
import { Readable } from "node:stream";
import { mediaPath, mimeForFile } from "@/lib/media";

/**
 * Serves uploaded media publicly. Instagram, Facebook and TikTok download media from this URL
 * when publishing, so it can't sit behind the login. File names are long random IDs.
 */
export async function GET(request: Request, ctx: RouteContext<"/media/[file]">) {
  const { file } = await ctx.params;
  const p = mediaPath(file);
  if (!p || !fs.existsSync(p)) return new Response("Not found", { status: 404 });

  const size = fs.statSync(p).size;
  const headers: Record<string, string> = {
    "Content-Type": mimeForFile(file),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size)
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(p, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(p)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
