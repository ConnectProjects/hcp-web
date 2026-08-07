@echo off
setlocal

echo  HCP MasterDB -- Shortcut Setup
echo  ================================
echo.

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "ICON=%~dp0favicon.ico,0"
if not exist "%~dp0favicon.ico" set "ICON=%EDGE%,0"

set "PS=%TEMP%\hcp_%RANDOM%.ps1"
echo $ws = New-Object -ComObject WScript.Shell > "%PS%"
echo $desk = $ws.SpecialFolders^("Desktop"^) >> "%PS%"
echo $lnk = $ws.CreateShortcut^($desk + "\HCP MasterDB.lnk"^) >> "%PS%"
echo $lnk.TargetPath = "%EDGE%" >> "%PS%"
echo $lnk.Arguments = "--app=https://connectprojects.github.io/hcp-web/masterdb2/ --profile-directory=HCPMasterDB" >> "%PS%"
echo $lnk.IconLocation = "%ICON%" >> "%PS%"
echo $lnk.Description = "HCP MasterDB - Connect Hearing" >> "%PS%"
echo $lnk.Save^(^) >> "%PS%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%"
if %errorlevel% == 0 (
  echo.
  echo  Done! Shortcut added to your Desktop.
  echo  First launch: pick your HCP OneDrive folder when prompted.
) else (
  echo  ERROR: Could not create shortcut.
)
echo.
pause
