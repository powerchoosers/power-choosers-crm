# Test Scenario: Multi-Phone Search

## Scenario: Finding Francisco's Call from April 21st

### Setup
**Contact: Francisco**
- ID: `507da33f-6407-487c-9d18-ad05495bdcf1`
- Mobile: `+1-555-0100` (not used for this call)
- Work Phone: `+1-555-0101` (not used for this call)
- Company Phone: `+1-325-227-6746` ✓ (used for this call)

**Account: Icon Cinema**
- ID: `507da33f-6407-487c-9d18-ad05495bdcf1`
- Company Phone: `+1-325-227-6746` ✓ (matches!)

**Call Record:**
- ID: `CAe60248576ce5a7ce1c634bde510b4bb1`
- From: `+18175182151` (your number)
- To: `+13252276746` (Icon Cinema company phone)
- Date: `2026-04-21 16:17:52`
- Transcript: Contains conversation with Francisco about email addresses

### User Query
```
"Did Francisco mention his email in the call from April 21st?"
```

### AI Workflow

#### Step 1: Find Contact
```javascript
list_contacts({ search: "Francisco" })
```
**Returns:**
```json
{
  "id": "507da33f-6407-487c-9d18-ad05495bdcf1",
  "firstName": "Francisco",
  "accountId": "507da33f-6407-487c-9d18-ad05495bdcf1"
}
```

#### Step 2: Search Transcripts with Intelligent Phone Lookup
```javascript
search_transcripts({
  contact_id: "507da33f-6407-487c-9d18-ad05495bdcf1",
  date: "2026-04-21",
  query: "email"
})
```

#### Step 3: Tool Execution (Behind the Scenes)

**3a. Fetch Contact Phone Numbers:**
```sql
SELECT phone, mobile, workPhone, otherPhone, companyPhone, accountId
FROM contacts
WHERE id = '507da33f-6407-487c-9d18-ad05495bdcf1';
```
**Result:**
- mobile: `+1-555-0100`
- workPhone: `+1-555-0101`
- companyPhone: `+1-325-227-6746`
- accountId: `507da33f-6407-487c-9d18-ad05495bdcf1`

**3b. Fetch Account Phone Number:**
```sql
SELECT phone
FROM accounts
WHERE id = '507da33f-6407-487c-9d18-ad05495bdcf1';
```
**Result:**
- phone: `+1-325-227-6746`

**3c. Normalize Phone Numbers:**
```javascript
phoneNumbersToSearch = [
  "+1-555-0100",
  "+1-555-0101", 
  "+1-325-227-6746",
  "+1-325-227-6746"  // duplicate from account
]

normalizedPhones = [
  "5550100",
  "5550101",
  "3252276746"  // deduplicated
]
```

**3d. Search Calls:**
```sql
SELECT *, accounts(name, phone), contacts(...)
FROM calls
WHERE timestamp >= '2026-04-21T00:00:00Z'
  AND timestamp < '2026-04-21T23:59:59Z'
  AND (
    "from" ILIKE '%5550100%' OR "to" ILIKE '%5550100%' OR
    "from" ILIKE '%5550101%' OR "to" ILIKE '%5550101%' OR
    "from" ILIKE '%3252276746%' OR "to" ILIKE '%3252276746%'
  )
ORDER BY timestamp DESC
LIMIT 30;
```

**3e. Filter by Text Query:**
```javascript
// Filter results where transcript or summary contains "email"
results.filter(call => 
  call.transcript.toLowerCase().includes("email") ||
  call.summary?.toLowerCase().includes("email")
)
```

#### Step 4: Result
**Found Call:**
```json
{
  "id": "CAe60248576ce5a7ce1c634bde510b4bb1",
  "from": "+18175182151",
  "to": "+13252276746",
  "timestamp": "2026-04-21 16:17:52",
  "transcript": "...Francisco provided email: L dot Patterson at NodalPoint dot I O...",
  "account": {
    "name": "Icon Cinema",
    "phone": "+1-325-227-6746"
  }
}
```

#### Step 5: AI Response
```
Yes, Francisco mentioned his email during the call on April 21st. 
He provided the email address: L.Patterson@NodalPoint.io
```

## Why This Works

### The Key Insight
The call was made to **Icon Cinema's company phone** (`+1-325-227-6746`), not Francisco's mobile or work phone. 

**Without intelligent search:**
- Searching by contact_id would only check Francisco's mobile/work numbers
- Would miss the call because it went to the company line
- User would get "no results found"

**With intelligent search:**
- Tool automatically checks ALL of Francisco's numbers
- Tool ALSO checks the associated account's company phone
- Finds the call even though it was to the company line
- User gets the answer they need

## Edge Cases Handled

### Case 1: Contact Has No Direct Numbers
```javascript
Contact: {
  mobile: null,
  workPhone: null,
  companyPhone: "+1-325-227-6746"
}
```
✅ Still finds calls via companyPhone

### Case 2: Multiple Contacts at Same Company
```javascript
Contact A (Francisco): mobile: "+1-555-0100"
Contact B (Margaret): mobile: "+1-555-0200"
Account (Icon Cinema): phone: "+1-325-227-6746"
```
✅ Searching for Francisco includes company phone, finds calls where Margaret answered

### Case 3: Contact Changed Numbers
```javascript
Contact: {
  mobile: "+1-555-0100",  // old number
  otherPhone: "+1-555-0999"  // new number
}
```
✅ Searches BOTH numbers, finds calls from either period

### Case 4: Duplicate Phone Numbers
```javascript
Contact: {
  mobile: "+1-325-227-6746",
  companyPhone: "+1-325-227-6746"
}
Account: {
  phone: "+1-325-227-6746"
}
```
✅ Deduplicates to single search, no duplicate results

## Performance Considerations

### Optimization 1: Limit Multiplier
```javascript
.limit(limit * 3)  // Get 30 results instead of 10
```
- Fetches extra results before text filtering
- Ensures we have enough after filtering
- Then slices to requested limit

### Optimization 2: Phone Number Deduplication
```javascript
const normalizedPhones = [...new Set(
  phoneNumbersToSearch
    .filter(p => p)
    .map(p => normalizePhoneDigits(p).slice(-10))
    .filter(p => p.length === 10)
)];
```
- Removes duplicates
- Normalizes formats
- Reduces query complexity

### Optimization 3: Conditional Account Filtering
```javascript
if (account_id && normalizedPhones.length === 0) {
  query_builder = query_builder.eq('accountId', account_id);
}
```
- Only filters by accountId if no phone numbers found
- Phone search is more specific and accurate
- Avoids over-constraining the query
