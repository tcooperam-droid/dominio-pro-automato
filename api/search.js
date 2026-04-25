// Vercel Serverless Function — pesquisa na internet via DuckDuckGo HTML.
// Roda no servidor da Vercel (não tem CORS, não expõe token).

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

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
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!r.ok) {
      return res.status(502).json({ error: `Search engine returned ${r.status}` });
    }

    const html = await r.text();
    const results = [];
    const itemRe =
      /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    let m;
    while ((m = itemRe.exec(html)) && results.length < max) {
      let href = decodeHtmlEntities(m[1]);
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      const title = decodeHtmlEntities(stripTags(m[2]));
      const snippet = decodeHtmlEntities(stripTags(m[3]));
      if (title && href) results.push({ title, url: href, snippet });
    }

    return res.status(200).json({ query, results });
  } catch (err) {
    return res.status(502).json({ error: err?.message || "search failed" });
  }
}
