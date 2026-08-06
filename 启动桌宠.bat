@echo off
rem ===== Virtual Desktop Pet launcher (no console window) =====
cd /d "%~dp0"

rem Defensive: clear the var that makes electron run as plain node
set "ELECTRON_RUN_AS_NODE="

rem Put the portable node on PATH
set "PATH=%~dp0node-portable;%PATH%"

start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~dp0node_modules\electron\dist\electron.exe' -ArgumentList '.' -WorkingDirectory '%~dp0'"
