import { Hono } from "hono";
import { authMiddleware } from "../lib/auth";
import { createWriteStream } from "fs";
import { mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const uploads = new Hono();

const UPLOAD_DIR = join(process.cwd(), "uploads");

try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {}

uploads.post("/", authMiddleware, async (c) => {
  const contentType = c.req.header("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ error: "Apenas uploads multipart são aceites" }, 400);
  }

  const body = await c.req.parseBody();
  const file = body["file"];

  if (!file || typeof file === "string") {
    return c.json({ error: "Nenhum ficheiro enviado" }, 400);
  }

  const ext = file.name?.split(".").pop() || "bin";
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const writeStream = createWriteStream(filepath);
  await new Promise<void>((resolve, reject) => {
    writeStream.write(buffer, (err) => {
      if (err) reject(err);
      writeStream.end(() => resolve());
    });
  });

  const url = `/uploads/${filename}`;

  return c.json({ url, filename }, 201);
});

export default uploads;
