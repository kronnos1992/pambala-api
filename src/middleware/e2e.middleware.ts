import { Context, Next } from 'hono'
import { E2EManager } from '@/security/e2e-manager'

/**
 * Middleware que descriptografa requisições E2E
 */
export async function e2eDecryptMiddleware(c: Context, next: Next) {
  // Rotas que NÃO precisam de descriptografia
  const skipRoutes = [
    '/api/security/handshake',
    '/api/security/public-key',
    '/api/health',
    '/uploads',
    '/api/uploads',
  ]

  const shouldSkip = skipRoutes.some((route) => c.req.path.startsWith(route))

  if (shouldSkip) {
    return next()
  }

  try {
    const sessionId = c.req.header('X-Session-ID')

    // Se é POST/PUT/PATCH, descriptografa body se estiver criptografado
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      const contentType = c.req.header('Content-Type') || ''
      
      if (contentType.includes('application/json')) {
        let body: any
        try {
          body = await c.req.json()
        } catch {
          body = null
        }

        if (body && typeof body === 'object' && body.encrypted && body.nonce) {
          if (!sessionId) {
            return c.json({ error: 'Missing X-Session-ID header' }, 401)
          }

          try {
            const decryptedData = E2EManager.decryptFromClient(
              body.encrypted,
              body.nonce,
              sessionId
            )

            // Parsear JSON descriptografado
            const parsed = JSON.parse(decryptedData)

            // Injetar no Hono c.req para garantir que c.req.json() e text() devolvam dados descriptografados
            c.req.json = async () => parsed
            c.req.text = async () => decryptedData

            const req = c.req as any
            if (req.bodyCache) {
              req.bodyCache.text = Promise.resolve(decryptedData)
              req.bodyCache.json = Promise.resolve(parsed)
            }

            ;(c.req as any).cachedBody = parsed
            ;(c as any).isEncryptedRequest = true
          } catch (error: any) {
            console.error('E2E Decryption error:', error.message)
            return c.json({ error: `Decryption failed: ${error.message}` }, 400)
          }
        } else if (body !== null) {
          // Payload JSON simples (não encriptado): garantir que c.req.json() continue a devolver o body lido
          c.req.json = async () => body
        }
      }
    }

    // Adicionar sessionId no contexto se disponível
    if (sessionId) {
      ;(c as any).sessionId = sessionId
    }

    return next()
  } catch (error: any) {
    console.error('E2E Middleware error:', error)
    return c.json({ error: 'Internal security error' }, 500)
  }
}

/**
 * Middleware que criptografa respostas E2E
 */
export function e2eEncryptMiddleware() {
  return async (c: Context, next: Next) => {
    // Rotas que não precisam criptografar
    const skipRoutes = ['/api/health', '/uploads', '/api/uploads']
    const shouldSkip = skipRoutes.some((route) => c.req.path.startsWith(route))

    if (shouldSkip) {
      return next()
    }

    await next()

    const sessionId = (c as any).sessionId
    const isEncrypted = (c as any).isEncryptedRequest

    // Se houver sessionId, a requisição veio criptografada e resposta for JSON, criptografa
    if (sessionId && isEncrypted && c.res.status >= 200 && c.res.status < 300) {
      const contentType = c.res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        try {
          const responseText = await c.res.text()
          const { encrypted, nonce } = E2EManager.encryptForClient(
            responseText,
            sessionId
          )

          c.res = c.json({ encrypted, nonce } as any, c.res.status as any)
          return c.res
        } catch (error: any) {
          console.error('E2E Encryption error:', error)
          return c.json(
            { error: `Response encryption failed: ${error.message}` } as any,
            500 as any
          )
        }
      }
    }
  }
}
