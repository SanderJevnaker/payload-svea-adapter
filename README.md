# Payload Svea Adapter

A Svea payment adapter for [Payload CMS](https://payloadcms.com/) with the [@payloadcms/plugin-ecommerce](https://github.com/payloadcms/payload/tree/main/packages/plugin-ecommerce) plugin.

## Features

- 🔌 **Plug & Play** - Drop-in integration with Payload's ecommerce plugin
- 🎯 **Type Safe** - Full TypeScript support
- 🛠️ **Configurable** - Flexible configuration options
- 📦 **Complete Solution** - Includes server adapter, API handlers, and React components
- 🧪 **Staging Support** - Easy switching between staging and production environments

## Installation

```bash
npm install @jevnakern/payload-svea-adapter
# or
yarn add @jevnakern/payload-svea-adapter
# or
pnpm add @jevnakern/payload-svea-adapter
```

## Quick Start

### 1. Configure the Server Adapter

Add the Svea adapter to your Payload ecommerce plugin configuration:

```ts
// src/plugins/index.ts
import { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
import { sveaAdapter, SVEA_API_URLS } from '@jevnakern/payload-svea-adapter'

export const plugins = [
  ecommercePlugin({
    payments: {
      paymentMethods: [
        sveaAdapter({
          merchantId: process.env.SVEA_MERCHANT_ID!,
          secretKey: process.env.SVEA_SECRET_KEY!,
          // Use SVEA_API_URLS.production for production
          checkoutApiUrl: process.env.SVEA_CHECKOUT_API_URL || SVEA_API_URLS.staging,
          frontendBaseUrl: process.env.NEXT_PUBLIC_SERVER_URL,
        }),
      ],
    },
    // ... other config
  }),
]
```

### 2. Configure the Client Adapter

Add the client adapter to your payment providers:

```tsx
// src/providers/index.tsx
import { sveaAdapterClient } from '@jevnakern/payload-svea-adapter/client'
import { PaymentsProvider } from '@payloadcms/plugin-ecommerce/client/react'

export function Providers({ children }) {
  return (
    <PaymentsProvider
      paymentMethods={[
        sveaAdapterClient({ label: 'Pay with Svea' }),
      ]}
    >
      {children}
    </PaymentsProvider>
  )
}
```

### 3. Create API Route Handlers

Create the required API routes for Svea callbacks:

#### Webhook Handler

```ts
// app/api/payments/svea/webhook/route.ts
import { createSveaWebhookHandler } from '@jevnakern/payload-svea-adapter/handlers'
import { getPayload } from 'payload'
import config from '@payload-config'

const handler = createSveaWebhookHandler({
  getPayload: () => getPayload({ config }),
  merchantId: process.env.SVEA_MERCHANT_ID!,
  secretKey: process.env.SVEA_SECRET_KEY!,
})

export const POST = handler.POST
export const GET = handler.GET
```

#### Validation Callback Handler

```ts
// app/api/payments/svea/validation-callback/[[...params]]/route.ts
import { createSveaValidationCallbackHandler } from '@jevnakern/payload-svea-adapter/handlers'
import { getPayload } from 'payload'
import config from '@payload-config'

const handler = createSveaValidationCallbackHandler({
  getPayload: () => getPayload({ config }),
  // Optional: Add custom validation logic
  customValidation: async ({ orderId, transaction }) => {
    // Return true to allow payment, false or throw to reject
    return true
  },
})

export const GET = handler.GET
export const POST = handler.POST
export const PUT = handler.PUT
export const OPTIONS = handler.OPTIONS
```

#### Confirm Order Handler

```ts
// app/api/payments/svea/confirm-order/route.ts
import { createSveaConfirmOrderHandler } from '@jevnakern/payload-svea-adapter/handlers'
import { getPayload } from 'payload'
import config from '@payload-config'

const handler = createSveaConfirmOrderHandler({
  getPayload: () => getPayload({ config }),
  merchantId: process.env.SVEA_MERCHANT_ID!,
  secretKey: process.env.SVEA_SECRET_KEY!,
})

export const POST = handler.POST
export const OPTIONS = handler.OPTIONS
```

### 4. Add Checkout Components

Use the provided React components in your checkout flow:

```tsx
// app/checkout/page.tsx
'use client'

import { useState } from 'react'
import { usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { SveaCheckoutContainer } from '@jevnakern/payload-svea-adapter/components'

export default function CheckoutPage() {
  const { initiatePayment } = usePayments()
  const [checkoutSnippet, setCheckoutSnippet] = useState<string | null>(null)

  const handlePayWithSvea = async () => {
    const response = await initiatePayment('svea', {
      additionalData: {
        customerEmail: 'customer@example.com',
        billingAddress: {
          firstName: 'John',
          lastName: 'Doe',
          addressLine1: 'Street 123',
          city: 'Oslo',
          postalCode: '0123',
          country: 'NO',
        },
      },
    })

    if (response.checkoutSnippet) {
      // Store order info in session storage for confirmation page
      sessionStorage.setItem('svea:lastOrder', JSON.stringify({
        orderId: response.orderId,
        transactionId: response.transactionId,
        clientOrderNumber: response.clientOrderNumber,
        savedAt: Date.now(),
      }))

      setCheckoutSnippet(response.checkoutSnippet)
    }
  }

  if (checkoutSnippet) {
    return (
      <div>
        <h2>Complete your payment</h2>
        <SveaCheckoutContainer snippet={checkoutSnippet} />
        <button onClick={() => setCheckoutSnippet(null)}>
          Cancel payment
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1>Checkout</h1>
      <button onClick={handlePayWithSvea}>Pay with Svea</button>
    </div>
  )
}
```

### 5. Add Confirmation Page

Create a confirmation page to handle post-payment redirects:

```tsx
// app/checkout/confirm-order/[[...params]]/page.tsx
'use client'

import { SveaConfirmOrder } from '@jevnakern/payload-svea-adapter/components'
import { useCart } from '@payloadcms/plugin-ecommerce/client/react'

export default function ConfirmOrderPage() {
  const { clearCart } = useCart()

  return (
    <SveaConfirmOrder
      clearCart={clearCart}
      onSuccess={(result) => {
        console.log('Order confirmed:', result)
      }}
      onError={(error) => {
        console.error('Confirmation failed:', error)
      }}
      // Customize rendering (optional)
      renderConfirming={() => (
        <div>
          <h1>Processing your order...</h1>
          <p>Please wait while we confirm your payment.</p>
        </div>
      )}
      renderSuccess={() => (
        <div>
          <h1>🎉 Order Confirmed!</h1>
          <p>Thank you for your purchase!</p>
        </div>
      )}
      renderFailed={(error, retry) => (
        <div>
          <h1>Something went wrong</h1>
          <p>{error}</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}
    />
  )
}
```

## Environment Variables

```env
# Required
SVEA_MERCHANT_ID=your-merchant-id
SVEA_SECRET_KEY=your-secret-key

# Optional
SVEA_CHECKOUT_API_URL=https://checkoutapistage.svea.com  # Use https://checkoutapi.svea.com for production
NEXT_PUBLIC_SERVER_URL=https://your-domain.com
FRONTEND_BASE_URL=https://your-domain.com
```

## API Reference

### `sveaAdapter(config)`

Creates the server-side payment adapter.

```ts
interface SveaAdapterConfig {
  merchantId: string
  secretKey: string
  checkoutApiUrl?: string  // Default: staging URL
  frontendBaseUrl?: string // Default: NEXT_PUBLIC_SERVER_URL
  label?: string           // Default: 'Svea'
  collections?: {
    transactions?: string  // Default: 'transactions'
    orders?: string        // Default: 'orders'
    carts?: string         // Default: 'carts'
    customers?: string     // Default: 'users'
    products?: string      // Default: 'products'
    variants?: string      // Default: 'variants'
  }
}
```

### `sveaAdapterClient(config)`

Creates the client-side payment adapter.

```ts
interface SveaAdapterClientConfig {
  label?: string  // Default: 'Svea'
}
```

### `SveaCheckoutContainer`

React component for rendering the Svea checkout widget.

```tsx
interface SveaCheckoutContainerProps {
  snippet: string          // HTML snippet from initiatePayment response
  containerId?: string     // Default: 'svea-checkout-container'
  className?: string
}
```

### `SveaConfirmOrder`

React component for handling order confirmation.

```tsx
interface SveaConfirmOrderProps {
  confirmOrderEndpoint?: string  // Default: '/api/payments/svea/confirm-order'
  storageKey?: string            // Default: 'svea:lastOrder'
  onSuccess?: (result: ConfirmOrderResult) => void
  onError?: (error: Error) => void
  clearCart?: () => void | Promise<void>
  buildRedirectUrl?: (orderID: string, email?: string | null) => string
  autoRedirect?: boolean         // Default: true
  renderConfirming?: () => React.ReactNode
  renderSuccess?: () => React.ReactNode
  renderFailed?: (error: string | null, retry: () => void) => React.ReactNode
}
```

### Route Handler Factories

#### `createSveaWebhookHandler(options)`

Creates webhook handler for Svea push notifications.

#### `createSveaValidationCallbackHandler(options)`

Creates validation callback handler. Supports custom validation logic.

#### `createSveaConfirmOrderHandler(options)`

Creates confirm order handler for finalizing payments.

## Utilities

The package exports several utility functions:

```ts
import {
  createSveaAuthHeaders,     // Generate Svea API auth headers
  mapPayloadAddressToSvea,   // Convert Payload address to Svea format
  mapSveaAddressToPayload,   // Convert Svea address to Payload format
  getLocaleFromCountryCode,  // Get Svea locale from country code
  normalizeCountryCode,      // Normalize country codes
  getOriginFromRequest,      // Extract origin URL from request
  generateClientOrderNumber, // Generate unique order number
} from '@jevnakern/payload-svea-adapter'
```

## TypeScript Types

All types are exported:

```ts
import type {
  SveaAdapterConfig,
  SveaAddress,
  SveaCart,
  SveaOrder,
  SveaOrderRow,
  CreateSveaOrderRequest,
  CreateSveaOrderResponse,
  GetSveaOrderResponse,
  PayloadAddress,
  // ... and more
} from '@jevnakern/payload-svea-adapter'
```

## Testing with Svea Staging

For testing, use the Svea staging environment:

1. Get staging credentials from Svea
2. Set `SVEA_CHECKOUT_API_URL=https://checkoutapistage.svea.com`
3. Use test card numbers provided by Svea

## License

MIT © Sander Jevnaker

