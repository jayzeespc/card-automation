# Card Automation Beta UAT Runbook

## Goal
Validate that card extraction and merged output are reliable enough for beta testers with controlled Azure usage.

## Environment Preconditions
- Backend running from `backend` on `http://localhost:3000`
- Azure credentials configured in backend environment
- `AZURE_DAILY_LIMIT` set (default is 500)
- Test image folders available under scanned football root

## Preflight Checks
1. Start backend: `npm start` (from `backend`)
2. Check diagnostics: `GET /diagnostics`
3. Confirm these values:
   - `status: ok`
   - `azureCostGuardrail.dailyLimit` is present
   - `azureCostGuardrail.usedToday` is present and reasonable
   - `betaReadiness.readyForBeta` is `true`

## Cost-First Regression Strategy
1. Use cheap mode for routine checks:
   - `node scripts/runRegressionBatch.mjs "D:/Sport Cards/Scanned from Epson/Football" --limit=20 --gate=beta --cheap`
2. Only run larger sweeps after code changes that impact extraction quality:
   - `--limit=40` or higher when needed
3. Re-running the same dataset is now lower cost because Azure OCR responses are cached locally in `backend/data/cache/azure`.
4. Keep `AZURE_CACHE_ENABLED=true` (default). Disable only when intentionally testing uncached behavior.
5. Reserve full enhancement fallback runs for targeted defect investigation, not every regression cycle.

## UAT Test Flow
1. Select 10-15 representative front/back card pairs across at least 2 teams.
2. Run analysis through normal app flow (not scripts) to mimic operator behavior.
3. For each pair, record:
   - Player
   - Team
   - Set
   - Year
   - Card number
   - Position
   - Any obvious mismatch between front/back merge and expected card info
4. Mark each test case as `Pass`, `Pass with warning`, or `Fail`.

## Pass Criteria
- Required fields coverage in sampled pairs:
  - Player, Team, Set, Year, Card Number: 100%
  - Position: >= 90%
- No critical merge errors (wrong player/team from opposite side)
- No backend crashes during run
- Diagnostics remains healthy and Azure calls do not exceed daily cap

## Failure Handling
1. Capture failing pair file names and team folder.
2. Save API response payload and diagnostics snapshot.
3. Classify issue:
   - OCR miss
   - Merge conflict
   - Catalog trust mismatch
   - Front/back side detection mismatch
4. Open a bug with reproduction steps and attach evidence.

## Post-Run Steps
1. Run broader regression script when needed:
   - `node scripts/runRegressionBatch.mjs "D:/Sport Cards/Scanned from Epson/Football" --limit=45 --gate=beta --cheap`
2. Archive outputs in `backend/data/reports`.
3. Share latest beta readiness summary (`beta-readiness-latest.json`) with stakeholders.

## Operator Notes
- Side detector disagreement is currently advisory-only and expected in current dataset.
- Parallel coverage at 0% is acceptable when parallel signal evidence is also 0%.
