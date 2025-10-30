# 🚀 GitHub Profile Tracker Deployment Guide

This tracker serves your animated GIF and logs visitor data to Discord.

## 📋 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Discord Webhook

Edit `track-server.js` and replace line 14:

```javascript
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN';
```

**Get your Discord webhook:**
1. Go to your Discord server
2. Server Settings → Integrations → Webhooks
3. Create New Webhook
4. Copy the webhook URL

### 3. Test Locally

```bash
npm start
```

Visit http://localhost:3000/pixel.gif to test.

---

## 🌐 Deploy to Render.com (FREE)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Add tracking server"
git push
```

### Step 2: Deploy on Render
1. Go to https://render.com
2. Sign up/Login with GitHub
3. Click **New +** → **Web Service**
4. Connect your `oggynjack` repository
5. Configure:
   - **Name:** `oggynjack-tracker`
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Add Environment Variable:
   - Key: `DISCORD_WEBHOOK`
   - Value: Your Discord webhook URL
7. Click **Create Web Service**

### Step 3: Get Your URL
After deployment, you'll get a URL like:
```
https://oggynjack-tracker.onrender.com
```

Your tracking pixel URL will be:
```
https://oggynjack-tracker.onrender.com/pixel.gif
```

---

## 🌐 Alternative: Deploy to Railway.app (FREE)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **New Project** → **Deploy from GitHub repo**
4. Select `oggynjack` repository
5. Railway auto-detects Node.js
6. Add environment variable: `DISCORD_WEBHOOK`
7. Deploy!

Your URL: `https://oggynjack-tracker.up.railway.app/pixel.gif`

---

## 📝 Update GitHub Profile

Once deployed, update your GitHub profile README.md:

```markdown
<img src="https://YOUR-DEPLOYED-URL.onrender.com/pixel.gif" alt="" width="1" height="1" />
```

---

## 📊 What Gets Logged

Every profile visit logs:
- 👤 Profile name (oggynjack)
- 📍 Location (City, Country)
- 💻 Device type (Desktop/Mobile/Tablet)
- 🌐 IP Address
- 🔗 Referrer URL
- ⏰ Timestamp

**Example Discord Message:**
```
🌐 New GitHub Profile Visit
👤 Profile: oggynjack
📍 Location: London, United Kingdom
💻 Device: Desktop - Chrome
🌐 IP: 86.10.149.233
🔗 Referrer: github.com
⏰ Time: 30/10/2025, 22:30:15
```

---

## 🔧 Troubleshooting

**Server not starting?**
- Check Node.js is installed: `node --version`
- Install dependencies: `npm install`

**No Discord notifications?**
- Verify webhook URL is correct
- Check server logs for errors

**Pixel not loading?**
- Ensure GIF file `0code-aniamted.gif` is in same directory
- Check deployment logs

---

## 💡 Tips

- GitHub caches images, so visits may not log instantly
- Free tier on Render sleeps after 15 min of inactivity (takes ~30s to wake)
- Consider Railway.app for faster cold starts
- Use your own domain with Render for better reliability
