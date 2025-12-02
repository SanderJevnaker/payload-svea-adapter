import type {
  PaymentAdapterClient,
  PaymentAdapterClientArgs,
} from '@payloadcms/plugin-ecommerce/types'

export interface SveaAdapterClientConfig extends PaymentAdapterClientArgs {
  /** Label for the payment method in the UI */
  label?: string
}

/**
 * Creates a Svea client adapter for frontend use
 *
 * @example
 * ```tsx
 * // In your providers
 * import { sveaAdapterClient } from '@sanderjevnaker/payload-svea-adapter/client'
 *
 * <PaymentsProvider
 *   paymentMethods={[sveaAdapterClient({ label: 'Pay with Svea' })]}
 * >
 *   {children}
 * </PaymentsProvider>
 * ```
 */
export function sveaAdapterClient(
  config: SveaAdapterClientConfig = {},
): PaymentAdapterClient {
  const { label = 'Svea' } = config

  return {
    name: 'svea',
    label,
    initiatePayment: true,
    confirmOrder: true,
  }
}

