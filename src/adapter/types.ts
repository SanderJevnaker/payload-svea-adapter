/**
 * Svea Address object (supports both camelCase and PascalCase from Svea API)
 */
export interface SveaAddress {
  firstName?: string
  lastName?: string
  fullName?: string
  streetAddress?: string
  streetAddress2?: string
  streetAddress3?: string
  coAddress?: string
  postalCode?: string
  city?: string
  countryCode?: string
  phoneNumber?: string
  // PascalCase variants from Svea API
  FirstName?: string
  LastName?: string
  FullName?: string
  StreetAddress?: string
  StreetAddress2?: string
  StreetAddress3?: string
  CoAddress?: string
  PostalCode?: string
  City?: string
  CountryCode?: string
  PhoneNumber?: string
  IsGeneric?: boolean
  AddressLines?: string[]
}

/**
 * Svea Order Row (line item)
 */
export interface SveaOrderRow {
  /** Product/item name */
  name: string
  /** Quantity in minor units (e.g., 100 = 1 unit) */
  quantity: number
  /** Unit price in minor units (e.g., 10000 = 100.00) */
  unitPrice: number
  /** VAT percent in minor units (e.g., 2500 = 25%) */
  vatPercent: number
  /** Discount percent in minor units */
  discountPercent?: number
  /** Discount amount in minor units */
  discountAmount?: number
  /** Optional product ID */
  productId?: string
}

/**
 * Svea Cart object
 */
export interface SveaCart {
  items: SveaOrderRow[]
}

/**
 * Svea Merchant Settings for checkout
 */
export interface SveaMerchantSettings {
  /** URL to terms and conditions */
  termsUri?: string
  /** URL to checkout page (for back navigation) */
  checkoutUri?: string
  /** URL to confirmation page after successful payment */
  confirmationUri?: string
  /** URL for webhook notifications */
  pushUri?: string
  /** URL for validation callbacks */
  checkoutValidationCallBackUri?: string
  /** Enable active part payment campaigns */
  activePartPaymentCampaigns?: boolean
}

/**
 * Svea Preset Value for pre-filling checkout
 */
export interface SveaPresetValue {
  typeName: string
  value: string
  isReadonly?: boolean
}

/**
 * Svea Identity Flags for checkout
 */
export interface SveaIdentityFlags {
  hideNotYou?: boolean
  hideChangeAddress?: boolean
  hideAnonymous?: boolean
}

/**
 * Svea Shipping Information
 */
export interface SveaShippingInformation {
  id?: string
  name?: string
  description?: string
  price?: number
  preselected?: boolean
  shippingFee?: number
  freeShippingIfItemsInCart?: boolean
  shippingMethod?: string
}

/**
 * Request body for creating a Svea order
 */
export interface CreateSveaOrderRequest {
  countryCode: string
  currency: string
  locale: string
  clientOrderNumber: string
  merchantSettings?: SveaMerchantSettings
  cart: SveaCart
  presetValues?: SveaPresetValue[]
  identityFlags?: SveaIdentityFlags
  requireElectronicIdAuthentication?: boolean
  partnerKey?: string
  merchantData?: string
  shippingInformation?: SveaShippingInformation
  validation?: {
    minAge?: number
  }
  recurring?: boolean | null
}

/**
 * Svea GUI object containing the checkout snippet
 */
export interface SveaGui {
  Snippet: string
}

/**
 * Svea Customer object
 */
export interface SveaCustomer {
  emailAddress?: string
  phoneNumber?: string
  nationalId?: string
  isCompany?: boolean
  companyName?: string
}

/**
 * Svea Payment Info
 */
export interface SveaPaymentInfo {
  paymentType?: string
  paymentMethod?: string
}

/**
 * Svea Order object returned from API
 */
export interface SveaOrder {
  OrderId: number
  ClientOrderNumber: string
  Gui: SveaGui
  Status: string
  Cart: SveaCart
  Currency: string
  Locale: string
  Customer?: SveaCustomer
  CountryCode: string
  EmailAddress?: string
  PhoneNumber?: string
  ShippingAddress?: SveaAddress
  BillingAddress?: SveaAddress
  PaymentType?: string
  Payment?: SveaPaymentInfo
  SveaWillBuyOrder?: boolean | null
  MerchantSettings?: SveaMerchantSettings
  IdentityFlags?: SveaIdentityFlags
  CustomerReference?: string
  PeppolId?: string
  MerchantData?: string
  ShippingInformation?: SveaShippingInformation
  Recurring?: boolean | null
  RecurringToken?: string | null
  BillingReferences?: Array<{
    reference?: string
  }>
}

/**
 * Response from GET /api/orders/{orderId}
 */
export interface GetSveaOrderResponse extends SveaOrder {}

/**
 * Response from POST /api/orders
 */
export interface CreateSveaOrderResponse extends SveaOrder {}

/**
 * Configuration for the Svea adapter
 */
export interface SveaAdapterConfig {
  /** Svea Merchant ID */
  merchantId: string
  /** Svea Secret Key */
  secretKey: string
  /** Svea Checkout API URL (defaults to staging) */
  checkoutApiUrl?: string
  /** Frontend base URL for callbacks */
  frontendBaseUrl?: string
  /** Label for the payment method */
  label?: string
  /** Collection slugs configuration */
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
 * Payload address structure
 */
export interface PayloadAddress {
  firstName?: string
  lastName?: string
  company?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  phone?: string
}

