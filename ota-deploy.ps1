# =================================================================
#  Aphile's Cookbook - OTA repo + first release setup
#  Run from project root:
#     powershell -ExecutionPolicy Bypass -File ota-deploy.ps1
#  Writes ota-deploy.log next to itself.
# =================================================================

$ErrorActionPreference = 'Stop'
$proj    = $PSScriptRoot
$log     = Join-Path $proj 'ota-deploy.log'
$flagOK  = Join-Path $proj 'ota-deploy.ok'
$flagERR = Join-Path $proj 'ota-deploy.err'
Remove-Item $log, $flagOK, $flagERR -Force -ErrorAction SilentlyContinue
# Force-clear the log even if Remove-Item couldn't delete
Set-Content -Path $log -Value ('=== run started {0} ===' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Set-Location $proj

function Log($msg) {
    $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg)
    Add-Content -Path $log -Value $line
    Write-Host $line
}

function Run($label, [scriptblock]$block) {
    Log ("--- $label ---")
    # Native commands send "notice" / informational lines to stderr and PS
    # would treat that as a terminating error under Stop. Switch to Continue
    # around the block and rely on $LASTEXITCODE for native success.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $block 2>&1 | Out-String
        if ($output) { Add-Content -Path $log -Value $output }
        return $output
    } finally {
        $ErrorActionPreference = $prev
    }
}

function RunNative($label, [scriptblock]$block) {
    Run $label $block
    if ($LASTEXITCODE -ne 0) { throw ("{0} exited {1}" -f $label, $LASTEXITCODE) }
}

try {
    Log "Working directory: $proj"
    Log "User: $env:USERNAME"

    # ----- 1. gh auth status (FAIL FAST if not ready) -----
    RunNative 'gh --version' { gh --version }
    RunNative 'gh auth status' { gh auth status }
    Log 'GH OK.'

    # ----- 2. Build release assets -----
    RunNative 'make-release.ps1' { powershell -ExecutionPolicy Bypass -File (Join-Path $proj 'make-release.ps1') }
    $rel = Join-Path $proj 'release'
    foreach ($f in 'Aphiles-Cookbook.apk','www-bundle.zip','version.json') {
        $p = Join-Path $rel $f
        if (-not (Test-Path $p)) { throw "Missing release asset: $p" }
        Log ("  OK  {0}  ({1} bytes)" -f $f, (Get-Item $p).Length)
    }

    # ----- 3. .gitignore -----
    $gi = @'
node_modules/
android/build/
android/app/build/
android/.gradle/
android/capacitor-cordova-android-plugins/
release/
*.apk
.DS_Store
'@
    Set-Content -Path (Join-Path $proj '.gitignore') -Value $gi -Encoding ascii
    Log '.gitignore written'

    # ----- 4. Initialize repo + first commit + create PUBLIC repo + push -----
    if (-not (Test-Path (Join-Path $proj '.git'))) {
        RunNative 'gitinit' { git init -b main }
    } else {
        Log 'git repo already initialised'
    }
    RunNative 'gitadd .' { git add -A }
    # Configure identity inline so commit doesn't depend on global config
    RunNative 'gitcommit' { git -c user.email=aphilem@gmail.com -c user.name=aphile-m commit -m "Initial commit" --allow-empty }

    # Resolve gh user (so we can build the version.json URLs correctly)
    $ghUser = (gh api user --jq .login).Trim()
    Log "GitHub user: $ghUser"

    # Create repo if it doesn't exist yet
    $repoName = 'aphiles-cookbook'
    $exists = $false
    try {
        gh repo view "$ghUser/$repoName" --json name 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $exists = $true }
    } catch {}

    if ($exists) {
        Log "Repo $ghUser/$repoName already exists - reusing"
        # Ensure remote configured
        $remoteUrl = "https://github.com/$ghUser/$repoName.git"
        $cur = git remote get-url origin 2>$null
        if (-not $cur) {
            RunNative 'gitremote add origin' { git remote add origin $remoteUrl }
        } elseif ($cur.Trim() -ne $remoteUrl) {
            RunNative 'gitremote set-url origin' { git remote set-url origin $remoteUrl }
        }
        RunNative 'gitpush origin main' { git push -u origin main }
    } else {
        RunNative 'gh repo create (public)' { gh repo create $repoName --public --source=. --remote=origin --push }
    }

    # ----- 5. Patch version.json -----
    $vjPath = Join-Path $rel 'version.json'
    $vj = Get-Content $vjPath -Raw
    $vj = $vj -replace 'USER/REPO', "$ghUser/$repoName"
    $vj = $vj -replace 'Describe what changed here\.', 'Initial release.'
    Set-Content -Path $vjPath -Value $vj -Encoding ascii
    Log 'version.json:'
    Add-Content -Path $log -Value $vj

    # ----- 6. Create release v1 with assets, mark latest -----
    $apk    = Join-Path $rel 'Aphiles-Cookbook.apk'
    $bundle = Join-Path $rel 'www-bundle.zip'
    $vjFile = Join-Path $rel 'version.json'
    # If release exists from a prior run, replace it cleanly
    $relExists = $false
    try {
        gh release view v1 --repo "$ghUser/$repoName" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $relExists = $true }
    } catch {}
    if ($relExists) {
        Log 'Release v1 already exists - deleting and recreating'
        Run 'gh release delete v1' { gh release delete v1 --yes --cleanup-tag --repo "$ghUser/$repoName" }
    }
    RunNative 'gh release create v1' {
        gh release create v1 `
            --repo "$ghUser/$repoName" `
            --title 'v1 — initial' `
            --notes 'Initial release.' `
            --latest `
            $apk $bundle $vjFile
    }

    # ----- 7. Verify version.json is publicly fetchable -----
    $checkUrl = "https://github.com/$ghUser/$repoName/releases/latest/download/version.json"
    Log ("Checking: $checkUrl")
    $resp = Invoke-WebRequest -Uri $checkUrl -UseBasicParsing -MaximumRedirection 10
    Log ("HTTP {0}" -f $resp.StatusCode)
    Add-Content -Path $log -Value $resp.Content

    # ----- Done -----
    Log '=========================================='
    Log 'DONE.'
    Log ("Repo:    https://github.com/$ghUser/$repoName")
    Log ("Release: https://github.com/$ghUser/$repoName/releases/tag/v1")
    Log ("Update source URL: $checkUrl")
    Set-Content -Path $flagOK -Value 'ok'
    exit 0
} catch {
    Log ('FAILED: ' + $_.Exception.Message)
    Add-Content -Path $log -Value ($_ | Out-String)
    Set-Content -Path $flagERR -Value 'err'
    exit 1
}
