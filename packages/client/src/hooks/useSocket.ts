/**
 * Socket.IO client hook — lifecycle-aware wrapper around a module-level singleton.
 *
 * Why singleton? This is a single-page app that navigates between Landing → Classic
 * → Immersive. Recreating the socket on every route mount would drop game-state
 * subscriptions and cause server-side rejoin churn. Instead, one connection lives
 * for the entire tab and components subscribe/unsubscribe to events they care about.
 *
 * Why refactor (v1.1 B1):
 *  - Old code leaked listeners — if a component `socket.on(...)` but forgot `off(...)`
 *    on a code path, the handler stayed pinned to a stale closure forever.
 *  - Connection state (connected/reconnecting/error) was never exposed, so UI
 *    couldn't render an offline banner or disable buttons while disconnected.
 *  - Reconnection config was implicit — now explicit with backoff parameters.
 *  - `useSocket()` was exported but no component used it; everyone called
 *    `getSocket()` directly, bypassing the hook contract entirely.
 *
 * Public API:
 *  - `useSocket()`      → { socket, connected, connecting, error, reconnectAttempt }
 *  - `useSocketEvent`   → register one handler, cleaned up on unmount (zero boilerplate)
 *  - `useSocketEvents`  → register many handlers at once (batch version)
 *  - `getSocket()`      → imperative access for emit-only sites (e.g. keep-alive pings)
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, Socket } from 'socket.io-client';

/* --------------------------------------------------------------------- */
/* Config                                                                */
/* --------------------------------------------------------------------- */

// In dev, Vite proxies /socket.io to localhost:3101.
// In prod or direct access, connect to :3101 directly.
const SOCKET_URL =
  typeof window !== 'undefined' && window.location.port === '5173'
    ? window.location.origin
    : 'http://localhost:3101';

const DEV = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;

const devLog = (...args: unknown[]) => {
  if (DEV) console.log('[Socket]', ...args);
};
const devWarn = (...args: unknown[]) => {
  if (DEV) console.warn('[Socket]', ...args);
};

/* --------------------------------------------------------------------- */
/* Singleton + connection store                                          */
/* --------------------------------------------------------------------- */

interface ConnectionState {
  connected: boolean;
  /** True between initial mount and first `connect` event, or during reconnection. */
  connecting: boolean;
  /** Last error message surfaced by `connect_error`. Cleared on successful connect. */
  error: string | null;
  /** Increments on each reconnect attempt; resets to 0 on successful connect. */
  reconnectAttempt: number;
}

let globalSocket: Socket | null = null;
let state: ConnectionState = {
  connected: false,
  connecting: true,
  error: null,
  reconnectAttempt: 0,
};

// Tiny pub-sub for `useSyncExternalStore` — one subscriber per hook instance.
const listeners = new Set<() => void>();

function setState(next: Partial<ConnectionState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConnectionState {
  return state;
}

function initSocket(): Socket {
  if (globalSocket) return globalSocket;

  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    // Explicit reconnection policy — socket.io-client defaults are sane but opaque.
    // Being explicit here documents intent and survives library upgrades.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,     // start at 1s
    reconnectionDelayMax: 5000,  // cap at 5s
    randomizationFactor: 0.3,    // ±30% jitter — prevents thundering herd on server restart
    timeout: 10_000,             // initial connect timeout
  });

  socket.on('connect', () => {
    devLog('connected', socket.id);
    setState({ connected: true, connecting: false, error: null, reconnectAttempt: 0 });
  });

  socket.on('disconnect', (reason) => {
    devWarn('disconnected:', reason);
    // socket.io auto-reconnects unless `reason === 'io client disconnect'`.
    const willReconnect = reason !== 'io client disconnect';
    setState({ connected: false, connecting: willReconnect });
  });

  socket.on('connect_error', (err) => {
    devWarn('connect_error:', err.message);
    setState({ connected: false, connecting: true, error: err.message });
  });

  // Reconnection telemetry — fired by socket.io-manager events.
  // `io.on('reconnect_attempt', n)` surfaces the attempt counter.
  socket.io.on('reconnect_attempt', (n) => {
    setState({ reconnectAttempt: n, connecting: true });
  });

  socket.io.on('reconnect', (n) => {
    devLog('reconnected after', n, 'attempts');
    setState({ reconnectAttempt: 0, connecting: false, connected: true, error: null });
  });

  socket.io.on('reconnect_failed', () => {
    devWarn('reconnect_failed — giving up');
    setState({ connecting: false, error: 'reconnect_failed' });
  });

  globalSocket = socket;
  return socket;
}

/* --------------------------------------------------------------------- */
/* Public API                                                            */
/* --------------------------------------------------------------------- */

/**
 * Imperative socket accessor. Prefer `useSocket()` in components.
 * Safe for emit-only sites (one-shot fire-and-forget calls from event handlers).
 */
export function getSocket(): Socket {
  return initSocket();
}

/**
 * Primary hook. Returns the live socket plus reactive connection state.
 * Components can render `connected ? … : <ReconnectBanner/>` without manual state.
 */
export function useSocket(): {
  socket: Socket;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  reconnectAttempt: number;
} {
  // Lazy-init on first hook call (SSR-safe because Vite is client-only here).
  const socketRef = useRef<Socket>();
  if (!socketRef.current) socketRef.current = initSocket();

  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    const s = socketRef.current!;
    // If the singleton was manually disconnected elsewhere, reconnect on mount.
    if (!s.connected && !s.active) s.connect();
    // Don't disconnect on unmount — we're a SPA-wide singleton.
  }, []);

  return {
    socket: socketRef.current!,
    connected: snap.connected,
    connecting: snap.connecting,
    error: snap.error,
    reconnectAttempt: snap.reconnectAttempt,
  };
}

/**
 * Register a single socket event handler, cleaned up on unmount.
 * Replaces the on/off boilerplate that litters legacy callsites.
 *
 * @example
 *   useSocketEvent('game:state', (state) => updateState(state));
 */
export function useSocketEvent<TPayload = unknown>(
  event: string,
  handler: (payload: TPayload) => void,
): void {
  // Keep handler ref fresh so consumers can close over latest state without re-registering.
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const socket = initSocket();
    const wrapped = (payload: TPayload) => handlerRef.current(payload);
    socket.on(event, wrapped as (...args: unknown[]) => void);
    return () => {
      socket.off(event, wrapped as (...args: unknown[]) => void);
    };
  }, [event]);
}

/**
 * Bulk-register many socket event handlers at once.
 * Ideal for game routes that listen to 5-10 events.
 *
 * Handlers are indexed by event name; pass a stable object (or memoize it) to
 * avoid unnecessary re-registration. For fully stable registration across a
 * component's lifetime, pass `handlers` constructed once via `useRef`.
 *
 * @example
 *   useSocketEvents({
 *     'game:state':   (state) => updateState(state),
 *     'game:speech':  (data)  => addSpeech(data),
 *     'game:over':    (data)  => handleOver(data),
 *   });
 */
export function useSocketEvents(
  handlers: Record<string, (payload: any) => void>,
): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Register once per event-name-set. Changing the *set* of event names
  // re-registers; changing the handler body does not (we read from ref).
  const eventKey = Object.keys(handlers).sort().join('|');

  useEffect(() => {
    const socket = initSocket();
    const entries = Object.keys(handlersRef.current);
    const wrapped: Record<string, (p: any) => void> = {};
    for (const name of entries) {
      wrapped[name] = (payload: unknown) => handlersRef.current[name]?.(payload);
      socket.on(name, wrapped[name]);
    }
    return () => {
      for (const name of entries) socket.off(name, wrapped[name]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey]);
}

/**
 * Manually disconnect + reset the singleton. Intended for sign-out flows
 * or hot-reload teardown — normal navigation should NOT call this.
 */
export function disconnectSocket(): void {
  if (!globalSocket) return;
  globalSocket.disconnect();
  globalSocket = null;
  setState({ connected: false, connecting: false, error: null, reconnectAttempt: 0 });
}
