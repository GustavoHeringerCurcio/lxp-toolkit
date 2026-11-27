@echo off
rem Logon watchdog: keeps the Tailscale Funnel pointed at the LXP Toolkit app.
rem Started by the Startup shortcut "LXP Toolkit Tailscale".
:loop
"C:\Program Files\nodejs\node.exe" "%~dp0tailscale-supervisor.mjs"
timeout /t 10 /nobreak >nul
goto loop
