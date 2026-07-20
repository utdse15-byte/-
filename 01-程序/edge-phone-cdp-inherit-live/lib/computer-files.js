'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Windows 上"隐藏"靠文件属性而非点前缀。不读取属性（避免逐项额外系统调用），
// 但至少把众所周知的系统条目挡在手机文件选择器之外（showHidden 时仍显示）。
const WINDOWS_SYSTEM_ENTRIES = new Set([
  '$recycle.bin', 'system volume information', '$winreagent', '$windows.~bt', '$windows.~ws',
  'pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'dumpstack.log.tmp', 'desktop.ini', 'thumbs.db'
]);

function expandEnvironmentPath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^~(?=$|[\\/])/, os.homedir());
  text = text.replace(/%([^%]+)%/g, (_, name) => process.env[name] || process.env[name.toUpperCase()] || `%${name}%`);
  return path.resolve(text);
}

function canonical(value) {
  const resolved = path.resolve(String(value || ''));
  const parsed = path.parse(resolved);
  const trimmed = resolved === parsed.root ? parsed.root : resolved.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function pathLabel(value) {
  const normalized = path.resolve(value);
  const home = path.resolve(os.homedir());
  const common = [
    ['桌面', path.join(home, 'Desktop')],
    ['下载', path.join(home, 'Downloads')],
    ['文档', path.join(home, 'Documents')],
    ['图片', path.join(home, 'Pictures')],
    ['视频', path.join(home, 'Videos')],
    ['音乐', path.join(home, 'Music')]
  ];
  const found = common.find(([, item]) => canonical(item) === canonical(normalized));
  if (found) return found[0];
  if (canonical(normalized) === canonical(home)) return '用户目录';
  const parsed = path.parse(normalized);
  if (canonical(normalized) === canonical(parsed.root)) {
    return process.platform === 'win32' ? `${parsed.root.replace(/[\\/]+$/, '')} 磁盘` : parsed.root;
  }
  return path.basename(normalized) || normalized;
}

function discoverDefaultRoots() {
  const candidates = [];
  const home = os.homedir();
  for (const item of ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Videos', 'Music']) {
    candidates.push(path.join(home, item));
  }
  candidates.push(home);

  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code += 1) {
      candidates.push(`${String.fromCharCode(code)}:\\`);
    }
  } else {
    candidates.push(path.parse(home).root || '/');
  }
  return candidates;
}


function normalizeSort(value) {
  const allowed = new Set(['modified-desc', 'modified-asc', 'name-asc', 'name-desc', 'size-desc', 'size-asc']);
  const candidate = String(value || '').trim().toLowerCase();
  return allowed.has(candidate) ? candidate : 'modified-desc';
}

function compareNames(a, b) {
  return String(a?.name || '').localeCompare(String(b?.name || ''), 'zh-CN', { numeric: true, sensitivity: 'base' });
}

function compareEntries(a, b, sort) {
  let difference = 0;
  switch (normalizeSort(sort)) {
    case 'modified-asc':
      difference = (Number(a.modifiedAt) || 0) - (Number(b.modifiedAt) || 0);
      break;
    case 'name-desc':
      difference = -compareNames(a, b);
      break;
    case 'name-asc':
      difference = compareNames(a, b);
      break;
    case 'size-asc':
      difference = (Number(a.size) || 0) - (Number(b.size) || 0);
      break;
    case 'size-desc':
      difference = (Number(b.size) || 0) - (Number(a.size) || 0);
      break;
    case 'modified-desc':
    default:
      difference = (Number(b.modifiedAt) || 0) - (Number(a.modifiedAt) || 0);
      break;
  }
  if (difference !== 0) return difference;
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
  return compareNames(a, b);
}

class ComputerFileService {
  constructor(options = {}) {
    this.showHidden = Boolean(options.showHidden);
    this.maxEntries = Math.max(50, Math.min(5000, Number(options.maxEntries) || 1000));
    this.defaultSort = normalizeSort(options.defaultSort || 'modified-desc');
    const configured = Array.isArray(options.roots) ? options.roots.map(expandEnvironmentPath).filter(Boolean) : [];
    const candidates = configured.length ? configured : discoverDefaultRoots();
    const seen = new Set();
    this.roots = [];

    for (const candidate of candidates) {
      try {
        if (!candidate || !fs.existsSync(candidate)) continue;
        const stat = fs.statSync(candidate);
        if (!stat.isDirectory()) continue;
        const real = fs.realpathSync.native ? fs.realpathSync.native(candidate) : fs.realpathSync(candidate);
        const key = canonical(real);
        if (seen.has(key)) continue;
        seen.add(key);
        this.roots.push({
          label: pathLabel(candidate),
          path: path.resolve(candidate),
          realPath: path.resolve(real)
        });
      } catch {}
    }

    if (!this.roots.length) {
      const fallback = path.resolve(os.homedir());
      this.roots.push({ label: '用户目录', path: fallback, realPath: fallback });
    }
  }

  listRoots() {
    return this.roots.map(({ label, path: rootPath }) => ({ label, path: rootPath }));
  }

  resolveAllowed(rawPath, expectedType = 'any') {
    const value = String(rawPath || '').trim();
    if (!value || value.includes('\0')) throw new Error('电脑文件路径无效。');
    if (!path.isAbsolute(value)) throw new Error('电脑文件路径必须是绝对路径。');

    const requested = path.resolve(value);
    let real;
    try {
      real = fs.realpathSync.native ? fs.realpathSync.native(requested) : fs.realpathSync(requested);
    } catch {
      throw new Error('电脑文件或文件夹不存在，可能已被移动或删除。');
    }
    const resolved = path.resolve(real);
    const root = this.roots
      .filter((item) => isWithin(canonical(resolved), canonical(item.realPath)))
      .sort((a, b) => canonical(a.realPath).length - canonical(b.realPath).length)[0];
    if (!root) throw new Error('该路径不在允许浏览的电脑位置中。');

    let stat;
    try { stat = fs.statSync(resolved); } catch { throw new Error('无法读取该电脑文件或文件夹。'); }
    if (expectedType === 'file' && !stat.isFile()) throw new Error('请选择电脑上的文件。');
    if (expectedType === 'directory' && !stat.isDirectory()) throw new Error('请选择电脑上的文件夹。');
    return { requested, resolved, stat, root };
  }

  listDirectory(rawPath, options = {}) {
    const selected = this.resolveAllowed(rawPath, 'directory');
    let dirents;
    try { dirents = fs.readdirSync(selected.resolved, { withFileTypes: true }); }
    catch { throw new Error('没有权限读取这个文件夹。'); }

    const entries = [];
    for (const dirent of dirents) {
      if (!this.showHidden && dirent.name.startsWith('.')) continue;
      if (!this.showHidden && WINDOWS_SYSTEM_ENTRIES.has(dirent.name.toLowerCase())) continue;
      const candidate = path.join(selected.resolved, dirent.name);
      try {
        const child = this.resolveAllowed(candidate, 'any');
        if (!child.stat.isDirectory() && !child.stat.isFile()) continue;
        entries.push({
          name: dirent.name,
          path: child.resolved,
          kind: child.stat.isDirectory() ? 'directory' : 'file',
          size: child.stat.isFile() ? child.stat.size : 0,
          modifiedAt: Number(child.stat.mtimeMs) || 0
        });
      } catch {}
    }

    const sort = normalizeSort(options.sort || this.defaultSort);
    entries.sort((a, b) => compareEntries(a, b, sort));

    const rootCanonical = canonical(selected.root.realPath);
    const currentCanonical = canonical(selected.resolved);
    const parentCandidate = path.dirname(selected.resolved);
    const parentPath = currentCanonical === rootCanonical || !isWithin(canonical(parentCandidate), rootCanonical)
      ? null
      : parentCandidate;

    return {
      path: selected.resolved,
      displayPath: selected.resolved,
      parentPath,
      root: { label: selected.root.label, path: selected.root.path },
      entries: entries.slice(0, this.maxEntries),
      totalEntries: entries.length,
      truncated: entries.length > this.maxEntries,
      sort
    };
  }

  validateSelection(rawPaths, options = {}) {
    const paths = Array.isArray(rawPaths) ? rawPaths : [];
    const maxFiles = Math.max(1, Math.min(5000, Number(options.maxFiles) || 256));
    const directoryMode = Boolean(options.directory);
    const multiple = Boolean(options.multiple);
    if (!paths.length) throw new Error(directoryMode ? '请选择一个电脑文件夹。' : '请选择电脑上的文件。');
    if (paths.length > maxFiles) throw new Error(`一次最多选择 ${maxFiles} 个电脑文件。`);
    if (!multiple && !directoryMode && paths.length > 1) throw new Error('该网页上传框只允许选择一个文件。');
    if (directoryMode && paths.length > 1) throw new Error('该网页上传框一次只接受一个文件夹。');

    const seen = new Set();
    const files = [];
    for (const rawPath of paths) {
      const item = this.resolveAllowed(rawPath, directoryMode ? 'directory' : 'file');
      const key = canonical(item.resolved);
      if (seen.has(key)) continue;
      seen.add(key);
      files.push({
        path: item.resolved,
        name: path.basename(item.resolved) || item.resolved,
        size: item.stat.isFile() ? item.stat.size : 0,
        kind: item.stat.isDirectory() ? 'directory' : 'file'
      });
    }
    if (!files.length) throw new Error('没有可用的电脑文件。');
    return files;
  }
}

module.exports = {
  ComputerFileService,
  canonical,
  isWithin,
  expandEnvironmentPath,
  discoverDefaultRoots,
  normalizeSort,
  compareEntries
};
