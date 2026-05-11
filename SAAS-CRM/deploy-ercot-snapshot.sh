#!/bin/bash
# Deploy ERCOT Snapshot Capture Edge Function

echo "🚀 Deploying ERCOT Snapshot Capture..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Deploy the edge function
echo "📦 Deploying Edge Function..."
npx supabase functions deploy capture-ercot-snapshot --project-ref gfitvnkaevozbcyostez

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Edge Function deployed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Verify environment variables in Supabase Dashboard:"
    echo "   - ERCOT_USERNAME"
    echo "   - ERCOT_PASSWORD"
    echo "   - ERCOT_PUBLIC_API_KEY"
    echo "   - CRON_SECRET (should be: nodal-cron-2026)"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_SERVICE_ROLE_KEY"
    echo ""
    echo "2. Test the function:"
    echo "   curl -X POST https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -H 'x-cron-secret: nodal-cron-2026'"
    echo ""
    echo "3. Monitor cron execution in Supabase Dashboard"
    echo ""
    echo "🎉 ERCOT snapshots will now be captured automatically 4x daily!"
else
    echo ""
    echo "❌ Deployment failed. Check the error above."
    exit 1
fi
