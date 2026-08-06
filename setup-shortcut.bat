@echo off
setlocal

echo  HCP MasterDB -- Shortcut Setup
echo  ================================
echo.

:: ── Locate Edge ───────────────────────────────────────────────────────────────
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo  ERROR: Microsoft Edge not found.
  echo  Install Edge from https://microsoft.com/edge and run this again.
  echo.
  pause & exit /b 1
)

:: ── Locate favicon (must be in the same folder as this .bat) ──────────────────
set "ICON=%~dp0favicon.ico"
if not exist "%ICON%" (
  echo  WARNING: favicon.ico not found next to this file.
  echo  The shortcut will use the Edge default icon.
  echo.
  set "ICON=%EDGE%,0"
)

:: ── App settings ──────────────────────────────────────────────────────────────
set "APP_URL=https://connectprojects.github.io/hcp-web/masterdb2/"
set "PROFILE=HCPMasterDB"
set "NAME=HCP MasterDB"

:: ── Write PowerShell script to temp file ──────────────────────────────────────
set "PS=%TEMP%\hcp_setup_%RANDOM%.ps1"
(
  echo $ws   = New-Object -ComObject WScript.Shell
  echo $dest = $ws.SpecialFolders("Desktop") + "\%NAME%.lnk"
  echo $lnk  = $ws.CreateShortcut($dest)
  echo $lnk.TargetPath   = "%EDGE%"
  echo $lnk.Arguments    = "--app=%APP_URL% --profile-directory=%PROFILE%"
  echo $lnk.IconLocation = "%ICON%"
  echo $lnk.Description  = "HCP MasterDB - Connect Hearing"
  echo $lnk.Save()
  echo Write-Host "Saved to: $dest"
) > "%PS%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
set "RC=%errorlevel%"
del "%PS%" 2>nul

echo.
if %RC% == 0 (
  echo  Done!  "%NAME%" shortcut added to your Desktop.
  echo.
  echo  Double-click it any time to open HCP MasterDB.
  echo  It runs in its own window with its own browser profile
  echo  so it stays separate from your regular Edge browsing.
  echo.
  echo  First launch: the app will ask you to pick your HCP OneDrive
  echo  folder -- choose the same shared folder this .bat file is in.
) else (
  echo  ERROR: Could not create shortcut. Check the messages above.
)

echo.
pause
