# Foundry Template Integration in ComposeModal

## Overview
This integration allows users to select and use Foundry email templates directly in the email compose modal. When a template is selected, the system:
1. Fetches the template from the database
2. Auto-generates any dynamic content using AI
3. Substitutes contact variables
4. Displays the rendered HTML preview
5. Suppresses the default signature (since templates have their own)

## Files Modified

### 1. `crm-platform/src/components/emails/ComposeModal.tsx`
**Changes:**
- Added imports: `useEffect`, `Zap` icon, foundry utilities (`generateStaticHtml`, `substituteVariables`, `contactToVariableMap`), `useQuery`
- Added state: `selectedFoundryId`, `isLoadingTemplate`
- Added `useQuery` hook to fetch available foundry templates from `/api/foundry/list`
- Added `useEffect` to load and compile template when selected:
  - Fetches template by ID
  - Generates HTML from blocks using `generateStaticHtml`
  - Builds variable map from contact context
  - Substitutes variables in HTML
  - Auto-generates AI blocks if configured
  - Sets content to compiled HTML
- Updated signature logic:
  - `shouldShowSignature = !selectedFoundryId` - suppresses signature when template is active
  - Updated `signatureHtml` and `outgoingSignatureHtml` to respect `shouldShowSignature`
- Updated `handleSend`:
  - When using foundry template, `fullHtml` is just `content` (already complete HTML with no signature)
- Updated UI:
  - Added Foundry template selector in footer with Zap icon
  - Added visual indicator badge showing active template name with close button
  - Conditional rendering: HTML preview for templates, textarea for regular emails
  - Hide "Send as plain text" checkbox when using template

### 2. `api/foundry/list.js` (NEW)
**Purpose:** Endpoint to fetch all available foundry templates
**Functionality:**
- GET endpoint at `/api/foundry/list`
- Requires Firebase authentication
- Returns list of all transmission_assets with `id`, `name`, `type`, `updated_at`
- Ordered by `updated_at` descending (most recent first)

## User Flow

1. **Open Compose Modal** - User opens email compose from contact dossier or elsewhere with context
2. **Select Template** - User clicks "Foundry Template" dropdown in footer
3. **Auto-Load** - Template is fetched, variables are substituted, AI blocks are generated
4. **Visual Indicator** - Badge shows active template name
5. **Preview** - HTML preview renders in the content area (read-only)
6. **Send** - Email sends with compiled HTML, no signature appended

## Key Features

### Variable Substitution
When a template is loaded, contact context is mapped to variables:
- `{{contact.firstName}}` → from `context.contactName`
- `{{contact.companyName}}` → from `context.companyName` or `context.accountName`
- `{{contact.industry}}` → from `context.industry`
- All foundry variables are supported via `contactToVariableMap()`

### AI Block Auto-Generation
If a template block has:
- `type: 'TEXT_MODULE'`
- `useAi: true`
- `aiPrompt` set
- No `text` content

The system automatically calls `/api/foundry/generate-text` to generate content using the prompt and contact context.

### Signature Suppression
- When `selectedFoundryId` is set, `shouldShowSignature = false`
- Both preview signature (in modal) and outgoing signature (in email) are suppressed
- Templates handle their own signature/footer via `generateStaticHtml` (with `skipFooter: true` in this integration)

## API Endpoints Used

1. **GET `/api/foundry/list`** - Fetch all templates (NEW)
2. **GET `/api/foundry/assets?id={id}`** - Fetch single template
3. **POST `/api/foundry/generate-text`** - Generate AI content for blocks

## Technical Notes

### Security
- All endpoints require Firebase authentication
- Uses `supabaseAdmin` to bypass RLS (necessary for fetching templates)

### Performance
- Templates are fetched only when selected (lazy loading)
- AI generation runs sequentially for multiple blocks (could be parallelized in future)
- Uses React Query for caching template list

### Error Handling
- Failed template load clears selection and shows toast error
- Failed AI generation shows placeholder text `[ AI_GENERATION_IN_PROGRESS ]`
- Missing `/api/foundry/list` endpoint fails silently (returns empty array)

## Future Enhancements

1. **Edit Template from Compose** - Button to open template in Foundry Builder
2. **Template Categories** - Filter templates by type in dropdown
3. **Template Search** - Search/filter templates by name
4. **Preview Before Load** - Hover preview of template
5. **Recent Templates** - Quick access to recently used templates
6. **Template Variables Panel** - Show which variables will be substituted
7. **Parallel AI Generation** - Generate all AI blocks simultaneously
8. **Template Versioning** - Support for template versions/revisions
9. **Custom Signatures per Template** - Allow templates to specify signature behavior
10. **Template Analytics** - Track which templates are used most often

## Testing Checklist

- [ ] Template selector appears in footer
- [ ] Templates load and populate from `/api/foundry/list`
- [ ] Selecting a template loads and compiles HTML
- [ ] Contact variables are substituted correctly
- [ ] AI blocks auto-generate when configured
- [ ] Template indicator badge shows with correct name
- [ ] HTML preview renders correctly
- [ ] Signature is hidden in preview
- [ ] Signature is not included in sent email
- [ ] "Send as plain text" checkbox hidden when using template
- [ ] Close button on badge clears template selection
- [ ] Email sends successfully with compiled template HTML
- [ ] Works with and without contact context
- [ ] Error handling works for failed template loads
