import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { analyzeCardBuffer } from '../services/cardAnalyzer.js'

const router = express.Router()
const upload = multer()

function writeStructuredErrorLog(context, err) {
  try {
    const logDir = path.join(process.cwd(), 'logs')
    fs.mkdirSync(logDir, { recursive: true })
    const logPath = path.join(logDir, 'analyze-errors.log')
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      context,
      error: err?.message || String(err),
      stack: err?.stack || null,
      azureStatus: err?.response?.status || null,
      azureData: err?.response?.data || null
    }) + '\n'
    fs.appendFileSync(logPath, entry)
  } catch (logErr) {
    console.error('Failed to write analyze error log:', logErr)
  }
}

router.post('/', upload.single('image'), async (req, res) => {
  try {
    // If mock mode is enabled, always return deterministic mock data (useful for development)
    const mockEnabled = ['1','true','yes'].includes(String(process.env.USE_MOCK_AI || '').toLowerCase())
    if (mockEnabled) {
      const mock = {
        player: 'John Doe',
        team: 'Mockers',
        position: 'WR',
        set: 'Mock Set',
        year: '2020',
        cardNumber: '1',
        parallel: ''
      }
      res.json(mock)
      return
    }

    // If no file was uploaded, return an error
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No image uploaded' })
    }

    console.log(`Analyze request received file=${req.file.originalname} bytes=${req.file.buffer.length}`)

    console.log('Analyze mode: SINGLE_PASS_WITH_FALLBACK_VARIANTS')
    const parsed = await analyzeCardBuffer(req.file.buffer, { sport: 'Football' })

    const hasParsedData = Object.values(parsed).some(Boolean)
    if (!hasParsedData) {
      // Keep preview attached for low-confidence responses too.
    }

    console.log('Parsed single-pass result:', JSON.stringify(parsed).substring(0, 300))
    res.json(parsed)
  } catch (err) {
    console.error('Analyze route error:', err.stack || err)
    writeStructuredErrorLog({
      route: '/analyze',
      file: req.file?.originalname || null,
      fileBytes: req.file?.buffer?.length || null
    }, err)
    const details = err.response?.data || err.message || 'Azure analyze failed'
    res.status(500).json({ error: 'Azure analyze failed', details })
  }
})

export default router
