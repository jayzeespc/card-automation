import sqlite3 from 'sqlite3'

const db = new sqlite3.Database('data/catalog.db')
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err)
    else resolve(rows)
  })
})

const templatesResponse = await fetch('http://localhost:3000/catalog/templates')
const templatesData = await templatesResponse.json()
const templates = Array.isArray(templatesData?.items) ? templatesData.items : []

const cards = await all(`
  SELECT c.id, c.cardNumber, c.player, s.setName
  FROM catalog_cards c
  JOIN catalog_sets s ON s.id = c.setId
  WHERE s.setName = ?
  ORDER BY CAST(c.cardNumber AS INTEGER) ASC, c.player ASC
  LIMIT 6
`, ['Select'])

const templateByType = new Map(templates.map((item) => [item.resolvedType || item.templateType, item]))
const samplePayloads = [
  { type: 'single', templateId: templateByType.get('single')?.id, cardIds: [cards[0]?.id].filter(Boolean) },
  { type: 'pick-your-own', templateId: templateByType.get('pick-your-own')?.id, cardIds: cards.slice(0, 4).map(card => card.id).filter(Boolean) },
  { type: 'lot', templateId: templateByType.get('lot')?.id, cardIds: cards.slice(0, 4).map(card => card.id).filter(Boolean) },
  { type: 'mystery-pack', templateId: templateByType.get('mystery-pack')?.id, cardIds: cards.slice(0, 4).map(card => card.id).filter(Boolean), chaseCardId: cards[0]?.id }
].filter((payload) => payload.templateId && payload.cardIds.length)

const results = []
for (const payload of samplePayloads) {
  const response = await fetch('http://localhost:3000/catalog/listing-draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json()
  results.push({
    type: payload.type,
    ok: response.ok,
    title: data?.listing?.title,
    listingType: data?.listing?.listingType,
    quantity: data?.listing?.quantity,
    cardCount: Array.isArray(data?.listing?.cards) ? data.listing.cards.length : 0,
    hasVariation: Boolean(data?.listing?.variation),
    hasLot: Boolean(data?.listing?.lot),
    hasMysteryPack: Boolean(data?.listing?.mysteryPack)
  })
}

console.log(JSON.stringify({ templates: templates.map((item) => ({ id: item.id, name: item.name, resolvedType: item.resolvedType })), cards, results }, null, 2))

db.close()
