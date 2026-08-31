/**
 * compare_history.js — 历史重复确定性比对（reviewer 的前置加速步骤）
 *
 * 用法：node scripts/compare_history.js --date 2026-08-31
 *
 * 读取：
 *   data/processed/merged_{date}.json          当天合并去重后的候选
 *   output/preview/news_{前一天}.html          昨天的网页版（历史）
 *
 * 产出：
 *   data/processed/history_suspects_{date}.json  嫌疑列表（reviewer 只需审这些）
 *
 * 规则：merged 条目标题/关键词与昨天条目标题做 bigram Dice 相似度 + 实体重叠匹配，
 *       相似度 ≥ 0.45 或共享独特实体（公司/产品名 ≥2 个）→ 列为嫌疑。
 *       reviewer 只审嫌疑列表，其余条目视为新新闻直接保留。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date') out.date = argv[++i];
  }
  return out;
}

function normalizeTitle(t) {
  if (!t) return '';
  return String(t)
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

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
  const ga = grams(a), gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  let total = 0;
  for (const n of ga.values()) total += n;
  for (const n of gb.values()) total += n;
  return (2 * inter) / total;
}

/** 从昨天 HTML 提取新闻标题（h3 标签内容） */
function extractTitlesFromHtml(html) {
  const titles = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, '').trim();
    if (t && t.length > 6) titles.push(t);
  }
  return titles;
}

/** 提取中文/英文实体（≥2字词块） */
function extractEntities(t) {
  const n = normalizeTitle(t);
  // 粗略实体：连续字母数字段（≥3字符）+ 中文 2-6 字片段
  const entities = new Set();
  for (const m of String(t).matchAll(/[A-Za-z][A-Za-z0-9.+-]{2,}/g)) {
    entities.add(m[0].toLowerCase());
  }
  return entities;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || new Date().toISOString().slice(0, 10);

  // 昨天日期
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const prevDate = d.toISOString().slice(0, 10);

  const mergedPath = path.join(ROOT, 'data', 'processed', `merged_${date}.json`);
  const prevHtmlPath = path.join(ROOT, 'output', 'preview', `news_${prevDate}.html`);

  if (!fs.existsSync(mergedPath)) {
    console.error(`[compare_history] 缺少 ${mergedPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(prevHtmlPath)) {
    console.log(`[compare_history] 昨天无历史版本（${prevHtmlPath} 不存在），全部为新新闻，无嫌疑项。`);
    fs.writeFileSync(
      path.join(ROOT, 'data', 'processed', `history_suspects_${date}.json`),
      JSON.stringify({ date, prev_date: prevDate, suspects: [], note: 'no history' }, null, 2)
    );
    process.exit(0);
  }

  const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
  const prevHtml = fs.readFileSync(prevHtmlPath, 'utf8');
  const prevTitles = extractTitlesFromHtml(prevHtml);
  const prevNorm = prevTitles.map((t) => ({ raw: t, norm: normalizeTitle(t), ents: extractEntities(t) }));

  const suspects = [];
  let total = 0;
  for (const cat of merged.categories) {
    for (const item of cat.items) {
      total++;
      const nTitle = normalizeTitle(item.title);
      const ents = extractEntities(item.title);
      let best = { score: 0, prev: '' };
      const sharedEnts = [];

      for (const p of prevNorm) {
        const sim = diceSimilarity(nTitle, p.norm);
        if (sim > best.score) best = { score: sim, prev: p.raw };
        // 实体重叠：≥2 个独特英文实体共享
        let shared = 0;
        for (const e of ents) if (p.ents.has(e)) shared++;
        if (shared >= 2 && shared >= ents.size * 0.5) {
          sharedEnts.push({ prev: p.raw, shared });
        }
      }

      if (best.score >= 0.45 || sharedEnts.length > 0) {
        suspects.push({
          id: item.id,
          category: cat.id,
          title: item.title,
          published_at: item.published_at,
          best_title_sim: Number(best.score.toFixed(3)),
          best_match_yesterday: best.prev,
          entity_matches: sharedEnts.slice(0, 3),
        });
      }
    }
  }

  const out = {
    date,
    prev_date: prevDate,
    total_items: total,
    suspect_count: suspects.length,
    clean_count: total - suspects.length,
    suspects,
    instruction: '以下条目可能与昨天的报道重复，请逐条语义复核（有实质新进展→保留；无新进展→delete）。其余 ' + (total - suspects.length) + ' 条视为新新闻，无需检查。',
  };

  const outPath = path.join(ROOT, 'data', 'processed', `history_suspects_${date}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log('──────────────────────────────────────────');
  console.log(` 昨日版本   : ${prevDate}`);
  console.log(` 当天条目   : ${total}`);
  console.log(` 历史嫌疑   : ${suspects.length} 条（需 LLM 复核）`);
  console.log(` 直接放行   : ${total - suspects.length} 条（无需检查）`);
  console.log(` 输出       : data/processed/history_suspects_${date}.json`);
  console.log('──────────────────────────────────────────');
}

main();
