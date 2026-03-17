#!/usr/bin/env node
/**
 * News Analysis - Generate per-section analysis from consolidated news data
 *
 * Called by orchestrator.js as a child process.
 * Reads consolidated JSON with article content, generates thematic analysis per section.
 *
 * Usage:
 *   node analysis.js --input <consolidated.json> --output <analysis.json>
 */

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { input: null, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) opts.input = args[++i];
    if (args[i] === '--output' && args[i + 1]) opts.output = args[++i];
  }
  return opts;
}

// ── Keyword Extraction ────────────────────────────────────
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很',
  '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '他', '她', '它',
  '们', '这个', '那个', '什么', '怎么', '为什么', '可以', '没', '被', '让', '给', '从', '向', '对',
  '为', '以', '与', '及', '或', '等', '中', '其', '之', '但', '而', '如果', '因为', '所以', '虽然',
  '把', '将', '已', '已经', '正在', '能', '可能', '应该', '必须', '需要', '通过', '进行', '实现',
  '表示', '认为', '指出', '发现', '显示', '报道', '记者', '消息', '据悉', '了解', '相关',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'and', 'but',
  'or', 'not', 'no', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function extractKeywords(text, topN = 5) {
  const words = text
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── Content Type Detection ────────────────────────────────
function detectContentType(text) {
  if (/财|股|币|投资|市场|经济|金融|收入|利润|营收|亿|万/.test(text)) return '财经';
  if (/AI|人工智能|大模型|芯片|科技|互联网|软件|算法|算力/.test(text)) return '科技';
  if (/政治|外交|政策|政府|领导|会议|党|人大|政协/.test(text)) return '政治';
  if (/国际|美国|欧洲|日本|韩国|俄罗斯|冲突|战争|外交/.test(text)) return '国际';
  if (/社会|民生|教育|医疗|健康|就业|住房/.test(text)) return '社会';
  if (/体育|比赛|冠军|联赛|球队|运动员/.test(text)) return '体育';
  if (/汽车|车型|上市|预售|销量/.test(text)) return '汽车';
  if (/娱乐|明星|电影|音乐|综艺/.test(text)) return '娱乐';
  return '综合';
}

// ── Section Analyzer ──────────────────────────────────────
function analyzeSection(section) {
  const allText = section.items
    .map(i => `${i.title} ${i.content || ''}`)
    .join(' ');

  const keywords = extractKeywords(allText, 8);

  // Notable stories (those with most content)
  const withContent = section.items
    .filter(i => i.content && i.content.length > 50)
    .sort((a, b) => (b.content?.length || 0) - (a.content?.length || 0));

  const notableStories = withContent.slice(0, 3).map(i => ({
    title: i.title,
    summary: (i.content || '').slice(0, 150) + ((i.content?.length || 0) > 150 ? '...' : ''),
  }));

  // Content type distribution
  const typeCount = {};
  for (const item of section.items) {
    const t = detectContentType(`${item.title} ${item.content || ''}`);
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  const contentTypes = Object.entries(typeCount)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  // Content stats
  const itemsWithContent = section.items.filter(i => i.content && i.content.length > 0);
  const avgLength = itemsWithContent.length > 0
    ? Math.round(itemsWithContent.reduce((s, i) => s + (i.content?.length || 0), 0) / itemsWithContent.length)
    : 0;

  return {
    name: section.name,
    count: section.count,
    keywords,
    notableStories,
    contentTypes,
    stats: {
      withContent: itemsWithContent.length,
      totalItems: section.items.length,
      avgContentLength: avgLength,
    },
  };
}

// ── Main ──────────────────────────────────────────────────
function main() {
  const opts = parseArgs();
  if (!opts.input || !opts.output) {
    console.error('Usage: node analysis.js --input <consolidated.json> --output <analysis.json>');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(opts.input, 'utf-8'));

  const analysis = {
    timestamp: new Date().toISOString(),
    sites: [],
    summary: '',
  };

  let totalKeywords = {};

  for (const site of data.sites) {
    const siteAnalysis = {
      name: site.name,
      nameEn: site.nameEn,
      sections: [],
    };

    for (const section of site.sections) {
      const secAnalysis = analyzeSection(section);
      siteAnalysis.sections.push(secAnalysis);

      // Aggregate keywords for overall summary
      for (const kw of secAnalysis.keywords) {
        totalKeywords[kw.word] = (totalKeywords[kw.word] || 0) + kw.count;
      }
    }

    analysis.sites.push(siteAnalysis);
  }

  // Generate overall summary
  const topKeywords = Object.entries(totalKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([w]) => w);

  const totalItems = data.sites.reduce((s, site) =>
    s + site.sections.reduce((ss, sec) => ss + sec.count, 0), 0);

  const totalWithContent = data.sites.reduce((s, site) =>
    s + site.sections.reduce((ss, sec) =>
      ss + sec.items.filter(i => i.content && i.content.length > 0).length, 0), 0);

  analysis.summary = `本次共爬取 ${data.sites.length} 个新闻站点的 ${totalItems} 条新闻，` +
    `其中 ${totalWithContent} 条成功提取正文内容。` +
    `热门关键词：${topKeywords.slice(0, 8).join('、')}。` +
    `主要覆盖${[...new Set(analysis.sites.flatMap(s => s.sections.flatMap(sec => sec.contentTypes.map(ct => ct.type))))].join('、')}等领域。`;

  // Write output
  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(analysis, null, 2));
  console.log(JSON.stringify({ status: 'ok', output: opts.output, summary: analysis.summary }));
}

main();
