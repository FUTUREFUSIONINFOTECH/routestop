
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformState } from '../types/platform';

// Render backend configuration
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://routestop-9rmb.onrender.com'
).replace(/\/+$/, '');

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  'wss://routestop-9rmb.onrender.com/ws';

export function usePlatformSocket() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // Fetch backend state
  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/state`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as PlatformState;

      setState(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reach backend server'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket connection
  useEffect(() => {
    let unmounted = false;
    let reconnectDelay = 2500;

    const connect = () => {
      if (unmounted) return;

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmounted) return;

          setConnected(true);
          setError(null);
          reconnectDelay = 2500;
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as {
              type?: string;
              data?: PlatformState;
            };

            if (msg.data) {
              setState(msg.data);
              setLoading(false);
            }
          } catch {
            console.warn('Invalid WebSocket message');
          }
        };

        ws.onclose = () => {
          if (unmounted) return;

          setConnected(false);

          reconnectTimerRef.current = window.setTimeout(() => {
            connect();
          }, reconnectDelay);

          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        setConnected(false);

        if (!unmounted) {
          reconnectTimerRef.current = window.setTimeout(
            connect,
            reconnectDelay
          );
        }
      }
    };

    fetchSnapshot();
    connect();

    return () => {
      unmounted = true;

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [fetchSnapshot]);

  // API POST / PATCH requests
  const apiRequest = useCallback(
    async <T = unknown>(
      url: string,
      method: 'POST' | 'PATCH',
      body?: unknown
    ): Promise<T> => {
      const endpoint = url.startsWith('http')
        ? url
        : `${API_BASE_URL}/${url.replace(/^\/+/, '')}`;

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json.error || `Request failed (${res.status})`
        );
      }

      return json as T;
    },
    []
  );

  return {
    state,
    loading,
    connected,
    error,
    refresh: fetchSnapshot,

    post: <T = unknown>(url: string, body?: unknown) =>
      apiRequest<T>(url, 'POST', body),

    patch: <T = unknown>(url: string, body?: unknown) =>
      apiRequest<T>(url, 'PATCH', body),
  };
}
