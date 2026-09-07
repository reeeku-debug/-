import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomToken } from "@/lib/utils";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** 証拠画像をローカルの public/uploads に保存し、公開URLパスを返す */
export async function saveUploadedImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("対応していない画像形式です（JPEG/PNG/WEBP/GIFのみ）。");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("画像サイズが大きすぎます（5MBまで）。");
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `${Date.now()}-${randomToken(8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(path.join(UPLOAD_DIR, filename), buffer);

  return `/uploads/${filename}`;
}
