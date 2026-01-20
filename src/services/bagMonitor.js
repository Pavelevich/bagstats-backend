import { subscriptions, snapshots, notificationHistory } from './database.js';
import { apnsService } from './apns.js';

const BAGS_API_URL = 'https://public-api-v2.bags.fm/api/v1';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

class BagMonitor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.solPrice = 0;
  }

  async fetchSOLPrice() {
    try {
      const response = await fetch(COINGECKO_URL);
      const data = await response.json();
      this.solPrice = data.solana?.usd || 0;
    } catch (error) {
      console.error('Failed to fetch SOL price:', error.message);
    }
  }

  async fetchClaimablePositions(wallet) {
    try {
      const response = await fetch(
        `${BAGS_API_URL}/token-launch/claimable-positions?wallet=${wallet}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.BAGS_API_KEY || ''
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'API returned error');
      }

      return data.response || [];
    } catch (error) {
      console.error(`Failed to fetch positions for ${wallet}:`, error.message);
      return null;
    }
  }

  calculateTotalUnclaimed(positions) {
    return positions.reduce((total, pos) => {
      return total + (pos.totalClaimableLamportsUserShare || 0);
    }, 0);
  }

  async checkWallet(wallet) {
    const positions = await this.fetchClaimablePositions(wallet);
    if (!positions) return;

    const currentUnclaimed = this.calculateTotalUnclaimed(positions);
    const previousSnapshot = snapshots.getLatest.get(wallet);

    // Save current snapshot
    snapshots.create.run(wallet, currentUnclaimed, positions.length);

    // If we have a previous snapshot, check for changes
    if (previousSnapshot) {
      const previousUnclaimed = previousSnapshot.total_unclaimed_lamports || 0;

      // New bags detected (unclaimed increased)
      if (currentUnclaimed > previousUnclaimed) {
        const diffLamports = currentUnclaimed - previousUnclaimed;
        const diffSOL = diffLamports / 1_000_000_000;
        const diffUSD = diffSOL * this.solPrice;

        console.log(`New bag detected for ${wallet}: +${diffSOL.toFixed(4)} SOL (~$${diffUSD.toFixed(2)})`);

        // Get all subscriptions for this wallet
        const subs = subscriptions.getByWallet.all(wallet);

        for (const sub of subs) {
          // Send notification
          const result = await apnsService.sendBagNotification(sub.device_token, {
            wallet,
            tokenSymbol: 'Bags', // Could be improved to get actual token
            amountSOL: diffSOL,
            amountUSD: diffUSD
          });

          // Log notification
          notificationHistory.create.run(
            wallet,
            'new_bag',
            JSON.stringify({
              device_token: sub.device_token,
              amount_sol: diffSOL,
              amount_usd: diffUSD,
              success: result.success
            })
          );
        }
      }
    }
  }

  async checkAllWallets() {
    await this.fetchSOLPrice();

    const wallets = subscriptions.getAll.all();
    console.log(`Checking ${wallets.length} wallets for new bags...`);

    for (const { wallet } of wallets) {
      await this.checkWallet(wallet);
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  start(intervalMinutes = 5) {
    if (this.isRunning) {
      console.log('Bag monitor already running');
      return;
    }

    console.log(`Starting bag monitor (checking every ${intervalMinutes} minutes)`);
    this.isRunning = true;

    // Initial check
    this.checkAllWallets();

    // Set up interval
    this.intervalId = setInterval(
      () => this.checkAllWallets(),
      intervalMinutes * 60 * 1000
    );
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Bag monitor stopped');
  }
}

export const bagMonitor = new BagMonitor();
export default bagMonitor;
