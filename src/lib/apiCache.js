const cache = {}

export async function cachedFetch(key, url, ttlMs = 30 * 60 * 1000) {
  const hit = cache[key]
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `API ${res.status}`)
  cache[key] = { data: json, ts: Date.now() }
  return json
}

export function invalidate(key) {
  delete cache[key]
}
