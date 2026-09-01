$ErrorActionPreference = 'SilentlyContinue'

$os = Get-CimInstance Win32_OperatingSystem
$cpuInfo = Get-CimInstance Win32_Processor
$uptime = (Get-Date) - $os.LastBootUpTime
$cpuLoad = ($cpuInfo | Measure-Object -Property LoadPercentage -Average).Average
$ramUsedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1)
$ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)

$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    [ordered]@{
        drive    = $_.DeviceID
        freeGB   = [math]::Round($_.FreeSpace / 1GB, 1)
        totalGB  = [math]::Round($_.Size / 1GB, 1)
    }
}

$cpuTempC = $null
try {
    $raw = (Invoke-WebRequest -Uri "http://localhost:8085/data.json" -TimeoutSec 2 -UseBasicParsing).Content
    if ($raw -match '"SensorId":"/amdcpu/0/temperature/2"[^}]*?"RawValue":"([\d.]+)') {
        $cpuTempC = [double]$matches[1]
    }
} catch {}

$gpu = $null
try {
    $nvOut = & nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits
    if ($nvOut) {
        $parts = $nvOut -split ',\s*'
        $gpu = [ordered]@{
            name        = $parts[0]
            usagePct    = [int]$parts[1]
            tempC       = [int]$parts[2]
            memUsedMB   = [int]$parts[3]
            memTotalMB  = [int]$parts[4]
        }
    }
} catch {}

$result = [ordered]@{
    uptimeSeconds = [int]$uptime.TotalSeconds
    cpu = [ordered]@{
        name    = ($cpuInfo | Select-Object -First 1 -ExpandProperty Name)
        usagePct = [int]$cpuLoad
        tempC   = $cpuTempC
    }
    ram = [ordered]@{
        usedGB  = $ramUsedGB
        totalGB = $ramTotalGB
    }
    disks = $disks
    gpu = $gpu
}

$result | ConvertTo-Json -Depth 10 -Compress
