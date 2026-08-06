@echo off
rem ===== Virtual Desktop Pet launcher (console with logs) =====
rem Close this console window to quit the pet.
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="
set "PATH=%~dp0node-portable;%PATH%"
npm start
