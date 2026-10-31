@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Windows launcher: no Bash or PowerShell execution-policy changes required.
pushd "%~dp0" || goto folder_error

where node.exe >nul 2>&1
if errorlevel 1 goto missing_node
node.exe -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto old_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_npm

call npm.cmd start
set "launch_exit=%errorlevel%"
goto finish

:missing_node
echo Node.js was not found. Install Node.js 24+ with npm, then try again.
set "launch_exit=1"
goto finish

:old_node
echo Node.js 24 or newer is required.
set "launch_exit=1"
goto finish

:missing_npm
echo npm was not found. Install npm with Node.js, then try again.
set "launch_exit=1"
goto finish

:finish
popd
if not "%launch_exit%"=="0" (
  echo Startup failed. See the message above.
  pause
)
exit /b %launch_exit%

:folder_error
echo Could not open the project folder.
pause
exit /b 1
