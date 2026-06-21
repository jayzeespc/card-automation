const DEFAULT_COLUMNS = [
  'Image', 'Pair Type', 'SKU', 'Name', 'Team', 'Position', 'Set', 'Year', 'Card #',
  'Quantity', 'Parallel', 'Rookie', 'Autograph', 'Title', 'Description', 'Pick From',
  'Filename', 'Picture URL', 'Delete'
]

let visibleColumns = [...DEFAULT_COLUMNS]
let customColumns = []
let manualColumnWidths = {}

const VISIBLE_COLUMNS_KEY = 'cardAutoVisibleColumns'
const CUSTOM_COLUMNS_KEY = 'cardAutoCustomColumns'
const WIDTHS_KEY = 'cardAutoColumnWidths'
const autoSizeState = { timer: null }

const DEFAULT_MIN_WIDTHS = {
  'Image': 300,
  'Pair Type': 120,
  'SKU': 130,
  'Name': 190,
  'Team': 180,
  'Position': 110,
  'Set': 190,
  'Year': 90,
  'Card #': 100,
  'Quantity': 90,
  'Parallel': 140,
  'Rookie': 95,
  'Autograph': 110,
  'Title': 180,
  'Description': 260,
  'Pick From': 150,
  'Filename': 190,
  'Picture URL': 240,
  'Delete': 80
}

const DEFAULT_MAX_WIDTHS = {
  'Image': 420,
  'Pair Type': 170,
  'SKU': 180,
  'Name': 320,
  'Team': 260,
  'Position': 140,
  'Set': 260,
  'Year': 120,
  'Card #': 150,
  'Quantity': 110,
  'Parallel': 180,
  'Rookie': 110,
  'Autograph': 140,
  'Title': 300,
  'Description': 420,
  'Pick From': 220,
  'Filename': 320,
  'Picture URL': 420,
  'Delete': 90
}

let measureCanvas = null
let measureCtx = null
let sortState = { index: null, direction: 'asc' }

function getSortableCellValue(row, index) {
  const cell = row.querySelectorAll('td')[index]
  if (!cell) return ''

  const input = cell.querySelector('input, select, textarea')
  if (input) return String(input.value || '').trim()

  if (index === 0) {
    const imageName = row.frontFile?.name || row.backFile?.name
    if (imageName) return String(imageName).trim()
  }

  return String(cell.textContent || '').trim()
}

function compareSortableValues(a, b) {
  const aNum = Number(a)
  const bNum = Number(b)
  const aIsNum = String(a).trim() !== '' && Number.isFinite(aNum)
  const bIsNum = String(b).trim() !== '' && Number.isFinite(bNum)
  if (aIsNum && bIsNum) return aNum - bNum
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function clearSortIndicators(headers) {
  headers.forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc'))
}

function sortByHeaderIndex(index) {
  const table = document.getElementById('dataTable')
  if (!table) return
  const headers = [...table.querySelectorAll('thead th')]
  if (index < 0 || index >= headers.length) return

  const header = headers[index]
  const headerName = getColumnNameFromHeader(header)
  if (!headerName || headerName === 'Delete') return

  if (sortState.index === index) {
    sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc'
  } else {
    sortState.index = index
    sortState.direction = 'asc'
  }

  const tbody = table.querySelector('tbody')
  if (!tbody) return
  const rows = [...tbody.querySelectorAll('tr')]

  rows.sort((rowA, rowB) => {
    const a = getSortableCellValue(rowA, index)
    const b = getSortableCellValue(rowB, index)
    const cmp = compareSortableValues(a, b)
    return sortState.direction === 'asc' ? cmp : -cmp
  })

  rows.forEach((row) => tbody.appendChild(row))
  clearSortIndicators(headers)
  header.classList.add(sortState.direction === 'asc' ? 'sorted-asc' : 'sorted-desc')
  scheduleAutoSizeColumns()
}

function initHeaderSorting() {
  const table = document.getElementById('dataTable')
  if (!table || table.dataset.sortingInit === '1') return
  table.dataset.sortingInit = '1'

  table.querySelector('thead')?.addEventListener('click', (e) => {
    if (e.target.closest('.resize-handle')) return
    const header = e.target.closest('th')
    if (!header) return
    const headers = [...table.querySelectorAll('thead th')]
    const index = headers.indexOf(header)
    if (index < 0) return
    sortByHeaderIndex(index)
  })
}

const CORE_COLUMN_SELECTOR_MAP = {
  'Pair Type': '.side',
  'SKU': '.sku',
  'Name': '.name',
  'Team': '.team',
  'Position': '.position',
  'Set': '.set',
  'Year': '.year',
  'Card #': '.cardNumber',
  'Quantity': '.quantity',
  'Parallel': '.parallel',
  'Rookie': '.rookie',
  'Autograph': '.autograph',
  'Title': '.title',
  'Description': '.description',
  'Pick From': '.pickFrom',
  'Filename': '.filename',
  'Picture URL': '.pictureUrl'
}

function loadColumnPreferences() {
  const visibleSaved = localStorage.getItem(VISIBLE_COLUMNS_KEY)
  const customSaved = localStorage.getItem(CUSTOM_COLUMNS_KEY)
  const widthsSaved = localStorage.getItem(WIDTHS_KEY)

  if (visibleSaved) {
    try {
      const parsed = JSON.parse(visibleSaved)
      if (Array.isArray(parsed)) {
        visibleColumns = parsed.map(name => name === 'Side' ? 'Pair Type' : name)
        if (!visibleColumns.includes('SKU')) {
          const pairIdx = visibleColumns.indexOf('Pair Type')
          if (pairIdx >= 0) visibleColumns.splice(pairIdx + 1, 0, 'SKU')
          else visibleColumns.push('SKU')
        }
        if (!visibleColumns.includes('Quantity')) {
          const cardIdx = visibleColumns.indexOf('Card #')
          if (cardIdx >= 0) visibleColumns.splice(cardIdx + 1, 0, 'Quantity')
          else visibleColumns.push('Quantity')
        }
      }
    } catch (err) {
      visibleColumns = [...DEFAULT_COLUMNS]
    }
  }

  if (customSaved) {
    try {
      const parsed = JSON.parse(customSaved)
      if (Array.isArray(parsed)) customColumns = parsed
    } catch (err) {
      customColumns = []
    }
  }

  if (widthsSaved) {
    try {
      const parsed = JSON.parse(widthsSaved)
      if (parsed && typeof parsed === 'object') manualColumnWidths = parsed
    } catch (err) {
      manualColumnWidths = {}
    }
  }
}

function saveColumnPreferences() {
  localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns))
  localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(customColumns))
  localStorage.setItem(WIDTHS_KEY, JSON.stringify(manualColumnWidths))
}

function getHeaderRow() {
  return document.querySelector('#dataTable thead tr')
}

function getAllColumnNames() {
  return [...DEFAULT_COLUMNS.slice(0, -1), ...customColumns, 'Delete']
}

function sanitizeColumnName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ')
}

function getColumnNameFromHeader(header) {
  return sanitizeColumnName(header?.dataset?.columnName || header?.textContent || '')
}

function getMeasureContext() {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas')
    measureCtx = measureCanvas.getContext('2d')
  }

  if (measureCtx) {
    measureCtx.font = getComputedStyle(document.body).font || '13px Segoe UI, sans-serif'
  }

  return measureCtx
}

function measureTextWidth(text) {
  const ctx = getMeasureContext()
  if (!ctx) return String(text || '').length * 8
  return ctx.measureText(String(text || '')).width
}

function getCellTextForAutoSize(cell, columnName) {
  if (!cell) return ''

  const input = cell.querySelector('input, select, textarea')
  if (input) {
    return String(input.value || input.textContent || input.placeholder || '').trim()
  }

  if (columnName === 'Image') {
    return cell.querySelectorAll('img.preview').length > 1 ? 'Front Back' : 'Image'
  }

  return String(cell.textContent || '').trim()
}

function getAutoWidthForColumn(columnName, header, index, table) {
  const minWidth = DEFAULT_MIN_WIDTHS[columnName] || 120
  const maxWidth = DEFAULT_MAX_WIDTHS[columnName] || 320
  const padding = columnName === 'Image' ? 40 : 28

  const headerWidth = measureTextWidth(columnName) + padding
  let maxContentWidth = headerWidth

  const rows = [...table.querySelectorAll('tbody tr')]
  rows.forEach((row) => {
    const cell = row.querySelectorAll('td')[index]
    if (!cell) return
    const text = getCellTextForAutoSize(cell, columnName)
    const width = measureTextWidth(text) + padding
    if (width > maxContentWidth) maxContentWidth = width
  })

  return Math.max(minWidth, Math.min(maxWidth, Math.ceil(maxContentWidth)))
}

function applyWidths(widthMap) {
  const table = document.getElementById('dataTable')
  if (!table) return

  const headers = [...table.querySelectorAll('thead th')]
  const rows = [...table.querySelectorAll('tbody tr')]

  headers.forEach((header, idx) => {
    const columnName = getColumnNameFromHeader(header)
    const width = widthMap[columnName]
    if (!width) return
    header.style.width = `${width}px`
    header.style.minWidth = `${width}px`
    header.style.maxWidth = `${width}px`

    rows.forEach((row) => {
      const cell = row.querySelectorAll('td')[idx]
      if (!cell) return
      cell.style.width = `${width}px`
      cell.style.minWidth = `${width}px`
      cell.style.maxWidth = `${width}px`
    })
  })
}

function autoSizeColumns() {
  const table = document.getElementById('dataTable')
  if (!table) return

  const headers = [...table.querySelectorAll('thead th')]
  const widthMap = {}

  headers.forEach((header, idx) => {
    if (header.style.display === 'none') return
    const columnName = getColumnNameFromHeader(header)
    if (!columnName) return
    const manualWidth = Number(manualColumnWidths[columnName]) || 0
    if (manualWidth > 0) {
      widthMap[columnName] = manualWidth
      return
    }
    widthMap[columnName] = getAutoWidthForColumn(columnName, header, idx, table)
  })

  applyWidths(widthMap)
}

function scheduleAutoSizeColumns() {
  if (autoSizeState.timer) clearTimeout(autoSizeState.timer)
  autoSizeState.timer = setTimeout(() => {
    autoSizeState.timer = null
    autoSizeColumns()
  }, 0)
}

function setManualColumnWidth(columnName, width) {
  const clean = sanitizeColumnName(columnName)
  if (!clean) return
  manualColumnWidths[clean] = Math.max(60, Math.round(width))
  saveColumnPreferences()
}

function ensureCustomColumnStructure() {
  const headerRow = getHeaderRow()
  if (!headerRow) return

  headerRow.querySelectorAll('th.custom-column').forEach(th => th.remove())

  const deleteHeader = [...headerRow.querySelectorAll('th')].find(th => th.textContent.trim() === 'Delete')
  if (!deleteHeader) return

  customColumns.forEach((columnName) => {
    const th = document.createElement('th')
    th.className = 'resizable custom-column'
    th.dataset.columnName = columnName
    th.textContent = columnName
    headerRow.insertBefore(th, deleteHeader)
  })

  const rows = [...document.querySelectorAll('#tableBody tr')]
  rows.forEach((row) => applyCustomColumnsToRow(row))
}

function applyCustomColumnsToRow(row) {
  if (!row) return

  row.querySelectorAll('td.custom-column').forEach(td => td.remove())

  const deleteCell = row.querySelector('td:last-child')
  if (!deleteCell) return

  customColumns.forEach((columnName) => {
    const td = document.createElement('td')
    td.className = 'custom-column'
    td.dataset.columnName = columnName

    const input = document.createElement('input')
    input.className = 'custom-column-input'
    input.type = 'text'
    input.placeholder = columnName

    td.appendChild(input)
    row.insertBefore(td, deleteCell)
  })
}

function getCellEditorForColumn(row, columnName) {
  if (customColumns.includes(columnName)) {
    return row.querySelector(`td.custom-column[data-column-name="${CSS.escape(columnName)}"] .custom-column-input`)
  }

  const selector = CORE_COLUMN_SELECTOR_MAP[columnName]
  if (!selector) return null
  return row.querySelector(selector)
}

function updateTableColumns() {
  ensureCustomColumnStructure()

  const table = document.getElementById('dataTable')
  if (!table) return

  const headers = [...table.querySelectorAll('thead th')]
  const headerNames = headers.map(h => h.textContent.trim())

  headers.forEach((header, idx) => {
    const name = headerNames[idx]
    const show = visibleColumns.includes(name)
    header.style.display = show ? '' : 'none'
  })

  const rows = [...table.querySelectorAll('tbody tr')]
  rows.forEach((row) => {
    const cells = [...row.querySelectorAll('td')]
    cells.forEach((cell, idx) => {
      const name = headerNames[idx]
      const show = visibleColumns.includes(name)
      cell.style.display = show ? '' : 'none'
    })
  })

  renderBulkColumnSelect()
  scheduleAutoSizeColumns()
}

function renderColumnList() {
  const columnList = document.getElementById('columnList')
  if (!columnList) return

  columnList.innerHTML = ''

  const names = getAllColumnNames().filter(name => name !== 'Delete')

  names.forEach((name) => {
    const row = document.createElement('div')
    row.className = 'column-item'

    const checked = visibleColumns.includes(name)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = checked
    checkbox.addEventListener('change', (e) => handleColumnToggle(name, e.target.checked))

    const label = document.createElement('label')
    label.textContent = name

    const actions = document.createElement('div')
    actions.className = 'column-item-actions'

    if (customColumns.includes(name)) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'column-remove-btn'
      remove.textContent = 'Remove'
      remove.addEventListener('click', () => removeCustomColumn(name))
      actions.appendChild(remove)
    }

    row.appendChild(checkbox)
    row.appendChild(label)
    row.appendChild(actions)
    columnList.appendChild(row)
  })
}

function handleColumnToggle(columnName, show) {
  if (show) {
    if (!visibleColumns.includes(columnName)) visibleColumns.push(columnName)
  } else {
    visibleColumns = visibleColumns.filter(c => c !== columnName)
  }
}

function addCustomColumn(name) {
  const clean = sanitizeColumnName(name)
  if (!clean) return
  if (getAllColumnNames().includes(clean)) return

  customColumns.push(clean)
  visibleColumns.push(clean)

  updateTableColumns()
  renderColumnList()
  saveColumnPreferences()
}

function removeCustomColumn(name) {
  customColumns = customColumns.filter(c => c !== name)
  visibleColumns = visibleColumns.filter(c => c !== name)
  updateTableColumns()
  renderColumnList()
  saveColumnPreferences()
}

function renderBulkColumnSelect() {
  const select = document.getElementById('bulkColumnSelect')
  if (!select) return

  const options = getAllColumnNames().filter(name => !['Image', 'Delete'].includes(name))
  const current = select.value

  select.innerHTML = ''
  options.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    select.appendChild(option)
  })

  if (options.includes(current)) select.value = current
}

function applyFindReplace(columnName, findValue, replaceValue) {
  const rows = [...document.querySelectorAll('#tableBody tr')]
  rows.forEach((row) => {
    const editor = getCellEditorForColumn(row, columnName)
    if (!editor) return
    const value = String(editor.value || '')
    editor.value = value.split(findValue).join(replaceValue)
  })
}

function applySetAll(columnName, newValue, onlyEmpty) {
  const rows = [...document.querySelectorAll('#tableBody tr')]
  rows.forEach((row) => {
    const editor = getCellEditorForColumn(row, columnName)
    if (!editor) return
    if (onlyEmpty && String(editor.value || '').trim()) return
    editor.value = newValue
  })
}

function renderColumnTools() {
  const tools = document.getElementById('columnTools')
  if (!tools) return

  tools.innerHTML = `
    <div class="column-tools-section">
      <h3>Add Custom Column</h3>
      <div class="column-tools-row">
        <input id="customColumnName" type="text" placeholder="e.g. Grade, Price Paid, Notes" />
        <button type="button" id="addCustomColumnBtn">Add Column</button>
      </div>
    </div>

    <div class="column-tools-section">
      <h3>Find And Replace (Column)</h3>
      <div class="column-tools-grid">
        <select id="bulkColumnSelect"></select>
        <input id="bulkFindText" type="text" placeholder="Find text" />
        <input id="bulkReplaceText" type="text" placeholder="Replace with" />
        <button type="button" id="applyFindReplaceBtn">Apply Find/Replace</button>
      </div>
    </div>

    <div class="column-tools-section">
      <h3>Set Column Value</h3>
      <div class="column-tools-grid">
        <input id="bulkSetValue" type="text" placeholder="New value" />
        <label class="column-tools-check">
          <input type="checkbox" id="bulkOnlyEmpty" checked />
          <span>Only empty cells</span>
        </label>
        <button type="button" id="applySetValueBtn">Apply Set Value</button>
      </div>
    </div>
  `

  document.getElementById('addCustomColumnBtn')?.addEventListener('click', () => {
    const input = document.getElementById('customColumnName')
    addCustomColumn(input?.value || '')
    if (input) input.value = ''
  })

  document.getElementById('applyFindReplaceBtn')?.addEventListener('click', () => {
    const column = document.getElementById('bulkColumnSelect')?.value
    const findText = document.getElementById('bulkFindText')?.value || ''
    const replaceText = document.getElementById('bulkReplaceText')?.value || ''
    if (!column || !findText) return
    applyFindReplace(column, findText, replaceText)
  })

  document.getElementById('applySetValueBtn')?.addEventListener('click', () => {
    const column = document.getElementById('bulkColumnSelect')?.value
    const value = document.getElementById('bulkSetValue')?.value || ''
    const onlyEmpty = Boolean(document.getElementById('bulkOnlyEmpty')?.checked)
    if (!column) return
    applySetAll(column, value, onlyEmpty)
  })

  renderBulkColumnSelect()
}

function ensureResizeHandles() {
  const headers = [...document.querySelectorAll('#dataTable thead th.resizable')]
  headers.forEach((header) => {
    if (header.querySelector('.resize-handle')) return
    const handle = document.createElement('span')
    handle.className = 'resize-handle'
    handle.setAttribute('aria-hidden', 'true')
    header.appendChild(handle)
  })
}

function makeColumnsResizable() {
  const table = document.getElementById('dataTable')
  if (!table || table.dataset.resizableInit === '1') return
  table.dataset.resizableInit = '1'

  ensureResizeHandles()

  let activeHeader = null
  let startX = 0
  let startWidth = 0

  table.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.resize-handle')
    if (!handle) return
    const header = handle.closest('th.resizable')
    if (!header) return

    activeHeader = header
    startX = e.clientX
    startWidth = header.offsetWidth
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!activeHeader) return

    const headers = [...table.querySelectorAll('thead th')]
    const index = headers.indexOf(activeHeader)
    if (index < 0) return

    const columnName = getColumnNameFromHeader(activeHeader)

    const width = Math.max(60, startWidth + (e.clientX - startX))
    activeHeader.style.width = `${width}px`
    activeHeader.style.minWidth = `${width}px`
    activeHeader.style.maxWidth = `${width}px`

    const rows = [...table.querySelectorAll('tbody tr')]
    rows.forEach((row) => {
      const cell = row.querySelectorAll('td')[index]
      if (cell) cell.style.width = `${width}px`
      if (cell) {
        cell.style.minWidth = `${width}px`
        cell.style.maxWidth = `${width}px`
      }
    })

    if (columnName) setManualColumnWidth(columnName, width)
  })

  document.addEventListener('mouseup', () => {
    activeHeader = null
  })
}

function initColumnManager() {
  loadColumnPreferences()

  const columnModal = document.getElementById('columnModal')
  const manageColumnsBtn = document.getElementById('manageColumnsBtn')
  const closeColumnModal = document.getElementById('closeColumnModal')
  const saveColumnsBtn = document.getElementById('saveColumnsBtn')
  const resetColumnsBtn = document.getElementById('resetColumnsBtn')

  manageColumnsBtn?.addEventListener('click', () => {
    renderColumnList()
    renderColumnTools()
    columnModal?.classList.add('active')
  })

  closeColumnModal?.addEventListener('click', () => columnModal?.classList.remove('active'))

  columnModal?.addEventListener('click', (e) => {
    if (e.target === columnModal) columnModal.classList.remove('active')
  })

  saveColumnsBtn?.addEventListener('click', () => {
    saveColumnPreferences()
    updateTableColumns()
    columnModal?.classList.remove('active')
  })

  resetColumnsBtn?.addEventListener('click', () => {
    visibleColumns = [...DEFAULT_COLUMNS, ...customColumns]
    renderColumnList()
    updateTableColumns()
  })

  updateTableColumns()
  ensureResizeHandles()
  makeColumnsResizable()
  initHeaderSorting()
  scheduleAutoSizeColumns()

  const table = document.getElementById('dataTable')
  table?.addEventListener('input', scheduleAutoSizeColumns, true)
  table?.addEventListener('change', scheduleAutoSizeColumns, true)
}

window.applyCustomColumnsToRow = applyCustomColumnsToRow
window.updateTableColumns = updateTableColumns
window.requestTableAutoSize = scheduleAutoSizeColumns

document.addEventListener('DOMContentLoaded', () => {
  initColumnManager()
})
