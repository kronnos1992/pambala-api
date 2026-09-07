const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  format: string;
  filename: string;
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

export async function uploadToCloudinary(
  file: File
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary não configurado");
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");

  const form = new FormData();
  form.append("file", file, file.name || "image");
  form.append("folder", "pambala");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: form,
  });

  const payload: any = await res.json().catch(() => null);

  if (!res.ok || !payload?.secure_url) {
    throw new Error(
      payload?.error?.message || `Cloudinary falhou com status ${res.status}`
    );
  }

  return {
    publicId: payload.public_id,
    url: payload.url,
    secureUrl: payload.secure_url,
    format: payload.format || "",
    filename: file.name || payload.public_id || "image",
  };
}