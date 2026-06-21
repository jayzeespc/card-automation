import express from 'express'
import { generateFilename } from '../services/filenameGenerator.js'

const router = express.Router()

router.post('/', (req, res) => {
  try {
    const filename = generateFilename(req.body)
    res.json({ filename })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Filename generation failed" })
  }
})

export default router
