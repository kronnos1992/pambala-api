import nacl from "tweetnacl";
import { randomBytes } from "crypto";

/**
 * Durable Object que centraliza o estado E2E da API:
 *  - keypair do servidor (gerado uma única vez e persistido)
 *  - sessões de clientes (clientPublicKey + timestamps)
 *
 * Em Cloudflare Workers cada request pode cair num isolate diferente, e a
 * memória é por-isolate. Sem estado partilhado, as sessões E2E 'desapareciam'
 * entre requests, causando 400 "Decryption failed: Invalid session". Este DO
 * garante que TODOS os isolates veem o MESMO keypair e as MESMAS sessões.
 */

interface StoredClientSession {
  clientPublicKey: string;
  createdAt: number;
  lastActivity: number;
}

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 horas
const SERVER_KEYPAIR_KEY = "e2e_server_keypair";
const SESSION_PREFIX = "e2e_session:";

export class E2EStateDO {
  private state: any;
  private env: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    try {
      switch (action) {
        case "getServerKeyPair":
          return await this.getServerKeyPair();

        case "registerClient":
          return await this.registerClient(request);

        case "getSession":
          return await this.getSession(url.searchParams.get("sessionId"));

        case "stats":
          return await this.stats();

        default:
          return this.json({ error: "Unknown action" }, 400);
      }
    } catch (error: any) {
      return this.json(
        { error: error?.message || "E2E Durable Object error" },
        500
      );
    }
  }

  /**
   * Keypair do servidor: gerado uma única vez e persistido no storage do DO.
   * Todos os isolates vão buscar o MESMO keypair → encriptação/descriptação
   * funciona de forma consistente.
   */
  private async getServerKeyPair(): Promise<Response> {
    const storage = this.state.storage;
    let keypair: { publicKeyBase64: string; secretKeyBase64: string } | undefined =
      await storage.get(SERVER_KEYPAIR_KEY);

    if (!keypair) {
      const fresh = nacl.box.keyPair();
      keypair = {
        publicKeyBase64: Buffer.from(fresh.publicKey).toString("base64"),
        secretKeyBase64: Buffer.from(fresh.secretKey).toString("base64"),
      };
      await storage.put(SERVER_KEYPAIR_KEY, keypair);
    }

    return this.json(keypair);
  }

  private async registerClient(request: Request): Promise<Response> {
    const storage = this.state.storage;
    const body: any = await request.json().catch(() => null);
    const clientPublicKey = body?.clientPublicKey;

    if (!clientPublicKey) {
      return this.json({ error: "clientPublicKey is required" }, 400);
    }

    const sessionId = randomBytes(32).toString("hex");
    await storage.put(`${SESSION_PREFIX}${sessionId}`, {
      clientPublicKey,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    } satisfies StoredClientSession);

    // Agendar cleanup diário (apenas uma alarm por DO)
    if (!(await storage.getAlarm())) {
      await storage.setAlarm(Date.now() + SESSION_TIMEOUT);
    }

    return this.json({ sessionId });
  }

  private async getSession(
    sessionId: string | null
  ): Promise<Response> {
    const storage = this.state.storage;
    if (!sessionId) {
      return this.json({ error: "sessionId is required" }, 400);
    }

    const session = (await storage.get(
      `${SESSION_PREFIX}${sessionId}`
    )) as StoredClientSession | undefined;

    if (!session) {
      return this.json({ error: `Invalid session: ${sessionId}` }, 400);
    }

    const age = Date.now() - session.createdAt;
    if (age > SESSION_TIMEOUT) {
      await storage.delete(`${SESSION_PREFIX}${sessionId}`);
      return this.json({ error: "Session expired" }, 400);
    }

    await storage.put(`${SESSION_PREFIX}${sessionId}`, {
      ...session,
      lastActivity: Date.now(),
    });

    return this.json({ clientPublicKey: session.clientPublicKey });
  }

  /**
   * Limpa sessões expiradas. Agenda novo run de 24h (alarm é substituído).
   */
  async alarm(): Promise<void> {
    const storage = this.state.storage;
    const list = await storage.list({ prefix: SESSION_PREFIX });
    const now = Date.now();

    for (const [key, session] of list) {
      const data = session as StoredClientSession;
      if (now - data.createdAt > SESSION_TIMEOUT) {
        await storage.delete(key);
      }
    }

    await storage.setAlarm(Date.now() + SESSION_TIMEOUT);
  }

  private async stats(): Promise<Response> {
    const storage = this.state.storage;
    const list = await storage.list({ prefix: SESSION_PREFIX });
    const keypair = await storage.get(SERVER_KEYPAIR_KEY);

    return this.json({
      activeSessions: list.size,
      serverPublicKey: keypair
        ? keypair.publicKeyBase64.slice(0, 16) + "..."
        : "not-generated",
    });
  }

  private json(data: any, status = 200): Response {
    return Response.json(data, { status });
  }
}