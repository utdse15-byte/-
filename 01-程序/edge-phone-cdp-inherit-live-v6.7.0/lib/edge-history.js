'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function clampInt(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizeProfileDirectory(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate === '.' || candidate === '..') return '';
  if (path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\')) return '';
  return candidate;
}

function profileDirectoryFromLocalState(userDataDir) {
  const localState = readJsonFile(path.join(userDataDir, 'Local State'), {});
  return normalizeProfileDirectory(localState?.profile?.last_used) || 'Default';
}

function chromiumTimeToUnixMs(chromiumMicroseconds) {
  const value = Number(chromiumMicroseconds);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value / 1000 - 11644473600000));
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.copyFileSync(source, destination);
  return true;
}

class EdgeHistoryService {
  constructor(options = {}) {
    this.userDataDir = path.resolve(String(options.userDataDir || ''));
    this.configuredProfileDirectory = normalizeProfileDirectory(options.profileDirectory);
    this.maxLimit = clampInt(options.maxLimit, 20, 500, 200);
    this.busyTimeoutMs = clampInt(options.busyTimeoutMs, 100, 10000, 2500);
    this.snapshotRoot = path.resolve(String(options.snapshotRoot || path.join(os.tmpdir(), 'edge-phone-history-snapshots')));
    this.snapshotRetentionMs = clampInt(options.snapshotRetentionMinutes, 1, 1440, 30) * 60 * 1000;
  }

  resolveProfileDirectory() {
    const configured = this.configuredProfileDirectory;
    if (configured && fs.existsSync(path.join(this.userDataDir, configured))) return configured;
    const lastUsed = profileDirectoryFromLocalState(this.userDataDir);
    if (fs.existsSync(path.join(this.userDataDir, lastUsed))) return lastUsed;
    if (fs.existsSync(path.join(this.userDataDir, 'Default'))) return 'Default';
    const candidate = fs.readdirSync(this.userDataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^(Default|Profile \d+)$/.test(entry.name))
      .map((entry) => entry.name)
      .find((name) => fs.existsSync(path.join(this.userDataDir, name, 'History')));
    return candidate || lastUsed || 'Default';
  }

  historyPath() {
    const profileDirectory = this.resolveProfileDirectory();
    return {
      profileDirectory,
      filePath: path.join(this.userDataDir, profileDirectory, 'History')
    };
  }

  cleanupSnapshots() {
    try {
      if (!fs.existsSync(this.snapshotRoot)) return;
      const cutoff = Date.now() - this.snapshotRetentionMs;
      for (const entry of fs.readdirSync(this.snapshotRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(this.snapshotRoot, entry.name);
        try {
          if (fs.statSync(fullPath).mtimeMs < cutoff) fs.rmSync(fullPath, { recursive: true, force: true });
        } catch {}
      }
    } catch {}
  }

  createSnapshot(filePath) {
    fs.mkdirSync(this.snapshotRoot, { recursive: true });
    this.cleanupSnapshots();
    const directory = fs.mkdtempSync(path.join(this.snapshotRoot, 'snapshot-'));
    const destination = path.join(directory, 'History');
    try {
      copyIfExists(filePath, destination);
      // SQLite WAL 模式下最近访问记录可能仍在 -wal 中。复制同名旁车文件后，
      // 只读连接会把它们视作一个一致的数据库快照。
      copyIfExists(`${filePath}-wal`, `${destination}-wal`);
      copyIfExists(`${filePath}-shm`, `${destination}-shm`);
      return { directory, filePath: destination };
    } catch (error) {
      try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
      throw error;
    }
  }

  queryDatabase(filePath, options = {}) {
    const query = String(options.query || '').trim().slice(0, 200);
    const limit = clampInt(options.limit, 1, this.maxLimit, 80);
    const offset = clampInt(options.offset, 0, 1000000, 0);
    const fetchLimit = limit + 1;

    let DatabaseSync;
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (error) {
      throw new Error(`当前 Node.js 不支持内置 SQLite；请安装 Node.js 22.16 或更高版本：${error.message}`);
    }

    let database;
    try {
      database = new DatabaseSync(filePath, {
        readOnly: true,
        timeout: this.busyTimeoutMs,
        enableForeignKeyConstraints: false,
        readBigInts: false
      });
      database.exec(`PRAGMA query_only=ON; PRAGMA busy_timeout=${this.busyTimeoutMs};`);

      const where = [
        'v.visit_time > 0',
        'COALESCE(u.hidden, 0) = 0',
        "u.url NOT LIKE 'edge://%'",
        "u.url NOT LIKE 'chrome://%'",
        "u.url NOT LIKE 'devtools://%'",
        "u.url NOT LIKE 'chrome-extension://%'",
        "u.url NOT LIKE 'edge-extension://%'",
        "u.url <> 'about:blank'"
      ];
      const bindings = [];
      if (query) {
        const pattern = `%${escapeLike(query)}%`;
        where.push("(u.title LIKE ? ESCAPE '\\' COLLATE NOCASE OR u.url LIKE ? ESCAPE '\\' COLLATE NOCASE)");
        bindings.push(pattern, pattern);
      }

      const statement = database.prepare(`
        SELECT
          v.id AS visitId,
          u.id AS urlId,
          u.url AS url,
          COALESCE(NULLIF(u.title, ''), u.url) AS title,
          CAST((v.visit_time / 1000) - 11644473600000 AS INTEGER) AS visitTimeMs,
          COALESCE(u.visit_count, 0) AS visitCount,
          COALESCE(u.typed_count, 0) AS typedCount,
          COALESCE(v.transition, 0) AS transition
        FROM visits AS v
        INNER JOIN urls AS u ON u.id = v.url
        WHERE ${where.join('\n          AND ')}
        ORDER BY v.visit_time DESC, v.id DESC
        LIMIT ? OFFSET ?
      `);
      const rows = statement.all(...bindings, fetchLimit, offset);
      const hasMore = rows.length > limit;
      const selected = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: selected.map((row) => ({
          visitId: Number(row.visitId) || 0,
          urlId: Number(row.urlId) || 0,
          url: String(row.url || ''),
          title: String(row.title || row.url || '(无标题)'),
          visitTimeMs: Number(row.visitTimeMs) || 0,
          visitCount: Number(row.visitCount) || 0,
          typedCount: Number(row.typedCount) || 0,
          transition: Number(row.transition) || 0
        })),
        offset,
        nextOffset: offset + selected.length,
        hasMore,
        query
      };
    } finally {
      try { database?.close(); } catch {}
    }
  }

  query(options = {}) {
    if (!this.userDataDir || !fs.existsSync(this.userDataDir)) throw new Error('Edge 用户数据目录不存在');
    const { profileDirectory, filePath } = this.historyPath();
    if (!fs.existsSync(filePath)) throw new Error(`当前 Edge 配置 ${profileDirectory} 还没有 History 数据库`);

    let result;
    let source = 'live';
    let snapshot = null;
    try {
      result = this.queryDatabase(filePath, options);
    } catch (error) {
      const message = String(error?.message || error);
      if (!/locked|busy|disk i\/o|database is locked|unable to open/i.test(message)) {
        if (/no such table|malformed|not a database/i.test(message)) throw new Error(`无法读取 Edge 历史数据库：${message}`);
        throw error;
      }
      try {
        snapshot = this.createSnapshot(filePath);
        result = this.queryDatabase(snapshot.filePath, options);
        source = 'snapshot';
      } catch (snapshotError) {
        throw new Error(`Edge 历史数据库正忙，快照读取也失败：${snapshotError.message}`);
      } finally {
        if (snapshot?.directory) {
          try { fs.rmSync(snapshot.directory, { recursive: true, force: true }); } catch {}
        }
      }
    }

    const stat = fs.statSync(filePath);
    return {
      profileDirectory,
      ...result,
      source,
      databaseUpdatedAt: Math.round(stat.mtimeMs)
    };
  }
}

module.exports = {
  EdgeHistoryService,
  chromiumTimeToUnixMs,
  escapeLike,
  normalizeProfileDirectory,
  profileDirectoryFromLocalState
};
