# Analyze Document → Dossier Field Map (No-Refresh Verification)

This doc confirms that every field extracted by `api/analyze-document.js` is written to the DB, read by `useAccount`, and displayed on the account/contact dossier so sections populate **without refresh** after bill upload.

## 1. API extracts (Gemini) → DB writes

| AI field | DB write | Table.Column |
|----------|----------|----------------|
| `contract_end_date` | ✅ | `accounts.contract_end_date` (date) |
| `strike_price` | ✅ | `accounts.current_rate` (text) |
| `supplier` | ✅ | `accounts.electricity_supplier` (text) |
| `annual_usage` | ✅ | `accounts.annual_usage` (text) |
| `monthly_kwh` + `peak_demand_kw` + `billing_days` | ✅ | `accounts.load_factor` (numeric, calculated) |
| `type === 'SIGNED_CONTRACT'` | ✅ | `accounts.status` = `'CUSTOMER'` |
| `esids[]` (id, address, rate, end_date) | ✅ | `meters` table: `esid`, `service_address`, `rate`, `end_date`, `account_id` |

- **accounts** update: single `.update(updates).eq('id', accountId)`.
- **meters** insert: `.upsert(metersToInsert, { onConflict: 'esid' })` (requires `meters_esid_key` UNIQUE on `meters(esid)` — applied on remote).

## 2. useAccount reads

| Source | useAccount mapping | Account shape |
|--------|--------------------|---------------|
| `data.contract_end_date` | → `contractEnd` | ✅ |
| `data.current_rate` | → `currentRate` | ✅ |
| `data.electricity_supplier` | → `electricitySupplier` | ✅ |
| `data.annual_usage` | → `annualUsage` | ✅ |
| `data.load_factor` / `metadata.loadFactor` | → `loadFactor` | ✅ |
| `data.status` | → `status` | ✅ |
| **meters table** (`account_id` = id) | → `meters[]` (`esiId`, `address`, `rate`, `endDate`) | ✅ |

If the `meters` table has rows for the account, those are used; otherwise `metadata.meters` is used.

## 3. Dossier sections (account page)

| Section | Fields used | Populates without refresh? |
|---------|-------------|----------------------------|
| **Position Maturity** | `contractEnd` → expiration date, days remaining | ✅ |
| **Current Supplier** | `electricitySupplier` | ✅ |
| **Strike Price** | `currentRate` (editStrikePrice) | ✅ |
| **Load Factor** | `loadFactor` | ✅ |
| **Annual Volume** | `annualUsage` | ✅ |
| **Estimated Annual Revenue** | derived from `annualUsage` | ✅ |
| **Meter Array** | `meters` (ESIDs from meters table) | ✅ |
| **Data Locker (file list)** | `documents` by `account_id` (refetched after insert + after AI) | ✅ |
| **Status badge** | `status` (e.g. CUSTOMER, ACTIVE_LOAD) | ✅ |

All of the above are driven by the same account query (`['account', id, user?.email]`) and/or explicit document refetch, and are invalidated/refetched after ingestion.

## 4. No-refresh flow (DataIngestionCard)

1. User drops a bill → file upload → document row inserted.
2. **Immediately:** `fetchDocuments()` runs so the new file appears in the list.
3. Frontend calls `POST /api/analyze-document` → API updates **accounts** and **meters**.
4. On success:
   - `queryClient.invalidateQueries` + `refetchQueries` with predicate `['account', accountId]` → all account queries refetch (including `useAccount`).
   - `fetchDocuments()` runs again (backup for realtime).
   - `onIngestionComplete()` runs → blur-in and refraction on dossier.
5. React re-renders with new `account` and `meters` → all sections show updated data without page refresh.

## 5. Safety / robustness (API)

- **Missing analysis.data:** If Gemini returns no `data` object, the API responds 200 with `{ success: true, analysis }` and skips DB updates (no throw).
- **ESIDs:** Only entries with non-empty `m.id` are inserted; `esid`/address/rate/end_date are normalized to strings.
- **Meters upsert:** Requires `UNIQUE(esid)` on `meters`. This constraint has been applied on the linked remote DB so upsert works.

## 6. Quick test checklist

Before testing, ensure:

- [ ] Backend is running (e.g. `npm run dev:all` or Node server with `/api/analyze-document`).
- [ ] `meters` table has unique constraint on `esid` (already applied via MCP).
- [ ] On account dossier, open Data Locker and drop a bill PDF.

After upload + analysis:

- [ ] New file appears in Data Locker without refresh.
- [ ] Position Maturity (expiration, days remaining) updates.
- [ ] Current Supplier, Strike Price, Annual Volume, Load Factor (if present on bill) update.
- [ ] Meter Array shows ESID(s) from the bill without refresh.
- [ ] Status updates to Customer if document type was SIGNED_CONTRACT.
- [ ] No console errors; blur-in animations run on updated fields.

All data written by `analyze-document.js` is read by `useAccount` and displayed in the sections above; with invalidation and refetch, everything populates without refresh.
