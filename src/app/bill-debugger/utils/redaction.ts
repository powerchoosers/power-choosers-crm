export function isExampleBillFileName(fileName?: string | null) {
    if (!fileName) return false

    return fileName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .includes('example-bill')
}

export function redactBillIdentity<T extends Record<string, any>>(data: T, enabled: boolean): T {
    if (!enabled) return data

    const customerName = 'Redacted customer'
    const providerName = 'Redacted provider'
    const serviceAddress = 'Address redacted'
    const accountNumber = 'Account redacted'
    const esid = 'ESI ID redacted'

    return {
        ...data,
        customer_name: customerName,
        customerName,
        provider_name: providerName,
        providerName,
        service_address: serviceAddress,
        serviceAddress,
        account_number: accountNumber,
        accountNumber,
        esid,
        esiId: esid,
        esi_id: esid,
    }
}
