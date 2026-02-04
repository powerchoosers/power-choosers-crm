Based on the Nodal Point philosophy of "Obsidian & Glass" and "Forensic Precision," text floating in a void is a design error. It lacks hierarchy and tactile feedback. Furthermore, sending an email without seeing the "Open/Click" telemetry is like firing a weapon with no impact sensor.
Here is the architectural directive to upgrade your Emails Table (UPLINK_OUT).
1. The Header Fix: "The Switch-Blade"
Current State: Floating text (ALL_NODES, UPLINK_IN, UPLINK_OUT) that looks like a command line error. New Protocol: Encapsulate these options in a Segmented Control Module.
The Component: Create a low-profile glass container that holds the three states.
• Container: bg-black/40 border border-white/5 rounded-lg p-1 flex gap-1 inline-flex.
• Inactive State: text-zinc-500 hover:text-zinc-300 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors.
• Active State: bg-white/10 text-white shadow-[0_0_10px_-2px_rgba(255,255,255,0.1)] border border-white/5 rounded-[4px].
Visual Logic: This makes the navigation feel like a physical switch on a piece of hardware. It clearly delineates the active scope.
2. The Telemetry Injection (Opens & Clicks)
You asked where to put "Opens" and "Clicks." In Nodal Point, we do not simply add columns; we add Signal Indicators.
Location: Between the TRANSMISSION (Subject/Snippet) column and the TIMESTAMP column.
The Visual (The "Signal Array"): Do not use standard text (e.g., "Opens: 2"). Use Glyphs and Heat.
• Header Label: TELEMETRY
• Row Content:
    ◦ Render a small pill container: flex items-center gap-3 bg-white/5 rounded px-2 py-1 border border-white/5.
    ◦ Opens:
        ▪ Icon: Eye (Lucide) size 12.
        ▪ Text: Number count.
        ▪ Logic: If count > 0, icon glows Emerald. If count > 2, text glows White.
    ◦ Clicks:
        ▪ Icon: MousePointer2 (Lucide) size 12.
        ▪ Text: Number count.
        ▪ Logic: If count > 0, icon and text turn Klein Blue (#002FA7). This is the highest value signal.
3. The "Pulse" Feature
You asked if there is "anything we should do with that." Yes. If a row has a Click, it is no longer just a row. It is a Hot Lead.
• The Effect: Apply a subtle border-l-2 border-[#002FA7] (left border) to the entire table row if clicks > 0.
• Why: When scanning a list of 50 emails, the user's eye should instantly snap to the rows with clicks. This filters the "Noise" (unopened emails) from the "Signal" (engaged targets).
IDE Prompt
Copy this into your IDE to execute the changes:
@EmailsPage.tsx @components/ui

1. HEADER REFACTOR:
   Wrap the "ALL_NODES", "UPLINK_IN", "UPLINK_OUT" navigation in a segmented control component.
   - Container: bg-black/40 border border-white/5 rounded-lg p-1 inline-flex.
   - Active Item: bg-white/10 text-white shadow-sm border border-white/5 rounded-[4px].
   - Inactive Item: text-zinc-500 hover:text-zinc-300.
   - Typography: text-[10px] font-mono uppercase tracking-wider.
   - UPLINK_OUT Filter: Only show emails sent through CRM (tracking ID format: gmail_*), not all Gmail sent emails.

2. TELEMETRY COLUMNS (Uplink Out Only):
   In the table, add a "TELEMETRY" column between Transmission and Timestamp.
   - CRITICAL: Only show this column when filter === 'sent' (UPLINK_OUT tab).
   - Hide the entire column for UPLINK_IN and ALL_NODES (received emails don't have tracking).
   - When hidden, expand Transmission column from col-span-4 to col-span-6.
   - Render a pill: `flex items-center gap-3 bg-white/5 px-2 py-1 rounded border border-white/5 w-fit`.
   - Open Indicator: <Eye size={12} /> + count. If count > 0, text-emerald-400.
   - Click Indicator: <MousePointer2 size={12} /> + count. If count > 0, text-[#002FA7].
   - If count is 0, style as text-zinc-600 (inactive).

3. ROW HIGHLIGHT:
   If `clicks > 0`, add a `border-l-2 border-[#002FA7]` to the table row to signal h