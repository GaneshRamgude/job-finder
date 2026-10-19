// server.js
// High Performance Pure Node.js Web Server & API for Educational Qualification Job Finder

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const majhiCrawler = require('./services/majhiCrawler');
const naukriService = require('./services/naukriService');
const roleRecommender = require('./services/roleRecommender');
const notificationManager = require('./services/notificationManager');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Wire up live job discoveries to notification manager
majhiCrawler.onNewJob((job) => {
  notificationManager.pushAlert({
    title: job.title,
    organization: job.organization,
    vacancies: job.vacancies + ' Posts',
    qualification: job.qualifications.join(', '),
    source: 'Majhi Naukri',
    link: job.link,
    urgency: 'High',
    type: 'live_recruitment'
  });
});

// Periodic background scanner for Majhi Naukri (every 3 minutes)
setInterval(() => {
  console.log('[BackgroundPoller] Running scheduled check on majhinaukri.in...');
  majhiCrawler.crawlAll().catch(err => {
    console.error('[BackgroundPoller] Error in periodic crawl:', err.message);
  });
}, 3 * 60 * 1000);

// Helper to parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Calculate match score between a job and a qualification key
function calculateRelevanceScore(job, eduKey, searchKeyword) {
  let score = 50; // base score

  const text = `${job.title} ${job.description} ${(job.categories || []).join(' ')} ${(job.qualifications || []).join(' ')}`.toLowerCase();

  const eduAliases = {
    '10th-pass': ['10th', 'ssc', 'matric', '10 वी', 'matriculation', 'group d'],
    '12th-pass': ['12th', 'hsc', 'intermediate', '12 वी', 'higher secondary', 'chsl'],
    'iti': ['iti', 'fitter', 'welder', 'electrician', 'apprentice', 'trade', 'technician'],
    'diploma': ['diploma', 'polytechnic', 'junior engineer', 'je', 'draftsman'],
    'be-b-tech': ['be/b.tech', 'be', 'b.tech', 'btech', 'engineering', 'engineer', 'sde', 'developer'],
    'graduate': ['graduate', 'degree', 'any degree', 'b.sc', 'b.com', 'ba', 'bca', 'bba', 'po', 'officer', 'clerk'],
    'post-graduate': ['post graduate', 'm.tech', 'm.sc', 'mca', 'mba', 'm.com', 'ma', 'master', 'scientist']
  };

  const targetKeywords = eduAliases[eduKey] || [];
  for (const kw of targetKeywords) {
    if ((job.qualifications || []).some(q => q.toLowerCase().includes(kw))) score += 25;
    if ((job.categories || []).some(c => c.toLowerCase().includes(kw))) score += 20;
    if (job.title.toLowerCase().includes(kw)) score += 15;
    if (text.includes(kw)) score += 5;
  }

  if (searchKeyword) {
    const words = searchKeyword.toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (job.title.toLowerCase().includes(w)) score += 30;
      if (job.organization.toLowerCase().includes(w)) score += 25;
      if (text.includes(w)) score += 10;
    }
  }

  return score;
}

// Security & Rate Limiting state
let lastScanTimestamp = 0;
const SCAN_COOLDOWN_MS = 30 * 1000; // 30s cooldown between external crawl sweeps
const ipRateLimits = new Map(); // ip -> { hits, resetTime }

function checkIpRateLimit(ip, maxHits = 10, windowMs = 60 * 1000) {
  const now = Date.now();
  let record = ipRateLimits.get(ip);
  if (!record || now > record.resetTime) {
    record = { hits: 1, resetTime: now + windowMs };
    ipRateLimits.set(ip, record);
    return true;
  }
  if (record.hits >= maxHits) {
    return false;
  }
  record.hits++;
  return true;
}

const server = http.createServer(async (req, res) => {
  // Use WHATWG URL API instead of deprecated url.parse
  const host = req.headers.host || 'localhost';
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const clientIp = req.socket.remoteAddress || '127.0.0.1';

  // Defensive HTTP Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data: https:;");

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // --- API: SSE Alerts Stream ---
  if (pathname === '/api/stream-alerts') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    notificationManager.addClient(res);

    // Keep-alive heartbeat every 20 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      notificationManager.removeClient(res);
    });
    return;
  }

  // --- API: Get Jobs ---
  if (pathname === '/api/jobs' && method === 'GET') {
    const eduQuery = parsedUrl.searchParams.get('education') || 'all';
    const sourceQuery = parsedUrl.searchParams.get('source') || 'all';
    const searchQuery = (parsedUrl.searchParams.get('search') || '').trim().toLowerCase();
    const roleQuery = (parsedUrl.searchParams.get('role') || '').trim().toLowerCase();

    const eduKey = roleRecommender.normalizeQualification(eduQuery);

    const majhiJobs = majhiCrawler.getAllJobs();
    const naukriJobs = naukriService.getAllJobs();

    let combined = [];

    if (sourceQuery === 'all' || sourceQuery === 'majhi-naukri') {
      combined.push(...majhiJobs);
    }
    if (sourceQuery === 'all' || sourceQuery === 'naukri') {
      combined.push(...naukriJobs);
    }

    // Filter and score
    let filtered = combined.map(job => {
      const matchScore = calculateRelevanceScore(job, eduKey, searchQuery || roleQuery);
      return { ...job, matchScore };
    });

    // If educational filter is specified (and not 'all')
    if (eduQuery && eduQuery !== 'all') {
      filtered = filtered.filter(job => {
        // High confidence match or category/qualification tag includes it
        const hasTag = (job.qualifications || []).some(q => {
          const normQ = roleRecommender.normalizeQualification(q);
          return normQ === eduKey;
        });
        const hasCategory = (job.categories || []).some(c => {
          const normC = roleRecommender.normalizeQualification(c);
          return normC === eduKey;
        });
        return hasTag || hasCategory || job.matchScore >= 65;
      });
    }

    // If search text or role specified
    if (searchQuery || roleQuery) {
      const term = (searchQuery + ' ' + roleQuery).trim().toLowerCase();
      filtered = filtered.filter(job => {
        const fullContent = `${job.title} ${job.organization} ${job.description} ${(job.categories || []).join(' ')} ${(job.qualifications || []).join(' ')}`.toLowerCase();
        return fullContent.includes(searchQuery) || fullContent.includes(roleQuery) || job.matchScore > 80;
      });
    }

    // Sort by match score then pubDate
    filtered.sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      total: filtered.length,
      educationRequested: eduQuery,
      normalizedKey: eduKey,
      jobs: filtered
    }));
  }

  // --- API: Career Role Recommendations ---
  if (pathname === '/api/recommend-roles' && method === 'POST') {
    const body = await parseJsonBody(req);
    const recommendation = roleRecommender.getRoleRecommendations(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(recommendation));
  }

  // --- API: Trigger Live Crawl / Refresh (Rate Limited) ---
  if (pathname === '/api/trigger-scan' && method === 'POST') {
    const now = Date.now();
    if (now - lastScanTimestamp < SCAN_COOLDOWN_MS) {
      const waitSec = Math.ceil((SCAN_COOLDOWN_MS - (now - lastScanTimestamp)) / 1000);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Scan on cooldown. Please wait ${waitSec}s.` }));
    }

    if (!checkIpRateLimit(clientIp, 5, 5 * 60 * 1000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Too many scan requests. Please wait a few minutes.' }));
    }

    lastScanTimestamp = now;
    console.log(`[API] Live scan triggered by ${clientIp}`);
    try {
      const jobs = await majhiCrawler.crawlAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Live job scan complete',
        totalCrawled: jobs.length,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      console.error('[API] Scan error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Unable to refresh live feeds. Please retry shortly.' }));
    }
  }

  // --- API: Test Instant Alert (Rate Limited) ---
  if (pathname === '/api/test-alert' && method === 'POST') {
    if (!checkIpRateLimit(clientIp, 10, 60 * 1000)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Alert rate limit reached. Please wait a moment.' }));
    }

    const body = await parseJsonBody(req);
    const targetEdu = String(body.qualification || 'BE/B.Tech').slice(0, 50);
    const alert = notificationManager.pushAlert({
      title: `⚡ NEW VACANCY ALERT: ISRO & PSU Mega Recruitment 2026 for ${targetEdu}`,
      organization: 'Satish Dhawan Space Centre (ISRO) & Navratna PSUs',
      vacancies: '150+ Fresh Vacancies',
      qualification: targetEdu,
      source: 'Majhi Naukri & Open Portal',
      link: 'https://majhinaukri.in/new-updates/',
      urgency: 'Instant Breaking Alert'
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, alert }));
  }

  // --- API: Recent Alerts ---
  if (pathname === '/api/alerts' && method === 'GET') {
    const alerts = notificationManager.getRecentAlerts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ alerts }));
  }

  // --- API: Stats & Portal Metrics ---
  if (pathname === '/api/stats' && method === 'GET') {
    const majhiCount = majhiCrawler.getAllJobs().length;
    const naukriCount = naukriService.getAllJobs().length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      majhiNaukriJobsCount: majhiCount,
      naukriJobsCount: naukriCount,
      totalActiveOpenings: majhiCount + naukriCount,
      lastCrawled: majhiCrawler.lastFetched,
      activeLiveStreamListeners: notificationManager.clients.size,
      majhiUrl: 'https://majhinaukri.in/new-updates/',
      naukriUrl: 'https://www.naukri.com/'
    }));
  }

  // --- Static Files Serving with Strict Path Resolution ---
  let raw = pathname === '/' || pathname === '' ? '/index.html' : pathname;
  let decoded = '/index.html';
  try {
    decoded = decodeURIComponent(raw);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }

  const resolvedPublicDir = path.resolve(PUBLIC_DIR);
  const safePath = path.resolve(resolvedPublicDir, '.' + decoded);

  // Strictly enforce path boundary inside PUBLIC_DIR
  if (!safePath.startsWith(resolvedPublicDir + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Access Denied: Path Traversal Detected');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallbackPath, (fbErr, fbContent) => {
        if (fbErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        res.end(fbContent);
      });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(safePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

// Initial boot crawl
console.log(`[JobFinder] Initializing server on port ${PORT}...`);
majhiCrawler.crawlAll().then(() => {
  console.log('[JobFinder] Initial Majhi Naukri crawl complete.');
}).catch(err => {
  console.warn('[JobFinder] Initial crawl warning:', err.message);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 EDU-JOB-FINDER SERVER IS RUNNING`);
  console.log(`🌐 Local URL:  http://localhost:${PORT}`);
  console.log(`🎯 Primary Sources:`);
  console.log(`   1. Majhi Naukri (https://majhinaukri.in/new-updates/)`);
  console.log(`   2. Naukri.com (https://www.naukri.com/)`);
  console.log(`⚡ Instant Vacancy Notifications & Dark Theme Active`);
  console.log(`======================================================\n`);
});
