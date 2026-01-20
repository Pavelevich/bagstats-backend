import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import new services and routes
import subscriptionsRouter from './routes/subscriptions.js';
import { apnsService } from './services/apns.js';
import { bagMonitor } from './services/bagMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Simple in-memory cache for wallet stats (5 minute TTL)
const walletStatsCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedStats(address) {
  const cached = walletStatsCache.get(address);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedStats(address, data) {
  walletStatsCache.set(address, { data, timestamp: Date.now() });
}

// Middleware
app.use(cors());
app.use(express.json());

// Load a font for satori (using system font as fallback)
const fontPath = '/System/Library/Fonts/Supplemental/Arial.ttf';
let fontData;
try {
  fontData = fs.readFileSync(fontPath);
} catch (e) {
  // Fallback - try another common font
  try {
    fontData = fs.readFileSync('/System/Library/Fonts/Helvetica.ttc');
  } catch (e2) {
    console.log('Warning: Could not load system font, using default');
  }
}

/**
 * Generate share card JSX structure for satori
 */
function generateCardJSX(total, unclaimed, claimed, tokens, positions) {
  return {
    type: 'div',
    props: {
      style: {
        width: '600px',
        height: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #16213e 100%)',
      },
      children: {
        type: 'div',
        props: {
          style: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '30px',
          },
          children: [
            // Header
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '24px',
                },
                children: [
                  // Logo
                  {
                    type: 'div',
                    props: {
                      style: {
                        width: '48px',
                        height: '48px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: 'white',
                      },
                      children: 'B',
                    },
                  },
                  // Brand
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        flexDirection: 'column',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '24px',
                              fontWeight: 700,
                              color: '#667eea',
                            },
                            children: 'BagStats',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '12px',
                              color: 'rgba(255, 255, 255, 0.5)',
                            },
                            children: 'Track your Bags.fm earnings',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Stats Grid
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  flex: 1,
                },
                children: [
                  // Total Claimable (highlight)
                  {
                    type: 'div',
                    props: {
                      style: {
                        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%)',
                        border: '1px solid rgba(102, 126, 234, 0.3)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                      },
                      children: [
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '11px',
                              textTransform: 'uppercase',
                              letterSpacing: '1px',
                              color: 'rgba(255, 255, 255, 0.5)',
                              marginBottom: '4px',
                            },
                            children: 'TOTAL CLAIMABLE',
                          },
                        },
                        {
                          type: 'div',
                          props: {
                            style: {
                              fontSize: '36px',
                              fontWeight: 700,
                              color: '#667eea',
                            },
                            children: total,
                          },
                        },
                      ],
                    },
                  },
                  // Bottom row
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        gap: '12px',
                      },
                      children: [
                        // Unclaimed
                        {
                          type: 'div',
                          props: {
                            style: {
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '16px',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                            },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '11px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '4px',
                                  },
                                  children: 'UNCLAIMED FEES',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    color: '#10b981',
                                  },
                                  children: unclaimed,
                                },
                              },
                            ],
                          },
                        },
                        // Claimed
                        {
                          type: 'div',
                          props: {
                            style: {
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '16px',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                            },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '11px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '4px',
                                  },
                                  children: 'ALREADY CLAIMED',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    color: 'white',
                                  },
                                  children: claimed,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  // Tokens and Positions row
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        gap: '12px',
                      },
                      children: [
                        // Tokens
                        {
                          type: 'div',
                          props: {
                            style: {
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '16px',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                            },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '11px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '4px',
                                  },
                                  children: 'TOKENS',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    color: 'white',
                                  },
                                  children: tokens,
                                },
                              },
                            ],
                          },
                        },
                        // Positions
                        {
                          type: 'div',
                          props: {
                            style: {
                              flex: 1,
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '16px',
                              padding: '16px',
                              display: 'flex',
                              flexDirection: 'column',
                            },
                            children: [
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '11px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '4px',
                                  },
                                  children: 'POSITIONS',
                                },
                              },
                              {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '24px',
                                    fontWeight: 700,
                                    color: 'white',
                                  },
                                  children: positions,
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            // Footer
            {
              type: 'div',
              props: {
                style: {
                  marginTop: '16px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: 'rgba(255, 255, 255, 0.4)',
                  display: 'flex',
                  justifyContent: 'center',
                },
                children: 'Track your earnings at bagstats.xyz',
              },
            },
          ],
        },
      },
    },
  };
}

/**
 * GET /api/share-image
 * Generate a share card image with wallet stats
 */
app.get('/api/share-image', async (req, res) => {
  try {
    const {
      total = '$0.00',
      unclaimed = '$0.00',
      claimed = '$0.00',
      tokens = '0',
      positions = '0'
    } = req.query;

    // Generate SVG using satori
    const svg = await satori(
      generateCardJSX(total, unclaimed, claimed, tokens, positions),
      {
        width: 600,
        height: 400,
        fonts: fontData ? [
          {
            name: 'Arial',
            data: fontData,
            weight: 400,
            style: 'normal',
          },
        ] : [],
      }
    );

    // Convert SVG to PNG using resvg
    const resvg = new Resvg(svg, {
      background: 'rgba(0, 0, 0, 0)',
      fitTo: {
        mode: 'width',
        value: 600,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Send image
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pngBuffer.length,
      'Cache-Control': 'no-cache'
    });
    res.send(pngBuffer);

  } catch (error) {
    console.error('Share image error:', error);
    res.status(500).json({ error: 'Failed to generate image', details: error.message });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/wallet/:address/stats
 * Proxy to Bags.fm API - returns wallet stats with claimed + unclaimed
 */
app.get('/api/wallet/:address/stats', async (req, res) => {
  try {
    const { address } = req.params;

    // Check cache first
    const cached = getCachedStats(address);
    if (cached) {
      console.log(`📦 Cache hit for ${address}`);
      return res.json(cached);
    }

    console.log(`🔄 Fetching fresh data for ${address}`);
    const BAGS_API_KEY = process.env.BAGS_API_KEY;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(BAGS_API_KEY && { 'x-api-key': BAGS_API_KEY })
    };

    // 1. Fetch claimable positions from Bags.fm
    const positionsRes = await fetch(
      `https://public-api-v2.bags.fm/api/v1/token-launch/claimable-positions?wallet=${address}`,
      { headers }
    );

    if (!positionsRes.ok) {
      throw new Error(`Bags API error: ${positionsRes.status}`);
    }

    const positionsData = await positionsRes.json();
    const positions = positionsData.response || positionsData || [];

    // 2. Fetch SOL price
    const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const priceData = await priceRes.json();
    const solPrice = priceData.solana?.usd || 200;

    // 3. Get unique token mints
    const uniqueMints = [...new Set(positions.map(p => p.baseMint))];

    // 4. Calculate unclaimed fees
    let totalUnclaimedLamports = 0;
    for (const position of positions) {
      totalUnclaimedLamports += position.totalClaimableLamportsUserShare || 0;
    }

    // 5. Fetch claimed amounts for each token
    let totalClaimedLamports = 0;
    const claimedPerToken = {};
    for (const mint of uniqueMints) {
      try {
        const claimStatsRes = await fetch(
          `https://public-api-v2.bags.fm/api/v1/token-launch/claim-stats?tokenMint=${mint}`,
          { headers }
        );
        if (claimStatsRes.ok) {
          const claimStatsData = await claimStatsRes.json();
          const stats = claimStatsData.response || claimStatsData || [];
          if (Array.isArray(stats)) {
            const userStats = stats.find(s => s.wallet === address);
            if (userStats) {
              const claimed = parseInt(userStats.totalClaimed) || 0;
              totalClaimedLamports += claimed;
              claimedPerToken[mint] = claimed;
            }
          }
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.log(`Failed to get claim stats for ${mint}:`, e.message);
      }
    }

    // 6. Group by token and get metadata
    const tokenMap = new Map();
    for (const pos of positions) {
      const existing = tokenMap.get(pos.baseMint);
      const claimable = pos.totalClaimableLamportsUserShare || 0;
      if (existing) {
        existing.unclaimedLamports += claimable;
        existing.positionCount += 1;
      } else {
        tokenMap.set(pos.baseMint, {
          mint: pos.baseMint,
          unclaimedLamports: claimable,
          claimedLamports: 0,
          positionCount: 1,
          name: null,
          symbol: null,
          logoURI: null
        });
      }
    }

    // Add claimed amounts to token map
    for (const [mint, claimed] of Object.entries(claimedPerToken || {})) {
      if (tokenMap.has(mint)) {
        tokenMap.get(mint).claimedLamports = claimed;
      }
    }

    // 7. Fetch token metadata from Jupiter (batch)
    const mintsToFetch = uniqueMints.slice(0, 30); // Limit for performance
    for (const mint of mintsToFetch) {
      try {
        const metaRes = await fetch(`https://api.jup.ag/tokens/v1/${mint}`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (tokenMap.has(mint)) {
            const token = tokenMap.get(mint);
            token.name = meta.name || null;
            token.symbol = meta.symbol || null;
            token.logoURI = meta.logoURI || null;
          }
        }
      } catch (e) {
        // Ignore metadata errors
      }
    }

    // 8. Build tokens array with USD values
    const tokens = Array.from(tokenMap.values()).map(t => {
      const unclaimedSOL = t.unclaimedLamports / 1_000_000_000;
      const claimedSOL = t.claimedLamports / 1_000_000_000;
      return {
        mint: t.mint,
        name: t.name || t.mint.slice(0, 6) + '...',
        symbol: t.symbol || t.mint.slice(0, 4).toUpperCase(),
        logoURI: t.logoURI,
        unclaimed: unclaimedSOL * solPrice,
        claimed: claimedSOL * solPrice,
        total: (unclaimedSOL + claimedSOL) * solPrice,
        positionCount: t.positionCount
      };
    }).sort((a, b) => b.total - a.total);

    // 9. Calculate totals
    const unclaimedSOL = totalUnclaimedLamports / 1_000_000_000;
    const claimedSOL = totalClaimedLamports / 1_000_000_000;
    const unclaimedUSD = unclaimedSOL * solPrice;
    const claimedUSD = claimedSOL * solPrice;
    const totalEarnedUSD = unclaimedUSD + claimedUSD;

    const result = {
      totalEarned: totalEarnedUSD,
      unclaimedFees: unclaimedUSD,
      claimedFees: claimedUSD,
      tokensCount: uniqueMints.length,
      positionsCount: positions.length,
      tokens: tokens
    };

    // Cache the result
    setCachedStats(address, result);
    console.log(`✅ Cached stats for ${address}`);

    res.json(result);

  } catch (error) {
    console.error('Wallet stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Subscriptions API for iOS app notifications
app.use('/api/subscriptions', subscriptionsRouter);

// Test notification endpoint (dev only)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/notifications/test', async (req, res) => {
    const { deviceToken } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: 'deviceToken required' });
    }

    const result = await apnsService.sendNotification(deviceToken, {
      title: 'Test Notification',
      body: 'If you see this, push notifications are working!',
      data: { type: 'test' }
    });

    res.json(result);
  });
}

// Demo notification endpoint - for video demos
app.post('/api/demo/notify', async (req, res) => {
  const {
    deviceToken,
    wallet = 'Demo Wallet',
    tokenSymbol = 'SOL',
    amountSOL = 0.5,
    amountUSD = 125.00
  } = req.body;

  if (!deviceToken) {
    return res.status(400).json({ error: 'deviceToken required' });
  }

  // Try to send real APNs notification
  if (apnsService.isConfigured) {
    const result = await apnsService.sendBagNotification(deviceToken, {
      wallet,
      tokenSymbol,
      amountSOL: parseFloat(amountSOL),
      amountUSD: parseFloat(amountUSD)
    });
    return res.json({ ...result, method: 'apns' });
  }

  // If APNs not configured, return demo data for local notification
  res.json({
    success: true,
    method: 'local',
    notification: {
      title: 'New Bag Received! 💰',
      body: `+${parseFloat(amountSOL).toFixed(4)} SOL (~$${parseFloat(amountUSD).toFixed(2)}) from ${tokenSymbol}`,
      data: {
        type: 'new_bag',
        wallet,
        tokenSymbol,
        amountSOL: parseFloat(amountSOL),
        amountUSD: parseFloat(amountUSD)
      }
    }
  });
});

// Get pending demo notification (for polling)
const pendingDemoNotifications = new Map();

app.post('/api/demo/queue', (req, res) => {
  const { wallet, tokenSymbol = 'BONK', amountSOL = 0.25, amountUSD = 62.50 } = req.body;

  if (!wallet) {
    return res.status(400).json({ error: 'wallet required' });
  }

  pendingDemoNotifications.set(wallet, {
    title: 'New Bag Received! 💰',
    body: `+${parseFloat(amountSOL).toFixed(4)} SOL (~$${parseFloat(amountUSD).toFixed(2)}) from ${tokenSymbol}`,
    wallet,
    tokenSymbol,
    amountSOL: parseFloat(amountSOL),
    amountUSD: parseFloat(amountUSD),
    timestamp: Date.now()
  });

  console.log(`📬 Demo notification queued for ${wallet}`);
  res.json({ success: true, message: 'Demo notification queued' });
});

app.get('/api/demo/check/:wallet', (req, res) => {
  const { wallet } = req.params;
  const notification = pendingDemoNotifications.get(wallet);

  if (notification) {
    pendingDemoNotifications.delete(wallet);
    return res.json({ pending: true, notification });
  }

  res.json({ pending: false });
});

// Initialize APNs
apnsService.initialize();

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║     BagStats API Server               ║
  ║     Running on port ${PORT}              ║
  ╚═══════════════════════════════════════╝

  Endpoints:
    GET  /api/share-image       - Generate share card PNG
    GET  /health                - Health check

  iOS Notification Endpoints:
    POST /api/subscriptions     - Subscribe to wallet notifications
    GET  /api/subscriptions     - Get subscriptions for device
    DEL  /api/subscriptions/:w  - Unsubscribe from wallet

  Example:
    /api/share-image?total=$45,517&unclaimed=$1,229&claimed=$44,287&tokens=12&positions=12
  `);

  // Start bag monitor (check every 5 minutes)
  bagMonitor.start(5);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  bagMonitor.stop();
  apnsService.shutdown();
  process.exit(0);
});
