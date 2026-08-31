/**
 * lib.mjs — AI Daily Briefing 共享工具库
 *
 * 提供：路径解析、文件读写、.env 加载、HTML 转义/转文本、配置加载、运行日志。
 * 所有相对路径均以「项目根目录」为基准解析（本文件位于 scripts/ 下）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 项目根目录：lib.mjs 所在目录的上一级 */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 把相对路径解析为项目根的绝对路径（绝对路径原样返回） */
export function resolvePath(rel) {
  return path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
}

/** 读取文本文件（相对项目根），不存在则抛错 */
export function readFile(rel) {
  return fs.readFileSync(resolvePath(rel), 'utf8');
}

/** 读取 JSON 文件（相对项目根） */
export function readJSON(rel) {
  return JSON.parse(readFile(rel));
}

/** 安全写文件：自动创建父目录，返回绝对路径 */
export function writeFileSafe(rel, content) {
  const abs = resolvePath(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

/** 复制文件：自动创建目标父目录 */
export function copyFileSafe(srcRel, destRel) {
  const abs = resolvePath(destRel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.copyFileSync(resolvePath(srcRel), abs);
  return abs;
}

/** HTML 转义（& < > " '） */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 YYYY-MM-DD 格式化为本地化日期行，如「2026年8月30日 星期日」 */
export function formatDateLine(date, tz = 'Asia/Shanghai') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  if (!m) return String(date || '');
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
      weekday: 'long', timeZone: tz
    }).format(dt);
  } catch {
    return `${m[1]}年${+m[2]}月${+m[3]}日`;
  }
}

/** Windows 兼容：把绝对路径转成 file:// URL 供 ESM import 使用 */
function toFileUrl(absPath) {
  return pathToFileURL(absPath).href;
}

/** 加载 config/settings.js（ESM 动态 import，缓存） */
let _settings = null;
export async function loadSettings() {
  if (_settings) return _settings;
  const mod = await import(toFileUrl(resolvePath('config/settings.js')));
  _settings = mod.default ?? mod.settings ?? {};
  return _settings;
}

/** 加载 config/categories.js（ESM 动态 import，缓存） */
let _categories = null;
export async function loadCategories() {
  if (_categories) return _categories;
  const mod = await import(toFileUrl(resolvePath('config/categories.js')));
  _categories = mod.default ?? mod.categories ?? [];
  return _categories;
}

/** 把 .env 解析进 process.env（已存在的变量不覆盖；无 .env 文件时静默跳过） */
export function loadEnv() {
  const envPath = resolvePath('.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

/** HTML → 纯文本（去标签/脚本/样式，实体反转义，保留换行） */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 写运行日志：logs/last_run.json（覆盖）并追加 logs/run_history.jsonl */
export function writeRunLog(entry) {
  const stamp = new Date().toISOString();
  const record = { ts: stamp, ...entry };
  writeFileSafe('logs/last_run.json', JSON.stringify(record, null, 2));
  try {
    fs.appendFileSync(resolvePath('logs/run_history.jsonl'), JSON.stringify(record) + '\n', 'utf8');
  } catch { /* 历史日志失败不影响主流程 */ }
}

export default {
  PROJECT_ROOT, resolvePath, readFile, readJSON, writeFileSafe, copyFileSafe,
  escapeHtml, formatDateLine, loadSettings, loadCategories, loadEnv, htmlToText, writeRunLog
};
