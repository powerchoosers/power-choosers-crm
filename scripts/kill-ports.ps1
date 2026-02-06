$conns = Get-NetTCPConnection -LocalPort 3000,3001 -State Listen -ErrorAction SilentlyContinue
$pids = $conns.OwningProcess | Sort-Object -Unique
foreach ($procId in $pids) {
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}
Write-Host "Ports 3000/3001 cleared"
