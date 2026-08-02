@echo off
chcp 65001 >nul
set "PYTHONUTF8=1"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "LOG=%USERPROFILE%\Desktop\yingo_%STAMP%.log"
echo Running yingo full test suite ...
echo Log saving to: %LOG%
echo.
cd /d "%~dp0"
python -u main.py 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%'"
echo.
echo All done. Log saved: %LOG%
pause