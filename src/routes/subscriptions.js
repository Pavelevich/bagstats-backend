import express from 'express';
import { subscriptions, snapshots } from '../services/database.js';
import { bagMonitor } from '../services/bagMonitor.js';

const router = express.Router();

// Subscribe to wallet notifications
router.post('/', (req, res) => {
  try {
    const { deviceToken, wallet, platform = 'ios' } = req.body;

    if (!deviceToken || !wallet) {
      return res.status(400).json({
        success: false,
        error: 'deviceToken and wallet are required'
      });
    }

    // Validate wallet address (basic Solana address check)
    if (wallet.length < 32 || wallet.length > 44) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address'
      });
    }

    subscriptions.create.run(deviceToken, wallet, platform);

    // Create initial snapshot
    bagMonitor.checkWallet(wallet);

    res.status(201).json({
      success: true,
      message: 'Subscribed to wallet notifications'
    });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create subscription'
    });
  }
});

// Get subscriptions for a device
router.get('/', (req, res) => {
  try {
    const deviceToken = req.headers['x-device-token'];

    if (!deviceToken) {
      return res.status(400).json({
        success: false,
        error: 'X-Device-Token header required'
      });
    }

    const subs = subscriptions.getByDevice.all(deviceToken);

    res.json({
      success: true,
      subscriptions: subs.map(s => ({
        wallet: s.wallet,
        platform: s.platform,
        createdAt: s.created_at
      }))
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscriptions'
    });
  }
});

// Unsubscribe from wallet
router.delete('/:wallet', (req, res) => {
  try {
    const { wallet } = req.params;
    const deviceToken = req.headers['x-device-token'];

    if (!deviceToken) {
      return res.status(400).json({
        success: false,
        error: 'X-Device-Token header required'
      });
    }

    const result = subscriptions.delete.run(deviceToken, wallet);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    res.json({
      success: true,
      message: 'Unsubscribed from wallet'
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe'
    });
  }
});

// Get wallet stats (for debugging)
router.get('/:wallet/stats', (req, res) => {
  try {
    const { wallet } = req.params;

    const latestSnapshot = snapshots.getLatest.get(wallet);
    const recentSnapshots = snapshots.getRecent.all(wallet);

    res.json({
      success: true,
      wallet,
      latest: latestSnapshot,
      history: recentSnapshots
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats'
    });
  }
});

export default router;
