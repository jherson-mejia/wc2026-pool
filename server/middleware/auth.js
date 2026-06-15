import { createHmac, timingSafeEqual } from 'node:crypto'

export function adminOnly(req, res, next) {
  const pw = req.headers['x-admin-password']
  if (!pw || pw !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

// Signature = HMAC-SHA256(TRIVIA_SECRET, "{userId}:{promptId}:{timestamp}")
// Timestamp must be within ±5 minutes to prevent replay attacks.
export function triviaOnly(req, res, next) {
  if (!process.env.TRIVIA_SECRET) return res.status(503).json({ error: 'Trivia not configured' })
  const { userId, promptId, timestamp, signature } = req.body ?? {}
  if (!timestamp || !signature) return res.status(401).json({ error: 'Missing signature' })
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return res.status(401).json({ error: 'Request expired' })
  const expected = createHmac('sha256', process.env.TRIVIA_SECRET)
    .update(`${userId}:${promptId}:${timestamp}`)
    .digest('hex')
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }
  next()
}
