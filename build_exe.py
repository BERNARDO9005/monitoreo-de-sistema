"""
Script de Automatización de Empaquetado para System Monitor Dashboard
===================================================================
Compila el frontend con Vite, genera los iconos de alta definición y
construye el ejecutable standalone (.exe) mediante PyInstaller.
"""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DIST_REACT = ROOT_DIR / "dist"
DIST_EXE = ROOT_DIR / "dist-exe"
BUILD_TEMP = ROOT_DIR / "build-exe"
ICON_ICO = ROOT_DIR / "app_icon.ico"


def run_command(cmd: str, description: str) -> bool:
    print(f"\n[+] {description}...")
    start_t = time.time()
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=str(ROOT_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace"
        )
        elapsed = time.time() - start_t
        if proc.returncode == 0:
            print(f"[OK] {description} completado en {elapsed:.2f}s")
            return True
        else:
            print(f"[ERROR] Falló {description} (código {proc.returncode}):")
            print(proc.stdout)
            return False
    except Exception as exc:
        print(f"[EXCEPCIÓN] {description}: {exc}")
        return False


def build_all():
    print("=" * 65)
    print("  COMPILADOR AUTOMÁTICO: System Monitor Dashboard v2.0 (.exe)")
    print("=" * 65)

    # 1. Generar iconos si no existen
    if not ICON_ICO.is_file():
        success = run_command(f'"{sys.executable}" generate_app_icon.py', "Generando iconos nativos (ICO / PNG)")
        if not success:
            print("[ERROR] No se pudieron generar los iconos.")
            sys.exit(1)
    else:
        print("[i] Icono app_icon.ico detectado.")

    # 2. Compilar Frontend React con Vite
    print("\n[+] Verificando build de React en dist/...")
    cmd_build = 'cmd.exe /c "npm run build"' if os.name == 'nt' else 'npm run build'
    success = run_command(cmd_build, "Compilando Frontend React (Vite)")
    if not success:
        print("[AVISO] Falló npm run build; se continuará si dist/ ya existía...")
        if not (DIST_REACT / "index.html").is_file():
            print("[ERROR] dist/index.html no existe. Es requerido para el build.")
            sys.exit(1)

    # 3. Limpiar compilaciones anteriores en dist-exe si existen
    if DIST_EXE.is_dir():
        print(f"\n[+] Limpiando directorio de distribución previo ({DIST_EXE})...")
        try:
            shutil.rmtree(DIST_EXE, ignore_errors=True)
        except Exception:
            pass

    # 4. Ejecutar PyInstaller con SystemMonitor.spec
    spec_file = ROOT_DIR / "SystemMonitor.spec"
    pyinstaller_cmd = f'"{sys.executable}" -m PyInstaller --clean --noconfirm --distpath "{DIST_EXE}" --workpath "{BUILD_TEMP}" "{spec_file}"'
    success = run_command(pyinstaller_cmd, "Empaquetando con PyInstaller (Onefile .exe)")
    if not success:
        print("[ERROR] Falló la generación del ejecutable.")
        sys.exit(1)

    # 5. Validar resultado final
    final_exe = DIST_EXE / "SystemMonitor.exe"
    if final_exe.is_file():
        size_mb = final_exe.stat().st_size / (1024 * 1024)
        print("\n" + "=" * 65)
        print("  ¡COMPILACIÓN EXITOSA!")
        print("=" * 65)
        print(f" Ejecutable generado : {final_exe}")
        print(f" Tamaño del archivo   : {size_mb:.2f} MB")
        print("\n Caracteristicas integradas:")
        print("  [OK] Backend FastAPI + Uvicorn + WebSockets a 500 ms")
        print("  [OK] Interfaz React completa compilada (Dark Mode + Recharts)")
        print("  [OK] Ventana nativa WebView2 (sin consola, modo GUI nativo)")
        print("  [OK] Minimizado a la Bandeja del Sistema (System Tray con pystray)")
        print("  [OK] Modo Mini-Widget flotante (Always-on-top de 360x270)")
        print("  [OK] Administrador de procesos con Kill Process seguro")
        print("  [OK] Icono de telemetría dinámico en bandeja")
        print("=" * 65)
    else:
        print(f"[ERROR] No se encontró el ejecutable esperado en {final_exe}")
        sys.exit(1)


if __name__ == "__main__":
    build_all()
