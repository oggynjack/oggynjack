import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ---------- IP utilities ----------
function ipToLong(ip) {
  const m = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(ip);
  if (!m) return null;
  return (parseInt(m[1]) << 24) + (parseInt(m[2]) << 16) + (parseInt(m[3]) << 8) + parseInt(m[4]);
}
function inCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const ipLong = ipToLong(ip);
  const rangeLong = ipToLong(range);
  if (ipLong === null || rangeLong === null) return false;
  const mask = -1 << (32 - parseInt(bits));
  return (ipLong & mask) === (rangeLong & mask);
}
function isPrivateIp(ip) {
  return (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    (ip.startsWith('172.') && (() => { const n = parseInt(ip.split('.')[1]); return n >= 16 && n <= 31; })())
  );
}
const proxyCidrs = [
  // GitHub
  '140.82.0.0/16','185.199.108.0/22','192.30.252.0/22',
  // Cloudflare
  '173.245.48.0/20','103.21.244.0/22','103.22.200.0/22','103.31.4.0/22',
  '141.101.64.0/18','108.162.192.0/18','190.93.240.0/20','188.114.96.0/20',
  '197.234.240.0/22','198.41.128.0/17','162.158.0.0/15','104.16.0.0/13',
  '104.24.0.0/14','172.64.0.0/13','131.0.72.0/22'
];
function isLikelyProxyIp(ip) {
  if (!ip) return true;
  if (isPrivateIp(ip)) return true;
  return proxyCidrs.some(c => inCidr(ip, c));
}

// Discord webhook URL
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || 'https://discord.com/api/webhooks/1433582170164826182/RyhKs8KNoPUWFOK2PtW_m-kyPWEUfjymd2wp1Qky7lG2kX02DpDhaYrbazHSXS__mCgL';

// ANSI color codes
const colors = {
  orange: '\x1b[38;5;202m',
  white: '\x1b[97m',
  green: '\x1b[38;5;34m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

// ASCII Art Banner with India flag colors
function showBanner() {
  console.log(`
${colors.orange} .d8888b.   .d8888b.                888                      888     
${colors.orange}d88P  Y88b d88P  Y88b               888                      888     
${colors.orange}888    888 888    888               888                      888     
${colors.white}888    888 888         .d88b.   .d88888  .d88b.     888  888 888  888
${colors.white}888    888 888        d88""88b d88" 888 d8P  Y8b    888  888 888 .88P
${colors.white}888    888 888    888 888  888 888  888 88888888    888  888 888888K 
${colors.green}Y88b  d88P Y88b  d88P Y88..88P Y88b 888 Y8b.    d8b Y88b 888 888 "88b
${colors.green} "Y8888P"   "Y8888P"   "Y88P"   "Y88888  "Y8888 Y8P  "Y88888 888  888
${colors.green}                                                        ${colors.white}❤️  Made by Oggy${colors.reset}
`);
}

// Show banner on startup and every 2 minutes
showBanner();
setInterval(showBanner, 120000); // 120 seconds

// ------ Simple in-memory dedupe to avoid multi-embeds ------
const recentEvents = new Map();
const DEDUPE_TTL_MS = 60 * 1000; // 60s window
function isDuplicateEvent(key) {
  const now = Date.now();
  const last = recentEvents.get(key);
  // Sweep occasionally
  if (recentEvents.size > 2000) {
    for (const [k, ts] of recentEvents.entries()) if (now - ts > DEDUPE_TTL_MS) recentEvents.delete(k);
  }
  if (last && (now - last) < DEDUPE_TTL_MS) return true;
  recentEvents.set(key, now);
  return false;
}

// Validate webhook on startup
if (DISCORD_WEBHOOK && DISCORD_WEBHOOK !== 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
  console.log(`${colors.blue}✅ Discord webhook configured${colors.reset}`);
} else {
  console.warn(`${colors.orange}⚠️  No Discord webhook configured${colors.reset}`);
}

// Visit counter file
const COUNTER_FILE = path.join(__dirname, 'visit-counter.json');
const MESSAGE_TRACKER_FILE = path.join(__dirname, 'message-tracker.json');

// Load or initialize visit counter
function loadCounter() {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      return data.count || 0;
    }
  } catch (err) {
    console.error('Error loading counter:', err.message);
  }
  return 0;
}

// Save visit counter
function saveCounter(count) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count, lastUpdated: new Date().toISOString() }));
  } catch (err) {
    console.error('Error saving counter:', err.message);
  }
}

// Load message tracker
function loadMessageTracker() {
  try {
    if (fs.existsSync(MESSAGE_TRACKER_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGE_TRACKER_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading message tracker:', err.message);
  }
  return [];
}

// Save message tracker (with size limit)
function saveMessageTracker(messages) {
  try {
    // Only keep last 5000 messages (safety limit)
    const limitedMessages = messages.slice(-5000);
    fs.writeFileSync(MESSAGE_TRACKER_FILE, JSON.stringify(limitedMessages));
  } catch (err) {
    console.error('Error saving message tracker:', err.message);
  }
}

// Delete old Discord messages (older than 4 days)
async function cleanupOldMessages() {
  const messages = loadMessageTracker();
  const fourDaysAgo = Date.now() - (4 * 24 * 60 * 60 * 1000);
  const remainingMessages = [];
  let deletedCount = 0;

  if (messages.length > 0) {
    console.log(`${colors.blue}🧹 Cleanup: checking ${messages.length} messages${colors.reset}`);
  }

  for (const msg of messages) {
    const messageAge = msg.ts || new Date(msg.timestamp).getTime();
    
    if (messageAge < fourDaysAgo) {
      try {
        const deleteUrl = `${DISCORD_WEBHOOK}/messages/${msg.id}`;
        await fetch(deleteUrl, { method: 'DELETE' });
        deletedCount++;
      } catch (err) {
        if (!err.message.includes('404')) {
          remainingMessages.push(msg);
        }
      }
    } else {
      remainingMessages.push(msg);
    }
  }

  saveMessageTracker(remainingMessages);
  
  if (deletedCount > 0) {
    console.log(`${colors.green}✅ Deleted ${deletedCount} old messages${colors.reset}`);
  }
}

let visitCount = loadCounter();

// Run cleanup every 6 hours
setInterval(cleanupOldMessages, 6 * 60 * 60 * 1000);
cleanupOldMessages(); // Run on startup

// Serve the tracking GIF
app.get('/pixel.gif', async (req, res) => {
  try {
    // Get visitor info - extract real IP from proxy chain
    const forwardedFor = req.headers['x-forwarded-for'];
    const cfConnecting = req.headers['cf-connecting-ip'];
    const xReal = req.headers['x-real-ip'];
    let ip = 'Unknown';

    // Build candidate list (preserve order)
    const candidates = [];
    if (forwardedFor) candidates.push(...forwardedFor.split(',').map(s => s.trim()));
    if (cfConnecting) candidates.push(String(cfConnecting).trim());
    if (xReal) candidates.push(String(xReal).trim());
    if (req.socket && req.socket.remoteAddress) candidates.push(String(req.socket.remoteAddress).replace('::ffff:', ''));

    // Choose first public IP not in known proxy ranges
    const publicCandidate = (candidates.find(ipc => /^(\d{1,3}\.){3}\d{1,3}$/.test(ipc) && !isLikelyProxyIp(ipc)));
    if (publicCandidate) {
      ip = publicCandidate;
    } else if (candidates.length > 0) {
      // fallback to first in chain
      ip = candidates[0];
    }
    
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ua = userAgent.toLowerCase();
    const referrer = (req.headers['referer'] || 'Direct Visit').toString();
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'UTC' });

    // Detect GitHub/CDN proxy requests (images in README are proxied)
    const isProxied =
      ua.includes('github') ||
      ua.includes('camo') ||
      referrer.includes('github.com') ||
      isLikelyProxyIp(candidates[0] || ip)

    // Parse device info with better iOS detection
    let device = 'Unknown';
    if (ua.includes('iphone') || ua.includes('ipod')) {
      device = 'iPhone';
    } else if (ua.includes('ipad')) {
      device = 'iPad';
    } else if (ua.includes('android') && ua.includes('mobile')) {
      device = 'Android Phone';
    } else if (ua.includes('android')) {
      device = 'Android Tablet';
    } else if (ua.includes('mobile')) {
      device = 'Mobile';
    } else if (ua.includes('tablet')) {
      device = 'Tablet';
    } else {
      device = 'Desktop';
    }

    // Parse browser with better detection (order matters!)
    let browser = 'Unknown';
    if (ua.includes('crios')) {
      browser = 'Chrome iOS';
    } else if (ua.includes('fxios')) {
      browser = 'Firefox iOS';
    } else if (ua.includes('edgios')) {
      browser = 'Edge iOS';
    } else if (ua.includes('edg/') || ua.includes('edge/')) {
      browser = 'Edge';
    } else if (ua.includes('chrome')) {
      browser = 'Chrome';
    } else if (ua.includes('firefox')) {
      browser = 'Firefox';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      browser = 'Safari';
    } else if (ua.includes('opr') || ua.includes('opera')) {
      browser = 'Opera';
    }

    if (isProxied) {
      device = 'Proxy (GitHub/CDN)';
      browser = 'Proxied Request';
    }

    // Dedupe key (IP + UA)
    const dedupeKey = `${ip}|${userAgent.substring(0,50)}`;
    if (isDuplicateEvent(dedupeKey)) {
      // Likely duplicate from GitHub CDN double-fetch; skip logging/embed
      return res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': fs.statSync(path.join(__dirname, '0code-aniamted.gif')).size,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }).end(fs.readFileSync(path.join(__dirname, '0code-aniamted.gif')));
    }

    // Increment visit counter
    visitCount++;
    saveCounter(visitCount);

    // Clean, brief logging (no sensitive data)
    console.log(`${colors.blue}👀 Visit #${visitCount} | ${device} - ${browser} | ${timestamp}${colors.reset}`);

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
          title: `🌐 Profile Visit #${visitCount}`,
          color: 0x00D9FF,
          fields: [
            { name: '👤 Profile', value: 'oggynjack', inline: true },
            { name: '📊 Total Visits', value: `${visitCount}`, inline: true },
            { name: '📍 Location', value: isProxied ? 'Proxied via GitHub/CDN' : locationInfo, inline: true },
            { name: '💻 Device', value: `${device} - ${browser}`, inline: true },
            { name: '🌐 IP Address', value: ip, inline: true },
            { name: '🔗 Referrer', value: referrer.substring(0, 80), inline: false },
            { name: '⏰ Time', value: timestamp, inline: true }
          ],
          footer: { text: 'Auto-deletes after 4 days' },
          timestamp: new Date().toISOString()
        }]
      };

      try {
        const response = await fetch(DISCORD_WEBHOOK, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'GitHubProfileTracker/1.0'
          },
          body: JSON.stringify(discordMessage)
        });
        
        const responseText = await response.text();
        
        // Check response status
        if (!response.ok) {
          console.error(`${colors.orange}❌ Discord failed (${response.status})${colors.reset}`);
        } else if (response.status === 204) {
          // 204 No Content = Success
          console.log(`${colors.green}✅ Discord notified${colors.reset}`);
        } else if (responseText.length > 0) {
          // Try to parse as JSON
          try {
            const data = JSON.parse(responseText);
            
            // Track message for cleanup if we get an ID
            if (data.id) {
              const messages = loadMessageTracker();
              messages.push({
                id: data.id,
                ts: Date.now(),
                v: visitCount
              });
              saveMessageTracker(messages);
            }
            
            console.log(`${colors.green}✅ Discord notified${colors.reset}`);
          } catch (parseErr) {
            console.error(`${colors.orange}⚠️  Unexpected response format${colors.reset}`);
          }
        } else {
          console.log(`${colors.green}✅ Discord notified${colors.reset}`);
        }
      } catch (err) {
        console.error(`${colors.orange}❌ Discord error: ${err.message}${colors.reset}`);
      }
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

// Test Discord webhook endpoint
app.get('/test-webhook', async (req, res) => {
  if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
    return res.send('❌ No webhook configured');
  }

  try {
    const testMessage = {
      content: '🧪 **Test message from tracking server!**',
      embeds: [{
        title: '✅ Webhook Test Successful',
        description: 'If you can see this, your Discord webhook is working properly!',
        color: 0x00FF00,
        timestamp: new Date().toISOString()
      }]
    };

    const response = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });

    const responseText = await response.text();

    res.send(`
      <h2>Discord Webhook Test</h2>
      <p><strong>Status:</strong> ${response.status} ${response.statusText}</p>
      <p><strong>Webhook URL:</strong> ${DISCORD_WEBHOOK.substring(0, 60)}...</p>
      <p><strong>Response Headers:</strong></p>
      <pre>${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}</pre>
      <p><strong>Response Body:</strong></p>
      <pre>${responseText.substring(0, 500)}</pre>
      ${response.ok ? '<h3 style="color: green;">✅ Success! Check your Discord channel.</h3>' : '<h3 style="color: red;">❌ Failed!</h3>'}
    `);
  } catch (err) {
    res.send(`<h2>Error</h2><pre>${err.message}\n\n${err.stack}</pre>`);
  }
});

const PORT = process.env.PORT || 4013;
app.listen(PORT, () => {
  console.log(`${colors.green}✅ Server running on port ${PORT}${colors.reset}`);
  console.log(`${colors.blue}📊 Endpoint: /pixel.gif${colors.reset}`);
});
