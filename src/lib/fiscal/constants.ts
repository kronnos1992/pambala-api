export const VAT_REGIMES = [
  "GERAL",
  "SIMPLIFICADO",
  "EXCLUIDO",
  "ISENTO",
] as const;

// Tipos de documentos fiscais (DE 683/25).
export const INVOICE_DOCUMENT_TYPES = [
  "FA", // Factura de Adiantamento
  "FT", // Factura
  "FR", // Factura/Recibo
  "FG", // Factura Global
  "GF", // Factura Genérica
  "AC", // Aviso de Cobrança
  "AR", // Aviso de Cobrança/Recibo
  "TV", // Talão de Venda
  "RC", // Recibo Emitido
  "RG", // Recibo
  "RE", // Estorno ou Recibo de Estorno
  "ND", // Nota de Débito
  "NC", // Nota de Crédito
  "AF", // Factura/Recibo de Autofacturação
  "RP", // Prémio ou Recibo de Prémio
  "RA", // Resseguro Aceite
  "CS", // Imputação a Co-seguradoras
  "LD", // Imputação a Co-seguradora Líder
] as const;

export const INVOICE_STATUSES = ["ACTIVE", "VOID"] as const;

export const SERIES_STATUSES = [
  "PENDING", // pedido de série enviado à AGT
  "OPEN",
  "CLOSED",
  "CANCELLED",
  "REJECTED",
] as const;

// Estado fiscal do documento face à validação da AGT (modelo assíncrono:
// registarFactura devolve requestID; obterEstado informa V/I).
export const AGT_STATUSES = [
  "PENDING",
  "SUBMITTED", // registado na AGT, validação diferida
  "VALID", // obterEstado → documentStatus V
  "INVALID", // obterEstado → documentStatus I
  "REJECTED", // registarFactura devolveu 400/errorList
  "FAILED", // falha de comunicação
] as const;

export const VALID_TAX_RATES = [0, 5, 7, 14] as const;

// taxCode do IVA por taxa (anexo DE 683/25): NOR normal | INT intermédia |
// RED reduzida | ISE isento | OUT outra.
export const IVA_TAX_CODE_BY_RATE: Record<number, string> = {
  14: "NOR",
  7: "INT",
  5: "RED",
};

// operationType das linhas (DE 683/25).
export const OPERATION_TYPES = [
  "SE", // serviços de educação
  "SS", // serviços de saúde
  "STP", // transporte de passageiros
  "SR", // royalties
  "SIF", // intermediação financeira/seguros
  "SHS", // hotelaria e similares
  "ST", // telecomunicações
  "SG", // serviço geral
  "TB", // transmissão de bens
  "AS", // arrendamento/subarrendamento
  "QT", // quotas
  "RD", // repasse de despesas
] as const;

export const MAX_SERIES_PER_ESTABLISHMENT = 50;

// documentNo: "FT FT6325S2C/10006" → "<tipo> <códigoSérieAGTN>/<seq>"
export function buildDocumentNo(
  documentType: string,
  agtSeriesCode: string,
  sequence: number
): string {
  return `${documentType} ${agtSeriesCode}/${sequence}`;
}

// Código de série de contingência (dev-offline, quando a AGT não está configurada).
// Formato aproximado ao atribuído pela AGT: <tipo><ano 2 dígitos>S<seq>N.
export function buildOfflineSeriesCode(
  documentType: string,
  year: number,
  sequence: number
): string {
  const yy = String(year).slice(-2);
  return `${documentType}${yy}S${String(sequence).padStart(3, "0")}N`;
}

export const FISCAL_SETTINGS_ID = "global";

// NIF padrão para compradores domésticos não identificados.
export const UNKNOWN_CUSTOMER_TAX_ID = "999999999";
export const DOMESTIC_COUNTRY = "AO";

// Base da URL pública de consulta do documento (especificação do QR Code).
export const AGT_QR_BASE_URL =
  "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe";

// Endpoints da API de Faturação Electrónica (relativos a agtBaseUrl).
export const AGT_ENDPOINTS = {
  registarFactura: "/sigt/fe/v1/registarFactura",
  obterEstado: "/sigt/fe/v1/obterEstado",
  solicitarSerie: "/sigt/fe/v1/solicitarSerie",
  listarSeries: "/sigt/fe/v1/listarSeries",
  consultarFatura: "/sigt/fe/v1/consultarFatura",
} as const;

// Código de alternativa de isenção usado em modo de desenvolvimento quando o
// perfil fiscal não define um código válido (anexo 6.4 do DE 683/25).
export const OFFLINE_EXEMPTION_CODE = "DEV";

export type VatRegime = (typeof VAT_REGIMES)[number];
export type InvoiceDocumentType = (typeof INVOICE_DOCUMENT_TYPES)[number];