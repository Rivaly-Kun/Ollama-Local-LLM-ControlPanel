// ── Auth Key Management Service ──────────────────────────────────────
// Fetches, updates, and generates API keys via the backend.

const BASE = '/api';

/** Fetch the current auth key from the backend */
export async function fetchAuthKey(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/authkey`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.api_key === 'string' ? data.api_key : null;
  } catch {
    return null;
  }
}

/** Update the auth key in Firebase via the backend */
export async function updateAuthKey(newKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const currentKey = await fetchAuthKey();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentKey) {
      headers['Authorization'] = `Bearer ${currentKey}`;
    }

    const res = await fetch(`${BASE}/authkey`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ api_key: newKey }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Generate a cryptographically secure random key */
export function generateRandomKey(length: number = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_!@#$%&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}
