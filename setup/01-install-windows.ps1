# WhyBot - Open Agent Hackathon 2026
# Step 1: install / verify the Windows tools from the Participant Setup Guide.
# Run in PowerShell AS ADMINISTRATOR:
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   cd <path to your clone of the repo>\setup
#   .\01-install-windows.ps1
#
# Safe to re-run: anything already installed is skipped.

$ErrorActionPreference = "Continue"

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Say($msg, $color = "Cyan") { Write-Host "`n== $msg" -ForegroundColor $color }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Please re-open PowerShell with 'Run as administrator' and run this again." -ForegroundColor Red
    exit 1
}

if (-not (Have "winget")) {
    Write-Host "winget not found. Install 'App Installer' from the Microsoft Store, then re-run." -ForegroundColor Red
    exit 1
}

$tools = @(
    @{ Name = "Git";            Cmd = "git";    Id = "Git.Git" },
    @{ Name = "Python 3.13";    Cmd = "python"; Id = "Python.Python.3.13" },   # Zetaris helper scripts
    @{ Name = "Node.js LTS";    Cmd = "node";   Id = "OpenJS.NodeJS.LTS" },    # WhyBot
    @{ Name = "Docker Desktop"; Cmd = "docker"; Id = "Docker.DockerDesktop" }
)

foreach ($t in $tools) {
    Say "Checking $($t.Name)"
    $installed = Have $t.Cmd
    if (-not $installed) {
        $listed = winget list --id $t.Id -e --accept-source-agreements 2>$null | Select-String $t.Id
        $installed = [bool]$listed
    }
    if ($installed) {
        Write-Host "  already installed - skipping" -ForegroundColor Green
    } else {
        Write-Host "  installing $($t.Id) ..."
        winget install --id $t.Id -e --silent --accept-package-agreements --accept-source-agreements
    }
}

# WSL 2 + Ubuntu (Zetaris setup commands run in a Linux terminal)
Say "Checking WSL 2"
$wslOk = $false
try { $s = wsl --status 2>&1 | Out-String; if ($LASTEXITCODE -eq 0) { $wslOk = $true } } catch {}
$distros = (wsl -l -q 2>$null | Out-String) -replace "`0", ""
if ($wslOk -and $distros -match "Ubuntu") {
    Write-Host "  WSL with Ubuntu found - skipping" -ForegroundColor Green
} else {
    Write-Host "  installing WSL 2 + Ubuntu (a REBOOT may be required) ..."
    wsl --install -d Ubuntu
    $needReboot = $true
}
wsl --set-default-version 2 2>$null | Out-Null

# Refresh PATH for this session so version checks see new installs
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Say "Versions"
if (Have "git")    { git --version }    else { Write-Host "  git: not on PATH yet (open a new terminal)" -ForegroundColor Yellow }
if (Have "python") { python --version } else { Write-Host "  python: not on PATH yet (open a new terminal)" -ForegroundColor Yellow }
if (Have "node")   { node --version }   else { Write-Host "  node: not on PATH yet (open a new terminal)" -ForegroundColor Yellow }
if (Have "docker") { docker version --format "Docker client {{.Client.Version}} / server {{.Server.Version}}" 2>$null; docker compose version } else { Write-Host "  docker: start Docker Desktop once, then open a new terminal" -ForegroundColor Yellow }

Say "Node packages for WhyBot"
if (Have "npm") {
    Push-Location (Split-Path $PSScriptRoot -Parent)
    npm install --no-fund --no-audit
    Pop-Location
} else { Write-Host "  npm: not on PATH yet (open a new terminal and run npm install in the repo)" -ForegroundColor Yellow }

Say "Manual steps left (see docs/SETUP.md)" "Yellow"
Write-Host @"
  1. Docker Desktop > Settings > Resources > WSL integration: turn ON for Ubuntu. Apply & restart.
  2. Register at Zetaris Cloud and download zetaris-platform.zip into Downloads,
     then run setup/02-zetaris-wsl.sh in Ubuntu.
  3. Install Meterless Nightshift (Windows edition) from meterless.ai.
  4. Get an NVIDIA API key at build.nvidia.com and paste it into Nightshift > Setup > Providers.
"@
if ($needReboot) { Write-Host "`n  WSL was just installed: REBOOT, open Ubuntu once to create your Linux user, then continue." -ForegroundColor Red }
