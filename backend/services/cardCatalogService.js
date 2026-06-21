import sqlite3 from 'sqlite3'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'
import xlsx from 'xlsx'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.resolve(__dirname, '..', 'data')
const sqlitePath = path.join(dataDir, 'catalog.db')
const inventorySqlitePath = path.join(dataDir, 'inventory.db')

let db = null
let initPromise = null

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(sqlitePath, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function tempDbGet(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const tempDb = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        reject(openErr)
        return
      }

      tempDb.get(sql, params, (err, row) => {
        tempDb.close(() => {})
        if (err) reject(err)
        else resolve(row)
      })
    })
  })
}

function tempDbAll(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const tempDb = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        reject(openErr)
        return
      }

      tempDb.all(sql, params, (err, rows) => {
        tempDb.close(() => {})
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  })
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function safeString(value) {
  return String(value || '').trim()
}

function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeTemplateType(value) {
  const raw = safeString(value).toLowerCase().replace(/[_\s]+/g, '-')
  if (!raw) return 'single'
  if (raw === 'variation' || raw === 'pick-your-own' || raw === 'pick-your-own-card' || raw === 'pyc' || raw === 'pick-your-own-card-listing') {
    return 'pick-your-own'
  }
  if (raw === 'mystery' || raw === 'mystery-pack' || raw === 'mystery-packs' || raw === 'mysterypack') {
    return 'mystery-pack'
  }
  if (raw === 'pick_your_own') return 'pick-your-own'
  return raw
}

function getTemplateProfile(templateType) {
  const normalized = normalizeTemplateType(templateType)

  if (normalized === 'pick-your-own') {
    return {
      listingType: 'variation',
      titleLabel: 'Pick Your Own Card',
      defaultQuantity: 10,
      requiresMultipleCards: false,
      requiresChaseCard: false
    }
  }

  if (normalized === 'lot') {
    return {
      listingType: 'lot',
      titleLabel: 'Lot',
      defaultQuantity: 1,
      requiresMultipleCards: true,
      requiresChaseCard: false
    }
  }

  if (normalized === 'bulk') {
    return {
      listingType: 'bulk',
      titleLabel: 'Quantity Listing',
      defaultQuantity: 25,
      requiresMultipleCards: true,
      requiresChaseCard: false
    }
  }

  if (normalized === 'mystery-pack') {
    return {
      listingType: 'mystery-pack',
      titleLabel: 'Mystery Pack',
      defaultQuantity: 20,
      requiresMultipleCards: true,
      requiresChaseCard: true
    }
  }

  return {
    listingType: 'single',
    titleLabel: 'Single Card',
    defaultQuantity: 1,
    requiresMultipleCards: false,
    requiresChaseCard: false
  }
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/)
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }

  return []
}

function summarizeCard(card) {
  if (!card) return null
  return {
    id: card.id,
    cardNumber: card.cardNumber,
    player: card.player,
    team: card.team,
    position: card.position,
    parallel: card.parallel,
    rookie: card.rookie,
    sport: card.sport,
    year: card.year,
    brand: card.brand,
    setName: card.setName
  }
}

function buildCardTitleParts(card) {
  return [card?.year, card?.brand, card?.setName, card?.player, card?.cardNumber ? `#${card.cardNumber}` : '', card?.parallel]
    .map(v => safeString(v))
    .filter(Boolean)
}

function buildVariationLabel(card) {
  const parts = [card?.player, card?.cardNumber ? `#${card.cardNumber}` : '', card?.parallel]
    .map(v => safeString(v))
    .filter(Boolean)
  return parts.join(' ')
}

const DEFAULT_LISTING_TEMPLATES = [
  {
    name: 'Single Card Fixed Price',
    templateType: 'single',
    ebayFormat: 'FixedPrice',
    defaults: { quantity: 1, bestOfferEnabled: true, duration: 'GTC' }
  },
  {
    name: 'Pick Your Own Card',
    templateType: 'pick-your-own',
    ebayFormat: 'FixedPrice',
    defaults: { quantity: 10, variationName: 'Pick Your Own Card', bestOfferEnabled: true, duration: 'GTC' }
  },
  {
    name: 'Lot Listing',
    templateType: 'lot',
    ebayFormat: 'FixedPrice',
    defaults: { quantity: 1, lotSize: 5, bestOfferEnabled: true, duration: 'GTC' }
  },
  {
    name: 'Mystery Pack',
    templateType: 'mystery-pack',
    ebayFormat: 'FixedPrice',
    defaults: { quantity: 20, packSize: 1, chaseRequired: true, bestOfferEnabled: false, duration: 'GTC' }
  },
  {
    name: 'Bulk Inventory Multi-Qty',
    templateType: 'bulk',
    ebayFormat: 'FixedPrice',
    defaults: { quantity: 25, lotSize: 1, bestOfferEnabled: true, duration: 'GTC' }
  }
]

async function ensureDefaultListingTemplates() {
  const now = new Date().toISOString()

  for (const tpl of DEFAULT_LISTING_TEMPLATES) {
    const existing = await dbGet(
      'SELECT id FROM listing_templates WHERE lower(name) = lower(?) OR lower(templateType) = lower(?) LIMIT 1',
      [tpl.name, tpl.templateType]
    )

    if (existing) continue

    await dbRun(
      `INSERT INTO listing_templates (id, name, templateType, ebayFormat, defaultsJson, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [randomUUID(), tpl.name, tpl.templateType, tpl.ebayFormat, JSON.stringify(tpl.defaults), now, now]
    )
  }
}

function cleanPlayerName(value) {
  return String(value || '').replace(/,+\s*$/, '').replace(/\s+/g, ' ').trim()
}

function normalizeCardNumber(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

function bitCountInt(n) {
  let c = 0
  let x = n >>> 0
  while (x) {
    x &= x - 1
    c += 1
  }
  return c
}

export function hammingDistanceHex64(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return 64

  let dist = 0
  for (let i = 0; i < 16; i += 8) {
    const la = parseInt(left.slice(i, i + 8), 16)
    const rb = parseInt(right.slice(i, i + 8), 16)
    dist += bitCountInt((la ^ rb) >>> 0)
  }
  return dist
}

export async function computeDHashFromBuffer(buffer) {
  const { data, info } = await sharp(buffer)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })

  const bits = []
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x]
      const right = data[y * 9 + x + 1]
      bits.push(left > right ? 1 : 0)
    }
  }

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
    hex += nibble.toString(16)
  }

  return {
    dhash: hex,
    width: Number(info?.width || 0),
    height: Number(info?.height || 0)
  }
}

export async function computeDHashFromPath(localPath) {
  const file = await fs.readFile(localPath)
  return computeDHashFromBuffer(file)
}

export async function initializeCatalogDatabase() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      await fs.mkdir(dataDir, { recursive: true })
      await openDatabase()

    await dbRun('PRAGMA journal_mode = WAL')
    await dbRun('PRAGMA synchronous = NORMAL')

    await dbRun(`
      CREATE TABLE IF NOT EXISTS catalog_sets (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        year TEXT,
        brand TEXT,
        setName TEXT NOT NULL,
        source TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_sets_unique ON catalog_sets (sport, year, brand, setName)')

    await dbRun(`
      CREATE TABLE IF NOT EXISTS catalog_cards (
        id TEXT PRIMARY KEY,
        setId TEXT NOT NULL,
        cardNumber TEXT,
        player TEXT,
        team TEXT,
        position TEXT,
        parallel TEXT,
        rookie TEXT,
        normalizedFingerprint TEXT NOT NULL,
        attributesJson TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (setId) REFERENCES catalog_sets(id) ON DELETE CASCADE
      )
    `)

    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_cards_unique ON catalog_cards (setId, cardNumber, player, parallel)')
    await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_cards_setId ON catalog_cards (setId)')

    await dbRun(`
      CREATE TABLE IF NOT EXISTS catalog_images (
        id TEXT PRIMARY KEY,
        cardId TEXT NOT NULL,
        source TEXT,
        sourceUrl TEXT,
        localPath TEXT,
        licenseStatus TEXT,
        width INTEGER,
        height INTEGER,
        qualityScore REAL,
        dhash TEXT,
        ocrPreview TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (cardId) REFERENCES catalog_cards(id) ON DELETE CASCADE
      )
    `)

      await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_images_cardId ON catalog_images (cardId)')
      await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_images_dhash ON catalog_images (dhash)')
      await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_cards_number ON catalog_cards (cardNumber)')
      await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_cards_player ON catalog_cards (player)')

      const imageColumns = await dbAll('PRAGMA table_info(catalog_images)')
      const imageColumnNames = new Set(imageColumns.map(col => String(col.name || '').toLowerCase()))
      if (!imageColumnNames.has('dhashprefix2')) {
        await dbRun('ALTER TABLE catalog_images ADD COLUMN dhashPrefix2 TEXT')
        await dbRun("UPDATE catalog_images SET dhashPrefix2 = lower(substr(dhash, 1, 2)) WHERE dhash IS NOT NULL AND length(dhash) >= 2")
      }
      await dbRun('CREATE INDEX IF NOT EXISTS idx_catalog_images_dhashPrefix2 ON catalog_images (dhashPrefix2)')

      await dbRun(`
      CREATE TABLE IF NOT EXISTS listing_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        templateType TEXT NOT NULL,
        ebayFormat TEXT NOT NULL,
        defaultsJson TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

      await ensureDefaultListingTemplates()
    } catch (err) {
      initPromise = null
      throw err
    }
  })()

  return initPromise
}

function cardFingerprint(card) {
  return [
    normalize(card?.cardNumber),
    normalize(card?.player),
    normalize(card?.team),
    normalize(card?.parallel)
  ].join('|')
}

export async function upsertSet(setInput) {
  await initializeCatalogDatabase()

  const sport = safeString(setInput?.sport) || 'Football'
  const year = safeString(setInput?.year)
  const brand = safeString(setInput?.brand)
  const setName = safeString(setInput?.setName || setInput?.name)
  if (!setName) throw new Error('setName is required')

  const source = safeString(setInput?.source)
  const notes = safeString(setInput?.notes)
  const now = new Date().toISOString()

  const existing = await dbGet(
    `SELECT * FROM catalog_sets WHERE sport = ? AND year = ? AND brand = ? AND setName = ?`,
    [sport, year, brand, setName]
  )

  if (existing) {
    await dbRun(
      `UPDATE catalog_sets
       SET source = ?, notes = ?, updatedAt = ?
       WHERE id = ?`,
      [source || existing.source, notes || existing.notes, now, existing.id]
    )
    return { ...existing, source: source || existing.source, notes: notes || existing.notes, updatedAt: now }
  }

  const created = {
    id: randomUUID(),
    sport,
    year,
    brand,
    setName,
    source,
    notes,
    createdAt: now,
    updatedAt: now
  }

  await dbRun(
    `INSERT INTO catalog_sets (id, sport, year, brand, setName, source, notes, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [created.id, created.sport, created.year, created.brand, created.setName, created.source, created.notes, created.createdAt, created.updatedAt]
  )

  return created
}

export async function listSets(filter = {}) {
  await initializeCatalogDatabase()

  const sport = safeString(filter?.sport)
  const params = []
  let sql = 'SELECT * FROM catalog_sets'
  if (sport) {
    sql += ' WHERE lower(sport) = lower(?)'
    params.push(sport)
  }
  sql += ' ORDER BY year DESC, brand ASC, setName ASC'

  return dbAll(sql, params)
}

export async function bulkUpsertChecklist(setInput, cards = []) {
  await initializeCatalogDatabase()
  const setRow = await upsertSet(setInput)

  let inserted = 0
  let updated = 0

  await dbRun('BEGIN')
  try {
    for (const card of cards) {
      const cardNumber = safeString(card?.cardNumber || card?.CardNumber)
      const player = safeString(card?.player || card?.Name)
      const team = safeString(card?.team || card?.Team)
      const position = safeString(card?.position || card?.Position)
      const parallel = safeString(card?.parallel || card?.Parallel)
      const rookie = safeString(card?.rookie || card?.Rookie)
      const attributes = card?.attributes && typeof card.attributes === 'object' ? card.attributes : {}
      const normalizedFingerprint = cardFingerprint({ cardNumber, player, team, parallel })
      const now = new Date().toISOString()

      const existing = await dbGet(
        `SELECT * FROM catalog_cards
         WHERE setId = ? AND cardNumber = ? AND player = ? AND parallel = ?`,
        [setRow.id, cardNumber, player, parallel]
      )

      if (existing) {
        await dbRun(
          `UPDATE catalog_cards
           SET team = ?, position = ?, rookie = ?, normalizedFingerprint = ?, attributesJson = ?, updatedAt = ?
           WHERE id = ?`,
          [team || existing.team, position || existing.position, rookie || existing.rookie, normalizedFingerprint, JSON.stringify(attributes), now, existing.id]
        )
        updated += 1
      } else {
        await dbRun(
          `INSERT INTO catalog_cards
           (id, setId, cardNumber, player, team, position, parallel, rookie, normalizedFingerprint, attributesJson, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), setRow.id, cardNumber, player, team, position, parallel, rookie, normalizedFingerprint, JSON.stringify(attributes), now, now]
        )
        inserted += 1
      }
    }
    await dbRun('COMMIT')
  } catch (err) {
    await dbRun('ROLLBACK')
    throw err
  }

  const totals = await dbGet('SELECT COUNT(1) AS count FROM catalog_cards WHERE setId = ?', [setRow.id])
  return {
    set: setRow,
    inserted,
    updated,
    setCardTotal: Number(totals?.count || 0)
  }
}

async function findCardIdByRef(cardRef = {}) {
  if (cardRef?.cardId) {
    const row = await dbGet('SELECT id FROM catalog_cards WHERE id = ?', [String(cardRef.cardId)])
    return row?.id || null
  }

  const setId = safeString(cardRef?.setId)
  const cardNumber = safeString(cardRef?.cardNumber)
  const player = safeString(cardRef?.player)
  const parallel = safeString(cardRef?.parallel)
  if (!setId || !cardNumber || !player) return null

  const row = await dbGet(
    `SELECT id FROM catalog_cards
     WHERE setId = ? AND cardNumber = ? AND player = ? AND parallel = ?`,
    [setId, cardNumber, player, parallel]
  )
  return row?.id || null
}

export async function bulkUpsertImages(items = []) {
  await initializeCatalogDatabase()

  let inserted = 0
  let skipped = 0

  await dbRun('BEGIN')
  try {
    for (const item of items) {
      const cardId = await findCardIdByRef(item?.cardRef)
      if (!cardId) {
        skipped += 1
        continue
      }

      const source = safeString(item?.source)
      const sourceUrl = safeString(item?.sourceUrl)
      const localPath = safeString(item?.localPath)
      const licenseStatus = safeString(item?.licenseStatus || 'unknown')
      const qualityScore = safeNumber(item?.qualityScore, 0)
      const ocrPreview = safeString(item?.ocrPreview)
      let dhash = safeString(item?.dhash)
      let dhashPrefix2 = ''
      let width = safeNumber(item?.width, 0)
      let height = safeNumber(item?.height, 0)

      if (!dhash && localPath) {
        try {
          const computed = await computeDHashFromPath(localPath)
          dhash = computed.dhash
          dhashPrefix2 = String(computed.dhash || '').slice(0, 2).toLowerCase()
          width = computed.width
          height = computed.height
        } catch {
          // Keep ingestion resilient if image files are unavailable.
        }
      }

      if (!dhashPrefix2 && /^[0-9a-f]{16}$/i.test(dhash)) {
        dhashPrefix2 = dhash.slice(0, 2).toLowerCase()
      }

      const now = new Date().toISOString()
      await dbRun(
        `INSERT INTO catalog_images
         (id, cardId, source, sourceUrl, localPath, licenseStatus, width, height, qualityScore, dhash, dhashPrefix2, ocrPreview, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), cardId, source, sourceUrl, localPath, licenseStatus, width, height, qualityScore, dhash, dhashPrefix2, ocrPreview, now, now]
      )
      inserted += 1
    }
    await dbRun('COMMIT')
  } catch (err) {
    await dbRun('ROLLBACK')
    throw err
  }

  return { inserted, skipped }
}

function scoreMatch(distance, qualityScore = 0) {
  const visual = Math.max(0, (64 - distance) / 64)
  const qualityBoost = Math.max(0, Math.min(0.1, (Number(qualityScore) || 0) / 1000))
  return Number((visual + qualityBoost).toFixed(4))
}

export async function matchCardImage(buffer, options = {}) {
  await initializeCatalogDatabase()

  const { dhash } = await computeDHashFromBuffer(buffer)
  const sportFilter = safeString(options?.sport)

  const baseSql = `
    SELECT
      i.id AS imageId,
      i.dhash,
      i.dhashPrefix2,
      i.qualityScore,
      i.source,
      i.sourceUrl,
      i.localPath,
      c.id AS cardId,
      c.cardNumber,
      c.player,
      c.team,
      c.position,
      c.parallel,
      c.rookie,
      s.id AS setId,
      s.sport,
      s.year,
      s.brand,
      s.setName
    FROM catalog_images i
    JOIN catalog_cards c ON c.id = i.cardId
    JOIN catalog_sets s ON s.id = c.setId
  `

  const params = []
  const whereParts = []

  if (sportFilter) {
    whereParts.push('lower(s.sport) = lower(?)')
    params.push(sportFilter)
  }

  const queryPrefix2 = String(dhash || '').slice(0, 2).toLowerCase()
  const prefixParts = [...whereParts, 'i.dhashPrefix2 = ?']
  const prefixParams = [...params, queryPrefix2]
  const prefixWhere = prefixParts.length ? `WHERE ${prefixParts.join(' AND ')}` : ''
  const fullWhere = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''

  const prefixedRows = await dbAll(
    `${baseSql} ${prefixWhere} ORDER BY i.qualityScore DESC, i.createdAt DESC LIMIT 3000`,
    prefixParams
  )

  const rows = prefixedRows.length >= 40
    ? prefixedRows
    : await dbAll(
      `${baseSql} ${fullWhere} ORDER BY i.qualityScore DESC, i.createdAt DESC LIMIT 6000`,
      params
    )

  const scored = rows
    .filter(row => /^[0-9a-f]{16}$/i.test(String(row.dhash || '')))
    .map((row) => {
      const distance = hammingDistanceHex64(dhash, row.dhash)
      return {
        distance,
        score: scoreMatch(distance, row.qualityScore),
        imageId: row.imageId,
        source: row.source,
        sourceUrl: row.sourceUrl,
        localPath: row.localPath,
        card: {
          id: row.cardId,
          cardNumber: row.cardNumber,
          player: row.player,
          team: row.team,
          position: row.position,
          parallel: row.parallel,
          rookie: row.rookie
        },
        set: {
          id: row.setId,
          sport: row.sport,
          year: row.year,
          brand: row.brand,
          setName: row.setName
        }
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return {
    queryDHash: dhash,
    queryPrefix2,
    candidatePoolSize: rows.length,
    candidates: scored,
    best: scored[0] || null
  }
}

function parseSetInfoFromFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase()
  const yearMatch = base.match(/(19\d{2}|20\d{2})/)
  const year = yearMatch ? yearMatch[1] : ''
  const sport = /football/.test(base) ? 'Football' : ''

  if (/donruss/.test(base) && /optic/.test(base)) {
    return { sport, year, brand: 'Panini', setName: 'Donruss Optic' }
  }

  if (/select/.test(base)) {
    return { sport, year, brand: 'Panini', setName: 'Select' }
  }

  if (/topps/.test(base) && /signature/.test(base) && /class/.test(base)) {
    return { sport, year, brand: 'Topps', setName: 'Signature Class' }
  }

  return { sport, year, brand: '', setName: '' }
}

function parseSetInfoFromDisplayName(label) {
  const value = safeString(label).replace(/\s+football$/i, '').trim()
  const match = value.match(/^(\d{4}(?:-\d{4})?)\s+(.+)$/)
  const year = match?.[1] || ''
  const remainder = safeString(match?.[2] || value)

  if (/^panini\s+donruss\s+optic$/i.test(remainder)) {
    return { sport: 'Football', year, brand: 'Panini', setName: 'Donruss Optic' }
  }

  if (/^panini\s+select$/i.test(remainder)) {
    return { sport: 'Football', year, brand: 'Panini', setName: 'Select' }
  }

  if (/^topps\s+signature\s+class$/i.test(remainder)) {
    return { sport: 'Football', year: year === '2026' ? '2025-2026' : year, brand: 'Topps', setName: 'Signature Class' }
  }

  const tokens = remainder.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    return {
      sport: 'Football',
      year,
      brand: tokens[0],
      setName: tokens.slice(1).join(' ')
    }
  }

  return { sport: 'Football', year, brand: '', setName: remainder }
}

export function parseChecklistCardsFromXlsx(filePath, options = {}) {
  const workbook = xlsx.readFile(filePath)
  const preferredSheet = safeString(options?.sheetName || 'Base')
  const sheetName = workbook.SheetNames.find(n => String(n).toLowerCase() === preferredSheet.toLowerCase()) || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`No worksheet found in file: ${filePath}`)
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  const cards = []
  const seen = new Set()

  let section = ''
  for (const row of rows) {
    const c0 = String(row[0] ?? '').trim()
    const c1 = String(row[1] ?? '').trim()
    const c2 = String(row[2] ?? '').trim()

    if (/^base\s*-\s*(concourse|premier level|club level|suite level|field level|rated rookies)$/i.test(c0)) {
      section = c0.replace(/^base\s*-\s*/i, '').trim()
      continue
    }

    if (/^(concourse|premier level|club level|suite level|field level|rated rookies)$/i.test(c0)) {
      section = c0.trim()
      continue
    }

    if (!/^\d{1,4}[A-Z]?$/.test(c0)) continue
    if (!c1) continue

    const cardNumber = normalizeCardNumber(c0)
    const player = cleanPlayerName(c1)
    const team = cleanPlayerName(c2)
    const key = `${cardNumber}|${normalize(player)}|${normalize(team)}|${normalize(section)}`
    if (!player || seen.has(key)) continue

    seen.add(key)
    cards.push({
      cardNumber,
      player,
      team,
      attributes: section ? { section } : {}
    })
  }

  return {
    sheetName,
    totalRows: rows.length,
    cards
  }
}

export async function importChecklistFromXlsx(input = {}) {
  await initializeCatalogDatabase()

  const filePathRaw = safeString(input?.filePath)
  if (!filePathRaw) throw new Error('filePath is required')

  const filePath = path.isAbsolute(filePathRaw)
    ? filePathRaw
    : path.join(process.cwd(), filePathRaw)

  const fromName = parseSetInfoFromFilename(filePath)
  const set = {
    sport: safeString(input?.set?.sport || fromName.sport || 'Football'),
    year: safeString(input?.set?.year || fromName.year),
    brand: safeString(input?.set?.brand || fromName.brand),
    setName: safeString(input?.set?.setName || fromName.setName),
    source: safeString(input?.set?.source || 'checklist_xlsx'),
    notes: safeString(input?.set?.notes || `Imported from XLSX ${path.basename(filePath)}`)
  }

  if (!set.setName) throw new Error('set.setName is required (or inferable from file name)')

  const parsed = parseChecklistCardsFromXlsx(filePath, { sheetName: input?.sheetName || 'Base' })
  if (!parsed.cards.length) {
    throw new Error(`No checklist cards parsed from ${path.basename(filePath)} (${parsed.sheetName})`)
  }

  const result = await bulkUpsertChecklist(set, parsed.cards)
  return {
    ...result,
    import: {
      filePath,
      sheetName: parsed.sheetName,
      parsedRows: parsed.totalRows,
      parsedCards: parsed.cards.length
    }
  }
}

export async function importChecklistManifest(manifestPath) {
  await initializeCatalogDatabase()

  const absoluteManifestPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(process.cwd(), manifestPath)
  const content = await fs.readFile(absoluteManifestPath, 'utf8')
  const manifest = JSON.parse(content)
  const downloads = Array.isArray(manifest?.downloads) ? manifest.downloads : []

  const imported = []
  const skipped = []
  for (const item of downloads) {
    const file = safeString(item?.file)
    const displayInfo = parseSetInfoFromDisplayName(item?.set)

    if (displayInfo.setName) {
      await upsertSet({
        ...displayInfo,
        source: safeString(item?.status) === 'not_found' ? 'checklist_manifest_placeholder' : 'checklist_manifest',
        notes: safeString(item?.sourceUrl || item?.file || '')
      })
    }

    if (!file || !/\.xlsx$/i.test(file)) {
      skipped.push({ set: item?.set || '', reason: 'not an xlsx file' })
      continue
    }

    try {
      const result = await importChecklistFromXlsx({ filePath: file })
      imported.push({
        set: item?.set || result?.set?.setName || '',
        file,
        inserted: result.inserted,
        updated: result.updated,
        setCardTotal: result.setCardTotal
      })
    } catch (err) {
      skipped.push({ set: item?.set || '', file, reason: err.message || 'import failed' })
    }
  }

  return { imported, skipped }
}

function scoreFieldMatch(input, row) {
  const wantedCardNumber = normalizeCardNumber(input?.cardNumber)
  const wantedPlayer = normalize(input?.player)
  const wantedTeam = normalize(input?.team)
  const wantedSet = normalize(input?.set)
  const wantedYear = safeString(input?.year)
  const wantedParallel = normalize(input?.parallel)

  const rowCardNumber = normalizeCardNumber(row.cardNumber)
  const rowPlayer = normalize(row.player)
  const rowTeam = normalize(row.team)
  const rowSet = normalize(row.setName)
  const rowParallel = normalize(row.parallel)

  let score = 0
  const reasons = []

  if (wantedCardNumber && rowCardNumber && wantedCardNumber === rowCardNumber) {
    score += 0.5
    reasons.push('cardNumber')
  }

  if (wantedPlayer && rowPlayer) {
    if (wantedPlayer === rowPlayer) {
      score += 0.35
      reasons.push('player_exact')
    } else if (rowPlayer.includes(wantedPlayer) || wantedPlayer.includes(rowPlayer)) {
      score += 0.2
      reasons.push('player_partial')
    }
  }

  if (wantedTeam && rowTeam && wantedTeam === rowTeam) {
    score += 0.12
    reasons.push('team')
  }

  if (wantedSet && rowSet && (rowSet.includes(wantedSet) || wantedSet.includes(rowSet))) {
    score += 0.1
    reasons.push('set')
  }

  if (wantedYear && String(row.year || '') === wantedYear) {
    score += 0.08
    reasons.push('year')
  }

  if (wantedParallel && rowParallel && wantedParallel === rowParallel) {
    score += 0.05
    reasons.push('parallel')
  }

  return {
    score: Number(score.toFixed(4)),
    reasons
  }
}

export async function matchCardByFields(input = {}, options = {}) {
  await initializeCatalogDatabase()

  const sport = safeString(options?.sport || input?.sport || 'Football')
  const wantedCardNumber = normalizeCardNumber(input?.cardNumber)
  const wantedPlayer = cleanPlayerName(input?.player)
  const wantedSet = safeString(input?.set)
  const wantedTeam = cleanPlayerName(input?.team)

  if (!wantedCardNumber && !wantedPlayer && !wantedSet && !wantedTeam) {
    return { best: null, candidates: [] }
  }

  const where = ['lower(s.sport) = lower(?)']
  const params = [sport]

  if (wantedCardNumber) {
    where.push('upper(c.cardNumber) = upper(?)')
    params.push(wantedCardNumber)
  }

  if (wantedPlayer) {
    where.push('lower(c.player) LIKE lower(?)')
    params.push(`%${wantedPlayer}%`)
  }

  if (wantedSet) {
    where.push('lower(s.setName) LIKE lower(?)')
    params.push(`%${wantedSet}%`)
  }

  if (wantedTeam) {
    where.push('lower(c.team) LIKE lower(?)')
    params.push(`%${wantedTeam}%`)
  }

  const sql = `
    SELECT
      c.id AS cardId,
      c.cardNumber,
      c.player,
      c.team,
      c.position,
      c.parallel,
      c.rookie,
      s.id AS setId,
      s.sport,
      s.year,
      s.brand,
      s.setName
    FROM catalog_cards c
    JOIN catalog_sets s ON s.id = c.setId
    WHERE ${where.join(' AND ')}
    ORDER BY c.updatedAt DESC
    LIMIT 400
  `

  const rows = await dbAll(sql, params)
  const candidates = rows
    .map((row) => {
      const scored = scoreFieldMatch(input, row)
      return {
        score: scored.score,
        reasons: scored.reasons,
        card: {
          id: row.cardId,
          cardNumber: row.cardNumber,
          player: row.player,
          team: row.team,
          position: row.position,
          parallel: row.parallel,
          rookie: row.rookie
        },
        set: {
          id: row.setId,
          sport: row.sport,
          year: row.year,
          brand: row.brand,
          setName: row.setName
        }
      }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return {
    best: candidates[0] || null,
    candidates
  }
}

export async function listTemplates() {
  await initializeCatalogDatabase()
  const rows = await dbAll('SELECT * FROM listing_templates WHERE isActive = 1 ORDER BY name ASC')
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    templateType: row.templateType,
    resolvedType: normalizeTemplateType(row.templateType),
    ebayFormat: row.ebayFormat,
    defaults: (() => {
      try { return JSON.parse(row.defaultsJson || '{}') } catch { return {} }
    })()
  }))
}

export async function createTemplate(input) {
  await initializeCatalogDatabase()

  const name = safeString(input?.name)
  const templateType = normalizeTemplateType(input?.templateType)
  const ebayFormat = safeString(input?.ebayFormat || 'FixedPrice')
  const defaults = input?.defaults && typeof input.defaults === 'object' ? input.defaults : {}

  if (!name || !templateType) {
    throw new Error('name and templateType are required')
  }

  const now = new Date().toISOString()
  const row = {
    id: randomUUID(),
    name,
    templateType,
    ebayFormat,
    defaultsJson: JSON.stringify(defaults),
    isActive: 1,
    createdAt: now,
    updatedAt: now
  }

  await dbRun(
    `INSERT INTO listing_templates (id, name, templateType, ebayFormat, defaultsJson, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.name, row.templateType, row.ebayFormat, row.defaultsJson, row.isActive, row.createdAt, row.updatedAt]
  )

  return {
    id: row.id,
    name: row.name,
    templateType: row.templateType,
    ebayFormat: row.ebayFormat,
    defaults
  }
}

export async function buildListingDraft(input = {}) {
  return buildListingDraftFromInput(input)
}

async function fetchCardsByIds(cardIds = []) {
  const ids = normalizeIdList(cardIds)
  if (!ids.length) return []

  const placeholders = ids.map(() => '?').join(', ')
  const rows = await dbAll(
    `SELECT
       c.id AS id,
       c.cardNumber,
       c.player,
       c.team,
       c.position,
       c.parallel,
       c.rookie,
       s.id AS setId,
       s.sport,
       s.year,
       s.brand,
       s.setName
     FROM catalog_cards c
     JOIN catalog_sets s ON s.id = c.setId
     WHERE c.id IN (${placeholders})`,
    ids
  )

  const rowById = new Map(rows.map(row => [row.id, row]))
  return ids.map(id => rowById.get(id)).filter(Boolean)
}

async function resolveCardIdFromInventorySku(refValue) {
  const raw = safeString(refValue)
  if (!raw) return null

  let inventoryRow = null
  try {
    inventoryRow = await tempDbGet(
      inventorySqlitePath,
      `SELECT sport, name, team, setName, year, cardNumber, parallel
       FROM inventory
       WHERE lower(sku) = lower(?)
       ORDER BY updatedAt DESC
       LIMIT 1`,
      [raw]
    )
  } catch {
    return null
  }

  if (!inventoryRow) return null

  const matched = await matchCardByFields(
    {
      player: inventoryRow.name,
      team: inventoryRow.team,
      set: inventoryRow.setName,
      year: inventoryRow.year,
      cardNumber: inventoryRow.cardNumber,
      parallel: inventoryRow.parallel
    },
    { sport: inventoryRow.sport || 'Football' }
  )

  return String(matched?.best?.card?.id || '') || null
}

async function resolveCardRefsToIds(values = []) {
  const refs = normalizeIdList(values)
  const resolved = []

  for (const ref of refs) {
    const direct = await dbGet('SELECT id FROM catalog_cards WHERE id = ?', [ref])
    if (direct?.id) {
      resolved.push(String(direct.id))
      continue
    }

    const fromSku = await resolveCardIdFromInventorySku(ref)
    if (fromSku) {
      resolved.push(fromSku)
      continue
    }
  }

  return [...new Set(resolved)]
}

async function fetchInventoryCardsByRefs(values = []) {
  const refs = normalizeIdList(values)
  if (!refs.length) return []

  const rows = []
  for (const ref of refs) {
    try {
      const row = await tempDbGet(
        inventorySqlitePath,
        `SELECT id, sport, sku, name, team, position, setName, year, cardNumber, parallel, rookie
         FROM inventory
         WHERE id = ? OR lower(sku) = lower(?)
         ORDER BY updatedAt DESC
         LIMIT 1`,
        [ref, ref]
      )
      if (row) rows.push(row)
    } catch {
      // Ignore individual inventory lookup errors and continue.
    }
  }

  return rows.map((row) => ({
    id: String(row.id || row.sku || randomUUID()),
    cardNumber: safeString(row.cardNumber),
    player: safeString(row.name),
    team: safeString(row.team),
    position: safeString(row.position),
    parallel: safeString(row.parallel),
    rookie: safeString(row.rookie),
    setId: '',
    sport: safeString(row.sport) || 'Football',
    year: safeString(row.year),
    brand: '',
    setName: safeString(row.setName)
  }))
}

function serializeTemplate(template) {
  let defaults = {}
  try {
    defaults = JSON.parse(template.defaultsJson || '{}')
  } catch {
    defaults = {}
  }

  return {
    id: template.id,
    name: template.name,
    templateType: template.templateType,
    resolvedType: normalizeTemplateType(template.templateType),
    ebayFormat: template.ebayFormat,
    defaults
  }
}

function buildSingleListing(card, template, defaults) {
  const title = buildCardTitleParts(card).join(' ')

  return {
    listingType: 'single',
    title,
    subtitle: `${card.setName} single card listing`,
    sport: card.sport,
    player: card.player,
    team: card.team,
    set: card.setName,
    year: card.year,
    cardNumber: card.cardNumber,
    parallel: card.parallel,
    format: template.ebayFormat,
    quantity: Number(defaults.quantity || 1),
    conditionId: 4000,
    type: 'Sports Trading Card',
    cards: [summarizeCard(card)],
    itemSpecifics: {
      'Card Number': card.cardNumber,
      'Player': card.player,
      'Team': card.team,
      'Set': card.setName,
      'Year': card.year,
      'Parallel': card.parallel || ''
    },
    description: 'Standard single-card fixed price listing.'
  }
}

function buildVariationListing(cards, template, defaults) {
  const leadCard = cards[0]
  const setTitleParts = [leadCard.year, leadCard.brand, leadCard.setName].map(v => safeString(v)).filter(Boolean)
  const optionCount = cards.length

  return {
    listingType: 'variation',
    title: `${setTitleParts.join(' ')} Pick Your Own Card - ${optionCount} Options`,
    subtitle: `Buyers choose from ${optionCount} available cards`,
    sport: leadCard.sport,
    player: leadCard.player,
    team: leadCard.team,
    set: leadCard.setName,
    year: leadCard.year,
    cardNumber: leadCard.cardNumber,
    parallel: leadCard.parallel,
    format: template.ebayFormat,
    quantity: Number(defaults.quantity || optionCount || 1),
    conditionId: 4000,
    type: 'Sports Trading Card',
    cards: cards.map(summarizeCard),
    variation: {
      name: safeString(defaults.variationName || 'Card Choice'),
      options: cards.map((card, index) => ({
        index: index + 1,
        label: buildVariationLabel(card),
        card: summarizeCard(card)
      }))
    },
    description: 'Pick-your-own listing with buyer-selectable card options.'
  }
}

function buildLotListing(cards, template, defaults) {
  const leadCard = cards[0]
  const lotSize = Number(defaults.lotSize || cards.length || 1)
  const sampleNames = cards.slice(0, 3).map(card => buildVariationLabel(card)).filter(Boolean)

  return {
    listingType: 'lot',
    title: `${leadCard.year} ${leadCard.brand} ${leadCard.setName} Lot of ${cards.length} Cards`,
    subtitle: sampleNames.length ? `Includes ${sampleNames.join(', ')}` : `Mixed lot of ${cards.length} cards`,
    sport: leadCard.sport,
    player: leadCard.player,
    team: leadCard.team,
    set: leadCard.setName,
    year: leadCard.year,
    cardNumber: leadCard.cardNumber,
    parallel: leadCard.parallel,
    format: template.ebayFormat,
    quantity: lotSize,
    conditionId: 4000,
    type: 'Sports Trading Card',
    cards: cards.map(summarizeCard),
    lot: {
      lotSize,
      cardCount: cards.length,
      includedCards: cards.map(summarizeCard)
    },
    description: 'Multi-card lot listing for grouped sale.'
  }
}

function buildBulkListing(cards, template, defaults) {
  const leadCard = cards[0]
  const quantity = Number(defaults.quantity || cards.length || 1)

  return {
    listingType: 'bulk',
    title: `${leadCard.year} ${leadCard.brand} ${leadCard.setName} Quantity Listing`,
    subtitle: `Great for moving ${cards.length} cards as one active inventory listing`,
    sport: leadCard.sport,
    player: leadCard.player,
    team: leadCard.team,
    set: leadCard.setName,
    year: leadCard.year,
    cardNumber: leadCard.cardNumber,
    parallel: leadCard.parallel,
    format: template.ebayFormat,
    quantity,
    conditionId: 4000,
    type: 'Sports Trading Card',
    cards: cards.map(summarizeCard),
    bulk: {
      quantity,
      cardCount: cards.length,
      sourceCards: cards.map(summarizeCard)
    },
    description: 'Quantity-based listing designed to clear grouped inventory.'
  }
}

function buildMysteryPackListing(cards, chaseCard, template, defaults) {
  const leadCard = chaseCard || cards[0]
  const packSize = Number(defaults.packSize || 1)
  const quantity = Number(defaults.quantity || cards.length || 1)

  return {
    listingType: 'mystery-pack',
    title: `${leadCard.year} ${leadCard.brand} ${leadCard.setName} Mystery Pack - Chase ${leadCard.player} #${leadCard.cardNumber}`,
    subtitle: 'Mystery pack with a featured chase card to drive interest',
    sport: leadCard.sport,
    player: leadCard.player,
    team: leadCard.team,
    set: leadCard.setName,
    year: leadCard.year,
    cardNumber: leadCard.cardNumber,
    parallel: leadCard.parallel,
    format: template.ebayFormat,
    quantity,
    conditionId: 4000,
    type: 'Sports Trading Card',
    cards: cards.map(summarizeCard),
    chaseCard: summarizeCard(chaseCard || leadCard),
    mysteryPack: {
      packSize,
      quantity,
      guaranteedChaseCard: true,
      chaseCard: summarizeCard(chaseCard || leadCard),
      includedCards: cards.map(summarizeCard)
    },
    description: 'Mystery pack listing with a guaranteed chase-card hook for buyers.'
  }
}

async function buildListingDraftFromInput(input = {}) {
  await initializeCatalogDatabase()

  const templateIdValue = String(input?.templateId || '')
  if (!templateIdValue) throw new Error('templateId is required')

  const template = await dbGet('SELECT * FROM listing_templates WHERE id = ? AND isActive = 1', [templateIdValue])
  if (!template) throw new Error('template not found')

  const defaults = (() => {
    try { return JSON.parse(template.defaultsJson || '{}') } catch { return {} }
  })()
  const profile = getTemplateProfile(template.templateType)

  const requestedCardRefs = normalizeIdList(input?.cardIds)
  if (!requestedCardRefs.length && input?.cardId) requestedCardRefs.push(String(input.cardId))
  if (!requestedCardRefs.length && input?.cardRef) requestedCardRefs.push(String(input.cardRef))

  const requestedCardIds = await resolveCardRefsToIds(requestedCardRefs)

  let cards = await fetchCardsByIds(requestedCardIds)
  if (!cards.length) {
    cards = await fetchInventoryCardsByRefs(requestedCardRefs)
  }
  if (!cards.length) throw new Error('cardId/cardIds (or SKU) is required and must resolve to at least one card')

  let chaseCard = null
  const chaseCardRef = String(input?.chaseCardId || input?.chaseCardRef || '').trim()
  if (chaseCardRef) {
    const chaseResolvedIds = await resolveCardRefsToIds([chaseCardRef])
    const chaseId = String(chaseResolvedIds[0] || '')
    if (chaseId) {
      chaseCard = cards.find(card => card.id === chaseId) || (await fetchCardsByIds([chaseId]))[0] || null
    } else {
      chaseCard = cards.find(card => card.id === chaseCardRef) || (await fetchInventoryCardsByRefs([chaseCardRef]))[0] || null
    }
  }

  const templateDetails = serializeTemplate(template)
  let listing

  switch (profile.listingType) {
    case 'variation':
      listing = buildVariationListing(cards, template, defaults)
      break
    case 'lot':
      listing = buildLotListing(cards, template, defaults)
      break
    case 'bulk':
      listing = buildBulkListing(cards, template, defaults)
      break
    case 'mystery-pack':
      listing = buildMysteryPackListing(cards, chaseCard, template, defaults)
      break
    case 'single':
    default:
      listing = buildSingleListing(cards[0], template, defaults)
      break
  }

  listing.templateType = templateDetails.resolvedType

  return {
    template: templateDetails,
    listing
  }
}
