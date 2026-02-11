/**
 * Contact and Account variables for Transmission Builder text modules.
 * Used for "Insert variable" in TEXT_MODULE and for substitution at send time.
 * Keys match {{contact.xxx}} and {{account.xxx}} placeholders.
 */

export const CONTACT_VARIABLES: { key: string; label: string }[] = [
  { key: 'contact.firstName', label: 'First name' },
  { key: 'contact.lastName', label: 'Last name' },
  { key: 'contact.name', label: 'Full name' },
  { key: 'contact.email', label: 'Email' },
  { key: 'contact.title', label: 'Title / Position' },
  { key: 'contact.phone', label: 'Primary phone' },
  { key: 'contact.mobile', label: 'Mobile' },
  { key: 'contact.workDirectPhone', label: 'Work direct' },
  { key: 'contact.otherPhone', label: 'Other phone' },
  { key: 'contact.companyPhone', label: 'Company phone' },
  { key: 'contact.city', label: 'City' },
  { key: 'contact.state', label: 'State' },
  { key: 'contact.location', label: 'Location (City, State)' },
  { key: 'contact.address', label: 'Address' },
  { key: 'contact.linkedinUrl', label: 'LinkedIn' },
  { key: 'contact.website', label: 'Website' },
  { key: 'contact.notes', label: 'Notes' },
  { key: 'contact.listName', label: 'List name' },
  { key: 'contact.companyName', label: 'Company name' },
  { key: 'contact.industry', label: 'Industry' },
  { key: 'contact.electricitySupplier', label: 'Electricity supplier' },
  { key: 'contact.annualUsage', label: 'Annual usage' },
  { key: 'contact.currentRate', label: 'Current rate' },
  { key: 'contact.contractEnd', label: 'Contract end' },
  { key: 'contact.accountDescription', label: 'Account description' },
]

export const ACCOUNT_VARIABLES: { key: string; label: string }[] = [
  { key: 'account.name', label: 'Company name' },
  { key: 'account.industry', label: 'Industry' },
  { key: 'account.domain', label: 'Domain / Website' },
  { key: 'account.description', label: 'Description' },
  { key: 'account.companyPhone', label: 'Company phone' },
  { key: 'account.contractEnd', label: 'Contract end date' },
  { key: 'account.location', label: 'Location' },
  { key: 'account.city', label: 'City' },
  { key: 'account.state', label: 'State' },
  { key: 'account.address', label: 'Address' },
  { key: 'account.linkedinUrl', label: 'LinkedIn' },
  { key: 'account.annualUsage', label: 'Annual usage (kWh)' },
  { key: 'account.electricitySupplier', label: 'Current supplier' },
  { key: 'account.currentRate', label: 'Current rate' },
  { key: 'account.revenue', label: 'Revenue' },
  { key: 'account.employees', label: 'Employees' },
]

/** All placeholder keys for regex extraction (e.g. {{contact.firstName}}) */
export function extractVariableKeysFromText(text: string): string[] {
  const set = new Set<string>()
  const regex = /\{\{([^}]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    set.add(m[1].trim())
  }
  return Array.from(set)
}
