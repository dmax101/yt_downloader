@echo off
setlocal

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul
if errorlevel 1 (
  echo Failed to initialize MSVC build environment.
  exit /b 1
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where link >nul 2>nul
if errorlevel 1 (
  echo MSVC linker link.exe not found after vcvars64 initialization.
  exit /b 1
)

if "%LIB%"=="" (
  echo LIB environment variable is empty after vcvars64 initialization.
  exit /b 1
)

call npm run tauri build
exit /b %ERRORLEVEL%
