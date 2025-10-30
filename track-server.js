import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Discord webhook URL
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || 'https://discord.com/api/webhooks/1433582170164826182/RyhKs8KNoPUWFOK2PtW_m-kyPWEUfjymd2wp1Qky7lG2kX02DpDhaYrbazHSXS__mCgL';

// Validate webhook on startup
if (DISCORD_WEBHOOK && DISCORD_WEBHOOK !== 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
  console.log('✅ Discord webhook configured');
} else {
  console.warn('⚠️  No Discord webhook configured - notifications disabled');
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

  console.log(`🧹 Starting cleanup... ${messages.length} messages tracked`);

  for (const msg of messages) {
    // Handle both old format (timestamp) and new format (ts)
    const messageAge = msg.ts || new Date(msg.timestamp).getTime();
    
    if (messageAge < fourDaysAgo) {
      // Delete old message
      try {
        const deleteUrl = `${DISCORD_WEBHOOK}/messages/${msg.id}`;
        await fetch(deleteUrl, { method: 'DELETE' });
        deletedCount++;
      } catch (err) {
        // If delete fails, keep in tracker (message might already be deleted)
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
    console.log(`✅ Cleanup complete: ${deletedCount} messages deleted, ${remainingMessages.length} remaining`);
  }
  
  // Log file size for monitoring
  try {
    const stats = fs.statSync(MESSAGE_TRACKER_FILE);
    console.log(`💾 Tracker file size: ${(stats.size / 1024).toFixed(2)} KB`);
  } catch (err) {
    // File doesn't exist yet
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
    let ip = 'Unknown';
    
    if (forwardedFor) {
      // x-forwarded-for contains comma-separated IPs, first one is the real client IP
      const ips = forwardedFor.split(',').map(ip => ip.trim());
      ip = ips[0]; // Real visitor IP
    } else {
      ip = req.socket.remoteAddress || 'Unknown';
    }
    
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = req.headers['referer'] || 'Direct Visit';
    const timestamp = new Date().toLocaleString('en-GB', { timeZone: 'UTC' });

    // Parse device info
    let device = 'Unknown';
    if (userAgent.includes('Mobile')) device = 'Mobile';
    else if (userAgent.includes('Tablet')) device = 'Tablet';
    else device = 'Desktop';

    // Parse browser with better detection
    let browser = 'Unknown';
    if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('OPR') || userAgent.includes('Opera')) browser = 'Opera';

    // Increment visit counter
    visitCount++;
    saveCounter(visitCount);

    // Enhanced console logging
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 NEW PROFILE VISIT #${visitCount}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`👤 Profile: oggynjack`);
    console.log(`🌐 IP: ${ip}`);
    console.log(`💻 Device: ${device}`);
    console.log(`🌐 Browser: ${browser}`);
    console.log(`🔗 Referrer: ${referrer}`);
    console.log(`⏰ Time: ${timestamp}`);
    console.log(`${'='.repeat(60)}\n`);

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
            { name: '📍 Location', value: locationInfo, inline: true },
            { name: '💻 Device', value: `${device} - ${browser}`, inline: true },
            { name: '🌐 IP Address', value: ip, inline: true },
            { name: '🔗 Referrer', value: referrer.substring(0, 50), inline: false },
            { name: '⏰ Time', value: timestamp, inline: true }
          ],
          footer: { text: 'Auto-deletes after 4 days' },
          timestamp: new Date().toISOString()
        }]
      };

      try {
        console.log('📤 Sending to Discord...');
        
        const response = await fetch(DISCORD_WEBHOOK, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'GitHubProfileTracker/1.0'
          },
          body: JSON.stringify(discordMessage)
        });
        
        const responseText = await response.text();
        
        console.log(`Response Status: ${response.status}`);
        console.log(`Response has body: ${responseText.length > 0}`);
        
        // Check response status
        if (!response.ok) {
          console.error(`❌ Discord webhook failed (${response.status})`);
          console.error('Response:', responseText.substring(0, 300));
          console.error('Webhook URL:', DISCORD_WEBHOOK.substring(0, 50) + '...');
        } else {
          // Try to parse as JSON
          try {
            const data = JSON.parse(responseText);
            
            // Track message for cleanup (compact format)
            const messages = loadMessageTracker();
            messages.push({
              id: data.id,
              ts: Date.now(),
              v: visitCount
            });
            saveMessageTracker(messages);
            
            console.log(`✅ Discord notification sent (#${visitCount})`);
          } catch (parseErr) {
            console.error('❌ Discord returned non-JSON response');
            console.error('Response preview:', responseText.substring(0, 500));
            console.error('Content-Type:', response.headers.get('content-type'));
            console.error('Response Status:', response.status);
            console.error('Webhook (first 70 chars):', DISCORD_WEBHOOK.substring(0, 70));
          }
        }
      } catch (err) {
        console.error('❌ Discord webhook error:', err.message);
        console.error('Stack:', err.stack);
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
  console.log(`✅ Tracking server running on port ${PORT}`);
  console.log(`📊 Tracking endpoint: http://localhost:${PORT}/pixel.gif`);
});
