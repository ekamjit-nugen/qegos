// Access token in memory (never persisted to disk — XSS safe)
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string): void {
  accessToken = token;
}

// Refresh token in localStorage (persists across page reloads)
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') { return null; }
  return localStorage.getItem('qegos_refresh_token');
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') { return; }
  localStorage.setItem('qegos_refresh_token', token);
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('qegos_refresh_token');
  }
}
