/**
 * Copy that more than one public page uses. Keep facts here so the home page and the
 * detail pages cannot drift apart.
 */

export const HOW_IT_WORKS_STEPS = [
  {
    title: 'Send us a recent bill',
    body: 'Upload one electricity bill. A current contract or supplier quote works too.',
  },
  {
    title: 'We find the gaps',
    body: 'We split the bill into supply, delivery, and contract terms, then show you where money is leaking in plain English.',
  },
  {
    title: 'Suppliers compete',
    body: 'We take your account to our supplier partners and negotiate the rate and the terms.',
  },
  {
    title: 'We handle the paperwork',
    body: 'You pick the option that fits. We do the contract work and keep watching the market for you.',
  },
] as const

export const INDUSTRIES = [
  {
    title: 'Manufacturing',
    summary: 'Long production runs can lock in peak charges.',
    watch: 'Peak hours and charges that carry over from a past spike',
  },
  {
    title: 'Logistics and warehousing',
    summary: 'Dock activity and delivery charges distort the bill.',
    watch: 'Dock-hour spikes and delivery charges',
  },
  {
    title: 'Commercial real estate',
    summary: 'Tenant recovery language can hide delivery cost.',
    watch: 'Pass-through terms and how tenants are metered',
  },
  {
    title: 'Hospitality',
    summary: 'Occupancy swings change which plan fits.',
    watch: 'Seasonal swings and heating and cooling load',
  },
  {
    title: 'Office',
    summary: 'Base load and shared areas need a cleaner contract.',
    watch: 'Always-on load and common areas',
  },
  {
    title: 'Restaurants',
    summary: 'Kitchen peaks and late service move the meter.',
    watch: 'Kitchen equipment and late service hours',
  },
] as const
