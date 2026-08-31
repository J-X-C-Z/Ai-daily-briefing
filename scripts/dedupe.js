/**
 * dedupe.js — 合并多个采集分片 + 查重去重（reviewer Bot 的确定性前置步骤）
 *
 * 用法：
 *   node scripts/dedupe.js --date 2026-08-30
 *   node scripts/dedupe.js                          # 今天
 *
 * 读取：data/input/partials/*_{date}.json（每个采集 Bot 一个分片）
 * 产出：
 *   data/processed/merged_{date}.json         合并去重后的候选（reviewer 补 meta/summary）
 *   data/processed/dedupe_report_{date}.json  查重报告（每一条被合并/删除的原因）
 *
 * 分片格式（每个采集 Bot 负责写，见 prompts/collector.md）：
 *   {
 *     "bot": "collector-a",
 *     "date": "2026-08-30",
 *     "generated_at": "2026-08-30T06:00:00+08:00",
 *     "categories": [ { "id": "ai", "items": [ ...newsItem ] } ]
 *   }
 *
 * 查重规则：
 *   1. source.url 规范化（去 fragment / utm 参数）后完全一致 → 重复
 *   2. 标题 bigram Dice 相似度 ≥ 0.85 → 重复
 *   3. 重复取舍：importance 高者胜 → 同分取 published_at 新者 → 再同取先出现者
 *   4. 跨栏目同 URL：保留 importance 最高的栏目条目，其余删除并记录
 *   5. 条目 id 重排为 {prefix}-{两位序号}，保证全局唯一（旧 id → 新 id 记录在报告里）
 *
 * 注意：merged 输出会被 validate.js 按 config/schema.json 校验，
 *       newsItem 不允许额外字段，因此内部元数据（来源 bot 等）只进报告、不进 merged。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categories as CATEGORY_DEFS } from '../config/categories.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARTIALS_DIR = path.join(ROOT, 'data', 'input', 'partials');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed');

const TITLE_SIM_THRESHOLD = 0.85;

// 栏目 id → 条目 id 前缀（与 prompts/collector.md 的约定一致）
const ID_PREFIX = {
  ai: 'ai',
  digital_products: 'dp',
  tech_companies: 'tc',
  china_tech: 'cn',
  open_source: 'os',
  free_deals: 'fd',
  research: 'rs',
  space_robotics: 'sr'
};

function parseArgs(argv) {
  const out = { date: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' || a === '-d') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
  }
  return out;
}

/** URL 规范化：小写、去 fragment、去 utm 跟踪参数、去尾斜杠 */
function normalizeUrl(u) {
  if (!u) return '';
  try {
    const url = new URL(u);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(u).toLowerCase().trim().replace(/\/$/, '');
  }
}

/** 标题归一化：小写、全角转半角、去所有空白与标点 */
function normalizeTitle(t) {
  if (!t) return '';
  return String(t)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** bigram Dice 相似度（0~1） */
function diceSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  return (2 * inter) / total;
}

/** 读取某天的所有分片 */
function loadPartials(date) {
  if (!fs.existsSync(PARTIALS_DIR)) {
    console.error(`[dedupe] 分片目录不存在：${PARTIALS_DIR}`);
    console.error('         请先让采集 Bot 产出 data/input/partials/*_{date}.json。');
    process.exit(1);
  }
  const files = fs.readdirSync(PARTIALS_DIR)
    .filter((f) => f.endsWith('.json') && f.includes(date))
    .sort();
  if (!files.length) {
    console.error(`[dedupe] ${date} 没有找到任何分片（data/input/partials/*_${date}.json）`);
    process.exit(1);
  }
  return files.map((file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(PARTIALS_DIR, file), 'utf8'));
    return { file, ...raw };
  });
}

/** 同组重复取舍：importance 高 → published_at 新 → 先出现 */
function bestOf(a, b) {
  const ia = a.importance || 0;
  const ib = b.importance || 0;
  if (ia !== ib) return ia > ib ? a : b;
  const ta = a.published_at || '';
  const tb = b.published_at || '';
  if (ta !== tb) return ta > tb ? a : b;
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || new Date().toISOString().slice(0, 10);
  const partials = loadPartials(date);

  const report = {
    date,
    input_files: partials.map((p) => p.file),
    stats: { partials: partials.length, raw_items: 0, duplicates_removed: 0, cross_category_removed: 0, final_items: 0 },
    duplicates: [],
    cross_category: [],
    renamed_ids: []
  };

  // 按栏目合并，记录来源 bot
  const byId = new Map();
  for (const p of partials) {
    for (const cat of p.categories || []) {
      if (!byId.has(cat.id)) {
        byId.set(cat.id, { id: cat.id, items: [], from: new Set() });
      }
      const bucket = byId.get(cat.id);
      bucket.from.add(p.bot || p.file);
      for (const it of cat.items || []) {
        bucket.items.push({ item: it, from: p.bot || p.file });
      }
    }
  }

  // 未知栏目 id 警告
  const validIds = new Set(CATEGORY_DEFS.map((c) => c.id));
  for (const [cid] of byId) {
    if (!validIds.has(cid)) {
      console.warn(`[dedupe] 警告：未知栏目 id "${cid}"（不在 config/categories.js 中），该栏目条目将被跳过。`);
    }
  }

  // ---- 组内查重 ----
  for (const [cid, bucket] of byId) {
    if (!validIds.has(cid)) continue;
    const kept = [];
    for (const { item, from } of bucket.items) {
      report.stats.raw_items++;
      const nUrl = normalizeUrl(item.source?.url);
      const nTitle = normalizeTitle(item.title);
      let dup = null;
      let reason = '';
      for (const k of kept) {
        if (nUrl && nUrl === k.nUrl) { dup = k; reason = 'URL 重复'; break; }
        if (nTitle && nTitle.length >= 4 && k.nTitle && diceSimilarity(nTitle, k.nTitle) >= TITLE_SIM_THRESHOLD) {
          dup = k; reason = '标题相似'; break;
        }
      }
      if (dup) {
        const winner = bestOf(dup.item, item);
        if (winner === item) {
          // 新条目胜出：把旧条目移出 kept
          kept.splice(kept.indexOf(dup), 1);
          kept.push({ item, from, nUrl, nTitle });
          report.duplicates.push({
            kept: { id: item.id, title: item.title },
            removed: { id: dup.item.id, title: dup.item.title, from: dup.from, reason }
          });
        } else {
          report.duplicates.push({
            kept: { id: dup.item.id, title: dup.item.title },
            removed: { id: item.id, title: item.title, from, reason }
          });
        }
        report.stats.duplicates_removed++;
      } else {
        kept.push({ item, from, nUrl, nTitle });
      }
    }
    bucket.items = kept.map((k) => ({ item: k.item, from: k.from }));
  }

  // ---- 跨栏目查重（同 URL 出现在不同栏目） ----
  const urlIndex = new Map(); // nUrl -> { catId, item }
  const removedCross = [];
  for (const [cid, bucket] of byId) {
    if (!validIds.has(cid)) continue;
    for (const { item } of bucket.items) {
      const nUrl = normalizeUrl(item.source?.url);
      if (!nUrl) continue;
      if (urlIndex.has(nUrl)) {
        const prev = urlIndex.get(nUrl);
        if (prev.catId === cid) continue; // 同栏目组内已处理
        const winner = bestOf(prev.item, item);
        const loser = winner === prev.item ? { catId: cid, item } : { catId: prev.catId, item: prev.item };
        removedCross.push(loser);
        report.cross_category.push({
          url: nUrl,
          kept: { cat: winner === prev.item ? prev.catId : cid, id: winner.id, title: winner.title },
          removed: { cat: loser.catId, id: loser.item.id, title: loser.item.title }
        });
        urlIndex.set(nUrl, winner === prev.item ? prev : { catId: cid, item });
      } else {
        urlIndex.set(nUrl, { catId: cid, item });
      }
    }
  }
  const removedSet = new Set(removedCross.map((r) => `${r.catId}::${r.item.id}`));
  report.stats.cross_category_removed = removedCross.length;

  // ---- 组装输出 + id 重排 ----
  const mergedCategories = [];
  const defById = new Map(CATEGORY_DEFS.map((c) => [c.id, c]));
  for (const [cid, bucket] of byId) {
    if (!validIds.has(cid)) continue;
    const def = defById.get(cid) || {};
    let items = bucket.items
      .filter(({ item }) => !removedSet.has(`${cid}::${item.id}`))
      .map(({ item }) => item);
    // 排序：importance 降序，published_at 升序
    items.sort((a, b) => {
      const imp = (b.importance || 0) - (a.importance || 0);
      if (imp !== 0) return imp;
      const ta = a.published_at || '';
      const tb = b.published_at || '';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    // id 重排
    const prefix = ID_PREFIX[cid] || cid;
    items = items.map((it, i) => {
      const newId = `${prefix}-${String(i + 1).padStart(3, '0')}`;
      if (it.id !== newId) report.renamed_ids.push({ old: it.id, new: newId });
      return { ...it, id: newId };
    });
    mergedCategories.push({
      id: cid,
      name: def.name || cid,
      description: def.description || '',
      items
    });
    report.stats.final_items += items.length;
  }

  // 按 settings.categoryOrder 顺序输出
  let order;
  try {
    const { settings } = await import('../config/settings.js');
    order = settings.categoryOrder || mergedCategories.map((c) => c.id);
  } catch {
    order = mergedCategories.map((c) => c.id);
  }
  const orderById = new Map(mergedCategories.map((c) => [c.id, c]));
  mergedCategories.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const merged = {
    meta: {
      date,
      generated_at: new Date().toISOString(),
      period: '',
      title: '',
      description: ''
    },
    summary: { overview: '', key_points: [] },
    categories: mergedCategories
  };

  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  const mergedPath = path.join(PROCESSED_DIR, `merged_${date}.json`);
  const reportPath = path.join(PROCESSED_DIR, `dedupe_report_${date}.json`);
  fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('──────────────────────────────────────────');
  console.log(` 日期       : ${date}`);
  console.log(` 分片       : ${report.stats.partials} 个 (${report.input_files.join(', ')})`);
  console.log(` 原始条目   : ${report.stats.raw_items}`);
  console.log(` 组内去重   : ${report.stats.duplicates_removed}`);
  console.log(` 跨栏目去重 : ${report.stats.cross_category_removed}`);
  console.log(` 最终条目   : ${report.stats.final_items}`);
  console.log(` 合并输出   : data/processed/merged_${date}.json`);
  console.log(` 查重报告   : data/processed/dedupe_report_${date}.json`);
  console.log('──────────────────────────────────────────');
  console.log('下一步：reviewer Bot 阅读查重报告 → 语义级复核 → 补全 meta/summary →');
  console.log('写入 data/input/news_{date}.json → 运行 validate.js。');
}

main();
