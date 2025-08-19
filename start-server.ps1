# Power Choosers CRM Server with ngrok
# This script starts the server with the correct PUBLIC_BASE_URL for development

Write-Host "🚀 Starting Power Choosers CRM Server with ngrok..." -ForegroundColor Green

# Get the current ngrok tunnel URL
try {
    $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
    $httpsUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" }).public_url
    
    if ($httpsUrl) {
        Write-Host "✅ Found ngrok tunnel: $httpsUrl" -ForegroundColor Green
        $env:PUBLIC_BASE_URL = $httpsUrl
    } else {
        Write-Host "⚠️  No ngrok tunnel found. Starting ngrok..." -ForegroundColor Yellow
        Start-Process -FilePath "ngrok" -ArgumentList "http","3000" -WindowStyle Hidden
        Start-Sleep 5
        
        $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
        $httpsUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" }).public_url
        
        if ($httpsUrl) {
            Write-Host "✅ Created ngrok tunnel: $httpsUrl" -ForegroundColor Green
            $env:PUBLIC_BASE_URL = $httpsUrl
        } else {
            Write-Host "❌ Failed to create ngrok tunnel. Using localhost (calls may not work)" -ForegroundColor Red
            $env:PUBLIC_BASE_URL = "http://localhost:3000"
        }
    }
} catch {
    Write-Host "⚠️  Could not connect to ngrok. Starting without tunnel..." -ForegroundColor Yellow
    $env:PUBLIC_BASE_URL = "http://localhost:3000"
}

Write-Host "🌐 PUBLIC_BASE_URL: $env:PUBLIC_BASE_URL" -ForegroundColor Cyan
Write-Host "📞 Server will be accessible at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "🎯 CRM Dashboard: http://localhost:3000/crm-dashboard.html" -ForegroundColor Cyan
Write-Host ""

# Start the server
node server.js
