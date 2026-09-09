export interface AgtCommunication {
  accepted: boolean;
  reference?: string;
  response: string;
  httpStatus?: number;
}

export class AgtClient {
  async communicate(
    settings: {
      agtBaseUrl?: string | null;
      agtApiToken?: string | null;
    },
    payload: Record<string, unknown>,
    documentId: string
  ): Promise<AgtCommunication> {
    if (!settings.agtBaseUrl) {
      return {
        accepted: true,
        reference: "dev-offline",
        response:
          "AGT não configurado (agtBaseUrl vazio) — documento aceite em modo de desenvolvimento.",
      };
    }

    const base = settings.agtBaseUrl.replace(/\/+$/, "");
    const url = `${base}/invoices`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: settings.agtApiToken
            ? `Bearer ${settings.agtApiToken}`
            : "",
        },
        body: JSON.stringify({ invoiceId: documentId, payload }),
      });

      const raw = await response.text();
      let parsed: any = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = { raw };
      }

      const accepted = response.ok && parsed.accepted !== false;
      return {
        accepted,
        reference: parsed.reference ?? parsed.invoiceId ?? null,
        response: raw,
        httpStatus: response.status,
      };
    } catch (err: any) {
      return {
        accepted: false,
        response: err?.message || "Falha de comunicação com a AGT",
      };
    }
  }
}