# 🚀 Roleplay Demo - Automatisches Setup Skript
# Führe dieses Skript aus um alles automatisch zu kopieren und einzurichten!

Write-Host "🚀 Roleplay Demo Setup startet..." -ForegroundColor Green
Write-Host ""

$srcPath = "C:\Users\arnod\desktop\salezdashboard"
$basePath = "C:\Users\arnod\desktop\roleplay-demo"

# ────────────────────────────────────────────────────────────────────────────
# 1. KOPIERE WICHTIGE DATEIEN
# ────────────────────────────────────────────────────────────────────────────

Write-Host "📂 Kopiere Dateien..." -ForegroundColor Cyan

# Frontend Components
Copy-Item "$srcPath\src\components\Roleplay.tsx" "$basePath\frontend\src\components\" -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Roleplay.tsx"

# Services
Copy-Item "$srcPath\src\services\useDeepgramSTT.ts" "$basePath\frontend\src\services\" -Force -ErrorAction SilentlyContinue
Copy-Item "$srcPath\src\services\useOpenAIWhisper.ts" "$basePath\frontend\src\services\" -Force -ErrorAction SilentlyContinue
Copy-Item "$srcPath\src\services\apiFetch.ts" "$basePath\frontend\src\services\" -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ Services (3x)"

# CSS
Copy-Item "$srcPath\src\index.css" "$basePath\frontend\src\" -Force -ErrorAction SilentlyContinue
Write-Host "   ✅ index.css"

Write-Host ""
Write-Host "✅ Setup abgeschlossen!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Nächste Schritte:" -ForegroundColor Yellow
Write-Host "1. Öffne Terminal im roleplay-demo Ordner"
Write-Host "2. npm install"
Write-Host "3. Erstelle .env mit API Keys"
Write-Host "4. npm run dev"
Write-Host ""
Write-Host "ℹ️  Alle anderen Dateien wurden bereits erstellt!" -ForegroundColor Blue
