import express from 'express'
import { randomUUID } from 'crypto'
import sqlite3 from 'sqlite3'
import fs from 'fs/promises'
import path from 'path'

const router = express.Router()
const dataDir = path.join(process.cwd(), 'data')
const sqlitePath = path.join(dataDir, 'inventory.db')
const legacyJsonPath = path.join(dataDir, 'inventory.json')

let db = null
let initPromise = null

const EBAY_TEMPLATE_COLUMNS = [
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
  'CustomLabel', '*Category', 'StoreCategory', '*Title', 'Subtitle', 'Relationship', 'RelationshipDetails', 'ScheduleTime',
  '*ConditionID', 'CD:Professional Grader - (ID: 27501)', 'CD:Grade - (ID: 27502)', 'CDA:Certification Number - (ID: 27503)',
  'CD:Card Condition - (ID: 40001)', '*C:Sport', 'C:Player/Athlete', 'C:Season', 'C:Year Manufactured', 'C:Manufacturer',
  'C:Signed By', 'C:Parallel/Variety', 'C:Features', 'C:Set', 'C:Team', 'C:League', 'C:Autographed', 'C:Card Name',
  'C:Card Number', 'C:Type', 'C:Autograph Authentication', 'C:Grade', 'C:Card Size', 'C:Country of Origin', 'C:Graded',
  'C:Professional Grader', 'C:Material', 'C:Autograph Format', 'C:Card Condition', 'C:Vintage', 'C:Event/Tournament',
  'C:Language', 'C:Original/Licensed Reprint', 'C:Certification Number', 'C:Autograph Authentication Number',
  'C:California Prop 65 Warning', 'C:Card Thickness', 'C:Customized', 'C:Insert Set', 'C:Print Run', 'C:Number of Cards',
  'PicURL', 'GalleryType', 'VideoID', '*Description', '*Format', '*Duration', '*StartPrice', 'BuyItNowPrice',
  'BestOfferEnabled', 'BestOfferAutoAcceptPrice', 'MinimumBestOfferPrice', '*Quantity', 'ImmediatePayRequired', '*Location',
  'ShippingType', 'ShippingService-1:Option', 'ShippingService-1:Cost', 'ShippingService-2:Option', 'ShippingService-2:Cost',
  '*DispatchTimeMax', 'PromotionalShippingDiscount', 'ShippingDiscountProfileID', '*ReturnsAcceptedOption', 'ReturnsWithinOption',
  'RefundOption', 'ShippingCostPaidByOption', 'AdditionalDetails', 'ShippingProfileName', 'ReturnProfileName',
  'PaymentProfileName', 'Product Safety Pictograms', 'Product Safety Statements', 'Product Safety Component',
  'Regulatory Document Ids', 'Manufacturer Name', 'Manufacturer AddressLine1', 'Manufacturer AddressLine2', 'Manufacturer City',
  'Manufacturer Country', 'Manufacturer PostalCode', 'Manufacturer StateOrProvince', 'Manufacturer Phone', 'Manufacturer Email',
  'Manufacturer ContactURL', 'Responsible Person 1', 'Responsible Person 1 Type', 'Responsible Person 1 AddressLine1',
  'Responsible Person 1 AddressLine2', 'Responsible Person 1 City', 'Responsible Person 1 Country',
  'Responsible Person 1 PostalCode', 'Responsible Person 1 StateOrProvince', 'Responsible Person 1 Phone',
  'Responsible Person 1 Email', 'Responsible Person 1 ContactURL'
]

const EBAY_REQUIRED_COLUMNS = EBAY_TEMPLATE_COLUMNS.filter((column) => column.startsWith('*'))

const EBAY_COLUMN_SOURCES = {
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)': 'default(Add)',
  'CustomLabel': 'inventory.sku',
  '*Category': 'default(categoryId)',
  '*Title': 'inventory.title fallback',
  '*ConditionID': 'default(4000)',
  '*C:Sport': 'inventory.sport',
  'C:Player/Athlete': 'inventory.name',
  'C:Year Manufactured': 'inventory.year',
  'C:Parallel/Variety': 'inventory.parallel',
  'C:Set': 'inventory.setName',
  'C:Team': 'inventory.team',
  'C:Autographed': 'inventory.autograph',
  'C:Card Name': 'inventory.name',
  'C:Card Number': 'inventory.cardNumber',
  'C:Type': 'default(Sports Trading Card)',
  'PicURL': 'inventory.pictureUrl',
  '*Description': 'inventory.description fallback',
  '*Format': 'default(FixedPrice)',
  '*Duration': 'default(GTC)',
  '*StartPrice': 'default(startPrice)',
  '*Quantity': 'inventory.quantity',
  '*Location': 'default(location)',
  'ShippingType': 'default(Flat)',
  'ShippingService-1:Option': 'default(shipping service)',
  'ShippingService-1:Cost': 'default(shipping cost)',
  '*DispatchTimeMax': 'default(dispatch)',
  '*ReturnsAcceptedOption': 'default(ReturnsAccepted)',
  'ReturnsWithinOption': 'default(Days_30)',
  'RefundOption': 'default(MoneyBack)',
  'ShippingCostPaidByOption': 'default(Buyer)'
}

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

async function readLegacyJsonRecords() {
  try {
    await fs.access(legacyJsonPath)
  } catch {
    return []
  }

  try {
    const raw = await fs.readFile(legacyJsonPath, 'utf8')
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Could not parse legacy inventory JSON for migration:', err)
    return []
  }
}

async function initializeDatabase() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    await fs.mkdir(dataDir, { recursive: true })
    await openDatabase()

    await dbRun('PRAGMA journal_mode = WAL')
    await dbRun('PRAGMA synchronous = NORMAL')

    await dbRun(`
      CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        sportNormalized TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        pairType TEXT,
        sku TEXT,
        name TEXT,
        team TEXT,
        position TEXT,
        setName TEXT,
        year TEXT,
        cardNumber TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        parallel TEXT,
        rookie TEXT,
        autograph TEXT,
        title TEXT,
        description TEXT,
        pickFrom TEXT,
        filename TEXT,
        pictureUrl TEXT,
        lastImportAttemptId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `)

    await dbRun('CREATE INDEX IF NOT EXISTS idx_inventory_sport ON inventory (sportNormalized)')
    await dbRun('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_fingerprint ON inventory (fingerprint)')

    const row = await dbGet('SELECT COUNT(1) AS count FROM inventory')
    const existingCount = Number(row?.count || 0)
    if (existingCount > 0) return

    const legacyRecords = await readLegacyJsonRecords()
    if (!legacyRecords.length) return

    await dbRun('BEGIN')
    try {
      for (const legacy of legacyRecords) {
        const migrated = toRecord(legacy, String(legacy?.sport || 'Football').trim() || 'Football', legacy?.lastImportAttemptId || null)
        migrated.id = String(legacy?.id || migrated.id)
        migrated.createdAt = String(legacy?.createdAt || migrated.createdAt)
        migrated.updatedAt = String(legacy?.updatedAt || migrated.updatedAt)
        await insertInventoryRow(migrated)
      }
      await dbRun('COMMIT')
      console.log(`Migrated ${legacyRecords.length} inventory records from JSON to SQLite.`)
    } catch (err) {
      await dbRun('ROLLBACK')
      console.error('Legacy inventory migration failed:', err)
    }
  })()

  return initPromise
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function yesNo(value, fallback = 'No') {
  const normalized = normalize(value)
  if (['yes', 'true', '1', 'y'].includes(normalized)) return 'Yes'
  if (['no', 'false', '0', 'n'].includes(normalized)) return 'No'
  return fallback
}

function mergeString(existing, incoming) {
  if (String(existing || '').trim()) return existing
  return String(incoming || '').trim()
}

function safeInt(value, fallback = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.round(n))
}

function toRecord(card, sport, importAttemptId) {
  const now = new Date().toISOString()
  const record = {
    id: randomUUID(),
    sport,
    sportNormalized: normalize(sport),
    fingerprint: '',
    pairType: String(card?.Side || ''),
    sku: String(card?.SKU || ''),
    name: String(card?.Name || ''),
    team: String(card?.Team || ''),
    position: String(card?.Position || ''),
    set: String(card?.Set || ''),
    year: String(card?.Year || ''),
    cardNumber: String(card?.CardNumber || ''),
    quantity: safeInt(card?.Quantity || 1),
    parallel: String(card?.Parallel || ''),
    rookie: String(card?.Rookie || 'No'),
    autograph: String(card?.Autograph || 'No'),
    title: String(card?.Title || ''),
    description: String(card?.Description || ''),
    pickFrom: String(card?.PickFrom || ''),
    filename: String(card?.Filename || ''),
    pictureUrl: String(card?.PictureURL || ''),
    lastImportAttemptId: importAttemptId || null,
    createdAt: now,
    updatedAt: now
  }
  record.fingerprint = fingerprint(record)
  return record
}

function fingerprint(record) {
  return [
    normalize(record.sport),
    normalize(record.name),
    normalize(record.team),
    normalize(record.set),
    normalize(record.year),
    normalize(record.cardNumber),
    normalize(record.parallel)
  ].join('|')
}

function mergeMissingStrings(target, source, keys) {
  keys.forEach((key) => {
    if (!target[key] && source[key]) target[key] = source[key]
  })
}

async function insertInventoryRow(record) {
  await dbRun(
    `INSERT INTO inventory (
      id, sport, sportNormalized, fingerprint, pairType, sku, name, team, position, setName, year,
      cardNumber, quantity, parallel, rookie, autograph, title, description, pickFrom, filename,
      pictureUrl, lastImportAttemptId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.sport, record.sportNormalized, record.fingerprint, record.pairType, record.sku,
      record.name, record.team, record.position, record.set, record.year, record.cardNumber, safeInt(record.quantity, 1),
      record.parallel, record.rookie, record.autograph, record.title, record.description, record.pickFrom,
      record.filename, record.pictureUrl, record.lastImportAttemptId, record.createdAt, record.updatedAt
    ]
  )
}

function rowToInventoryItem(row) {
  return {
    id: row.id,
    sport: row.sport,
    pairType: row.pairType,
    sku: row.sku,
    name: row.name,
    team: row.team,
    position: row.position,
    set: row.setName,
    year: row.year,
    cardNumber: row.cardNumber,
    quantity: safeInt(row.quantity, 1),
    parallel: row.parallel,
    rookie: row.rookie,
    autograph: row.autograph,
    title: row.title,
    description: row.description,
    pickFrom: row.pickFrom,
    filename: row.filename,
    pictureUrl: row.pictureUrl,
    lastImportAttemptId: row.lastImportAttemptId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

async function listInventory(sportFilter = '') {
  await initializeDatabase()

  const normalizedSport = normalize(sportFilter)
  const rows = normalizedSport
    ? await dbAll('SELECT * FROM inventory WHERE sportNormalized = ? ORDER BY updatedAt DESC', [normalizedSport])
    : await dbAll('SELECT * FROM inventory ORDER BY updatedAt DESC')

  return rows.map(rowToInventoryItem)
}

function buildFallbackTitle(item) {
  const parts = [item.year, item.set, item.name, item.cardNumber ? `#${item.cardNumber}` : '']
    .map((part) => String(part || '').trim())
    .filter(Boolean)
  const title = parts.join(' ')
  return title || 'Sports Trading Card'
}

function buildFallbackDescription(item) {
  const title = item.title || buildFallbackTitle(item)
  return `${title}. ${item.team ? `Team: ${item.team}. ` : ''}${item.parallel ? `Parallel: ${item.parallel}.` : ''}`.trim()
}

function extractYearForEbay(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/\d{4}/)
  return match ? match[0] : raw
}

function ebayDefaults(req) {
  return {
    categoryId: String(req.query.categoryId || process.env.EBAY_CATEGORY_ID || '261328'),
    conditionId: String(req.query.conditionId || process.env.EBAY_CONDITION_ID || '4000'),
    startPrice: String(req.query.startPrice || process.env.EBAY_DEFAULT_START_PRICE || '0.99'),
    location: String(req.query.location || process.env.EBAY_LOCATION || 'United States'),
    dispatchTimeMax: String(req.query.dispatchTimeMax || process.env.EBAY_DISPATCH_DAYS || '3'),
    returnsAccepted: String(req.query.returnsAccepted || process.env.EBAY_RETURNS_ACCEPTED || 'ReturnsAccepted'),
    shippingType: String(req.query.shippingType || process.env.EBAY_SHIPPING_TYPE || 'Flat'),
    shippingService1: String(req.query.shippingService1 || process.env.EBAY_SHIP_SERVICE_1 || 'USPS Ground Advantage'),
    shippingCost1: String(req.query.shippingCost1 || process.env.EBAY_SHIP_COST_1 || '0.00')
  }
}

function buildEbayTemplateRow(item, defaults) {
  const row = Object.fromEntries(EBAY_TEMPLATE_COLUMNS.map((column) => [column, '']))

  row['*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)'] = 'Add'
  row.CustomLabel = item.sku || ''
  row['*Category'] = defaults.categoryId
  row['*Title'] = item.title || buildFallbackTitle(item)
  row['*ConditionID'] = defaults.conditionId
  row['*C:Sport'] = item.sport || 'Football'
  row['C:Player/Athlete'] = item.name || ''
  row['C:Year Manufactured'] = extractYearForEbay(item.year)
  row['C:Parallel/Variety'] = item.parallel || ''
  row['C:Set'] = item.set || ''
  row['C:Team'] = item.team || ''
  row['C:Autographed'] = yesNo(item.autograph, 'No')
  row['C:Card Name'] = item.name || ''
  row['C:Card Number'] = item.cardNumber || ''
  row['C:Type'] = 'Sports Trading Card'
  row.PicURL = item.pictureUrl || ''
  row['*Description'] = item.description || buildFallbackDescription(item)
  row['*Format'] = 'FixedPrice'
  row['*Duration'] = 'GTC'
  row['*StartPrice'] = defaults.startPrice
  row['*Quantity'] = String(safeInt(item.quantity, 1))
  row['*Location'] = defaults.location
  row.ShippingType = defaults.shippingType
  row['ShippingService-1:Option'] = defaults.shippingService1
  row['ShippingService-1:Cost'] = defaults.shippingCost1
  row['*DispatchTimeMax'] = defaults.dispatchTimeMax
  row['*ReturnsAcceptedOption'] = defaults.returnsAccepted
  row.ReturnsWithinOption = 'Days_30'
  row.RefundOption = 'MoneyBack'
  row.ShippingCostPaidByOption = 'Buyer'

  return row
}

function buildEbayCsv(items, defaults) {
  const lines = []
  lines.push(EBAY_TEMPLATE_COLUMNS.map(csvEscape).join(','))

  items.forEach((item) => {
    const mapped = buildEbayTemplateRow(item, defaults)
    const line = EBAY_TEMPLATE_COLUMNS.map((column) => csvEscape(mapped[column] || '')).join(',')
    lines.push(line)
  })

  return lines.join('\n')
}

function buildEbayCoverage(items, defaults) {
  const rows = items.map((item) => buildEbayTemplateRow(item, defaults))
  const byColumn = EBAY_TEMPLATE_COLUMNS.map((column) => {
    const nonEmptyCount = rows.reduce((acc, row) => acc + (String(row[column] || '').trim() ? 1 : 0), 0)
    return {
      column,
      required: EBAY_REQUIRED_COLUMNS.includes(column),
      mapped: Boolean(EBAY_COLUMN_SOURCES[column]),
      source: EBAY_COLUMN_SOURCES[column] || null,
      nonEmptyCount
    }
  })

  const missingRequiredMappings = byColumn
    .filter((entry) => entry.required && !entry.mapped)
    .map((entry) => entry.column)

  return {
    totalColumns: EBAY_TEMPLATE_COLUMNS.length,
    requiredColumns: EBAY_REQUIRED_COLUMNS.length,
    mappedColumns: byColumn.filter((entry) => entry.mapped).length,
    rowsEvaluated: rows.length,
    missingRequiredMappings,
    columns: byColumn
  }
}

router.get('/', async (req, res) => {
  try {
    const items = await listInventory(String(req.query.sport || ''))
    res.json({ items })
  } catch (err) {
    console.error('Inventory GET failed:', err)
    res.status(500).json({ error: 'Failed to load inventory.' })
  }
})

router.get('/ebay/coverage', async (req, res) => {
  try {
    const items = await listInventory(String(req.query.sport || ''))
    const defaults = ebayDefaults(req)
    const coverage = buildEbayCoverage(items, defaults)
    res.json({ ok: true, ...coverage })
  } catch (err) {
    console.error('Inventory eBay coverage failed:', err)
    res.status(500).json({ error: 'Failed to compute eBay coverage.' })
  }
})

router.get('/export/ebay-template.csv', async (req, res) => {
  try {
    const items = await listInventory(String(req.query.sport || ''))
    const defaults = ebayDefaults(req)
    const csv = buildEbayCsv(items, defaults)

    const sportPart = String(req.query.sport || 'all').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const datePart = new Date().toISOString().slice(0, 10)
    const filename = `ebay-template-${sportPart}-${datePart}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(csv)
  } catch (err) {
    console.error('Inventory eBay export failed:', err)
    res.status(500).json({ error: 'Failed to export eBay CSV.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await initializeDatabase()

    const id = String(req.params?.id || '').trim()
    if (!id) {
      res.status(400).json({ error: 'Missing inventory row id.' })
      return
    }

    const result = await dbRun('DELETE FROM inventory WHERE id = ?', [id])
    const deleted = Number(result?.changes || 0)
    res.json({ ok: true, deleted })
  } catch (err) {
    console.error('Inventory delete failed:', err)
    res.status(500).json({ error: 'Failed to delete inventory row.' })
  }
})

router.delete('/', async (req, res) => {
  try {
    await initializeDatabase()

    const clearAll = ['1', 'true', 'yes'].includes(String(req.query?.all || '').toLowerCase())
    const sport = String(req.query?.sport || '').trim()

    let result
    if (clearAll) {
      result = await dbRun('DELETE FROM inventory')
    } else {
      const normalizedSport = normalize(sport)
      if (!normalizedSport) {
        res.status(400).json({ error: 'Provide sport query or set all=true.' })
        return
      }
      result = await dbRun('DELETE FROM inventory WHERE sportNormalized = ?', [normalizedSport])
    }

    const deleted = Number(result?.changes || 0)
    res.json({ ok: true, deleted, mode: clearAll ? 'all' : 'sport' })
  } catch (err) {
    console.error('Inventory clear failed:', err)
    res.status(500).json({ error: 'Failed to clear inventory.' })
  }
})

router.post('/bulk', async (req, res) => {
  try {
    await initializeDatabase()

    const sport = String(req.body?.sport || '').trim() || 'Football'
    const cards = Array.isArray(req.body?.cards) ? req.body.cards : []
    const importAttemptId = randomUUID()

    if (!cards.length) {
      res.status(400).json({ error: 'No cards provided.' })
      return
    }

    let inserted = 0
    let updated = 0

    await dbRun('BEGIN')

    try {
      for (const card of cards) {
        const incoming = toRecord(card, sport, importAttemptId)
        const existing = await dbGet('SELECT * FROM inventory WHERE fingerprint = ?', [incoming.fingerprint])

        if (existing) {
          const merged = {
            sport: existing.sport,
            pairType: mergeString(existing.pairType, incoming.pairType),
            sku: mergeString(existing.sku, incoming.sku),
            name: existing.name,
            team: existing.team,
            position: mergeString(existing.position, incoming.position),
            setName: existing.setName,
            year: existing.year,
            cardNumber: existing.cardNumber,
            quantity: safeInt(existing.quantity, 1) + safeInt(incoming.quantity, 1),
            parallel: existing.parallel,
            rookie: mergeString(existing.rookie, incoming.rookie),
            autograph: mergeString(existing.autograph, incoming.autograph),
            title: mergeString(existing.title, incoming.title),
            description: mergeString(existing.description, incoming.description),
            pickFrom: mergeString(existing.pickFrom, incoming.pickFrom),
            filename: mergeString(existing.filename, incoming.filename),
            pictureUrl: mergeString(existing.pictureUrl, incoming.pictureUrl),
            lastImportAttemptId: importAttemptId,
            updatedAt: new Date().toISOString()
          }

          await dbRun(
            `UPDATE inventory
             SET pairType = ?, sku = ?, position = ?, quantity = ?, rookie = ?, autograph = ?, title = ?,
                 description = ?, pickFrom = ?, filename = ?, pictureUrl = ?, lastImportAttemptId = ?, updatedAt = ?
             WHERE id = ?`,
            [
              merged.pairType, merged.sku, merged.position, merged.quantity, merged.rookie, merged.autograph,
              merged.title, merged.description, merged.pickFrom, merged.filename, merged.pictureUrl,
              merged.lastImportAttemptId, merged.updatedAt, existing.id
            ]
          )
          updated += 1
        } else {
          await insertInventoryRow(incoming)
          inserted += 1
        }
      }

      await dbRun('COMMIT')
    } catch (err) {
      await dbRun('ROLLBACK')
      throw err
    }

    const totalRow = await dbGet('SELECT COUNT(1) AS total FROM inventory')
    res.json({ ok: true, importAttemptId, inserted, updated, total: Number(totalRow?.total || 0) })
  } catch (err) {
    console.error('Inventory bulk save failed:', err)
    res.status(500).json({ error: 'Failed to save inventory.' })
  }
})

export default router
