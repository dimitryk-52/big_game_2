@echo off
chcp 65001 >nul
cd /d "%~dp0"
title BIG GAME 2 — сервер (ТВ и админка)

rem Сервер уже запущен (например, из «Запустить админку») — просто открываем ТВ
netstat -ano | findstr ":4173 " | findstr LISTENING >nul
if errorlevel 1 goto start

rem ...но если код новее сборки, сервер показывает старую версию: предлагаем перезапустить
set "BUILT="
for /f "delims=" %%t in ('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stale-build.ps1') do set "BUILT=%%t"
if not defined BUILT (
  start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\open-tv.ps1
  exit /b
)
echo.
echo Сервер уже запущен, но со старой сборкой (от %BUILT%) — в ней нет последних изменений.
echo   R — перезапустить сервер с новой сборкой. Открытые ТВ и админку потом обнови (F5).
echo       Если сейчас идёт игра, ТВ на минуту потеряет сервер.
echo   O — открыть как есть, со старой сборкой.
choice /c RO /n /m "R или O? "
if errorlevel 2 (
  start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\open-tv.ps1
  exit /b
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4173 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
timeout /t 1 /nobreak >nul
echo Старый сервер остановлен, собираю заново.

:start
if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости...
  call npm install
)
echo.
echo Собираю и запускаю. Экран ТВ откроется сам на весь экран (на втором мониторе, если он есть).
echo   ТВ:      http://localhost:4173/tv.html
echo   Админка: http://localhost:4173/admin.html  (или «Запустить админку.bat»)
echo Пока это окно открыто — игра работает. Закроешь окно — сервер остановится.
echo.
rem новые фоны префектур (src\img\bgs\bg_*_orig.png) превращаем в пиксель-арт; готовые пропускаются
rem если Python не установлен — просто идём дальше со старыми фонами
call npm run build:bgs
rem ТВ откроется сам в киоске (полный экран на втором мониторе), когда сервер поднимется. Выйти из киоска: Alt+F4
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\open-tv.ps1
call npm run local
pause
