# Crypto Radar — staged upgrade

## Architecture
- **GitHub Pages** serves the Persian, mobile-first interface in `docs/`.
- **Cloudflare Worker** in `cloudflare/worker.js` provides no-key public data routes for Binance spot USDT tickers, daily/weekly/monthly candle history, public Binance futures metrics (open interest, funding, long/short accounts, taker ratio), and public RSS headlines.
- **`pro_engine.py`** is a Python multi-timeframe analysis module with unit tests. The static browser scanner separately computes daily, weekly, and monthly structure by aggregating daily OHLCV candles.

## Deploy the free data worker
1. Open the Cloudflare dashboard and go to **Workers & Pages**.
2. Create a Worker named `crypto-radar-public-data`.
3. Copy the contents of `cloudflare/worker.js` into its editor and deploy.
   - Alternatively, from a computer with Wrangler installed: `cd cloudflare && npx wrangler deploy`.
4. Copy the Worker URL, for example `https://crypto-radar-public-data.<your-subdomain>.workers.dev`.
5. Open the GitHub Pages app, expand **تنظیم اتصال رایگان Cloudflare**, paste the URL and choose **ذخیره و آزمایش اتصال**.

No paid API key is needed. Free service quotas, upstream rate limits, and regional access can still affect availability. Do not add private keys to this public repository.

## Current scope and honest limitations
- The market list is Binance **spot USDT pairs**, not every token deployed on every chain.
- The browser scans 60 markets per refresh from up to 1,000 Binance spot USDT pairs, rotates through the list and stores prior results in the current browser to build a cross-batch watchlist. Keep in mind this is not an always-on server-side scan: the browser must be opened/refreshed to advance the scan. Cached scores are not equally fresh; each card shows scan age. Browser storage may be cleared or reach its quota.
- News is pulled from public RSS feeds; some publishers may block requests or change their feed. Failed sources are reported by the Worker.
- The browser's sector and headline scoring is explicitly a **rough proxy**, not audited fundamental analysis. Symbol-only news matching can create false positives. It must not be treated as a calibrated probability of returns.
- CoinGlass can be useful for cross-exchange open interest and funding rates, liquidation maps, and wider derivatives coverage. Its official API pricing currently starts at $29/month, so this project defaults to free public Binance Futures data and does not require buying CoinGlass. An optional CoinGlass route exists only if you already have an API key; store it in Cloudflare Worker Secrets as `COINGLASS_API_KEY`, never in the browser or GitHub source. Check current plan limits before enabling it.\n- The Worker does not yet collect comprehensive tokenomics, unlock schedules, protocol revenue, GitHub development metrics, exploit/security records, reliable whale flows, or healthcare/energy/defense project evidence. These need source-by-source validation before being scored.
- This app is research-only. It does not place orders or connect to exchange trading credentials.

## Validation
Run the Python unit tests with `python -m unittest discover -s tests`.
Check JavaScript syntax with `node --check cloudflare/worker.js`, `node --check docs/pro-radar.js`, and `node --check docs/app.js`.

## Why this is staged
The original static page referenced a missing `loadAllSignals` function and did not have a configurable API endpoint, so the page could fail before producing results. This upgrade adds the missing browser scanner and an explicit Worker configuration. A professional all-market radar still needs persistent historical data, robust token identity resolution, news deduplication and source reliability, tokenomics/unlock data, and out-of-sample score validation before it should be called complete.
