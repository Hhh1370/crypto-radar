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

async function safeJson(url, ttl = 45, headers = {}) {
  try {
    const response = await cachedFetch(url, ttl);
    return await response.json();
  } catch (error) {
    return { _error: error && error.message ? error.message : "source unavailable" };
  }
}
async function getDerivatives(url, env) {
  const symbol = (url.searchParams.get("symbol") || "BTCUSDT").toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !symbol.endsWith("USDT")) {
    return json({ error: "نماد مشتقه باید جفت USDT معتبر باشد" }, 400);
  }
  const base = symbol.slice(0, -4);
  const source = (url.searchParams.get("source") || "binance").toLowerCase();
  if (source === "coinglass") {
    if (!env || !env.COINGLASS_API_KEY) {
      return json({ error: "کلید CoinGlass تنظیم نشده است؛ در Cloudflare به Worker Settings > Variables and Secrets آن را با نام COINGLASS_API_KEY به صورت Secret اضافه کن.", source: "coinglass", available: false }, 424);
    }
    const headers = { "CG-API-KEY": env.COINGLASS_API_KEY, "Accept": "application/json" };
    const root = "https://open-api-v4.coinglass.com";
    // Authenticated requests are made only in this Worker; the secret never reaches the browser.
    async function cg(path) {
      try {
        const cacheKey = new Request("https://crypto-radar-cg-cache.invalid/" + encodeURIComponent(base) + "/" + path.split("?")[0]);
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) return await cached.json();
        const res = await fetch(root + path, { headers, signal: AbortSignal.timeout(10000) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || (data.code != null && String(data.code) !== "0")) return { _error: data.msg || ("HTTP " + res.status) };
        const copy = new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" } });
        await cache.put(cacheKey, copy);
        return data;
      } catch (e) { return { _error: e.message || "CoinGlass unavailable" }; }
    }
    const [oiData, fundingData] = await Promise.all([
      cg("/api/futures/open-interest/exchange-list?symbol=" + encodeURIComponent(base)),
      cg("/api/futures/funding-rate/exchange-list?symbol=" + encodeURIComponent(base)),
    ]);
    const oiRows = Array.isArray(oiData.data) ? oiData.data : [];
    const fundingRows = Array.isArray(fundingData.data) ? fundingData.data : [];
    const totalOi = oiRows.find(x => x.exchange === "All") || null;
    const rates = fundingRows.flatMap(x => [...(x.stablecoin_margin_list || []), ...(x.token_margin_list || [])]).filter(x => Number.isFinite(Number(x.funding_rate)));
    return json({ symbol, source: "CoinGlass", updatedAt: new Date().toISOString(), available: Boolean(totalOi || rates.length), openInterestUsd: totalOi ? Number(totalOi.open_interest_usd) : null, funding: rates.slice(0, 12), errors: [oiData._error, fundingData._error].filter(Boolean), note: "پوشش و محدودیت درخواست تابع پلن CoinGlass است." });
  }
  const root = "https://fapi.binance.com";
  const urls = {
    currentOi: root + "/fapi/v1/openInterest?symbol=" + symbol,
    oiHistory: root + "/futures/data/openInterestHist?symbol=" + symbol + "&period=1h&limit=24",
    funding: root + "/fapi/v1/fundingRate?symbol=" + symbol + "&limit=10",
    longShort: root + "/futures/data/globalLongShortAccountRatio?symbol=" + symbol + "&period=1h&limit=24",
    taker: root + "/futures/data/takerlongshortRatio?symbol=" + symbol + "&period=1h&limit=24"
  };
  const keys = Object.keys(urls);
  const vals = await Promise.all(keys.map(k => safeJson(urls[k], k === "currentOi" ? 20 : 60)));
  const data = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  const oi = data.currentOi && !data.currentOi._error ? Number(data.currentOi.openInterest) : null;
  const oiSeries = Array.isArray(data.oiHistory) ? data.oiHistory : [];
  const lsSeries = Array.isArray(data.longShort) ? data.longShort : [];
  const takerSeries = Array.isArray(data.taker) ? data.taker : [];
  const fundSeries = Array.isArray(data.funding) ? data.funding : [];
  const last = a => a.length ? a[a.length - 1] : null;
  const first = a => a.length ? a[0] : null;
  const oiFirst = first(oiSeries), oiLast = last(oiSeries);
  const oiChangePct = oiFirst && oiLast && Number(oiFirst.sumOpenInterestValue) ? (Number(oiLast.sumOpenInterestValue) / Number(oiFirst.sumOpenInterestValue) - 1) * 100 : null;
  const l = last(lsSeries), t = last(takerSeries), f = last(fundSeries);
  return json({
    symbol, source: "Binance USDⓈ-M Futures public endpoints", updatedAt: new Date().toISOString(),
    available: Boolean(oi !== null || l || t || f),
    openInterestContracts: oi,
    openInterestUsdApprox: oiLast && oiLast.sumOpenInterestValue != null ? Number(oiLast.sumOpenInterestValue) : null,
    openInterestChange24hPct: oiChangePct,
    fundingRate: f ? Number(f.fundingRate) : null,
    fundingHistory: fundSeries.map(x => ({ time: x.fundingTime, rate: Number(x.fundingRate) })),
    globalLongShortRatio: l ? Number(l.longShortRatio) : null,
    longAccountPct: l ? Number(l.longAccount) * 100 : null,
    shortAccountPct: l ? Number(l.shortAccount) * 100 : null,
    takerBuySellRatio: t ? Number(t.buySellRatio) : null,
    historyPoints: { openInterest: oiSeries.length, longShort: lsSeries.length, taker: takerSeries.length, funding: fundSeries.length },
    errors: Object.entries(data).filter(([, v]) => v && v._error).map(([k, v]) => ({ source: k, error: v._error })),
    note: "داده مشتقات فقط برای جفت‌های دارای قرارداد فیوچرز بایننس موجود است؛ نسبت لانگ/شورت رفتار حساب‌هاست، نه تضمین جهت قیمت."
  });
}

export default {
  async fetch(request, env) {
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
      if (url.pathname === "/api/derivatives") return await getDerivatives(url, env);
      return json({ error: "Not found", routes: ["/api/health", "/api/market", "/api/candles", "/api/news", "/api/derivatives"] }, 404);
    } catch (error) {
      return json({ error: error && error.message ? error.message : "upstream unavailable", staleDataAvailable: false }, 502);
    }
  },
};
