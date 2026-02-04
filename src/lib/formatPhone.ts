/**
 * Format phone number to US standard: +1 (XXX)-XXX-XXXX
 * Handles various input formats and removes leading apostrophes from CSV imports
 */
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return ''
  
  // Remove leading apostrophe if present (from CSV)
  let cleanValue = value.trim()
  if (cleanValue.startsWith("'")) {
    cleanValue = cleanValue.substring(1)
  }
  
  // Extract only digits
  let digits = cleanValue.replace(/\D/g, '')
  
  // Handle country code: If it starts with 1, strip it (it's the +1 we added)
  // US Area codes cannot start with 1, so a leading 1 is always the country code
  if (digits.startsWith('1')) {
    digits = digits.substring(1)
  }

  if (digits.length === 0) return ''
  
  // Limit to 10 digits (US standard)
  digits = digits.slice(0, 10)
  
  // US Format: +1 (XXX)-XXX-XXXX
  let formatted = '+1'
  if (digits.length > 0) {
    formatted += ' (' + digits.slice(0, 3)
  }
  if (digits.length >= 4) {
    formatted += ')-' + digits.slice(3, 6)
  }
  if (digits.length >= 7) {
    formatted += '-' + digits.slice(6, 10)
  }
  return formatted
}
