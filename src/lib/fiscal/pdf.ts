import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

// Factura electrónica em PDF (A4) a partir do registo imutável.
// Fonte embutida: Inter (OFL), pesos 400/600/700, com fallback para Helvetica.
// Estrutura: banda de marca + nº de documento, blocos emitente/adquirente,
// grelha de dados do documento, tabela de linhas (paginada, com cabeçalho
// repetido), resumo de impostos, totais, QR de consulta pública AGT,
// assinatura digital JWS e notas legais.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 42;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP = PAGE_H - 132; // início do conteúdo (abaixo da banda de marca)

const C = {
  primaryDark: rgb(0.016, 0.231, 0.2),
  primary: rgb(0.043, 0.451, 0.353),
  brandSoft: rgb(0.71, 0.82, 0.78),
  ink: rgb(0.11, 0.13, 0.15),
  muted: rgb(0.435, 0.459, 0.49),
  border: rgb(0.83, 0.855, 0.875),
  zebra: rgb(0.965, 0.969, 0.975),
  panel: rgb(0.98, 0.983, 0.988),
  successBg: rgb(0.91, 0.97, 0.94),
  success: rgb(0.055, 0.372, 0.278),
  dangerBg: rgb(0.99, 0.925, 0.92),
  danger: rgb(0.72, 0.19, 0.14),
  warnBg: rgb(0.996, 0.95, 0.886),
  warn: rgb(0.6, 0.42, 0.06),
  white: rgb(1, 1, 1),
} as const;

type RGB = ReturnType<typeof rgb>;

interface Fonts {
  regular: PDFFont;
  medium: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

export interface PdfSettings {
  productId?: string | null;
  productVersion?: string | null;
  softwareValidationNumber?: string | null;
}

interface PdfLine {
  position: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface PdfInvoiceData {
  id: string;
  documentType: string;
  documentNo: string;
  status?: string;
  issueDate?: Date | string | null;
  systemEntryDate?: Date | string | null;
  currency?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  taxSummary?: unknown;
  signature?: string | null;
  qrUrl?: string | null;
  agtStatus?: string;
  agtRequestId?: string | null;
  agtReference?: string | null;
  agtValidatedAt?: Date | string | null;
  emitterSnapshot?: string | null;
  customerSnapshot?: string | null;
  series?: { agtSeriesCode?: string | null; establishmentNumber?: string | null } | null;
  lines?: PdfLine[];
}

// ---------- utilidades de texto ----------

function sanitize(text: string): string {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")
    .trim();
}

function width(text: string, font: PDFFont, size: number): number {
  return font.widthOfTextAtSize(sanitize(text), size);
}

function truncate(text: string, font: PDFFont, size: number, maxW: number): string {
  const value = sanitize(text);
  if (width(value, font, size) <= maxW) return value;
  let out = value;
  while (out.length > 1 && width(`${out}…`, font, size) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = sanitize(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || width(next, font, size) <= maxW) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fmtMoney(cents: number): string {
  const [intPart, decPart] = (Math.round(cents || 0) / 100).toFixed(2).split(".");
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${decPart}`;
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtDateTime(value?: Date | string | null): string {
  const base = fmtDate(value);
  if (base === "-") return "-";
  const d = new Date(value!);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${base} ${hh}:${mi}`;
}

function docTypeLabel(documentType: string): string {
  const map: Record<string, string> = {
    FT: "FACTURA",
    NC: "NOTA DE CRÉDITO",
    ND: "NOTA DE DÉBITO",
    FR: "FACTURA RECIBO",
    FS: "FACTURA SIMPLIFICADA",
  };
  return map[documentType] || sanitize(documentType) || "DOCUMENTO";
}

// ---------- desenho básico ----------

function draw(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color: RGB = C.ink
): void {
  page.drawText(sanitize(text), { x, y, size, font, color });
}

function drawRight(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  rightX: number,
  y: number,
  color: RGB = C.ink
): void {
  page.drawText(sanitize(text), { x: rightX - width(text, font, size), y, size, font, color });
}

function drawCenter(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  centerX: number,
  y: number,
  color: RGB = C.ink
): void {
  page.drawText(sanitize(text), { x: centerX - width(text, font, size) / 2, y, size, font, color });
}

function drawPanel(page: PDFPage, x: number, y: number, w: number, h: number, fill: RGB = C.panel): void {
  page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: C.border, borderWidth: 0.8 });
}

function drawLine(
  page: PDFPage,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: RGB = C.border,
  thickness = 0.6
): void {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
}

function statusChip(status: string): { bg: RGB; fg: RGB } {
  switch (status) {
    case "VALID":
      return { bg: C.successBg, fg: C.success };
    case "INVALID":
    case "REJECTED":
    case "FAILED":
      return { bg: C.dangerBg, fg: C.danger };
    default:
      return { bg: C.warnBg, fg: C.warn };
  }
}

function parseJson(value?: string | null): Record<string, any> {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseTaxSummary(value: unknown): Array<{ rate: number; baseCents: number; taxCents: number }> {
  if (Array.isArray(value)) return value as Array<{ rate: number; baseCents: number; taxCents: number }>;
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ---------- cabeçalho e rodapé ----------

function drawBand(page: PDFPage, fonts: Fonts, label: string, documentNo: string): void {
  page.drawRectangle({ x: 0, y: PAGE_H - 104, width: PAGE_W, height: 104, color: C.primaryDark });
  page.drawRectangle({ x: 0, y: PAGE_H - 108, width: PAGE_W, height: 4, color: C.primary });

  draw(page, "PAMBALA", fonts.bold, 18, MARGIN, PAGE_H - 44, C.white);
  draw(page, "Plataforma de Marketplace · Faturação Electrónica AGT", fonts.regular, 8, MARGIN, PAGE_H - 59, C.brandSoft);

  const chipW = width(label, fonts.medium, 8) + 20;
  const chipX = PAGE_W - MARGIN - chipW;
  page.drawRectangle({ x: chipX, y: PAGE_H - 48, width: chipW, height: 18, color: C.white, borderColor: C.primary, borderWidth: 0.8 });
  drawCenter(page, label, fonts.medium, 8, chipX + chipW / 2, PAGE_H - 42, C.primaryDark);

  const maxW = PAGE_W - MARGIN - chipW - 24;
  const size = width(documentNo, fonts.bold, 13) <= maxW ? 13 : width(documentNo, fonts.bold, 10) <= maxW ? 10 : 8;
  drawRight(page, truncate(documentNo, fonts.bold, size, maxW), fonts.bold, size, PAGE_W - MARGIN - chipW - 12, PAGE_H - 42, C.white);
  drawRight(page, "Nº DO DOCUMENTO", fonts.regular, 6.5, PAGE_W - MARGIN - chipW - 12, PAGE_H - 56, C.brandSoft);
}

function drawFooter(page: PDFPage, fonts: Fonts, pageNo: number, total: number, agtRequestId?: string | null): void {
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 30, color: C.primaryDark });
  draw(page, "Pambala · Faturação Electrónica AGT", fonts.regular, 7, MARGIN, 10, C.brandSoft);
  drawCenter(page, `Página ${pageNo} de ${total}`, fonts.regular, 7, PAGE_W / 2, 10, C.brandSoft);
  drawRight(page, truncate(`AGT ref: ${agtRequestId || "-"}`, fonts.mono, 6.5, 200), fonts.mono, 6.5, PAGE_W - MARGIN, 10, C.brandSoft);
}

function drawParagraph(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  size: number,
  x: number,
  y: number,
  maxW: number,
  color: RGB
): number {
  const lines = wrap(text, fonts.regular, size, maxW).slice(0, 2);
  let yy = y;
  for (const line of lines) {
    draw(page, line, fonts.regular, size, x, yy, color);
    yy -= size + 2.5;
  }
  return yy;
}

// ---------- gerador ----------

export async function buildInvoicePdf(input: PdfInvoiceData, settings?: PdfSettings): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await loadFont(doc, "400Regular", StandardFonts.Helvetica),
    medium: await loadFont(doc, "600SemiBold", StandardFonts.HelveticaBold),
    bold: await loadFont(doc, "700Bold", StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  const emitter = parseJson(input.emitterSnapshot);
  const customer = parseJson(input.customerSnapshot);
  const summary = parseTaxSummary(input.taxSummary);
  const currency = input.currency || "AOA";
  const documentNo = input.documentNo || "-";
  const label = docTypeLabel(input.documentType);
  const agtStatus = input.agtStatus || "-";
  const establishment = input.series?.establishmentNumber || "SEDE";
  const seriesCode = input.series?.agtSeriesCode || "-";

  // ---------- página 1: banda + blocos emitente / adquirente ----------
  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  drawBand(page1, fonts, label, documentNo);

  const blockH = 88;
  const blockGap = 12;
  const blockW = (CONTENT_W - blockGap) / 2;
  let y = TOP;
  let page: PDFPage = page1;

  // EMITENTE
  drawPanel(page, MARGIN, y - blockH, blockW, blockH);
  draw(page, "EMITENTE · FORNECEDOR", fonts.medium, 7, MARGIN + 12, y - 14, C.primary);
  draw(page, truncate(emitter.legalName || "Emitente", fonts.bold, 11, blockW - 24), fonts.bold, 11, MARGIN + 12, y - 30);
  drawParagraph(page, fonts, [emitter.address, emitter.province, emitter.district].filter(Boolean).join(", ") || "-", 8, MARGIN + 12, y - 44, blockW - 24, C.muted);
  draw(page, `NIF ${emitter.nif || "-"}${emitter.vatRegime ? ` · Regime ${emitter.vatRegime}` : ""}`, fonts.regular, 8.5, MARGIN + 12, y - (blockH - 16), C.ink);

  // ADQUIRENTE
  const cx = MARGIN + blockW + blockGap;
  drawPanel(page, cx, y - blockH, blockW, blockH);
  draw(page, "CLIENTE · ADQUIRENTE", fonts.medium, 7, cx + 12, y - 14, C.primary);
  draw(page, truncate(customer.name || customer.legalName || "Consumidor final", fonts.bold, 11, blockW - 24), fonts.bold, 11, cx + 12, y - 30);
  drawParagraph(page, fonts, customer.address || "-", 8, cx + 12, y - 44, blockW - 24, C.muted);
  draw(page, customer.nif ? `NIF ${customer.nif}` : "Consumidor final não identificado", fonts.regular, 8.5, cx + 12, y - (blockH - 16), C.ink);

  y -= blockH + 22;

  // ---------- grelha de dados do documento ----------
  const gridDefs: Array<[string, string]> = [
    ["Nº do documento", documentNo],
    ["Tipo", label],
    ["Estado AGT", agtStatus],
    ["Data de emissão", fmtDate(input.issueDate)],
    ["Registo no sistema", fmtDateTime(input.systemEntryDate)],
    ["Moeda", currency],
    ["Série autorizada", seriesCode],
    ["Estabelecimento", establishment],
    ["Validação AGT", input.agtValidatedAt ? fmtDateTime(input.agtValidatedAt) : "—"],
  ];
  const GRID_COLS = 3;
  const cellGap = 8;
  const cellW = (CONTENT_W - cellGap * (GRID_COLS - 1)) / GRID_COLS;
  const cellH = 40;
  for (let i = 0; i < gridDefs.length; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const x = MARGIN + col * (cellW + cellGap);
    const top = y - row * (cellH + 6);
    drawPanel(page, x, top - cellH, cellW, cellH);
    draw(page, gridDefs[i][0].toUpperCase(), fonts.regular, 6.5, x + 10, top - 13, C.muted);
    const value = gridDefs[i][1];
    if (gridDefs[i][0] === "Estado AGT") {
      const chip = statusChip(value);
      const chipW = width(value, fonts.bold, 9) + 16;
      page.drawRectangle({ x: x + 10, y: top - 30, width: chipW, height: 13, color: chip.bg, borderColor: chip.fg, borderWidth: 0.7 });
      draw(page, value, fonts.bold, 9, x + 18, top - 27, chip.fg);
    } else {
      const vSize = width(value, fonts.medium, 9) <= cellW - 20 ? 9 : 8;
      draw(page, truncate(value, fonts.medium, vSize, cellW - 20), fonts.medium, vSize, x + 10, top - 26, C.ink);
    }
  }
  y -= Math.ceil(gridDefs.length / GRID_COLS) * (cellH + 6) + 24;

  // ---------- tabela de linhas ----------
  const tableCols = [
    { x: MARGIN + 8, w: 20, align: "left" as const },
    { x: MARGIN + 32, w: 236, align: "left" as const },
    { x: MARGIN + 268, w: 32, align: "right" as const },
    { x: MARGIN + 300, w: 62, align: "right" as const },
    { x: MARGIN + 362, w: 36, align: "right" as const },
    { x: MARGIN + 398, w: 48, align: "right" as const },
    { x: MARGIN + 446, w: 62, align: "right" as const },
  ];
  const tableRight = MARGIN + CONTENT_W;
  const headerH = 18;
  const rowH = 16;
  const lines = input.lines || [];

  const drawTableHeader = (pg: PDFPage, topY: number) => {
    pg.drawRectangle({ x: MARGIN, y: topY, width: CONTENT_W, height: headerH, color: C.primary });
    const headers = ["Nº", "DESCRIÇÃO", "QT", "PREÇO UNIT.", "IVA %", "IVA", "TOTAL"];
    headers.forEach((h, i) => {
      const col = tableCols[i];
      if (col.align === "right") drawRight(pg, h, fonts.medium, 6.5, col.x + col.w - 4, topY + 5.5, C.white);
      else draw(pg, h, fonts.medium, 6.5, col.x, topY + 5.5, C.white);
    });
  };

  const tableTop = y;
  drawTableHeader(page, tableTop - headerH);

  let yy = tableTop - headerH;
  let zebra = false;
  for (const line of lines) {
    if (yy - rowH - MARGIN < 40) {
      const next = doc.addPage([PAGE_W, PAGE_H]);
      drawBand(next, fonts, label, documentNo);
      page = next;
      yy = TOP - 12;
      drawTableHeader(page, yy - headerH);
      draw(page, `continuação · ${label.toLowerCase()} ${documentNo}`, fonts.regular, 6.5, MARGIN, yy - headerH - 4, C.muted);
      yy -= rowH;
    }
    if (zebra) page.drawRectangle({ x: MARGIN, y: yy - rowH, width: CONTENT_W, height: rowH, color: C.zebra });
    drawLine(page, MARGIN, yy - rowH, tableRight, yy - rowH);
    draw(page, String(line.position), fonts.regular, 8, tableCols[0].x, yy - 11.5, C.muted);
    draw(page, truncate(line.productName || "Artigo", fonts.regular, 8.5, tableCols[1].w - 4), fonts.regular, 8.5, tableCols[1].x, yy - 11.5, C.ink);
    drawRight(page, String(line.quantity), fonts.regular, 8, tableCols[2].x + tableCols[2].w - 4, yy - 11.5, C.ink);
    drawRight(page, fmtMoney(line.unitPrice), fonts.regular, 8, tableCols[3].x + tableCols[3].w - 4, yy - 11.5, C.ink);
    drawRight(page, `${line.taxRate}%`, fonts.regular, 8, tableCols[4].x + tableCols[4].w - 4, yy - 11.5, C.muted);
    drawRight(page, fmtMoney(line.taxAmount), fonts.regular, 8, tableCols[5].x + tableCols[5].w - 4, yy - 11.5, C.ink);
    drawRight(page, fmtMoney(line.lineTotal), fonts.medium, 8, tableCols[6].x + tableCols[6].w - 4, yy - 11.5, C.ink);
    yy -= rowH;
    zebra = !zebra;
  }
  if (!lines.length) {
    draw(page, "Sem linhas para apresentar.", fonts.regular, 8, MARGIN + 32, yy - 11.5, C.muted);
    yy -= rowH;
  }
  drawLine(page, MARGIN, yy, tableRight, yy);
  yy -= 18;

  if (yy - 150 < 40) {
    const next = doc.addPage([PAGE_W, PAGE_H]);
    drawBand(next, fonts, label, documentNo);
    page = next;
    yy = TOP - 12;
  }

  // ---------- resumo de impostos + totais ----------
  const sumW = (CONTENT_W - 16) / 2;
  const sumH = summary.length ? 38 + summary.length * 17 + 6 : 46;
  drawPanel(page, MARGIN, yy - sumH, sumW, sumH);
  draw(page, "RESUMO DE IMPOSTOS", fonts.medium, 7, MARGIN + 12, yy - 14, C.primary);
  let sy = yy - 28;
  if (!summary.length) {
    draw(page, "Sem impostos aplicáveis", fonts.regular, 8, MARGIN + 12, sy - 12, C.muted);
  } else {
    for (const t of summary) {
      draw(page, `Base tributável · taxa ${t.rate}%`, fonts.regular, 8, MARGIN + 12, sy, C.muted);
      drawRight(page, fmtMoney(t.baseCents), fonts.regular, 8, MARGIN + sumW - 12, sy, C.ink);
      sy -= 17;
    }
    drawLine(page, MARGIN + 12, sy + 4, MARGIN + sumW - 12, sy + 4);
    sy -= 4;
    draw(page, "IVA liquidado", fonts.medium, 8.5, MARGIN + 12, sy, C.ink);
    drawRight(page, fmtMoney(input.taxTotal), fonts.medium, 8.5, MARGIN + sumW - 12, sy, C.ink);
  }

  const totalX = MARGIN + sumW + 16;
  const totalW = CONTENT_W - sumW - 16;
  const totals: Array<[string, number, boolean]> = [
    ["Subtotal (líquido)", input.subtotal, false],
    ["Desconto(s)", -input.discountTotal, false],
    ["IVA", input.taxTotal, false],
  ];
  const totalListH = totals.length * 16 + 12;
  const grandH = 30;
  drawPanel(page, totalX, yy - totalListH, totalW, totalListH);
  let ty = yy - 16;
  for (const [name, value] of totals) {
    draw(page, name, fonts.regular, 8, totalX + 12, ty, C.muted);
    drawRight(page, fmtMoney(value), fonts.regular, 8, totalX + totalW - 12, ty, C.ink);
    ty -= 16;
  }
  page.drawRectangle({ x: totalX, y: yy - totalListH - grandH, width: totalW, height: grandH, color: C.primary });
  draw(page, "TOTAL A PAGAR", fonts.medium, 8.5, totalX + 12, yy - totalListH - grandH + 10, C.white);
  drawRight(page, `${fmtMoney(input.total)} ${currency}`, fonts.bold, 12, totalX + totalW - 12, yy - totalListH - grandH + 7, C.white);

  yy -= totalListH + grandH + 24;

  // ---------- consulta pública + assinatura ----------
  let infoY = yy;
  if (infoY - 86 < 44) {
    const next = doc.addPage([PAGE_W, PAGE_H]);
    drawBand(next, fonts, label, documentNo);
    infoY = TOP - 12;
  }
  const infoPg = doc.getPage(doc.getPageCount() - 1);
  drawPanel(infoPg, MARGIN, infoY - 84, CONTENT_W, 84);
  draw(infoPg, "CONSULTA PÚBLICA NA AGT", fonts.medium, 7, MARGIN + 12, infoY - 14, C.primary);
  draw(infoPg, "Verifique a validação no quiosque oficial da AGT usando o nº do documento e o NIF do emitente:", fonts.regular, 8, MARGIN + 12, infoY - 29, C.muted);
  draw(infoPg, truncate(sanitize(input.qrUrl || "") || "—", fonts.mono, 7, CONTENT_W - 24), fonts.mono, 7, MARGIN + 12, infoY - 41, C.ink);
  draw(infoPg, "Assinatura digital do documento (JWS RS256):", fonts.regular, 8, MARGIN + 12, infoY - 54, C.muted);
  draw(infoPg, truncate(sanitize(input.signature || "") || "—", fonts.mono, 7, CONTENT_W - 24), fonts.mono, 7, MARGIN + 12, infoY - 66, C.ink);

  // ---------- notas legais (no fim da última página útil) ----------
  let noteY = infoY - 96;
  if (noteY - 40 < 46) {
    draw(infoPg, sanitize(notesLine(emitter, settings)[0]), fonts.regular, 7, MARGIN, noteY - 10, C.muted);
  } else {
    draw(infoPg, "NOTAS", fonts.medium, 7, MARGIN + 12, noteY - 10, C.primary);
    noteY -= 14;
    for (const note of notesLine(emitter, settings)) {
      const wrapped = wrap(note, fonts.regular, 7, CONTENT_W - 24);
      for (const line of wrapped) {
        draw(infoPg, line, fonts.regular, 7, MARGIN + 12, noteY - 10, C.muted);
        noteY -= 10.5;
      }
      noteY -= 3;
    }
  }

  // ---------- rodapé em todas as páginas ----------
  for (let i = 0; i < doc.getPageCount(); i++) {
    drawFooter(doc.getPage(i), fonts, i + 1, doc.getPageCount(), input.agtRequestId);
  }

  return doc.save();
}

function notesLine(emitter: Record<string, any>, settings?: PdfSettings): string[] {
  const product = settings?.productId
    ? ` Documento gerado por ${settings.productId}${settings.productVersion ? ` v${settings.productVersion}` : ""}.`
    : "";
  const cert = settings?.softwareValidationNumber ? ` Software certificado pela AGT n.º ${settings.softwareValidationNumber}.` : "";
  return [
    "Documento fiscal electrónico emitido no âmbito do Regime Jurídico das Faturas (Decreto Presidencial n.º 71/25) e do Executivo n.º 683/2025 da AGT. Valores em AOA (kwanza), conforme o resumo de impostos.",
    `Emitente: ${emitter.legalName || "-"} · NIF ${emitter.nif || "-"}.${cert}${product}`,
    "Antes de qualquer utilização contabilística, confirme a validação oficial no quiosque AGT ou no Portal do Contribuinte.",
  ];
}

// ---------- fontes ----------

async function loadFont(
  doc: PDFDocument,
  weight: "400Regular" | "600SemiBold" | "700Bold",
  fallback: StandardFonts
): Promise<PDFFont> {
  const files = {
    "400Regular": "Inter_400Regular.ttf",
    "600SemiBold": "Inter_600SemiBold.ttf",
    "700Bold": "Inter_700Bold.ttf",
  };
  try {
    const require = createRequire(__filename);
    const base = require.resolve("@expo-google-fonts/inter/package.json");
    const dir = base.replace(/package\.json$/, "");
    return await doc.embedFont(readFileSync(`${dir}${weight}/${files[weight]}`));
  } catch {
    return doc.embedFont(fallback);
  }
}