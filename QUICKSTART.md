# Quick Start: Deploy CardPilot HQ to GitHub Pages + Render

## 1. Push to GitHub (5 min)

```powershell
cd d:\Website\card-automation
.\setup-github.bat

# Follow prompts to connect to your GitHub repo
```

This will:
- ✅ Initialize git locally
- ✅ Commit your code
- ✅ Push to `https://github.com/jayzeespc/card-automation`

## 2. Enable GitHub Pages (2 min)

1. Go to: https://github.com/jayzeespc/card-automation/settings/pages
2. Under "Source", select: Branch: `main`, Folder: `/ (root)`
3. Save

Your frontend is now live at:
👉 **https://jayzeespc.github.io/card-automation/**

(GitHub Pages rebuilds automatically when you push. Wait ~1 minute for it to appear.)

## 3. Deploy Backend to Render (10 min)

1. Sign up at https://render.com (free account)
2. Click: **New +** → **Web Service**
3. Search for and connect: `card-automation` repo

### Configure Service:
- **Name:** `cardpilot-qa`
- **Environment:** `Node`
- **Build Command:** `cd backend && npm install`
- **Start Command:** `node backend/server.js`
- **Plan:** Free

### Add Environment Variables (copy from Azure Portal):
```
APP_NAME=CardPilot HQ
APP_ENV=qa
AZURE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_API_KEY=your-api-key-here
AZURE_MODEL_ID=prebuilt-read
AZURE_API_VERSION=2024-11-30
NODE_ENV=production
CORS_ORIGIN=https://jayzeespc.github.io
RATE_LIMIT_MAX_REQUESTS=30
RATE_LIMIT_WINDOW_MS=60000
AZURE_DAILY_LIMIT=500
```

Click **Deploy**. Wait ~3 min for deployment to complete.

After deployment, your backend URL is: `https://cardpilot-qa.onrender.com`

## 4. Connect Frontend to Backend (1 min)

Edit `Frontend/config.json`:

```json
{
  "backendUrl": "https://cardpilot-qa.onrender.com"
}
```

Commit and push:
```powershell
git add Frontend/config.json
git commit -m "Set backend URL for deployment"
git push
```

GitHub Pages rebuilds automatically. Wait ~1 minute.

## 5. Test It! ✅

Open: https://jayzeespc.github.io/card-automation/

You should see:
- ✅ CardPilot HQ header with **[QA]** badge (orange)
- ✅ "AI extraction enabled" message
- ✅ No console errors

Try uploading a small batch (3-5 cards) to test end-to-end:
- ✅ OCR extracts card details
- ✅ SKU increments (SKU-000001, etc.)
- ✅ Duplicates merge
- ✅ Inventory saves

## Troubleshooting

### Backend not found / 404 errors
- Verify Render deployment succeeded: https://dashboard.render.com
- Check your Azure credentials are correct
- Verify `CORS_ORIGIN=https://jayzeespc.github.io` is set on Render
- Clear browser cache (Ctrl+Shift+Del) and hard refresh (Ctrl+Shift+R)

### Rate limit (429) errors
- This means backend is working but being overwhelmed
- Check Render logs for details
- Verify frontend code has `OCR_MIN_INTERVAL_MS = 2500`

### Frontend shows old version
- Hard refresh: **Ctrl+Shift+R** (Windows)
- Clear cache: **Ctrl+Shift+Delete**

## That's It! 🚀

Your app is now:
- 📱 Accessible from any device (phone, tablet, PC)
- 🌐 On a real HTTPS URL (not localhost)
- 💰 **Completely free**

---

**Next Steps:**
- Test from your phone on home Wi-Fi
- Test from mobile data (outside network)
- Share the URL with testers if needed

**For detailed info:** See [DEPLOYMENT.md](DEPLOYMENT.md)
