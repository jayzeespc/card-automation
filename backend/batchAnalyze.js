import fs from 'fs'
import path from 'path'

const dir = 'D:/Sport Cards/Scanned from Epson/Football/Arizona Cardinals'
const files = fs.readdirSync(dir).filter(f => /\.jpe?g$/i.test(f))
if (!files.length) {
  console.error('No jpg files found in', dir)
  process.exit(1)
}

for (const f of files) {
  const full = path.join(dir, f)
  console.log('Posting', full)
  try {
    const fd = new FormData()
    fd.append('image', fs.createReadStream(full), f)
    const res = await fetch('http://localhost:3001/analyze', { method: 'POST', body: fd })
    const body = await res.text()
    console.log(JSON.stringify({ file: f, status: res.status, body }))
  } catch (err) {
    console.error('Error posting', f, err.stack || err.message || err)
  }
}
