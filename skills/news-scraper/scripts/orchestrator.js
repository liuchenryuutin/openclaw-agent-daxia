#!/usr/bin/env node
/**
 * News Orchestrator - Multi-site parallel scraper pipeline
 *
 * Pipeline:
 *   1. Spawn child scraper process for each enabled site (parallel)
 *   2. Each child saves results to a temp JSON file
 *   3. Wait for all children to complete
 *   4. Consolidate all results
 *   5. Create Feishu cloud document
 *   6. Send document link to user via Feishu message
 *
 * Usage:
 *   node orchestrator.js                     # All enabled sites
 *   node orchestr.js --site sina             # Single site
 *   node orchestrator.js --limit 20          # Items per section
 *   node orchestrator.js --parallel 3        # Max parallel children
 *   node orchestrator.js --skip-feishu       # Skip Feishu doc creation (test)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const SCRIPTS_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPTS_DIR, 'sites.json');
const TEMP_DIR = path.join(SCRIPTS_DIR, 'temp');
const SCRAPER_PATH = path.join(SCRIPTS_DIR, 'scraper.js');

// ── Feishu Config ─────────────────────────────────────────
const FEISHU_CONFIG = {
  appId: 'cli_a93fda4918f89bdf',
  appSecret: 'kIlF3hAcZkqWsQkGMcjSEhvGwfWOOTBQ',
  userId: 'ou_8462b401def44e3db8a04e4a52a67fff',
};

// ── CLI ───────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { site: null, limit: 20, parallel: 4, skipFeishu: false, content: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--site' && args[i+1]) opts.site = args[++i];
    else if (args[i] === '--limit' && args[i+1]) opts.limit = parseInt(args[++i]);
    else if (args[i] === '--parallel' && args[i+1]) opts.parallel = parseInt(args[++i]);
    else if (args[i] === '--skip-feishu') opts.skipFeishu = true;
    else if (args[i] === '--content') opts.content = true;
  }
  return opts;
}

// ── Feishu API ────────────────────────────────────────────
function apiRequest(method, hostname, apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const postData = body ? JSON.stringify(body) : null;
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = https.request({ hostname, path: apiPath, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (!data || data.trim() === '') {
          // Empty response (e.g., for some block operations) - treat as success
          resolve({ code: 0, msg: 'success (empty body)' });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          // Non-JSON response - could be HTML error page or plain text
          resolve({ code: res.statusCode === 200 ? 0 : res.statusCode, msg: data.slice(0, 200) });
        }
      });
    });
    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

async function getTenantToken() {
  const res = await apiRequest('POST', 'open.feishu.cn',
    '/open-apis/auth/v3/tenant_access_token/internal',
    { app_id: FEISHU_CONFIG.appId, app_secret: FEISHU_CONFIG.appSecret });
  return res.tenant_access_token;
}

async function createDocument(title) {
  const token = await getTenantToken();
  const res = await apiRequest('POST', 'open.feishu.cn',
    '/open-apis/docx/v1/documents', { title }, token);
  if (res.code !== 0) throw new Error(`Create doc failed: ${res.msg} (code=${res.code})`);
  return { docId: res.data.document.document_id, token };
}

async function createBlock(docId, blockType, textContent, token, parentId) {
  const block = { block_type: blockType };
  if (blockType === 3) { // Heading1
    block.heading1 = { elements: [{ text_run: { content: textContent } }] };
  } else if (blockType === 4) { // Heading2
    block.heading2 = { elements: [{ text_run: { content: textContent } }] };
  } else if (blockType === 12) { // Bullet
    block.bullet = { elements: [{ text_run: { content: textContent } }] };
  } else if (blockType === 2) { // Text
    block.text = { elements: [{ text_run: { content: textContent } }] };
  } else if (blockType === 22) { // Divider
    block.divider = {};
  }

  const body = { children: [block], index: -1 };
  const targetId = parentId || docId;
  const apiPath = `/open-apis/docx/v1/documents/${docId}/blocks/${targetId}/children`;

  const res = await apiRequest('POST', 'open.feishu.cn', apiPath, body, token);
  // Feishu may return code=0 or no code field (both mean success)
  if (res.code !== undefined && res.code !== 0) {
    console.error(`  [block err] type=${blockType}: ${res.msg} (${res.code})`);
  }
  return res;
}

async function grantPermission(docId, token) {
  try {
    const res = await apiRequest('POST', 'open.feishu.cn',
      `/open-apis/drive/v1/permissions/${docId}/members?type=docx`,
      { member_type: 'openid', member_id: FEISHU_CONFIG.userId, perm: 'full_access' },
      token);
    if (res.code !== 0) {
      console.error(`  [perm warn] ${res.msg || 'unknown error'} (${res.code || 'no code'})`);
      // Try alternative perm value
      const res2 = await apiRequest('POST', 'open.feishu.cn',
        `/open-apis/drive/v1/permissions/${docId}/members?type=docx`,
        { member_type: 'openid', member_id: FEISHU_CONFIG.userId, perm: 'manage_collaborator' },
        token);
      if (res2.code === 0) {
        console.error(`  ✅ Permission granted (alt method)`);
      } else {
        console.error(`  [perm] Document may need manual sharing`);
      }
    } else {
      console.error(`  ✅ Permission granted to ${FEISHU_CONFIG.userId}`);
    }
  } catch (err) {
    console.error(`  [perm err] ${err.message} - document may need manual sharing`);
  }
}

async function sendMessage(text) {
  const token = await getTenantToken();
  const res = await apiRequest('POST', 'open.feishu.cn',
    '/open-apis/im/v1/messages?receive_id_type=open_id',
    {
      receive_id: FEISHU_CONFIG.userId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
    token);
  if (res.code !== 0) {
    console.error(`  [msg err] ${res.msg}`);
  } else {
    console.error(`  ✅ Message sent to user`);
  }
  return res;
}

// ── Child Process Spawner ─────────────────────────────────
function spawnScraper(siteNameEn, outputFile, limit, opts = {}) {
  return new Promise((resolve) => {
    const args = [
      SCRAPER_PATH,
      '--site', siteNameEn,
      '--output', 'json',
      '--output-file', outputFile,
      '--limit', String(limit),
      '--force-http',
    ];

    if (opts.content) args.push('--content');

    const timeout = opts.content ? 600000 : 120000; // 10min with content, 2min without

    console.error(`  🚀 Spawning: node scraper.js --site ${siteNameEn}${opts.content ? ' --content' : ''}`);
    const child = spawn(process.execPath, args, {
      cwd: SCRIPTS_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.on('data', () => {}); // consume stdout

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ site: siteNameEn, success: false, error: `Timeout (${timeout/1000}s)`, stderr });
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputFile)) {
        resolve({ site: siteNameEn, success: true, outputFile });
      } else {
        resolve({ site: siteNameEn, success: false, error: `Exit code ${code}`, stderr: stderr.slice(-500) });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ site: siteNameEn, success: false, error: err.message });
    });
  });
}

// ── Proper Batch Runner ───────────────────────────────────
async function runAllSites(sites, opts) {
  const results = [];
  // Process in batches of `parallel`
  for (let i = 0; i < sites.length; i += opts.parallel) {
    const batch = sites.slice(i, i + opts.parallel);
    console.error(`\n  📦 Batch ${Math.floor(i / opts.parallel) + 1}: ${batch.map(s => s.nameEn).join(', ')}`);
    const batchResults = await Promise.all(
      batch.map(site => {
        const outFile = path.join(TEMP_DIR, `${site.nameEn}.json`);
        return spawnScraper(site.nameEn, outFile, opts.limit, { content: opts.content });
      })
    );
    results.push(...batchResults);
  }
  return results;
}

// ── Consolidate ───────────────────────────────────────────
function consolidateResults(siteResults) {
  const consolidated = {
    timestamp: new Date().toISOString(),
    mode: 'orchestrated',
    sites: [],
    stats: { total: 0, success: 0, failed: 0 },
  };

  for (const sr of siteResults) {
    if (sr.success) {
      try {
        const data = JSON.parse(fs.readFileSync(sr.outputFile, 'utf-8'));
        if (data.sites && data.sites.length > 0) {
          consolidated.sites.push(...data.sites);
          // Count items
          for (const site of data.sites) {
            for (const section of site.sections) {
              consolidated.stats.total += section.count;
            }
          }
        }
        consolidated.stats.success++;
      } catch (err) {
        console.error(`  [consolidate err] ${sr.site}: ${err.message}`);
        consolidated.stats.failed++;
      }
    } else {
      console.error(`  [scrape failed] ${sr.site}: ${sr.error}`);
      consolidated.stats.failed++;
    }
  }

  return consolidated;
}

// ── Feishu Document Builder ───────────────────────────────
async function createFeishuDoc(consolidated, analysis = null) {
  const date = new Date().toISOString().slice(0, 10);
  const title = `国内新闻爬取汇总 - ${date} | 大虾出品`;

  console.error(`\n📄 Creating Feishu doc: ${title}`);
  const { docId, token } = await createDocument(title);
  const docUrl = `https://szzhgl.feishu.cn/docx/${docId}`;
  console.error(`  📎 Doc created: ${docUrl}`);

  // Grant permission
  await grantPermission(docId, token);

  // Build content
  let totalItems = 0;

  // Header
  await createBlock(docId, 3, `📰 国内新闻爬取汇总 - ${date}`, token);
  await createBlock(docId, 2, `爬取时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} | 来源: ${consolidated.sites.length} 个新闻站 | 共 ${consolidated.stats.total} 条新闻`, token);

  // Overall analysis summary (if available)
  if (analysis && analysis.summary) {
    await createBlock(docId, 22, '', token);
    await createBlock(docId, 4, '📊 本次爬取分析', token);
    await createBlock(docId, 2, analysis.summary, token);
  }

  await createBlock(docId, 22, '', token);

  for (const site of consolidated.sites) {
    // Site name as H1
    await createBlock(docId, 3, `${site.name}`, token);

    for (const section of site.sections) {
      // Section name as H2
      await createBlock(docId, 4, `【${section.name}】(${section.count}条)`, token);

      // Per-section analysis (if available)
      if (analysis) {
        const siteAnalysis = analysis.sites.find(s => s.name === site.name);
        const secAnalysis = siteAnalysis?.sections.find(s => s.name === section.name);
        if (secAnalysis) {
          // Keywords
          if (secAnalysis.keywords.length > 0) {
            const kwText = `🔑 关键词: ${secAnalysis.keywords.map(k => `${k.word}(${k.count})`).join('、')}`;
            await createBlock(docId, 2, kwText, token);
          }
          // Notable stories
          if (secAnalysis.notableStories.length > 0) {
            for (const story of secAnalysis.notableStories) {
              await createBlock(docId, 2, `⭐ ${story.title}: ${story.summary}`, token);
            }
          }
          // Content type
          if (secAnalysis.contentTypes.length > 0) {
            const ctText = `📂 内容分布: ${secAnalysis.contentTypes.map(ct => `${ct.type}(${ct.count})`).join(' | ')}`;
            await createBlock(docId, 2, ctText, token);
          }
          // Stats
          const st = secAnalysis.stats;
          await createBlock(docId, 2, `📈 数据: ${st.withContent}/${st.totalItems} 篇有正文, 平均 ${st.avgContentLength} 字`, token);
        }
      }

      // News items as bullets
      for (const item of section.items) {
        const text = `${item.title}\n${item.url} 【${item.source}】`;
        await createBlock(docId, 12, text, token);
        totalItems++;
      }
    }

    // Divider between sites
    await createBlock(docId, 22, '', token);
  }

  // Footer
  await createBlock(docId, 2, `总计: ${consolidated.sites.length} 个站点, ${totalItems} 条新闻`, token);

  console.error(`  ✅ Content written: ${totalItems} items`);
  return { docId, docUrl, token };
}

// ── Cleanup ───────────────────────────────────────────────
function cleanup() {
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(TEMP_DIR, f));
    }
    fs.rmdirSync(TEMP_DIR);
    console.error(`  🧹 Cleaned temp directory`);
  }
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  let sites = config.sites.filter(s => s.enabled);
  if (opts.site) {
    sites = sites.filter(s => s.nameEn === opts.site || s.name === opts.site);
    if (!sites.length) { console.error(`Site "${opts.site}" not found.`); process.exit(1); }
  }

  console.error(`\n${'═'.repeat(60)}`);
  console.error(`  🦐 新闻爬取流水线 (News Pipeline)`);
  console.error(`  📊 ${sites.length} 站点 | 并行 ${opts.parallel} | 每站最多 ${opts.limit} 条`);
  console.error(`${'═'.repeat(60)}\n`);

  // Clean temp dir
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  cleanup();
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Phase 1: Parallel scraping
  console.error(`\n📡 Phase 1: 并行爬取...`);
  const startTime = Date.now();
  const siteResults = await runAllSites(sites, opts);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`\n  ✅ 爬取完成: ${elapsed}s`);

  // Phase 2: Consolidate
  console.error(`\n📊 Phase 2: 汇总数据...`);
  const consolidated = consolidateResults(siteResults);
  console.error(`  📈 成功: ${consolidated.stats.success} | 失败: ${consolidated.stats.failed} | 总计: ${consolidated.stats.total} 条`);

  // Save consolidated JSON
  const consolidatedPath = path.join(SCRIPTS_DIR, 'output', `pipeline-${new Date().toISOString().slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(consolidatedPath), { recursive: true });
  fs.writeFileSync(consolidatedPath, JSON.stringify(consolidated, null, 2));
  console.error(`  💾 Consolidated: ${consolidatedPath}`);

  // Phase 3: Run analysis (if --content was enabled)
  let analysis = null;
  if (opts.content && consolidated.stats.total > 0) {
    console.error(`\n🔍 Phase 3: 生成栏目分析...`);
    const analysisOutput = path.join(SCRIPTS_DIR, 'output', `analysis-${new Date().toISOString().slice(0, 10)}.json`);
    const ANALYSIS_PATH = path.join(SCRIPTS_DIR, 'analysis.js');
    await new Promise((resolve) => {
      const child = spawn(process.execPath, [
        ANALYSIS_PATH,
        '--input', consolidatedPath,
        '--output', analysisOutput,
      ], { cwd: SCRIPTS_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', () => {});
      child.stderr.on('data', d => process.stderr.write(d));
      child.on('close', resolve);
      child.on('error', () => resolve());
      setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 60000); // 60s timeout for analysis
    });
    if (fs.existsSync(analysisOutput)) {
      analysis = JSON.parse(fs.readFileSync(analysisOutput, 'utf-8'));
      console.error(`  ✅ Analysis complete: ${analysis.summary?.slice(0, 80)}...`);
    } else {
      console.error(`  ⚠️  Analysis failed, continuing without`);
    }
  } else if (!opts.content) {
    console.error(`\n⏭️  Skipping analysis (no --content flag)`);
  }

  if (opts.skipFeishu) {
    console.error(`\n⏭️  Skipping Feishu (--skip-feishu)`);
    cleanup();
    return;
  }

  // Phase 4: Create Feishu document
  console.error(`\n📄 Phase 4: 创建飞书文档...`);
  try {
    const { docUrl } = await createFeishuDoc(consolidated, analysis);

    // Phase 5: Send to user
    console.error(`\n📨 Phase 5: 推送消息...`);
    let msg = `🦐 新闻爬取完成！\n\n📊 汇总报告：\n• 站点：${consolidated.sites.length} 个\n• 新闻：${consolidated.stats.total} 条\n• 用时：${elapsed}s`;
    if (analysis) msg += `\n• 分析：已生成（关键词/重要新闻/内容分布）`;
    msg += `\n\n📄 飞书文档：${docUrl}`;
    await sendMessage(msg);

    console.error(`\n${'═'.repeat(60)}`);
    console.error(`  ✅ Pipeline 完成！`);
    console.error(`  📎 文档: ${docUrl}`);
    console.error(`${'═'.repeat(60)}\n`);
  } catch (err) {
    console.error(`  ❌ Feishu error: ${err.message}`);
    // Send error message to user
    await sendMessage(`⚠️ 新闻爬取完成，但创建飞书文档失败。\n\n数据已保存在本地，共 ${consolidated.stats.total} 条。\n错误: ${err.message}`);
  }

  // Cleanup
  cleanup();
}

main().catch(err => {
  console.error('Fatal:', err);
  cleanup();
  process.exit(1);
});
