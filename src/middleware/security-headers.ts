import { Context, Next } from "hono";

export async function securityHeaders(c: Context, next: Next) {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=(), payment=()"
  );
  c.header(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );
  c.header("Cache-Control", "no-store");
  await next();
}