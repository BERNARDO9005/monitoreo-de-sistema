# Dashboard de Monitoreo de Sistema Operativo Nativo v2.0

Dashboard de telemetría de sistema de grado producción, ultraligero y modular en **Dark Mode** (`#0f172a`), con medición a bajo nivel, latencia ultra-baja (500 ms) y comunicación bidireccional mediante **WebSockets**.

---

## 🏛️ Arquitectura del Sistema

```mermaid
graph TD
    A["Núcleo del SO / Hardware (CPU, RAM, Discos, Interfaces de Red)"] --> B["psutil (Muestreo no bloqueante)"]
    B --> C["SystemMetricsCollector (server.py)"]
    C --> D["Evaluador de Umbrales (ok / warning / critical)"]
    D --> E["FastAPI WebSocket Server (/ws)"]
    E -->|"Broadcast concurrente (500 ms)"| F["Clientes Conectados (Set de WebSockets)"]
    F --> G["React Frontend (Vite + Tailwind CSS + Recharts)"]
    F --> H["Mini-Widget HUD (360x270 Always-on-top)"]
    F --> I["Dashboard Embebido Nativo (http://localhost:8000)"]
    C --> J["desktop_manager.py"]
    J --> K["System Tray (pystray con telemetría en vivo)"]
    J --> L["Ventana Nativa Edge WebView2 (pywebview)"]
```

---

## 📊 Especificación de Módulos y Reglas de Negocio

### 1. Unidad Central de Procesamiento (CPU)
* **Porcentaje de uso global:** Carga actual del procesador calculada en modo no bloqueante.
* **Frecuencia (GHz):** Frecuencia dinámica actual vs. máxima (`psutil.cpu_freq()`). En entornos virtualizados o sin soporte del gobernador, conmuta limpiamente a `null`.
* **Temperatura (°C):** Lectura del paquete térmico (`psutil.sensors_temperatures()`). En Windows nativo conmuta a `null` de forma segura.
* **Desglose por Núcleo (Core Breakdown):** Matriz visual interactiva por cada núcleo/hilo lógico para detectar cuellos de botella monohilo (*single-thread bottlenecks*).

### 2. Memoria de Acceso Aleatorio (RAM)
* **Memoria Física:** Uso actual vs. total en GB y %.
* **Memoria Swap/Paginación:** Uso actual vs. total en GB y % para detectar saturación de memoria y prevenir degradación por trashing.

### 3. Almacenamiento (HDD/SSD)
* **Particiones Principales:** Detección dinámica de puntos de montaje (`C:`, `D:`, `/`, etc.) con espacio total, usado y libre. Manejo con `try/except (PermissionError, OSError)` para ignorar automáticamente unidades extraíbles o CD-ROMs vacíos.
* **Tasa de transferencia I/O:** Lectura y escritura en MB/s calculadas por diferencial de tiempo ($\Delta t$).
* **Tiempo de actividad del disco (%):** Porcentaje del tiempo que el disco procesa peticiones de I/O.

### 4. Interfaz de Red (Internet / LAN)
* **Ancho de banda en tiempo real:** Velocidad consolidada de bajada (*Download*) y subida (*Upload*) en MB/s y KB/s.
* **Agregación inteligente:** Suma el tráfico únicamente de interfaces de red físicas activas (`isup=True` y con IP asignada), excluyendo adaptadores loopback y virtuales desconectados.
* **Estadísticas de paquetes:** Monitoreo dinámico del porcentaje de paquetes perdidos (*drop rate %*) y recuento de errores de transmisión/recepción.

### 5. Administrador de Procesos del Sistema (Top Processes)
* **Ranking Top 10 en Vivo:** Monitoreo continuo de los procesos con mayor impacto en el sistema, intercambiable entre **Top 10 CPU** y **Top 10 Memoria RAM**.
* **Información Detallada:** Visualización en tiempo real de PID, Nombre, Usuario propietario (`SYSTEM`, usuario de dominio o local), % CPU con micro-gráfico de carga y Memoria RAM ocupada en MB con % del total del sistema.
* **Buscador y Filtro Rápido:** Capacidad de búsqueda instantánea por nombre de ejecutable (ej. `chrome`, `node`, `python`), PID o usuario en todos los procesos activos del sistema operativo mediante endpoint `/api/processes?q=...`.
* **Terminación Controlada y Segura (Kill Process):** Botón de cierre forzado con diálogo modal de confirmación, validación de procesos protegidos del kernel (PID <= 4) y notificaciones Toast flotantes de éxito o error.

### 6. Experiencia de Escritorio y Distribución Nativa (v2.1)
* **Bandeja del Sistema (System Tray con pystray):**
  * Al cerrar o minimizar la ventana, la aplicación se oculta elegantemente en el área de notificación junto al reloj de Windows.
  * **Icono dinámico de telemetría:** El icono de la bandeja actualiza su indicador circular en tiempo real con colores de salud (Verde/Ámbar/Rojo) y expone en su tooltip la carga de CPU, RAM y Red.
  * **Menú contextual rápido:** Opciones con clic derecho para Abrir Dashboard, Conmutar Modo Mini-Widget, Modo Completo, Alternar Siempre Visible (Always-on-top) y Salir totalmente.
* **Modo Mini-Widget Flotante ("Always-on-top"):**
  * Vista HUD compacta de **360x270 px** diseñada para flotar fijada sobre juegos, editores de código (VS Code) o terminales.
  * Muestra micro-tarjetas con CPU (uso % y GHz), RAM (uso % y GB), Disco I/O y Red (bajada/subida en vivo), junto con el proceso de mayor consumo en ejecución.
  * Botones integrados para alternar *Always-on-top* (fijado), restaurar a pantalla completa o minimizar a la bandeja.
* **Compilación en Ejecutable Único (.exe Portable):**
  * Empaquetado optimizado mediante **PyInstaller** (`SystemMonitor.spec`) que genera un archivo ejecutable autónomo `dist-exe/SystemMonitor.exe`.
  * No requiere que el usuario final tenga instalados Python ni Node.js.
  * Incluye automáticamente el frontend React compilado, el servidor FastAPI, el motor WebView2, los iconos nativos de alta definición y el gestor de bandeja.

---

## 🚨 Matriz de Umbrales y Alertas

| Métrica | OK (Verde) | Warning (Ámbar) | Critical (Rojo) |
| :--- | :--- | :--- | :--- |
| **Temperatura CPU** | `< 70 °C` | `70 – 80 °C` | `> 80 °C` |
| **Uso de CPU** | `< 70 %` | `70 – 90 %` | `> 90 %` |
| **Uso de RAM** | `< 70 %` | `70 – 90 %` | `> 90 %` |
| **Uso de Swap** | `< 30 %` | `30 – 50 %` | `> 50 %` |
| **Espacio en Disco** | `< 80 %` | `80 – 95 %` | `> 95 %` |
| **Tiempo Activo Disco** | `< 60 %` | `60 – 85 %` | `> 85 %` |
| **Paquetes Perdidos Red** | `0.0 %` | `0.1 – 5.0 %` | `> 5.0 %` |

---

## 🛠️ Requisitos Previos

* **Python 3.10 o superior** (verificado en Python 3.10+ y 3.14+).
* **Node.js 18+ y npm** (para compilar y ejecutar el cliente React con Vite).
* Sistema operativo: **Windows, Linux o macOS**.

---

## 🚀 Guía de Instalación y Ejecución Local

### Paso 1: Clonar o situarse en el directorio del proyecto
```bash
cd C:\proyecto1
```

### Paso 2: Entorno Virtual e Instalación del Backend (Python)
Es recomendable utilizar un entorno virtual:
```powershell
# Crear entorno virtual (opcional pero recomendado)
python -m venv venv
.\venv\Scripts\activate

# Instalar dependencias exactas
python -m pip install -r requirements.txt
```

### Paso 3: Iniciar la Aplicación Nativa de Escritorio
Puedes iniciar la aplicación de dos formas muy sencillas:

#### Opción A: Mediante doble clic en Windows
* Haz doble clic sobre [iniciar_dashboard.bat](file:///C:/proyecto1/iniciar_dashboard.bat) (con consola informativa) o sobre [iniciar_dashboard_silencioso.vbs](file:///C:/proyecto1/iniciar_dashboard_silencioso.vbs) (directo sin ventana de consola).

#### Opción B: Mediante PowerShell o Terminal
```powershell
python server.py
```
*Esto arrancará automáticamente el backend y abrirá una **ventana de escritorio nativa de Windows** (Edge WebView2) con la interfaz React completa, gráficos en tiempo real y aceleración por hardware.*

> **💡 Modo Servidor Únicamente (Headless / Sin ventana gráfica):**
> Si prefieres ejecutar solo el servidor web en segundo plano para acceder desde navegadores o remotamente:
> ```powershell
> python server.py --server-only
> ```
> Opcionalmente puedes definir puerto y host personalizados: `python server.py --server-only --port 8080 --host 0.0.0.0`.

---

### Paso 4: Entorno de Desarrollo Frontend React (Opcional para desarrolladores)
Si deseas modificar los componentes de React o estilos en vivo con Hot Module Replacement (HMR):
```powershell
# Iniciar servidor de desarrollo Vite
npm run dev

# Para compilar una nueva versión de producción en dist/
npm run build
```

---

## 📡 Endpoints del Backend

* `GET /`: Dashboard principal (React compilado de alta fidelidad con Recharts).
* `GET /embedded`: Dashboard ligero embebido standalone (HTML5 puro sin dependencias).
* `GET /health`: Comprobación de estado y conteo de clientes activos.
* `GET /metrics/current`: Instantánea REST de todas las métricas en JSON.
* `GET /api/processes?q=...`: Búsqueda instantánea en todos los procesos activos del SO.
* `POST /api/processes/{pid}/kill`: Finalización segura y controlada de un proceso (con protección de kernel).
* `GET /api/window/status`: Estado de la ventana nativa (modo actual, Always-on-top, soporte de bandeja).
* `POST /api/window/mode`: Conmuta dinámicamente entre modo `normal` y `widget` (Mini-Widget flotante).
* `POST /api/window/pin`: Activa o desactiva la fijación permanente al frente (*Always-on-top*).
* `POST /api/window/minimize`: Oculta la ventana y la envía al área de notificación de Windows (System Tray).
* `WS /ws`: Canal WebSocket bidireccional con difusión periódica de 500 ms y control de ventana.

---

## 📦 Compilación a Ejecutable Standalone (.exe Portable)

Para distribuir la aplicación a cualquier usuario de Windows sin necesidad de que instale Python, Node.js ni dependencias:

1. **Vía Doble Clic:**
   * Haz doble clic sobre [compilar_exe.bat](file:///C:/proyecto1/compilar_exe.bat).
2. **Vía Terminal:**
   ```powershell
   python build_exe.py
   ```
El binario resultante se generará en **`dist-exe\SystemMonitor.exe`** (~40 MB), listo para ser copiado o transportado en una memoria USB.

---

## 🛡️ Resistencia a Desconexiones y Gestión de Memoria

1. **Backoff Exponencial en Frontend:** `useWebSocket.js` reintenta automáticamente con intervalos de 1s, 2s, 4s, 8s hasta un tope de 16s.
2. **Congelamiento de Estado (Anti-Flicker):** Si la conexión con el backend se interrumpe, el estado visual se congela sin borrar los buffers ni poner valores a cero, desplegando un banner de advertencia superior.
3. **Búfer Fijo contra Fugas de Memoria:** Los gráficos temporales de CPU y Red limitan estrictamente su tamaño a **60 puntos** (30 segundos) mediante `slice(-60)`, garantizando un consumo de RAM constante e infinitamente estable en el navegador.
