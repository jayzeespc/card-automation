# CardPilot HQ Backend

## Environment Modes

CardPilot HQ supports separate QA and PROD environment profiles.

- `QA`: use for feature validation and tester feedback.
- `PROD`: reserved for your eventual production rollout.

### Quick Setup for QA (Home Network)

1. Copy `backend/.env.qa.example` to `backend/.env.qa`.
2. Fill in Azure keys in `.env.qa`.
3. Start QA mode:

```powershell
npm run start:qa
```

4. Open from your PC at `http://localhost:3000`.
5. Open from phone on same Wi-Fi at `http://<your-pc-lan-ip>:3000`.

This keeps QA private to your home network and does not publish it to the public internet.

### PROD (Prepared, Not Yet Required)

When you are ready later:

1. Copy `backend/.env.prod.example` to `backend/.env.prod`.
2. Configure production values and token.
3. Start with:

```powershell
npm run start:prod
```

## Quick Start

### Initial Setup (One Time)

1. **Start the Process Manager** (controls backend from UI)
   - **Option A (Batch file)**: Double-click `start-manager.bat` in this folder
   - **Option B (PowerShell)**: Right-click `start-manager.ps1` → Run with PowerShell
   - **Option C (Manual)**: Open PowerShell here and run `npm install && node process-manager.js`

2. The process manager will start on port 3333 and wait for commands

3. Open the frontend at `http://localhost:5500` (or wherever your Live Server is running)

4. Backend now starts automatically when the frontend opens (if process manager is running)

5. The top-right status indicator still allows manual stop/start override when needed

### Architecture

- **Main Backend** (port 3000)
  - Express server with card extraction endpoints
  - Azure Document Intelligence integration
  - Handles all card automation features

- **Process Manager** (port 3333)
  - Lightweight manager that starts/stops the main backend
  - Runs separately from main backend
  - Allows UI control of backend lifecycle

### Manual Control

If you prefer command-line control:

```powershell
# Start just the backend (requires manual stop with Ctrl+C)
npm start

# Start QA profile (CardPilot HQ)
npm run start:qa

# Start PROD profile (when ready)
npm run start:prod

# Or with the manager running, use the UI buttons
```

### Regression Gate (Beta Readiness)

Use the regression gate to decide if the current build is safe for beta testing:

```powershell
# Runs a 20-pair batch and prints a qualityGate pass/fail summary
npm run regression:beta

# Same run, but exits non-zero when qualityGate fails (CI/automation use)
npm run regression:beta:ci
```

You can also run with custom thresholds:

```powershell
node scripts/runRegressionBatch.mjs "D:/Sport Cards/Scanned from Epson/Football" --limit=20 --gate=beta --min-position=85 --min-year=95 --min-pairs=20
```

The report JSON now includes:
- `summary.qualityGate`: pass/fail, failures, warnings, and thresholds
- `summary.parallelEvidence`: token evidence to explain 0% parallel coverage
- `summary.sideDetectorDisagreePct`: advisory detector disagreement rate

Each run also writes machine-readable beta readiness artifacts:
- `data/reports/beta-readiness-latest.json`
- `data/reports/beta-readiness-<timestamp>.json`

### Environment Variables

Create a `.env`, `.env.qa`, or `.env.prod` file with:
```
APP_NAME=CardPilot HQ
APP_ENV=qa
AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_API_KEY=your-api-key-here
AZURE_MODEL_ID=prebuilt-read
AZURE_API_VERSION=2024-11-30
USE_MOCK_AI=false
PORT=3000

# Optional: comma-separated allowlist when you want stricter browser origins
# CORS_ORIGIN=http://localhost:3000,http://192.168.1.25:3000
CORS_ORIGIN=

# --- Beta access control (optional) ---
# Set to a strong secret to require "Authorization: Bearer <token>" on all API routes.
# Leave blank for local dev (no auth required).
BETA_ACCESS_TOKEN=

# --- Rate limiting (optional, defaults shown) ---
# Max OCR requests per IP per window. Keeps Azure costs bounded during beta.
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30

# --- Azure retry settings (optional, defaults shown) ---
AZURE_RETRY_ATTEMPTS=3
AZURE_SUBMIT_RETRY_ATTEMPTS=4
```

### Troubleshooting

**"Process manager won't start"**
- Make sure Node.js is installed: `node --version`
- Check that port 3333 isn't in use
- Run from the backend folder

**"Backend does not auto-start when frontend opens"**
- Make sure process manager is running on port 3333
- Check browser console for errors (F12 → Console)
- Verify backend folder path in process-manager.js

**"Backend won't start from UI"**
- Try clicking "Start Server" again (may take 2-3 seconds)
- Check the process manager console for error messages
- Try starting manually with `npm start` first

## File Structure

```
backend/
├── server.js              # Main Express backend (rate limiting, auth guard, diagnostics)
├── process-manager.js     # UI-controlled server manager
├── start-manager.bat      # Quick start (Windows)
├── start-manager.ps1      # Quick start (PowerShell)
├── .env                   # Configuration
├── services/
│   ├── azureClient.js     # Azure Document Intelligence API (with retry)
│   ├── cardAnalyzer.js    # Shared OCR pipeline with catalog assist
│   ├── cardPairMergeService.js # Front/back merge heuristics
│   └── ...
├── routes/
│   ├── analyze.js         # Card extraction endpoint (structured error logging)
│   └── ...
├── scripts/
│   └── runRegressionBatch.mjs  # Beta regression gate runner
├── data/
│   └── reports/
│       ├── beta-readiness-latest.json  # Latest beta readiness verdict
│       └── regression-*.json           # Timestamped regression reports
└── logs/
    └── analyze-errors.log   # Structured JSON error log (one entry per line)
```

### Key API Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Basic liveness check (always public) |
| `GET /config` | AI enabled / mock mode status |
| `GET /diagnostics` | Beta readiness, rate limit config, latest gate result |
| `GET /errors/recent?limit=20` | Most recent structured error log entries |
| `POST /analyze` | OCR card extraction (rate limited) |
