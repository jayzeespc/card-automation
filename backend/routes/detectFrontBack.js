import express from 'express'
import multer from 'multer'
import { detectFrontBack } from '../services/frontBackDetector.js'

const router = express.Router()
const upload = multer()

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const side = await detectFrontBack(req.file.buffer)
    res.json({ side })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Front/back detection failed" })
  }
})

export default router
