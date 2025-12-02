/**
 * Maps country codes to Svea-compatible locale strings
 */
const LOCALE_MAP: Record<string, string> = {
  NO: 'nn-no',
  SE: 'sv-se',
  DK: 'da-dk',
  DE: 'de-de',
  FI: 'fi-fi',
  US: 'en-us',
  GB: 'en-gb',
}

/**
 * Get Svea locale from country code
 * @param countryCode - ISO 3166-1 alpha-2 country code
 * @param defaultLocale - Default locale if country not found
 */
export function getLocaleFromCountryCode(
  countryCode: string,
  defaultLocale = 'nn-no',
): string {
  return LOCALE_MAP[countryCode.toUpperCase()] || defaultLocale
}

/**
 * Normalize country code to ISO 3166-1 alpha-2
 */
export function normalizeCountryCode(country?: string | null): string {
  if (!country) return 'NO'
  return String(country).slice(0, 2).toUpperCase()
}

