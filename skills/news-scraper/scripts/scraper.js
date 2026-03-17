#!/usr/bin/env node
/**
 * News Scraper - Playwright-based Chinese news site scraper
 * 
 * Supports two modes:
 *   - Playwright: Full browser rendering (JS sites work)
 *   - HTTP fallback: Node.js fetch + regex extraction (static sites only)
 * 
 * Usage:
 *   node scraper.js                    # All enabled sites
 *   node scraper.js --site sina        # Specific site by nameEn
 *   node scraper.js --list             # List configured sites
 *   node scraper.js --output json      # json | text
 *   node scraper.js --limit 20         # Max items per section
 *   node scraper.js --content          # Fetch article content for each news item
 *   node scraper.js --force-http       # Skip browser, use HTTP only
 *   node scraper.js --headless false   # Show browser (debug)
 * 
 * Playwright system deps (needed for JS-rendered sites):
 *   sudo npx playwright install-deps chromium
 *   # OR: sudo apt install libnspr4 libnss3 libasound2
 */

const path = require('path');
const fs = require('fs');

// ── Try loading Playwright ────────────────────────────────
let chromium = null;
let playwrightAvailable = false;
try {
  ({ chromium } = require('playwright'));
  playwrightAvailable = true;
} catch {}

// ── HTTP Fallback (no browser) ────────────────────────────
async function httpFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  return await res.text();
}

function extractLinksFromHTML(html, baseUrl, filters = {}, linkSelector = null) {
  const results = [];
  const seen = new Set();
  const linkRegex = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let url = match[1];
    let title = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (url.startsWith('//')) url = 'https:' + url;
    else if (url.startsWith('/')) url = baseUrl.replace(/\/$/, '') + url;
    else if (!url.startsWith('http')) continue;
    if (!title || title.length < 3) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    // Apply CSS selector as regex filter on URL
    if (linkSelector) {
      const patterns = extractSelectorPatterns(linkSelector);
      if (patterns.length && !patterns.some(p => url.includes(p))) continue;
    }
    if (filters.urlContains && !url.includes(filters.urlContains)) continue;
    if (filters.urlExclude && url.includes(filters.urlExclude)) continue;
    if (filters.minTitleLength && title.length < filters.minTitleLength) continue;
    results.push({ title, url });
  }
  return results;
}

// Convert CSS selector like "a[href*='/c/']" to URL pattern "/c/"
function extractSelectorPatterns(selector) {
  const patterns = [];
  const regex = /\*\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = regex.exec(selector)) !== null) {
    patterns.push(m[1]);
  }
  return patterns;
}

// ── Article Content Extraction ─────────────────────────────
async function fetchArticleContent(url) {
  try {
    const html = await httpFetch(url);
    return htmlToText(html).slice(0, 2000);
  } catch {
    return '';
  }
}

function htmlToText(html) {
  // Remove scripts, styles, nav, footer, header
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '');

  // Try meta description first
  const metaMatch = text.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || text.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const metaDesc = metaMatch ? metaMatch[1] : '';

  // Try article tag first
  const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    text = articleMatch[1];
  } else {
    // Try common content containers
    const contentMatch = text.match(/<div[^>]*class="[^"]*(?:article-content|post-content|entry-content|content-body|main-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch) {
      text = contentMatch[1];
    }
  }

  // Extract paragraphs
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRegex.exec(text)) !== null) {
    const content = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (content.length > 20) paragraphs.push(content);
  }

  const bodyText = paragraphs.join('\n');
  // Combine meta description + article body
  return [metaDesc, bodyText].filter(Boolean).join('\n');
}

async function fetchContentForItems(items, limit = 20) {
  const toFetch = items.slice(0, limit);
  const results = await Promise.all(
    toFetch.map(async (item) => {
      const content = await fetchArticleContent(item.url);
      return { ...item, content };
    })
  );
  // Items beyond limit get empty content
  return [
    ...results,
    ...items.slice(limit).map(i => ({ ...i, content: '' })),
  ];
}

// ── CLI ───────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { site: null, list: false, output: 'text', limit: 20,
    headless: true, forceHttp: false, outputFile: null, content: false,
    config: path.join(__dirname, 'sites.json') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site' && args[i+1]) opts.site = args[++i];
    else if (args[i] === '--list') opts.list = true;
    else if (args[i] === '--output' && args[i+1]) opts.output = args[++i];
    else if (args[i] === '--limit' && args[i+1]) opts.limit = parseInt(args[++i]);
    else if (args[i] === '--headless' && args[i+1]) opts.headless = args[++i] !== 'false';
    else if (args[i] === '--force-http') opts.forceHttp = true;
    else if (args[i] === '--output-file' && args[i+1]) opts.outputFile = args[++i];
    else if (args[i] === '--content') opts.content = true;
    else if (args[i] === '--config' && args[i+1]) opts.config = args[++i];
  }
  return opts;
}

// ── Helpers ───────────────────────────────────────────────
function loadConfig(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
function cleanTitle(t) { return t ? t.replace(/\s+/g, ' ').trim() : null; }
function dedupByUrl(items) {
  const seen = new Set();
  return items.filter(i => { if (seen.has(i.url)) return false; seen.add(i.url); return true; });
}
function passesFilter(item, f) {
  if (!f) return true;
  if (f.urlContains && !item.url.includes(f.urlContains)) return false;
  if (f.urlExclude && item.url.includes(f.urlExclude)) return false;
  if (f.minTitleLength && (!item.title || item.title.length < f.minTitleLength)) return false;
  return true;
}

// ── Scrapers ──────────────────────────────────────────────

// HTTP mode: fetch + regex (works without browser)
async function scrapeHTTP(section, siteName) {
  try {
    const html = await httpFetch(section.url);
    const baseUrl = section.extract?.baseUrl || new URL(section.url).origin;
    const linkSel = section.selectors?.link || null;
    const items = extractLinksFromHTML(html, baseUrl, section.filter || {}, linkSel);
    return items.map(i => ({ ...i, source: siteName }));
  } catch (err) {
    console.error(`  [HTTP ERR] ${section.name} @ ${siteName}: ${err.message}`);
    return [];
  }
}

// Playwright static mode: browser loads DOM but no JS wait
async function scrapePlaywrightStatic(browser, section, siteName) {
  const page = await browser.newPage();
  try {
    await page.goto(section.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);
    const items = await page.evaluate(({ sel, ext }) => {
      const links = document.querySelectorAll(sel.link);
      return [...links].map(a => ({
        url: ext.url === 'href' ? a.href : a.getAttribute(ext.url),
        title: a.textContent?.trim(),
      })).filter(i => i.url && i.title);
    }, { sel: section.selectors, ext: section.extract });
    const f = section.filter || null;
    return dedupByUrl(items).map(i => ({ ...i, title: cleanTitle(i.title), source: siteName }))
      .filter(i => passesFilter(i, f));
  } catch (err) {
    console.error(`  [PW ERR] ${section.name} @ ${siteName}: ${err.message}`);
    return [];
  } finally { await page.close(); }
}

// Playwright dynamic mode: full JS rendering
async function scrapePlaywrightDynamic(browser, section, siteConfig) {
  const page = await browser.newPage();
  try {
    await page.goto(section.url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(siteConfig.waitMs || 2000);
    try { await page.waitForSelector(section.selectors.link, { timeout: 5000 }); } catch {}
    const items = await page.evaluate(({ sel, ext }) => {
      const links = document.querySelectorAll(sel.link);
      return [...links].map(a => ({
        url: a.href,
        title: a.textContent?.trim(),
      })).filter(i => i.url && i.title);
    }, { sel: section.selectors, ext: section.extract });
    const f = section.filter || null;
    return dedupByUrl(items).map(i => ({ ...i, title: cleanTitle(i.title), source: siteConfig.name }))
      .filter(i => passesFilter(i, f));
  } catch (err) {
    console.error(`  [PW ERR] ${section.name} @ ${siteConfig.name}: ${err.message}`);
    return [];
  } finally { await page.close(); }
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const config = loadConfig(opts.config);

  if (opts.list) {
    console.log('📋 Configured Sites:\n');
    for (const s of config.sites) {
      console.log(`  ${s.enabled ? '✅' : '⏸️'} ${s.name} (${s.nameEn}) [${s.type}]`);
      for (const sec of s.sections) console.log(`     └─ ${sec.name}: ${sec.url}`);
    }
    return;
  }

  let sites = config.sites.filter(s => s.enabled);
  if (opts.site) {
    sites = sites.filter(s => s.nameEn === opts.site || s.name === opts.site);
    if (!sites.length) { console.error(`Site "${opts.site}" not found.`); process.exit(1); }
  }

  // Determine scraping mode
  let browser = null;
  let usePlaywright = false;
  const needDynamic = sites.some(s => s.type === 'dynamic');

  if (!opts.forceHttp && playwrightAvailable) {
    try {
      browser = await chromium.launch({ headless: opts.headless });
      await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });
      usePlaywright = true;
      console.error('   ✅ Playwright mode (browser launched)');
    } catch (err) {
      console.error(`   ⚠️  Playwright unavailable: ${err.message.split('\n')[0]}`);
      console.error('   📌 Using HTTP fallback (static sites only)');
      if (needDynamic) {
        console.error('   ❌ Dynamic sites will be skipped:');
        sites.filter(s => s.type === 'dynamic').forEach(s => console.error(`      - ${s.name}`));
        console.error('   💡 Fix: sudo npx playwright install-deps chromium');
      }
    }
  } else if (opts.forceHttp) {
    console.error('   📌 HTTP-only mode (--force-http)');
    if (needDynamic) {
      console.error('   ❌ Dynamic sites will be skipped');
    }
  } else {
    console.error('   ⚠️  Playwright not installed (npm install playwright)');
  }

  console.error(`\n🕷️  Scraping ${sites.length} site(s) | limit ${opts.limit}/section\n`);

  const results = { timestamp: new Date().toISOString(), mode: usePlaywright ? 'playwright' : 'http', sites: [] };
  let totalItems = 0;

  for (const site of sites) {
    console.error(`  📰 ${site.name}...`);
    const siteResult = { name: site.name, nameEn: site.nameEn, sections: [] };

    for (const section of site.sections) {
      console.error(`     ─ ${section.name}`);
      let items;

      if (site.type === 'dynamic') {
        if (usePlaywright) {
          items = await scrapePlaywrightDynamic(browser, section, site);
        } else {
          console.error('       ⏭️  Skipped (dynamic, no browser)');
          continue;
        }
      } else if (usePlaywright) {
        items = await scrapePlaywrightStatic(browser, section, site.name);
      } else {
        items = await scrapeHTTP(section, site.name);
      }

      items = items.slice(0, opts.limit);

      // Fetch article content if --content flag is set
      if (opts.content && items.length > 0) {
        console.error(`       ⏳ Fetching content for ${Math.min(items.length, 20)} articles...`);
        items = await fetchContentForItems(items, 20);
        const withContent = items.filter(i => i.content && i.content.length > 0).length;
        console.error(`       📝 Content fetched: ${withContent}/${items.length}`);
      }

      siteResult.sections.push({ name: section.name, count: items.length, items });
      totalItems += items.length;
      console.error(`       → ${items.length} items`);
    }

    results.sites.push(siteResult);
  }

  if (browser) await browser.close();

  // Output
  const jsonStr = JSON.stringify(results, null, 2);
  if (opts.output === 'json') {
    if (opts.outputFile) {
      fs.mkdirSync(path.dirname(opts.outputFile), { recursive: true });
      fs.writeFileSync(opts.outputFile, jsonStr);
      console.error(`\n💾 JSON: ${opts.outputFile}`);
    } else {
      console.log(jsonStr);
    }
  } else {
    for (const site of results.sites) {
      console.log(`\n${'═'.repeat(60)}\n📰 ${site.name} (${site.nameEn})\n${'═'.repeat(60)}`);
      for (const section of site.sections) {
        console.log(`\n  【${section.name}】(${section.count}条)\n`);
        section.items.forEach((item, i) => {
          console.log(`  ${i+1}. ${item.title}\n     ${item.url} 【${item.source}】`);
        });
      }
    }
    console.log(`\n${'─'.repeat(60)}\n总计: ${results.sites.length} 站, ${totalItems} 条 | 模式: ${results.mode}`);
    console.log(`时间: ${results.timestamp}`);
  }

  // Also save JSON to default location if no --output-file specified
  if (!opts.outputFile) {
    const outDir = path.join(__dirname, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `news-${new Date().toISOString().slice(0,10)}.json`);
    fs.writeFileSync(outFile, jsonStr);
    console.error(`\n💾 JSON: ${outFile}`);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
