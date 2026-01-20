import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/bagstats.db');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_token TEXT NOT NULL,
    wallet TEXT NOT NULL,
    platform TEXT DEFAULT 'ios',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(device_token, wallet)
  );

  CREATE TABLE IF NOT EXISTS notification_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    type TEXT NOT NULL,
    payload TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallet_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet TEXT NOT NULL,
    total_unclaimed_lamports INTEGER,
    positions_count INTEGER,
    snapshot_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_subscriptions_wallet ON subscriptions(wallet);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_device ON subscriptions(device_token);
  CREATE INDEX IF NOT EXISTS idx_snapshots_wallet ON wallet_snapshots(wallet);
`);

// Subscription queries
export const subscriptions = {
  create: db.prepare(`
    INSERT OR REPLACE INTO subscriptions (device_token, wallet, platform)
    VALUES (?, ?, ?)
  `),

  delete: db.prepare(`
    DELETE FROM subscriptions WHERE device_token = ? AND wallet = ?
  `),

  getByDevice: db.prepare(`
    SELECT * FROM subscriptions WHERE device_token = ?
  `),

  getByWallet: db.prepare(`
    SELECT * FROM subscriptions WHERE wallet = ?
  `),

  getAll: db.prepare(`
    SELECT DISTINCT wallet FROM subscriptions
  `),

  getAllWithTokens: db.prepare(`
    SELECT * FROM subscriptions
  `)
};

// Snapshot queries
export const snapshots = {
  create: db.prepare(`
    INSERT INTO wallet_snapshots (wallet, total_unclaimed_lamports, positions_count)
    VALUES (?, ?, ?)
  `),

  getLatest: db.prepare(`
    SELECT * FROM wallet_snapshots
    WHERE wallet = ?
    ORDER BY snapshot_at DESC
    LIMIT 1
  `),

  getRecent: db.prepare(`
    SELECT * FROM wallet_snapshots
    WHERE wallet = ?
    ORDER BY snapshot_at DESC
    LIMIT 10
  `)
};

// Notification history queries
export const notificationHistory = {
  create: db.prepare(`
    INSERT INTO notification_history (wallet, type, payload)
    VALUES (?, ?, ?)
  `),

  getRecent: db.prepare(`
    SELECT * FROM notification_history
    WHERE wallet = ?
    ORDER BY sent_at DESC
    LIMIT 50
  `)
};

export default db;
