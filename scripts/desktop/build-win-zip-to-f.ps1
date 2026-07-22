param(
  [string]$SourceDesktopPath,
  [string]$WorkRoot = (Join-Path $env:TEMP "openstock-desktop-build"),
  [string]$DestDir = "F:\OpenStockAlerts\dist",
  [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-DesktopSource {
  param([string]$ExplicitPath)

  if ($ExplicitPath) {
    return (Resolve-Path -LiteralPath $ExplicitPath).Path
  }

  $scriptDir = $null
  if ($PSScriptRoot) {
    $scriptDir = $PSScriptRoot
  } elseif ($PSCommandPath) {
    $scriptDir = Split-Path -Parent $PSCommandPath
  } elseif ($MyInvocation -and $MyInvocation.MyCommand -and $MyInvocation.MyCommand.Path) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  } else {
    throw "Cannot resolve script directory. Pass -SourceDesktopPath explicitly."
  }

  $repoRoot = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
  return (Join-Path $repoRoot "desktop")
}

function Remove-IfExists {
  param([string]$PathValue)

  if (Test-Path -LiteralPath $PathValue) {
    Remove-Item -LiteralPath $PathValue -Recurse -Force
  }
}

function Normalize-FileSystemPath {
  param([string]$PathValue)

  if ($PathValue -like 'Microsoft.PowerShell.Core\FileSystem::*') {
    return $PathValue.Substring('Microsoft.PowerShell.Core\FileSystem::'.Length)
  }

  return $PathValue
}

function Copy-DirectoryRobust {
  param(
    [string]$SourceDir,
    [string]$DestDir
  )

  $normalizedSource = Normalize-FileSystemPath $SourceDir
  $normalizedDest = Normalize-FileSystemPath $DestDir

  $code = 0

  New-Item -ItemType Directory -Force -Path $normalizedDest | Out-Null
  & robocopy $normalizedSource $normalizedDest /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP /XD node_modules dist
  $code = $LASTEXITCODE

  if ($code -ge 8) {
    throw "robocopy failed with exit code $code"
  }
}

$desktopSource = Resolve-DesktopSource -ExplicitPath $SourceDesktopPath
if (-not (Test-Path -LiteralPath (Join-Path $desktopSource "package.json"))) {
  throw "desktop/package.json was not found under: $desktopSource"
}

$desktopWork = Join-Path $WorkRoot "desktop"

Write-Host "Source: $desktopSource"
Write-Host "Work:   $desktopWork"
Write-Host "Dest:   $DestDir"

Remove-IfExists -PathValue $WorkRoot
New-Item -ItemType Directory -Force -Path $WorkRoot | Out-Null
Copy-DirectoryRobust -SourceDir $desktopSource -DestDir $desktopWork

Remove-IfExists -PathValue (Join-Path $desktopWork "node_modules")
Remove-IfExists -PathValue (Join-Path $desktopWork "dist")

Set-Location $desktopWork

if (-not $SkipInstall) {
  $lockFile = Join-Path $desktopWork "package-lock.json"
  if (Test-Path -LiteralPath $lockFile) {
    Write-Host "Installing dependencies with npm ci..."
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed"
    }
  } else {
    Write-Host "package-lock.json not found, falling back to npm install..."
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed"
    }
  }
}

Write-Host "Building Windows zip..."
& node .\node_modules\electron-builder\cli.js --win --config .\electron-builder.win-zip.json
if ($LASTEXITCODE -ne 0) {
  throw "electron-builder failed"
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$zip = Get-ChildItem -LiteralPath (Join-Path $desktopWork "dist") -Filter *.zip |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $zip) {
  throw "No zip artifact was found"
}

$zipDest = Join-Path $DestDir $zip.Name
Copy-Item -LiteralPath $zip.FullName -Destination $zipDest -Force

$guideSrc = Join-Path $desktopWork "USER_GUIDE.md"
if (Test-Path -LiteralPath $guideSrc) {
  Copy-Item -LiteralPath $guideSrc -Destination (Join-Path $DestDir "USER_GUIDE.md") -Force
}

Write-Host ""
Write-Host "Copied to destination:"
Write-Host "  $zipDest"
if (Test-Path -LiteralPath (Join-Path $DestDir "USER_GUIDE.md")) {
  Write-Host "  $(Join-Path $DestDir 'USER_GUIDE.md')"
}
