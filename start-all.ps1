param(
    [switch]$Detach  # pass -Detach to start docker containers in the background (default: attached/streamed)
)

$Root = $PSScriptRoot

# ── 1. Docker containers ──────────────────────────────────────────────────────
Write-Host "Starting Docker services (whatsapp-bridge, voice-to-text)..." -ForegroundColor Cyan
Set-Location $Root
docker compose up -d whatsapp-bridge voice-to-text
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose failed. Is Docker Desktop running?"
    exit 1
}

# ── 2. Backend ────────────────────────────────────────────────────────────────
Write-Host "Opening backend terminal..." -ForegroundColor Cyan
$backendDir = Join-Path $Root "backend"

# ── 3. Frontend ───────────────────────────────────────────────────────────────
Write-Host "Opening frontend terminal..." -ForegroundColor Cyan
$frontendDir = Join-Path $Root "frontend"

# Try Windows Terminal (wt) first; fall back to separate powershell windows.
$wtAvailable = Get-Command wt -ErrorAction SilentlyContinue

if ($wtAvailable) {
    # Open both panes in a single Windows Terminal window.
    wt `
        new-tab --title "Backend" --startingDirectory $backendDir powershell -NoExit -Command "npm run dev" `; `
        new-tab --title "Frontend" --startingDirectory $frontendDir powershell -NoExit -Command "npm run dev"
} else {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendDir'; npm run dev"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendDir'; npm run dev"
}

Write-Host ""
Write-Host "All services started:" -ForegroundColor Green
Write-Host "  Docker  → whatsapp-bridge :3002, voice-to-text :9000"
Write-Host "  Backend → http://localhost:3001"
Write-Host "  Frontend → http://localhost:5173  (Vite default)"
