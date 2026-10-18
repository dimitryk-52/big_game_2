@echo off
chcp 65001 >nul
cd /d "%~dp0"
title BIG GAME 2 — сервер (ТВ и админка)

rem Сервер уже запущен (например, из «Запустить админку») — просто открываем ТВ
netstat -ano | findstr ":4173 " | findstr LISTENING >nul
if not errorlevel 1 (
  start "" http://localhost:4173/tv.html
  exit /b
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости...
  call npm install
)
echo.
echo Собираю и запускаю. Откроется браузер с экраном ТВ.
echo   ТВ:      http://localhost:4173/tv.html
echo   Админка: http://localhost:4173/admin.html  (или «Запустить админку.bat»)
echo Пока это окно открыто — игра работает. Закроешь окно — сервер остановится.
echo.
call npm run local
pause
