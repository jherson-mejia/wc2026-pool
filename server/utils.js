export function fail(res, error, context) {
  console.error(`[server:${context}]`, error.message ?? error)
  return res.status(500).json({ error: error.message ?? String(error) })
}
