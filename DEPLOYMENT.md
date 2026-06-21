# CardPilot HQ - GitHub Pages + Render Deployment Guide

## Overview
This guide walks you through deploying CardPilot HQ as a free, publicly accessible app:
- **Frontend**: GitHub Pages (static hosting, free, unlimited)
- **Backend**: Render.com (free tier, includes 750 free hours/month)

**End Result:**
- Frontend URL: `https://jayzeespc.github.io/card-automation/`
- Backend URL: `https://cardpilot-qa.onrender.com/` (or custom domain)

---

## Prerequisites
- GitHub account: [jayzeespc](https://github.com/jayzeespc) ✓
- Render.com account (free signup): https://render.com
- Your Azure Document Intelligence credentials (API key + endpoint)

---

## Step 1: Create GitHub Repository

### Option A: Push existing code (Recommended)
```powershell
cd d:\Website\card-automation

# Initialize git repo (if not already done)
git init
git add .
git commit -m "Initial commit: CardPilot HQ with frontend and backend"

# Add remote and push to GitHub
git remote add origin https://github.com/jayzeespc/card-automation.git
git branch -M main
git push -u origin main
```

### Option B: Use GitHub Desktop or Web UI
1. Go to https://github.com/new
2. Create repo: `card-automation`
3. Clone to your PC, copy files, commit, and push

---

## Step 2: Deploy Frontend to GitHub Pages

### 2a. Configure GitHub Pages
1. Go to your repo: https://github.com/jayzeespc/card-automation
2. Settings → Pages
3. Under "Build and deployment":
   - Source: `Deploy from a branch`
   - Branch: `main`, folder: `/ (root)`
   - Save

**Your frontend is now live at:** `https://jayzeespc.github.io/card-automation/`

### 2b. Verify Frontend is Accessible
Open https://jayzeespc.github.io/card-automation/ in your browser. You should see the CardPilot HQ header (but backend errors since backend is not deployed yet).

---

## Step 3: Deploy Backend to Render

### 3a. Create a Render Account
1. Sign up at https://render.com (free account)
2. Connect your GitHub account for easy deployments

### 3b. Deploy Backend Service
1. From Render dashboard: **New +** → **Web Service**
2. **Connect Repository:**
   - Search for: `card-automation`
   - Connect your repo

3. **Configure Service:**
   - **Name:** `cardpilot-qa` (or any name)
   - **Environment:** `Node`
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `node backend/server.js`
   - **Plan:** Free (you'll get the 750 free hours/month)

4. **Add Environment Variables:**
   - Click **Advanced** → **Add Environment Variable** for each:
     - `APP_NAME`: `CardPilot HQ`
     - `APP_ENV`: `qa`
     - `AZURE_ENDPOINT`: (your Azure endpoint from Azure Portal)
     - `AZURE_API_KEY`: (your Azure API key)
     - `AZURE_MODEL_ID`: `prebuilt-read`
     - `AZURE_API_VERSION`: `2024-11-30`
     - `RATE_LIMIT_MAX_REQUESTS`: `30`
     - `RATE_LIMIT_WINDOW_MS`: `60000`
     - `AZURE_DAILY_LIMIT`: `500`
     - `USE_MOCK_AI`: `false`
     - `NODE_ENV`: `production`
     - `CORS_ORIGIN`: `https://jayzeespc.github.io`

5. **Click Deploy** (deployment takes ~2-3 minutes)

### 3c: Get Your Backend URL
After deployment succeeds, Render gives you a URL like: `https://cardpilot-qa.onrender.com`

**Test the backend:**
```
https://cardpilot-qa.onrender.com/health
```
Should return `OK`.

---

## Step 4: Connect Frontend to Backend

Now tell the frontend where the backend is by updating `Frontend/config.json`:

```json
{
  "backendUrl": "https://cardpilot-qa.onrender.com"
}
```

### Push this change to GitHub:
```powershell
cd d:\Website\card-automation
git add Frontend/config.json
git commit -m "Configure backend URL for GitHub Pages deployment"
git push
```

GitHub Pages will auto-rebuild your frontend (~1 minute).

---

## Step 5: End-to-End Testing

### 5a. Test Frontend + Backend Connection
Open https://jayzeespc.github.io/card-automation/

You should see:
- ✅ CardPilot HQ title with [QA] badge (orange)
- ✅ No backend errors in browser console
- ✅ "AI extraction enabled" message

### 5b. Test Card Import
1. Use the upload button to import a small batch (3-5 cards)
2. Monitor for:
   - ✅ OCR calls succeed (no 429 rate limit errors)
   - ✅ SKU counter increments correctly
   - ✅ Duplicate rows merge as expected
   - ✅ Inventory saves to backend

### 5c. Test Inventory Persistence
Check Render backend logs for:
```
POST /inventory/bulk { inserted: X, updated: Y, total: Z }
```

---

## Step 6: Optional Customizations

### Use a Custom Domain (Optional)
If you own a domain (e.g., `cardpilothq.com`):

1. **GitHub Pages custom domain:**
   - Settings → Pages → Custom Domain
   - Add your domain
   - GitHub will give you DNS settings

2. **Render custom domain:**
   - Service Settings → Custom Domain
   - Add your domain

This makes URLs prettier but is optional for free tier.

---

## Important Notes

### Render Free Tier Limitations
- **Sleeps after 15 min of inactivity:** First request after sleep takes ~30 sec to wake up
- **750 free hours/month:** Enough for continuous running (~1000 hours in 30 days)
- **No custom domain included:** But you can add one for free

### GitHub Pages
- Limits: 1 GB max repo size, 100 GB/month bandwidth
- Static files only (perfect for your frontend)
- Automatically rebuilds on push to `main`

### Local Development
After deployment, local development still works:
```powershell
# Terminal 1: Backend
cd backend
npm run start:qa

# Terminal 2: Frontend
# Open http://localhost:3001 in browser
# Frontend will auto-detect backend on localhost:3000
```

---

## Troubleshooting

### "Backend not found" Error
- Check Render deployment logs: Render dashboard → Service → Logs
- Verify `AZURE_API_KEY` is set correctly
- Ensure `CORS_ORIGIN` includes your GitHub Pages URL

### "Rate limit 429" Errors
- Backend is working but frontend is sending too many requests
- Make sure frontend code has `OCR_MIN_INTERVAL_MS = 2500` and `IMPORT_AI_CONCURRENCY = 1`
- Check Render logs for `Rate limit exceeded` messages

### GitHub Pages Shows Old Version
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R on Windows)
- GitHub Pages caches for ~5 minutes

### Render Wakes Up Slow
- This is normal on free tier. First request after sleep takes 30 sec.
- Can be avoided by using a paid tier ($7/month) or keeping backend always active with monitoring

---

## Next Steps

Once live, you can:
1. ✅ Test from any device on your home Wi-Fi
2. ✅ Test from your phone on mobile data
3. ✅ Share the URL with external testers (if you set `BETA_ACCESS_TOKEN`)
4. ✅ Upgrade to Render paid tier if you need always-on performance

---

## Quick Reference Commands

```powershell
# Initialize git and push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/jayzeespc/card-automation.git
git push -u origin main

# Update config and redeploy
git add Frontend/config.json
git commit -m "Update backend URL"
git push

# Check deployment status
# GitHub: https://github.com/jayzeespc/card-automation/deployments
# Render: https://dashboard.render.com
```

---

## Support

If you encounter issues:
1. Check Render logs: https://dashboard.render.com
2. Check GitHub Pages build logs: Settings → Pages → Build logs (if deployment fails)
3. Check browser console errors (F12 → Console tab)
4. Verify all environment variables are set on Render

**Deployment complete! 🚀**
