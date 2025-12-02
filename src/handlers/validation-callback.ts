import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { GetPayloadFn } from './types'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Timestamp',
}

const DEFAULT_COLLECTIONS: Record<string, string> = {
  transactions: 'transactions',
}

/**
 * Creates a Svea OK response with optional extra data
 */
function sveaOkResponse(extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { Valid: true, ...extra },
    { status: 200, headers: CORS_HEADERS },
  )
}

/**
 * Creates a validation callback handler for Svea checkout
 *
 * This endpoint is called by Svea before finalizing a payment to validate
 * that the order is still valid on your end.
 *
 * @example
 * ```ts
 * // app/api/payments/svea/validation-callback/[[...params]]/route.ts
 * import { createSveaValidationCallbackHandler } from '@sanderjevnaker/payload-svea-adapter/handlers'
 * import { getPayload } from 'payload'
 * import config from '@payload-config'
 *
 * const handler = createSveaValidationCallbackHandler({
 *   getPayload: () => getPayload({ config }),
 * })
 *
 * export const GET = handler.GET
 * export const POST = handler.POST
 * export const PUT = handler.PUT
 * export const OPTIONS = handler.OPTIONS
 * ```
 */
export function createSveaValidationCallbackHandler(options: {
  getPayload: GetPayloadFn
  collections?: {
    transactions?: string
  }
  /**
   * Custom validation function. Return true to allow the payment,
   * or throw an error / return false to reject it.
   */
  customValidation?: (params: {
    orderId: number
    transaction: Record<string, unknown>
    body: Record<string, unknown>
  }) => Promise<boolean> | boolean
}) {
  const collections = { ...DEFAULT_COLLECTIONS, ...options.collections }

  async function handleValidationRequest(req: NextRequest) {
    console.log(
      '[Svea Validation Callback] Request received at:',
      new Date().toISOString(),
    )

    let payload
    try {
      payload = await options.getPayload()
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/').filter(Boolean)

      // Extract order ID from URL path
      let orderIdFromUrl: number | undefined
      for (let i = pathParts.length - 1; i >= 0; i--) {
        const part = pathParts[i]
        const parsed = Number.parseInt(part, 10)
        if (!Number.isNaN(parsed) && parsed > 0) {
          orderIdFromUrl = parsed
          break
        }
      }

      // Parse body
      let body: Record<string, unknown> = {}
      try {
        const bodyText = await req.text()
        if (bodyText) {
          body = JSON.parse(bodyText)
        }
      } catch {
        console.log('[Svea Validation Callback] Could not parse body')
      }

      payload.logger.info(
        { body, url: req.url, orderIdFromUrl },
        'Received Svea validation callback',
      )

      // Handle webhook events that might come through validation callback
      if (body.EventName) {
        const eventName = body.EventName as string
        const correlationId = body.CorrelationId as string | undefined
        const timestampUtc = body.TimestampUtc as string | undefined

        payload.logger.info(
          { eventName, correlationId, timestampUtc },
          'Received Svea webhook event in validation callback',
        )

        const orderId =
          body.OrderId ||
          (body.Data as Record<string, unknown>)?.OrderId ||
          (body.Payload as Record<string, unknown>)?.OrderId ||
          orderIdFromUrl

        if (orderId) {
      const transactionsResults = await payload.find({
        collection: collections.transactions as 'users',
        where: {
          'svea.orderId': {
            equals: Number(orderId),
          },
        },
        limit: 1,
      })

          const transaction = transactionsResults.docs[0]
          if (transaction) {
            payload.logger.info(
              { orderId, eventName, transactionId: transaction.id },
              'Validated transaction for Svea webhook event',
            )
          }
        }

        return sveaOkResponse()
      }

    // Standard validation request
    const orderId: number | undefined =
      (body.OrderId as number | undefined) ||
      (body.orderId as number | undefined) ||
      orderIdFromUrl

    const paymentOptionId: string | undefined = body.paymentOptionId as string | undefined
    const billingEmail: string | undefined = body.billingEmail as string | undefined
    const billingReference: string | undefined = body.billingReference as string | undefined

      console.log('[Svea Validation Callback] Processing validation:', {
        orderId,
        orderIdFromUrl,
        paymentOptionId,
        billingEmail,
        billingReference,
      })

      if (!orderId) {
        console.warn('[Svea Validation Callback] Missing OrderId')
        payload.logger.warn(
          { body, url: req.url },
          'Missing OrderId in validation callback',
        )
        return sveaOkResponse({ Warning: 'Missing OrderId' })
      }

      // Find transaction
      const transactionsResults = await payload.find({
        collection: collections.transactions as 'users',
        where: {
          'svea.orderId': {
            equals: orderId,
          },
        },
        limit: 1,
      })

      const transaction = transactionsResults.docs[0]

      if (!transaction) {
        payload.logger.warn(
          { orderId },
          'Transaction not found in validation callback',
        )
        return sveaOkResponse({ Warning: 'Transaction not found' })
      }

      const transactionStatus = (transaction as Record<string, unknown>).status
      if (transactionStatus !== 'pending') {
        payload.logger.warn(
          { orderId, status: transactionStatus },
          'Transaction is not pending in validation callback',
        )
      }

      // Run custom validation if provided
      if (options.customValidation) {
        try {
          const isValid = await options.customValidation({
            orderId,
            transaction: transaction as Record<string, unknown>,
            body,
          })
          if (!isValid) {
            payload.logger.warn(
              { orderId },
              'Custom validation rejected the order',
            )
            return NextResponse.json(
              { Valid: false, Message: 'Order validation failed' },
              { status: 200, headers: CORS_HEADERS },
            )
          }
        } catch (validationError) {
          payload.logger.error(
            { orderId, error: validationError },
            'Custom validation threw an error',
          )
          return NextResponse.json(
            {
              Valid: false,
              Message:
                validationError instanceof Error
                  ? validationError.message
                  : 'Validation error',
            },
            { status: 200, headers: CORS_HEADERS },
          )
        }
      }

      payload.logger.info(
        {
          orderId,
          paymentOptionId,
          billingEmail,
          billingReference,
          transactionId: transaction.id,
        },
        'Svea validation callback successful',
      )

      return sveaOkResponse({
        OrderId: orderId,
        TransactionId: transaction.id,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      console.error('[Svea Validation Callback] Error:', error)

      try {
        if (!payload) {
          payload = await options.getPayload()
        }
        payload.logger.error(
          { error: errorMessage },
          'Error processing Svea validation callback',
        )
      } catch {
        // Ignore
      }

      // Return 200 OK despite error to not block payment
      return sveaOkResponse({ Error: errorMessage })
    }
  }

  return {
    GET: () => sveaOkResponse(),
    OPTIONS: () =>
      new NextResponse(null, { status: 200, headers: CORS_HEADERS }),
    POST: handleValidationRequest,
    PUT: handleValidationRequest,
  }
}

