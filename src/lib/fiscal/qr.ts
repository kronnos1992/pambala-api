import { AGT_QR_BASE_URL } from "./constants";

// Especificação oficial do QR Code (AGT): codifica a URL pública de consulta
//          ?emissor=<NIF>&document=<documentNo>
// Os espaços do documentNo são substituídos por %20. Na impressão, o QR deve ser
// Model 2 / versão 4 / correção M / modo Byte / PNG 350x350 com logo da AGT.
export function buildAgtQrUrl(emitterNif: string, documentNo: string): string {
  // encodeURIComponent codifica espaços como %20 (exigência da spec).
  const emissor = encodeURIComponent(emitterNif);
  const document = encodeURIComponent(documentNo);
  return `${AGT_QR_BASE_URL}?emissor=${emissor}&document=${document}`;
}