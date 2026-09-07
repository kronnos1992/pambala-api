import { ICommand, ICommandHandler } from "../shared/cqrs";
import { createWriteStream, mkdirSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import {
  isCloudinaryConfigured,
  uploadToCloudinary,
} from "../lib/cloudinary";

const UPLOAD_DIR = join(process.cwd(), "uploads");

try {
  mkdirSync(UPLOAD_DIR, { recursive: true });
} catch {}

export class UploadFileCommand implements ICommand {
  constructor(public readonly file: File) {}
}

export class UploadFileCommandHandler
  implements ICommandHandler<UploadFileCommand, any>
{
  async handle(command: UploadFileCommand) {
    const file = command.file;
    const ext = file.name?.split(".").pop() || "bin";
    const filename = `${randomBytes(16).toString("hex")}.${ext}`;

    if (isCloudinaryConfigured()) {
      try {
        const result = await uploadToCloudinary(file);
        console.log(`Imagem enviada para Cloudinary: ${result.publicId}`);
        return {
          url: result.secureUrl,
          publicId: result.publicId,
          filename: result.filename,
        };
      } catch (err) {
        console.error(
          "Falha no upload Cloudinary, a usar armazenamento local:",
          err
        );
      }
    }

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

    return { url, filename };
  }
}