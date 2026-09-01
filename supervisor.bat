@echo off
cd /d %~dp0
:loop
node server.js
timeout /t 2 /nobreak >nul
goto loop
