import { Hono } from 'hono'
import { E2EManager } from '@/security/e2e-manager'

const securityRoutes = new Hono()

/**
 * POST /api/security/handshake
 * Cliente inicia handshake enviando sua public key
 * Servidor responde com sua public key + sessionId
 */
securityRoutes.post('/handshake', async (c) => {
  try {
    const body = await c.req.json()
    const { clientPublicKey } = body

    if (!clientPublicKey) {
      return c.json({ error: 'clientPublicKey is required' }, 400)
    }

    // Registrar cliente e obter sessionId
    const sessionId = E2EManager.registerClient(clientPublicKey)

    return c.json({
      success: true,
      sessionId,
      serverPublicKey: E2EManager.getServerPublicKey(),
      message: 'E2E handshake successful',
    })
  } catch (error: any) {
    console.error('Handshake error:', error)
    return c.json({ error: error.message }, 500)
  }
})

/**
 * GET /api/security/public-key
 * Retorna public key do servidor (sem E2E, é pública)
 */
securityRoutes.get('/public-key', (c) => {
  return c.json({
    publicKey: E2EManager.getServerPublicKey(),
    timestamp: Date.now(),
  })
})

/**
 * GET /api/security/status
 * Debug: status da E2E encryption
 */
securityRoutes.get('/status', (c) => {
  return c.json({
    status: 'active',
    ...E2EManager.getStats(),
  })
})

export default securityRoutes
