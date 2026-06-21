/**
 * One-time script: seeds known player positions into catalog_cards rows
 * that have NULL or empty position.  Safe to run multiple times.
 */
import sqlite3 from 'sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.resolve(__dirname, '..', 'data', 'catalog.db')
const db = new sqlite3.Database(dbPath)

const run = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (e) { e ? rej(e) : res(this) })
  )

const all = (sql, params = []) =>
  new Promise((res, rej) =>
    db.all(sql, params, (e, rows) => (e ? rej(e) : res(rows)))
  )

// Known NFL positions - expand as needed
const PLAYER_POSITIONS = [
  ['James Conner',          'RB'],
  ['Kyler Murray',          'QB'],
  ['Jake Plummer',          'QB'],
  ['Trey McBride',          'TE'],
  ['Marvin Harrison',       'WR'],
  ['Michael Wilson',        'WR'],
  ['Tyler Allgeier',        'RB'],
  ['William Andrews',       'RB'],
  ['DeAndre Hopkins',       'WR'],
  ['Zach Ertz',             'TE'],
  ['Greg Dortch',           'WR'],
  ['Rondale Moore',         'WR'],
  ['Hollywood Brown',       'WR'],
  ['Budda Baker',           'S'],
  ['Isaiah Simmons',        'LB'],
  ['Zaven Collins',         'LB'],
  ['Chase Edmonds',         'RB'],
  ['Eno Benjamin',          'RB'],
  ['Drake London',          'WR'],
  ['Kyle Pitts',            'TE'],
  ['Bijan Robinson',        'RB'],
  ['Desmond Ridder',        'QB'],
  ['Kirk Cousins',          'QB'],
  ['Cordarrelle Patterson', 'RB'],
  ['Justin Jefferson',      'WR'],
  ['Jalen Hurts',           'QB'],
  ['Patrick Mahomes',       'QB'],
  ['Josh Allen',            'QB'],
  ['Lamar Jackson',         'QB'],
  ['Justin Herbert',        'QB'],
  ['Joe Burrow',            'QB'],
  ['Tua Tagovailoa',        'QB'],
  ['Dak Prescott',          'QB'],
  ['Trevor Lawrence',       'QB'],
  ['Anthony Richardson',    'QB'],
  ['CJ Stroud',             'QB'],
  ['Bryce Young',           'QB'],
  ['Davante Adams',         'WR'],
  ['Stefon Diggs',          'WR'],
  ['Tyreek Hill',           'WR'],
  ['CeeDee Lamb',           'WR'],
  ['Travis Kelce',          'TE'],
  ['Sam LaPorta',           'TE'],
  ['Dalton Kincaid',        'TE'],
  ['Christian McCaffrey',   'RB'],
  ['Austin Ekeler',         'RB'],
  ['Tony Pollard',          'RB'],
  ['Saquon Barkley',        'RB'],
  ['Derrick Henry',         'RB'],
  ['Nick Chubb',            'RB'],
  ['Aaron Jones',           'RB'],
]

let updated = 0
let skipped = 0

for (const [name, pos] of PLAYER_POSITIONS) {
  const rows = await all(
    'SELECT id, position FROM catalog_cards WHERE lower(player) LIKE lower(?)',
    [`%${name}%`]
  )
  for (const row of rows) {
    if (row.position && String(row.position).trim()) { skipped++; continue }
    await run(
      'UPDATE catalog_cards SET position=?, updatedAt=? WHERE id=?',
      [pos, new Date().toISOString(), row.id]
    )
    updated++
  }
}

console.log(`Done. Updated ${updated} rows, skipped ${skipped} rows (already had position).`)
db.close()
