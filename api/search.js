// Vercel Serverless Function — pesquisa na internet com fallbacks.
// Tenta vários provedores para contornar bloqueios em IPs de cloud:
//   1. DuckDuckGo HTML (lite endpoint, mais permissivo)
//   2. Bing HTML scrape
//   3. DuckDuckGo Instant Answer API (JSON, sempre funciona mas dá menos resultados)

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

// ─── Provider 1: DuckDuckGo Lite ──────────────────────────
async function searchDuckDuckGoLite(query, max) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!r.ok) throw new Error(`DDG lite ${r.status}`);
  const html = await r.text();

  const results = [];
  // Lite DDG: linha do resultado é <a class="result-link" ...>title</a> seguido de <td class="result-snippet">snippet</td>
  const re =
    /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(html)) && results.length < max) {
    let href = decodeHtmlEntities(m[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    const title = decodeHtmlEntities(stripTags(m[2]));
    const snippet = decodeHtmlEntities(stripTags(m[3]));
    if (title && href && href.startsWith("http")) {
      results.push({ title, url: href, snippet });
    }
  }
  if (results.length === 0) throw new Error("DDG lite: nenhum resultado parseado");
  return results;
}

// ─── Provider 2: Bing HTML ────────────────────────────────
async function searchBing(query, max) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=pt-BR`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!r.ok) throw new Error(`Bing ${r.status}`);
  const html = await r.text();

  const results = [];
  // Bing: <li class="b_algo"><h2><a href="...">title</a></h2>...<p>snippet</p>
  const re =
    /<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?<h2><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) && results.length < max) {
    const href = decodeHtmlEntities(m[1]);
    const title = decodeHtmlEntities(stripTags(m[2]));
    const snippet = decodeHtmlEntities(stripTags(m[3]));
    if (title && href && href.startsWith("http")) {
      results.push({ title, url: href, snippet });
    }
  }
  if (results.length === 0) throw new Error("Bing: nenhum resultado parseado");
  return results;
}

// ─── Provider 3: DuckDuckGo Instant Answer API (fallback) ──
async function searchDuckDuckGoAPI(query, max) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0&t=dominio-pro`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`DDG API ${r.status}`);
  const data = await r.json();

  const results = [];
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText,
    });
  }
  if (Array.isArray(data.RelatedTopics)) {
    for (const t of data.RelatedTopics) {
      if (results.length >= max) break;
      if (t.FirstURL && t.Text) {
        results.push({
          title: t.Text.split(" - ")[0]?.slice(0, 120) || t.Text.slice(0, 120),
          url: t.FirstURL,
          snippet: t.Text,
        });
      } else if (Array.isArray(t.Topics)) {
        for (const sub of t.Topics) {
          if (results.length >= max) break;
          if (sub.FirstURL && sub.Text) {
            results.push({
              title: sub.Text.split(" - ")[0]?.slice(0, 120) || sub.Text.slice(0, 120),
              url: sub.FirstURL,
              snippet: sub.Text,
            });
          }
        }
      }
    }
  }
  if (results.length === 0) throw new Error("DDG API: vazio");
  return results;
}

// ─── Handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { query, limit } = body;
    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query required" });
    }
    const max = Math.min(typeof limit === "number" ? limit : 5, 10);

    const errors = [];
    for (const provider of [
      { name: "ddg-lite", fn: searchDuckDuckGoLite },
      { name: "bing", fn: searchBing },
      { name: "ddg-api", fn: searchDuckDuckGoAPI },
    ]) {
      try {
        const results = await provider.fn(query, max);
        return res.status(200).json({ query, results, source: provider.name });
      } catch (e) {
        errors.push(`${provider.name}: ${e?.message || e}`);
      }
    }

    return res.status(502).json({
      error: "Nenhum provedor de busca respondeu.",
      details: errors,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "search failed" });
  }
}
