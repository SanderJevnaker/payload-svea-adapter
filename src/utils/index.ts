export * from './address'
export * from './locale'

/**
 * Extract origin URL from a request object
 * Works with both Next.js Request and Node.js IncomingMessage
 */
export function getOriginFromRequest(req: unknown): string | undefined {
  if (!req) return undefined

  try {
    const reqObj = req as Record<string, unknown>
    const headers = reqObj.headers as Record<string, unknown> | undefined

    // Handle Next.js/Fetch API Request with headers.get()
    if (headers && typeof (headers as { get?: unknown }).get === 'function') {
      const getHeader = (headers as { get: (name: string) => string | null })
        .get
      const proto =
        getHeader('x-forwarded-proto') ||
        getHeader('origin')?.split(':')[0] ||
        'https'
      const host = getHeader('x-forwarded-host') || getHeader('host')
      if (host) {
        return `${proto}://${host}`
      }
    }

    // Handle plain object headers
    if (headers && typeof headers === 'object') {
      const proto =
        (headers['x-forwarded-proto'] as string) ||
        (reqObj.protocol as string) ||
        'http'
      const host =
        (headers['x-forwarded-host'] as string) || (headers.host as string)
      if (host) {
        return `${proto}://${host}`
      }
    }
  } catch {
    // ignore
  }

  return undefined
}

/**
 * Generate a unique client order number
 */
export function generateClientOrderNumber(cartId: string | number): string {
  return `ORDER-${cartId}-${Date.now()}`
}

