# Runner k6 (Windows / PowerShell). Toujours contre une CIBLE DE TEST.
# Exemples :
#   .\run.ps1 smoke
#   .\run.ps1 load -Vus 100 -Duration 2m
#   .\run.ps1 breakpoint -MaxRate 800
param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [string]$BaseUrl = "http://localhost:8300",
    [int]$Vus = 0,
    [string]$Duration = "",
    [int]$Rate = 0,
    [int]$MaxRate = 0,
    [int]$MaxVus = 0
)

$ErrorActionPreference = "Stop"
$loadDir = Split-Path -Parent $PSScriptRoot   # tests/load
Set-Location $loadDir

$script = Join-Path "scenarios" ("{0}.js" -f $Scenario)
if (-not (Test-Path $script)) { throw "Scénario introuvable : $script" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summary = Join-Path "results" ("{0}-{1}.summary.json" -f $Scenario, $stamp)

$envArgs = @("--env", "BASE_URL=$BaseUrl")
if ($Vus -gt 0)      { $envArgs += @("--env", "VUS=$Vus") }
if ($Duration -ne "") { $envArgs += @("--env", "DURATION=$Duration") }
if ($Rate -gt 0)     { $envArgs += @("--env", "RATE=$Rate") }
if ($MaxRate -gt 0)  { $envArgs += @("--env", "MAX_RATE=$MaxRate") }
if ($MaxVus -gt 0)   { $envArgs += @("--env", "MAX_VUS=$MaxVus") }

Write-Host "→ k6 run $script  (BASE_URL=$BaseUrl)" -ForegroundColor Cyan
& k6 run @envArgs "--summary-export=$summary" $script
Write-Host "Résumé : $summary" -ForegroundColor Green
