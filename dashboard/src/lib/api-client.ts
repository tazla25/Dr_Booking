// /home/z/my-project/src/lib/api-client.ts
// Tiny fetch wrapper used by all client components.

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
  })

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // ignore — some endpoints return no body
  }

  if (!res.ok) {
    const err = (data as { error?: string; message?: string }) || {}
    throw new Error(err.message || err.error || `HTTP ${res.status}`)
  }

  return data as T
}
