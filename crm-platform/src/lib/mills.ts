export const millOptions = Array.from({ length: 391 }, (_, idx) => ((2000 - idx * 5) / 100).toFixed(2))

function toNumeric(value?: number | string) {
  if (value == null || value === '') return NaN
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : NaN
}

export function formatMillValue(value?: number | string) {
  const numeric = toNumeric(value)
  if (Number.isNaN(numeric)) return ''
  const normalized = numeric < 1 ? numeric * 1000 : numeric
  return normalized.toFixed(2)
}

export function millDecimal(value?: number | string) {
  const numeric = toNumeric(value)
  if (Number.isNaN(numeric)) return 0
  return numeric >= 1 ? numeric / 1000 : numeric
}
