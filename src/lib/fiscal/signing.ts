import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

// Assinaturas digitais JWS (JSON Web Signature) conforme o DE 683/25 — API de
// Faturação Electrónica da AGT. Todas as assinaturas usam RS256 (RSA + SHA-256)
// sobre o OBJETO JSON CANÓNICO (sem quebras de linha, sem espaços, aspas duplas).

export interface SigningKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateRsaKeyPair(bits: 2048 | 3072 | 4096 = 2048): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

export function publicKeyFromPrivate(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem)
    .export({ type: "spki", format: "pem" })
    .toString();
}

export function signJws(
  claim: Record<string, unknown>,
  privateKeyPem: string
): string {
  const header = base64url(
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8")
  );
  const payload = base64url(Buffer.from(JSON.stringify(claim), "utf8"));
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey(privateKeyPem);
  const signature = sign(
    "sha256",
    Buffer.from(signingInput, "utf8"),
    key
  );
  return `${signingInput}.${base64url(signature)}`;
}

export function verifyJws(jws: string, publicKeyPem: string): boolean {
  const parts = jws.split(".");
  if (parts.length !== 3 || parts[0] === "" || parts[1] === "" || parts[2] === "") {
    return false;
  }
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      key,
      Buffer.from(parts[2] as string, "base64url")
    );
  } catch {
    return false;
  }
}