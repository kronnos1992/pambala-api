import nacl from 'tweetnacl'
import { randomBytes } from 'crypto'

interface ClientSession {
  clientPublicKey: string
  createdAt: number
  lastActivity: number
}

export class E2EManager {
  private static serverKeyPair: nacl.BoxKeyPair | null = null
  private static clientSessions = new Map<string, ClientSession>()
  private static SESSION_TIMEOUT = 24 * 60 * 60 * 1000 // 24 horas

  /**
   * Inicializa manager (run once na startup)
   */
  static init() {
    if (!this.serverKeyPair) {
      this.serverKeyPair = nacl.box.keyPair()
      console.log('✅ E2E Manager initialized - Server keys generated')
    }
    this.cleanupExpiredSessions()
  }

  /**
   * Retorna public key do servidor
   */
  static getServerPublicKey(): string {
    if (!this.serverKeyPair) this.init()
    return Buffer.from(this.serverKeyPair!.publicKey).toString('base64')
  }

  /**
   * Registra novo cliente (handshake)
   */
  static registerClient(clientPublicKeyB64: string): string {
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
   * Verifica se sessão é válida
   */
  static isValidSession(sessionId: string): boolean {
    const session = this.clientSessions.get(sessionId)
    if (!session) return false

    const age = Date.now() - session.createdAt
    return age < this.SESSION_TIMEOUT
  }

  /**
   * Descriptografa dados recebidos do cliente
   */
  static decryptFromClient(
    encryptedB64: string,
    nonceB64: string,
    sessionId: string
  ): string {
    if (!this.serverKeyPair) this.init()

    const session = this.clientSessions.get(sessionId)
    if (!session) {
      throw new Error(`Invalid session: ${sessionId}`)
    }

    if (!this.isValidSession(sessionId)) {
      throw new Error('Session expired')
    }

    try {
      const encrypted = Buffer.from(encryptedB64, 'base64')
      const nonce = Buffer.from(nonceB64, 'base64')
      const clientPublicKey = Buffer.from(session.clientPublicKey, 'base64')

      const decrypted = nacl.box.open(
        encrypted,
        nonce,
        clientPublicKey,
        this.serverKeyPair!.secretKey
      )

      if (!decrypted) {
        throw new Error('Decryption returned null')
      }

      // Atualizar last activity
      session.lastActivity = Date.now()

      return Buffer.from(decrypted).toString('utf-8')
    } catch (error: any) {
      console.error('Decryption error:', error.message)
      throw new Error(`Decryption failed: ${error.message}`)
    }
  }

  /**
   * Criptografa respostas para cliente
   */
  static encryptForClient(plaintext: string, sessionId: string): {
    encrypted: string
    nonce: string
  } {
    if (!this.serverKeyPair) this.init()

    const session = this.clientSessions.get(sessionId)
    if (!session) {
      throw new Error(`Invalid session: ${sessionId}`)
    }

    try {
      const nonce = nacl.randomBytes(24)
      const clientPublicKey = Buffer.from(session.clientPublicKey, 'base64')

      const encrypted = nacl.box(
        Buffer.from(plaintext),
        nonce,
        clientPublicKey,
        this.serverKeyPair!.secretKey
      )

      // Atualizar last activity
      session.lastActivity = Date.now()

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
   * Remove sessões expiradas (cleanup)
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
  static getStats() {
    return {
      activeSessions: this.clientSessions.size,
      serverPublicKey: this.getServerPublicKey().slice(0, 16) + '...',
    }
  }
}

// Inicializar na importação
E2EManager.init()
