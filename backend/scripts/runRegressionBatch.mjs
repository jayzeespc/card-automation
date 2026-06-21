import fs from 'fs/promises'
import path from 'path'
import { analyzeCardBuffer } from '../services/cardAnalyzer.js'
import { detectFrontBack } from '../services/frontBackDetector.js'
import { mergeFrontBackExtraction } from '../services/cardPairMergeService.js'

const DEFAULT_ROOT = 'D:/Sport Cards/Scanned from Epson/Football'
const rootPath = process.argv[2] || DEFAULT_ROOT
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const pairLimit = limitArg ? Math.max(1, Number(limitArg.split('=')[1] || 0)) : 0
const gateArg = process.argv.find((arg) => arg.startsWith('--gate='))
const gateProfile = String(gateArg?.split('=')[1] || 'beta').trim().toLowerCase()
const failOnGate = process.argv.includes('--fail-on-gate')
const writeReleaseSummary = !process.argv.includes('--skip-release-summary')
const cheapMode = process.argv.includes('--cheap')
const warnSideDisagree = process.argv.includes('--warn-side-disagree')

function normalizePathForCompare(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

const writeLatestReleaseSummary = process.argv.includes('--write-latest')
  || normalizePathForCompare(rootPath) === normalizePathForCompare(DEFAULT_ROOT)

function readNumberArg(flag, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`${flag}=`))
  if (!arg) return Number(fallback)
  const value = Number(arg.split('=')[1])
  return Number.isFinite(value) ? value : Number(fallback)
}

const minPairsArg = readNumberArg('--min-pairs', gateProfile === 'beta' ? 20 : 40)
const minPositionArg = readNumberArg('--min-position', gateProfile === 'beta' ? 85 : 90)
const minYearArg = readNumberArg('--min-year', gateProfile === 'beta' ? 95 : 98)
const minParallelWhenEvidenceArg = readNumberArg('--min-parallel-when-evidence', gateProfile === 'beta' ? 30 : 50)
const minParallelEvidencePctArg = readNumberArg('--min-parallel-evidence-pct', 10)

function sortNames(values) {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of sortNames(entries.map((item) => item.name))) {
    const fullPath = path.join(dirPath, entry)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) {
      files.push(...await walkFiles(fullPath))
    } else if (/\.(jpe?g|png|webp)$/i.test(entry)) {
      files.push(fullPath)
    }
  }

  return files
}

function groupByDirectory(files) {
  const grouped = new Map()
  for (const filePath of files) {
    const dir = path.dirname(filePath)
    const items = grouped.get(dir) || []
    items.push(filePath)
    grouped.set(dir, items)
  }
  return grouped
}

function buildPairs(groupedFiles) {
  const pairs = []
  for (const [dir, items] of groupedFiles.entries()) {
    const ordered = sortNames(items)
    for (let i = 0; i < ordered.length; i += 2) {
      const frontPath = ordered[i]
      const backPath = ordered[i + 1] || null
      pairs.push({
        folder: dir,
        frontPath,
        backPath,
        pairLabel: `${path.basename(frontPath)}${backPath ? ` + ${path.basename(backPath)}` : ''}`
      })
    }
  }
  return pairs
}

function missingFields(record) {
  return ['player', 'team', 'position', 'set', 'year', 'cardNumber', 'parallel'].filter((field) => !record?.[field])
}

function incrementCounter(map, key) {
  map.set(key, Number(map.get(key) || 0) + 1)
}

function bucketCatalogScore(score) {
  const value = Number(score || 0)
  if (value >= 0.9) return '0.90-1.00'
  if (value >= 0.75) return '0.75-0.89'
  if (value >= 0.5) return '0.50-0.74'
  if (value > 0) return '0.01-0.49'
  return '0.00'
}

function toObject(counter) {
  return Object.fromEntries([...counter.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

const PARALLEL_SIGNAL_PATTERNS = [
  [/\btie[ -]?dye\b/i, 'tie-dye'],
  [/\bcracked[ -]?ice\b/i, 'cracked-ice'],
  [/\bcheckerboard\b/i, 'checkerboard'],
  [/\bfluorescent\b/i, 'fluorescent'],
  [/\bsilver\s+prizm\b/i, 'silver-prizm'],
  [/\bsilver\b/i, 'silver'],
  [/\bholo\b/i, 'holo'],
  [/\bdisco\b/i, 'disco'],
  [/\bwave\b/i, 'wave'],
  [/\blaser\b/i, 'laser'],
  [/\bscope\b/i, 'scope'],
  [/\bzebra\b/i, 'zebra'],
  [/\bcamo\b/i, 'camo'],
  [/\bsparkle\b/i, 'sparkle'],
  [/\bmojo\b/i, 'mojo'],
  [/\bgold\b/i, 'gold'],
  [/\bgreen\b/i, 'green'],
  [/\bred\b/i, 'red'],
  [/\bblue\b/i, 'blue'],
  [/\bpurple\b/i, 'purple'],
  [/\bpink\b/i, 'pink'],
  [/\borange\b/i, 'orange']
]

function collectParallelSignals(...texts) {
  const found = new Set()
  for (const text of texts) {
    const normalized = String(text || '')
    if (!normalized) continue
    for (const [pattern, label] of PARALLEL_SIGNAL_PATTERNS) {
      if (pattern.test(normalized)) {
        found.add(label)
      }
    }
  }
  return [...found]
}

function fieldPct(summary, field) {
  return Number(summary?.fieldCoverage?.[field]?.pct || 0)
}

function buildQualityGate(summary) {
  const failures = []
  const warnings = []

  if (summary.pairCount < minPairsArg) {
    failures.push(`pairCount ${summary.pairCount} is below required minimum ${minPairsArg}`)
  }

  const requiredCoverage = {
    player: 98,
    team: 98,
    set: 98,
    cardNumber: 98,
    year: minYearArg,
    position: minPositionArg
  }

  for (const [field, threshold] of Object.entries(requiredCoverage)) {
    const pct = fieldPct(summary, field)
    if (pct < threshold) {
      failures.push(`${field} coverage ${pct}% is below ${threshold}%`)
    }
  }

  const parallelCoverage = fieldPct(summary, 'parallel')
  const parallelEvidencePct = Number(summary?.parallelEvidence?.pairsWithSignalPct || 0)
  if (parallelEvidencePct >= minParallelEvidencePctArg && parallelCoverage < minParallelWhenEvidenceArg) {
    failures.push(`parallel coverage ${parallelCoverage}% is below ${minParallelWhenEvidenceArg}% while parallel signal evidence is ${parallelEvidencePct}%`)
  }

  if (parallelEvidencePct < minParallelEvidencePctArg && parallelCoverage === 0) {
    warnings.push(`parallel coverage is 0%, but only ${parallelEvidencePct}% of pairs show parallel signal tokens`)
  }

  const sideDetectorDisagreePct = Number(summary?.sideDetectorDisagreePct || 0)
  if (warnSideDisagree && sideDetectorDisagreePct > 50) {
    warnings.push(`side detector disagrees with preserved scan order on ${sideDetectorDisagreePct}% of pairs (advisory only)`) 
  }

  return {
    profile: gateProfile,
    pass: failures.length === 0,
    failures,
    warnings,
    thresholds: {
      minPairs: minPairsArg,
      minYearPct: minYearArg,
      minPositionPct: minPositionArg,
      minParallelWhenEvidencePct: minParallelWhenEvidenceArg,
      minParallelEvidencePct: minParallelEvidencePctArg
    }
  }
}

function buildReleaseSummary({ summary, reportPath }) {
  const gate = summary?.qualityGate || {}
  return {
    generatedAt: summary?.generatedAt || new Date().toISOString(),
    rootPath: summary?.rootPath || rootPath,
    reportPath,
    gateProfile: gate.profile || gateProfile,
    readyForBeta: Boolean(gate.pass),
    status: gate.pass ? 'pass' : 'fail',
    pairCount: Number(summary?.pairCount || 0),
    thresholds: gate.thresholds || {},
    coveragePct: {
      player: fieldPct(summary, 'player'),
      team: fieldPct(summary, 'team'),
      position: fieldPct(summary, 'position'),
      set: fieldPct(summary, 'set'),
      year: fieldPct(summary, 'year'),
      cardNumber: fieldPct(summary, 'cardNumber'),
      parallel: fieldPct(summary, 'parallel')
    },
    diagnostics: {
      sideDetectorDisagreePct: Number(summary?.sideDetectorDisagreePct || 0),
      parallelEvidencePct: Number(summary?.parallelEvidence?.pairsWithSignalPct || 0),
      reviewPairCount: Number(summary?.reviewPairCount || 0)
    },
    failures: Array.isArray(gate.failures) ? gate.failures : [],
    warnings: Array.isArray(gate.warnings) ? gate.warnings : []
  }
}

async function analyzeSide(filePath) {
  if (!filePath) return null
  const buffer = await fs.readFile(filePath)
  const [analysis, sideGuess] = await Promise.all([
    analyzeCardBuffer(buffer, { sport: 'Football', disableEnhancementFallback: cheapMode }),
    detectFrontBack(buffer).catch(() => null)
  ])
  return {
    filePath,
    fileName: path.basename(filePath),
    sideGuess,
    analysis
  }
}

async function run() {
  const files = await walkFiles(rootPath)
  const grouped = groupByDirectory(files)
  let pairs = buildPairs(grouped)
  if (pairLimit > 0) pairs = pairs.slice(0, pairLimit)

  const variantUsage = new Map()
  const sidePatterns = new Map()
  const catalogBuckets = new Map()
  const fieldCoverage = new Map()
  const folderCounts = new Map()
  const parallelSignalTokens = new Map()
  let pairsWithParallelSignal = 0
  let missingParallelButSignalCount = 0
  let sideDetectorDisagreeCount = 0
  const reviewPairs = []
  const results = []

  for (const pair of pairs) {
    incrementCounter(folderCounts, path.basename(pair.folder) || pair.folder)
    const front = await analyzeSide(pair.frontPath)
    const back = pair.backPath ? await analyzeSide(pair.backPath) : null
    const combined = back
      ? mergeFrontBackExtraction(front?.analysis || {}, back?.analysis || {})
      : mergeFrontBackExtraction(front?.analysis || {}, {})
    const combinedMissing = missingFields(combined)

    const parallelSignals = collectParallelSignals(
      combined?.ocrPreview,
      front?.analysis?.ocrPreview,
      back?.analysis?.ocrPreview
    )
    if (parallelSignals.length > 0) {
      pairsWithParallelSignal += 1
      if (!combined?.parallel) {
        missingParallelButSignalCount += 1
      }
      for (const token of parallelSignals) {
        incrementCounter(parallelSignalTokens, token)
      }
    }

    incrementCounter(variantUsage, front?.analysis?.analysisVariant || 'unknown')
    incrementCounter(catalogBuckets, bucketCatalogScore(front?.analysis?.diagnostics?.catalogMatchScore))
    if (back) {
      incrementCounter(variantUsage, back?.analysis?.analysisVariant || 'unknown')
      incrementCounter(catalogBuckets, bucketCatalogScore(back?.analysis?.diagnostics?.catalogMatchScore))
    }

    const sidePattern = `${front?.sideGuess || 'unknown'}/${back?.sideGuess || 'none'}`
    incrementCounter(sidePatterns, sidePattern)

    for (const field of ['player', 'team', 'position', 'set', 'year', 'cardNumber', 'parallel']) {
      if (combined[field]) incrementCounter(fieldCoverage, field)
    }

    const row = {
      folder: pair.folder,
      pairLabel: pair.pairLabel,
      orderAssumption: 'scan-order-preserved',
      combined,
      combinedMissing,
      front: front ? {
        fileName: front.fileName,
        sideGuess: front.sideGuess,
        variant: front.analysis.analysisVariant,
        diagnostics: front.analysis.diagnostics,
        parsed: {
          player: front.analysis.player || '',
          team: front.analysis.team || '',
          set: front.analysis.set || '',
          year: front.analysis.year || '',
          cardNumber: front.analysis.cardNumber || ''
        }
      } : null,
      back: back ? {
        fileName: back.fileName,
        sideGuess: back.sideGuess,
        variant: back.analysis.analysisVariant,
        diagnostics: back.analysis.diagnostics,
        parsed: {
          player: back.analysis.player || '',
          team: back.analysis.team || '',
          set: back.analysis.set || '',
          year: back.analysis.year || '',
          cardNumber: back.analysis.cardNumber || ''
        }
      } : null
    }

    const contradictoryOrder = front?.sideGuess === 'back' || (back && back.sideGuess === 'front')
    if (contradictoryOrder) sideDetectorDisagreeCount += 1
    if (combinedMissing.length >= 3 || contradictoryOrder) {
      reviewPairs.push({
        folder: pair.folder,
        pairLabel: pair.pairLabel,
        combinedMissing,
        sidePattern,
        note: contradictoryOrder
          ? 'Side detector disagrees with preserved scan order; detector is advisory only.'
          : 'Field coverage review suggested.'
      })
    }

    results.push(row)
  }

  const summary = {
    rootPath,
    generatedAt: new Date().toISOString(),
    pairCount: results.length,
    imageCount: results.reduce((total, row) => total + (row.back ? 2 : 1), 0),
    fieldCoverage: Object.fromEntries(
      ['player', 'team', 'position', 'set', 'year', 'cardNumber', 'parallel'].map((field) => [
        field,
        {
          hits: Number(fieldCoverage.get(field) || 0),
          pct: results.length ? Number(((Number(fieldCoverage.get(field) || 0) / results.length) * 100).toFixed(2)) : 0
        }
      ])
    ),
    variantUsage: toObject(variantUsage),
    catalogMatchBuckets: toObject(catalogBuckets),
    sidePatterns: toObject(sidePatterns),
    sideDetectorDisagreeCount,
    sideDetectorDisagreePct: results.length ? Number(((sideDetectorDisagreeCount / results.length) * 100).toFixed(2)) : 0,
    parallelEvidence: {
      pairsWithSignal: pairsWithParallelSignal,
      pairsWithSignalPct: results.length ? Number(((pairsWithParallelSignal / results.length) * 100).toFixed(2)) : 0,
      missingParallelButSignalCount,
      signalTokens: toObject(parallelSignalTokens)
    },
    folderCounts: toObject(folderCounts),
    reviewPairCount: reviewPairs.length,
    reviewPairs: reviewPairs.slice(0, 100),
    runMode: {
      cheapMode
    }
  }

  summary.qualityGate = buildQualityGate(summary)

  const report = { summary, results }
  const reportsDir = path.resolve('data', 'reports')
  await fs.mkdir(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const reportPath = path.join(reportsDir, `regression-${stamp}.json`)
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

  const releaseSummary = buildReleaseSummary({ summary, reportPath })
  let releaseSummaryPath = null
  let releaseSummaryLatestPath = null
  if (writeReleaseSummary) {
    releaseSummaryPath = path.join(reportsDir, `beta-readiness-${stamp}.json`)
    await fs.writeFile(releaseSummaryPath, JSON.stringify(releaseSummary, null, 2), 'utf8')

    if (writeLatestReleaseSummary) {
      releaseSummaryLatestPath = path.join(reportsDir, 'beta-readiness-latest.json')
      await fs.writeFile(releaseSummaryLatestPath, JSON.stringify(releaseSummary, null, 2), 'utf8')
    }
  }

  console.log(JSON.stringify({ reportPath, releaseSummaryPath, releaseSummaryLatestPath, summary, releaseSummary }, null, 2))

  if (failOnGate && summary?.qualityGate && !summary.qualityGate.pass) {
    process.exitCode = 1
  }
}

await run()
