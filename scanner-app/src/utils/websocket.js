/**
 * WebSocket client helper
 * Connects to the backend WebSocket server for real-time updates
 */

const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = import.meta.env.VITE_WS_URL || `${defaultWsProtocol}//${window.location.hostname}:3001`;

let ws = null;
let reconnectTimer = null;
let listeners = {};

export function connectWebSocket(onMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Connected to server');
      if (listeners.onConnect) listeners.onConnect();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessage) onMessage(data);
      } catch (e) {
        console.warn('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected. Reconnecting in 3s...');
      if (listeners.onDisconnect) listeners.onDisconnect();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connectWebSocket(onMessage), 3000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };
  } catch (e) {
    console.error('[WS] Connection failed:', e);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connectWebSocket(onMessage), 3000);
  }
}

export function disconnectWebSocket() {
  clearTimeout(reconnectTimer);
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function onWsEvent(event, callback) {
  listeners[event] = callback;
}

export function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}
