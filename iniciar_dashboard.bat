@echo off
chcp 65001 >nul
title Dashboard de Monitoreo de Sistema Operativo Nativo v2.0
cd /d "%~dp0"

echo ==============================================================================
echo        DASHBOARD DE MONITOREO DE SISTEMA OPERATIVO NATIVO v2.0
echo ==============================================================================
echo.
echo Iniciando backend de telemetría y abriendo ventana nativa de escritorio...
echo.

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontró 'python' en las variables de entorno PATH.
    echo Asegúrese de tener instalado Python 3.10 o superior y marcado "Add python to PATH".
    echo.
    pause
    exit /b 1
)

python server.py

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] La aplicación se cerró con código %errorlevel%.
    pause
)
