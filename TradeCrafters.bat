@echo off
title Project Launcher

REM Change directory to where the batch file is located
cd /d "%~dp0"

REM Start server in one window
start "Server" cmd /k "cd server && npm install && npm start"

REM Start client in another window
start "Client" cmd /k "cd client && npm install && npm start"

exit