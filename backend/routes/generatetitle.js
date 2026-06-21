import express from 'express'
import { generateTitle } from '../services/titleGenerator.js'

const router = express.Router()

router.post('/', (req, res) => {
  try {
    const title = generateTitle(req.body)
    res.json({ title })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Title generation failed" })
  }
})

export default router
