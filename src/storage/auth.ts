import type { TokenProvider } from './drive';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EXPIRY_MARGIN_MS = 60_000;
export const TOKEN_TIMEOUT_MS = 120_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

export interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string }) => void;
  }): { requestAccessToken(o?: { prompt?: string }): void };
}

let gisPromise: Promise<GoogleOAuth2> | null = null;

/** Loads Google Identity Services, the only third-party script the app allows. */
export function loadGis(): Promise<GoogleOAuth2> {
  gisPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    const fail = () => {
      gisPromise = null;
      reject(new Error('Could not load Google sign-in'));
    };
    s.onload = () => {
      const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else fail();
    };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return gisPromise;
}

export function createGoogleTokenProvider(
  clientId: string,
  deps: { loadGis?: () => Promise<GoogleOAuth2>; now?: () => number; tokenTimeoutMs?: number } = {},
): TokenProvider {
  const load = deps.loadGis ?? loadGis;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.tokenTimeoutMs ?? TOKEN_TIMEOUT_MS;
  let token: { value: string; expiresAt: number } | null = null;
  let granted = false;

  const request = async (): Promise<string> => {
    const oauth2 = await load();
    return new Promise<string>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(r.error ?? 'No access token'));
          granted = true;
          token = { value: r.access_token, expiresAt: now() + (r.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS };
          resolve(r.access_token);
        },
        error_callback: (e) => reject(new Error(e.type)),
      });
      client.requestAccessToken({ prompt: granted ? '' : 'consent' });
    });
  };

  /** Bounds script loading plus the popup, so an abandoned or stuck sign-in cannot hold the setup screen. */
  const requestWithTimeout = async (): Promise<string> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Google sign-in timed out')), timeoutMs);
    });
    try {
      return await Promise.race([request(), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  };

  return async ({ forceRefresh, interactive }) => {
    if (!forceRefresh && token && now() < token.expiresAt) return token.value;
    // Only a click may open the Google popup; background syncs use a cached token or stop.
    if (!interactive) throw new Error('Drive needs a click to reconnect');
    return requestWithTimeout();
  };
}
