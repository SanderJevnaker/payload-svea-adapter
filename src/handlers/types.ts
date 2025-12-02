import type { Payload } from 'payload'

/**
 * Configuration for Svea route handlers
 */
export interface SveaHandlerConfig {
  /** Svea Merchant ID */
  merchantId: string
  /** Svea Secret Key */
  secretKey: string
  /** Svea Checkout API URL */
  checkoutApiUrl?: string
  /** Frontend base URL for callbacks */
  frontendBaseUrl?: string
  /** Collection slugs */
  collections?: {
    transactions?: string
    orders?: string
    carts?: string
    customers?: string
    products?: string
    variants?: string
  }
}

/**
 * Context passed to route handlers
 */
export interface SveaHandlerContext {
  payload: Payload
  config: Required<SveaHandlerConfig>
}

/**
 * Function to get Payload instance
 */
export type GetPayloadFn = () => Promise<Payload>

