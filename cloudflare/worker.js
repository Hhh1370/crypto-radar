/**
 * Crypto Radar public-data edge API.
 * Deploy as a Cloudflare Worker. No API keys are required.
 *
 * Routes:
 *   /api/health
 *   /api/market?limit=250       Binance spot USDT markets, ranked by quote volume
 *   /api/candles?symbol=BTCUSDT&interval=1d&limit=365
 *   /api/news                    public RSS headlines from crypto publishers
 *
 * Respect upstream terms and rate limits. This is a read-only research service.
 */
const BINANCE = "https://api.binance.com";
const FEEDS = [
  ["CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["Cointelegraph", "https://cointelegraph.com/rss"],
  ["Decrypt", "https://decrypt.co/feed"],
  ["CryptoSlate", "https://cryptoslate.com/feed/"],
  ["ArzDigital", "https://arzdigital.com/feed/"],
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}
function xmlText(value = "") {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
}
function tag(block, name) {
  const match = block.match(new RegExp("<" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? xmlText(match[1]) : "";
}
async function cachedFetch(url, ttl = 60) {
  const cache = caches.default;
  const key = new Request(url, { method: "GET" });
  const cached = await cache.match(key);
  if (cached) return cached;
  const upstream = await fetch(url, {
    headers: { "User-Agent": "CryptoRadar/1.0 (public research dashboard)", "Accept": "application/json, application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(12000),
  });
  if (!upstream.ok) throw new Error("منبع داده پاسخ " + upstream.status + " داد");
  const response = new Response(upstream.body, upstream);
  response.headers.set("Cache-Control", "public, max-age=" + ttl);
  await cache.put(key, response.clone());
  return response;
}
async function getMarket(limit) {
  const response = await cachedFetch(BINANCE + "/api/v3/ticker/24hr", 45);
  const data = await response.json();
  const rows = data.filter(x => x.symbol.endsWith("USDT") && !x.symbol.includes("_"))
    .filter(x => Number(x.lastPrice) > 0 && Number(x.quoteVolume) > 0)
    .map(x => ({
      symbol: x.symbol,
      base: x.symbol.slice(0, -4),
      quote: "USDT",
      price: Number(x.lastPrice),
      change24h: Number(x.priceChangePercent),
      quoteVolume24h: Number(x.quoteVolume),
      high24h: Number(x.highPrice),
      low24h: Number(x.lowPrice),
      trades24h: Number(x.count),
    }))
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, limit);
  return { count: rows.length, universe: "Binance spot USDT pairs", limitation: "این فهرست کل توکن‌های جهان نیست؛ فقط بازارهای USDT اسپات بایننس را پوشش می‌دهد.", updatedAt: new Date().toISOString(), markets: rows };
}
async function getCandles(url) {
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") || "1d";
  const allowed = new Set(["1d", "1w", "1M", "4h", "1h"]);
  if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !allowed.has(interval)) {
    return json({ error: "نماد یا بازه زمانی نامعتبر است" }, 400);
  }
  const limit = Math.max(60, Math.min(1000, Number(url.searchParams.get("limit") || 365)));
  const upstreamUrl = BINANCE + "/api/v3/klines?symbol=" + encodeURIComponent(symbol) + "&interval=" + interval + "&limit=" + limit;
  const response = await cachedFetch(upstreamUrl, 60);
  const raw = await response.json();
  return json({
    symbol, interval, count: raw.length, updatedAt: new Date().toISOString(),
    candles: raw.map(k => ({ time: k[0], open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]), closeTime: k[6], quoteVolume: Number(k[7]), trades: Number(k[8]) })),
  });
}
async function getNews() {
  const settled = await Promise.allSettled(FEEDS.map(async ([source, url]) => {
    const response = await cachedFetch(url, 300);
    const xml = await response.text();
    const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(item|entry)>/gi) || [];
    return blocks.slice(0, 25).map(block => {
      const title = tag(block, "title");
      let link = tag(block, "link");
      if (!link) {
        const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
        link = href ? href[1] : "";
      }
      const published = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
      const description = tag(block, "description") || tag(block, "summary") || "";
      return { source, title, link, published, summary: description.slice(0, 350) };
    }).filter(item => item.title && /^https?:\/\//i.test(item.link));
  }));
  const news = settled.flatMap((r, i) => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  const failedSources = settled.map((r, i) => r.status === "rejected" ? FEEDS[i][0] : null).filter(Boolean);
  return { count: news.length, sources: FEEDS.length - failedSources.length, failedSources, updatedAt: new Date().toISOString(), news };
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json({ error: "Only GET is supported" }, 405);
    try {
      if (url.pathname === "/api/health") return json({ status: "ok", service: "crypto-radar-public-data", paidApiKeysRequired: false });
      if (url.pathname === "/api/market") {
        const limit = Math.max(10, Math.min(1000, Number(url.searchParams.get("limit") || 250)));
        return json(await getMarket(limit));
      }
      if (url.pathname === "/api/candles") return await getCandles(url);
      if (url.pathname === "/api/news") return json(await getNews());
      return json({ error: "Not found", routes: ["/api/health", "/api/market", "/api/candles", "/api/news"] }, 404);
    } catch (error) {
      return json({ error: error && error.message ? error.message : "upstream unavailable", staleDataAvailable: false }, 502);
    }
  },
};
