function getApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:3002';

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    return 'http://localhost:3002';
  }

  // In production, use same domain/port as frontend
  return `${window.location.protocol}//${window.location.host}`;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const API_BASE = getApiBase();
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      },
    });

    return response;
  } catch (err) {
    console.error('[apiFetch] Error:', err);
    throw err;
  }
}
