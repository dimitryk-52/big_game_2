# Used by "Запустить ТВ.bat" / "Запустить админку.bat" when the server on :4173 is already running.
# Prints the build time of dist/ if any file in src/ (or an .html page) is newer, i.e. the running
# server shows an old build. Prints nothing when the build is up to date. ASCII only: PowerShell 5.1
# reads BOM-less scripts in the ANSI codepage.
$built = Get-Item -LiteralPath 'dist/admin.html' -ErrorAction SilentlyContinue
if (-not $built) { exit 0 }
$newest = Get-ChildItem -Path 'src' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$pages = Get-ChildItem -Path '.' -Filter '*.html' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$t = $newest.LastWriteTime
if ($pages -and $pages.LastWriteTime -gt $t) { $t = $pages.LastWriteTime }
if ($t -gt $built.LastWriteTime) { Write-Output $built.LastWriteTime.ToString('dd.MM HH:mm') }
