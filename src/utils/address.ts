import type { PayloadAddress, SveaAddress } from '../adapter/types'

/**
 * Maps a Payload address to Svea address format
 */
export function mapPayloadAddressToSvea(address: Partial<PayloadAddress>): {
  firstName?: string
  lastName?: string
  fullName?: string
  streetAddress?: string
  coAddress?: string
  postalCode?: string
  city?: string
  countryCode?: string
  phoneNumber?: string
} {
  const fullName =
    [address.firstName, address.lastName].filter(Boolean).join(' ') || undefined

  return {
    firstName: address.firstName || undefined,
    lastName: address.lastName || undefined,
    fullName: fullName || undefined,
    streetAddress: address.addressLine1 || undefined,
    coAddress: address.addressLine2 || undefined,
    postalCode: address.postalCode || undefined,
    city: address.city || undefined,
    countryCode: address.country
      ? String(address.country).slice(0, 2).toUpperCase()
      : undefined,
    phoneNumber: address.phone || undefined,
  }
}

/**
 * Maps a Svea address to Payload address format
 * Handles both camelCase and PascalCase field names from Svea API
 */
export function mapSveaAddressToPayload(
  address?: SveaAddress | Record<string, unknown>,
): PayloadAddress | undefined {
  if (!address) return undefined

  const addr = address as Record<string, unknown>

  const firstName = (addr.firstName || addr.FirstName) as string | undefined
  const lastName = (addr.lastName || addr.LastName) as string | undefined
  const streetAddress = (addr.streetAddress || addr.StreetAddress) as
    | string
    | undefined
  const streetAddress2 = (addr.streetAddress2 || addr.StreetAddress2) as
    | string
    | undefined
  const coAddress = (addr.coAddress || addr.CoAddress) as string | undefined
  const city = (addr.city || addr.City) as string | undefined
  const postalCode = (addr.postalCode || addr.PostalCode) as string | undefined
  const countryCode = (addr.countryCode || addr.CountryCode) as
    | string
    | undefined
  const phoneNumber = (addr.phoneNumber || addr.PhoneNumber) as
    | string
    | undefined

  const result: PayloadAddress = {
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    company: undefined,
    addressLine1: streetAddress || coAddress || undefined,
    addressLine2:
      streetAddress2 || (coAddress && streetAddress ? coAddress : undefined),
    city: city || undefined,
    state: undefined,
    postalCode: postalCode || undefined,
    country: countryCode || undefined,
    phone: phoneNumber || undefined,
  }

  const hasData = Object.values(result).some((v) => v !== undefined)
  return hasData ? result : undefined
}

