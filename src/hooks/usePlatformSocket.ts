import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlatformState } from '../types/platform';

export function usePlatformSocket() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PlatformState;
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach backend server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();

    let unmounted = false;
    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type: string; data?: PlatformState };
          if (msg.data) {
            setState(msg.data);
            setLoading(false);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [fetchSnapshot]);

  const apiRequest = useCallback(async <T = unknown>(url: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(json.error || `Request failed (${res.status})`);
    }
    return json;
  }, []);

  return {
    state,
    loading,
    connected,
    error,
    refresh: fetchSnapshot,
    post: <T = unknown>(url: string, body?: unknown) => apiRequest<T>(url, 'POST', body),
    patch: <T = unknown>(url: string, body?: unknown) => apiRequest<T>(url, 'PATCH', body),
  };
}
