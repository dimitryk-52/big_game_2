@echo off
chcp 65001 >nul
cd /d "%~dp0"
title BIG GAME 2 — генератор пиксель-арта

netstat -ano | findstr ":4180 " | findstr LISTENING >nul
if not errorlevel 1 (
  start "" http://localhost:4180/
  exit /b
)

echo Генератор пиксель-арта: http://localhost:4180/
echo Ключ берётся из .env (GEMINI_API_KEY). Картинки сохраняются в tools\pixelart\out
echo Пока это окно открыто — генератор работает.
echo.
start "" http://localhost:4180/
node tools/pixelart/server.mjs
pause
