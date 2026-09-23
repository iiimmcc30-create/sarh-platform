# Configure Android build environment on C: drive
# Usage: . .\scripts\setup-android-sdk.ps1

$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Android\Sdk"
$env:GRADLE_USER_HOME = "C:\gradle"

# Ensure Gradle cache directory exists on C:
if (-not (Test-Path $env:GRADLE_USER_HOME)) {
    New-Item -ItemType Directory -Path $env:GRADLE_USER_HOME -Force | Out-Null
}

# Add tools to PATH for this session
$env:PATH = @(
    "$env:JAVA_HOME\bin",
    "$env:ANDROID_HOME\platform-tools",
    "$env:ANDROID_HOME\cmdline-tools\latest\bin",
    $env:PATH
) -join ";"

# Write local.properties for Gradle
$localProps = Join-Path $PSScriptRoot "..\android\local.properties"
$sdkDir = $env:ANDROID_HOME -replace '\\', '\\'
@"
sdk.dir=$sdkDir
"@ | Set-Content -Path $localProps -Encoding UTF8

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
Write-Host "local.properties updated"
