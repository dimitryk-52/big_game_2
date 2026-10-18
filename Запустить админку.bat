@echo off
chcp 65001 >nul
cd /d "%~dp0"
title BIG GAME 2 — сервер (ТВ и админка)

rem Сервер уже запущен (например, из «Запустить ТВ») — просто открываем админку
netstat -ano | findstr ":4173 " | findstr LISTENING >nul
if not errorlevel 1 (
  start "" http://localhost:4173/admin.html
  exit /b
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости...
  call npm install
)
echo.
echo Собираю и запускаю. Откроется браузер с админкой.
echo   Админка: http://localhost:4173/admin.html
echo   ТВ:      http://localhost:4173/tv.html  (или «Запустить ТВ.bat»)
echo Пока это окно открыто — всё работает. Закроешь окно — сервер остановится.
echo.
call npm run local:admin
pause
