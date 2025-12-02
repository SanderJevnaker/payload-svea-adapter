import crypto from 'crypto'

/**
 * Creates Svea authentication headers for API requests
 * 
 * @param merchantId - Svea Merchant ID
 * @param secretKey - Svea Secret Key
 * @param requestBody - Request body string (empty string for GET requests)
 * @returns Object containing the Authorization token and Timestamp header values
 * 
 * @example
 * ```ts
 * const { token, timestamp } = createSveaAuthHeaders(merchantId, secretKey, JSON.stringify(body))
 * 
 * fetch(url, {
 *   headers: {
 *     'Authorization': `Svea ${token}`,
 *     'Timestamp': timestamp,
 *   }
 * })
 * ```
 */
export function createSveaAuthHeaders(
  merchantId: string,
  secretKey: string,
  requestBody: string = '',
): { token: string; timestamp: string } {
  if (!merchantId || !secretKey) {
    throw new Error('Merchant ID and secret key are required')
  }

  // Create timestamp in UTC format: YYYY-MM-DD HH:MM:SS
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const day = String(now.getUTCDate()).padStart(2, '0')
  const hours = String(now.getUTCHours()).padStart(2, '0')
  const minutes = String(now.getUTCMinutes()).padStart(2, '0')
  const seconds = String(now.getUTCSeconds()).padStart(2, '0')
  const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`

  // Create SHA-512 hash of: requestBody + secretKey + timestamp
  const input = requestBody + secretKey + timestamp
  const hashBytes = crypto.createHash('sha512').update(input, 'utf-8').digest()
  const hash = Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toLowerCase()

  // Create base64 encoded token: merchantId:hash
  const tokenString = `${merchantId}:${hash}`
  const token = Buffer.from(tokenString, 'utf-8').toString('base64')

  return { token, timestamp }
}

