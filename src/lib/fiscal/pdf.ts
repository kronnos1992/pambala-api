import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

// Gera a factura electrónica em formato PDF (A4) a partir do registo guardado.
// Inclui: emitente, cliente, tabela de linhas, totais, resumo de impostos,
// código QR de consulta AGT e referência da assinatura digital JWS (RS256).

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const EMERALD = rgb(0.027, 0.365, 0.29);
const DARK = rgb(0.12, 0.12, 0.12);
const GRAY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.55, 0.55, 0.55);
const TABLE_LINE = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);

type PdfColor = ReturnType<typeof rgb>;

// Acentuação portuguesa (Latin-1/WinAnsi) — evita símbolos fora do conjunto.
function sanitize(text: string): string {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "_")
    .replace(/[\x00-\x08\x0B-\x1F]/g, "")
    .trim();
}

function formatKz(cents: number): string {
  const value = ((cents || 0) / 100).toFixed(2);
  const [intPart, decPart] = value.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withThousands},${decPart}`;
}

function formatDate(date: Date | string | undefined | null): string {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color: PdfColor = DARK
) {
  page.drawText(sanitize(text), { x, y, size, font, color });
}

function drawParagraph(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  color: PdfColor = DARK
): number {
  let cursor = y;
  for (const line of wrapText(text, font, size, maxWidth)) {
    drawText(page, line, font, size, x, cursor, color);
    cursor -= lineHeight;
  }
  return cursor;
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number
) {
  drawText(page, label, font, 8.5, x, y, GRAY);
  drawText(page, value, bold, 10, x, y - 13);
}

function rect(page: PDFPage, x: number, y: number, w: number, h: number, color: any, fill = true) {
  if (fill) {
    page.drawRectangle({ x, y, width: w, height: h, color });
  } else {
    page.drawRectangle({ x, y, width: w, height: h, borderColor: color, borderWidth: 0.8 });
  }
}

interface PdfLineData {
  position: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

interface PdfSnapshot {
  nif?: string | null;
  legalName?: string | null;
  name?: string | null;
  address?: string | null;
  province?: string | null;
  district?: string | null;
  vatRegime?: string | null;
  country?: string | null;
}

function parseSnapshot(raw: string | null | undefined, fallback: Record<string, string> = {}): PdfSnapshot {
  if (!raw) return fallback as PdfSnapshot;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback as PdfSnapshot;
  }
}

function parseTaxSummary(raw: string): Array<{ rate: number; baseCents: number; taxCents: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function buildInvoicePdf(invoice: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const emitter = parseSnapshot(invoice.emitterSnapshot, {
    legalName: invoice.store?.name || "Emitente",
  });
  const customer = parseSnapshot(invoice.customerSnapshot, {});
  const taxSummary = parseTaxSummary(invoice.taxSummary)
    .filter((t) => t.rate != null)
    .sort((a, b) => a.rate - b.rate);
  const lines: PdfLineData[] = (invoice.lines || []).map((l: any) => ({
    position: l.position ?? 0,
    productName: l.productName || "Artigo",
    quantity: l.quantity ?? 0,
    unitPrice: l.unitPrice ?? 0,
    taxRate: l.taxRate ?? 0,
    taxAmount: l.taxAmount ?? 0,
    lineTotal: (l.lineTotal ?? l.subtotal ?? 0) + (l.taxAmount ?? 0),
  }));

  // Cabeçalho
  rect(page, 0, PAGE_H - 108, PAGE_W, 108, EMERALD);
  drawText(page, "PAMBALA", bold, 22, MARGIN, PAGE_H - 52, WHITE);
  drawText(page, "FACTURA ELECTRÓNICA", bold, 12, MARGIN, PAGE_H - 72, WHITE);

  const docNoFull = sanitize(invoice.documentNo || "");
  const docNoFontSize = docNoFull.length > 26 ? 12 : 15;
  drawText(page, docNoFull, bold, docNoFontSize, PAGE_W - MARGIN, PAGE_H - 42, WHITE);
  drawText(page, `Estado AGT: ${invoice.agtStatus || "-"}`, font, 9, PAGE_W - MARGIN, PAGE_H - 60, WHITE);
  drawText(page, "Documento emitido por emissor autorizado (RE 683/25)", font, 8, PAGE_W - MARGIN, PAGE_H - 74, WHITE);

  let y = PAGE_H - 130;
  const colW = CONTENT_W / 2;

  // Emitente / Cliente
  drawText(page, "EMITENTE (FORNECEDOR)", bold, 10, MARGIN, y, EMERALD);
  const emitterLines = [
    emitter.legalName || "Loja",
    `NIF: ${emitter.nif || "-"}`,
    emitter.address || "",
  ]
    .concat(emitter.province ? [emitter.district ? `${emitter.province}, ${emitter.district}` : emitter.province] : [])
    .concat(emitter.vatRegime ? [`Regime de IVA: ${emitter.vatRegime}`] : []);
  y = drawParagraph(page, emitterLines.filter(Boolean).join("\n"), font, 9.5, MARGIN, y - 16, colW - 10, 13);

  drawText(page, "CLIENTE (ADQUIRENTE)", bold, 10, MARGIN + colW, PAGE_H - 130, EMERALD);
  const customerLines = [
    customer.name || "",
    customer.nif ? `NIF: ${customer.nif}` : "NIF: Consumidor final (não apresentou identificação fiscal)",
    customer.address || "",
  ].filter(Boolean);
  drawParagraph(
    page,
    customerLines.join("\n"),
    font,
    9.5,
    MARGIN + colW,
    PAGE_H - 146,
    colW - 10,
    13,
    customerLines.length > 0 ? DARK : GRAY
  );

  // Dados do documento
  y = PAGE_H - 190;
  const info: Array<[string, string]> = [
    ["Nº de documento", docNoFull],
    ["Tipo", invoice.documentType || "FT"],
    ["Data de emissão", formatDate(invoice.issueDate)],
    ["Data de entrada no sistema", formatDate(invoice.systemEntryDate)],
    ["Moeda", invoice.currency || "AOA"],
    ["Estado na AGT", `${invoice.agtStatus || "-"}${invoice.agtValidatedAt ? ` (${formatDate(invoice.agtValidatedAt)})` : ""}`],
  ];
  for (let i = 0; i < info.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    drawLabelValue(page, info[i][0], info[i][1], font, bold, MARGIN + col * (CONTENT_W / 3), y - row * 40);
  }
  y -= 96;

  // Tabela de linhas
  rect(page, MARGIN, y, CONTENT_W, 22, EMERALD);
  const headers: Array<[string, number, number]> = [
    ["Nº", MARGIN + 6, 30],
    ["Descrição", MARGIN + 40, 250],
    ["Qt.", MARGIN + 372, 34],
    ["Preço unit.", MARGIN + 402, 66],
    ["IVA %", MARGIN + 474, 34],
    ["Total Kz", MARGIN + 505, 50],
  ];
  for (const [label, hx, hw] of headers) {
    drawText(page, label, bold, 8.5, hx, y + 7, WHITE);
  }
  y -= 22;

  let rowIndex = 0;
  for (const line of lines) {
    const rowH = 18;
    if (rowIndex % 2 === 1) {
      rect(page, MARGIN, y, CONTENT_W, rowH, rgb(0.96, 0.96, 0.96));
    }
    drawText(page, String(line.position), font, 9, MARGIN + 6, y + 5);
    drawText(page, String(line.productName), font, 8.5, MARGIN + 40, y + 5, GRAY);
    drawText(page, String(line.quantity), font, 9, MARGIN + 374, y + 5);
    drawText(page, formatKz(line.unitPrice), font, 9, MARGIN + 400, y + 5);
    drawText(page, `${line.taxRate}%`, font, 9, MARGIN + 478, y + 5);
    drawText(page, formatKz(line.lineTotal), bold, 9, MARGIN + 503, y + 5);
    y -= rowH;
    rowIndex++;
    if (y < 160) {
      throw new Error("Factura demasiado extensa para uma página");
    }
  }

  if (rowIndex === 0) {
    drawText(page, "(sem linhas)", italic, 9, MARGIN + 6, y + 5, GRAY);
    y -= 18;
  }

  rect(page, MARGIN, y, CONTENT_W, 0.7, TABLE_LINE, false);

  // Totais
  y -= 34;
  drawText(page, "TOTAL LÍQUIDO", font, 9.5, MARGIN + 400, y, GRAY);
  drawText(page, formatKz(invoice.subtotal || 0), bold, 9.5, MARGIN + 520, y, DARK);
  y -= 16;
  for (const bucket of taxSummary) {
    drawText(page, `IVA (${bucket.rate}%)`, font, 9.5, MARGIN + 400, y, GRAY);
    drawText(page, formatKz(bucket.taxCents), bold, 9.5, MARGIN + 520, y, DARK);
    y -= 16;
  }
  if (taxSummary.length === 0 && (invoice.taxTotal || 0) > 0) {
    drawText(page, "IVA", font, 9.5, MARGIN + 400, y, GRAY);
    drawText(page, formatKz(invoice.taxTotal), bold, 9.5, MARGIN + 520, y, DARK);
    y -= 16;
  }
  if (invoice.discountTotal > 0) {
    drawText(page, "Desconto", font, 9.5, MARGIN + 400, y, GRAY);
    drawText(page, `-${formatKz(invoice.discountTotal)}`, bold, 9.5, MARGIN + 520, y, DARK);
    y -= 16;
  }
  rect(page, MARGIN, y - 8, CONTENT_W, 26, rgb(0.94, 0.98, 0.97));
  drawText(page, "TOTAL A PAGAR", bold, 10, MARGIN + 400, y + 3, EMERALD);
  drawText(page, formatKz(invoice.total || 0), bold, 14, MARGIN + 486, y - 4, EMERALD);
  y -= 44;

  // Consulta AGT + assinatura
  if (invoice.qrUrl) {
    drawText(page, "Consulta pública (kiosk AGT):", font, 8.5, MARGIN, y, GRAY);
    drawText(page, String(invoice.qrUrl), font, 8, MARGIN, y - 12, DARK);
    y -= 26;
  }

  y -= 6;
  rect(page, MARGIN, y - 14, CONTENT_W, 34, rgb(0.98, 0.98, 0.98));
  drawText(page, "Assinatura digital do documento", bold, 8.5, MARGIN + 8, y + 12, EMERALD);
  const sig = sanitize(invoice.signature || "");
  drawText(page, sig.slice(0, 92), font, 7, MARGIN + 8, y - 4, GRAY);
  drawText(page, "JWS (RS256) — confirme a autenticidade no Portal do Contribuinte ou no kiosk AGT.", italic, 8, MARGIN + 8, y - 14, GRAY);

  // Rodapé
  rect(page, 0, 0, PAGE_W, 30, EMERALD);
  drawText(page, "Pambala · Plataforma de Marketplace", font, 8, MARGIN, 10, WHITE);
  drawText(
    page,
    `Gerado a ${formatDate(new Date())} · referência ${invoice.agtRequestId || "-"}`,
    font,
    8,
    PAGE_W - MARGIN,
    10,
    WHITE
  );

  return doc.save();
}