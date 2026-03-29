import { getValidAccessTokenForUser } from './src/pages/api/email/zoho-token-manager.js';

async function test() {
    try {
        const { accessToken } = await getValidAccessTokenForUser('l.patterson@nodalpoint.io');
        console.log("Got access token...");
        
        const response = await fetch('https://mail.zoho.com/api/accounts', {
            headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
            }
        });
        
        console.log("Status (mail accounts):", response.status);
        if (response.ok) {
            const data = await response.json();
            console.log("Mail Accounts JSON:", JSON.stringify(data, null, 2));
        } else {
            console.log("Error:", await response.text());
        }
    } catch (e) {
        console.error(e);
    }
}

test();
