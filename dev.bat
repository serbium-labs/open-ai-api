@echo off
setlocal

start "Codex API Server" cmd /k "cd /d ""%~dp0server"" && npm run dev"
start "Codex API Client" cmd /k "cd /d ""%~dp0client"" && npm run dev"
