We need to refactor the file ingestion UX to eliminate the current "freeze and snap" behavior. The goal is a seamless "Obsidian & Glass" transition using Framer Motion.

CURRENT ISSUES:
1. Drag-and-drop is broken; I have to click to open the file explorer.
2. There is no visual feedback when dragging a file over the drop zone.
3. When a file is selected, the modal goes blank/freezes before the Calibration screen appears.

EXECUTION PROTOCOL:

1. ENABLE DRAG-AND-DROP:
   - Implement the `onDragOver`, `onDragLeave`, and `onDrop` event handlers on the upload container.
   - Prevent default browser behavior on these events to ensure the file doesn't open in the browser tab.

2. VISUAL FEEDBACK STATES:
   - Create a state `isDragging`. When true, change the border color to Klein Blue (#002FA7) and increase background opacity.
   - Create a state `isProcessing`. When true (immediately after file drop), replace the Upload Icon with a "Neural Scan" animation (a pulsing bar) and display text: 
   
  > PARSING_PAYLOAD...
  > READING STREAM...
  > PARSING CSV HEADERS...
  > DETECTING ENCODING...

3. SMOOTH TRANSITION:
   - Wrap the content steps (Vector Select, Upload, Calibration) in an <AnimatePresence mode="wait"> component.
   - Apply `initial={{ opacity: 0, x: 20 }}`, `animate={{ opacity: 1, x: 0 }}`, and `exit={{ opacity: 0, x: -20 }}` to each step's container.
   - This ensures the Upload screen slides out before the Calibration screen slides in, preventing the "blank" glitch.

4. LOGIC UPDATE:
   - Ensure the parsing logic (PapaParse or similar) runs inside the `isProcessing` state. Only set the step to 'CALIBRATION' once the headers are fully extracted.

Implement this now. Keep the styling consistent with the existing Nodal Point dark mode aesthetic.