/**
 * Process Manager - Manages starting/stopping the main backend server
 * Runs on port 3333 to avoid conflicts with main backend on 3000
 */

import express from 'express'
import { spawn } from 'child_process'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json())

let backendProcess = null
let isBackendRunning = false

/**
 * Start the backend server process
 */
function startBackend() {
  if (isBackendRunning) {
    console.log('Backend is already running')
    return false
  }

  console.log('Starting backend server...')
  
  backendProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: 'inherit', // Show backend output in console
    shell: true
  })

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err)
    isBackendRunning = false
  })

  backendProcess.on('exit', (code) => {
    console.log(`Backend process exited with code ${code}`)
    isBackendRunning = false
  })

  isBackendRunning = true
  return true
}

/**
 * Stop the backend server process
 */
function stopBackend() {
  if (!isBackendRunning || !backendProcess) {
    console.log('Backend is not running')
    return false
  }

  console.log('Stopping backend server...')
  backendProcess.kill('SIGTERM')
  
  // Force kill after 5 seconds if not graceful
  setTimeout(() => {
    if (isBackendRunning) {
      console.log('Forcing backend process termination...')
      backendProcess.kill('SIGKILL')
    }
  }, 5000)

  isBackendRunning = false
  return true
}

// Endpoint: Get status
app.get('/api/server/status', (req, res) => {
  res.json({
    running: isBackendRunning,
    timestamp: new Date().toISOString()
  })
})

// Endpoint: Start server
app.post('/api/server/start', (req, res) => {
  const success = startBackend()
  res.json({
    success,
    running: isBackendRunning,
    message: success ? 'Backend started' : 'Backend already running'
  })
})

// Endpoint: Stop server
app.post('/api/server/stop', (req, res) => {
  const success = stopBackend()
  res.json({
    success,
    running: isBackendRunning,
    message: success ? 'Backend stopped' : 'Backend was not running'
  })
})

// Start the manager
const MANAGER_PORT = 3333
app.listen(MANAGER_PORT, () => {
  console.log(`\n✓ Process Manager running on http://localhost:${MANAGER_PORT}`)
  console.log('  Frontend can use this to start/stop the backend server')
  console.log(`  POST /api/server/start - Start backend`)
  console.log(`  POST /api/server/stop - Stop backend`)
  console.log(`  GET /api/server/status - Get status\n`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down process manager...')
  if (isBackendRunning) {
    stopBackend()
  }
  process.exit(0)
})
