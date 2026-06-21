import fs from 'fs'
import path from 'path'

const sources = [
  {
    slug: '2025-donruss-optic-football',
    brand: 'Panini',
    setName: 'Donruss Optic',
    year: '2025',
    htmlPath: 'data/checklists/raw/2025-donruss-optic-football-beckett.html'
  },
  {
    slug: '2025-panini-select-football',
    brand: 'Panini',
    setName: 'Select',
    year: '2025',
    htmlPath: 'data/checklists/raw/2025-panini-select-football-beckett.html'
  }
]

function decodeHtmlEntities(input) {
  return String(input || '')
    .replace(/&#038;|&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
  )
}

function splitLines(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
}

function extractArticleHtml(html) {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i)
  if (articleMatch && articleMatch[0]) return articleMatch[0]

  const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
  return bodyMatch ? bodyMatch[0] : html
}

function parseCardLine(line) {
  const clean = decodeHtmlEntities(line)

  // Patterns like "1 Patrick Mahomes, Kansas City Chiefs"
  const numberFirst = clean.match(/^#?([A-Z]{0,3}\d{1,4}[A-Z]?)\s+(.+?)\s*(?:,|-|\|)\s*(.+)$/)
  if (numberFirst) {
    return {
      cardNumber: numberFirst[1],
      player: numberFirst[2].trim(),
      team: numberFirst[3].trim()
    }
  }

  // Patterns like "#1 Patrick Mahomes"
  const shortPattern = clean.match(/^#?([A-Z]{0,3}\d{1,4}[A-Z]?)\s+([A-Za-z .'-]{3,50})$/)
  if (shortPattern) {
    return {
      cardNumber: shortPattern[1],
      player: shortPattern[2].trim(),
      team: ''
    }
  }

  return null
}

function inferChecklistRows(lines) {
  const rows = []
  const seen = new Set()

  for (const line of lines) {
    if (!/^#?[A-Z]{0,3}\d{1,4}[A-Z]?\s+/.test(line)) continue
    const card = parseCardLine(line)
    if (!card) continue

    const key = `${card.cardNumber}|${card.player}|${card.team}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(card)
  }

  return rows
}

function writeJson(filePath, payload) {
  const content = JSON.stringify(payload, null, 2)
  fs.writeFileSync(filePath, content, 'utf8')
}

function main() {
  const outDir = path.join(process.cwd(), 'data', 'checklists', 'imports')
  fs.mkdirSync(outDir, { recursive: true })

  for (const source of sources) {
    const htmlFile = path.join(process.cwd(), source.htmlPath)
    const html = fs.readFileSync(htmlFile, 'utf8')
    const articleHtml = extractArticleHtml(html)
    const text = stripTags(articleHtml)
    const lines = splitLines(text)

    const cards = inferChecklistRows(lines)

    const payload = {
      source: 'beckett',
      sourceUrl: `https://www.beckett.com/news/${source.slug}-cards/`,
      set: {
        sport: 'Football',
        year: source.year,
        brand: source.brand,
        setName: source.setName,
        notes: 'Parsed from publicly available checklist article text.'
      },
      cards
    }

    const outFile = path.join(outDir, `${source.slug}.json`)
    writeJson(outFile, payload)

    console.log(`${source.slug}: extracted ${cards.length} cards -> ${path.relative(process.cwd(), outFile)}`)
  }
}

main()
