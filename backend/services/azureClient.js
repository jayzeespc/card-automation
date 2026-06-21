import axios from 'axios'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '../.env'), override: true })

const endpoint = (process.env.AZURE_ENDPOINT || "https://cardvisionextractordocintelligence.cognitiveservices.azure.com").replace(/\/+$/, "")
const apiKey = process.env.AZURE_API_KEY
const modelId = process.env.AZURE_MODEL_ID || "prebuilt-read"
const apiVersionFromEnv = process.env.AZURE_API_VERSION
const configuredApiVersion = apiVersionFromEnv === "2024-12-01" ? "2024-11-30" : apiVersionFromEnv || "2024-11-30"
const fallbackApiVersions = []
const fallbackModels = ["prebuilt-read", "prebuilt-creditCard", "prebuilt-layout"]
const cacheEnabled = !['0', 'false', 'no'].includes(String(process.env.AZURE_CACHE_ENABLED || 'true').toLowerCase())
const cacheDir = path.resolve(__dirname, '../data/cache/azure')

if (!apiKey) {
  console.warn('WARNING: AZURE_API_KEY is not set. AI extraction will fail until the key is configured.')
}
if (!process.env.AZURE_ENDPOINT) {
  console.warn('WARNING: AZURE_ENDPOINT is not set. AI extraction will fail until the endpoint is configured.')
}
if (apiVersionFromEnv === "2024-12-01") {
  console.warn('WARNING: AZURE_API_VERSION 2024-12-01 is not supported for this endpoint. Falling back to 2024-11-30.')
}
console.log(`Azure client configured with endpoint=${endpoint} modelId=${modelId} apiVersion=${configuredApiVersion}`)

function buildAzureAnalyzeUrl(model, apiVersion) {
  if (!endpoint) {
    throw new Error('Azure endpoint is not configured. Set AZURE_ENDPOINT.')
  }

  const url = new URL(`/documentintelligence/documentModels/${model}:analyze`, endpoint)
  url.searchParams.set('api-version', apiVersion)
  return url.toString()
}

async function postToAzure(url, buffer) {
  return axios.post(url, buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Ocp-Apim-Subscription-Key': apiKey,
      Accept: 'application/json'
    },
    timeout: 30000,
    validateStatus: (status) => status >= 200 && status < 300
  })
}

async function getAnalyzeResult(operationLocation) {
  return axios.get(operationLocation, {
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      Accept: 'application/json'
    },
    timeout: 30000
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildCacheKey(buffer) {
  const hash = crypto.createHash('sha1')
  hash.update(buffer)
  hash.update('|')
  hash.update(modelId)
  hash.update('|')
  hash.update(configuredApiVersion)
  return hash.digest('hex')
}

async function readCachedAnalyzeResult(cacheKey) {
  if (!cacheEnabled) return null
  const cachePath = path.join(cacheDir, `${cacheKey}.json`)
  try {
    const payload = await fs.readFile(cachePath, 'utf8')
    const parsed = JSON.parse(payload)
    if (parsed && typeof parsed === 'object') {
      console.log(`Azure cache hit: ${cacheKey}`)
      return parsed
    }
  } catch {
    // Cache miss or invalid cache payload; continue with live request.
  }
  return null
}

async function writeCachedAnalyzeResult(cacheKey, result) {
  if (!cacheEnabled || !result || typeof result !== 'object') return
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    const cachePath = path.join(cacheDir, `${cacheKey}.json`)
    await fs.writeFile(cachePath, JSON.stringify(result), 'utf8')
  } catch (err) {
    console.warn('Failed to write Azure cache entry:', err?.message || err)
  }
}

function isTransientNetworkError(err) {
  const code = String(err?.code || '').toUpperCase()
  const message = String(err?.message || '')
  const status = Number(err?.response?.status || 0)

  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return true
  }

  if (status === 408 || status === 429) return true
  if (status >= 500 && status <= 599) return true

  return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|timeout/i.test(message)
}

async function withRetry(taskName, fn, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || process.env.AZURE_RETRY_ATTEMPTS || 3))
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs || process.env.AZURE_RETRY_BASE_MS || 500))

  let lastError = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const shouldRetry = isTransientNetworkError(err) && attempt < maxAttempts
      if (!shouldRetry) throw err

      const jitter = Math.floor(Math.random() * 150)
      const delayMs = baseDelayMs * (2 ** (attempt - 1)) + jitter
      console.warn(`Azure ${taskName} transient failure (attempt ${attempt}/${maxAttempts}): ${err.message || err}. Retrying in ${delayMs}ms.`)
      await sleep(delayMs)
    }
  }

  throw lastError
}

async function pollAnalyzeResult(operationLocation) {
  const start = Date.now()
  const maxWaitMs = 60000
  const pollIntervalMs = 1000

  while (Date.now() - start < maxWaitMs) {
    const poll = await withRetry('poll', () => getAnalyzeResult(operationLocation), {
      maxAttempts: process.env.AZURE_POLL_RETRY_ATTEMPTS || 3,
      baseDelayMs: process.env.AZURE_POLL_RETRY_BASE_MS || 400
    })
    const data = poll.data || {}
    const status = data.status

    if (status === 'succeeded') {
      return data
    }

    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Azure analyze operation ${status}: ${JSON.stringify(data.error || data)}`)
    }

    await sleep(pollIntervalMs)
  }

  throw new Error('Azure analyze operation timed out while waiting for OCR results')
}

export async function analyzeImage(buffer) {
  if (!apiKey) {
    throw new Error('Azure API key is missing. Set AZURE_API_KEY in environment variables.')
  }

  const cacheKey = buildCacheKey(buffer)
  const cached = await readCachedAnalyzeResult(cacheKey)
  if (cached) return cached

  const url = buildAzureAnalyzeUrl(modelId, configuredApiVersion)
  console.log(`Sending to Azure: ${url}`)
  
  try {
    const startTime = Date.now()
    const submit = await withRetry('submit', () => postToAzure(url, buffer), {
      maxAttempts: process.env.AZURE_SUBMIT_RETRY_ATTEMPTS || 4,
      baseDelayMs: process.env.AZURE_SUBMIT_RETRY_BASE_MS || 600
    })
    const operationLocation = submit.headers?.['operation-location']

    if (operationLocation) {
      const result = await pollAnalyzeResult(operationLocation)
      const duration = Date.now() - startTime
      console.log(`Azure analyze succeeded in ${duration}ms (async)`)
      await writeCachedAnalyzeResult(cacheKey, result)
      return result
    }

    // Some API shapes may return completed results directly.
    const duration = Date.now() - startTime
    console.log(`Azure analyze succeeded in ${duration}ms (direct)`)
    const direct = submit.data || {}
    await writeCachedAnalyzeResult(cacheKey, direct)
    return direct
  } catch (err) {
    const status = err.response?.status
    const data = err.response?.data
    const message = err.message

    console.error(`Azure analyze error:`, {
      status,
      message,
      data: data ? JSON.stringify(data) : null,
      url
    })

    throw new Error(`Azure analyze failed (${status}): ${message}`)
  }
}
