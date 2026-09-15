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
    '/api/agent',
  ]

  const shouldSkip = skipRoutes.some((route) => c.req.path.startsWith(route))

  if (shouldSkip) {
    return next()
  }

  try {
    const sessionId = c.req.header('X-Session-ID')

    let bodyConsumed = false

    // Se é POST/PUT/PATCH, descriptografa body se estiver criptografado
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      const contentType = c.req.header('Content-Type') || ''
      
      if (contentType.includes('application/json')) {
        let body: any
        try {
          body = await c.req.json()
          bodyConsumed = true
        } catch {
          body = null
        }

        if (body && typeof body === 'object' && body.encrypted && body.nonce) {
          if (!sessionId) {
            return c.json({ error: 'Missing X-Session-ID header' }, 401)
          }

          try {
            const decryptedData = await E2EManager.decryptFromClient(
              c.env,
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

    // Envelope de query params e auth (qualquer método): nada deve trafegar em
    // claro — nem a query string nem o header Authorization.
    const e2eParamsHeader = c.req.header('X-E2E-Params')
    const e2eAuthHeader = c.req.header('X-E2E-Auth')

    if ((e2eParamsHeader || e2eAuthHeader) && sessionId) {
      let url: URL | null = null
      let headers: Headers | null = null

      if (e2eParamsHeader) {
        try {
          const { encrypted, nonce } = JSON.parse(e2eParamsHeader)
          const decrypted = await E2EManager.decryptFromClient(
            c.env,
            encrypted,
            nonce,
            sessionId
          )
          const params = JSON.parse(decrypted) as Record<string, unknown>

          url = new URL(c.req.raw.url)
          for (const [k, v] of Object.entries(params ?? {})) {
            if (v === undefined || v === null) continue
            if (Array.isArray(v)) {
              for (const item of v) url.searchParams.append(k, String(item))
            } else {
              url.searchParams.set(k, String(v))
            }
          }
        } catch (error: any) {
          console.error('E2E Params decryption error:', error.message)
          return c.json(
            { error: `Params decryption failed: ${error.message}` },
            400
          )
        }
      }

      if (e2eAuthHeader) {
        try {
          const { encrypted, nonce } = JSON.parse(e2eAuthHeader)
          const decrypted = await E2EManager.decryptFromClient(
            c.env,
            encrypted,
            nonce,
            sessionId
          )
          headers = new Headers(c.req.raw.headers)
          headers.set('Authorization', JSON.parse(decrypted))
        } catch (error: any) {
          console.error('E2E Auth decryption error:', error.message)
          return c.json(
            { error: `Auth decryption failed: ${error.message}` },
            400
          )
        }
      }

      const raw = c.req.raw
      const method = raw.method
      const noBody = ['GET', 'HEAD'].includes(method)

      ;(c.req as any).raw = new Request(url ? url.toString() : raw.url, {
        method,
        headers: headers ?? raw.headers,
        body: noBody || bodyConsumed ? undefined : raw.body,
      })
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
    const skipRoutes = ['/api/health', '/uploads', '/api/uploads', '/api/agent']
    const shouldSkip = skipRoutes.some((route) => c.req.path.startsWith(route))

    if (shouldSkip) {
      return next()
    }

    await next()

    const sessionId = (c as any).sessionId
    const isEncrypted = (c as any).isEncryptedRequest
    const isNoBody = ['GET', 'DELETE', 'HEAD'].includes(c.req.method)

    // Qualquer resposta (GET/DELETE/HEAD ou write com body cifrado) é cifrada
    // quando há sessão válida. Requests sem body usam 400 p/ self-heal quando a
    // sessão é inválida; writes sem body cifrado ficam plain (compatibilidade).
    if (sessionId && c.res.status >= 200 && c.res.status < 300) {
      const contentType = c.res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        if (isNoBody) {
          // Sessão inválida/expirada → 400 para o frontend re-executar
          // o handshake (self-heal) e repetir o pedido já cifrado.
          const valid = await E2EManager.hasValidSession(c.env, sessionId)
          if (!valid) {
            c.res = c.json(
              { error: `Invalid session: ${sessionId}` } as any,
              400 as any
            )
            return c.res
          }
        } else if (!isEncrypted) {
          return
        }

        try {
          const responseText = await c.res.text()
          const { encrypted, nonce } = await E2EManager.encryptForClient(
            c.env,
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
