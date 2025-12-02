/**
 * Svea Payment Adapter for Payload CMS
 *
 * @packageDocumentation
 */

// Main adapter export
export { sveaAdapter, SVEA_API_URLS, createSveaAuthHeaders } from './adapter'

// Types
export type {
  SveaAdapterConfig,
  SveaAddress,
  SveaCart,
  SveaCustomer,
  SveaGui,
  SveaIdentityFlags,
  SveaMerchantSettings,
  SveaOrder,
  SveaOrderRow,
  SveaPaymentInfo,
  SveaPresetValue,
  SveaShippingInformation,
  CreateSveaOrderRequest,
  CreateSveaOrderResponse,
  GetSveaOrderResponse,
  PayloadAddress,
} from './adapter/types'

// Utilities
export {
  mapPayloadAddressToSvea,
  mapSveaAddressToPayload,
  getLocaleFromCountryCode,
  normalizeCountryCode,
  getOriginFromRequest,
  generateClientOrderNumber,
} from './utils'

