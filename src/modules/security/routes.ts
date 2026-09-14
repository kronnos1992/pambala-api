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
    const sessionId = await E2EManager.registerClient(c.env, clientPublicKey)
    const serverPublicKey = await E2EManager.getServerPublicKey(c.env)

    return c.json({
      success: true,
      sessionId,
      serverPublicKey,
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
securityRoutes.get('/public-key', async (c) => {
  return c.json({
    publicKey: await E2EManager.getServerPublicKey(c.env),
    timestamp: Date.now(),
  })
})

/**
 * GET /api/security/status
 * Debug: status da E2E encryption
 */
securityRoutes.get('/status', async (c) => {
  return c.json({
    status: 'active',
    ...(await E2EManager.getStats(c.env)),
  })
})

export default securityRoutes
