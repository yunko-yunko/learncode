@echo off
cd /d "%~dp0app"
if not exist "node_modules\electron" (
  call npm.cmd install
  if errorlevel 1 goto :failed
)
call npm.cmd start
if errorlevel 1 goto :failed
exit /b 0
:failed
echo.
echo learncode could not start. Check the messages above.
pause
exit /b 1
