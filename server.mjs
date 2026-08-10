// server.mjs (repo root)
// VPS version — one small Express server that BOTH serves your built Vite
// site (./dist) and exposes the same POST /api/contact endpoint the
// frontend uses on Vercel. The React code doesn't change between hosts.
//
// Setup on the VPS:
//   npm ci                       (installs express + dotenv from package.json)
//   npm run build                (produces dist/)
//   RESEND_API_KEY=re_xxx CONTACT_TO=you@gmail.com node server.mjs
//
// Keep it alive with pm2:
//   pm2 start server.mjs --name portfolio --update-env
// Then point nginx at http://127.0.0.1:3000 (or set PORT).

import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')

const PORT = process.env.PORT || 3000
const MAX_NAME = 100
const MAX_EMAIL = 200
const MAX_MESSAGE = 5000

// Naive in-memory rate limit: 5 transmissions per IP per 10 minutes.
// Plenty for a portfolio; resets on restart.
const hits = new Map()
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 10 * 60 * 1000

function rateLimited(ip) {
  const now = Date.now()
  const entry = hits.get(ip) ?? []
  const recent = entry.filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

const app = express()
app.use(compression())
app.use(express.json({ limit: '32kb' }))

app.post('/api/contact', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' })

  const { name = '', from = '', payload = '', website = '' } = req.body ?? {}

  // Honeypot — bots fill it, humans can't see it. Pretend success, drop it.
  if (website) return res.status(200).json({ ok: true })

  const cleanName = String(name).trim().slice(0, MAX_NAME)
  const cleanFrom = String(from).trim().slice(0, MAX_EMAIL)
  const cleanMsg = String(payload).trim().slice(0, MAX_MESSAGE)

  if (!cleanMsg) return res.status(400).json({ error: 'empty_payload' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanFrom)) {
    return res.status(400).json({ error: 'invalid_return_address' })
  }

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.CONTACT_TO
  if (!apiKey || !to) {
    console.error('Missing RESEND_API_KEY or CONTACT_TO env variable')
    return res.status(500).json({ error: 'server_not_configured' })
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'Portfolio Uplink <onboarding@resend.dev>',
        to: [to],
        reply_to: cleanFrom,
        subject: `[uplink] ${cleanName || 'New transmission'}`,
        text: [
          cleanMsg,
          '',
          '—',
          `from: ${cleanName || 'anonymous'}`,
          `return_address: ${cleanFrom}`,
        ].join('\n'),
      }),
    })

    if (!r.ok) {
      console.error('Resend error:', r.status, await r.text())
      return res.status(502).json({ error: 'delivery_failed' })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Contact handler error:', err)
    res.status(500).json({ error: 'delivery_failed' })
  }
})

// Static site + SPA fallback. A path-less app.use (rather than
// app.get('*', ...)) sidesteps Express 5's stricter wildcard route syntax
// (path-to-regexp no longer accepts a bare '*') — this form works
// unchanged across Express 4 and 5.
//
// Cache-Control split in two:
//  - /assets/* (Vite's hashed JS/CSS bundles) — the filename changes on
//    every content change, so it's safe to cache for a year and never
//    revalidate.
//  - everything else (models/animations/logos passed through from
//    public/, plus index.html) — filenames don't change when the content
//    does, so cache for a day and let the browser revalidate rather than
//    risk serving a stale asset indefinitely.
app.use(
  '/assets',
  express.static(path.join(DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
  })
)
app.use(
  express.static(DIST, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      }
    },
  })
)
app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

app.listen(PORT, () => {
  console.log(`portfolio up on http://localhost:${PORT}`)
})
