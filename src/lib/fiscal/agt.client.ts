import { randomUUID } from "node:crypto";
import { AGT_ENDPOINTS } from "./constants";
import { signJws } from "./signing";

// Cliente da API de Facturação Electrónica da AGT (DE 683/25).
// Autenticação: Basic Auth (credenciais emitidas pela AGT ao produtor de software).
// Modelo: solicitarSerie (síncrono) · registarFactura (devolve requestID)
//         · obterEstado (validação diferida → V/I).

export interface AgtSettings {
  agtBaseUrl?: string | null;
  agtUsername?: string | null;
  agtPassword?: string | null;
  productId?: string;
  productVersion?: string;
  softwareValidationNumber?: string | null;
  signatureKeyPem?: string | null;
  signatureVersion?: number;
  schemaVersion?: string;
}

export interface AgtRegisterResult {
  submitted: boolean;
  requestId?: string;
  httpStatus?: number;
  response: string;
  errorList?: Array<{ idError: string; descriptionError: string }>;
  offline: boolean;
}

export interface AgtDocumentStatus {
  documentNo: string;
  documentStatus: string; // V | I
  errorList?: Array<{ errorCode: string; errorDescription: string }>;
}

export interface AgtStatusResult {
  requestId?: string;
  resultCode?: string; // 0 | 1 | 2 | 7 | 8 | 9
  documentStatusList: AgtDocumentStatus[];
  response: string;
  httpStatus?: number;
  error?: string;
  offline?: boolean;
}

export interface AgtSeriesRequestInput {
  taxRegistrationNumber: string;
  seriesYear: number;
  documentType: string;
  establishmentNumber: string;
  seriesContingencyIndicator: "N" | "C";
  issuerPrivateKeyPem: string;
}

export interface AgtSeriesResult {
  seriesCode?: string;
  authorizedQuantity?: number;
  firstDocumentNo?: string;
  lastDocumentNo?: string;
  httpStatus?: number;
  response: string;
  errorList?: Array<{ idError: string; descriptionError: string }>;
  offline: boolean;
}

export class AgtClient {
  isConfigured(settings: AgtSettings): boolean {
    return Boolean(settings.agtBaseUrl);
  }

  private baseUrl(settings: AgtSettings): string {
    return String(settings.agtBaseUrl || "").replace(/\/+$/, "");
  }

  private authHeader(settings: AgtSettings): string {
    if (!settings.agtUsername && !settings.agtPassword) return "";
    const cred = `${settings.agtUsername ?? ""}:${settings.agtPassword ?? ""}`;
    return `Basic ${Buffer.from(cred, "utf8").toString("base64")}`;
  }

  softwareInfo(settings: AgtSettings) {
    const detail: Record<string, unknown> = {
      productId: settings.productId || "Pambala",
      productVersion: settings.productVersion || "1.0.0",
      softwareValidationNumber: settings.softwareValidationNumber || "",
      signatureVersion: settings.signatureVersion ?? 1,
    };
    const claim = {
      productId: detail.productId,
      productVersion: detail.productVersion,
      softwareValidationNumber: detail.softwareValidationNumber,
    };
    const privateKey = settings.signatureKeyPem || "";
    return {
      softwareInfoDetail: detail,
      jwsSoftwareSignature: privateKey ? signJws(claim, privateKey) : "",
    };
  }

  private async post(
    settings: AgtSettings,
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<{ status: number; raw: string; parsed: any }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const auth = this.authHeader(settings);
    if (auth) headers["Authorization"] = auth;

    const response = await fetch(`${this.baseUrl(settings)}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      parsed = { raw };
    }
    return { status: response.status, raw, parsed };
  }

  // -- registarFactura -------------------------------------------------------
  async registerInvoice(
    settings: AgtSettings,
    payload: Record<string, unknown>
  ): Promise<AgtRegisterResult> {
    if (!this.isConfigured(settings)) {
      return {
        submitted: true,
        requestId: "dev-offline",
        response:
          "AGT não configurado (agtBaseUrl vazio) — documento registado em modo de desenvolvimento.",
        offline: true,
      };
    }

    try {
      const { status, raw, parsed } = await this.post(
        settings,
        AGT_ENDPOINTS.registarFactura,
        payload
      );
      if (status === 200) {
        return {
          submitted: true,
          requestId: parsed.requestID ?? null,
          httpStatus: status,
          response: raw,
          offline: false,
          errorList: parsed.errorList ?? [],
        };
      }
      return {
        submitted: false,
        httpStatus: status,
        response: raw,
        errorList: parsed.errorList ?? [],
        offline: false,
      };
    } catch (err: any) {
      return {
        submitted: false,
        response: err?.message || "Falha de comunicação com a AGT",
        errorList: [
          {
            idError: "E99",
            descriptionError: err?.message || "Falha de comunicação com a AGT",
          },
        ],
        offline: false,
      };
    }
  }

  // -- obterEstado -----------------------------------------------------------
  async getInvoiceStatus(params: {
    settings: AgtSettings;
    taxRegistrationNumber: string;
    requestID: string;
    issuerPrivateKeyPem: string;
  }): Promise<AgtStatusResult> {
    const { settings, taxRegistrationNumber, requestID, issuerPrivateKeyPem } =
      params;
    if (!this.isConfigured(settings)) {
      return {
        requestId: requestID,
        resultCode: "0",
        documentStatusList: [],
        response:
          "AGT não configurado (agtBaseUrl vazio) — documento válido em modo de desenvolvimento.",
        offline: true,
      };
    }

    const claim = { taxRegistrationNumber, requestID };
    const jwsSignature = issuerPrivateKeyPem
      ? signJws(claim, issuerPrivateKeyPem)
      : "";

    const payload = {
      schemaVersion: settings.schemaVersion || "2.0",
      submissionUUID: randomUUID(),
      taxRegistrationNumber,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: this.softwareInfo(settings),
      jwsSignature,
      requestID,
    };

    try {
      const { status, raw, parsed } = await this.post(
        settings,
        AGT_ENDPOINTS.obterEstado,
        payload
      );
      return {
        requestId: parsed.requestID ?? parsed.requestId ?? requestID,
        resultCode: String(parsed.resultCode ?? ""),
        documentStatusList: Array.isArray(parsed.documentStatusList)
          ? parsed.documentStatusList
          : [],
        response: raw,
        httpStatus: status,
      };
    } catch (err: any) {
      return {
        requestId: requestID,
        documentStatusList: [],
        response: err?.message || "Falha de comunicação com a AGT",
        error: err?.message || "Falha de comunicação com a AGT",
      };
    }
  }

  // -- solicitarSerie --------------------------------------------------------
  async requestSeries(
    settings: AgtSettings,
    input: AgtSeriesRequestInput
  ): Promise<AgtSeriesResult> {
    const seriesYear = String(input.seriesYear);
    const claim = {
      taxRegistrationNumber: input.taxRegistrationNumber,
      seriesYear,
      documentType: input.documentType,
      establishmentNumber: input.establishmentNumber,
      seriesContingencyIndicator: input.seriesContingencyIndicator,
    };
    const jwsSignature = input.issuerPrivateKeyPem
      ? signJws(claim, input.issuerPrivateKeyPem)
      : "";

    if (!this.isConfigured(settings)) {
      // Sandbox local: sintetiza uma série compatível com o formato AGT.
      const seriesCode = `${input.documentType}${String(input.seriesYear).slice(
        -2
      )}S001N`;
      return {
        seriesCode,
        authorizedQuantity: 999_999_999_999,
        firstDocumentNo: "1",
        lastDocumentNo: "999999999999",
        response:
          "AGT não configurado (agtBaseUrl vazio) — série simulada em modo de desenvolvimento.",
        offline: true,
      };
    }

    const payload = {
      schemaVersion: settings.schemaVersion || "2.0",
      submissionUUID: randomUUID(),
      taxRegistrationNumber: input.taxRegistrationNumber,
      submissionTimeStamp: new Date().toISOString(),
      softwareInfo: this.softwareInfo(settings),
      seriesYear,
      documentType: input.documentType,
      establishmentNumber: input.establishmentNumber,
      jwsSignature,
      seriesContingencyIndicator: input.seriesContingencyIndicator,
    };

    try {
      const { status, raw, parsed } = await this.post(
        settings,
        AGT_ENDPOINTS.solicitarSerie,
        payload
      );
      if (status === 200) {
        const fe = parsed.seriesFEResult ?? {};
        return {
          seriesCode: fe.seriesCode ?? null,
          authorizedQuantity: fe.authorizedQuantity
            ? Number(fe.authorizedQuantity)
            : undefined,
          firstDocumentNo: fe.firstDocumentNo ?? undefined,
          lastDocumentNo: fe.lastDocumentNo ?? undefined,
          httpStatus: status,
          response: raw,
          offline: false,
        };
      }
      return {
        httpStatus: status,
        response: raw,
        errorList: parsed.errorList ?? [],
        offline: false,
      };
    } catch (err: any) {
      return {
        httpStatus: undefined,
        response: err?.message || "Falha de comunicação com a AGT",
        errorList: [
          {
            idError: "E99",
            descriptionError: err?.message || "Falha de comunicação com a AGT",
          },
        ],
        offline: false,
      };
    }
  }
}