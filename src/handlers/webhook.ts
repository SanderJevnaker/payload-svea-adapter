import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { GetPayloadFn, SveaHandlerConfig } from './types'

const DEFAULT_COLLECTIONS = {
  transactions: 'transactions',
  orders: 'orders',
  carts: 'carts',
  customers: 'users',
  products: 'products',
  variants: 'variants',
}

/**
 * Creates a webhook handler for Svea push notifications
 *
 * @example
 * ```ts
 * // app/api/payments/svea/webhook/route.ts
 * import { createSveaWebhookHandler } from '@sanderjevnaker/payload-svea-adapter/handlers'
 * import { getPayload } from 'payload'
 * import config from '@payload-config'
 *
 * const handler = createSveaWebhookHandler({
 *   getPayload: () => getPayload({ config }),
 *   merchantId: process.env.SVEA_MERCHANT_ID!,
 *   secretKey: process.env.SVEA_SECRET_KEY!,
 * })
 *
 * export const POST = handler.POST
 * export const GET = handler.GET
 * ```
 */
export function createSveaWebhookHandler(options: {
  getPayload: GetPayloadFn
  merchantId: string
  secretKey: string
  checkoutApiUrl?: string
  collections?: SveaHandlerConfig['collections']
}) {
  const collections = { ...DEFAULT_COLLECTIONS, ...options.collections }

  async function handleWebhook(req: NextRequest) {
    console.log('[Svea Webhook] Request received at:', new Date().toISOString())

    let payload
    try {
      payload = await options.getPayload()

      const url = new URL(req.url)
      const queryOrderId =
        url.searchParams.get('orderId') ?? url.searchParams.get('OrderId')
      const queryStatus =
        url.searchParams.get('status') ?? url.searchParams.get('Status')

      // Extract order ID from path
      const pathParts = url.pathname.split('/').filter(Boolean)
      let orderIdFromPath: string | null = null
      for (let i = pathParts.length - 1; i >= 0; i--) {
        const part = pathParts[i]
        if (part && /^\d+$/.test(part)) {
          orderIdFromPath = part
          break
        }
      }

      // Parse body
      let body: Record<string, unknown> = {}
      const contentType = req.headers.get('content-type') || ''

      try {
        const bodyText = await req.text()
        if (bodyText) {
          if (contentType.includes('application/json')) {
            body = JSON.parse(bodyText)
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formParams = new URLSearchParams(bodyText)
            body = Object.fromEntries(formParams.entries())
          } else {
            try {
              body = JSON.parse(bodyText)
            } catch {
              try {
                const formParams = new URLSearchParams(bodyText)
                body = Object.fromEntries(formParams.entries())
              } catch {
                console.log('[Svea Webhook] Could not parse body')
              }
            }
          }
        }
      } catch {
        // Ignore parse errors
      }

      // Resolve order ID and status from various sources
      const orderId =
        (body.OrderId as number | string | undefined) ??
        (body.orderId as number | string | undefined) ??
        ((body.Data as Record<string, unknown>)?.OrderId as
          | number
          | string
          | undefined) ??
        queryOrderId ??
        orderIdFromPath

      const status =
        (body.Status as string | undefined) ??
        (body.status as string | undefined) ??
        ((body.Data as Record<string, unknown>)?.Status as string | undefined) ??
        queryStatus

      const paymentType =
        (body.PaymentType as string) ??
        (body.paymentType as string) ??
        ((body.Data as Record<string, unknown>)?.PaymentType as string)

      if (!orderId) {
        console.warn('[Svea Webhook] Missing OrderId')
        payload.logger.warn(
          { body, queryParams: Object.fromEntries(url.searchParams.entries()) },
          'Svea webhook missing OrderId',
        )
        return new NextResponse(null, { status: 200 })
      }

      const orderIdNum =
        typeof orderId === 'string' ? parseInt(orderId, 10) : orderId

      payload.logger.info(
        { orderId: orderIdNum, status, paymentType },
        'Received Svea webhook',
      )

      // Find transaction
      const transactionsResults = await payload.find({
        collection: collections.transactions,
        where: {
          'svea.orderId': {
            equals: orderIdNum,
          },
        },
        limit: 1,
      })

      const transaction = transactionsResults.docs[0]

      if (!transaction) {
        payload.logger.warn(
          { orderId: orderIdNum },
          'Transaction not found for Svea order',
        )
        return new NextResponse(null, { status: 200 })
      }

      payload.logger.info(
        {
          orderId: orderIdNum,
          transactionId: transaction.id,
          currentStatus: transaction.status,
        },
        'Found transaction for Svea webhook',
      )

      if (status === 'Final') {
        // Check if already processed
        if (transaction.status === 'succeeded' && transaction.order) {
          payload.logger.info(
            { orderId: orderIdNum, transactionId: transaction.id },
            'Transaction already succeeded - idempotent',
          )
          return NextResponse.json({
            success: true,
            message: 'Already processed',
          })
        }

        const existingSveaData =
          transaction.svea && typeof transaction.svea === 'object'
            ? (transaction.svea as Record<string, unknown>)
            : {}

        // Update transaction status
        await payload.update({
          id: transaction.id,
          collection: collections.transactions,
          data: {
            status: 'succeeded',
            svea: {
              ...existingSveaData,
              orderId: orderIdNum,
              paymentType: paymentType || existingSveaData.paymentType,
            },
          },
        })

        // Check if order exists
        let existingOrderId: number | undefined

        if (transaction.order) {
          existingOrderId =
            typeof transaction.order === 'object'
              ? (transaction.order as { id: number }).id
              : (transaction.order as number)
        } else {
          const existingOrderLookup = await payload.find({
            collection: collections.orders,
            where: {
              transactions: {
                contains: transaction.id,
              },
            },
            limit: 1,
          })
          existingOrderId = existingOrderLookup.docs?.[0]?.id as
            | number
            | undefined
        }

        // Create order if it doesn't exist
        if (!existingOrderId) {
          const cartId = transaction.cart
          const cart =
            cartId && typeof cartId === 'object'
              ? cartId
              : cartId
                ? await payload.findByID({
                    collection: collections.carts,
                    id: cartId as number,
                  })
                : null

          if (cart) {
            const normalizedItems = ((cart.items as unknown[]) || []).map(
              (item: unknown) => {
                const typedItem = item as {
                  product?: number | { id?: number } | null
                  variant?: number | { id?: number } | null
                  quantity?: number
                }
                return {
                  product:
                    typeof typedItem.product === 'object'
                      ? typedItem.product?.id
                      : typedItem.product,
                  variant: typedItem.variant
                    ? typeof typedItem.variant === 'object'
                      ? typedItem.variant.id
                      : typedItem.variant
                    : undefined,
                  quantity: typedItem.quantity || 1,
                }
              },
            )

            // Resolve customer
            const cartCustomerId =
              cart.customer && typeof cart.customer === 'object'
                ? (cart.customer as { id: number }).id
                : cart.customer
            const transactionCustomerId =
              transaction.customer && typeof transaction.customer === 'object'
                ? (transaction.customer as { id: number }).id
                : transaction.customer
            const customerId = cartCustomerId || transactionCustomerId

            const order = await payload.create({
              collection: collections.orders,
              data: {
                ...(customerId ? { customer: customerId } : {}),
                ...(transaction.customerEmail
                  ? { customerEmail: transaction.customerEmail }
                  : {}),
                items: normalizedItems,
                amount:
                  (transaction.amount as number) ||
                  (cart.subtotal as number) ||
                  0,
                currency: (transaction.currency ||
                  cart.currency ||
                  'NOK') as string,
                status: 'processing',
                transactions: [transaction.id],
              },
            })

            payload.logger.info(
              {
                orderId: orderIdNum,
                transactionId: transaction.id,
                payloadOrderId: order.id,
              },
              'Created order from webhook',
            )

            // Link order to transaction
            await payload.update({
              id: transaction.id,
              collection: collections.transactions,
              data: {
                order: order.id,
              },
            })

            // Update cart
            try {
              await payload.update({
                id: cart.id as number,
                collection: collections.carts,
                data: {
                  purchasedAt:
                    (cart.purchasedAt as string) || new Date().toISOString(),
                  status: 'purchased',
                  items: [],
                },
              })
            } catch (cartError) {
              payload.logger.warn(
                { cartId: cart.id, error: cartError },
                'Could not update cart in webhook',
              )
            }
          } else {
            payload.logger.warn(
              { orderId: orderIdNum, transactionId: transaction.id },
              'No cart found for transaction in webhook',
            )
          }
        } else {
          payload.logger.info(
            { orderId: orderIdNum, transactionId: transaction.id, existingOrderId },
            'Order already exists - skipping creation',
          )
        }
      } else if (status === 'Cancelled') {
        await payload.update({
          id: transaction.id,
          collection: collections.transactions,
          data: {
            status: 'failed',
          },
        })
        payload.logger.info(
          { orderId: orderIdNum, transactionId: transaction.id },
          'Transaction marked as failed',
        )
      }

      return NextResponse.json({ success: true })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      console.error('[Svea Webhook] Error:', error)

      try {
        if (!payload) {
          payload = await options.getPayload()
        }
        payload.logger.error(
          { error: errorMessage },
          'Error processing Svea webhook',
        )
      } catch {
        // Ignore
      }

      // Return 200 to prevent retries
      return new NextResponse(null, { status: 200 })
    }
  }

  return {
    POST: handleWebhook,
    GET: handleWebhook,
  }
}

