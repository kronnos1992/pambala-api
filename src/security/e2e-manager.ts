import nacl from 'tweetnacl'
import { randomBytes } from 'crypto'

interface ClientSession {
  clientPublicKey: string
  createdAt: number
  lastActivity: number
}

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 horas
const DO_INSTANCE_NAME = 'global'

/**
 * Gestor E2E.
 *
 * Em produção (Cloudflare Workers) o estado é centralizado num Durable Object
 * (`E2EStateDO`), porque a memória do Worker é por-isolate e as sessões "em
 * memória" desapareciam entre requests (→ 400 "Invalid session").
 *
 * Em desenvolvimento local (node server sem binding DO) usa-se o fallback em
 * memória, com o mesmo comportamento de antes.
 */
export class E2EManager {
  private static serverKeyPair: nacl.BoxKeyPair | null = null
  private static clientSessions = new Map<string, ClientSession>()
  private static SESSION_TIMEOUT = SESSION_TIMEOUT

  /**
   * Inicializa manager (only no fallback local).
   */
  static init() {
    if (!this.serverKeyPair) {
      this.serverKeyPair = nacl.box.keyPair()
      console.log('✅ E2E Manager initialized - Server keys generated')
    }
    this.cleanupExpiredSessions()
  }

  /**
   * Devolve o stub do Durable Object quando o binding existe (produção).
   */
  private static getDo(env: any): any {
    if (!env || !env.E2E_STATE) return null
    const ns = env.E2E_STATE
    return ns.get(ns.idFromName(DO_INSTANCE_NAME))
  }

  /**
   * Keypair do servidor compartilhado. Carrega do DO uma única vez por
   * isolate e cacheia (o valor é imutável e igual em todos os isolates).
   */
  private static async loadServerKeyPair(env?: any): Promise<nacl.BoxKeyPair> {
    if (this.serverKeyPair) return this.serverKeyPair

    const doStub = this.getDo(env)
    if (doStub) {
      const res = await doStub.fetch(
        'https://e2e-state.internal/?action=getServerKeyPair'
      )
      if (!res.ok) {
        throw new Error('Failed to load server keypair from Durable Object')
      }
      const data: any = await res.json()
      this.serverKeyPair = {
        publicKey: Buffer.from(data.publicKeyBase64, 'base64'),
        secretKey: Buffer.from(data.secretKeyBase64, 'base64'),
      }
      return this.serverKeyPair
    }

    if (!this.serverKeyPair) this.init()
    return this.serverKeyPair!
  }

  /**
   * Retorna public key do servidor
   */
  static async getServerPublicKey(env?: any): Promise<string> {
    const kp = await this.loadServerKeyPair(env)
    return Buffer.from(kp.publicKey).toString('base64')
  }

  /**
   * Registra novo cliente (handshake)
   */
  static async registerClient(
    env: any,
    clientPublicKeyB64: string
  ): Promise<string> {
    const doStub = this.getDo(env)
    if (doStub) {
      const res = await doStub.fetch(
        'https://e2e-state.internal/?action=registerClient',
        {
          method: 'POST',
          body: JSON.stringify({ clientPublicKey: clientPublicKeyB64 }),
        }
      )
      const data: any = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'registerClient failed')
      }
      return data.sessionId
    }

    if (!this.serverKeyPair) this.init()
    const sessionId = randomBytes(32).toString('hex')
    this.clientSessions.set(sessionId, {
      clientPublicKey: clientPublicKeyB64,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    })
    console.log(`✅ Client registered - Session: ${sessionId.slice(0, 8)}...`)
    return sessionId
  }

  /**
   * Devolve a clientPublicKey associada a uma sessão válida.
   */
  private static async getSession(
    env: any,
    sessionId: string
  ): Promise<{ clientPublicKey: string }> {
    const doStub = this.getDo(env)
    if (doStub) {
      const res = await doStub.fetch(
        `https://e2e-state.internal/?action=getSession&sessionId=${encodeURIComponent(
          sessionId
        )}`
      )
      const data: any = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || `Invalid session: ${sessionId}`)
      }
      return data
    }

    const session = this.clientSessions.get(sessionId)
    if (!session) {
      throw new Error(`Invalid session: ${sessionId}`)
    }
    const age = Date.now() - session.createdAt
    if (age > this.SESSION_TIMEOUT) {
      throw new Error('Session expired')
    }
    return { clientPublicKey: session.clientPublicKey }
  }

  /**
   * Verifica se uma sessão está ativa e válida (sem lançar exceções).
   * Usado para decidir se respostas GET devem ser cifradas.
   */
  static async hasValidSession(env: any, sessionId?: string): Promise<boolean> {
    if (!sessionId) return false
    try {
      await this.getSession(env, sessionId)
      return true
    } catch {
      return false
    }
  }

  /**
   * Descriptografa dados recebidos do cliente
   */
  static async decryptFromClient(
    env: any,
    encryptedB64: string,
    nonceB64: string,
    sessionId: string
  ): Promise<string> {
    const keypair = await this.loadServerKeyPair(env)
    const { clientPublicKey } = await this.getSession(env, sessionId)

    try {
      const encrypted = Buffer.from(encryptedB64, 'base64')
      const nonce = Buffer.from(nonceB64, 'base64')
      const clientPublicKeyBytes = Buffer.from(clientPublicKey, 'base64')

      const decrypted = nacl.box.open(
        encrypted,
        nonce,
        clientPublicKeyBytes,
        keypair.secretKey
      )

      if (!decrypted) {
        throw new Error('Decryption returned null')
      }

      return Buffer.from(decrypted).toString('utf-8')
    } catch (error: any) {
      console.error('Decryption error:', error.message)
      throw new Error(`Decryption failed: ${error.message}`)
    }
  }

  /**
   * Criptografa respostas para cliente
   */
  static async encryptForClient(
    env: any,
    plaintext: string,
    sessionId: string
  ): Promise<{ encrypted: string; nonce: string }> {
    const keypair = await this.loadServerKeyPair(env)
    const { clientPublicKey } = await this.getSession(env, sessionId)

    try {
      const nonce = nacl.randomBytes(24)
      const clientPublicKeyBytes = Buffer.from(clientPublicKey, 'base64')

      const encrypted = nacl.box(
        Buffer.from(plaintext),
        nonce,
        clientPublicKeyBytes,
        keypair.secretKey
      )

      return {
        encrypted: Buffer.from(encrypted).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
      }
    } catch (error: any) {
      console.error('Encryption error:', error.message)
      throw new Error(`Encryption failed: ${error.message}`)
    }
  }

  /**
   * Remove sessões expiradas (apenas fallback local)
   */
  private static cleanupExpiredSessions() {
    let removed = 0
    for (const [sessionId, session] of this.clientSessions.entries()) {
      const age = Date.now() - session.createdAt
      if (age > this.SESSION_TIMEOUT) {
        this.clientSessions.delete(sessionId)
        removed++
      }
    }
    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} expired sessions`)
    }
  }

  /**
   * Retorna stats de sessões (para debug)
   */
  static async getStats(env?: any) {
    const doStub = this.getDo(env)
    if (doStub) {
      const res = await doStub.fetch(
        'https://e2e-state.internal/?action=stats'
      )
      return res.ok ? res.json() : { activeSessions: -1, serverPublicKey: 'error' }
    }
    const publicKey = await this.getServerPublicKey(env)
    return {
      activeSessions: this.clientSessions.size,
      serverPublicKey: publicKey.slice(0, 16) + '...',
    }
  }
}