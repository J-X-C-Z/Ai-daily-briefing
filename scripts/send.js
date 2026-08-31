/**
 * send.js — 把生成的 HTML 早报通过 SMTP 发出
 *
 * 用法：
 *   node scripts/send.js --date 2026-08-29        # 发送指定日期
 *   node scripts/send.js                          # 发送今天日期
 *   node scripts/send.js --dry-run                # 不真正发信，只打印将要发送的内容
 *
 * 私密配置从 .env 读取（SMTP 账号、密码、收件人），不写进代码。
 * settings.email.enabled = false 时，无论是否加 --dry-run 都只做 dry-run。
 */

import nodemailer from 'nodemailer';
import {
  resolvePath, readFile, readJSON, loadSettings, loadEnv, htmlToText, writeRunLog
} from './lib.mjs';

function parseArgs(argv) {
  const out = { date: null, dryRun: false, input: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' || a === '-d') out.date = argv[++i];
    else if (a.startsWith('--date=')) out.date = a.slice('--date='.length);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--input' || a === '-i') out.input = argv[++i];
  }
  return out;
}

function parseList(v) {
  if (!v) return [];
  return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

async function main() {
  loadEnv();
  const settings = await loadSettings();
  const args = parseArgs(process.argv.slice(2));

  const date = args.date || new Date().toISOString().slice(0, 10);
  const htmlRel = args.input || `output/html/news_${date}.html`;
  const processedRel = `data/processed/news_${date}.json`;

  // 读取 HTML 与元信息
  let html;
  try {
    html = readFile(htmlRel);
  } catch (e) {
    console.error(`[send] 找不到邮件 HTML：${resolvePath(htmlRel)}`);
    console.error(`       请先运行 generate.js 生成。`);
    process.exit(1);
  }

  let count = 0;
  try {
    const proc = readJSON(processedRel);
    count = proc.categories.reduce((n, c) => n + (c.items?.length || 0), 0);
  } catch { /* 忽略，count 退化为 0 */ }

  const meta = { date };
  try { meta.title = readJSON(processedRel).meta?.title; } catch { /* ignore */ }

  const subject = (settings.email?.subjectTemplate || 'AI早报 · {date}')
    .replace('{date}', date)
    .replace('{count}', String(count));

  const fromName = settings.email?.fromName || settings.system?.brand || 'AI早报';
  const from = process.env.SMTP_USER
    ? `"${fromName}" <${process.env.SMTP_USER}>`
    : `"${fromName}" <no-reply@example.com>`;

  const recipients = parseList(process.env.RECIPIENTS);
  const cc = parseList(process.env.CC);
  const bcc = parseList(process.env.BCC);

  const dryRun = args.dryRun || settings.email?.enabled === false;

  console.log('──────────────────────────────────────────');
  console.log(` 收件人   : ${recipients.join(', ') || '(未配置 RECIPIENTS)'}`);
  console.log(` 抄送     : ${cc.join(', ') || '-'}`);
  console.log(` 密送     : ${bcc.join(', ') || '-'}`);
  console.log(` 主题     : ${subject}`);
  console.log(` 模式     : ${dryRun ? 'DRY-RUN（不真正发送）' : 'LIVE（真实发送）'}`);
  console.log('──────────────────────────────────────────');

  if (dryRun) {
    console.log('\n[dry-run] 将在 body 中发送以下 HTML（前 400 字符预览）：\n');
    console.log(html.slice(0, 400) + '\n...');
    writeRunLog({ action: 'send', mode: 'dry-run', date, subject, recipients });
    console.log('\n✓ dry-run 完成，未发送任何邮件。');
    return;
  }

  // ---- 真实发送 ----
  if (!recipients.length) {
    console.error('[send] 未配置收件人（RECIPIENTS）。终止。');
    process.exit(1);
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[send] 缺少 SMTP 配置（SMTP_HOST / SMTP_USER / SMTP_PASS）。终止。');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: recipients.join(', '),
      cc: cc.length ? cc.join(', ') : undefined,
      bcc: bcc.length ? bcc.join(', ') : undefined,
      subject,
      text: htmlToText(html),
      html
    });
    console.log(`\n✓ 邮件已发送。messageId=${info.messageId}`);
    writeRunLog({
      action: 'send', mode: 'live', date, subject,
      recipients, messageId: info.messageId
    });
  } catch (e) {
    console.error(`\n✗ 发送失败：${e.message}`);
    writeRunLog({ action: 'send', mode: 'live', date, error: e.message });
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
