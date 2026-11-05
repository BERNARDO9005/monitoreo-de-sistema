@echo off
chcp 65001 >nul
title Compilador System Monitor (.exe)
color 0b

echo =====================================================================
echo   COMPILANDO SYSTEM MONITOR DASHBOARD A EJECUTABLE STANDALONE (.EXE)
echo =====================================================================
echo.

python build_exe.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =====================================================================
    echo   Compilación completada. El archivo está en: dist-exe\SystemMonitor.exe
    echo =====================================================================
    echo.
    pause
) else (
    echo.
    echo [ERROR] La compilación falló. Revisa los mensajes anteriores.
    echo.
    pause
)
