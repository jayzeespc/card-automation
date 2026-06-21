let BACKEND_URL = null;
const BACKEND_PORTS = [3000, 3001, 3002];
const FRONTEND_BUILD = '20260621k';
const ALLOWED_CARD_YEARS = ['2025', '2026', '2025-2026'];
const SKU_COMMITTED_COUNTER_KEY = 'cardAutoCommittedSkuCounter';
const ACTIVE_SPORT_KEY = 'cardAutoActiveSport';
const ACTIVE_PAGE_KEY = 'cardAutoActivePage';
const IMPORT_IN_PROGRESS_KEY = 'cardAutoImportInProgress';
const SCAN_DRAFT_KEY = 'cardAutoScanDraft';
const SCAN_DRAFT_DB_NAME = 'cardAutoScanDraftDB';
const SCAN_DRAFT_STORE = 'drafts';
const SCAN_DRAFT_RECORD_ID = 'current';
const IMPORT_AI_CONCURRENCY = 1;
const OCR_WINDOW_MS = 60_000;
const OCR_MAX_PER_WINDOW = 30;
const OCR_CLIENT_HEADROOM = 8;
const OCR_MIN_INTERVAL_MS = 2500;

let ocrWindowStartMs = Date.now();
let ocrCallsInWindow = 0;
let ocrLastCallStartMs = 0;
const NFL_TEAM_OPTIONS = [
  'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills', 'Carolina Panthers',
  'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns', 'Dallas Cowboys', 'Denver Broncos',
  'Detroit Lions', 'Green Bay Packers', 'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars',
  'Kansas City Chiefs', 'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
  'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants', 'New York Jets',
  'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers', 'Seattle Seahawks',
  'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders'
];

console.log(`[Card Automation UI] build=${FRONTEND_BUILD}`);

async function initializeAppBadge() {
  try {
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/config`)
    const data = await res.json()
    const badge = document.getElementById('envBadge')
    if (badge && data?.app?.environment) {
      badge.textContent = `[${data.app.environment.toUpperCase()}]`
      if (data.app.environment === 'qa') {
        badge.style.color = '#ff8800'
      } else if (data.app.environment === 'prod') {
        badge.style.color = '#00aa00'
      }
    }
  } catch (err) {
    console.warn('Could not load app environment badge', err)
  }
}

const dropZone = document.getElementById("dropZone");
const quickAddDropZone = document.getElementById("quickAddDropZone");
const fileInput = document.getElementById("fileInput");
const tableBody = document.getElementById("tableBody");
const aiToggle = document.getElementById("aiToggle");
const autoDetectSidesToggle = document.getElementById("autoDetectSidesToggle");
const taskProgress = document.getElementById("taskProgress");
const taskProgressLabel = document.getElementById("taskProgressLabel");
const taskProgressCount = document.getElementById("taskProgressCount");
const taskProgressBar = document.getElementById("taskProgressBar");
const taskProgressMessage = document.getElementById("taskProgressMessage");
const taskProgressCancel = document.getElementById("taskProgressCancel");
const imageViewerModal = document.getElementById("imageViewerModal");
const imageViewerImg = document.getElementById("imageViewerImg");
const imageViewerCaption = document.getElementById("imageViewerCaption");
const imageViewerClose = document.getElementById("imageViewerClose");
const imageViewerStage = document.getElementById("imageViewerStage");
const imageZoomIn = document.getElementById("imageZoomIn");
const imageZoomOut = document.getElementById("imageZoomOut");
const imageZoomReset = document.getElementById("imageZoomReset");
const imagePrev = document.getElementById("imagePrev");
const imageNext = document.getElementById("imageNext");
const sportSelect = document.getElementById("sportSelect");
const navHomeBtn = document.getElementById("navHomeBtn");
const navScanBtn = document.getElementById("navScanBtn");
const navInventoryBtn = document.getElementById("navInventoryBtn");
const homeGoScanBtn = document.getElementById("homeGoScanBtn");
const homeGoInventoryBtn = document.getElementById("homeGoInventoryBtn");
const homePage = document.getElementById("homePage");
const scanPage = document.getElementById("scanPage");
const inventoryPage = document.getElementById("inventoryPage");
const saveInventoryBtn = document.getElementById("saveInventoryBtn");
const refreshInventoryBtn = document.getElementById("refreshInventoryBtn");
const inventoryBody = document.getElementById("inventoryBody");
const exportEbayCsvBtn = document.getElementById("exportEbayCsvBtn");
const verifyEbayFieldsBtn = document.getElementById("verifyEbayFieldsBtn");
const clearSportInventoryBtn = document.getElementById("clearSportInventoryBtn");
const clearAllInventoryBtn = document.getElementById("clearAllInventoryBtn");
const discardScanDraftBtn = document.getElementById("discardScanDraftBtn");
const inventoryStatus = document.getElementById("inventoryStatus");
const listingTemplateSelect = document.getElementById("listingTemplateSelect");
const listingCardIdInput = document.getElementById("listingCardIdInput");
const listingChaseCardIdInput = document.getElementById("listingChaseCardIdInput");
const buildListingDraftBtn = document.getElementById("buildListingDraftBtn");
const listingDraftOutput = document.getElementById("listingDraftOutput");
const quickAddFilesBtn = document.getElementById("quickAddFilesBtn");
const importPrefillModal = document.getElementById("importPrefillModal");
const closeImportPrefillModal = document.getElementById("closeImportPrefillModal");
const cancelImportPrefillBtn = document.getElementById("cancelImportPrefillBtn");
const confirmImportPrefillBtn = document.getElementById("confirmImportPrefillBtn");
const prefillImportSummary = document.getElementById("prefillImportSummary");
const prefillTeamInput = document.getElementById("prefillTeamInput");
const prefillSetInput = document.getElementById("prefillSetInput");
const prefillYearDetails = document.getElementById("prefillYearDetails");
const prefillYearSummary = document.getElementById("prefillYearSummary");
const prefillYearChecklist = document.getElementById("prefillYearChecklist");
const prefillTeamOptions = document.getElementById("prefillTeamOptions");
const prefillTeamChips = document.getElementById("prefillTeamChips");
const prefillSetSelect = document.getElementById("prefillSetSelect");
const clearPrefillSetsBtn = document.getElementById("clearPrefillSetsBtn");

let viewerScale = 1;
let viewerOffsetX = 0;
let viewerOffsetY = 0;
let isViewerDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let viewerItems = [];
let viewerIndex = -1;
let progressCancelHandler = null;
let currentUploadSession = null;
let pendingImportFiles = [];
let selectedPrefillTeams = [];
let selectedPrefillSets = [];
let selectedPrefillYears = [];
let skuSessionCursor = null;
let listingTemplatesLoaded = false;
let catalogSetOptions = [];
let scanDraftPersistTimer = null;
let scanDraftPersistInFlight = false;
let scanDraftPersistFailed = false;
let scanDraftDbPromise = null;
let scanDraftRestoreInProgress = false;
let forceSkuResetOnNextImport = false;

function normalizePrefillValue(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function splitPrefillEntries(value) {
  return String(value || '')
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function addPrefillEntries(kind, rawValue) {
  const entries = Array.isArray(rawValue) ? rawValue : splitPrefillEntries(rawValue)
  if (!entries.length) return

  const target = kind === 'team' ? selectedPrefillTeams : selectedPrefillSets
  entries.forEach((entry) => {
    if (!entry) return
    const exists = target.some((item) => normalizePrefillValue(item) === normalizePrefillValue(entry))
    if (!exists) target.push(entry)
  })

  if (kind === 'team') renderPrefillSelections()
  else renderSetOptions()
}

function removePrefillEntry(kind, value) {
  const normalized = normalizePrefillValue(value)
  if (kind === 'team') {
    selectedPrefillTeams = selectedPrefillTeams.filter((item) => normalizePrefillValue(item) !== normalized)
  } else {
    selectedPrefillSets = selectedPrefillSets.filter((item) => normalizePrefillValue(item) !== normalized)
  }
  if (kind === 'team') renderPrefillSelections()
  else renderSetOptions()
}

function renderPrefillSelections() {
  const values = selectedPrefillTeams
  const container = prefillTeamChips
  if (!container) return
  container.innerHTML = ''

  values.forEach((value) => {
    const chip = document.createElement('span')
    chip.className = 'prefill-chip'
    chip.textContent = value

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.setAttribute('aria-label', `Remove ${value}`)
    removeBtn.textContent = 'x'
    removeBtn.addEventListener('click', () => removePrefillEntry('team', value))

    chip.appendChild(removeBtn)
    container.appendChild(chip)
  })
}

function formatCatalogSetLabel(setItem) {
  const year = String(setItem?.year || '').trim()
  const brand = String(setItem?.brand || '').trim()
  const setName = String(setItem?.setName || '').trim()
  return [year, brand, setName].filter(Boolean).join(' ').trim() || setName || brand || year || 'Unknown set'
}

function getMergedSetOptions() {
  const merged = []
  const seen = new Set()

  const push = (value, label = value) => {
    const clean = String(value || '').trim()
    const cleanLabel = String(label || clean).trim()
    const key = normalizePrefillValue(clean)
    if (!clean || !key || seen.has(key)) return
    seen.add(key)
    merged.push({ value: clean, label: cleanLabel })
  }

  catalogSetOptions.forEach((setItem) => push(formatCatalogSetLabel(setItem)))
  getPrefillOptionsForKind('set').forEach((item) => push(item))
  selectedPrefillSets.forEach((item) => push(item))

  return merged
}

function renderSetOptions() {
  if (!prefillSetSelect) return

  const options = getMergedSetOptions()
  const selectedKeys = new Set(selectedPrefillSets.map((item) => normalizePrefillValue(item)))

  prefillSetSelect.innerHTML = ''

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = options.length ? 'Choose a set from the database' : 'No sets found'
  placeholder.disabled = true
  placeholder.selected = selectedKeys.size === 0
  prefillSetSelect.appendChild(placeholder)

  options.forEach((option) => {
    const opt = document.createElement('option')
    opt.value = option.value
    opt.textContent = option.label
    if (selectedKeys.has(normalizePrefillValue(option.value))) {
      opt.selected = true
    }
    prefillSetSelect.appendChild(opt)
  })

  selectedPrefillSets.forEach((selectedValue) => {
    const normalized = normalizePrefillValue(selectedValue)
    if (!normalized) return
    if (options.some((option) => normalizePrefillValue(option.value) === normalized)) return

    const custom = document.createElement('option')
    custom.value = selectedValue
    custom.textContent = selectedValue
    custom.selected = true
    prefillSetSelect.appendChild(custom)
  })
}

function commitPendingPrefillInput(kind) {
  const input = kind === 'team' ? prefillTeamInput : prefillSetInput
  const value = String(input?.value || '').trim()
  if (!value) return
  addPrefillEntries(kind, value)
  if (input) input.value = ''
  if (kind === 'set') renderSetOptions()
}

function prefillHistoryKey(kind) {
  return `cardAutoPrefill:${activeSport()}:${kind}`
}

function getPrefillHistory(kind) {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefillHistoryKey(kind)) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function getPrefillOptionsForKind(kind) {
  const saved = getPrefillHistory(kind)
  const defaults = (kind === 'team' && activeSport() === 'Football') ? NFL_TEAM_OPTIONS : []
  const merged = [...saved, ...defaults]
  const deduped = []
  const seen = new Set()

  merged.forEach((item) => {
    const clean = String(item || '').trim()
    if (!clean) return
    const key = normalizePrefillValue(clean)
    if (!key || seen.has(key)) return
    seen.add(key)
    deduped.push(clean)
  })

  return deduped
}

function clearPrefillHistory(kind) {
  const suffix = `:${kind}`
  const keysToRemove = []

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key) continue
    if (key.startsWith('cardAutoPrefill:') && key.endsWith(suffix)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key))
  renderPrefillHistoryOptions()
  if (kind === 'set') renderSetOptions()
}

function getYearOptions() {
  const currentYear = new Date().getFullYear()
  const years = []
  for (let year = currentYear; year >= 2000; year -= 1) {
    years.push(String(year))
  }
  return years
}

function renderYearChecklist() {
  if (!prefillYearChecklist || !prefillYearSummary) return

  const options = getYearOptions()
  prefillYearChecklist.innerHTML = ''

  options.forEach((yearValue) => {
    const label = document.createElement('label')
    label.className = 'prefill-year-option'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selectedPrefillYears.includes(yearValue)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!selectedPrefillYears.includes(yearValue)) selectedPrefillYears.push(yearValue)
      } else {
        selectedPrefillYears = selectedPrefillYears.filter((value) => value !== yearValue)
      }
      renderYearChecklist()
    })

    const text = document.createElement('span')
    text.textContent = yearValue

    label.appendChild(checkbox)
    label.appendChild(text)
    prefillYearChecklist.appendChild(label)
  })

  const sortedYears = [...selectedPrefillYears].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (sortedYears.length === 1) {
    prefillYearSummary.textContent = String(sortedYears[0])
  } else if (sortedYears.length === 2) {
    prefillYearSummary.textContent = `${sortedYears[0]}-${sortedYears[1]}`
  } else if (sortedYears.length > 2) {
    prefillYearSummary.textContent = `${sortedYears[0]}-${sortedYears[sortedYears.length - 1]}`
  } else {
    prefillYearSummary.textContent = 'Select year options'
  }
}

function derivePrefillYearValue() {
  const sortedYears = [...selectedPrefillYears].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!sortedYears.length) return ''
  if (sortedYears.length === 1) return String(sortedYears[0])
  if (sortedYears.length === 2) return `${sortedYears[0]}-${sortedYears[1]}`
  return `${sortedYears[0]}-${sortedYears[sortedYears.length - 1]}`
}

function reduceBrowserAutocompleteNoise() {
  const lockInput = (input, baseName) => {
    if (!input) return
    input.setAttribute('autocomplete', 'off')
    input.setAttribute('autocorrect', 'off')
    input.setAttribute('autocapitalize', 'off')
    input.setAttribute('spellcheck', 'false')
    input.setAttribute('name', `${baseName}-${Date.now()}`)
  }

  lockInput(prefillTeamInput, 'prefill-team')
  lockInput(prefillSetInput, 'prefill-set')
}

function savePrefillHistoryValue(kind, value) {
  const clean = String(value || '').trim()
  if (!clean) return
  const next = [clean, ...getPrefillHistory(kind).filter((item) => item !== clean)].slice(0, 12)
  localStorage.setItem(prefillHistoryKey(kind), JSON.stringify(next))
}

function renderPrefillHistoryOptions() {
  if (prefillTeamOptions) {
    prefillTeamOptions.innerHTML = ''
    getPrefillOptionsForKind('team').forEach((item) => {
      const option = document.createElement('option')
      option.value = item
      prefillTeamOptions.appendChild(option)
    })
  }
  renderSetOptions()
}

function updateQueuedFileFeedback(files) {
  void files
}

async function loadCatalogSetOptions() {
  try {
    const backendUrl = await getBackendUrl()
    const sport = encodeURIComponent(activeSport())
    const res = await fetch(`${backendUrl}/catalog/sets?sport=${sport}`)
    const data = await res.json()
    catalogSetOptions = Array.isArray(data?.items) ? data.items : []
  } catch (err) {
    console.warn('Could not load catalog set options', err)
    catalogSetOptions = []
  }
  renderSetOptions()
}

async function preScanImportFiles(files) {
  const sampleFiles = (files || []).slice(0, 1)
  const sets = []
  const teams = []
  const years = []

  const results = await Promise.all(sampleFiles.map(async (file) => {
    try {
      const buffer = await file.arrayBuffer()
      return await analyzeImageBuffer(buffer)
    } catch (err) {
      console.warn('Import pre-scan failed for a file', err)
      return null
    }
  }))

  results.forEach((result) => {
    if (!result) return
    const setValue = String(result?.set || '').trim()
    const teamValue = String(result?.team || '').trim()
    const yearValue = String(result?.year || '').trim()
    if (setValue) sets.push(setValue)
    if (teamValue) teams.push(teamValue)
    if (yearValue) years.push(yearValue)
  })

  return {
    sets,
    teams,
    years
  }
}

async function openImportPrefillDialog(files) {
  if (!files?.length || !importPrefillModal) return
  pendingImportFiles = files
  startProgress('Scanning imported cards for suggested set options...', Math.max(1, Math.min(files.length, 2)))
  const preScan = await preScanImportFiles(files)
  finishProgress('Scan complete. Review the suggested defaults below.')

  await loadCatalogSetOptions()

  const catalogSuggestion = preScan.sets[0] || ''
  const catalogSuggestionKey = normalizePrefillValue(catalogSuggestion)
  const catalogMatch = catalogSetOptions.find((setItem) => normalizePrefillValue(formatCatalogSetLabel(setItem)) === catalogSuggestionKey)
  selectedPrefillSets = [catalogMatch ? formatCatalogSetLabel(catalogMatch) : catalogSuggestion].filter(Boolean)
  selectedPrefillTeams = [...new Set(preScan.teams)].slice(0, 3)
  selectedPrefillYears = [...new Set(preScan.years)].slice(0, 2)

  renderPrefillHistoryOptions()
  updateQueuedFileFeedback(files)

  const pairCount = Math.ceil(files.length / 2)
  if (prefillImportSummary) {
    const setLabel = selectedPrefillSets[0] || 'database sets'
    prefillImportSummary.textContent = `Scanned ${files.length} image${files.length === 1 ? '' : 's'} across ${pairCount} pair${pairCount === 1 ? '' : 's'}. Suggested set: ${setLabel}.`
  }

  if (prefillTeamInput) prefillTeamInput.value = ''
  if (prefillSetInput) prefillSetInput.value = ''
  renderPrefillSelections()
  renderSetOptions()
  renderYearChecklist()

  importPrefillModal.classList.add('active')
}

function closeImportPrefillDialog() {
  if (!importPrefillModal) return
  importPrefillModal.classList.remove('active')
  pendingImportFiles = []
}

function collectImportPrefill() {
  commitPendingPrefillInput('team')
  commitPendingPrefillInput('set')

  return {
    teams: [...selectedPrefillTeams],
    sets: [...selectedPrefillSets],
    year: derivePrefillYearValue()
  }
}

function triggerFilePicker() {
  fileInput?.click()
}

function queueFilesForImport(files) {
  const cleanFiles = sortImportedFiles((files || []).filter(Boolean))
  if (!cleanFiles.length) return
  updateQueuedFileFeedback(cleanFiles)
  void openImportPrefillDialog(cleanFiles)
}

function sortImportedFiles(files) {
  return [...files].sort((a, b) => {
    const aPath = String(a?.webkitRelativePath || a?.name || '')
    const bPath = String(b?.webkitRelativePath || b?.name || '')
    if (aPath !== bPath) return aPath.localeCompare(bPath, undefined, { numeric: true, sensitivity: 'base' })

    const aTime = Number(a?.lastModified || 0)
    const bTime = Number(b?.lastModified || 0)
    if (aTime !== bTime) return aTime - bTime

    const aSize = Number(a?.size || 0)
    const bSize = Number(b?.size || 0)
    if (aSize !== bSize) return aSize - bSize

    return 0
  })
}

function applyImportPrefillToRow(row, prefill) {
  if (!row || !prefill) return

  const chooseCandidate = (options, currentValue) => {
    const cleanOptions = (options || []).map((item) => String(item || '').trim()).filter(Boolean)
    if (!cleanOptions.length) return ''
    if (cleanOptions.length === 1) return cleanOptions[0]

    const normalizedCurrent = normalizePrefillValue(currentValue)
    if (!normalizedCurrent) return ''

    let best = ''
    let bestScore = 0

    cleanOptions.forEach((option) => {
      const normalizedOption = normalizePrefillValue(option)
      let score = 0
      if (!normalizedOption) return
      if (normalizedCurrent === normalizedOption) score = 100
      else if (normalizedCurrent.includes(normalizedOption) || normalizedOption.includes(normalizedCurrent)) score = 70
      else {
        const optionTokens = new Set(normalizedOption.split(' ').filter(Boolean))
        const currentTokens = new Set(normalizedCurrent.split(' ').filter(Boolean))
        let overlap = 0
        optionTokens.forEach((token) => {
          if (currentTokens.has(token)) overlap += 1
        })
        score = overlap * 20
      }

      if (score > bestScore) {
        bestScore = score
        best = option
      }
    })

    return bestScore >= 40 ? best : ''
  }

  const teamInput = row.querySelector('.team')
  const setInput = row.querySelector('.set')
  const yearInput = row.querySelector('.year')

  if (teamInput) {
    const chosenTeam = chooseCandidate(prefill.teams, teamInput.value)
    if (chosenTeam) teamInput.value = chosenTeam
    else if (!String(teamInput.value || '').trim() && prefill.teams?.length === 1) teamInput.value = prefill.teams[0]
  }

  if (setInput) {
    const chosenSet = chooseCandidate(prefill.sets, setInput.value)
    if (chosenSet) setInput.value = chosenSet
    else if (!String(setInput.value || '').trim() && prefill.sets?.length === 1) setInput.value = prefill.sets[0]
  }

  const yearValue = String(prefill.year || '').trim()
  if (yearInput && yearValue && !String(yearInput.value || '').trim()) {
    yearInput.value = yearValue
  }
}

function activeSport() {
  return String(sportSelect?.value || 'Football')
}

function getScanDraftDb() {
  if (scanDraftDbPromise) return scanDraftDbPromise

  scanDraftDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(SCAN_DRAFT_DB_NAME, 1)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SCAN_DRAFT_STORE)) {
        db.createObjectStore(SCAN_DRAFT_STORE, { keyPath: 'id' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Failed to open scan draft DB'))
  })

  return scanDraftDbPromise
}

async function idbPutDraft(record) {
  const db = await getScanDraftDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SCAN_DRAFT_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to write scan draft'))
    tx.objectStore(SCAN_DRAFT_STORE).put(record)
  })
}

async function idbGetDraft() {
  const db = await getScanDraftDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(SCAN_DRAFT_STORE, 'readonly')
    const req = tx.objectStore(SCAN_DRAFT_STORE).get(SCAN_DRAFT_RECORD_ID)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error || new Error('Failed to read scan draft'))
  })
}

async function idbDeleteDraft() {
  const db = await getScanDraftDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SCAN_DRAFT_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to delete scan draft'))
    tx.objectStore(SCAN_DRAFT_STORE).delete(SCAN_DRAFT_RECORD_ID)
  })
}

function buildRowDraftEntry(row) {
  const data = collectRowData(row)

  return {
    data,
    frontBuffer: row.frontBuffer ? row.frontBuffer.slice(0) : null,
    backBuffer: row.backBuffer ? row.backBuffer.slice(0) : null,
    frontName: String(row.frontFile?.name || ''),
    backName: String(row.backFile?.name || ''),
    frontType: String(row.frontFile?.type || 'image/jpeg'),
    backType: String(row.backFile?.type || 'image/jpeg')
  }
}

function markScanDraftPersistFailure(err) {
  if (scanDraftPersistFailed) return
  scanDraftPersistFailed = true
  console.warn('Could not persist scan draft snapshot', err)

  const aiStatus = document.getElementById('aiStatus')
  if (aiStatus) {
    aiStatus.style.display = 'block'
    aiStatus.style.color = '#b00'
    aiStatus.textContent = 'Warning: Autosave for import recovery failed. Save current rows to inventory as soon as possible.'
  }
}

async function persistScanDraftSnapshotNow() {
  if (scanDraftPersistInFlight) return
  scanDraftPersistInFlight = true

  try {
    const rows = [...tableBody.querySelectorAll('tr')]
    const cards = rows.map((row) => buildRowDraftEntry(row))
    const payload = {
      id: SCAN_DRAFT_RECORD_ID,
      version: 2,
      savedAt: Date.now(),
      sport: activeSport(),
      cards
    }

    await idbPutDraft(payload)

    // Keep a lightweight fallback marker in localStorage.
    localStorage.setItem(SCAN_DRAFT_KEY, JSON.stringify({ version: 2, savedAt: payload.savedAt, sport: payload.sport, cardCount: cards.length }))
    scanDraftPersistFailed = false
  } catch (err) {
    markScanDraftPersistFailure(err)
  } finally {
    scanDraftPersistInFlight = false
  }
}

function persistScanDraftSnapshot() {
  if (scanDraftRestoreInProgress) return
  if (scanDraftPersistTimer) clearTimeout(scanDraftPersistTimer)
  scanDraftPersistTimer = setTimeout(() => {
    scanDraftPersistTimer = null
    void persistScanDraftSnapshotNow()
  }, 500)
}

function clearScanDraftSnapshot() {
  if (scanDraftPersistTimer) {
    clearTimeout(scanDraftPersistTimer)
    scanDraftPersistTimer = null
  }

  void idbDeleteDraft().catch((err) => {
    console.warn('Could not clear scan draft snapshot', err)
  })

  try { localStorage.removeItem(SCAN_DRAFT_KEY) } catch {}
}

function discardUnsavedScanDraft() {
  const rows = [...tableBody.querySelectorAll('tr')]
  if (!rows.length) {
    clearScanDraftSnapshot()
    const aiStatus = document.getElementById('aiStatus')
    if (aiStatus) {
      aiStatus.style.display = 'block'
      aiStatus.style.color = '#1c7c2e'
      aiStatus.textContent = 'No unsaved scan rows were present. Cleared any persisted draft snapshot.'
    }
    return
  }

  const confirmed = window.confirm(`Discard ${rows.length} unsaved scan row${rows.length === 1 ? '' : 's'} and clear recovery snapshot? This cannot be undone.`)
  if (!confirmed) return

  if (currentUploadSession && !currentUploadSession.cancelled) {
    currentUploadSession.cancelled = true
    currentUploadSession.controller.abort()
  }

  endSkuSession()
  forceSkuResetOnNextImport = true
  try {
    sessionStorage.removeItem(IMPORT_IN_PROGRESS_KEY)
  } catch {
    // Ignore storage write issues.
  }

  rows.forEach((row) => {
    revokeRowPreviewUrls(row)
    row.remove()
  })

  clearScanDraftSnapshot()
  updatePickFromOptions()
  if (typeof window.requestTableAutoSize === 'function') {
    window.requestTableAutoSize()
  }

  const aiStatus = document.getElementById('aiStatus')
  if (aiStatus) {
    aiStatus.style.display = 'block'
    aiStatus.style.color = '#1c7c2e'
    aiStatus.textContent = 'Unsaved scan draft discarded. Next import will restart SKUs at SKU-000001.'
  }
}

function restoreScanDraftSnapshot() {
  void (async () => {
    try {
      if ([...tableBody.querySelectorAll('tr')].length) return

      const snapshot = await idbGetDraft()
      const cards = Array.isArray(snapshot?.cards) ? snapshot.cards : []
      if (!cards.length) return

      scanDraftRestoreInProgress = true

      cards.forEach((entry) => {
        const frontFile = entry?.frontBuffer
          ? new File([entry.frontBuffer], entry.frontName || 'front.jpg', { type: entry.frontType || 'image/jpeg' })
          : null
        const backFile = entry?.backBuffer
          ? new File([entry.backBuffer], entry.backName || 'back.jpg', { type: entry.backType || 'image/jpeg' })
          : null

        const row = addRow(frontFile, entry?.frontBuffer || null, backFile, entry?.backBuffer || null)
        const card = entry?.data || {}

        row.querySelector('.side').value = String(card?.Side || row.querySelector('.side').value || '')
        row.querySelector('.sku').value = String(card?.SKU || row.querySelector('.sku').value || '')
        row.querySelector('.name').value = String(card?.Name || '')
        row.querySelector('.team').value = String(card?.Team || '')
        row.querySelector('.position').value = String(card?.Position || '')
        row.querySelector('.set').value = String(card?.Set || '')
        row.querySelector('.year').value = String(card?.Year || '')
        row.querySelector('.cardNumber').value = String(card?.CardNumber || '')
        row.querySelector('.quantity').value = String(card?.Quantity || '1')
        row.querySelector('.parallel').value = String(card?.Parallel || '')
        row.querySelector('.rookie').value = String(card?.Rookie || 'No')
        row.querySelector('.autograph').value = String(card?.Autograph || 'No')
        row.querySelector('.title').value = String(card?.Title || '')
        row.querySelector('.description').value = String(card?.Description || '')
        row.querySelector('.pickFrom').value = String(card?.PickFrom || '')
        row.querySelector('.filename').value = String(card?.Filename || '')
        row.querySelector('.pictureUrl').value = String(card?.PictureURL || '')
      })

      updatePickFromOptions()

      const aiStatus = document.getElementById('aiStatus')
      if (aiStatus) {
        aiStatus.style.display = 'block'
        aiStatus.style.color = '#1c7c2e'
        aiStatus.textContent = `Recovered ${cards.length} unsaved rows from previous interrupted import.`
      }
    } catch (err) {
      console.warn('Could not restore scan draft snapshot', err)
    } finally {
      scanDraftRestoreInProgress = false
    }
  })()
}

function setActivePage(page) {
  const safePage = (page === 'scan' || page === 'inventory' || page === 'home') ? page : 'home'
  const pages = [homePage, scanPage, inventoryPage]
  pages.forEach((el) => {
    if (!el) return
    el.classList.remove('active')
  })

  const navButtons = [navHomeBtn, navScanBtn, navInventoryBtn]
  navButtons.forEach((el) => el?.classList.remove('active'))

  if (safePage === 'scan') {
    scanPage?.classList.add('active')
    navScanBtn?.classList.add('active')
  } else if (safePage === 'inventory') {
    inventoryPage?.classList.add('active')
    navInventoryBtn?.classList.add('active')
  } else {
    homePage?.classList.add('active')
    navHomeBtn?.classList.add('active')
  }

  try {
    localStorage.setItem(ACTIVE_PAGE_KEY, safePage)
  } catch {
    // Ignore storage write issues (private mode / quota).
  }
}

function getInitialActivePage() {
  try {
    const importInProgress = sessionStorage.getItem(IMPORT_IN_PROGRESS_KEY) === '1'
    if (importInProgress) {
      sessionStorage.removeItem(IMPORT_IN_PROGRESS_KEY)
      return 'scan'
    }
  } catch {
    // Ignore storage read issues.
  }

  try {
    const savedPage = String(localStorage.getItem(ACTIVE_PAGE_KEY) || '').trim().toLowerCase()
    if (savedPage === 'scan' || savedPage === 'inventory' || savedPage === 'home') {
      return savedPage
    }
  } catch {
    // Ignore storage read issues.
  }

  return 'home'
}

async function loadInventory() {
  if (!inventoryBody) return
  inventoryBody.innerHTML = '<tr><td colspan="11">Loading inventory...</td></tr>'

  try {
    const sport = encodeURIComponent(activeSport())
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory?sport=${sport}`)
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []

    if (!items.length) {
      inventoryBody.innerHTML = '<tr><td colspan="12">No cards in inventory for this sport yet.</td></tr>'
      return
    }

    inventoryBody.innerHTML = ''
    items.forEach((item) => {
      const row = document.createElement('tr')

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.textContent = 'Delete'
      deleteButton.addEventListener('click', async () => {
        await deleteInventoryRow(item.id)
      })

      const actionsCell = document.createElement('td')
      actionsCell.appendChild(deleteButton)

      row.innerHTML = `
        <td>${item.id || ''}</td>
        <td>${item.sport || ''}</td>
        <td>${item.sku || ''}</td>
        <td>${item.name || ''}</td>
        <td>${item.team || ''}</td>
        <td>${item.set || ''}</td>
        <td>${item.year || ''}</td>
        <td>${item.cardNumber || ''}</td>
        <td>${item.quantity || 1}</td>
        <td>${item.parallel || ''}</td>
        <td>${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}</td>
      `
      row.appendChild(actionsCell)
      inventoryBody.appendChild(row)
    })
  } catch (err) {
    inventoryBody.innerHTML = '<tr><td colspan="11">Failed to load inventory.</td></tr>'
    console.error('Inventory load failed:', err)
  }
}

async function deleteInventoryRow(id) {
  const confirmed = window.confirm('Delete this inventory row?')
  if (!confirmed) return

  try {
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })

    let data = null
    let rawText = ''
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      data = await res.json()
    } else {
      rawText = await res.text()
    }

    if (!res.ok) {
      const detail = data?.error || rawText || `HTTP ${res.status}`
      throw new Error(`Failed to delete inventory row: ${detail}`)
    }

    showInventoryStatus('Inventory row deleted.')
    await loadInventory()
  } catch (err) {
    showInventoryStatus(`Delete failed: ${err.message || 'Unknown error'}`, true)
  }
}

async function clearInventory(mode) {
  const isAll = mode === 'all'
  const sport = activeSport()
  const message = isAll
    ? 'Clear ALL inventory across all sports? This cannot be undone.'
    : `Clear all ${sport} inventory rows? This cannot be undone.`

  const confirmed = window.confirm(message)
  if (!confirmed) return

  try {
    const backendUrl = await getBackendUrl()
    const qs = isAll ? 'all=true' : `sport=${encodeURIComponent(sport)}`
    const res = await fetch(`${backendUrl}/inventory?${qs}`, { method: 'DELETE' })

    let data = null
    let rawText = ''
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      data = await res.json()
    } else {
      rawText = await res.text()
    }

    if (!res.ok) {
      const detail = data?.error || rawText || `HTTP ${res.status}`
      throw new Error(`Failed to clear inventory: ${detail}`)
    }

    const scopeLabel = isAll ? 'all sports' : sport
    showInventoryStatus(`Cleared ${data.deleted || 0} inventory rows for ${scopeLabel}.`)
    await loadInventory()
  } catch (err) {
    showInventoryStatus(`Clear inventory failed: ${err.message || 'Unknown error'}`, true)
  }
}

function showInventoryStatus(message, isError = false) {
  if (!inventoryStatus) return
  inventoryStatus.style.display = 'block'
  inventoryStatus.style.color = isError ? '#a52020' : '#3f4f8e'
  inventoryStatus.textContent = message
}

async function loadListingTemplates() {
  if (!listingTemplateSelect || listingTemplatesLoaded) return

  try {
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/catalog/templates`)
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []

    listingTemplateSelect.innerHTML = ''

    if (!items.length) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No templates found'
      listingTemplateSelect.appendChild(option)
      return
    }

    items.forEach((item) => {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = `${item.name} (${item.resolvedType || item.templateType})`
      listingTemplateSelect.appendChild(option)
    })

    listingTemplatesLoaded = true
  } catch (err) {
    console.warn('Could not load listing templates', err)
    if (listingTemplateSelect) {
      listingTemplateSelect.innerHTML = '<option value="">Templates unavailable</option>'
    }
  }
}

async function buildListingDraftFromInventory() {
  if (!listingTemplateSelect || !listingDraftOutput) return

  const templateId = String(listingTemplateSelect.value || '').trim()
  if (!templateId) {
    showInventoryStatus('Choose a template first.', true)
    return
  }

  const rawCardIds = String(listingCardIdInput?.value || '').trim()
  if (!rawCardIds) {
    showInventoryStatus('Enter one or more card IDs first.', true)
    return
  }

  const cardIds = rawCardIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
  const payload = {
    templateId,
    cardIds,
    cardRef: rawCardIds,
    chaseCardId: String(listingChaseCardIdInput?.value || '').trim(),
    chaseCardRef: String(listingChaseCardIdInput?.value || '').trim()
  }

  try {
    listingDraftOutput.textContent = 'Building draft...'
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/catalog/listing-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to build listing draft')
    }

    listingDraftOutput.textContent = JSON.stringify(data, null, 2)
    showInventoryStatus(`Built ${data?.listing?.listingType || 'listing'} draft for ${cardIds.length} card(s).`)
  } catch (err) {
    listingDraftOutput.textContent = `Draft build failed: ${err.message || 'Unknown error'}`
    showInventoryStatus(`Draft build failed: ${err.message || 'Unknown error'}`, true)
  }
}

async function verifyEbayFieldCoverage() {
  try {
    const sport = encodeURIComponent(activeSport())
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory/ebay/coverage?sport=${sport}`)
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to verify eBay fields')
    }

    const mapped = Number(data?.mappedColumns || 0)
    const total = Number(data?.totalColumns || 0)
    const required = Number(data?.requiredColumns || 0)
    const missingRequired = Array.isArray(data?.missingRequiredMappings) ? data.missingRequiredMappings : []

    if (missingRequired.length) {
      showInventoryStatus(`eBay field check: mapped ${mapped}/${total}. Missing required mappings: ${missingRequired.join(', ')}`, true)
      return
    }

    showInventoryStatus(`eBay field check: mapped ${mapped}/${total} columns. Required columns covered: ${required}/${required}.`)
  } catch (err) {
    showInventoryStatus(`eBay field check failed: ${err.message || 'Unknown error'}`, true)
  }
}

async function exportInventoryEbayCsv() {
  try {
    const sport = encodeURIComponent(activeSport())
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory/export/ebay-template.csv?sport=${sport}`)

    if (!res.ok) {
      let errorText = 'Failed to export eBay CSV'
      try {
        const data = await res.json()
        if (data?.error) errorText = data.error
      } catch {
        // Keep fallback text if error response is not JSON.
      }
      throw new Error(errorText)
    }

    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/i)
    const filename = match?.[1] || `ebay-template-${activeSport().toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    showInventoryStatus(`Downloaded eBay template CSV for ${activeSport()}.`)
  } catch (err) {
    showInventoryStatus(`eBay export failed: ${err.message || 'Unknown error'}`, true)
  }
}

async function saveCurrentRowsToInventory() {
  const rows = [...tableBody.querySelectorAll('tr')]
  if (!rows.length) {
    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'block'
    aiStatus.style.color = '#b00'
    aiStatus.textContent = 'No scanned rows to save yet.'
    return
  }

  try {
    const payload = {
      sport: activeSport(),
      cards: rows.map((row) => collectRowData(row))
    }

    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.error || 'Failed to save inventory')
    }

    await refreshCommittedSkuCounterFromInventory()

    // Clear scanned rows after a successful commit to inventory.
    rows.forEach((row) => {
      revokeRowPreviewUrls(row)
      row.remove()
    })
    clearScanDraftSnapshot()
    updatePickFromOptions()
    if (typeof window.requestTableAutoSize === 'function') {
      window.requestTableAutoSize()
    }

    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'block'
    aiStatus.style.color = '#1c7c2e'
    const attemptPart = data?.importAttemptId ? ` Import ID: ${data.importAttemptId}.` : ''
    aiStatus.textContent = `Saved to ${payload.sport} inventory: ${data.inserted || 0} new, ${data.updated || 0} updated.${attemptPart}`
  } catch (err) {
    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'block'
    aiStatus.style.color = '#b00'
    aiStatus.textContent = `Save to inventory failed: ${err.message || 'Unknown error'}`
    console.error('Inventory save failed:', err)
  }
}

function initAppNavigation() {
  const savedSport = localStorage.getItem(ACTIVE_SPORT_KEY)
  if (sportSelect) {
    if (savedSport && [...sportSelect.options].some(o => o.value === savedSport)) {
      sportSelect.value = savedSport
    }

    sportSelect.addEventListener('change', () => {
      localStorage.setItem(ACTIVE_SPORT_KEY, sportSelect.value)
      renderPrefillHistoryOptions()
      loadCatalogSetOptions().catch(() => {})
      if (inventoryPage?.classList.contains('active')) {
        loadInventory()
      }
    })
  }

  navHomeBtn?.addEventListener('click', () => setActivePage('home'))
  navScanBtn?.addEventListener('click', () => setActivePage('scan'))
  navInventoryBtn?.addEventListener('click', async () => {
    setActivePage('inventory')
    await loadListingTemplates()
    await loadInventory()
  })

  homeGoScanBtn?.addEventListener('click', () => setActivePage('scan'))
  homeGoInventoryBtn?.addEventListener('click', async () => {
    setActivePage('inventory')
    await loadListingTemplates()
    await loadInventory()
  })

  refreshInventoryBtn?.addEventListener('click', loadInventory)
  saveInventoryBtn?.addEventListener('click', saveCurrentRowsToInventory)
  verifyEbayFieldsBtn?.addEventListener('click', verifyEbayFieldCoverage)
  exportEbayCsvBtn?.addEventListener('click', exportInventoryEbayCsv)
  clearSportInventoryBtn?.addEventListener('click', () => clearInventory('sport'))
  clearAllInventoryBtn?.addEventListener('click', () => clearInventory('all'))
  buildListingDraftBtn?.addEventListener('click', buildListingDraftFromInventory)
  if (prefillSetSelect) {
    prefillSetSelect.addEventListener('change', () => {
      selectedPrefillSets = [...prefillSetSelect.selectedOptions]
        .map((option) => String(option.value || '').trim())
        .filter(Boolean)
    })
  }
  setActivePage(getInitialActivePage())
  initializeAppBadge()
}

function parseSkuNumber(value) {
  const raw = String(value || '').trim()
  if (!raw) return 0
  const match = raw.match(/(\d{1,10})$/)
  if (!match) return 0
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : 0
}

function getCommittedSkuCounter() {
  const value = Number(localStorage.getItem(SKU_COMMITTED_COUNTER_KEY) || '0')
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function setCommittedSkuCounter(value) {
  const safe = Math.max(0, Math.round(Number(value) || 0))
  localStorage.setItem(SKU_COMMITTED_COUNTER_KEY, String(safe))
}

function getMaxSkuFromCurrentTable() {
  let maxSku = 0
  const rows = [...tableBody.querySelectorAll('tr')]
  rows.forEach((row) => {
    const input = row.querySelector('.sku')
    const skuNumber = parseSkuNumber(input?.value)
    if (skuNumber > maxSku) maxSku = skuNumber
  })
  return maxSku
}

function beginSkuSession() {
  if (forceSkuResetOnNextImport) {
    skuSessionCursor = 1
    forceSkuResetOnNextImport = false
    return
  }

  const baseCounter = Math.max(getCommittedSkuCounter(), getMaxSkuFromCurrentTable())
  skuSessionCursor = baseCounter + 1
}

function endSkuSession() {
  skuSessionCursor = null
}

async function refreshCommittedSkuCounterFromInventory() {
  try {
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/inventory`)
    if (!res.ok) return
    const data = await res.json()
    const items = Array.isArray(data?.items) ? data.items : []
    let maxSku = 0
    items.forEach((item) => {
      const skuNumber = parseSkuNumber(item?.sku)
      if (skuNumber > maxSku) maxSku = skuNumber
    })
    setCommittedSkuCounter(maxSku)
  } catch (err) {
    console.warn('Could not refresh committed SKU counter from inventory', err)
  }
}

function nextSku() {
  if (!Number.isFinite(skuSessionCursor) || skuSessionCursor === null) {
    beginSkuSession()
  }
  const next = skuSessionCursor
  skuSessionCursor += 1
  return `SKU-${String(next).padStart(6, '0')}`
}

function renderViewerTransform() {
  if (!imageViewerImg) return
  imageViewerImg.style.transform = `translate(${viewerOffsetX}px, ${viewerOffsetY}px) scale(${viewerScale})`
}

function resetViewerTransform() {
  viewerScale = 1
  viewerOffsetX = 0
  viewerOffsetY = 0
  renderViewerTransform()
}

function clampViewerScale(nextScale) {
  return Math.min(6, Math.max(1, nextScale))
}

function zoomViewer(multiplier) {
  const next = clampViewerScale(viewerScale * multiplier)
  viewerScale = next
  if (viewerScale === 1) {
    viewerOffsetX = 0
    viewerOffsetY = 0
  }
  renderViewerTransform()
}

function collectViewerItems() {
  const items = []
  const rows = [...tableBody.querySelectorAll('tr')]
  rows.forEach((row, rowIndex) => {
    const images = [...row.querySelectorAll('img.preview')]
    images.forEach((img) => {
      const label = img.closest('.preview-wrap')?.querySelector('.preview-tag')?.textContent || 'Card Image'
      items.push({
        src: img.src,
        caption: `Card ${rowIndex + 1} - ${label}`,
        element: img
      })
    })
  })
  return items
}

function showViewerIndex(index) {
  if (!viewerItems.length || !imageViewerImg) return
  const safe = ((index % viewerItems.length) + viewerItems.length) % viewerItems.length
  viewerIndex = safe
  const item = viewerItems[safe]
  imageViewerImg.src = item.src
  imageViewerCaption.textContent = item.caption
  resetViewerTransform()
  if (imageViewerStage) {
    imageViewerStage.classList.toggle('can-navigate', viewerScale <= 1)
  }
}

function openImageViewerFromElement(img) {
  viewerItems = collectViewerItems()
  viewerIndex = viewerItems.findIndex(item => item.element === img)
  if (viewerIndex < 0) viewerIndex = 0
  imageViewerModal.classList.add('active')
  showViewerIndex(viewerIndex)
}

function showPrevImage() {
  if (!viewerItems.length) return
  showViewerIndex(viewerIndex - 1)
}

function showNextImage() {
  if (!viewerItems.length) return
  showViewerIndex(viewerIndex + 1)
}

if (!dropZone) console.warn('dropZone element not found')
if (!fileInput) console.warn('fileInput element not found')
if (!tableBody) console.warn('tableBody element not found')
if (!aiToggle) console.warn('aiToggle element not found')

function startProgress(label, total) {
  if (!taskProgress) return
  taskProgress.style.display = 'block'
  taskProgressLabel.textContent = label
  taskProgressCount.textContent = `0 / ${total}`
  taskProgressBar.style.width = '0%'
  taskProgressMessage.textContent = 'Starting...'
  keepProgressInView()
}

function setProgressCancel(handler) {
  progressCancelHandler = handler || null
  if (!taskProgressCancel) return
  taskProgressCancel.style.display = progressCancelHandler ? 'inline-block' : 'none'
  taskProgressCancel.disabled = false
}

if (taskProgressCancel) {
  taskProgressCancel.addEventListener('click', () => {
    if (!progressCancelHandler) return
    progressCancelHandler()
  })
}

function keepProgressInView() {
  void taskProgress
}

function updateProgress(current, total, message) {
  if (!taskProgress) return
  const safeTotal = Math.max(total, 1)
  const pct = Math.min(100, Math.round((current / safeTotal) * 100))
  taskProgressCount.textContent = `${current} / ${safeTotal}`
  taskProgressBar.style.width = `${pct}%`
  if (message) taskProgressMessage.textContent = message
  keepProgressInView()
}

function finishProgress(message = 'Done') {
  if (!taskProgress) return
  taskProgressBar.style.width = '100%'
  taskProgressMessage.textContent = message
  setProgressCancel(null)
  keepProgressInView()
  setTimeout(() => {
    taskProgress.style.display = 'none'
  }, 1200)
}

function openImageViewer(src, caption = '') {
  if (!imageViewerModal || !imageViewerImg) return
  imageViewerModal.classList.add('active')
  viewerItems = [{ src, caption: caption || 'Card Image', element: null }]
  viewerIndex = 0
  showViewerIndex(0)
}

function closeImageViewer() {
  if (!imageViewerModal || !imageViewerImg) return
  imageViewerModal.classList.remove('active')
  imageViewerImg.src = ''
  imageViewerCaption.textContent = ''
  viewerItems = []
  viewerIndex = -1
  if (imageViewerStage) imageViewerStage.classList.remove('dragging')
  isViewerDragging = false
  resetViewerTransform()
}

if (imageViewerClose) {
  imageViewerClose.addEventListener('click', closeImageViewer)
}

if (imageViewerModal) {
  imageViewerModal.addEventListener('click', (e) => {
    if (e.target === imageViewerModal) {
      closeImageViewer()
    }
  })
}

if (imageZoomIn) {
  imageZoomIn.addEventListener('click', () => zoomViewer(1.25))
}

if (imageZoomOut) {
  imageZoomOut.addEventListener('click', () => zoomViewer(0.8))
}

if (imageZoomReset) {
  imageZoomReset.addEventListener('click', () => resetViewerTransform())
}

if (imagePrev) {
  imagePrev.addEventListener('click', showPrevImage)
}

if (imageNext) {
  imageNext.addEventListener('click', showNextImage)
}

if (imageViewerStage) {
  imageViewerStage.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (e.deltaY < 0) zoomViewer(1.1)
    else zoomViewer(0.9)
  }, { passive: false })

  imageViewerStage.addEventListener('mousedown', (e) => {
    if (viewerScale <= 1) return
    isViewerDragging = true
    dragStartX = e.clientX - viewerOffsetX
    dragStartY = e.clientY - viewerOffsetY
    imageViewerStage.classList.add('dragging')
  })

  window.addEventListener('mousemove', (e) => {
    if (!isViewerDragging) return
    viewerOffsetX = e.clientX - dragStartX
    viewerOffsetY = e.clientY - dragStartY
    renderViewerTransform()
  })

  window.addEventListener('mouseup', () => {
    if (!isViewerDragging) return
    isViewerDragging = false
    imageViewerStage.classList.remove('dragging')
  })

  imageViewerStage.addEventListener('click', (e) => {
    if (viewerScale > 1) return
    const rect = imageViewerStage.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) showPrevImage()
    else showNextImage()
  })
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imageViewerModal?.classList.contains('active')) {
    closeImageViewer()
  }
  if (e.key === 'ArrowLeft' && imageViewerModal?.classList.contains('active')) {
    showPrevImage()
  }
  if (e.key === 'ArrowRight' && imageViewerModal?.classList.contains('active')) {
    showNextImage()
  }
})
async function resolveBackendUrl() {
  // Step 1: Check for explicit backend URL in config.json (for GitHub Pages + Render)
  try {
    const res = await fetch('config.json')
    if (res.ok) {
      const cfg = await res.json()
      if (cfg.backendUrl && cfg.backendUrl.trim()) {
        console.log(`[Backend] Using URL from config.json: ${cfg.backendUrl}`)
        return cfg.backendUrl
      }
    }
  } catch (err) {
    // config.json not found or parse error; continue to next method
  }

  // Step 2: For HTTPS deployments, try same origin (backend on same host/port)
  if (typeof window !== 'undefined' && /^https?:/i.test(String(window.location?.origin || ''))) {
    try {
      const res = await fetch(`${window.location.origin}/health`, { method: 'GET' })
      if (res.ok) {
        console.log(`[Backend] Using same origin: ${window.location.origin}`)
        return window.location.origin
      }
    } catch (err) {
      // Fall back to localhost probes for local development.
    }
  }

  // Step 3: Local development fallback - probe localhost ports
  for (const port of BACKEND_PORTS) {
    const url = `http://localhost:${port}`
    try {
      const res = await fetch(`${url}/health`, { method: "GET" })
      if (res.ok) {
        console.log(`[Backend] Found on localhost:${port}`)
        return url
      }
    } catch (err) {
      // ignore and try next port
    }
  }
  throw new Error(`Unable to reach backend on ports: ${BACKEND_PORTS.join(", ")}`)
}

async function getBackendUrl() {
  if (!BACKEND_URL) {
    BACKEND_URL = await resolveBackendUrl()
  }
  return BACKEND_URL
}

async function checkAiConfig() {
  try {
    const backendUrl = await getBackendUrl()
    const res = await fetch(`${backendUrl}/config`)
    if (!res.ok) return
    const cfg = await res.json()
    const aiStatus = document.getElementById('aiStatus')
    const aiToggle = document.getElementById('aiToggle')
    if (cfg.aiEnabled) {
      aiStatus.style.display = 'none'
      aiToggle.disabled = false
    } else if (cfg.mockEnabled) {
      aiStatus.style.display = 'block'
      aiStatus.textContent = 'AI extraction running in MOCK mode (no Azure key).'
      aiToggle.disabled = false
    } else {
      aiStatus.style.display = 'block'
      aiStatus.textContent = 'AI extraction is disabled — set AZURE_API_KEY in backend .env to enable.'
      aiToggle.disabled = true
    }
  } catch (err) {
    console.warn('Could not fetch backend config', err)
  }
}

// Check AI config on load
getBackendUrl().then(() => checkAiConfig()).catch(() => {})
initAppNavigation()
loadCatalogSetOptions().catch(() => {})
loadListingTemplates().catch(() => {})
renderPrefillHistoryOptions()
renderYearChecklist()
refreshCommittedSkuCounterFromInventory()
reduceBrowserAutocompleteNoise()
restoreScanDraftSnapshot()

function bindUploadDropZone(zone) {
  if (!zone) return

  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    zone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  })

  zone.addEventListener("dragover", () => {
    zone.classList.add("highlight");
  })

  zone.addEventListener("dragleave", () => {
    zone.classList.remove("highlight");
  })

  zone.addEventListener("drop", e => {
    zone.classList.remove("highlight");
    const files = [...e.dataTransfer.files];
    queueFilesForImport(files)
  })

  zone.addEventListener("click", (e) => {
    if (e.target.closest('button, label')) return
    e.preventDefault();
    e.stopPropagation();
    triggerFilePicker()
  })
}

bindUploadDropZone(dropZone)
bindUploadDropZone(quickAddDropZone)

// Explicit choose files button (visible) to open file picker
const chooseFilesBtn = document.getElementById('chooseFilesBtn');
if (chooseFilesBtn) {
  chooseFilesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    triggerFilePicker()
  });
}
quickAddFilesBtn?.addEventListener('click', (e) => {
  e.preventDefault()
  triggerFilePicker()
})
prefillTeamInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  commitPendingPrefillInput('team')
})
prefillSetInput?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  e.preventDefault()
  commitPendingPrefillInput('set')
})
clearPrefillSetsBtn?.addEventListener('click', () => clearPrefillHistory('set'))
if (fileInput) {
  fileInput.addEventListener("change", e => {
    const files = [...e.target.files]
    queueFilesForImport(files)
    fileInput.value = ''
  });
}

cancelImportPrefillBtn?.addEventListener('click', () => {
  updateQueuedFileFeedback([])
  closeImportPrefillDialog()
})
importPrefillModal?.addEventListener('click', (e) => {
  if (e.target === importPrefillModal) {
    updateQueuedFileFeedback([])
    closeImportPrefillDialog()
  }
})
closeImportPrefillModal?.addEventListener('click', () => {
  updateQueuedFileFeedback([])
  closeImportPrefillDialog()
})
confirmImportPrefillBtn?.addEventListener('click', async () => {
  const files = pendingImportFiles.slice()
  if (!files.length) {
    closeImportPrefillDialog()
    return
  }

  const prefill = collectImportPrefill()
  prefill.teams.forEach((value) => savePrefillHistoryValue('team', value))
  prefill.sets.forEach((value) => savePrefillHistoryValue('set', value))
  closeImportPrefillDialog()
  await handleFiles(files, prefill)
})

async function handleFiles(files, prefill = null) {
  const orderedFiles = sortImportedFiles(files)
  console.log('handleFiles called with', orderedFiles);
  await refreshCommittedSkuCounterFromInventory()
  beginSkuSession()
  try {
    sessionStorage.setItem(IMPORT_IN_PROGRESS_KEY, '1')
  } catch {
    // Ignore storage write issues.
  }
  setActivePage('scan')
  const uploadSession = {
    cancelled: false,
    controller: new AbortController()
  }
  currentUploadSession = uploadSession

  const totalPairs = Math.ceil(orderedFiles.length / 2)
  startProgress(aiToggle.checked ? 'Uploading and extracting...' : 'Uploading files...', totalPairs)
  setProgressCancel(() => {
    uploadSession.cancelled = true
    uploadSession.controller.abort()
    if (taskProgressMessage) taskProgressMessage.textContent = 'Cancelling upload...'
    if (taskProgressCancel) taskProgressCancel.disabled = true
  })

  try {
    const pairs = []
    for (let i = 0; i < orderedFiles.length; i += 2) {
      const pairIndex = Math.floor(i / 2) + 1
      const frontFile = orderedFiles[i]
      const backFile = orderedFiles[i + 1] || null
      pairs.push({ pairIndex, frontFile, backFile })
    }

    let completedPairs = 0

    const processPair = async (pair) => {
      if (uploadSession.cancelled) return

      const frontBuffer = await pair.frontFile.arrayBuffer()
      const backBuffer = pair.backFile ? await pair.backFile.arrayBuffer() : null
      if (uploadSession.cancelled) return

      const row = addRow(pair.frontFile, frontBuffer, pair.backFile, backBuffer)
      applyImportPrefillToRow(row, prefill)

      if (aiToggle.checked) {
        if (backBuffer) {
          await runPairedAIExtraction(row, frontBuffer, backBuffer, uploadSession.controller.signal)
        } else {
          await runSingleAIExtraction(row, frontBuffer, uploadSession.controller.signal)
        }
      }

      completedPairs += 1
      const message = aiToggle.checked
        ? `Processed pair ${completedPairs} of ${totalPairs}`
        : `Uploaded pair ${completedPairs}`
      updateProgress(completedPairs, totalPairs, message)

      if (row.isConnected) {
        applyImportPrefillToRow(row, prefill)
      }

      persistScanDraftSnapshot()
    }

    if (!aiToggle.checked) {
      for (const pair of pairs) {
        if (uploadSession.cancelled) break
        await processPair(pair)
      }
    } else {
      let nextIndex = 0
      const workerCount = Math.max(1, Math.min(IMPORT_AI_CONCURRENCY, pairs.length))
      const workers = Array.from({ length: workerCount }, async () => {
        while (!uploadSession.cancelled) {
          const current = nextIndex
          nextIndex += 1
          if (current >= pairs.length) break
          await processPair(pairs[current])
        }
      })
      await Promise.all(workers)
    }

    if (!uploadSession.cancelled) {
      const mergedCount = collapseAllDuplicateRows()
      if (mergedCount > 0) {
        updateProgress(completedPairs, totalPairs, `Merged ${mergedCount} duplicate row${mergedCount === 1 ? '' : 's'} into quantity totals.`)
      }
    }

    finishProgress(uploadSession.cancelled ? 'Upload cancelled.' : (aiToggle.checked ? 'Upload and extraction complete.' : 'Upload complete.'))
  } finally {
    try {
      sessionStorage.removeItem(IMPORT_IN_PROGRESS_KEY)
    } catch {
      // Ignore storage write issues.
    }
    if (currentUploadSession === uploadSession) currentUploadSession = null
    endSkuSession()
    setProgressCancel(null)
    if (typeof window.requestTableAutoSize === 'function') {
      window.requestTableAutoSize()
    }
  }
}

function revokeRowPreviewUrls(row) {
  const urls = Array.isArray(row.previewObjectUrls) ? row.previewObjectUrls : []
  urls.forEach((url) => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // Ignore malformed or already-revoked URLs.
    }
  })
  row.previewObjectUrls = []
}

function buildPreviewWrapMarkup(row, file, label) {
  if (!file) return ''
  const url = URL.createObjectURL(file)
  row.previewObjectUrls = row.previewObjectUrls || []
  row.previewObjectUrls.push(url)
  return `<div class="preview-wrap"><span class="preview-tag">${label}</span><img class="preview" src="${url}"></div>`
}

function renderRowPreviewCell(row) {
  const previewCell = row.querySelector('td:first-child')
  if (!previewCell) return

  revokeRowPreviewUrls(row)

  const frontMarkup = buildPreviewWrapMarkup(row, row.frontFile, 'Front')
  const backMarkup = buildPreviewWrapMarkup(row, row.backFile, 'Back')
  const hasPair = Boolean(row.frontFile && row.backFile)
  const swapMarkup = hasPair
    ? '<button type="button" class="swapSidesBtn" title="Swap front/back and rescan"><span class="swap-arrows">&lt;-&gt;</span><span class="swap-label">Swap</span></button>'
    : ''

  previewCell.innerHTML = `<div class="preview-stack">${frontMarkup}${swapMarkup}${backMarkup}</div>`

  const previewImages = previewCell.querySelectorAll('img.preview')
  previewImages.forEach((img) => {
    img.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openImageViewerFromElement(img)
    })
  })

  const swapButton = previewCell.querySelector('.swapSidesBtn')
  if (swapButton) {
    swapButton.disabled = row.dataset.swapBusy === '1'
    swapButton.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      await swapRowFrontBackAndRescan(row)
    })
  }
}

async function swapRowFrontBackAndRescan(row) {
  if (!row || row.dataset.swapBusy === '1') return
  if (!row.frontBuffer || !row.backBuffer) return

  row.dataset.swapBusy = '1'
  renderRowPreviewCell(row)

  try {
    const oldFrontFile = row.frontFile
    const oldFrontBuffer = row.frontBuffer
    row.frontFile = row.backFile
    row.frontBuffer = row.backBuffer
    row.backFile = oldFrontFile
    row.backBuffer = oldFrontBuffer

    const sideInput = row.querySelector('.side')
    if (sideInput) sideInput.value = 'Front+Back Pair'

    renderRowPreviewCell(row)

    startProgress('Swapping front/back and rescanning...', 1)
    updateProgress(1, 1, 'Re-analyzing swapped pair...')

    await runPairedAIExtraction(row, row.frontBuffer, row.backBuffer)

    if (row.isConnected) {
      updatePickFromOptions()
      if (typeof window.requestTableAutoSize === 'function') {
        window.requestTableAutoSize()
      }
    }

    finishProgress('Swap complete. Extraction updated.')
  } catch (err) {
    console.error('Swap/rescan failed:', err)
    finishProgress('Swap applied, but rescan failed.')
  } finally {
    if (row.isConnected) {
      row.dataset.swapBusy = '0'
      renderRowPreviewCell(row)
    }
  }
}

function addRow(frontFile, frontBuffer, backFile = null, backBuffer = null) {
  const row = document.createElement("tr");

  const sideValue = backFile ? 'Front+Back Pair' : (frontFile ? 'Single Image' : '')

  row.innerHTML = `
    <td><div class="preview-stack"></div></td>
    <td><input class="quantity" type="number" min="1" step="1" value="1"></td>
    <td><input class="sku" value="${nextSku()}"></td>
    <td><input class="name"></td>
    <td><input class="team"></td>
    <td><input class="position"></td>
    <td><input class="set"></td>
    <td><input class="year"></td>
    <td><input class="cardNumber"></td>
    <td><input class="parallel"></td>
    <td><select class="rookie"><option>No</option><option>Yes</option></select></td>
    <td><select class="autograph"><option>No</option><option>Yes</option></select></td>
    <td><input class="title"></td>
    <td><input class="description"></td>
    <td><select class="pickFrom"><option value="">Refresh pick options</option></select></td>
    <td><input class="filename"></td>
    <td><input class="pictureUrl"></td>
    <td><input class="side" value="${sideValue}"></td>
    <td><button class="deleteRowBtn">X</button></td>
  `;

  row.frontFile = frontFile || null;
  row.frontBuffer = frontBuffer || null;
  row.backFile = backFile || null;
  row.backBuffer = backBuffer || null;
  row.previewObjectUrls = [];
  row.dataset.swapBusy = '0';

  if (typeof window.applyCustomColumnsToRow === 'function') {
    window.applyCustomColumnsToRow(row)
  }

  renderRowPreviewCell(row)

  // Delete row button
  row.querySelector(".deleteRowBtn").addEventListener("click", () => {
    revokeRowPreviewUrls(row)
    row.remove();
    updatePickFromOptions();
    persistScanDraftSnapshot()
  });

  const fieldSelectors = [
    ".team",
    ".set",
    ".name"
  ];

  fieldSelectors.forEach(selector => {
    row.querySelector(selector).addEventListener("input", updatePickFromOptions);
  });

  tableBody.appendChild(row);
  if (typeof window.updateTableColumns === 'function') {
    window.updateTableColumns()
  }
  if (typeof window.requestTableAutoSize === 'function') {
    window.requestTableAutoSize()
  }
  updatePickFromOptions();
  persistScanDraftSnapshot()
  return row;
}

function updatePickFromOptions() {
  const groups = {}

  for (const row of tableBody.querySelectorAll('tr')) {
    const team = row.querySelector('.team').value.trim()
    const set = row.querySelector('.set').value.trim()
    const name = row.querySelector('.name').value.trim()

    if (!team || !set || !name) continue

    const key = `${team}||${set}`
    groups[key] = groups[key] || new Set()
    groups[key].add(name)
  }

  for (const row of tableBody.querySelectorAll('tr')) {
    const team = row.querySelector('.team').value.trim()
    const set = row.querySelector('.set').value.trim()
    const pickFromSelect = row.querySelector('.pickFrom')
    const key = `${team}||${set}`

    const values = groups[key] ? Array.from(groups[key]).sort() : []
    const selectedValue = pickFromSelect.value
    pickFromSelect.innerHTML = ''

    const defaultOption = document.createElement('option')
    defaultOption.value = ''
    defaultOption.textContent = values.length ? 'Select player...' : 'No options'
    pickFromSelect.appendChild(defaultOption)

    for (const value of values) {
      const option = document.createElement('option')
      option.value = value
      option.textContent = value
      pickFromSelect.appendChild(option)
    }

    if (values.includes(selectedValue)) {
      pickFromSelect.value = selectedValue
    }
  }
}

function normalizeDupValue(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function rowDuplicateData(row) {
  const read = (selector) => String(row.querySelector(selector)?.value || '').trim()
  return {
    row,
    nameRaw: read('.name'),
    teamRaw: read('.team'),
    setRaw: read('.set'),
    yearRaw: read('.year'),
    cardRaw: read('.cardNumber'),
    cardDigits: String(read('.cardNumber')).replace(/\D+/g, ''),
    parallelRaw: read('.parallel'),
    name: normalizeDupValue(read('.name')),
    team: normalizeDupValue(read('.team')),
    set: normalizeDupValue(read('.set')),
    year: normalizeDupValue(read('.year')),
    card: normalizeDupValue(read('.cardNumber')),
    parallel: normalizeDupValue(read('.parallel'))
  }
}

function tokenOverlap(a, b) {
  const aTokens = new Set(String(a || '').split(' ').filter(Boolean))
  const bTokens = new Set(String(b || '').split(' ').filter(Boolean))
  if (!aTokens.size || !bTokens.size) return 0

  let overlap = 0
  aTokens.forEach(t => {
    if (bTokens.has(t)) overlap += 1
  })

  return overlap / Math.min(aTokens.size, bTokens.size)
}

function scoreDuplicatePair(a, b) {
  let score = 0
  const nameExact = Boolean(a.name && b.name && a.name === b.name)
  const setExact = Boolean(a.set && b.set && a.set === b.set)
  const yearExact = Boolean(a.year && b.year && a.year === b.year)

  // If both card numbers exist, they must match. If one is missing, rely on stricter anchors below.
  const cardPairPresent = Boolean(a.card && b.card)
  const cardMissingOnOneSide = Boolean((a.card && !b.card) || (!a.card && b.card))
  if (cardPairPresent) {
    if (a.card === b.card) {
      score += 5
    } else {
      // Allow minor OCR formatting drift only when numeric core still agrees.
      if (!a.cardDigits || !b.cardDigits || a.cardDigits !== b.cardDigits) return -999
      score += 4
    }
  }

  let nameAnchor = false
  if (a.name && b.name) {
    if (a.name === b.name) {
      score += 4
      nameAnchor = true
    } else if ((a.name.includes(b.name) || b.name.includes(a.name)) && Math.min(a.name.length, b.name.length) >= 6) {
      score += 2
      nameAnchor = true
    }
  }

  let teamAnchor = false
  if (a.team && b.team && a.team === b.team) {
    score += 2
    teamAnchor = true
  }

  if (a.set && b.set) {
    if (a.set === b.set) score += 2
    else if (tokenOverlap(a.set, b.set) >= 0.6) score += 1
  }

  const setAnchor = (a.set && b.set) ? (a.set === b.set || tokenOverlap(a.set, b.set) >= 0.6) : false

  const yearAnchor = a.year && b.year && a.year === b.year
  if (yearAnchor) score += 1

  if (a.parallel && b.parallel) {
    if (a.parallel === b.parallel) score += 1
    else return -999
  }

  // Without card number anchors, require exact identity on name/team/set/year.
  const exactIdentityAnchor = (nameExact && teamAnchor && setExact && yearExact)
  const fuzzyIdentityAnchor = (nameExact && teamAnchor && setAnchor && yearExact)
  const anchorOk = cardPairPresent
    || (nameExact && teamAnchor && setExact && yearExact)
    || (nameAnchor && teamAnchor && setAnchor && yearExact)
  if (!anchorOk) return -999

  // If one card number is missing, allow exact/fuzzy identity anchors but keep team+year exact.
  if (cardMissingOnOneSide && !(exactIdentityAnchor || fuzzyIdentityAnchor)) return -999

  return score
}

function collapseAllDuplicateRows() {
  let merged = 0
  let changed = true

  while (changed) {
    changed = false
    const rows = [...tableBody.querySelectorAll('tr')]
    for (const row of rows) {
      if (!row.isConnected) continue
      if (collapseDuplicateRowIfNeeded(row)) {
        merged += 1
        changed = true
      }
    }
  }

  return merged
}

function mergeMissingFields(targetRow, sourceRow) {
  const selectors = [
    '.name', '.team', '.position', '.set', '.year', '.cardNumber', '.parallel',
    '.title', '.description', '.filename', '.pictureUrl'
  ]

  selectors.forEach((selector) => {
    const target = targetRow.querySelector(selector)
    const source = sourceRow.querySelector(selector)
    if (!target || !source) return
    if (!String(target.value || '').trim() && String(source.value || '').trim()) {
      target.value = source.value
    }
  })
}

function incrementQuantity(row, amount = 1) {
  const qtyInput = row.querySelector('.quantity')
  if (!qtyInput) return
  const current = Math.max(1, Number(qtyInput.value || 1))
  qtyInput.value = String(current + Math.max(1, amount))
}

function collapseDuplicateRowIfNeeded(row) {
  const source = rowDuplicateData(row)
  const candidates = [...tableBody.querySelectorAll('tr')].filter(r => r !== row)

  let best = null
  let bestScore = -Infinity

  candidates.forEach((candidateRow) => {
    const candidate = rowDuplicateData(candidateRow)
    const score = scoreDuplicatePair(source, candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidateRow
    }
  })

  if (!best || bestScore < 6) return false

  mergeMissingFields(best, row)
  incrementQuantity(best, Number(row.querySelector('.quantity')?.value || 1))
  revokeRowPreviewUrls(row)
  row.remove()
  updatePickFromOptions()
  persistScanDraftSnapshot()
  if (typeof window.requestTableAutoSize === 'function') {
    window.requestTableAutoSize()
  }
  return true
}

async function analyzeImageBuffer(buffer, signal) {
  const sleepWithAbort = (ms) => new Promise((resolve, reject) => {
    if (!ms || ms <= 0) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })

  const waitForOcrSlot = async () => {
    while (true) {
      const now = Date.now()

      const sinceLastCall = now - ocrLastCallStartMs
      if (ocrLastCallStartMs && sinceLastCall < OCR_MIN_INTERVAL_MS) {
        await sleepWithAbort(Math.max(100, OCR_MIN_INTERVAL_MS - sinceLastCall))
        continue
      }

      if (now - ocrWindowStartMs >= OCR_WINDOW_MS) {
        ocrWindowStartMs = now
        ocrCallsInWindow = 0
      }

      const safeBudget = Math.max(1, OCR_MAX_PER_WINDOW - OCR_CLIENT_HEADROOM)
      if (ocrCallsInWindow < safeBudget) {
        ocrCallsInWindow += 1
        ocrLastCallStartMs = now
        return
      }

      const waitMs = Math.max(250, OCR_WINDOW_MS - (now - ocrWindowStartMs) + 50)
      await sleepWithAbort(waitMs)
    }
  }

  const postAnalyze = async () => {
    await waitForOcrSlot()

    const formData = new FormData();
    formData.append("image", new Blob([buffer]));

    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/analyze`, {
      method: "POST",
      body: formData,
      signal
    });

    let data = null
    try {
      data = await res.json()
    } catch {
      data = null
    }

    return { res, data }
  }

  const maxAttempts = 8
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { res, data } = await postAnalyze()
    if (res.ok) return data

    const isRateLimited = res.status === 429
    const retryAfterHeader = Number(res.headers.get('Retry-After') || 0)
    const details = data?.details || data?.error || `HTTP ${res.status}`

    if (!isRateLimited || attempt === maxAttempts) {
      const err = new Error(details)
      err.payload = data
      throw err
    }

    // Back off aggressively when the backend window is saturated.
    ocrWindowStartMs = Date.now()
    ocrCallsInWindow = Math.max(ocrCallsInWindow, Math.max(1, OCR_MAX_PER_WINDOW - OCR_CLIENT_HEADROOM))

    const retryDelayMs = Math.max(3000, (Number.isFinite(retryAfterHeader) ? retryAfterHeader : 2) * 1000)
    await sleepWithAbort(retryDelayMs)
  }

  throw new Error('Analyze request failed after retries')
}

async function detectImageSide(buffer, signal) {
  const quickSide = await detectImageSideInBrowser(buffer)
  if (quickSide) return quickSide

  const formData = new FormData();
  formData.append("image", new Blob([buffer]));

  const backendUrl = await getBackendUrl();
  const res = await fetch(`${backendUrl}/detect-front-back`, {
    method: "POST",
    body: formData,
    signal
  });

  if (!res.ok) return null
  const data = await res.json();
  return String(data?.side || '').toLowerCase() || null
}

async function detectImageSideInBrowser(buffer) {
  try {
    const blob = new Blob([buffer])
    const imageData = await readImageDataForSideDetection(blob)
    if (!imageData) return null

    const pixels = imageData.data
    const totalPixels = imageData.width * imageData.height
    if (!totalPixels) return null

    let sum = 0
    let sumSq = 0

    for (let i = 0; i < pixels.length; i += 4) {
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      sum += gray
      sumSq += gray * gray
    }

    const mean = sum / totalPixels
    const variance = Math.max(0, (sumSq / totalPixels) - (mean * mean))
    const stdev = Math.sqrt(variance)

    return mean > 110 && stdev > 40 ? 'front' : 'back'
  } catch (err) {
    console.warn('Browser side detection failed, falling back to backend', err)
    return null
  }
}

async function readImageDataForSideDetection(blob) {
  const maxSide = 240

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    try {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, width, height)
      return ctx.getImageData(0, 0, width, height)
    } finally {
      bitmap.close()
    }
  }

  const image = await loadImageElementFromBlob(blob)
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}

function normalizeUiYearValue(rawYear) {
  const value = String(rawYear || '').trim()
  if (!value) return null

  if (value.includes('2025') && value.includes('2026')) return '2025-2026'
  if (value.includes('2025')) return '2025'
  if (value.includes('2026')) return '2026'

  return null
}

function finalUiYear(frontYear, backYear) {
  const front = normalizeUiYearValue(frontYear)
  const back = normalizeUiYearValue(backYear)

  if ((front === '2025' && back === '2026') || (front === '2026' && back === '2025')) {
    return '2025-2026'
  }

  return front || back || '2025-2026'
}

function applyExtractionToRow(row, data) {
  row.querySelector(".name").value = data.player || "";
  row.querySelector(".team").value = data.team || "";
  row.querySelector(".set").value = data.set || "";
  const normalizedYear = normalizeUiYearValue(data.year)
  row.querySelector(".year").value = normalizedYear || '';
  row.querySelector(".position").value = data.position || "";
  row.querySelector(".cardNumber").value = data.cardNumber || "";
  row.querySelector(".parallel").value = data.parallel || "";
  if (typeof window.requestTableAutoSize === 'function') {
    window.requestTableAutoSize()
  }
}

function mergeFrontBackExtraction(frontData, backData) {
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

    // Preserve meaningful full set labels found inside legal/copyright lines.
    const lowered = text.toLowerCase()
    if (lowered.includes('topps signature class')) return 'Topps Signature Class'
    if (lowered.includes('donruss') && lowered.includes('optic')) return 'Donruss Optic'
    if (lowered.includes('panini') && lowered.includes('prizm')) return 'Panini Prizm'

    // Trim noisy legal wrapper text while keeping the core set phrase when possible.
    const legalNoise = /(all rights reserved|the topps company|\u00ae|\u2122|\(r\)|\(tm\))/i
    if (legalNoise.test(text)) {
      const phrase = text.match(/\b(topps\s+signature\s+class|donruss\s+optic|panini\s+prizm|topps|optic|prizm)\b/i)
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
    if (/\b(hold|round|pick|topps|optic|donruss|panini|nfl|cardinals?|arizona)\b/i.test(text)) return null
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

  const safeCardNumber = (value, source) => {
    let v = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')

    const normalizeAmbiguousOcrDigits = (token) => {
      // Common on Topps Signature Class style numbers: SNI80S -> SN1805
      const snMatch = token.match(/^([A-Z]{1,2})([A-Z0-9-]+)$/)
      if (!snMatch) return token
      const prefix = snMatch[1]
      let rest = snMatch[2]

      // If suffix already has digits, treat ambiguous letters as likely digits.
      if (/\d/.test(rest)) {
        rest = rest
          .replace(/[I|L]/g, '1')
          .replace(/O/g, '0')
          .replace(/S/g, '5')
      }

      return `${prefix}${rest}`
    }

    v = normalizeAmbiguousOcrDigits(v)

    // Reject long SKU-like product codes often seen in legal/footer lines,
    // e.g., SN1805, which are not the actual printed card number.
    if (/^[A-Z]{2,4}\d{4,}$/.test(v)) return null

    if (!/\d/.test(v)) {
      if (/^[IL|]+$/.test(v)) v = '1'
      else if (/^O+$/.test(v)) v = '0'
      else if (/^S+$/.test(v)) v = '5'
    }
    if (!v) return null
    if (!/^[A-Z0-9-]{1,10}$/i.test(v)) return null
    if (!/\d/.test(v)) return null
    return v
  }

  const extractCardNumberFromPreview = (text) => {
    const content = String(text || '')
    if (!content) return null
    const explicit = content.match(/(?:\bno\.?\s*|\bcard\b\s*(?:#|number|no\.?)?\s*[:#-]?\s*)([A-Z0-9-]{1,10})\b/i)
    if (explicit?.[1] && /\d/.test(explicit[1])) return explicit[1]
    return null
  }

  const extractToppsSignatureCardNumber = (text) => {
    const content = String(text || '')
    if (!content) return null

    const explicit = content.match(/\b(?:no\.?|card\s*#?)\s*[:#-]?\s*(\d{1,2})\b/i)
    if (explicit?.[1]) return explicit[1]

    const isolated = content.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)
    if (isolated?.[1]) return isolated[1]

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

  const backCardNumber = safeCardNumber(backData.cardNumber, 'back')
  const frontCardNumber = safeCardNumber(frontData.cardNumber, 'front')
  const backTopRightCard = safeCardNumber(backData.topRightCardNumber, 'back')
  const frontTopRightCard = safeCardNumber(frontData.topRightCardNumber, 'front')
  const backPreviewCard = safeCardNumber(extractCardNumberFromPreview(backData.ocrPreview), 'back')
  const frontPreviewCard = safeCardNumber(extractCardNumberFromPreview(frontData.ocrPreview), 'front')
  const isToppsSignatureClass = /topps\s+signature\s+class/i.test(String(mergedSet || ''))
  const backToppsSignatureCard = isToppsSignatureClass
    ? safeCardNumber(extractToppsSignatureCardNumber(backData.ocrPreview), 'back')
    : null
  const frontToppsSignatureCard = isToppsSignatureClass
    ? safeCardNumber(extractToppsSignatureCardNumber(frontData.ocrPreview), 'front')
    : null

  const candidates = [
    { value: backToppsSignatureCard, source: 'backToppsSignature' },
    { value: backTopRightCard, source: 'backTopRight' },
    { value: backPreviewCard, source: 'backPreview' },
    { value: backCardNumber, source: 'backParsed' },
    { value: frontToppsSignatureCard, source: 'frontToppsSignature' },
    { value: frontTopRightCard, source: 'frontTopRight' },
    { value: frontPreviewCard, source: 'frontPreview' },
    { value: frontCardNumber, source: 'frontParsed' }
  ].filter(c => Boolean(c.value))

  const sourceWeight = {
    backToppsSignature: 70,
    backTopRight: 60,
    backPreview: 50,
    backParsed: 40,
    frontToppsSignature: 35,
    frontTopRight: 25,
    frontPreview: 20,
    frontParsed: 10
  }

  let mergedCardNumber = null
  if (candidates.length) {
    const scoredByValue = new Map()

    for (const candidate of candidates) {
      const value = candidate.value
      const base = scoreCardNumber(value)
      const weight = sourceWeight[candidate.source] || 0
      const isSingleDigit = /^\d$/.test(value)
      const singleDigitPenalty = isSingleDigit && (candidate.source === 'backParsed' || candidate.source === 'frontParsed') ? 35 : 0
      const current = scoredByValue.get(value) || 0
      scoredByValue.set(value, current + base + weight - singleDigitPenalty)
    }

    for (const [value] of scoredByValue.entries()) {
      const corroborationCount = candidates.filter(c => c.value === value).length
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

  console.log('[merge-card-number]', {
    backToppsSignatureCard,
    backTopRightCard,
    backPreviewCard,
    backCardNumber,
    frontToppsSignatureCard,
    frontTopRightCard,
    frontPreviewCard,
    frontCardNumber,
    mergedCardNumber
  })

  return {
    player: mergedPlayer,
    team: mergedTeam,
    position: mergedPosition,
    set: mergedSet,
    year: mergedYear,
    // Prioritize card number from BACK to avoid jersey number from front image.
    cardNumber: mergedCardNumber,
    parallel: frontData.parallel || backData.parallel || null,
    ocrPreview: frontData.ocrPreview || backData.ocrPreview || null
  }
}

async function runSingleAIExtraction(row, buffer, signal) {
  try {
    const data = await analyzeImageBuffer(buffer, signal)

    const extractedValues = [
      data.player,
      data.team,
      data.set,
      data.year,
      data.position,
      data.cardNumber,
      data.parallel
    ];
    const hasAnyExtractedField = extractedValues.some(Boolean);

    if (!hasAnyExtractedField) {
      const aiStatus = document.getElementById('aiStatus')
      aiStatus.style.display = 'block'
      if (data.ocrPreview) {
        aiStatus.textContent = `OCR detected text but field mapping was low confidence. Preview: ${data.ocrPreview}`
      } else {
        aiStatus.textContent = 'OCR completed but no mapped card fields were detected for this image.'
      }
      return
    }

    applyExtractionToRow(row, data)
    collapseDuplicateRowIfNeeded(row)

    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'none'
  } catch (err) {
    if (err?.name === 'AbortError') return
    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'block'
    aiStatus.textContent = 'AI extraction failed: see console or backend logs.'
    console.error("AI extraction failed:", err);
  }
}

async function runPairedAIExtraction(row, frontBuffer, backBuffer, signal) {
  try {
    // Run sequentially to avoid bursty OCR traffic that can trip rate limiting.
    const frontData = await analyzeImageBuffer(frontBuffer, signal)
    const backData = await analyzeImageBuffer(backBuffer, signal)

    const merged = mergeFrontBackExtraction(frontData, backData)
    const extractedValues = [
      merged.player,
      merged.team,
      merged.set,
      merged.year,
      merged.position,
      merged.cardNumber,
      merged.parallel
    ]
    const hasAnyExtractedField = extractedValues.some(Boolean)

    if (!hasAnyExtractedField) {
      const aiStatus = document.getElementById('aiStatus')
      aiStatus.style.display = 'block'
      if (merged.ocrPreview) {
        aiStatus.textContent = `OCR detected text but field mapping was low confidence. Preview: ${merged.ocrPreview}`
      } else {
        aiStatus.textContent = 'OCR completed for front/back images but no mapped card fields were detected.'
      }
      return
    }

    applyExtractionToRow(row, merged)
    collapseDuplicateRowIfNeeded(row)

    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'none'
  } catch (err) {
    if (err?.name === 'AbortError') return
    const aiStatus = document.getElementById('aiStatus')
    aiStatus.style.display = 'block'
    aiStatus.textContent = `AI extraction failed: ${err.message || 'see console or backend logs.'}`
    console.error('Paired AI extraction failed:', err)
  }
}

// Generate Titles
document.getElementById("generateTitlesBtn").addEventListener("click", async () => {
  const rows = [...tableBody.querySelectorAll("tr")]
  startProgress('Generating titles...', rows.length)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    updateProgress(i + 1, rows.length, `Generating title ${i + 1} of ${rows.length}...`)
    const payload = collectRowData(row);

    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/generate-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Title generation failed: ${res.status}`)
    }

    const data = await res.json();
    row.querySelector(".title").value = data.title || "";
  }

  finishProgress('Title generation complete.')
});

// Generate Descriptions
document.getElementById("generateDescriptionsBtn").addEventListener("click", async () => {
  const rows = [...tableBody.querySelectorAll("tr")]
  startProgress('Generating descriptions...', rows.length)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    updateProgress(i + 1, rows.length, `Generating description ${i + 1} of ${rows.length}...`)
    const payload = collectRowData(row);

    const backendUrl = await getBackendUrl();
    const res = await fetch(`${backendUrl}/generate-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`Description generation failed: ${res.status}`)
    }

    const data = await res.json();
    row.querySelector(".description").value = data.description || "";
  }

  finishProgress('Description generation complete.')
});

document.getElementById("refreshPickOptionsBtn").addEventListener("click", () => {
  updatePickFromOptions();
});

// Generate Filenames
document.getElementById("generateFilenamesBtn").addEventListener("click", async () => {
  const rows = [...tableBody.querySelectorAll("tr")]
  startProgress('Generating filenames...', rows.length)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    updateProgress(i + 1, rows.length, `Generating filename ${i + 1} of ${rows.length}...`)
    const payload = collectRowData(row);
    const backendUrl = await getBackendUrl();

    const res = await fetch(`${backendUrl}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    row.querySelector(".filename").value = data.filename || "";
  }

  finishProgress('Filename generation complete.')
});

// Add empty row
document.getElementById("addRowBtn").addEventListener("click", () => {
  addRow(null, null, null, null);
});

discardScanDraftBtn?.addEventListener('click', discardUnsavedScanDraft)

// Export CSV
document.getElementById("exportCsvBtn").addEventListener("click", () => {
  let csv = "PairType,SKU,Name,Team,Position,Set,Year,CardNumber,Quantity,Parallel,Rookie,Autograph,Title,Description,PickFrom,VariationTheme,MultiBuyOffer,Filename,PictureURL\n";

  for (const row of tableBody.querySelectorAll("tr")) {
    const d = collectRowData(row);
    const variationTheme = d.Team && d.Set ? `${d.Team} - ${d.Set}` : "";
    const multiBuyOffer = "Buy 5, get 1 free";
    csv += `${d.Side},${d.SKU},${d.Name},${d.Team},${d.Position},${d.Set},${d.Year},${d.CardNumber},${d.Quantity},${d.Parallel},${d.Rookie},${d.Autograph},${d.Title},${d.Description},${d.PickFrom},${variationTheme},${multiBuyOffer},${d.Filename},${d.PictureURL}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "cards.csv";
  a.click();
});

// Download ZIP of renamed images
document.getElementById("downloadZipBtn").addEventListener("click", async () => {
  const zip = new JSZip();
  const rows = [...tableBody.querySelectorAll("tr")]
  startProgress('Preparing ZIP download...', rows.length)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    updateProgress(i + 1, rows.length, `Adding row ${i + 1} of ${rows.length} to ZIP...`)
    const filename = row.querySelector(".filename").value || "unnamed.jpg";

    if (row.frontBuffer) {
      const frontName = row.backBuffer ? filename.replace(/(\.[a-z0-9]+)$/i, '-front$1') : filename
      zip.file(frontName, row.frontBuffer);
    }
    if (row.backBuffer) {
      const backName = filename.replace(/(\.[a-z0-9]+)$/i, '-back$1')
      zip.file(backName, row.backBuffer);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "renamed_images.zip";
  a.click();

  finishProgress('ZIP ready and downloaded.')
});

document.getElementById("generatePictureUrlsBtn").addEventListener("click", () => {
  const baseUrlInput = document.getElementById("pictureBaseUrl")
  const baseUrl = (baseUrlInput?.value || '').trim().replace(/\/+$/, '')
  const aiStatus = document.getElementById('aiStatus')

  if (!baseUrl) {
    aiStatus.style.display = 'block'
    aiStatus.textContent = 'Enter a Picture base URL first, then click Generate Picture URLs.'
    return
  }

  for (const row of tableBody.querySelectorAll("tr")) {
    const filenameField = row.querySelector(".filename")
    const pictureUrlField = row.querySelector(".pictureUrl")
    const fallbackName = row.frontFile?.name || row.backFile?.name || ''
    const filename = (filenameField.value || fallbackName).trim()
    if (!filename) continue

    const encodedName = encodeURIComponent(filename)
    pictureUrlField.value = `${baseUrl}/${encodedName}`
  }

  aiStatus.style.display = 'none'
});

function collectRowData(row) {
  return {
    Side: row.querySelector(".side").value,
    SKU: row.querySelector(".sku")?.value || '',
    Name: row.querySelector(".name").value,
    Team: row.querySelector(".team").value,
    Position: row.querySelector(".position").value,
    Set: row.querySelector(".set").value,
    Year: row.querySelector(".year").value,
    CardNumber: row.querySelector(".cardNumber").value,
    Quantity: row.querySelector(".quantity")?.value || '1',
    Parallel: row.querySelector(".parallel").value,
    Rookie: row.querySelector(".rookie").value,
    Autograph: row.querySelector(".autograph").value,
    Title: row.querySelector(".title").value,
    Description: row.querySelector(".description").value,
    PickFrom: row.querySelector(".pickFrom").value,
    Filename: row.querySelector(".filename").value,
    PictureURL: row.querySelector(".pictureUrl").value
  };
}

window.addEventListener('beforeunload', () => {
  if ([...tableBody.querySelectorAll('tr')].length) {
    persistScanDraftSnapshot()
    void persistScanDraftSnapshotNow()
  }
})
