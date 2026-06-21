# CardPilot HQ - Automated Sports Card Inventory Manager

A full-stack web app for scanning, OCR extraction, and cataloging sports trading cards. Built with Node.js + Azure Document Intelligence + vanilla JavaScript.

## Features

✨ **AI-Powered OCR**
- Extract card details (player, team, set, year, condition) from images using Azure Document Intelligence
- Automatic duplicate detection and merging
- Front/back card pair analysis

📊 **Inventory Management**
- SQLite database persistence
- SKU auto-numbering (SKU-000001, etc.)
- Bulk import with conflict resolution
- eBay listing export

🎯 **Rate Limiting & Reliability**
- Client-side OCR pacing (1 request per 2.5 sec, 30 req/min cap)
- Server-side rate limiting and daily quotas
- 8-attempt exponential backoff retry
- Progressive error recovery

📱 **PWA Support**
- Home screen install
- Offline-capable with IndexedDB draft storage
- Real-time environment badges ([QA] / [PROD])

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- Azure Document Intelligence credentials (free tier available)
- Optional: SQLite browser for data inspection

### Install & Run

```bash
# Backend
cd backend
npm install
npm run start:qa

# Frontend (in separate terminal)
# Open http://localhost:3000 or http://localhost:3001
```

### Configure Azure

1. Get your Azure credentials from [Azure Portal](https://portal.azure.com):
   - Cognitive Services → Document Intelligence
   - Copy `Endpoint` and `API Key`

2. Create `.env.qa`:
   ```
   APP_ENV=qa
   AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
   AZURE_API_KEY=your-api-key-here
   AZURE_MODEL_ID=prebuilt-read
   ```

3. Restart backend: `npm run start:qa`

## Deployment

**GitHub Pages + Render (free):**

See [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step instructions.

Quick summary:
1. Push code to GitHub
2. Enable GitHub Pages (frontend at `https://jayzeespc.github.io/card-automation/`)
3. Deploy backend to Render free tier
4. Update `Frontend/config.json` with backend URL
5. Done! ✅

## Project Structure

```
backend/
  ├── server.js              # Express app + middleware
  ├── routes/                # /analyze, /inventory, /catalog, etc.
  ├── services/              # Azure client, card analyzer, duplicate scorer
  ├── data/
  │   ├── cache/azure/       # Persistent OCR cache
  │   ├── checklists/        # Import templates
  │   └── reports/           # Analysis reports (JSON)
  └── package.json

Frontend/
  ├── app.js                 # Main client logic (~3000 lines)
  ├── index.html             # DOM structure
  ├── config.json            # Backend URL config (for GitHub Pages)
  ├── manifest.webmanifest   # PWA metadata
  └── styles.css
```

## Key APIs

### Frontend → Backend

- `POST /analyze` - OCR extract card image
- `POST /inventory/bulk` - Import cards (merge with existing)
- `GET /inventory?sport=Football` - Fetch inventory
- `GET /config` - Environment metadata
- `GET /catalog/sets?sport=Football` - Available sets
- `GET /health` - Health check

### Rate Limiting

- **Frontend:** 1 concurrent OCR worker, 2.5s minimum interval
- **Server:** 30 requests / 60 second sliding window
- **Daily:** 500 Azure calls/day (configurable)

## Environment Variables

### `.env.qa` (QA/Testing)
```
APP_NAME=CardPilot HQ
APP_ENV=qa
PORT=3000
CORS_ORIGIN=http://localhost:3000
AZURE_ENDPOINT=...
AZURE_API_KEY=...
RATE_LIMIT_MAX_REQUESTS=30
```

### `.env.prod` (Production)
Same structure, with `APP_ENV=prod` and updated `CORS_ORIGIN`

## Testing

```bash
# Run regression suite
node backend/scripts/runRegressionBatch.mjs

# Start local dev server
npm run start:qa

# Check diagnostics
curl http://localhost:3000/diagnostics | jq
```

## Troubleshooting

**"Rate limit 429" errors:**
- Ensure frontend has `OCR_MIN_INTERVAL_MS = 2500`
- Check server logs for `Rate limit exceeded`
- Verify `RATE_LIMIT_MAX_REQUESTS=30` in .env

**"Backend not found":**
- Verify health endpoint: `curl http://localhost:3000/health`
- Check CORS_ORIGIN matches your frontend URL
- Ensure backend is running: `npm run start:qa`

**Duplicate rows not merging:**
- Check `scoreDuplicatePair()` scoring thresholds in `Frontend/app.js`
- Verify OCR cache isn't stale: clear `backend/data/cache/azure/`

## License

MIT

## Author

Built by [jayzeespc](https://github.com/jayzeespc)

---

**Ready to deploy?** See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages + Render setup.
