// Mapeamento do estado devolvido pela AGT para agtStatus do documento.
// O modelo é assíncrono: registarFactura devolve requestID e a validação é
// obtida por obterEstado (resultCode) ou por notificação callback
// (documentStatus V/I).

export type AgtDocumentStatus = {
  documentNo?: string;
  documentNumber?: string;
  documentStatus?: string; // V | I
  status?: string; // variante usada por alguns payloads de notificação
  state?: string; // variante usada por alguns payloads de notificação
  errorCode?: string;
  errorList?: Array<{ errorCode?: string; errorDescription?: string }> | null;
};

// Estado a partir do resultado do serviço obterEstado (polling).
export function mapAgtResultStatus(
  resultCode: string | undefined,
  documentStatusList: AgtDocumentStatus[]
): string {
  if (!resultCode) return "SUBMITTED";
  if (resultCode === "0") return "VALID";
  if (resultCode === "1") {
    return documentStatusList.some(
      (d) => d.documentStatus === "I" || d.documentStatus === "INVALID"
    )
      ? "INVALID"
      : "VALID";
  }
  if (resultCode === "2") return "INVALID";
  if (resultCode === "7" || resultCode === "8") return "SUBMITTED";
  if (resultCode === "9" || resultCode === "99") return "FAILED";
  return "SUBMITTED";
}

// Estado a partir de uma notificação callback da AGT (documentStatus V/I).
export function mapAgtNotificationStatus(
  state: string | undefined | null,
  errored: boolean
): string {
  const s = (state || "").toUpperCase();
  if (s === "V" || s === "VALID") return "VALID";
  if (s === "I" || s === "INVALID") return "INVALID";
  if (errored) return "FAILED";
  return "SUBMITTED";
}