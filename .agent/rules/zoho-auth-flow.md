# Zoho-to-Supabase Authentication Flow

This document outlines the specialized "Bridge" authentication flow implemented for Nodal Point CRM, enabling Zoho as the primary identity provider while using Supabase for session management.

## Architectural Overview

Since Zoho is not a native Supabase OAuth provider, we use a custom bridge:
1.  **Initiation**: User hits `/api/auth/zoho/login`, which redirects to Zoho OAuth.
2.  **Callback**: Zoho redirects back to `/api/auth/callback/zoho` with an authorization code.
3.  **Exchange**: The backend exchanges the code for a Zoho Access Token and ID Token.
4.  **Identity Resolution**: The user's email is extracted from the ID Token. We resolve the user in the Supabase `public.users` table and then the `auth.users` system.
5.  **Session Generation**: We generate a **Supabase Magic Link** using the Admin API (`auth.admin.generateLink`) with a dedicated `redirectTo` target.
6.  **Hand-off**: The browser is served a themed transition page that automatically redirects to the Supabase action link.
7.  **Verification**: Supabase verifies the magic link, creates the session, and redirects the user to the final dashboard (`/network`).

## Secondary Connection Flow (Settings)

This flow is used to connect additional Zoho email accounts after the user is already logged in.

1.  **Initiation**: User clicks "Connect Account" in `/network/settings`. Frontend calls `/api/auth/zoho/connect-secondary`.
2.  **Zoho Callback**: Zoho redirects to `/api/auth/callback/zoho-secondary` which redirects back to the UI at `/network/settings?action=zoho_callback&code=...`.
3.  **Finalize**: The UI captures the code and calls `/api/auth/zoho/finalize-connection` (POST) to perform the token exchange and save the connection.

## Configuration Requirements

### Supabase Dashboard
- **Site URL**: `https://www.nodalpoint.io/network`
- **Redirect URLs (Whitelist)**: 
  - `https://www.nodalpoint.io/**`
  - `http://localhost:3000/**`

### Zoho Developer Console
- **Authorized Redirect URIs**:
  - `https://www.nodalpoint.io/api/auth/callback/zoho`
  - `http://localhost:3000/api/auth/callback/zoho`
  - `https://www.nodalpoint.io/api/auth/callback/zoho-secondary`
  - `http://localhost:3000/api/auth/callback/zoho-secondary`

## Key Files
- `src/app/api/auth/zoho/login/route.ts`: Main Login initiation.
- `src/app/api/auth/callback/zoho/route.ts`: Main Callback handler.
- `src/pages/api/auth/zoho/connect-secondary.js`: Secondary connection initiation.
- `src/pages/api/auth/callback/zoho-secondary.js`: Secondary callback bridge.
- `src/pages/api/auth/zoho/finalize-connection.js`: Secondary token exchange handler.
- `src/context/AuthContext.tsx`: Frontend session detection.

## Security Notes
- **Admin API**: We use the Supabase Service Role Key on the backend to facilitate silent user resolution and link generation. This key must NEVER be exposed to the client.
- **CSRF**: The `state` parameter should be used in production for enhanced security (currently using a simplified flow for maximum reliability).
- **Cookies**: We set a manual `np_session` cookie for additional session tracking across the forensic deck.
