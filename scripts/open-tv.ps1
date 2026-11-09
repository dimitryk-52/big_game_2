# Открывает экран ТВ отдельным окном браузера в киоск-режиме (полный экран, без рамок) на втором мониторе.
#  - звук без клика (на ТВ никто не кликает, всё с пульта)
#  - браузер не тормозит анимации и таймеры, когда фокус на другом мониторе
#  - отдельный профиль, иначе флаги не применятся, если Chrome/Edge уже открыт
# Ждёт, пока сервер на :4173 начнёт отвечать (до 3 минут: первая сборка небыстрая).
param([string]$Url = 'http://localhost:4173/tv.html?auto=1')

$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
  try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:4173/tv.html' | Out-Null; break } catch { Start-Sleep -Milliseconds 700 }
}

$browser = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Start-Process $Url; exit }

# второй монитор (не основной), если он есть — туда ТВ
Add-Type -AssemblyName System.Windows.Forms
$scr = [System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1
if (-not $scr) { $scr = [System.Windows.Forms.Screen]::PrimaryScreen }
$x = $scr.Bounds.X; $y = $scr.Bounds.Y

$tvProfile = Join-Path $env:TEMP 'bg2-tv-profile'
$flags = @(
  "--user-data-dir=`"$tvProfile`"",
  '--kiosk',
  "--window-position=$x,$y",
  '--autoplay-policy=no-user-gesture-required',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--no-first-run',
  '--no-default-browser-check',
  $Url
)
Start-Process -FilePath $browser -ArgumentList $flags
