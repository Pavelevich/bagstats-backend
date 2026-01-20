import apn from '@parse/node-apn';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class APNSService {
  constructor() {
    this.provider = null;
    this.isConfigured = false;
  }

  initialize() {
    const keyPath = process.env.APNS_KEY_PATH || path.join(__dirname, '../../certs/AuthKey.p8');
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const bundleId = process.env.APNS_BUNDLE_ID || 'xyz.bagstats.app';

    if (!keyId || !teamId) {
      console.warn('APNs not configured: Missing APNS_KEY_ID or APNS_TEAM_ID');
      return;
    }

    try {
      this.provider = new apn.Provider({
        token: {
          key: keyPath,
          keyId: keyId,
          teamId: teamId
        },
        production: process.env.NODE_ENV === 'production'
      });

      this.bundleId = bundleId;
      this.isConfigured = true;
      console.log('APNs provider initialized');
    } catch (error) {
      console.error('Failed to initialize APNs:', error.message);
    }
  }

  async sendNotification(deviceToken, { title, body, data = {} }) {
    if (!this.isConfigured || !this.provider) {
      console.warn('APNs not configured, skipping notification');
      return { success: false, error: 'APNs not configured' };
    }

    const notification = new apn.Notification();
    notification.alert = { title, body };
    notification.sound = 'default';
    notification.badge = 1;
    notification.topic = this.bundleId;
    notification.payload = data;

    try {
      const result = await this.provider.send(notification, deviceToken);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        console.error('APNs send failed:', failure.response);
        return {
          success: false,
          error: failure.response?.reason || 'Unknown error'
        };
      }

      console.log('APNs notification sent successfully');
      return { success: true };
    } catch (error) {
      console.error('APNs error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBagNotification(deviceToken, { wallet, tokenSymbol, amountSOL, amountUSD }) {
    return this.sendNotification(deviceToken, {
      title: 'New Bag Received! 💰',
      body: `+${amountSOL.toFixed(4)} SOL (~$${amountUSD.toFixed(2)}) from ${tokenSymbol}`,
      data: {
        type: 'new_bag',
        wallet,
        tokenSymbol,
        amountSOL,
        amountUSD
      }
    });
  }

  async sendDailySummary(deviceToken, { wallet, totalUnclaimed, positionsCount }) {
    return this.sendNotification(deviceToken, {
      title: 'Daily Bags Summary 📊',
      body: `You have $${totalUnclaimed.toFixed(2)} unclaimed across ${positionsCount} positions`,
      data: {
        type: 'daily_summary',
        wallet,
        totalUnclaimed,
        positionsCount
      }
    });
  }

  shutdown() {
    if (this.provider) {
      this.provider.shutdown();
    }
  }
}

export const apnsService = new APNSService();
export default apnsService;
