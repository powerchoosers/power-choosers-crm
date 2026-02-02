import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.FREE_GEMINI_KEY || process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

export async function POST(req: NextRequest) {
  try {
    const { accountId, filePath, fileName } = await req.json()

    if (!accountId || !filePath) {
      return NextResponse.json({ error: 'Missing accountId or filePath' }, { status: 400 })
    }

    // 1. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseAdmin
      .storage
      .from('vault')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Download Error:', downloadError)
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
    }

    // 2. Prepare file for Gemini
    const arrayBuffer = await fileData.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')
    
    const filePart = {
      inlineData: {
        data: base64Data,
        mimeType: fileData.type || 'application/pdf',
      },
    }

    // 3. Construct Prompt
    const prompt = `
    You are an expert energy analyst for Nodal Point CRM. Analyze this document.
    
    Task 1: Classify the document type.
    - "SIGNED_CONTRACT": A signed Energy Service Agreement (ESA) or similar binding contract.
    - "BILL": A standard utility bill or invoice.
    - "OTHER": Anything else.

    Task 2: Extract key data fields.
    - contract_end_date: The specific expiration date. If not found, estimate based on term length.
    - strike_price: The energy rate (in cents/kWh or $/MWh). Convert to cents (e.g., 0.045).
    - supplier: The name of the retail electricity provider (REP).
    - annual_usage: Estimated annual kWh. If a monthly bar chart exists, sum it up. If only one month, multiply by 12.
    - esids: An array of ESI ID numbers (17-22 digits) and their service addresses found in the document.

    Return ONLY a JSON object with this structure:
    {
      "type": "SIGNED_CONTRACT" | "BILL" | "OTHER",
      "data": {
        "contract_end_date": "YYYY-MM-DD" or null,
        "strike_price": number (e.g., 0.045) or null,
        "supplier": string or null,
        "annual_usage": number or null,
        "esids": [
          { "id": "100...", "address": "123 Main St..." }
        ]
      }
    }
    `

    // 4. Call Gemini
    const result = await model.generateContent([prompt, filePart])
    const responseText = result.response.text()
    
    // Clean and parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response')
    }
    
    const analysis = JSON.parse(jsonMatch[0])
    console.log('Gemini Analysis:', analysis)

    // 5. Update Database based on findings
    const updates: any = {}
    const { type, data } = analysis

    // Map fields to accounts table
    if (data.contract_end_date) updates.contract_end_date = data.contract_end_date
    if (data.strike_price) updates.current_rate = String(data.strike_price) // stored as text in schema
    if (data.supplier) updates.electricity_supplier = data.supplier
    if (data.annual_usage) updates.annual_usage = String(data.annual_usage)

    // Status Logic
    if (type === 'SIGNED_CONTRACT') {
      updates.status = 'ACTIVE_LOAD' // Or 'Customer' depending on enum
    }
    // If BILL, do NOT change status to Customer (keep as Prospect/Lead)

    // Update Accounts Table
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('accounts')
        .update(updates)
        .eq('id', accountId)

      if (updateError) console.error('Account Update Error:', updateError)
    }

    // Insert Meters (ESIDs)
    if (data.esids && data.esids.length > 0) {
      const metersToInsert = data.esids.map((m: any) => ({
        account_id: accountId,
        esid: m.id,
        service_address: m.address,
        status: 'Active',
        metadata: { source: 'ai_extraction', document: fileName }
      }))

      const { error: meterError } = await supabaseAdmin
        .from('meters')
        .upsert(metersToInsert, { onConflict: 'esid' }) // Assuming unique ESIDs might be good, but schema doesn't force it. Upsert is safe.
      
      if (meterError) console.error('Meter Insert Error:', meterError)
    }

    return NextResponse.json({ success: true, analysis })

  } catch (error: any) {
    console.error('Analysis Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Unknown analysis error',
      details: error.toString()
    }, { status: 500 })
  }
}
