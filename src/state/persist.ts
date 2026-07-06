// Local-only persistence (UI-FR30). The canonical store, collected profiles, and
// UI settings survive a reload via browser storage — no sync, no upload (UI-NFR2).
// Every access is guarded: a webview with storage disabled degrades to in-memory
// rather than throwing.

const PREFIX = "agentbridge.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — stay in-memory for this session */
  }
}
