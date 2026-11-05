"""
Módulo de Gestión de Escritorio y Bandeja del Sistema (Desktop & System Tray)
=============================================================================
Controla la ventana nativa (pywebview), la bandeja del sistema (pystray),
el modo Mini-Widget flotante (Always-on-top) y el ciclo de vida de la aplicación.
"""

import logging
import sys
import time
from pathlib import Path
from typing import Any, Optional

from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger("system-monitor.desktop")

# Determinar directorio base según si corre en script o empaquetado por PyInstaller
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys._MEIPASS)
else:
    BASE_DIR = Path(__file__).resolve().parent

APP_ICON_PATH = BASE_DIR / "app_icon.ico"
APP_PNG_PATH = BASE_DIR / "app_icon.png"


def create_tray_image(cpu_pct: float = 0.0, ram_pct: float = 0.0, size: int = 64) -> Image.Image:
    """
    Genera dinámicamente un icono en alta definición para la bandeja del sistema
    con anillo circular de carga de CPU y color según el umbral de salud.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Selección de color según umbral
    if cpu_pct < 70.0:
        accent_color = (16, 185, 129, 255)  # Emerald (#10b981)
        bg_ring = (6, 78, 59, 180)
    elif cpu_pct <= 90.0:
        accent_color = (245, 158, 11, 255)  # Amber (#f59e0b)
        bg_ring = (120, 53, 15, 180)
    else:
        accent_color = (239, 68, 68, 255)   # Rose/Red (#ef4444)
        bg_ring = (127, 29, 29, 180)

    # Fondo circular oscuro (#0f172a)
    draw.ellipse((2, 2, size - 3, size - 3), fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=2)

    # Anillo base tenue
    draw.ellipse((8, 8, size - 9, size - 9), outline=bg_ring, width=5)

    # Arco de progreso según % de CPU (de 0 a 360 grados, iniciando arriba: -90°)
    pct_clamped = max(0.0, min(100.0, cpu_pct))
    angle = int((pct_clamped / 100.0) * 360)
    if angle > 4:
        draw.arc((8, 8, size - 9, size - 9), start=-90, end=-90 + angle, fill=accent_color, width=5)

    # Núcleo interior con pulso
    pulse_radius = int(size * 0.18)
    cx, cy = size // 2, size // 2
    draw.ellipse((cx - pulse_radius, cy - pulse_radius, cx + pulse_radius, cy + pulse_radius), fill=accent_color)

    return img


class WindowController:
    """Administra el estado de la ventana de escritorio, el modo Widget y la bandeja."""

    def __init__(self) -> None:
        self.window: Optional[Any] = None
        self.server: Optional[Any] = None
        self.is_desktop: bool = False
        self.mode: str = "normal"  # "normal" | "widget"
        self.on_top: bool = False
        self.minimize_to_tray_on_close: bool = True
        self.tray_icon: Optional[Any] = None
        self.last_tray_update: float = 0.0
        self._notified_tray: bool = False

    def set_window(self, window: Any, server: Any) -> None:
        self.window = window
        self.server = server
        self.is_desktop = True
        logger.info("Controlador de escritorio vinculado a ventana nativa.")

    def set_mode(self, mode: str) -> None:
        """Conmuta entre modo normal (dashboard completo) y modo mini-widget compacto."""
        if mode not in ("normal", "widget"):
            return

        self.mode = mode
        if not self.window:
            return

        try:
            if mode == "widget":
                self.on_top = True
                self.window.on_top = True
                self.window.resize(360, 270)
                logger.info("Ventana ajustada a Modo Mini-Widget (360x270, Always-on-top=True)")
            else:
                self.on_top = False
                self.window.on_top = False
                self.window.resize(1280, 850)
                logger.info("Ventana restaurada a Modo Normal (1280x850, Always-on-top=False)")
        except Exception as exc:
            logger.error("Error al cambiar modo de ventana: %s", exc)

    def set_on_top(self, on_top: bool) -> None:
        """Fija o desfija la ventana para mantenerse siempre visible sobre otras aplicaciones."""
        self.on_top = on_top
        if self.window:
            try:
                self.window.on_top = on_top
                logger.info("Ventana Always-on-top: %s", on_top)
            except Exception as exc:
                logger.error("Error configurando Always-on-top: %s", exc)

    def show(self) -> None:
        """Muestra y restaura la ventana si estaba oculta o minimizada."""
        if self.window:
            try:
                self.window.show()
                self.window.restore()
            except Exception as exc:
                logger.error("Error mostrando ventana: %s", exc)

    def hide_to_tray(self) -> None:
        """Oculta la ventana y la envía a la bandeja del sistema."""
        if self.window:
            try:
                self.window.hide()
                if self.tray_icon and not self._notified_tray:
                    try:
                        self.tray_icon.notify(
                            "System Monitor continúa ejecutándose en segundo plano. Haz clic en el icono para abrirlo.",
                            "Minimizado a la Bandeja"
                        )
                        self._notified_tray = True
                    except Exception:
                        pass
            except Exception as exc:
                logger.error("Error ocultando ventana a bandeja: %s", exc)

    def quit_application(self) -> None:
        """Cierre ordenado y total de la aplicación, el servidor y el icono de bandeja."""
        logger.info("Deteniendo System Monitor Desktop por completo...")
        self.minimize_to_tray_on_close = False

        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
            self.tray_icon = None

        if self.window:
            try:
                self.window.destroy()
            except Exception:
                pass

        if self.server:
            self.server.should_exit = True

    def update_tray(self, cpu_pct: float, ram_pct: float, down_mb: float) -> None:
        """Actualiza el icono de bandeja y tooltip si ha transcurrido suficiente tiempo."""
        if not self.tray_icon:
            return

        now = time.time()
        # Limitar actualizaciones a cada 1.5 segundos para no sobrecargar el hilo UI de Windows
        if now - self.last_tray_update < 1.5:
            return
        self.last_tray_update = now

        try:
            tooltip = f"System Monitor: CPU {cpu_pct:.0f}% | RAM {ram_pct:.0f}% | Red: {down_mb:.1f} MB/s"
            self.tray_icon.title = tooltip
            new_img = create_tray_image(cpu_pct, ram_pct, size=64)
            self.tray_icon.icon = new_img
        except Exception as exc:
            logger.debug("Error actualizando icono de bandeja: %s", exc)

    def setup_tray(self) -> bool:
        """Inicializa el icono de la bandeja del sistema en Windows usando pystray."""
        try:
            import pystray

            initial_img = create_tray_image(0.0, 0.0, size=64)

            def on_open(icon, item):
                self.show()

            def on_widget_mode(icon, item):
                self.set_mode("widget")
                self.show()

            def on_normal_mode(icon, item):
                self.set_mode("normal")
                self.show()

            def on_toggle_on_top(icon, item):
                self.set_on_top(not self.on_top)

            def on_quit(icon, item):
                self.quit_application()

            menu = pystray.Menu(
                pystray.MenuItem("🖥️ Abrir Dashboard", on_open, default=True),
                pystray.MenuItem("📌 Modo Mini-Widget", on_widget_mode),
                pystray.MenuItem("🗖 Modo Completo", on_normal_mode),
                pystray.MenuItem("🔒 Siempre Visible", on_toggle_on_top, checked=lambda item: self.on_top),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("❌ Salir", on_quit)
            )

            self.tray_icon = pystray.Icon(
                name="system_monitor",
                icon=initial_img,
                title="System Monitor Dashboard",
                menu=menu
            )

            # Ejecutar en hilo desacoplado
            self.tray_icon.run_detached()
            logger.info("Icono de bandeja del sistema inicializado correctamente.")
            return True
        except Exception as exc:
            logger.warning("No se pudo inicializar la bandeja del sistema: %s", exc)
            self.tray_icon = None
            return False


window_controller = WindowController()
