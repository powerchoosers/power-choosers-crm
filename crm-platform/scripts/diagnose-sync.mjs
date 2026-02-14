
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Minimal Service Copy for Debugging
class DiagnosticService {
    constructor() {
        this.baseUrl = 'https://mail.zoho.com/api/v1';
    }

    async getCredentials(email) {
        const { data } = await supabaseAdmin.from('users').select('*').eq('email', email).single();
        return data;
    }

    async listFolders(accessToken, accountId) {
        const url = `${this.baseUrl}/accounts/${accountId}/folders`;
        const response = await fetch(url, { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } });
        const result = await response.json();
        return result.data || [];
    }

    async run() {
        const email = 'l.patterson@nodalpoint.io';
        const user = await this.getCredentials(email);

        console.log('--- Diagnostics for', email, '---');
        console.log('Account ID:', user.zoho_account_id);

        const folders = await this.listFolders(user.zoho_access_token, user.zoho_account_id);
        console.log('Total Folders Found:', folders.length);

        const inbox = folders.find(f => f.path === '/' || f.path === '/Inbox' || f.name.toLowerCase() === 'inbox');
        if (!inbox) {
            console.error('CRITICAL: Inbox folder not found in folder list!');
            console.log('Available folders:', folders.map(f => `${f.name} (id: ${f.folderId}, path: ${f.path})`).join(', '));
            return;
        }

        console.log('Resolved Inbox ID:', inbox.folderId);

        const url = `${this.baseUrl}/accounts/${user.zoho_account_id}/messages/view?folderId=${inbox.folderId}&limit=20`;
        console.log('Fetching:', url);

        const response = await fetch(url, { headers: { 'Authorization': `Zoho-oauthtoken ${user.zoho_access_token}` } });
        const result = await response.json();

        console.log('API Status:', response.status);
        console.log('API Data Count:', result.data?.length || 0);

        if (result.data && result.data.length > 0) {
            console.log('\nSample Message (First 1):');
            const msg = result.data[0];
            console.log(`- ID: ${msg.messageId}`);
            console.log(`- Subject: ${msg.subject}`);
            console.log(`- Sender: ${msg.sender}`);
            console.log(`- Received: ${msg.receivedTime}`);
        } else {
            console.log('\nNo messages in the resolved Inbox folder.');
        }

        // Check for duplicates in DB for the first found message if any
        if (result.data?.[0]) {
            const { data: existing } = await supabaseAdmin
                .from('emails')
                .select('id, subject')
                .eq('messageId', result.data[0].messageId)
                .maybeSingle();
            console.log('\nDuplicate Check for first message:', existing ? `FOUND (id: ${existing.id})` : 'NOT FOUND');
        }
    }
}

new DiagnosticService().run().catch(console.error);
