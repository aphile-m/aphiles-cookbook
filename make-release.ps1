# Builds the two release assets for Aphile's Cookbook:
#   - Aphiles-Cookbook.apk   (full app — for native/permission/plugin changes)
#   - www-bundle.zip         (web-only OTA bundle — for recipe-app changes)
# Then prints a version.json template to fill in and upload alongside them.
#
# Usage:  powershell -ExecutionPolicy Bypass -File make-release.ps1
# Run from the project root: C:\Users\aphil\dev\potjie-app

$ErrorActionPreference = 'Stop'
$proj = $PSScriptRoot
$out  = Join-Path $proj 'release'
New-Item -ItemType Directory -Force $out | Out-Null

$env:Path = "C:\Users\aphil\dev\tools\node-v22.12.0-win-x64;$env:Path"
$env:JAVA_HOME = 'C:\Users\aphil\dev\tools\jdk-21.0.11+10'
$env:ANDROID_HOME = 'C:\Users\aphil\dev\android-sdk'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Write-Host '== Syncing web assets into Android ==' -ForegroundColor Cyan
Set-Location $proj
npx cap sync android

Write-Host '== Building APK ==' -ForegroundColor Cyan
Set-Location (Join-Path $proj 'android')
.\gradlew.bat assembleDebug --no-daemon
Copy-Item 'app\build\outputs\apk\debug\app-debug.apk' (Join-Path $out 'Aphiles-Cookbook.apk') -Force

Write-Host '== Zipping web bundle (www contents at zip root) ==' -ForegroundColor Cyan
$zip = Join-Path $out 'www-bundle.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $proj 'www\*') -DestinationPath $zip

# Pull the current web/native versions straight from the source of truth.
$indexPath = Join-Path $proj 'www\index.html'
$webVer = ([regex]::Match((Get-Content $indexPath -Raw), 'APP_WEB_VERSION\s*=\s*[''"]?([\d.]+)')).Groups[1].Value
$nativeVer = ([regex]::Match((Get-Content (Join-Path $proj 'android\app\build.gradle') -Raw), 'versionCode\s+(\d+)')).Groups[1].Value

Write-Host ''
Write-Host "== Built APK_web=v$webVer  APK_native(versionCode)=$nativeVer ==" -ForegroundColor Green
Write-Host 'Assets are in:' (Resolve-Path $out)
Write-Host ''
Write-Host 'Now create/replace a GitHub release and upload BOTH files above plus this version.json:' -ForegroundColor Yellow
@"
{
  "web": "$webVer",
  "native": $nativeVer,
  "webRequiresNative": 1,
  "apkUrl": "https://github.com/USER/REPO/releases/latest/download/Aphiles-Cookbook.apk",
  "bundleUrl": "https://github.com/USER/REPO/releases/latest/download/www-bundle.zip",
  "notes": "Describe what changed here."
}
"@ | Tee-Object (Join-Path $out 'version.json')
Write-Host ''
Write-Host 'Replace USER/REPO with your repo. The /releases/latest/download/ path always points at the newest release, so the in-app update source URL never changes.' -ForegroundColor Yellow
