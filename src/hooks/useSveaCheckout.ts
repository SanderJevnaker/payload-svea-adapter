'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'svea:lastOrder'
const PENDING_ORDER_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

interface StoredSveaOrder {
  orderId?: string | number
  transactionId?: string | number
  clientOrderNumber?: string
  savedAt?: number
}

interface SveaPaymentResponse {
  checkoutSnippet?: string
  orderId?: number | string
  transactionId?: number | string
  clientOrderNumber?: string
  [key: string]: unknown
}

interface UseSveaCheckoutOptions {
  /**
   * Session storage key for stored order info
   * @default 'svea:lastOrder'
   */
  storageKey?: string
  /**
   * Timeout in ms for pending order detection
   * @default 1800000 (30 minutes)
   */
  pendingOrderTimeout?: number
}

interface UseSveaCheckoutReturn {
  /**
   * The checkout snippet HTML to render
   */
  checkoutSnippet: string | null
  /**
   * Whether there's a pending Svea order (started but not completed)
   */
  hasPendingOrder: boolean
  /**
   * Handle the Svea payment response from initiatePayment
   * Call this after initiatePayment('svea', ...) returns
   */
  handleSveaPaymentResponse: (response: SveaPaymentResponse) => void
  /**
   * Clear the current Svea checkout session
   */
  clearCheckout: () => void
  /**
   * Clear any stored pending order info
   */
  clearPendingOrder: () => void
  /**
   * Get the stored order info (for debugging or custom flows)
   */
  storedOrderInfo: StoredSveaOrder | null
}

/**
 * Hook for managing Svea checkout state
 *
 * Handles:
 * - Storing order info to sessionStorage for the confirmation page
 * - Detecting pending orders (started but not completed)
 * - Managing the checkout snippet state
 *
 * @example
 * ```tsx
 * import { useSveaCheckout } from '@jevnakern/payload-svea-adapter/hooks'
 *
 * function CheckoutPage() {
 *   const { initiatePayment } = usePayments()
 *   const {
 *     checkoutSnippet,
 *     hasPendingOrder,
 *     handleSveaPaymentResponse,
 *     clearCheckout,
 *     clearPendingOrder,
 *   } = useSveaCheckout()
 *
 *   const handlePayWithSvea = async () => {
 *     const response = await initiatePayment('svea', { additionalData: {...} })
 *     handleSveaPaymentResponse(response)
 *   }
 *
 *   if (hasPendingOrder) {
 *     return <div>You have a pending order...</div>
 *   }
 *
 *   if (checkoutSnippet) {
 *     return (
 *       <div>
 *         <SveaCheckoutContainer snippet={checkoutSnippet} />
 *         <button onClick={clearCheckout}>Cancel</button>
 *       </div>
 *     )
 *   }
 *
 *   return <button onClick={handlePayWithSvea}>Pay with Svea</button>
 * }
 * ```
 */
export function useSveaCheckout(
  options: UseSveaCheckoutOptions = {},
): UseSveaCheckoutReturn {
  const {
    storageKey = STORAGE_KEY,
    pendingOrderTimeout = PENDING_ORDER_TIMEOUT_MS,
  } = options

  const [checkoutSnippet, setCheckoutSnippet] = useState<string | null>(null)
  const [hasPendingOrder, setHasPendingOrder] = useState(false)
  const [storedOrderInfo, setStoredOrderInfo] = useState<StoredSveaOrder | null>(
    null,
  )

  // Check for pending order on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as StoredSveaOrder
        setStoredOrderInfo(parsed)

        const cutoffTime = Date.now() - pendingOrderTimeout
        if (parsed.savedAt && parsed.savedAt > cutoffTime) {
          setHasPendingOrder(true)
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, pendingOrderTimeout])

  const handleSveaPaymentResponse = useCallback(
    (response: SveaPaymentResponse) => {
      const { checkoutSnippet, orderId, transactionId, clientOrderNumber } =
        response

      if (checkoutSnippet) {
        setCheckoutSnippet(checkoutSnippet)
      }

      // Store order info for confirmation page
      if (
        typeof window !== 'undefined' &&
        (orderId || transactionId || clientOrderNumber)
      ) {
        const orderInfo: StoredSveaOrder = {
          orderId,
          transactionId,
          clientOrderNumber,
          savedAt: Date.now(),
        }
        window.sessionStorage.setItem(storageKey, JSON.stringify(orderInfo))
        setStoredOrderInfo(orderInfo)
      }
    },
    [storageKey],
  )

  const clearCheckout = useCallback(() => {
    setCheckoutSnippet(null)
  }, [])

  const clearPendingOrder = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(storageKey)
    }
    setHasPendingOrder(false)
    setStoredOrderInfo(null)
  }, [storageKey])

  return {
    checkoutSnippet,
    hasPendingOrder,
    handleSveaPaymentResponse,
    clearCheckout,
    clearPendingOrder,
    storedOrderInfo,
  }
}

