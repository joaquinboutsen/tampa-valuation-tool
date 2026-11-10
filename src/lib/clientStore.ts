/**
 * Small helpers for remembering choices within one browser tab (session
 * storage), so the tabs of a company agree with each other. Storage can be
 * unavailable (private windows), so every call is guarded and optional.
 */

export function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* not essential */
  }
}

export const peersKey = (ticker: string) => `peers:${ticker}`;
