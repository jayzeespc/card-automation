import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import analyzeRoute from './routes/analyze.js'
import generateTitleRoute from './routes/generatetitle.js'
import generateDescriptionRoute from './routes/generateDescription.js'
import detectFrontBackRoute from './routes/detectFrontBack.js'
import renameRoute from './routes/rename.js'
import inventoryRoute from './routes/inventory.js'
import catalogRoute from './routes/catalog.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDir = path.resolve(__dirname, '..', 'Frontend')
const frontendIndexPath = path.join(frontendDir, 'index.html')
const hasFrontendBundle = fs.existsSync(frontendIndexPath)

const envFile = String(process.env.ENV_FILE || '.env').trim() || '.env'
dotenv.config({ path: path.resolve(process.cwd(), envFile) })

const APP_NAME = String(process.env.APP_NAME || 'CardPilot HQ').trim() || 'CardPilot HQ'
const APP_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase()
const CORS_ORIGIN_RAW = String(process.env.CORS_ORIGIN || '').trim()
const CORS_ORIGINS = CORS_ORIGIN_RAW
  ? CORS_ORIGIN_RAW.split(',').map((entry) => entry.trim()).filter(Boolean)
  : []

const app = express()
app.use(cors(CORS_ORIGINS.length ? { origin: CORS_ORIGINS } : undefined))
app.use(express.json())

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Simple in-process sliding window. Keeps OCR costs bounded during beta.
// Configurable via env: RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS.
// Applies only to OCR-consuming routes (/analyze, /detect-front-back).
const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000)
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30)
const rateStore = new Map() // key → [timestamp, ...]

// ── Daily Azure call counter (cost guardrail observability) ──────────────────
// Counts OCR requests per UTC day. Warns in /diagnostics when approaching the
// configured daily cap. Set AZURE_DAILY_LIMIT to 0 to disable the cap.
const AZURE_DAILY_LIMIT = Number(process.env.AZURE_DAILY_LIMIT || 500)
let azureDailyCount = 0
let azureCountDay = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

function trackAzureCall() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== azureCountDay) { azureDailyCount = 0; azureCountDay = today }
  azureDailyCount += 1
}

function azureDailyBudgetExceeded() {
  if (!AZURE_DAILY_LIMIT) return false
  const today = new Date().toISOString().slice(0, 10)
  if (today !== azureCountDay) return false
  return azureDailyCount >= AZURE_DAILY_LIMIT
}

function rateLimit(req, res, next) {
  const key = req.ip || 'unknown'
  const now = Date.now()
  const window = rateStore.get(key) || []
  const trimmed = window.filter(ts => now - ts < RATE_WINDOW_MS)
  if (trimmed.length >= RATE_MAX) {
    const retryAfterSecs = Math.ceil(RATE_WINDOW_MS / 1000)
    res.set('Retry-After', String(retryAfterSecs))
    return res.status(429).json({
      error: 'Too many requests',
      details: `Max ${RATE_MAX} requests per ${retryAfterSecs}s window. Try again shortly.`
    })
  }
  if (azureDailyBudgetExceeded()) {
    return res.status(429).json({
      error: 'Daily OCR limit reached',
      details: `Azure OCR daily cap of ${AZURE_DAILY_LIMIT} requests reached. Resets at midnight UTC.`
    })
  }
  trimmed.push(now)
  rateStore.set(key, trimmed)
  trackAzureCall()
  next()
}

app.use('/analyze', rateLimit, analyzeRoute)
app.use('/generate-title', generateTitleRoute)
app.use('/generate-description', generateDescriptionRoute)
app.use('/detect-front-back', rateLimit, detectFrontBackRoute)
app.use('/rename', renameRoute)
app.use('/inventory', inventoryRoute)
app.use('/catalog', catalogRoute)
if (hasFrontendBundle) {
  app.use(express.static(frontendDir))
}

function parseBoolean(value) {
  return ['1','true','yes'].includes(String(value || '').toLowerCase())
}

// ── Optional access token guard ───────────────────────────────────────────────
// Set BETA_ACCESS_TOKEN in .env to require "Authorization: Bearer <token>" on all
// non-public routes. Leave unset for local development (no auth required).
const BETA_TOKEN = (process.env.BETA_ACCESS_TOKEN || '').trim()
const PUBLIC_PATHS = new Set(['/', '/health', '/config'])

function betaAuth(req, res, next) {
  if (!BETA_TOKEN) return next() // disabled in local dev
  if (PUBLIC_PATHS.has(req.path)) return next()
  if (req.path.startsWith('/Frontend/') || req.path.match(/\.(js|css|html|ico|png|webp|json)$/i)) return next()
  const auth = req.headers['authorization'] || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (provided === BETA_TOKEN) return next()
  return res.status(401).json({ error: 'Unauthorized', details: 'Valid bearer token required.' })
}

app.use(betaAuth)

app.get('/config', (req, res) => {
  const aiEnabled = Boolean(process.env.AZURE_API_KEY)
  const mockEnabled = parseBoolean(process.env.USE_MOCK_AI)
  res.json({
    aiEnabled,
    mockEnabled,
    app: {
      name: APP_NAME,
      environment: APP_ENV
    }
  })
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend running' })
})

// ── Diagnostics: beta observability surface ───────────────────────────────────
app.get('/diagnostics', (req, res) => {
  const aiEnabled = Boolean(process.env.AZURE_API_KEY)
  const mockEnabled = parseBoolean(process.env.USE_MOCK_AI)
  const betaReadinessPath = path.join(__dirname, 'data', 'reports', 'beta-readiness-latest.json')
  let betaReadiness = null
  try {
    betaReadiness = JSON.parse(fs.readFileSync(betaReadinessPath, 'utf8'))
  } catch { /* file may not exist yet */ }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: {
      name: APP_NAME,
      environment: APP_ENV
    },
    config: { aiEnabled, mockEnabled },
    rateLimit: { windowMs: RATE_WINDOW_MS, maxRequests: RATE_MAX },
    azureCostGuardrail: {
      dailyLimit: AZURE_DAILY_LIMIT || 'unlimited',
      usedToday: azureDailyCount,
      resetDay: azureCountDay,
      limitExceeded: azureDailyBudgetExceeded()
    },
    betaReadiness
  })
})

app.get('/errors/recent', (req, res) => {
  const logPath = path.join(process.cwd(), 'logs', 'analyze-errors.log')
  const limitRows = Math.min(100, Number(req.query.limit || 20))
  try {
    const raw = fs.readFileSync(logPath, 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    const parsed = lines
      .map(line => { try { return JSON.parse(line) } catch { return null } })
      .filter(Boolean)
    res.json({ count: parsed.length, recent: parsed.slice(-limitRows).reverse() })
  } catch {
    res.json({ count: 0, recent: [] })
  }
})

app.get('/', (req, res) => {
  if (hasFrontendBundle) {
    return res.sendFile(frontendIndexPath)
  }
  return res.json({
    status: 'ok',
    message: 'CardPilot HQ backend is running. Frontend is hosted separately.',
    frontend: 'https://jayzeespc.github.io/card-automation/'
  })
})

const DEFAULT_PORT = 3000
const FALLBACK_PORT = 3001
const port = Number(process.env.PORT || DEFAULT_PORT)

function startServer(listenPort) {
  const server = app.listen(listenPort, () => {
    console.log(`${APP_NAME} backend (${APP_ENV}) running on http://localhost:${listenPort}`)
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && listenPort === DEFAULT_PORT) {
      console.warn(`Port ${DEFAULT_PORT} in use, trying ${FALLBACK_PORT}`)
      startServer(FALLBACK_PORT)
      return
    }
    console.error('Server error:', err)
    process.exit(1)
  })
}

startServer(port)
