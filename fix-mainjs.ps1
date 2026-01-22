$path = 'scripts\main.js'
$bytes = [System.IO.File]::ReadAllBytes($path)
Write-Host "Total bytes: $($bytes.Length)"

# Find the first null byte after position 6350
$nullStart = -1
for ($i = 6350; $i -lt [Math]::Min($bytes.Length, 6600); $i++) {
    if ($bytes[$i] -eq 0) {
        $nullStart = $i
        break
    }
}

if ($nullStart -gt 0) {
    Write-Host "First null byte found at position: $nullStart"
    
    # Truncate file at that position
    $newBytes = $bytes[0..($nullStart - 1)]
    [System.IO.File]::WriteAllBytes($path, $newBytes)
    
    Write-Host "File truncated from $($bytes.Length) to $($newBytes.Length) bytes"
    Write-Host "Removed $($bytes.Length - $newBytes.Length) null bytes"
} else {
    Write-Host "No null bytes found in the specified range"
}
