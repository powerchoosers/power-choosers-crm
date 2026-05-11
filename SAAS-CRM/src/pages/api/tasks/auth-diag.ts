import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/supabase';
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const authData = await requireUser(req);
        const { email, id, user, isAdmin } = authData;

        // Fetch user from DB to verify consistency
        let dbUser = null;
        if (email) {
            const { data } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', email)
                .single();
            dbUser = data;
        }

        res.status(200).json({
            authenticated: !!email,
            auth: {
                email,
                id,
                isAdmin,
                hasUserObject: !!user
            },
            database: {
                found: !!dbUser,
                settings: dbUser?.settings ? 'Present' : 'Missing',
                firstName: dbUser?.first_name,
                lastName: dbUser?.last_name
            },
            headers: {
                hasAuth: !!req.headers.authorization,
                authType: req.headers.authorization?.split(' ')[0]
            },
            env: {
                hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
                hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
            }
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
