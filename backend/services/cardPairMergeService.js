function normalizeUiYearValue(rawYear) {
  const value = String(rawYear || '').trim()
  if (!value) return null

  const seasonMatch = value.match(/\b(19\d{2}|20\d{2})\s*[-\/]\s*(\d{2,4})\b/)
  if (seasonMatch) {
    return seasonMatch[1]
  }

  const yearMatch = value.match(/\b(19\d{2}|20\d{2})\b/)
  if (yearMatch) return yearMatch[1]

  if (value.includes('2025') && value.includes('2026')) return '2025-2026'
  if (value.includes('2025')) return '2025'
  if (value.includes('2026')) return '2026'
  if (value.includes('2024')) return '2024'

  return null
}

function finalUiYear(frontYear, backYear) {
  const front = normalizeUiYearValue(frontYear)
  const back = normalizeUiYearValue(backYear)

  if (front && back && front !== back) {
    const frontNum = Number(front)
    const backNum = Number(back)
    if (Number.isFinite(frontNum) && Number.isFinite(backNum) && Math.abs(frontNum - backNum) === 1) {
      const start = Math.min(frontNum, backNum)
      const end = Math.max(frontNum, backNum)
      return `${start}-${end}`
    }
  }

  return front || back || null
}

export function mergeFrontBackExtraction(frontData = {}, backData = {}) {
  const TEAM_ALIASES = {
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

  const hasNarrativeNoise = (value) => {
    const v = String(value || '').toLowerCase()
    return v.includes('record for career') || v.includes('touchdown') || v.includes('catches') || v.includes('not just a tight end')
  }

  const canonicalTeamFrom = (...values) => {
    for (const value of values) {
      const v = String(value || '').toLowerCase()
      if (!v || hasNarrativeNoise(v)) continue
      for (const [alias, team] of Object.entries(TEAM_ALIASES)) {
        if (v.includes(alias)) return team
      }
    }
    return null
  }

  const sanitizeSet = (value) => {
    if (!value) return null
    const text = String(value).trim()
    if (hasNarrativeNoise(text)) return null
    if (/\brecords?\s+for\b/i.test(text)) return null

    const lowered = text.toLowerCase()
    if (lowered.includes('topps signature class')) return 'Topps Signature Class'
    if (lowered.includes('donruss') && lowered.includes('optic')) return 'Donruss Optic'
    if (lowered.includes('panini') && lowered.includes('prizm')) return 'Panini Prizm'
    if (lowered === 'optic') return 'Donruss Optic'
    if (lowered === 'donruss') return 'Donruss'
    if (lowered === 'topps') return 'Topps'
    if (lowered === 'prizm') return 'Panini Prizm'
    if (lowered.includes('select')) return 'Select'
    if (lowered === 'panini') return null
    if (lowered.includes('premier level') || lowered.includes('concourse') || lowered.includes('field level') || lowered.includes('suite level') || lowered.includes('club level')) return null

    const legalNoise = /(all rights reserved|the topps company|\u00ae|\u2122|\(r\)|\(tm\))/i
    if (legalNoise.test(text)) {
      const phrase = text.match(/\b(topps\s+signature\s+class|donruss\s+optic|panini\s+prizm|panini\s+select|select|topps|optic|prizm)\b/i)
      if (phrase?.[1]) {
        const p = phrase[1]
        return p.replace(/\b\w/g, c => c.toUpperCase())
      }
    }

    return text
  }

  const sanitizePlayer = (value) => {
    if (!value) return null
    const text = String(value).trim()
    if (!text) return null
    if (hasNarrativeNoise(text)) return null
    if (/\b(hold|round|pick|topps|optic|donruss|panini|select|premier level|concourse|club level|field level|suite level|nfl|cardinals?|arizona)\b/i.test(text)) return null
    if (/^[,.;:]/.test(text)) return null
    if (/\b(record|career|touchdown|catches|tight end)\b/i.test(text)) return null
    if (!/^[A-Za-z .'-]{3,40}$/.test(text)) return null
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 4) return null

    const statTokens = new Set(['ATT', 'YDS', 'TD', 'CMP', 'PCT', 'INT', 'REC', 'TGT', 'RUSH', 'AVG'])
    const upperWords = words.map(w => w.replace(/[^A-Za-z]/g, '').toUpperCase()).filter(Boolean)
    if (upperWords.length >= 2 && upperWords.every(w => statTokens.has(w))) return null

    return text
  }

  const sanitizePosition = (value) => {
    const v = String(value || '').trim().toUpperCase()
    if (!v) return null
    const valid = new Set(['QB', 'WR', 'RB', 'TE', 'LB', 'CB', 'S', 'SS', 'FS', 'DL', 'DE', 'DT', 'OL', 'OT', 'OG', 'C', 'K', 'P', 'FB'])
    return valid.has(v) ? v : null
  }

  const safeYearFrom = (yearValue, ...contextValues) => {
    if (contextValues.some(hasNarrativeNoise)) return null
    return normalizeUiYearValue(yearValue)
  }

  const safeCardNumber = (value) => {
    let v = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (!v) return null

    if (!/\d/.test(v)) {
      if (/^[IL|]+$/.test(v)) v = '1'
      else if (/^O+$/.test(v)) v = '0'
      else if (/^S+$/.test(v)) v = '5'
    }

    if (!/^[A-Z0-9-]{1,10}$/i.test(v)) return null
    if (!/\d/.test(v)) return null
    if (/^[A-Z]{2,4}\d{4,}$/.test(v)) return null
    return v
  }

  const extractCardNumberFromPreview = (text) => {
    const content = String(text || '')
    if (!content) return null
    const explicit = content.match(/(?:\bno\.?\s*|\bcard\b\s*(?:#|number|no\.?)?\s*[:#-]?\s*)([A-Z0-9-]{1,10})\b/i)
    if (explicit?.[1] && /\d/.test(explicit[1])) return explicit[1]
    return null
  }

  const scoreCardNumber = (value) => {
    if (!value) return -1
    const v = String(value).trim()
    if (/^\d{3,4}$/.test(v)) return 4
    if (/^[A-Z]?\d{3,4}[A-Z]?$/.test(v)) return 3
    if (/^\d{1,2}$/.test(v)) return 1
    if (/^[A-Z0-9-]{1,10}$/i.test(v) && /\d/.test(v)) return 2
    return 0
  }

  const frontYear = safeYearFrom(frontData.year, frontData.set, frontData.team)
  const backYear = safeYearFrom(backData.year, backData.set, backData.team)
  const mergedYear = finalUiYear(frontYear, backYear)

  const mergedTeam = canonicalTeamFrom(frontData.team, frontData.set, backData.team, backData.set)
  const mergedSet = sanitizeSet(frontData.set) || sanitizeSet(backData.set) || null
  const mergedPlayer = sanitizePlayer(backData.player) || sanitizePlayer(frontData.player) || null
  const mergedPosition = sanitizePosition(backData.position) || sanitizePosition(frontData.position) || null

  const candidates = [
    { value: safeCardNumber(extractCardNumberFromPreview(backData.ocrPreview)), source: 'backPreview' },
    { value: safeCardNumber(backData.topRightCardNumber), source: 'backTopRight' },
    { value: safeCardNumber(backData.cardNumber), source: 'backParsed' },
    { value: safeCardNumber(extractCardNumberFromPreview(frontData.ocrPreview)), source: 'frontPreview' },
    { value: safeCardNumber(frontData.topRightCardNumber), source: 'frontTopRight' },
    { value: safeCardNumber(frontData.cardNumber), source: 'frontParsed' }
  ].filter(item => Boolean(item.value))

  const sourceWeight = {
    backPreview: 50,
    backTopRight: 60,
    backParsed: 40,
    frontPreview: 20,
    frontTopRight: 25,
    frontParsed: 10
  }

  let mergedCardNumber = null
  if (candidates.length) {
    const scoredByValue = new Map()

    for (const candidate of candidates) {
      const value = candidate.value
      const base = scoreCardNumber(value)
      const weight = sourceWeight[candidate.source] || 0
      const current = scoredByValue.get(value) || 0
      scoredByValue.set(value, current + base + weight)
    }

    for (const [value] of scoredByValue.entries()) {
      const corroborationCount = candidates.filter(candidate => candidate.value === value).length
      if (corroborationCount > 1) {
        scoredByValue.set(value, scoredByValue.get(value) + ((corroborationCount - 1) * 30))
      }
    }

    let bestValue = null
    let bestScore = -Infinity
    for (const [value, score] of scoredByValue.entries()) {
      if (score > bestScore) {
        bestScore = score
        bestValue = value
      }
    }

    mergedCardNumber = bestValue
  }

  return {
    player: mergedPlayer,
    team: mergedTeam,
    position: mergedPosition,
    set: mergedSet,
    year: mergedYear,
    cardNumber: mergedCardNumber,
    parallel: frontData.parallel || backData.parallel || null,
    ocrPreview: frontData.ocrPreview || backData.ocrPreview || null
  }
}
