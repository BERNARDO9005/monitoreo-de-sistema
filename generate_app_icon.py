"""
Generador de iconos para System Monitor Dashboard.
Crea app_icon.ico y app_icon.png con estética Dark Mode y telemetría en alta fidelidad.
"""
from PIL import Image, ImageDraw
from pathlib import Path

def create_base_icon(size: int = 256) -> Image.Image:
    # Crear imagen RGBA transparente
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    pad = int(size * 0.06)
    radius = int(size * 0.22)
    
    # 1. Fondo squircle oscuro (#0f172a) con degradado o borde
    # Borde exterior cyan sutil
    draw.rounded_rectangle(
        [pad - 2, pad - 2, size - pad + 2, size - pad + 2],
        radius=radius,
        outline=(56, 189, 248, 180), # sky-400
        width=int(max(2, size * 0.02))
    )
    # Relleno del contenedor principal (#0f172a)
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(15, 23, 42, 255) # slate-900
    )
    
    # 2. Rejilla estilizada de procesador / radar (sutil)
    grid_color = (30, 41, 59, 140) # slate-800
    grid_step = int(size * 0.14)
    cx, cy = size // 2, size // 2
    for offset in range(-2, 3):
        x = cx + offset * grid_step
        y = cy + offset * grid_step
        draw.line([x, pad + 12, x, size - pad - 12], fill=grid_color, width=1)
        draw.line([pad + 12, y, size - pad - 12, y], fill=grid_color, width=1)
        
    # Anillo central de pulso
    ring_radius = int(size * 0.28)
    draw.ellipse(
        [cx - ring_radius, cy - ring_radius, cx + ring_radius, cy + ring_radius],
        outline=(30, 58, 138, 200),
        width=int(max(1, size * 0.02))
    )
    
    # 3. Onda de telemetría / ECG cardíaco / onda de pulso
    # Puntos normalizados de la onda (de izquierda a derecha)
    # y base en cy
    points = [
        (pad + int(size * 0.08), cy),
        (cx - int(size * 0.24), cy),
        (cx - int(size * 0.16), cy + int(size * 0.06)),
        (cx - int(size * 0.08), cy - int(size * 0.28)),  # Pico hacia arriba
        (cx, cy + int(size * 0.22)),                     # Valle hacia abajo
        (cx + int(size * 0.08), cy - int(size * 0.10)),  # Pico secundario
        (cx + int(size * 0.16), cy),
        (size - pad - int(size * 0.08), cy)
    ]
    
    # Dibujar resplandor (glow) verde esmeralda (#10b981)
    glow_width = int(max(4, size * 0.055))
    draw.line(points, fill=(16, 185, 129, 90), width=glow_width, joint="curve")
    
    # Línea principal nítida verde esmeralda brillante (#34d399)
    main_width = int(max(2, size * 0.028))
    draw.line(points, fill=(52, 211, 153, 255), width=main_width, joint="curve")
    
    # 4. Puntos / nodos brillantes en los picos
    node_r = int(max(3, size * 0.035))
    peak_points = [points[3], points[4], points[5]]
    for px, py in peak_points:
        draw.ellipse([px - node_r, py - node_r, px + node_r, py + node_r], fill=(56, 189, 248, 255))
        draw.ellipse([px - node_r + 2, py - node_r + 2, px + node_r - 2, py + node_r - 2], fill=(255, 255, 255, 255))
        
    return img

def generate_icons(base_dir: Path):
    icon_256 = create_base_icon(256)
    png_path = base_dir / "app_icon.png"
    ico_path = base_dir / "app_icon.ico"
    
    # Guardar PNG en alta resolución
    icon_256.save(png_path, format="PNG")
    
    # Guardar ICO con múltiples capas
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_layers = [create_base_icon(s[0]) for s in sizes]
    icon_256.save(ico_path, format="ICO", sizes=sizes)
    print(f"Iconos generados exitosamente:\n - {png_path}\n - {ico_path}")

if __name__ == "__main__":
    current_dir = Path(__file__).resolve().parent
    generate_icons(current_dir)
