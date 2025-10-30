import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ⚠️ REPLACE WITH YOUR DISCORD WEBHOOK URL
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1433582170164826182/RyhKs8KNoPUWFOK2PtW_m-kyPWEUfjymd2wp1Qky7lG2kX02DpDhaYrbazHSXS__mCgL';

// Serve the tracking GIF
app.get('/pixel.gif', async (req, res) => {
  try {
    // Get visitor info
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = req.headers['referer'] || 'Direct Visit';
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'UTC' });

    // Parse device info
    let device = 'Unknown';
    if (userAgent.includes('Mobile')) device = 'Mobile';
    else if (userAgent.includes('Tablet')) device = 'Tablet';
    else device = 'Desktop';

    // Parse browser
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    console.log(`📊 Profile Visit: ${ip} | ${device} - ${browser} | ${timestamp}`);

    // Send to Discord (optional - fetch location data)
    let locationInfo = 'Unknown';
    try {
      const locationRes = await fetch(`https://ipapi.co/${ip}/json/`);
      if (locationRes.ok) {
        const locationData = await locationRes.json();
        locationInfo = `${locationData.city || 'Unknown'}, ${locationData.country_name || 'Unknown'}`;
      }
    } catch (err) {
      console.log('Location lookup failed:', err.message);
    }

    // Send Discord notification
    if (DISCORD_WEBHOOK && DISCORD_WEBHOOK !== 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
      const discordMessage = {
        embeds: [{
          title: '🌐 New GitHub Profile Visit',
          color: 0x00D9FF,
          fields: [
            { name: '👤 Profile', value: 'oggynjack', inline: true },
            { name: '📍 Location', value: locationInfo, inline: true },
            { name: '💻 Device', value: `${device} - ${browser}`, inline: true },
            { name: '🌐 IP Address', value: ip, inline: true },
            { name: '🔗 Referrer', value: referrer.substring(0, 50), inline: false },
            { name: '⏰ Time', value: timestamp, inline: true }
          ],
          footer: { text: 'GitHub Profile Tracker' },
          timestamp: new Date().toISOString()
        }]
      };

      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordMessage)
      }).catch(err => console.error('Discord webhook failed:', err.message));
    }

    // Serve the GIF file
    const gifPath = path.join(__dirname, '0code-aniamted.gif');
    const gifBuffer = fs.readFileSync(gifPath);
    
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': gifBuffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(gifBuffer);

  } catch (error) {
    console.error('Error:', error);
    // Send a 1x1 transparent pixel as fallback
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(pixel);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🚀 GitHub Profile Tracker is running!');
});

const PORT = process.env.PORT || 4013;
app.listen(PORT, () => {
  console.log(`✅ Tracking server running on port ${PORT}`);
  console.log(`📊 Tracking endpoint: http://localhost:${PORT}/pixel.gif`);
});
