const API_BASE = 'http://localhost:3002';

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
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
