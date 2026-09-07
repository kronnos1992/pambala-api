export function parseImages(images: any): string[] {
  if (Array.isArray(images)) return images;
  try {
    return JSON.parse(images);
  } catch {
    return [];
  }
}

export function parseJsonField(raw: any, fallback: any = null): any {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function parsePaymentMethods(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function generateOrderNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `PAM-${year}${month}${day}-${random}`;
}

export function paymentHistoryPush(
  history: any,
  event: Record<string, any>
): any[] {
  const arr = parseJsonField(history, []);
  if (!Array.isArray(arr)) return [event];
  return [...arr, event];
}

export function computeAvgRating(reviews: { rating: number }[]): number {
  return reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
}

export function parseProductImages(product: any) {
  return { ...product, images: parseImages(product.images) };
}

export const SUPPORTED_LOCALES = ["pt", "en", "es", "fr", "zh", "ar"];
export const DEFAULT_LOCALE = "pt";

export function normalizeLocale(locale?: string | null): string {
  if (!locale) return DEFAULT_LOCALE;
  const l = locale.toLowerCase();
  if (SUPPORTED_LOCALES.includes(l)) return l;
  // fallback to base language: "pt-BR" -> "pt", "en-US" -> "en"
  const base = l.split("-")[0];
  return SUPPORTED_LOCALES.includes(base) ? base : DEFAULT_LOCALE;
}

/**
 * Given an entity that may carry a `translations` relation (array with
 * { locale, ...fields }), returns a copy with the localized fields applied.
 * Falls back to the entity's own base fields when no translation exists.
 */
export function applyLocalized<T extends Record<string, any>>(
  entity: T,
  locale?: string | null,
  fields?: string[]
): T {
  const l = normalizeLocale(locale);
  if (l === DEFAULT_LOCALE) return entity;

  const translations = (Array.isArray(entity.translations) ? entity.translations : []);
  const t = translations.find(
    (tr: any) => tr.locale.toLowerCase() === l
  );

  if (!t) return entity;

  const out: any = { ...entity };
  for (const f of fields || Object.keys(t)) {
    if (t[f] != null && t[f] !== "") {
      out[f] = t[f];
    }
  }
  return out;
}

/** Removes the internal translations relation before returning to the client. */
export function stripTranslations<T extends Record<string, any>>(entity: T): T {
  if (!entity || typeof entity !== "object") return entity;
  const { translations, ...rest } = entity as any;
  return rest;
}

export function parseOrderItemImages(items: any[]): any[] {
  return items.map((item) => ({
    ...item,
    product: item.product
      ? { ...item.product, images: parseImages(item.product.images) }
      : item.product,
  }));
}