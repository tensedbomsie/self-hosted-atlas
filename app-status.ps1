$appsFile = Join-Path $PSScriptRoot 'apps.json'
$apps = @()
if (Test-Path $appsFile) {
    $apps = Get-Content -Raw $appsFile | ConvertFrom-Json
}
$processNames = $apps | ForEach-Object { $_.process } | Where-Object { $_ } | Select-Object -Unique

$result = @{}
if ($processNames) {
    $running = Get-Process -Name $processNames -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name -Unique
    foreach ($app in $apps) {
        if ($app.process) {
            $result[$app.id] = [bool]($running -contains $app.process)
        }
    }
}

$result | ConvertTo-Json -Compress
