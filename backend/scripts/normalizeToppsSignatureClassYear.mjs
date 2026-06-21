import sqlite3 from 'sqlite3'

const db = new sqlite3.Database('data/catalog.db')
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err)
    else resolve(this)
  })
})

await run(
  'UPDATE catalog_sets SET year = ?, updatedAt = ? WHERE lower(brand) = lower(?) AND lower(setName) = lower(?)',
  ['2025-2026', new Date().toISOString(), 'Topps', 'Signature Class']
)

await new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())))
console.log('normalized Topps Signature Class year')
