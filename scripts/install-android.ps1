<#
.SYNOPSIS
  Installs the StuffSearch release APK onto an Android phone over USB or Wi-Fi.

.EXAMPLE
  # USB: plug the phone in, enable Developer options -> USB debugging, accept
  # the "Allow USB debugging?" prompt on the phone, then:
  .\scripts\install-android.ps1

.EXAMPLE
  # Wi-Fi (Android 11+): on the phone enable Developer options -> Wireless
  # debugging -> "Pair device with pairing code", then:
  .\scripts\install-android.ps1 -PairAddress 192.168.1.50:37123 -PairingCode 123456 -WifiAddress 192.168.1.50:5555

.EXAMPLE
  # Wi-Fi, already paired before:
  .\scripts\install-android.ps1 -WifiAddress 192.168.1.50:5555
#>
[CmdletBinding()]
param(
    [string]$PairAddress,
    [string]$PairingCode,
    [string]$WifiAddress,
    [string]$Apk = "$PSScriptRoot\..\android\app\build\outputs\apk\release\app-release.apk"
)

$ErrorActionPreference = 'Stop'

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb not found at $adb. Set ANDROID_HOME." }

$Apk = (Resolve-Path $Apk).Path
Write-Host "APK: $Apk"

if ($PairAddress) {
    if (-not $PairingCode) { throw "-PairAddress requires -PairingCode." }
    Write-Host "Pairing with $PairAddress ..."
    $PairingCode | & $adb pair $PairAddress
}

if ($WifiAddress) {
    Write-Host "Connecting to $WifiAddress ..."
    & $adb connect $WifiAddress
}

$devices = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if (-not $devices) {
    throw "No authorised device. USB: plug in + enable USB debugging + accept the prompt. Wi-Fi: pass -WifiAddress (and -PairAddress/-PairingCode the first time)."
}
Write-Host "Device(s):`n$($devices -join "`n")"

# -r reinstalls over an existing copy, keeping app data.
Write-Host "Installing (this replaces any existing StuffSearch, keeping its data)..."
& $adb install -r $Apk
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Install failed. If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE, an older build signed with a different key is present. Remove it first:"
    Write-Warning "  $adb uninstall com.stuffsearch.app"
    exit $LASTEXITCODE
}
Write-Host "`nInstalled. Launching..."
& $adb shell monkey -p com.stuffsearch.app -c android.intent.category.LAUNCHER 1 | Out-Null
Write-Host "Done - StuffSearch is running standalone (no Metro / Expo server needed)."
