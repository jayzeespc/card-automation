function getFieldValue(field) {
  if (!field) return null

  if (field.valueString !== undefined) return field.valueString
  if (field.content !== undefined) return field.content
  if (field.text !== undefined) return field.text
  if (field.valueNumber !== undefined) return String(field.valueNumber)
  if (field.valueBoolean !== undefined) return String(field.valueBoolean)
  if (field.valueArray) {
    return field.valueArray.map(item => getFieldValue(item)).filter(Boolean).join(' ')
  }
  if (field.valueObject) {
    return getFieldValue(field.valueObject)
  }

  return null
}

const COMMON_POSITIONS = [
  'qb', 'wr', 'rb', 'lb', 'cb', 'ss', 'fs', 'te',
  'dl', 'dt', 'de', 'og', 'ot', 'fb', 'pk', 'kr', 'pr', 'ls'
]

const POSITION_PHRASES = [
  ['strong safety', 'SS'],
  ['free safety', 'FS'],
  ['wide receiver', 'WR'],
  ['running back', 'RB'],
  ['quarterback', 'QB'],
  ['tight end', 'TE'],
  ['linebacker', 'LB'],
  ['cornerback', 'CB'],
  ['safety', 'S'],
  ['defensive lineman', 'DL'],
  ['defensive tackle', 'DT'],
  ['defensive end', 'DE'],
  ['offensive line', 'OL'],
  ['offensive tackle', 'OT'],
  ['offensive guard', 'OG'],
  ['center', 'C'],
  ['fullback', 'FB'],
  ['kicker', 'K'],
  ['punter', 'P']
]

const PARALLEL_PATTERNS = [
  [/\btie[ -]?dye\b/i, 'Tie-Dye'],
  [/\bcracked[ -]?ice\b/i, 'Cracked Ice'],
  [/\bcheckerboard\b/i, 'Checkerboard'],
  [/\bfluorescent\b/i, 'Fluorescent'],
  [/\bsilver\s+prizm\b/i, 'Silver Prizm'],
  [/\bsilver\b/i, 'Silver'],
  [/\bholo\b/i, 'Holo'],
  [/\bdisco\b/i, 'Disco'],
  [/\bwave\b/i, 'Wave'],
  [/\blaser\b/i, 'Laser'],
  [/\bscope\b/i, 'Scope'],
  [/\bzebra\b/i, 'Zebra'],
  [/\bcamo\b/i, 'Camo'],
  [/\bsparkle\b/i, 'Sparkle'],
  [/\bmojo\b/i, 'Mojo'],
  [/\bgold\b/i, 'Gold'],
  [/\bgreen\b/i, 'Green'],
  [/\bred\b/i, 'Red'],
  [/\bblue\b/i, 'Blue'],
  [/\bpurple\b/i, 'Purple'],
  [/\bpink\b/i, 'Pink'],
  [/\borange\b/i, 'Orange']
]

const NFL_TEAMS = [
  'arizona cardinals', 'atlanta falcons', 'baltimore ravens', 'buffalo bills',
  'carolina panthers', 'chicago bears', 'cincinnati bengals', 'cleveland browns',
  'dallas cowboys', 'denver broncos', 'detroit lions', 'green bay packers',
  'houston texans', 'indianapolis colts', 'jacksonville jaguars', 'kansas city chiefs',
  'las vegas raiders', 'los angeles chargers', 'los angeles rams', 'miami dolphins',
  'minnesota vikings', 'new england patriots', 'new orleans saints', 'new york giants',
  'new york jets', 'philadelphia eagles', 'pittsburgh steelers', 'san francisco 49ers',
  'seattle seahawks', 'tampa bay buccaneers', 'tennessee titans', 'washington commanders'
]

const CARD_SET_HINTS = [
  'prizm', 'optic', 'donruss', 'mosaic', 'select', 'contenders', 'chronicles',
  'score', 'prestige', 'absolute', 'origins', 'phoenix', 'zenith', 'illusion',
  'national treasures', 'topps', 'bowman', 'upper deck', 'leaf', 'panini'
]

function normalizeKey(key) {
  return key?.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function extractFieldsFromDocument(raw) {
  const doc = raw.documentResults?.[0] || raw.analyzeResult?.documentResults?.[0]
  return doc?.fields || null
}

function extractTextLines(raw) {
  const texts = []

  if (raw.pages) {
    for (const page of raw.pages) {
      if (page.lines) {
        for (const line of page.lines) {
          if (line.content) texts.push(line.content)
        }
      }
    }
  }

  if (raw.analyzeResult?.pages) {
    for (const page of raw.analyzeResult.pages) {
      if (page.lines) {
        for (const line of page.lines) {
          if (line.content) texts.push(line.content)
        }
      }
    }
  }

  if (raw.documentResults) {
    for (const doc of raw.documentResults) {
      if (doc.fields) {
        for (const [key, field] of Object.entries(doc.fields)) {
          const value = getFieldValue(field)
          if (value) texts.push(`${key}: ${value}`)
        }
      }
    }
  }

  return texts.join('\n')
}

function findValueFromLines(lines, keys) {
  const escapedKeys = keys.map(k => k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|')
  const text = String(lines || '')

  // Pass 1: explicit label style "key: value"
  const strict = new RegExp(`(?:^|\\n)\\s*(?:${escapedKeys})\\s*[:\\-]\\s*([^\\n]+)`, 'i')
  const strictMatch = text.match(strict)
  if (strictMatch?.[1]) return strictMatch[1].trim()

  // Pass 2: looser fallback
  const loose = new RegExp(`(?:${escapedKeys})[:\\s]*([^\\n]+)`, 'i')
  const looseMatch = text.match(loose)
  return looseMatch?.[1] ? looseMatch[1].trim() : null
}

function findPositionFromLines(lines) {
  const explicit = findValueFromLines(lines, ['position', 'pos', 'role'])
  const explicitNormalized = normalizePositionValue(explicit)
  if (explicitNormalized) return explicitNormalized

  const normalizedText = String(lines || '').toLowerCase().replace(/\s+/g, ' ')
  for (const [phrase, code] of POSITION_PHRASES) {
    if (normalizedText.includes(phrase)) return code
  }

  const regex = new RegExp(`\\b(${COMMON_POSITIONS.join('|')})\\b`, 'i')
  const match = lines.match(regex)
  return match ? match[1].toUpperCase() : null
}

function normalizePositionValue(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const lowered = text.toLowerCase().replace(/\s+/g, ' ')
  for (const [phrase, code] of POSITION_PHRASES) {
    if (lowered === phrase || lowered.includes(phrase)) return code
  }

  const compact = lowered.replace(/[^a-z]/g, '')
  const compactMap = {
    qb: 'QB',
    wr: 'WR',
    rb: 'RB',
    te: 'TE',
    lb: 'LB',
    cb: 'CB',
    s: 'S',
    ss: 'SS',
    fs: 'FS',
    dl: 'DL',
    dt: 'DT',
    de: 'DE',
    ol: 'OL',
    ot: 'OT',
    og: 'OG',
    c: 'C',
    fb: 'FB',
    k: 'K',
    p: 'P'
  }

  return compactMap[compact] || null
}

function normalizeParallelValue(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const lowered = text.toLowerCase().replace(/\s+/g, ' ')
  if (/\b(base|premier level|concourse|club level|field level|suite level)\b/i.test(lowered)) {
    return null
  }

  for (const [pattern, label] of PARALLEL_PATTERNS) {
    if (pattern.test(lowered)) return label
  }

  return null
}

function inferParallelFromLines(lines) {
  for (const line of lines) {
    const normalized = normalizeParallelValue(line)
    if (normalized) return normalized
  }
  return null
}

function normalizeLine(line) {
  return String(line || '').trim().replace(/\s+/g, ' ')
}

function splitLines(rawText) {
  return String(rawText || '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean)
}

function looksLikePersonName(line) {
  if (!line) return false
  if (line.length < 5 || line.length > 40) return false
  if (/\d/.test(line)) return false
  if (!/^[A-Za-z .'-]+$/.test(line)) return false
  const words = line.split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 4) return false

  const statTokens = new Set(['ATT', 'YDS', 'TD', 'CMP', 'PCT', 'INT', 'REC', 'TGT', 'RUSH', 'AVG'])
  const upperWords = words.map(w => w.replace(/[^A-Za-z]/g, '').toUpperCase()).filter(Boolean)
  if (upperWords.length >= 2 && upperWords.every(w => statTokens.has(w))) return false

  return words.every(word => word.length > 1)
}

function inferTeamFromLines(lines) {
  const lowered = lines.map(line => line.toLowerCase())
  const teamAliasMap = {
    cardinals: 'Arizona Cardinals',
    falcons: 'Atlanta Falcons',
    ravens: 'Baltimore Ravens',
    bills: 'Buffalo Bills',
    panthers: 'Carolina Panthers',
    bears: 'Chicago Bears',
    bengals: 'Cincinnati Bengals',
    browns: 'Cleveland Browns',
    cowboys: 'Dallas Cowboys',
    broncos: 'Denver Broncos',
    lions: 'Detroit Lions',
    packers: 'Green Bay Packers',
    texans: 'Houston Texans',
    colts: 'Indianapolis Colts',
    jaguars: 'Jacksonville Jaguars',
    chiefs: 'Kansas City Chiefs',
    raiders: 'Las Vegas Raiders',
    chargers: 'Los Angeles Chargers',
    rams: 'Los Angeles Rams',
    dolphins: 'Miami Dolphins',
    vikings: 'Minnesota Vikings',
    patriots: 'New England Patriots',
    saints: 'New Orleans Saints',
    giants: 'New York Giants',
    jets: 'New York Jets',
    eagles: 'Philadelphia Eagles',
    steelers: 'Pittsburgh Steelers',
    '49ers': 'San Francisco 49ers',
    seahawks: 'Seattle Seahawks',
    buccaneers: 'Tampa Bay Buccaneers',
    titans: 'Tennessee Titans',
    commanders: 'Washington Commanders'
  }

  for (const line of lowered) {
    for (const team of NFL_TEAMS) {
      if (line.includes(team)) {
        return team.replace(/\b\w/g, c => c.toUpperCase())
      }
    }

    for (const [alias, fullTeam] of Object.entries(teamAliasMap)) {
      if (line.includes(alias)) {
        return fullTeam
      }
    }
  }
  return null
}

function inferSetFromLines(lines) {
  const lowered = lines.map(line => line.toLowerCase())
  for (const line of lowered) {
    if (line.includes('donruss') && line.includes('optic')) return 'Donruss Optic'
    if (line.includes('select')) return 'Select'
    if (line.includes('topps') && line.includes('signature class')) return 'Topps Signature Class'
    if (line === 'panini') continue
    for (const hint of CARD_SET_HINTS) {
      if (line.includes(hint)) {
        return lines[lowered.indexOf(line)]
      }
    }
  }
  return null
}

function inferYearFromLines(lines) {
  const currentYear = new Date().getFullYear() + 1
  const years = new Set()

  for (const line of lines) {
    const seasonMatch = line.match(/\b(19\d{2}|20\d{2})\s*[-\/]\s*(\d{2,4})\b/)
    if (seasonMatch) {
      years.add(Number(seasonMatch[1]))
    }

    const matches = line.match(/\b(19\d{2}|20\d{2})\b/g) || []
    for (const m of matches) {
      const y = Number(m)
      if (y >= 1980 && y <= currentYear) {
        years.add(y)
      }
    }
  }

  if (years.size > 0) {
    return String(Math.min(...Array.from(years)))
  }

  const yearRegex = /\b(19\d{2}|20\d{2})\b/
  for (const line of lines) {
    const match = line.match(yearRegex)
    if (match) return match[1]
  }
  return null
}

function inferCardNumberFromLines(lines) {
  const text = lines.join('\n')

  const normalizeCardToken = (raw, { allowAlphaSubstitution = false } = {}) => {
    let token = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (!token) return null

    if (allowAlphaSubstitution && !/\d/.test(token)) {
      if (/^[IL|]+$/.test(token)) token = '1'
      else if (/^O+$/.test(token)) token = '0'
      else if (/^S+$/.test(token)) token = '5'
    }

    if (!/^[A-Z0-9-]{1,10}$/.test(token)) return null
    if (!/\d/.test(token)) return null
    return token
  }

  // Strict card-number labels. Word boundaries prevent matching inside words
  // like "Cardinals".
  const explicit = text.match(/(?:\bcard\b\s*(?:#|number|no\.?)*\s*[:#-]?\s*|\bno\.?\s*)([A-Z0-9-]{1,10})\b/i)
  const explicitToken = normalizeCardToken(explicit?.[1], { allowAlphaSubstitution: true })
  if (explicitToken) return explicitToken

  for (const line of lines) {
    // Unlabeled fallback should be stricter to avoid capturing random single digits.
    if (/^[A-Z]?\d{2,4}[A-Z]?$/.test(line) && /\d/.test(line)) return line
    if (/^[A-Z]{1,3}-?\d{2,4}$/.test(line) && /\d/.test(line)) return line
  }
  return null
}

function normalizePolygon(polygon) {
  if (!polygon) return []
  if (Array.isArray(polygon) && polygon.length && typeof polygon[0] === 'number') {
    const pts = []
    for (let i = 0; i < polygon.length - 1; i += 2) {
      pts.push({ x: Number(polygon[i]), y: Number(polygon[i + 1]) })
    }
    return pts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  }
  if (Array.isArray(polygon) && polygon.length && typeof polygon[0] === 'object') {
    return polygon
      .map(p => ({ x: Number(p.x), y: Number(p.y) }))
      .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
  }
  return []
}

function extractTopRightCardNumber(raw) {
  const normalizeCardToken = (raw, { allowAlphaSubstitution = false } = {}) => {
    let token = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (!token) return null

    if (allowAlphaSubstitution && !/\d/.test(token)) {
      if (/^[IL|]+$/.test(token)) token = '1'
      else if (/^O+$/.test(token)) token = '0'
      else if (/^S+$/.test(token)) token = '5'
    }

    if (!/^[A-Z0-9-]{1,10}$/.test(token)) return null
    if (!/\d/.test(token)) return null
    return token
  }

  const pages = raw?.analyzeResult?.pages || raw?.pages || []
  const candidates = []

  for (const page of pages) {
    const lines = Array.isArray(page?.lines) ? page.lines : []
    if (!lines.length) continue

    const allPoints = []
    for (const line of lines) {
      const pts = normalizePolygon(line?.polygon || line?.boundingPolygon)
      allPoints.push(...pts)
    }

    const pageWidth = Number(page?.width) || Math.max(1, ...allPoints.map(p => p.x), 1)
    const pageHeight = Number(page?.height) || Math.max(1, ...allPoints.map(p => p.y), 1)

    for (const line of lines) {
      const text = String(line?.content || '').trim()
      if (!text) continue

      const pts = normalizePolygon(line?.polygon || line?.boundingPolygon)
      if (!pts.length) continue

      const xMax = Math.max(...pts.map(p => p.x))
      const yMin = Math.min(...pts.map(p => p.y))
      const xNorm = xMax / pageWidth
      const yNorm = yMin / pageHeight

      if (xNorm < 0.55 || yNorm > 0.55) continue

      const labeled = text.match(/(?:\bno\.?\s*|\bcard\b\s*(?:#|number|no\.?)?\s*[:#-]?\s*|#\s*)([A-Z0-9-]{1,8})\b/i)
      const labeledValue = normalizeCardToken(labeled?.[1], { allowAlphaSubstitution: true })
      if (labeledValue) {
        const value = labeledValue
        const yearLike = /^(19|20)\d{2}$/.test(value)
        const score = 100 + (xNorm * 10) + ((1 - yNorm) * 10) - (yearLike ? 40 : 0)
        candidates.push({ value, score })
        continue
      }

      const tokenMatches = text.match(/\b[A-Z]?\d{1,4}[A-Z]?\b/gi) || []
      for (const tokenRaw of tokenMatches) {
        const value = normalizeCardToken(tokenRaw)
        if (!value) continue
        const isolated = new RegExp(`^\\s*#?\\s*${value}\\s*$`, 'i').test(text)
        if (!isolated) continue
        if (/\d{4}/.test(value)) continue
        const yearLike = /^(19|20)\d{2}$/.test(value)
        const score = 45 + (xNorm * 10) + ((1 - yNorm) * 10) - (yearLike ? 40 : 0)
        candidates.push({ value, score })
      }
    }
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].value
}

function inferPlayerFromLines(lines, detectedTeam, detectedSet) {
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (detectedTeam && lower.includes(detectedTeam.toLowerCase())) continue
    if (detectedSet && lower.includes(detectedSet.toLowerCase())) continue
    if (COMMON_POSITIONS.includes(lower)) continue
    if (looksLikePersonName(line)) return line
  }
  return null
}

function sanitizePlayerValue(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (!/^[A-Za-z .'-]{3,40}$/.test(text)) return null

  const lower = text.toLowerCase()
  if (lower.includes('record for career') || lower.includes('touchdown') || lower.includes('catches')) return null
  if (/\b(nfl|topps|optic|donruss|panini|cardinals?|arizona|round|pick|totals?|premier level|concourse|club level|field level|suite level)\b/i.test(text)) return null

  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 4) return null

  const statTokens = new Set(['ATT', 'YDS', 'TD', 'CMP', 'PCT', 'INT', 'REC', 'TGT', 'RUSH', 'AVG'])
  const upperWords = words.map(w => w.replace(/[^A-Za-z]/g, '').toUpperCase()).filter(Boolean)
  if (upperWords.length >= 2 && upperWords.every(w => statTokens.has(w))) return null

  return text
}

function parseFromText(rawText) {
  const lines = splitLines(rawText)
  const detectedTeam = inferTeamFromLines(lines)
  const detectedSet = inferSetFromLines(lines)
  const detectedYear = inferYearFromLines(lines)
  const detectedCardNumber = inferCardNumberFromLines(lines)
  const detectedPosition = findPositionFromLines(rawText)
  const detectedParallel = inferParallelFromLines(lines)
  const detectedPlayer = inferPlayerFromLines(lines, detectedTeam, detectedSet)

  const teamFromLabel = findValueFromLines(rawText, ['team', 'club'])
  const team = isLikelyTeamValue(teamFromLabel) ? teamFromLabel : detectedTeam

  const yearFromLabel = findValueFromLines(rawText, ['year', 'release year', 'issued'])
  const normalizedYear = normalizeYearValue(yearFromLabel) || detectedYear

  return {
    player: sanitizePlayerValue(findValueFromLines(rawText, ['player', 'name', 'athlete'])) || sanitizePlayerValue(detectedPlayer),
    team,
    position: detectedPosition,
    set: normalizeSetValue(findValueFromLines(rawText, ['set', 'series']) || detectedSet),
    year: normalizedYear,
    cardNumber: findValueFromLines(rawText, ['card number', 'card #', 'card no', 'no.']) || detectedCardNumber,
    parallel: normalizeParallelValue(findValueFromLines(rawText, ['parallel', 'variation', 'print'])) || detectedParallel
  }
}

function normalizeSetValue(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const lowered = text.toLowerCase()
  if (lowered === 'panini') return null
  if (lowered === 'optic') return 'Donruss Optic'
  if (lowered === 'prizm') return 'Panini Prizm'
  if (lowered.includes('donruss') && lowered.includes('optic')) return 'Donruss Optic'
  if (lowered.includes('select')) return 'Select'
  if (lowered.includes('topps') && lowered.includes('signature class')) return 'Topps Signature Class'
  if (lowered.includes('prizm')) return 'Panini Prizm'
  return text
}

function getFieldValueByNames(fields, names) {
  const normalizedNames = names.map(normalizeKey)
  for (const [key, field] of Object.entries(fields)) {
    const normalized = normalizeKey(key)
    if (normalizedNames.some(name => normalized.includes(name) || name.includes(normalized))) {
      const value = getFieldValue(field)
      if (value) return value
    }
  }
  return null
}

function isLikelyTeamValue(value) {
  if (!value) return false
  const v = String(value).trim().toLowerCase()
  if (!v) return false
  if (v.includes('record for career')) return false
  if (v.includes('touchdown')) return false
  if (v.includes('catches')) return false
  if (v.length > 40) return false

  const teamNameMatch = NFL_TEAMS.some(team => v.includes(team))
  if (teamNameMatch) return true

  const aliases = [
    'cardinals', 'falcons', 'ravens', 'bills', 'panthers', 'bears', 'bengals', 'browns',
    'cowboys', 'broncos', 'lions', 'packers', 'texans', 'colts', 'jaguars', 'chiefs',
    'raiders', 'chargers', 'rams', 'dolphins', 'vikings', 'patriots', 'saints', 'giants',
    'jets', 'eagles', 'steelers', '49ers', 'seahawks', 'buccaneers', 'titans', 'commanders'
  ]
  return aliases.some(alias => v.includes(alias))
}

function normalizeYearValue(value) {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw || raw === '0') return null

  const currentYear = new Date().getFullYear() + 1
  const seasonMatch = raw.match(/\b(19\d{2}|20\d{2})\s*[-\/]\s*(\d{2,4})\b/)
  if (seasonMatch) {
    const startYear = Number(seasonMatch[1])
    if (startYear >= 1980 && startYear <= currentYear) {
      return String(startYear)
    }
  }

  const yearMatch = raw.match(/\b(19\d{2}|20\d{2})\b/)
  if (!yearMatch) return null
  const year = Number(yearMatch[1])
  if (year < 1980 || year > currentYear) return null
  return String(year)
}

export function parseAzureResult(raw) {
  if (!raw) return {}

  const topRightCardNumber = extractTopRightCardNumber(raw)

  const fields = extractFieldsFromDocument(raw)
  let fromFields = null
  if (fields) {
    fromFields = {
      player: sanitizePlayerValue(getFieldValueByNames(fields, ['player', 'name', 'athlete'])),
      team: getFieldValueByNames(fields, ['team', 'club']),
      position: normalizePositionValue(getFieldValueByNames(fields, ['position', 'pos', 'role'])),
      set: normalizeSetValue(getFieldValueByNames(fields, ['set', 'series'])),
      year: getFieldValueByNames(fields, ['year', 'releaseyear', 'issued']),
      cardNumber: getFieldValueByNames(fields, ['cardNumber', 'cardnumber', 'card #', 'number']),
      parallel: normalizeParallelValue(getFieldValueByNames(fields, ['parallel', 'variation', 'print']))
    }

    // Light cleanup: keep valid team/year, but do not aggressively null fields.
    if (!isLikelyTeamValue(fromFields.team)) {
      fromFields.team = null
    }
    fromFields.year = normalizeYearValue(fromFields.year)
  }

  const textLines = extractTextLines(raw)
  const fromText = parseFromText(textLines)

  if (fromFields) {
    const merged = {
      player: sanitizePlayerValue(fromFields.player) || sanitizePlayerValue(fromText.player) || null,
      team: fromFields.team || fromText.team || null,
      position: fromFields.position || fromText.position || null,
      set: normalizeSetValue(fromFields.set || fromText.set) || null,
      year: fromFields.year || fromText.year || null,
      cardNumber: fromFields.cardNumber || topRightCardNumber || fromText.cardNumber || null,
      parallel: normalizeParallelValue(fromFields.parallel || fromText.parallel) || null
    }
    merged.topRightCardNumber = topRightCardNumber || null
    return merged
  }
  return {
    ...fromText,
    topRightCardNumber: topRightCardNumber || null
  }
}
