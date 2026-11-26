
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformState } from '../types/platform';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'https://routestop-9rmb.onrender.com'
).replace(/\/+$/, '');

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  'wss://routestop-9rmb.onrender.com/ws';


function getApiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

function getWebSocketUrl(): string {
  return (
    import.meta.env.VITE_WS_URL ||
    'wss://routestop-9rmb.onrender.com/ws'
  );
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Server returned invalid JSON (HTTP ${res.status}). ` +
      `Check API endpoint: ${res.url}. Response: ${text.slice(0, 150)}`
    );
  }

  if (!res.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Request failed with HTTP ${res.status}`
    );
  }

  return data as T;
}

export function usePlatformSocket() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl('/api/state'), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await parseResponse<PlatformState>(res);

      setState(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to backend'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unmounted = false;

    fetchSnapshot();

    const connect = () => {
      if (unmounted) return;

      try {
        const ws = new WebSocket(getWebSocketUrl());

        wsRef.current = ws;

        ws.onopen = () => {
          if (!unmounted) {
            setConnected(true);
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as {
              type: string;
              data?: PlatformState;
            };

            if (msg.data) {
              setState(msg.data);
              setLoading(false);
              setError(null);
            }
          } catch {
            console.warn('Invalid WebSocket message:', event.data);
          }
        };

        ws.onclose = () => {
          if (unmounted) return;

          setConnected(false);

          reconnectTimerRef.current = window.setTimeout(
            connect,
            5000
          );
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.error('WebSocket connection error:', err);

        reconnectTimerRef.current = window.setTimeout(
          connect,
          5000
        );
      }
    };

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

  const apiRequest = useCallback(
    async <T = unknown>(
      url: string,
      method: 'POST' | 'PATCH',
      body?: unknown
    ): Promise<T> => {
      const res = await fetch(getApiUrl(url), {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body:
          body !== undefined
            ? JSON.stringify(body)
            : undefined,
      });

      return parseResponse<T>(res);
    },
    []
  );

  const post = useCallback(
    <T = unknown>(url: string, body?: unknown) =>
      apiRequest<T>(url, 'POST', body),
    [apiRequest]
  );

  const patch = useCallback(
    <T = unknown>(url: string, body?: unknown) =>
      apiRequest<T>(url, 'PATCH', body),
    [apiRequest]
  );

  return {
    state,
    loading,
    connected,
    error,
    refresh: fetchSnapshot,
    post,
    patch,
  };
}
