import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { GetPayloadFn, SveaHandlerConfig } from './types'
import { sveaAdapter } from '../adapter'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DEFAULT_COLLECTIONS = {
  transactions: 'transactions',
  orders: 'orders',
  carts: 'carts',
  customers: 'users',
}

/**
 * Creates a confirm order handler for finalizing Svea payments
 *
 * This endpoint is called by the frontend after the customer completes
 * payment in the Svea checkout to finalize the order in Payload.
 *
 * @example
 * ```ts
 * // app/api/payments/svea/confirm-order/route.ts
 * import { createSveaConfirmOrderHandler } from '@sanderjevnaker/payload-svea-adapter/handlers'
 * import { getPayload } from 'payload'
 * import config from '@payload-config'
 *
 * const handler = createSveaConfirmOrderHandler({
 *   getPayload: () => getPayload({ config }),
 *   merchantId: process.env.SVEA_MERCHANT_ID!,
 *   secretKey: process.env.SVEA_SECRET_KEY!,
 * })
 *
 * export const POST = handler.POST
 * export const OPTIONS = handler.OPTIONS
 * ```
 */
export function createSveaConfirmOrderHandler(options: {
  getPayload: GetPayloadFn
  merchantId: string
  secretKey: string
  checkoutApiUrl?: string
  frontendBaseUrl?: string
  collections?: SveaHandlerConfig['collections']
}) {
  const collections = { ...DEFAULT_COLLECTIONS, ...options.collections }

  async function handleConfirmOrder(req: NextRequest) {
    console.log(
      '[Svea Confirm Order] Request received at:',
      new Date().toISOString(),
    )

    let payload
    try {
      payload = await options.getPayload()

      // Try to authenticate the user
      let user = null
      try {
        const authResult = await payload.auth({ headers: req.headers })
        if (authResult.user) {
          user = authResult.user
          console.log(
            '[Svea Confirm Order] Authenticated user:',
            user.id,
            (user as { email?: string }).email,
          )
        }
      } catch {
        console.log('[Svea Confirm Order] No authenticated user (guest checkout)')
      }

      // Parse request body
      let data: Record<string, unknown> = {}
      try {
        data = await req.json()
      } catch {
        console.error('[Svea Confirm Order] Could not parse body')
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 },
        )
      }

      console.log(
        '[Svea Confirm Order] Request data:',
        JSON.stringify(data, null, 2),
      )

      // Create adapter instance
      const adapter = sveaAdapter({
        merchantId: options.merchantId,
        secretKey: options.secretKey,
        checkoutApiUrl: options.checkoutApiUrl,
        frontendBaseUrl: options.frontendBaseUrl,
        label: 'Svea',
        collections,
      })

      // Call confirmOrder
      const result = await adapter.confirmOrder({
        data,
        ordersSlug: collections.orders,
        transactionsSlug: collections.transactions,
        cartsSlug: collections.carts,
        customersSlug: collections.customers,
        req: {
          payload,
          user,
        } as unknown as Parameters<
          NonNullable<typeof adapter.confirmOrder>
        >[0]['req'],
      })

      console.log('[Svea Confirm Order] Result:', result)

      return NextResponse.json(result)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      console.error('[Svea Confirm Order] Error:', error)

      if (payload) {
        payload.logger.error(
          { error: errorMessage },
          'Error confirming Svea order',
        )
      }

      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
  }

  return {
    POST: handleConfirmOrder,
    OPTIONS: () =>
      new NextResponse(null, { status: 200, headers: CORS_HEADERS }),
  }
}

