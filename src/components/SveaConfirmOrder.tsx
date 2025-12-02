'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ConfirmationState = 'idle' | 'confirming' | 'success' | 'failed'

interface StoredSveaOrder {
  orderId?: string | number
  transactionId?: string | number
  clientOrderNumber?: string
  savedAt?: number
}

interface ConfirmOrderResult {
  orderID?: string | number
  transactionID?: string | number
  message?: string
}

export interface SveaConfirmOrderProps {
  /**
   * Custom API endpoint for confirming orders
   * @default '/api/payments/svea/confirm-order'
   */
  confirmOrderEndpoint?: string
  /**
   * Session storage key for stored order info
   * @default 'svea:lastOrder'
   */
  storageKey?: string
  /**
   * Callback when order is successfully confirmed
   */
  onSuccess?: (result: ConfirmOrderResult) => void
  /**
   * Callback when order confirmation fails
   */
  onError?: (error: Error) => void
  /**
   * Function to clear the cart after successful order
   */
  clearCart?: () => void | Promise<void>
  /**
   * Custom redirect URL builder
   * @default `/orders/${orderID}`
   */
  buildRedirectUrl?: (orderID: string, email?: string | null) => string
  /**
   * Whether to automatically redirect after success
   * @default true
   */
  autoRedirect?: boolean
  /**
   * Custom rendering for different states
   */
  renderConfirming?: () => React.ReactNode
  renderSuccess?: () => React.ReactNode
  renderFailed?: (error: string | null, retry: () => void) => React.ReactNode
}

/**
 * Utility to normalize status strings
 */
function normalizeStatus(status: string | null) {
  if (!status) return undefined
  return status.toLowerCase()
}

/**
 * Default redirect URL builder
 */
function defaultBuildRedirectUrl(orderID: string, email?: string | null) {
  if (!orderID) return '/shop'
  const emailQuery = email ? `?email=${email}` : ''
  return `/orders/${orderID}${emailQuery}`
}

/**
 * Confirm order API call
 */
async function confirmOrderApi(
  endpoint: string,
  data: Record<string, unknown>,
): Promise<ConfirmOrderResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
    credentials: 'include',
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Failed to confirm order: ${response.status}`
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.message || errorJson.error || errorMessage
    } catch {
      if (errorText) errorMessage = errorText
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

/**
 * Component for handling Svea order confirmation after payment
 *
 * This component should be placed on your confirmation page (e.g., /checkout/confirm-order).
 * It reads order identifiers from URL params and session storage, then confirms the order.
 *
 * @example
 * ```tsx
 * import { SveaConfirmOrder } from '@sanderjevnaker/payload-svea-adapter/components'
 * import { useCart } from '@payloadcms/plugin-ecommerce/client/react'
 *
 * export default function ConfirmOrderPage() {
 *   const { clearCart } = useCart()
 *
 *   return (
 *     <SveaConfirmOrder
 *       clearCart={clearCart}
 *       onSuccess={(result) => console.log('Order confirmed:', result)}
 *       onError={(error) => console.error('Confirmation failed:', error)}
 *     />
 *   )
 * }
 * ```
 */
export const SveaConfirmOrder: React.FC<SveaConfirmOrderProps> = ({
  confirmOrderEndpoint = '/api/payments/svea/confirm-order',
  storageKey = 'svea:lastOrder',
  onSuccess,
  onError,
  clearCart,
  buildRedirectUrl = defaultBuildRedirectUrl,
  autoRedirect = true,
  renderConfirming,
  renderSuccess,
  renderFailed,
}) => {
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState>('idle')
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [storedSveaOrder, setStoredSveaOrder] =
    useState<StoredSveaOrder | null>(null)
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false)
  const isConfirming = useRef(false)

  // Read URL params (must be done client-side for SSR compatibility)
  const [urlParams, setUrlParams] = useState<{
    orderId?: string
    transactionId?: string
    clientOrderNumber?: string
    status?: string
    email?: string
  }>({})

  useEffect(() => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.search)
    const pathname = window.location.pathname

    // Extract order ID from path
    let orderIdFromPath: string | undefined
    const segments = pathname.split('/').filter(Boolean)
    const confirmIndex = segments.lastIndexOf('confirm-order')
    if (confirmIndex !== -1) {
      const tail = segments.slice(confirmIndex + 1)
      for (let i = tail.length - 1; i >= 0; i--) {
        const segment = tail[i]
        if (segment === 'api' || segment === 'orders') continue
        const match = segment?.match(/(\d+)/)
        if (match?.[1]) {
          orderIdFromPath = match[1]
          break
        }
      }
    }

    setUrlParams({
      orderId:
        searchParams.get('orderId') ??
        searchParams.get('order_id') ??
        searchParams.get('orderID') ??
        orderIdFromPath ??
        undefined,
      transactionId:
        searchParams.get('transactionId') ??
        searchParams.get('transactionID') ??
        undefined,
      clientOrderNumber:
        searchParams.get('clientOrderNumber') ??
        searchParams.get('clientordernumber') ??
        undefined,
      status: searchParams.get('status') ?? undefined,
      email: searchParams.get('email') ?? undefined,
    })
  }, [])

  // Load stored order from session storage
  useEffect(() => {
    if (hasCheckedStorage) return
    if (typeof window === 'undefined') return

    try {
      const raw = window.sessionStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as StoredSveaOrder
        console.log('[Svea ConfirmOrder] Found stored order info:', parsed)
        setStoredSveaOrder(parsed)
      }
    } catch (error) {
      console.warn('[Svea ConfirmOrder] Could not read stored order info', error)
    } finally {
      setHasCheckedStorage(true)
    }
  }, [hasCheckedStorage, storageKey])

  // Resolve identifiers
  const resolvedOrderId =
    urlParams.orderId ?? storedSveaOrder?.orderId?.toString() ?? undefined
  const resolvedTransactionId =
    urlParams.transactionId ??
    storedSveaOrder?.transactionId?.toString() ??
    undefined
  const resolvedClientOrderNumber =
    urlParams.clientOrderNumber ??
    storedSveaOrder?.clientOrderNumber ??
    undefined

  const statusParam = normalizeStatus(urlParams.status ?? null)

  const handleConfirmation = useCallback(async () => {
    if (isConfirming.current) return

    if (
      !resolvedOrderId &&
      !resolvedClientOrderNumber &&
      !resolvedTransactionId
    ) {
      if (!hasCheckedStorage) return

      console.error('[Svea ConfirmOrder] Missing all identifiers', {
        resolvedOrderId,
        resolvedClientOrderNumber,
        resolvedTransactionId,
        hasCheckedStorage,
      })
      setConfirmationState('failed')
      setConfirmationError(
        'Missing order identifiers. Please try again or contact support.',
      )
      return
    }

    isConfirming.current = true
    setConfirmationState('confirming')

    console.log('[Svea ConfirmOrder] Confirming order with:', {
      orderId: resolvedOrderId,
      transactionId: resolvedTransactionId,
      clientOrderNumber: resolvedClientOrderNumber,
    })

    try {
      const result = await confirmOrderApi(confirmOrderEndpoint, {
        orderId: resolvedOrderId,
        transactionId: resolvedTransactionId,
        clientOrderNumber: resolvedClientOrderNumber,
        status: statusParam,
        ...(urlParams.email ? { customerEmail: urlParams.email } : {}),
      })

      if (result && result.orderID) {
        console.log('[Svea ConfirmOrder] Order confirmed successfully:', result)

        // Clear storage
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(storageKey)
          try {
            window.localStorage.removeItem('payload-cart')
            window.localStorage.removeItem('cartId')
            window.sessionStorage.removeItem('payload-cart')
            window.sessionStorage.removeItem('cartId')
          } catch {
            // Ignore
          }
        }

        // Clear cart
        try {
          await Promise.resolve(clearCart?.())
          console.log('[Svea ConfirmOrder] Cart cleared successfully')
        } catch (cartError) {
          console.warn('[Svea ConfirmOrder] Could not clear cart:', cartError)
        }

        setConfirmationState('success')
        onSuccess?.(result)

        // Redirect
        if (autoRedirect) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          const redirectUrl = buildRedirectUrl(
            String(result.orderID),
            urlParams.email,
          )
          if (typeof window !== 'undefined') {
            window.location.href = redirectUrl
          }
        }
      } else {
        console.error('[Svea ConfirmOrder] No orderID in result:', result)
        const error = new Error(
          'We were unable to locate your order after payment. Please contact support.',
        )
        setConfirmationState('failed')
        setConfirmationError(error.message)
        onError?.(error)
      }
    } catch (error) {
      console.error('[Svea ConfirmOrder] Error confirming order:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to confirm order.'
      setConfirmationState('failed')
      setConfirmationError(errorMessage)
      onError?.(error instanceof Error ? error : new Error(errorMessage))
    }
  }, [
    autoRedirect,
    buildRedirectUrl,
    clearCart,
    confirmOrderEndpoint,
    hasCheckedStorage,
    onError,
    onSuccess,
    resolvedClientOrderNumber,
    resolvedOrderId,
    resolvedTransactionId,
    statusParam,
    storageKey,
    urlParams.email,
  ])

  // Auto-trigger confirmation
  useEffect(() => {
    if (confirmationState === 'idle' && hasCheckedStorage) {
      void handleConfirmation()
    }
  }, [confirmationState, hasCheckedStorage, handleConfirmation])

  const retry = useCallback(() => {
    isConfirming.current = false
    setConfirmationState('idle')
    setConfirmationError(null)
  }, [])

  // Render states
  if (confirmationState === 'failed') {
    if (renderFailed) {
      return <>{renderFailed(confirmationError, retry)}</>
    }
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Payment Status
        </h1>
        {confirmationError && (
          <p style={{ color: 'red', marginBottom: '1rem' }}>
            {confirmationError}
          </p>
        )}
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/shop'
            }
          }}
          style={{
            padding: '0.5rem 1rem',
            cursor: 'pointer',
          }}
        >
          Back to shop
        </button>
      </div>
    )
  }

  if (confirmationState === 'success') {
    if (renderSuccess) {
      return <>{renderSuccess()}</>
    }
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Order Confirmed!
        </h1>
        <p style={{ color: '#666' }}>Redirecting to your order...</p>
      </div>
    )
  }

  if (renderConfirming) {
    return <>{renderConfirming()}</>
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
        {confirmationState === 'confirming'
          ? 'Confirming Order'
          : 'Payment Received'}
      </h1>
      <p style={{ color: '#666' }}>
        {statusParam === 'success' || statusParam === 'completed'
          ? 'Hang tight, we are finalising your order.'
          : 'Processing your payment status...'}
      </p>
    </div>
  )
}

