# Deploy ERCOT Snapshot Capture Edge Function (PowerShell)

Write-Host "🚀 Deploying ERCOT Snapshot Capture..." -ForegroundColor Cyan
Write-Host ""

# Check if supabase CLI is available
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCmd) {
    Write-Host "❌ Supabase CLI not found. Install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Deploy the edge function
Write-Host "📦 Deploying Edge Function..." -ForegroundColor Yellow
npx supabase functions deploy capture-ercot-snapshot --project-ref gfitvnkaevozbcyostez

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Edge Function deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Next steps:" -ForegroundColor Cyan
    Write-Host "1. Verify environment variables in Supabase Dashboard:" -ForegroundColor White
    Write-Host "   - ERCOT_USERNAME" -ForegroundColor Gray
    Write-Host "   - ERCOT_PASSWORD" -ForegroundColor Gray
    Write-Host "   - ERCOT_PUBLIC_API_KEY" -ForegroundColor Gray
    Write-Host "   - CRON_SECRET (should be: nodal-cron-2026)" -ForegroundColor Gray
    Write-Host "   - SUPABASE_URL" -ForegroundColor Gray
    Write-Host "   - SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Test the function:" -ForegroundColor White
    Write-Host '   curl -X POST https://gfitvnkaevozbcyostez.supabase.co/functions/v1/capture-ercot-snapshot \' -ForegroundColor Gray
    Write-Host "     -H 'Content-Type: application/json' \" -ForegroundColor Gray
    Write-Host "     -H 'x-cron-secret: nodal-cron-2026'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Monitor cron execution in Supabase Dashboard" -ForegroundColor White
    Write-Host ""
    Write-Host "🎉 ERCOT snapshots will now be captured automatically 4x daily!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Deployment failed. Check the error above." -ForegroundColor Red
    exit 1
}
