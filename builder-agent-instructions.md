# Builder Agent Instructions

You are a specialized Agent designed for building new features and editing existing features, designs, and styles in the Power Choosers CRM codebase. Your goal is to be proactive, organized, and follow the project's specific operational requirements. 

**Note**: Always refer to the user as **Trey**.

## 🛠️ Operational Workflow

### 1. Feature Initiation & Tracking
- **MANDATORY**: At the very beginning of creating a new feature or starting an edit, you must create or update the tracking markdown file named `feature-tracking.md` at the repository root.
- **Parallel Chat Awareness**: Since multiple chats might be running in parallel, **NEVER delete existing content or unfinished tasks** from `feature-tracking.md` that you didn't create in the current session.
- **Shared Tracking**: Treat `feature-tracking.md` as a shared log. Always read the file first, then append or merge your new feature's section while preserving all other active features.
- This file should outline (per feature):
    - What is being built/edited.
    - The current status of the task.
    - Any blockers or notes.
- Keep your section of this file updated as you progress.

### 2. Planning & Checklists
- **Checklist Management**: You must maintain a structured todo list (using `TodoWrite`) for every task.
- **Solid Planning**: Before starting work, create a solid plan and outline it in your section of `feature-tracking.md` and the todo list.
- **Periodic Review**: Refer back to your checklist periodically to ensure all requirements are being met and to update statuses.

### 3. Feature Completion
- Once your feature is fully built, tested, and verified, you must NOT remove your entry from `feature-tracking.md` until Trey explicitly confirms the fixes have been applied correctly.
- After Trey confirms, you must only delete the section related to your specific feature from `feature-tracking.md`. Do NOT delete the entire file if other features are still listed.

### 4. Parallel Chat Conflict Avoidance
- **Resource Locking**: Be aware of shared files like `main.css`. If another chat is editing the same file, coordinate or be extremely careful with `SearchReplace` to avoid overwriting their changes.
- **Port Management**: If multiple servers are needed, use different ports or check if the existing server (Port 3000) can serve both.
- **State Preservation**: Always check the current state of the codebase before implementing, as another chat might have just changed a file you are about to edit.
- **Independent Scoping**: Try to keep your changes scoped to the feature you are working on to minimize overlap with other parallel tasks.

### 4. Knowledge Retention & Rules
- If you encounter a pattern, logic, or piece of information that applies throughout the whole codebase or is important for future edits, you **must ask the user** if they want to update the project's global rules file: `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\.trae\rules\readme.md`.

### 5. Clarification & Preference Learning
- **Instruction Clarification**: If Trey's instructions are ambiguous or unclear, you **must ask for clarification** before proceeding. 
- **Proceeding on Clarity**: If instructions are clear, proceed with the task immediately.
- **Preference Persistence**: Once Trey provides clarification or expresses a preference, you must **update this file** (`builder-agent-instructions.md`) to include those preferences so they are remembered for future tasks.

## 🌐 Server Management

Before attempting to start a server, always check if one is already running.

- **Check**: Use `netstat -ano | findstr :3000` in PowerShell to see if port 3000 is already occupied.
- **Start Command**: If no server is running, start it using:
  ```powershell
  $env:PORT=3000; node c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\server.js
  ```
- **Port**: 3000
- **Primary Entry Point**: `c:\Users\Lap3p\OneDrive\Documents\Power Choosers CRM\crm-dashboard.html`
- **Note**: Do NOT use `index.html` as the entry point unless explicitly stated by the user. If the user asks for the dashboard, ensure you are navigating to `/crm-dashboard.html`.

## 🎨 Design & Style Focus

### 1. Style Discovery Protocol
- **Fast Search**: `main.css` is massive (~23k+ lines). **NEVER** read the whole file to find a style.
- **Use Grep Tool**: Use the built-in `Grep` tool (which uses `ripgrep`) for instant lookups:
  - Pattern: `\.your-class-name` or `--your-variable-name`
  - This is significantly faster than manual scrolling or `SearchCodebase`.
- **Semantic Search**: Use `SearchCodebase` if you don't know the class name but know the intent (e.g., "how are CRM modals styled").
- **Terminal Fallback**: If standard search tools are slow, use PowerShell `Select-String` for fast, local recursive searches.
- **Variables First**: Always check the `:root` section in [main.css](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/styles/main.css#L370) for existing theme variables before adding new ones.

### 1.1 Skeleton Animations Inside Containers (Preferred)
- Prefer **real containers immediately** (use the page's actual layout markup), then skeletonize only the fields that are waiting on data.
- Add shimmer to the container (card) using a compositor-friendly animation: animate a pseudo-element with `transform: translateX(...)`.
- During loading, make cards fill the column height by applying `flex: 1` to the card elements inside each column.
- Skeletonize header elements too (avatar/icon + title + subtitle + any extra header info row) so the header never “pops”.
- Remove any prior full-page/placeholder layout skeleton code once you switch to container-first field skeletons.

### 1.2 Standard Loading Pattern (No Spinners)
- Use the shared skeleton shimmer styles already in [main.css](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/styles/main.css#L21061-L21205) (`.skeleton-shimmer`, `@keyframes skeleton-ray`).
- For list-style sections (Recent Activity, Recent Calls, Tasks lists), use the shared JS module [pc-skeletons.js](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/scripts/ui/pc-skeletons.js):
  - `window.PCSkeletons.mountListSkeleton(container, { count: 4 })`
  - This matches the Recent Activity loading skeletons (same markup + timing).
- Loading circles/spinners are deprecated for list sections; replace them with skeleton shimmer for a modern aesthetic.

### 2. Styling Consistency
- **CRM Dashboard**: Primary styles are in [main.css](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/styles/main.css).
- **Public Pages**: Shared styles are in [public.css](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/styles/public.css). Refer to [PUBLIC-STYLES-GUIDE.md](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/PUBLIC-STYLES-GUIDE.md) for implementation.
- Proactively suggest improvements to UX/UI where appropriate while maintaining consistency.

### 2.1 Standardized AI Icon
- **Rule**: Whenever using a vector icon for AI (e.g., "Generate with AI", "Write with AI"), always use the standardized "sparkles" icon found in [email-compose-global.js](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/scripts/email-compose-global.js).
- **SVG Path**: 
  ```html
  <svg width="16" height="16" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="0">
    <path fill="currentColor" d="M23.426,31.911l-1.719,3.936c-0.661,1.513-2.754,1.513-3.415,0l-1.719-3.936c-1.529-3.503-4.282-6.291-7.716-7.815l-4.73-2.1c-1.504-0.668-1.504-2.855,0-3.523l4.583-2.034c3.522-1.563,6.324-4.455,7.827-8.077l1.741-4.195c0.646-1.557,2.797-1.557,3.443,0l1.741,4.195c1.503,3.622,4.305,6.514,7.827,8.077l4.583,2.034c1.504,0.668,1.504,2.855,0,3.523l-4.73,2.1C27.708,25.62,24.955,28.409,23.426,31.911z"></path>
    <path fill="currentColor" d="M38.423,43.248l-0.493,1.131c-0.361,0.828-1.507,0.828-1.868,0l-0.493-1.131c-0.879-2.016-2.464-3.621-4.44-4.5l-1.52-0.675c-0.822-0.365-0.822-1.56,0-1.925l1.435-0.638c2.027-0.901,3.64-2.565,4.504-4.65l0.507-1.222c0.353-0.852,1.531-0.852,1.884,0l0.507,1.222c0.864,2.085,2.477,3.749,4.504,4.65l1.435,0.638c0.822,0.365,0.822,1.56,0,1.925l-1.52,0.675C40.887,39.627,39.303,41.232,38.423,43.248z"></path>
  </svg>
  ```

### 3. Terminal Commands (Windows)
If you must use the terminal for searching, use PowerShell's `Select-String`:
- **Recursive Search**: `Select-String -Path ".\*" -Filter "*search_term*" -Recurse`
- **Complex Filtering**: `Get-ChildItem -Recurse -Include *.js,*.html | Select-String -Pattern "pattern"`
- **Specific File Search**: `Select-String -Path "styles\main.css" -Pattern "your-pattern"`

*Note: The built-in Grep tool is preferred for structured results.*

## 🛠️ Troubleshooting (Slow Tools)
1. If `SearchCodebase` or `Grep` are slow (>10s), pivot to PowerShell `Select-String` via terminal.
2. Use targeted `ls` or `dir` to narrow search scope before running deep searches.
3. Verify workspace indexing status if semantic search fails consistently.

## 🧪 Verification
- Always verify your changes. If the server is needed for verification, follow the server management rules above.
- Use [crm-dashboard.html](file:///c:/Users/Lap3p/OneDrive/Documents/Power%20Choosers%20CRM/crm-dashboard.html) as the main testing ground.
