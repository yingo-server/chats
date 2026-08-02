import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogg",
  "video/quicktime": "mov",
};

const TRANSCODE_TIMEOUT_MS = 45_000;

/** Re-encode a video down to 480p (H.264 + AAC in MP4). Returns null on any failure; callers keep the original. */
export async function transcodeVideo480p(data: Buffer, mimeType: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const ext = VIDEO_EXT[mimeType] || "mp4";
  const tag = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  const input = join(tmpdir(), `${tag}.in.${ext}`);
  const output = join(tmpdir(), `${tag}.out.mp4`);
  try {
    await fs.writeFile(input, data);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-y", "-loglevel", "error",
        "-i", input,
        "-vf", "scale=-2:480",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        output,
      ]);
      const timer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("ffmpeg timeout"));
      }, TRANSCODE_TIMEOUT_MS);
      proc.on("error", (e) => { clearTimeout(timer); reject(e); });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}`));
      });
    });
    const out = await fs.readFile(output);
    if (out.length === 0) return null;
    return { data: out, mimeType: "video/mp4" };
  } catch {
    return null;
  } finally {
    await fs.rm(input, { force: true }).catch(() => {});
    await fs.rm(output, { force: true }).catch(() => {});
  }
}
