# Gemini Chat Search Fix - Intelligent Call Search with Multi-Phone Support

## Problem
The Gemini chat was unable to find call information when users asked questions like:
- "Did Francisco mention his email in the call from April 21st?"
- "What did we discuss in the call to Icon Cinema?"

The `search_transcripts` tool only supported text-based queries and couldn't:
1. **Search by date** (specific date or date range)
2. **Search by phone number** (from/to fields in the calls table)
3. **Intelligently search across multiple phone numbers** for a contact or account

## Root Cause
The `search_transcripts` tool handler in `crm-platform/src/pages/api/gemini/chat.js` was designed to:
- Require a `query` parameter (text search)
- Only search within `transcript` and `summary` fields
- Not support filtering by `timestamp` or phone number fields (`from`, `to`)
- Not understand that contacts have multiple phone numbers (mobile, work, other, company)
- Not fall back to the account's company phone when no direct contact number matched

## Solution
Enhanced the `search_transcripts` tool with **intelligent multi-phone search**:

### 1. New Parameters
- `phone_number`: Explicitly filter by a specific phone number (usually not needed)
- `contact_id`: **Automatically searches ALL contact phone numbers** (mobile, workPhone, phone, otherPhone, companyPhone) AND the associated account's company phone
- `account_id`: **Automatically searches the account's company phone**
- `date`: Filter by specific date (YYYY-MM-DD format)
- `date_from`: Filter calls from this date onwards
- `date_to`: Filter calls up to this date
- Made `query` optional when using date/phone/contact/account filters

### 2. Intelligent Phone Search Strategy

When you provide a `contact_id`, the tool now:
1. **Fetches ALL contact phone numbers:**
   - `mobile` (primary direct line)
   - `workPhone` (work direct line)
   - `phone` (general phone)
   - `otherPhone` (alternative number)
   - `companyPhone` (company main line)

2. **Fetches the associated account's company phone** as a fallback

3. **Searches for calls matching ANY of these numbers** in the `from` or `to` fields

4. **Normalizes phone numbers** to last 10 digits to handle different formats (+1, parentheses, dashes, etc.)

### 3. Search Priority Logic
```javascript
// Priority 1: If contact_id provided
→ Get all contact phone numbers (mobile, work, other, company)
→ Get associated account company phone
→ Search calls matching ANY of these numbers

// Priority 2: If account_id provided
→ Get account company phone
→ Search calls matching this number

// Priority 3: If phone_number explicitly provided
→ Search that specific number

// Then apply date filters and text query
```

### 4. Example Flow

**User asks:** "Did Francisco mention his email in the call from April 21st?"

**AI workflow:**
1. Searches contacts for "Francisco" → finds contact with ID `abc123`
2. Calls `search_transcripts({ contact_id: "abc123", date: "2026-04-21", query: "email" })`
3. Tool fetches:
   - Contact's mobile: `+1-555-0100`
   - Contact's workPhone: `+1-555-0101`
   - Contact's companyPhone: `+1-325-227-6746`
   - Account's phone: `+1-325-227-6746`
4. Searches for calls on 2026-04-21 where `from` or `to` matches ANY of these numbers
5. Filters results for mentions of "email"
6. Returns the matching call transcript

## Database Schema Reference

### Contacts Table Phone Fields:
- `phone`: General phone number
- `mobile`: Mobile/cell phone
- `workPhone`: Work direct line
- `otherPhone`: Alternative number
- `companyPhone`: Company main line
- `primaryPhoneField`: Indicates which field is primary (default: 'mobile')

### Accounts Table Phone Fields:
- `phone`: Company main phone number

### Calls Table:
- `from`: Caller phone number
- `to`: Recipient phone number
- `timestamp`: Call date/time (timestamptz)
- `transcript`: Full call transcript text
- `accountId`: Linked account
- `contactId`: Linked contact

## Example Usage

### Before (Failed)
```
User: "Did Francisco mention his email in the call from April 21st?"
AI: "I cannot access call transcripts directly by date. Please provide a keyword."
```

### After (Works - Intelligent Search)
```
User: "Did Francisco mention his email in the call from April 21st?"

AI Process:
1. list_contacts({ search: "Francisco" }) 
   → Returns contact_id: "507da33f-6407-487c-9d18-ad05495bdcf1"

2. search_transcripts({ 
     contact_id: "507da33f-6407-487c-9d18-ad05495bdcf1",
     date: "2026-04-21",
     query: "email"
   })
   
   Tool automatically searches:
   - Contact mobile: +1-555-0100
   - Contact work: +1-555-0101  
   - Contact company: +1-325-227-6746
   - Account company: +1-325-227-6746
   
   → Finds call to +1-325-227-6746 on April 21st
   → Filters for "email" mentions
   → Returns transcript

3. AI reads transcript and answers: "Yes, Francisco provided his email 
   address during the call. He said to send proposals to..."
```

### With Account Search
```
User: "What did we discuss in the call to Icon Cinema last week?"

AI Process:
1. list_accounts({ search: "Icon Cinema" })
   → Returns account_id: "507da33f-6407-487c-9d18-ad05495bdcf1"
   → Account phone: +1-325-227-6746

2. search_transcripts({
     account_id: "507da33f-6407-487c-9d18-ad05495bdcf1",
     date_from: "2026-04-14",
     date_to: "2026-04-21"
   })
   
   Tool searches: +1-325-227-6746
   → Returns all calls to/from that number in date range
```

## Why This Matters

### Real-World Scenario:
- User calls a company's main line: `+1-325-227-6746`
- Contact (Francisco) answers from that line
- Call is logged with `to: +1-325-227-6746`
- Contact's mobile is `+1-555-0100` (different number)

**Without intelligent search:** 
- Searching by contact_id would miss the call (different number)
- User would have to manually find the company phone

**With intelligent search:**
- Tool automatically checks contact's mobile, work, AND company phone
- Tool also checks the account's company phone as fallback
- Finds the call even though it was to the company line, not the contact's mobile

## Testing

### Test Case 1: Contact with Multiple Numbers
```sql
-- Setup: Contact with mobile and company phone
SELECT 
  c.id, c.firstName, c.lastName,
  c.mobile, c.workPhone, c.companyPhone,
  a.phone as account_phone
FROM contacts c
LEFT JOIN accounts a ON c."accountId" = a.id
WHERE c.id = '507da33f-6407-487c-9d18-ad05495bdcf1';

-- Expected: Tool should search ALL these numbers
```

### Test Case 2: Call to Company Phone
```sql
-- Find call to company main line
SELECT * FROM calls 
WHERE "to" = '+13252276746'
AND DATE(timestamp) = '2026-04-21';

-- Expected: Should be found when searching by contact_id
```

### Test Case 3: Ask Gemini
```
"Did Francisco mention his email in the call from April 21st?"
```
Expected: Finds the call and extracts email information

## Files Modified
- `crm-platform/src/pages/api/gemini/chat.js`
  - Updated `search_transcripts` tool definition (added intelligent phone search description)
  - Enhanced `search_transcripts` handler (added multi-phone lookup and fallback logic)

## Impact
- ✅ Searches across ALL contact phone numbers automatically
- ✅ Falls back to account company phone when needed
- ✅ Users can ask about calls by date without knowing which number was used
- ✅ More natural conversation flow
- ✅ Handles real-world scenarios where calls go through company main lines
- ✅ No need to manually specify phone numbers
