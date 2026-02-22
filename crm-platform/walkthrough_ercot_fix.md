# Fixed: ERCOT Telemetry Data & Global History

The ERCOT telemetry system was suffering from two main issues:
1.  **Stale/Identical Data**: Prices were not updating and were showing the same value for all zones due to incorrect API sorting and request patterns.
2.  **Disconnected Snapshot Trigger**: The Telemetry page was attempting to trigger a snapshot via an incorrect API route, leading to a gap in historical record keeping.

## Changes Implemented

### 1. Unified Price Fetching (`src/pages/api/market/ercot.js`)
- **Optimization**: Switched from 4 parallel requests (one per zone) to a single **Unified API Request** for all load zones (`settlementPointType=LZEW`).
- **Reliability**: This reduces overhead and the risk of rate-limiting or socket timeouts.
- **Accuracy**: Implemented local grouping and sorting to ensure we always extract the absolute latest price point for each zone (`LZ_HOUSTON`, `LZ_NORTH`, `LZ_SOUTH`, `LZ_WEST`).

### 2. Corrected Snapshot Routing (`src/app/network/telemetry/page.tsx`)
- **Fix**: Updated the `useEffect` hook to call `/api/market/ercot-snapshot` instead of the non-existent `/api/market/ercot/snapshot`.
- **Automatic Logging**: Visiting the Telemetry page now correctly triggers a background save to the database (throttled to 2x daily), ensuring the historical chart stays up to date.

### 3. Global Historical Data
- **Visibility**: Verified that the `market_telemetry` table uses a "permissive" RLS policy for read access. This ensures that **all agents** see the same real-time and historical data across the platform, rather than being restricted to their own individual records.
- **Verification**: Confirmed with a manual insert that fresh data is now flowing into the shared historical log, breaking the 11-day gap.

### 4. Robust API Logic
- Updated the `ercot-snapshot.js` handler with better logging and error checking to prevent silent failures during database insertion.

## Summary
The "Market Telemetry" page will now automatically show accurate, diverging prices for each zone and will accumulate data points in the history chart as agents use the system. This data is shared globally across the CRM as requested.
