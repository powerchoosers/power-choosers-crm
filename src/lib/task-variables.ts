type LooseObject = Record<string, unknown>;

type TaskVariableContext = {
  contact?: LooseObject | null;
  account?: LooseObject | null;
};

function clean(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function fallback(value: unknown): string {
  const v = clean(value);
  return v || '—';
}

export function buildTaskVariableMap(context: TaskVariableContext): Record<string, string> {
  const contact = (context.contact || {}) as LooseObject;
  const account = (context.account || {}) as LooseObject;
  const contactMeta = (contact.metadata || {}) as LooseObject;
  const accountMeta = (account.metadata || {}) as LooseObject;
  const accountGeneral = (accountMeta.general || {}) as LooseObject;

  const firstName = clean(contact.firstName) || clean(contactMeta.firstName) || clean(contactMeta.first_name);
  const lastName = clean(contact.lastName) || clean(contactMeta.lastName) || clean(contactMeta.last_name);
  const fullName =
    clean(contact.name) ||
    [firstName, lastName].filter(Boolean).join(' ').trim();

  const accountName =
    clean(account.name) ||
    clean(contact.company) ||
    clean(contactMeta.company) ||
    clean(contactMeta.companyName) ||
    clean(accountGeneral.company) ||
    clean(accountGeneral.companyName);

  const accountDomain =
    clean(account.domain) ||
    clean(accountMeta.domain) ||
    clean(accountGeneral.domain) ||
    clean(contact.website);

  const accountDescription =
    clean(account.description) ||
    clean(accountMeta.description) ||
    clean(contact.accountDescription);

  return {
    'contact.firstName': fallback(firstName),
    'contact.lastName': fallback(lastName),
    'contact.name': fallback(fullName),
    'contact.email': fallback(contact.email),
    'contact.title': fallback(contact.title),
    'contact.phone': fallback(contact.phone),
    'contact.mobile': fallback(contact.mobile),
    'contact.workDirectPhone': fallback(contact.workDirectPhone || contact.workPhone),
    'contact.otherPhone': fallback(contact.otherPhone),
    'contact.companyPhone': fallback(contact.companyPhone || account.phone),
    'contact.city': fallback(contact.city),
    'contact.state': fallback(contact.state),
    'contact.location': fallback(contact.location),
    'contact.address': fallback(contact.address),
    'contact.linkedinUrl': fallback(contact.linkedinUrl),
    'contact.website': fallback(contact.website || accountDomain),
    'contact.notes': fallback(contact.notes),
    'contact.listName': fallback(contact.listName),
    'contact.companyName': fallback(accountName),
    'contact.industry': fallback(contact.industry || account.industry),
    'contact.electricitySupplier': fallback(contact.electricitySupplier || account.electricitySupplier || account.electricity_supplier),
    'contact.annualUsage': fallback(contact.annualUsage || account.annualUsage || account.annual_usage),
    'contact.currentRate': fallback(contact.currentRate || account.currentRate || account.current_rate),
    'contact.contractEnd': fallback(contact.contractEnd || account.contractEnd || account.contract_end_date),
    'contact.accountDescription': fallback(accountDescription),

    'account.name': fallback(accountName),
    'account.industry': fallback(account.industry || contact.industry),
    'account.domain': fallback(accountDomain),
    'account.description': fallback(accountDescription),
    'account.companyPhone': fallback(account.phone || contact.companyPhone),
    'account.contractEnd': fallback(account.contractEnd || account.contract_end_date || contact.contractEnd),
    'account.location': fallback(account.location || contact.location),
    'account.city': fallback(account.city || contact.city),
    'account.state': fallback(account.state || contact.state),
    'account.address': fallback(account.address || contact.address),
    'account.linkedinUrl': fallback(account.linkedinUrl || account.linkedin_url || contact.linkedinUrl),
    'account.annualUsage': fallback(account.annualUsage || account.annual_usage || contact.annualUsage),
    'account.electricitySupplier': fallback(account.electricitySupplier || account.electricity_supplier || contact.electricitySupplier),
    'account.currentRate': fallback(account.currentRate || account.current_rate || contact.currentRate),
    'account.revenue': fallback(account.revenue),
    'account.employees': fallback(account.employees),
  };
}

export function resolveTaskTemplateText(input: string | null | undefined, variables: Record<string, string>): string {
  if (!input) return '';

  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_full, rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key) return '—';
    const value = variables[key];
    if (value == null || value === '') return '—';
    return value;
  });
}
