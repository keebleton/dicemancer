@echo off
title Dicemancer
cd /d "%~dp0"

rem Windows that opened before Node was installed carry a stale PATH;
rem fall back to Node's standard install folder so this works regardless.
where npm >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\npm.cmd" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else (
    echo Node.js is not installed on this machine.
    echo Install it from nodejs.org, then double-click this again.
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo First run on this machine: installing packages, this takes a minute...
  call npm install --no-audit --no-fund
)

echo Starting Dicemancer. Your browser will open in a moment.
echo Keep this black window open while you play. Close it to quit.
call npm run dev -- --open
pause
