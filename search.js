// ============================================================
// search.js —— 主进程联网搜索模块（Bing HTML 抓取，无需 API key）
// 返回 [{ title, url, snippet }]，失败时返回 []
// ============================================================

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ensp;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
}

function clean(s) {
  return decodeHtml(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function bingSearch(query, limit = 5) {
  const hosts = ['https://cn.bing.com/search', 'https://www.bing.com/search'];
  for (const base of hosts) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(`${base}?q=${encodeURIComponent(query)}&setlang=zh-CN`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: ac.signal
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      const html = await r.text();
      const out = [];
      const blocks = html.split('<li class="b_algo"');
      for (let i = 1; i < blocks.length && out.length < limit; i++) {
        const b = blocks[i];
        const tm = b.match(/<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/s);
        const um = b.match(/<h2[^>]*><a[^>]*href="([^"]+)"/);
        const sm = b.match(/<p[^>]*>(.*?)<\/p>/s);
        const title = tm ? clean(tm[1]) : '';
        const url = um ? um[1] : '';
        const snippet = sm ? clean(sm[1]) : '';
        if (title) out.push({ title: title.slice(0, 100), url, snippet: snippet.slice(0, 220) });
      }
      if (out.length) return out;
    } catch (e) { /* 换下一个源 */ }
  }
  return [];
}

module.exports = { bingSearch };
