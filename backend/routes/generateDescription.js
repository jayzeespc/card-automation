import express from 'express'
import { generateDescription } from '../services/descriptionGenerator.js'

const router = express.Router()

router.post('/', (req, res) => {
  try {
    const description = generateDescription(req.body)
    res.json({ description })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Description generation failed' })
  }
})

export default router
