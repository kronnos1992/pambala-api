import { Context, Next } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (c: Context) => string | Promise<string>;
  message?: string;
}

const store = new Map<string, RateLimitEntry>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}
setInterval(cleanup, 60_000);

export function rateLimit(opts: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = (c) => c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown",
    message = "Demasiadas tentativas. Tente novamente mais tarde.",
  } = opts;

  return async (c: Context, next: Next) => {
    const key = await keyGenerator(c);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: message, retryAfter }, 429);
    }

    return next();
  };
}

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: async (c: Context) => {
    let email = "unknown";
    try {
      const body = (await c.req.json()) as { email?: string };
      email = body?.email?.toLowerCase()?.trim() || "unknown";
    } catch {
      // corpo ausente/inválido → ainda conta contra o IP
    }
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown-ip";
    return `login:${email}:${ip}`;
  },
  message: "Demasiadas tentativas de login. Conta bloqueada temporariamente.",
});

export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Demasiados registos a partir deste IP. Tente novamente mais tarde.",
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: "Demasiados pedidos. Aguarde um momento.",
});
