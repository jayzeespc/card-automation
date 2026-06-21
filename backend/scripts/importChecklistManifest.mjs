import path from 'path'
import { importChecklistManifest } from '../services/cardCatalogService.js'

const manifestArg = process.argv[2]
const manifestPath = manifestArg || path.join('data', 'checklists', 'downloads', 'football-checklist-downloads-manifest.json')

const result = await importChecklistManifest(manifestPath)
console.log(JSON.stringify(result, null, 2))
