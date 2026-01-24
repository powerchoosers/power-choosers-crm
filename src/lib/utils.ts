import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a phone number string to E.164 format (e.g., +19728342317)
 */
export function formatToE164(phone: string): string {
  if (!phone) return ''
  const cleaned = String(phone).replace(/\D/g, '')
  if (cleaned.length === 10) return `+1${cleaned}`
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`
  if (String(phone).startsWith('+')) return String(phone).replace(/\s+/g, '') // Keep +, but remove spaces
  return ''
}
