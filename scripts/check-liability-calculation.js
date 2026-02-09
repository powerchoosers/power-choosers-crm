/**
 * Script to verify liability under management calculation
 * Checks annual_usage values from accounts table
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load env from root
dotenv.config({ path: join(__dirname, '..', '.env') })
dotenv.config({ path: join(__dirname, '..', 'crm-platform', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkLiability() {
  console.log('=== Checking Liability Under Management Calculation ===\n')

  // Get all accounts with annual_usage
  const { data: allAccounts, error: allError } = await supabase
    .from('accounts')
    .select('id, name, status, annual_usage, ownerId')
    .not('annual_usage', 'is', null)
    .neq('annual_usage', '')

  if (allError) {
    console.error('Error fetching accounts:', allError)
    return
  }

  console.log(`Total accounts with annual_usage: ${allAccounts.length}\n`)

  // Calculate total kWh
  let totalKWh = 0
  const accountsWithUsage = []

  allAccounts.forEach(acc => {
    const usage = acc.annual_usage
    let num = 0
    
    if (typeof usage === 'string') {
      num = parseFloat(usage.replace(/,/g, '')) || 0
    } else if (typeof usage === 'number') {
      num = usage
    }

    if (num > 0) {
      totalKWh += num
      accountsWithUsage.push({
        name: acc.name,
        status: acc.status,
        annual_usage: acc.annual_usage,
        parsed_kwh: num
      })
    }
  })

  console.log(`Total kWh (all accounts): ${totalKWh.toLocaleString('en-US')} kWh`)
  console.log(`Rounded: ${Math.round(totalKWh).toLocaleString('en-US')} kWh\n`)

  // Check by status
  console.log('=== Breakdown by Status ===')
  const statusGroups = {}
  accountsWithUsage.forEach(acc => {
    const status = acc.status || 'NULL'
    if (!statusGroups[status]) {
      statusGroups[status] = { count: 0, totalKWh: 0, accounts: [] }
    }
    statusGroups[status].count++
    statusGroups[status].totalKWh += acc.parsed_kwh
    statusGroups[status].accounts.push(acc)
  })

  Object.entries(statusGroups).forEach(([status, data]) => {
    console.log(`\n${status}:`)
    console.log(`  Accounts: ${data.count}`)
    console.log(`  Total kWh: ${Math.round(data.totalKWh).toLocaleString('en-US')} kWh`)
    if (data.accounts.length <= 10) {
      console.log(`  Accounts:`)
      data.accounts.forEach(a => {
        console.log(`    - ${a.name}: ${a.annual_usage} (parsed: ${a.parsed_kwh.toLocaleString()})`)
      })
    } else {
      console.log(`  Top 5 by usage:`)
      data.accounts
        .sort((a, b) => b.parsed_kwh - a.parsed_kwh)
        .slice(0, 5)
        .forEach(a => {
          console.log(`    - ${a.name}: ${a.annual_usage} (parsed: ${a.parsed_kwh.toLocaleString()})`)
        })
    }
  })

  // Check customer accounts specifically
  console.log('\n=== Customer Accounts (CUSTOMER, ACTIVE_LOAD) ===')
  const customerAccounts = accountsWithUsage.filter(
    acc => acc.status === 'CUSTOMER' || acc.status === 'ACTIVE_LOAD'
  )
  const customerTotalKWh = customerAccounts.reduce((sum, acc) => sum + acc.parsed_kwh, 0)
  
  console.log(`Customer accounts with usage: ${customerAccounts.length}`)
  console.log(`Total kWh (customers only): ${Math.round(customerTotalKWh).toLocaleString('en-US')} kWh`)
  
  if (customerAccounts.length > 0) {
    console.log('\nCustomer accounts:')
    customerAccounts
      .sort((a, b) => b.parsed_kwh - a.parsed_kwh)
      .forEach(a => {
        console.log(`  - ${a.name} (${a.status}): ${a.annual_usage} (parsed: ${a.parsed_kwh.toLocaleString()})`)
      })
  }

  console.log('\n=== Summary ===')
  console.log(`Current calculation (all accounts): ${Math.round(totalKWh).toLocaleString('en-US')} kWh`)
  console.log(`If filtered to customers only: ${Math.round(customerTotalKWh).toLocaleString('en-US')} kWh`)
  console.log(`Difference: ${Math.round(totalKWh - customerTotalKWh).toLocaleString('en-US')} kWh`)
}

checkLiability().catch(console.error)
