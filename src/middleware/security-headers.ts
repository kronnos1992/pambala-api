import { Context, Next } from "hono";

const defaultFrameAncestors = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : defaultFrameAncestors;

export async function securityHeaders(c: Context, next: Next) {
  c.header("X-Content-Type-Options", "nosniff");
  if (c.req.path.startsWith("/uploads/")) {
    // Comprovativos (imagens/PDF) enviados pelo cliente são visualizados na
    // UI via <img> e <iframe> — libertamos o embutimento apenas para as
    // origens da UI. Bloqueiam-se script/object: um upload pode conter HTML,
    // mas nunca deve executar código.
    c.header(
      "Content-Security-Policy",
      `frame-ancestors ${allowedOrigins.join(" ")}; script-src 'none'; object-src 'none'; base-uri 'none'`
    );
  } else {
    c.header("X-Frame-Options", "DENY");
    c.header(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    );
  }
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=()"
  );
  c.header("Cache-Control", "no-store");
  await next();
}