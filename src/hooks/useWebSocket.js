import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom Hook para gestionar conexiones WebSocket con reconexión automática
 * mediante backoff exponencial (1s, 2s, 4s, 8s hasta un máximo de 16s).
 * 
 * Garantiza la persistencia de datos previos en caso de desconexión (congelamiento de estado)
 * y una limpieza adecuada de recursos (unmount cleanup).
 * 
 * @param {string} url - Dirección del endpoint WebSocket (ej: ws://localhost:8000/ws)
 * @returns {{ status: string, data: any, error: any }}
 */
export function useWebSocket(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('CONNECTING');

  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const isUnmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    // Determinar estado según sea primer intento o reconexión
    setStatus(retryCountRef.current === 0 ? 'CONNECTING' : 'RECONNECTING');

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isUnmountedRef.current) {
          socket.close();
          return;
        }
        setStatus('CONNECTED');
        setError(null);
        retryCountRef.current = 0; // Reiniciar contador tras conexión exitosa
      };

      socket.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch (err) {
          console.error('Error parseando JSON recibido vía WebSocket:', err);
        }
      };

      socket.onerror = (evt) => {
        if (isUnmountedRef.current) return;
        console.warn('Evento de error en WebSocket:', evt);
        setError('Error en el canal WebSocket');
      };

      socket.onclose = (event) => {
        if (isUnmountedRef.current) return;

        setStatus('RECONNECTING');

        // Backoff exponencial: 1s, 2s, 4s, 8s, máx 16s
        const backoffDelay = Math.min(16000, 1000 * Math.pow(2, retryCountRef.current));
        retryCountRef.current += 1;

        console.info(`WebSocket cerrado (código: ${event.code}). Reintentando conexión en ${backoffDelay} ms...`);

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoffDelay);
      };
    } catch (err) {
      console.error('Excepción al instanciar WebSocket:', err);
      setError(err.message || 'Fallo de inicialización');
      setStatus('DISCONNECTED');
    }
  }, [url]);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, data, error };
}

export default useWebSocket;
