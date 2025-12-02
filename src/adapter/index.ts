import type {
  PaymentAdapter,
  PaymentAdapterArgs,
} from '@payloadcms/plugin-ecommerce/types'
import type { GroupField } from 'payload'

import { createSveaAuthHeaders } from './auth'
import type {
  CreateSveaOrderRequest,
  CreateSveaOrderResponse,
  GetSveaOrderResponse,
  PayloadAddress,
  SveaAdapterConfig,
  SveaOrderRow,
} from './types'
import { mapSveaAddressToPayload } from '../utils/address'
import {
  generateClientOrderNumber,
  getLocaleFromCountryCode,
  getOriginFromRequest,
  normalizeCountryCode,
} from '../utils'

/** Default Svea Checkout API URLs */
export const SVEA_API_URLS = {
  staging: 'https://checkoutapistage.svea.com',
  production: 'https://checkoutapi.svea.com',
} as const

/**
 * Maps a cart item to Svea order row format
 */
function mapCartItemToSveaOrderRow(
  item: {
    product?: number | { id?: number; title?: string; priceInNOK?: number } | null
    variant?: number | { id?: number; priceInNOK?: number } | null
    quantity: number
    id?: string | null
  },
  index: number,
  vatPercent = 2500, // Default 25% VAT
): SveaOrderRow | null {
  if (!item.product) return null

  const product = typeof item.product === 'object' ? item.product : null
  const variant =
    item.variant && typeof item.variant === 'object' ? item.variant : null

  if (!product) return null

  const priceInNOK = variant?.priceInNOK ?? (product as { priceInNOK?: number })?.priceInNOK ?? 0
  const productTitle = (product as { title?: string })?.title || `Product ${index + 1}`
  const quantity = item.quantity || 1

  if (!priceInNOK || priceInNOK <= 0) {
    throw new Error(`Invalid price for product ${productTitle}: ${priceInNOK}`)
  }

  // Convert to minor units (øre/cents)
  const unitPrice = Math.round(priceInNOK * 100)

  // Sanity check for price
  if (unitPrice > 10000000000) {
    throw new Error(
      `Price too high for product ${productTitle}: ${priceInNOK}. Check if price is already in minor units.`,
    )
  }

  // Quantity in minor units (100 = 1 unit)
  const quantityInMinorUnits = Math.round(quantity * 100)

  return {
    name: productTitle,
    quantity: quantityInMinorUnits,
    unitPrice,
    vatPercent,
  }
}

/**
 * Normalizes cart items for storage
 */
function normalizeCartItems(
  cart?: {
    items?: unknown[] | null
  } | null,
) {
  if (!cart?.items || cart.items.length === 0) return []

  return cart.items.map((item) => {
    const typedItem = item as {
      product?: number | string | { id?: number | string } | null
      variant?: number | string | { id?: number | string } | null
      quantity?: number
      id?: string | number | null
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
  })
}

/**
 * Creates a Svea payment adapter for Payload CMS ecommerce plugin
 *
 * @example
 * ```ts
 * import { sveaAdapter } from '@sanderjevnaker/payload-svea-adapter'
 *
 * export const plugins = [
 *   ecommercePlugin({
 *     payments: {
 *       paymentMethods: [
 *         sveaAdapter({
 *           merchantId: process.env.SVEA_MERCHANT_ID!,
 *           secretKey: process.env.SVEA_SECRET_KEY!,
 *           checkoutApiUrl: process.env.SVEA_CHECKOUT_API_URL,
 *           frontendBaseUrl: process.env.NEXT_PUBLIC_SERVER_URL,
 *         }),
 *       ],
 *     },
 *   }),
 * ]
 * ```
 */
export function sveaAdapter(
  config: SveaAdapterConfig & PaymentAdapterArgs,
): PaymentAdapter {
  const {
    merchantId,
    secretKey,
    checkoutApiUrl = process.env.SVEA_CHECKOUT_API_URL || SVEA_API_URLS.staging,
    frontendBaseUrl = process.env.FRONTEND_BASE_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL,
    label = 'Svea',
    collections = {},
  } = config

  const initiatePayment: PaymentAdapter['initiatePayment'] = async ({
    data,
    req,
    transactionsSlug,
  }) => {
    const payload = req.payload

    const currency = data.currency
    const cart = data.cart
    const customerEmail =
      data.customerEmail ||
      (req.user && 'email' in req.user ? (req.user.email as string) : undefined)

    if (!currency) {
      throw new Error('Currency is required.')
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new Error('Cart is empty.')
    }

    if (!customerEmail) {
      throw new Error('Customer email is required.')
    }

    const billingAddress = data.billingAddress as PayloadAddress | undefined
    const shippingAddress = data.shippingAddress || billingAddress

    if (!billingAddress) {
      throw new Error('Billing address is required.')
    }

    // Map cart items to Svea format
    const orderRows: SveaOrderRow[] = (cart.items || [])
      .map((item: unknown, index: number) =>
        mapCartItemToSveaOrderRow(
          item as {
            product?: number | { id?: number; title?: string; priceInNOK?: number } | null
            variant?: number | { id?: number; priceInNOK?: number } | null
            quantity: number
            id?: string | null
          },
          index,
        ),
      )
      .filter((row): row is SveaOrderRow => row !== null)

    if (orderRows.length === 0) {
      throw new Error('No valid order items found.')
    }

    // Validate order rows
    for (const row of orderRows) {
      if (!row.name || row.quantity <= 0 || row.unitPrice <= 0) {
        throw new Error(
          `Invalid order row: name, quantity, and unitPrice are required. Got: ${JSON.stringify(row)}`,
        )
      }
    }

    const countryCode = normalizeCountryCode(billingAddress.country)
    const locale = getLocaleFromCountryCode(countryCode)
    const clientOrderNumber = generateClientOrderNumber(cart.id)

    const normalizedCartItems = normalizeCartItems(cart)

    // Determine base URL
    const requestOrigin = getOriginFromRequest(req)
    const baseUrl = frontendBaseUrl || requestOrigin || ''
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '')

    // Build callback URLs
    const confirmationParams = new URLSearchParams({ clientOrderNumber })
    const confirmationUri = `${normalizedBaseUrl}/checkout/confirm-order?${confirmationParams.toString()}`

    const sveaOrderRequest: CreateSveaOrderRequest = {
      countryCode,
      currency: currency.toUpperCase(),
      locale,
      clientOrderNumber,
      cart: {
        items: orderRows,
      },
      merchantSettings: {
        termsUri: `${normalizedBaseUrl}/terms`,
        checkoutUri: `${normalizedBaseUrl}/checkout`,
        confirmationUri,
        pushUri: `${normalizedBaseUrl}/api/payments/svea/webhook`,
        checkoutValidationCallBackUri: `${normalizedBaseUrl}/api/payments/svea/validation-callback/{checkout.order.uri}`,
      },
      presetValues: [
        {
          typeName: 'EmailAddress',
          value: customerEmail,
          isReadonly: false,
        },
      ],
    }

    try {
      const requestBody = JSON.stringify(sveaOrderRequest)
      const { token, timestamp } = createSveaAuthHeaders(
        merchantId,
        secretKey,
        requestBody,
      )

      const response = await fetch(`${checkoutApiUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Svea ${token}`,
          Timestamp: timestamp,
        },
        body: requestBody,
      })

      if (!response.ok) {
        let errorText = ''
        let errorJson: Record<string, unknown> | null = null

        try {
          errorText = await response.text()
          if (errorText) {
            try {
              errorJson = JSON.parse(errorText)
            } catch {
              // Not JSON
            }
          }
        } catch {
          // Ignore read errors
        }

        payload.logger.error(
          {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            errorJson,
            requestBody: sveaOrderRequest,
          },
          'Error creating Svea order',
        )

        const errorMessageFromHeader = response.headers.get('errormessage')
        const errorMessage =
          errorMessageFromHeader ||
          (errorJson?.message as string) ||
          (errorJson?.error as string) ||
          (errorJson?.Message as string) ||
          errorText ||
          response.statusText ||
          'Unknown error'

        throw new Error(
          `Failed to create Svea order: ${response.status} - ${errorMessage}`,
        )
      }

      const sveaOrder: CreateSveaOrderResponse & {
        ResultCode?: number
        resultCode?: number
        ErrorMessage?: string
        errorMessage?: string
      } = await response.json()

      payload.logger.info(
        {
          orderId: sveaOrder.OrderId,
          clientOrderNumber: sveaOrder.ClientOrderNumber,
          status: sveaOrder.Status,
          hasSnippet: Boolean(sveaOrder.Gui?.Snippet),
        },
        'Svea order created',
      )

      // Check for error result codes
      const resultCode =
        typeof sveaOrder.ResultCode === 'number'
          ? sveaOrder.ResultCode
          : typeof sveaOrder.resultCode === 'number'
            ? sveaOrder.resultCode
            : undefined

      const errorMessageFromBody =
        typeof sveaOrder.ErrorMessage === 'string'
          ? sveaOrder.ErrorMessage
          : typeof sveaOrder.errorMessage === 'string'
            ? sveaOrder.errorMessage
            : undefined

      if (
        typeof resultCode === 'number' &&
        resultCode !== 0 &&
        resultCode !== 200 &&
        resultCode !== 201
      ) {
        payload.logger.error(
          { resultCode, errorMessage: errorMessageFromBody, sveaOrder },
          'Svea order creation returned error',
        )

        throw new Error(
          `Failed to create Svea order: ${resultCode} - ${errorMessageFromBody || 'Validation failed'}`,
        )
      }

      // Create transaction in Payload
      const transaction = await payload.create({
        collection: transactionsSlug as 'transactions',
        data: {
          paymentMethod: 'svea',
          status: 'pending',
          amount: cart.subtotal || 0,
          currency: currency.toUpperCase(),
          cart: cart.id,
          items: normalizedCartItems,
          ...(billingAddress ? { billingAddress } : {}),
          ...(req.user?.id ? { customer: req.user.id } : {}),
          ...(customerEmail ? { customerEmail } : {}),
          svea: {
            orderId: sveaOrder.OrderId,
            clientOrderNumber: sveaOrder.ClientOrderNumber,
            paymentType: sveaOrder.PaymentType || sveaOrder.Payment?.paymentType,
          },
        } as Record<string, unknown>,
      })

      return {
        message: 'Svea order created successfully',
        orderId: sveaOrder.OrderId,
        clientOrderNumber: sveaOrder.ClientOrderNumber,
        checkoutSnippet: sveaOrder.Gui?.Snippet,
        transactionId: transaction.id,
      }
    } catch (error) {
      payload.logger.error(error, 'Error initiating payment with Svea')
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Unknown error initiating payment with Svea',
      )
    }
  }

  const confirmOrder: PaymentAdapter['confirmOrder'] = async ({
    data,
    ordersSlug = collections.orders || 'orders',
    req,
    transactionsSlug = collections.transactions || 'transactions',
    cartsSlug = collections.carts || 'carts',
  }) => {
    const payload = req.payload

    let sveaOrderId =
      (data.orderId as number | string | undefined) ??
      (data.OrderId as number | string | undefined) ??
      (data.sveaOrderId as number | string | undefined)

    const transactionId =
      (data.transactionId as string | number | undefined) ??
      (data.transactionID as string | number | undefined)

    const clientOrderNumber =
      (data.clientOrderNumber as string | undefined) ??
      (data.ClientOrderNumber as string | undefined)

    payload.logger.info(
      { sveaOrderId, transactionId, clientOrderNumber },
      'Svea confirmOrder called',
    )

    try {
      // Find transaction by various identifiers
      let transaction

      if (transactionId) {
        try {
          transaction = await payload.findByID({
            collection: transactionsSlug as 'transactions',
            id:
              typeof transactionId === 'string'
                ? Number.parseInt(transactionId, 10)
                : transactionId,
          })
        } catch {
          payload.logger.warn({ transactionId }, 'Transaction not found by ID')
        }
      }

      if (!transaction && sveaOrderId) {
        const results = await payload.find({
          collection: transactionsSlug as 'transactions',
          where: {
            'svea.orderId': {
              equals:
                typeof sveaOrderId === 'string'
                  ? Number.parseInt(sveaOrderId, 10)
                  : sveaOrderId,
            },
          },
          limit: 1,
        })
        transaction = results.docs[0]
      }

      if (!transaction && clientOrderNumber) {
        const results = await payload.find({
          collection: transactionsSlug as 'transactions',
          where: {
            'svea.clientOrderNumber': {
              equals: clientOrderNumber,
            },
          },
          limit: 1,
        })
        transaction = results.docs[0]
      }

      if (!transaction) {
        payload.logger.error(
          { sveaOrderId, transactionId, clientOrderNumber },
          'Transaction not found',
        )
        throw new Error('Transaction not found.')
      }

      // Get Svea order ID from transaction if not provided
      if (!sveaOrderId) {
        const transactionSvea = transaction.svea as
          | { orderId?: number }
          | undefined
        if (transactionSvea?.orderId) {
          sveaOrderId = transactionSvea.orderId
        }
      }

      if (!sveaOrderId) {
        throw new Error('Svea order ID is required.')
      }

      // Check if already processed
      if (transaction.status === 'succeeded' && transaction.order) {
        const existingOrderId =
          typeof transaction.order === 'object'
            ? (transaction.order as { id: number }).id
            : transaction.order

        payload.logger.info(
          { transactionId: transaction.id, orderId: existingOrderId },
          'Order already confirmed',
        )

        return {
          message: 'Order already confirmed',
          orderID: existingOrderId,
          transactionID: transaction.id,
        }
      }

      // Fetch order from Svea to verify status
      const requestBody = ''
      const { token, timestamp } = createSveaAuthHeaders(
        merchantId,
        secretKey,
        requestBody,
      )

      const response = await fetch(
        `${checkoutApiUrl}/api/orders/${sveaOrderId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Svea ${token}`,
            Timestamp: timestamp,
          },
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        payload.logger.error(
          { status: response.status, error: errorText },
          'Error fetching Svea order',
        )
        throw new Error(
          `Failed to fetch Svea order: ${response.status} ${errorText}`,
        )
      }

      const sveaOrder: GetSveaOrderResponse = await response.json()

      payload.logger.info(
        {
          sveaOrderId,
          status: sveaOrder.Status,
          paymentType: sveaOrder.PaymentType,
        },
        'Fetched Svea order details',
      )

      if (sveaOrder.Status !== 'Final') {
        throw new Error(
          `Svea order is not finalized. Current status: ${sveaOrder.Status}`,
        )
      }

      // Get cart
      const cartId = transaction.cart
      const cart =
        cartId && typeof cartId === 'object'
          ? cartId
          : cartId
            ? await payload.findByID({
                collection: cartsSlug as 'carts',
                id: cartId as number,
              })
            : null

      if (!cart) {
        throw new Error('Cart not found.')
      }

      // Normalize order items
      let normalizedOrderItems = normalizeCartItems(cart)
      if (
        (!normalizedOrderItems || normalizedOrderItems.length === 0) &&
        transaction.items &&
        Array.isArray(transaction.items) &&
        transaction.items.length > 0
      ) {
        normalizedOrderItems = normalizeCartItems({
          items: transaction.items as {
            product?: number | { id?: number } | null
            variant?: number | { id?: number } | null
            quantity: number
          }[],
        })
      }

      // Resolve addresses
      let shippingAddressPayload: PayloadAddress | undefined
      let billingAddressPayload: PayloadAddress | undefined

      if (transaction.billingAddress) {
        const txAddr = transaction.billingAddress as PayloadAddress
        shippingAddressPayload = { ...txAddr }
        billingAddressPayload = shippingAddressPayload
      } else {
        shippingAddressPayload =
          mapSveaAddressToPayload(
            sveaOrder.ShippingAddress || sveaOrder.BillingAddress,
          ) || undefined
        billingAddressPayload =
          mapSveaAddressToPayload(
            sveaOrder.BillingAddress || sveaOrder.ShippingAddress,
          ) || undefined
      }

      // Resolve customer
      const cartCustomerId =
        cart.customer && typeof cart.customer === 'object'
          ? (cart.customer as { id: number }).id
          : cart.customer
      const transactionCustomerId =
        transaction.customer && typeof transaction.customer === 'object'
          ? (transaction.customer as { id: number }).id
          : transaction.customer
      const resolvedCustomerId =
        cartCustomerId || transactionCustomerId || req.user?.id || undefined

      const resolvedCustomerEmail =
        (transaction.customerEmail as string) ||
        (data.customerEmail as string) ||
        sveaOrder.Customer?.emailAddress ||
        sveaOrder.EmailAddress ||
        (typeof req.user?.email === 'string' ? req.user.email : undefined)

      // Check for existing order
      let existingOrderId: number | undefined

      if (transaction.order) {
        existingOrderId =
          typeof transaction.order === 'object'
            ? (transaction.order as { id: number }).id
            : (transaction.order as number)
      } else {
        const existingOrderLookup = await payload.find({
          collection: ordersSlug as 'orders',
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

      // Build order payload
      const orderPayload: Record<string, unknown> = {
        amount: (transaction.amount as number) || (cart.subtotal as number) || 0,
        currency: (transaction.currency || cart.currency || 'NOK') as string,
        items: normalizedOrderItems,
        status: 'processing',
        transactions: [transaction.id],
      }

      if (shippingAddressPayload) {
        orderPayload.shippingAddress = shippingAddressPayload
      }

      if (resolvedCustomerId) {
        orderPayload.customer = resolvedCustomerId
      }

      if (resolvedCustomerEmail) {
        orderPayload.customerEmail = resolvedCustomerEmail
      }

      // Create or update order
      let order

      if (existingOrderId) {
        const existingOrder = await payload.findByID({
          collection: ordersSlug as 'orders',
          id: existingOrderId,
        })

        const existingTransactionIds = Array.isArray(existingOrder.transactions)
          ? (existingOrder.transactions as (number | { id: number })[])
              .map((tx) => (typeof tx === 'object' ? tx.id : tx))
              .filter(Boolean)
          : []

        const mergedTransactionIds = Array.from(
          new Set([...existingTransactionIds, transaction.id]),
        )

        order = await payload.update({
          id: existingOrderId,
          collection: ordersSlug as 'orders',
          data: {
            ...orderPayload,
            transactions: mergedTransactionIds,
          },
        })

        payload.logger.info(
          { orderId: order.id, transactionId: transaction.id },
          'Updated existing order',
        )
      } else {
        order = await payload.create({
          collection: ordersSlug as 'orders',
          data: orderPayload,
        })

        payload.logger.info(
          { orderId: order.id, transactionId: transaction.id },
          'Created new order',
        )
      }

      // Mark cart as purchased
      const purchasedAtTimestamp = new Date().toISOString()

      try {
        await payload.update({
          id: cart.id as number,
          collection: cartsSlug as 'carts',
          data: {
            purchasedAt: (cart.purchasedAt as string) || purchasedAtTimestamp,
            status: 'purchased',
            items: [],
          },
        })
        payload.logger.info({ cartId: cart.id }, 'Cart marked as purchased')
      } catch (cartError) {
        payload.logger.warn(
          { cartId: cart.id, error: cartError },
          'Could not update cart status',
        )
      }

      // Update transaction
      const existingSveaData =
        (transaction.svea && typeof transaction.svea === 'object'
          ? (transaction.svea as Record<string, unknown>)
          : {}) || {}

      await payload.update({
        id: transaction.id,
        collection: transactionsSlug as 'transactions',
        data: {
          order: order.id,
          status: 'succeeded',
          ...(billingAddressPayload ? { billingAddress: billingAddressPayload } : {}),
          ...(resolvedCustomerEmail ? { customerEmail: resolvedCustomerEmail } : {}),
          svea: {
            ...existingSveaData,
            orderId: Number(sveaOrderId),
            clientOrderNumber:
              existingSveaData.clientOrderNumber || sveaOrder.ClientOrderNumber,
            paymentType: sveaOrder.PaymentType || sveaOrder.Payment?.paymentType,
          },
        },
      })

      payload.logger.info(
        { orderId: order.id, transactionId: transaction.id, sveaOrderId },
        'Order confirmed successfully',
      )

      return {
        message: 'Order confirmed successfully',
        orderID: order.id,
        transactionID: transaction.id,
      }
    } catch (error) {
      payload.logger.error(error, 'Error confirming order with Svea')
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Unknown error confirming order with Svea',
      )
    }
  }

  // Define the transaction group field for Svea-specific data
  const group: GroupField = {
    name: 'svea',
    type: 'group',
    admin: {
      condition: (data) => data?.paymentMethod === 'svea',
    },
    fields: [
      {
        name: 'orderId',
        type: 'number',
        label: 'Svea Order ID',
      },
      {
        name: 'clientOrderNumber',
        type: 'text',
        label: 'Client Order Number',
      },
      {
        name: 'paymentType',
        type: 'text',
        label: 'Svea Payment Type',
      },
    ],
  }

  return {
    name: 'svea',
    label,
    initiatePayment,
    confirmOrder,
    group,
  }
}

export { createSveaAuthHeaders } from './auth'
export * from './types'

