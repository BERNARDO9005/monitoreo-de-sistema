# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller Specification File para System Monitor Dashboard v2.0
Empaqueta el backend FastAPI, pywebview, la bandeja pystray y los assets React
en un único ejecutable portable (.exe) nativo para Windows.
"""

from pathlib import Path
import sys

block_cipher = None

# Directorios y archivos embebidos en el binario
datas = [
    ('dist', 'dist'),
    ('payload_schema.json', '.'),
    ('app_icon.ico', '.'),
    ('app_icon.png', '.'),
]

# Dependencias e importaciones dinámicas de Uvicorn, FastAPI, WebView2 y pystray
hidden_imports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.protocols.websockets.websockets_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'fastapi.middleware.cors',
    'fastapi.staticfiles',
    'starlette',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'starlette.staticfiles',
    'websockets',
    'websockets.legacy',
    'websockets.legacy.server',
    'pystray',
    'pystray._win32',
    'PIL',
    'PIL.Image',
    'PIL.ImageDraw',
    'psutil',
    'webview',
    'webview.platforms.winforms',
    'webview.platforms.edgechromium',
    'desktop_manager'
]

# Excluir paquetes de ciencia de datos instalados en el entorno global para un .exe ligero
excludes = [
    'matplotlib',
    'scipy',
    'pandas',
    'pygame',
    'pygame-ce',
    'streamlit',
    'altair',
    'pyarrow',
    'tkinter',
    'PyQt5',
    'notebook',
    'IPython'
]

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='SystemMonitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='app_icon.ico'
)
