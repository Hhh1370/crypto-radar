import feedparser
import re
import json
import os
import time
from datetime import datetime
from time import mktime


FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "Cointelegraph": "https://cointelegraph.com/rss",
    "Decrypt": "https://decrypt.co/feed",
    "CryptoSlate": "https://cryptoslate.com/feed/",
    "ArzDigital": "https://arzdigital.com/feed/",
}


CACHE_FILE = "data/news_cache.json"
CACHE_TTL_SECONDS = 1800  # 30 دقیقه


COIN_KEYWORDS = {
    "BTC": ["bitcoin", "btc"],
    "ETH": ["ethereum", "eth", "ether"],
    "SOL": ["solana", "sol"],
    "BNB": ["binance coin", "bnb"],
    "XRP": ["ripple", "xrp"],
    "ADA": ["cardano", "ada"],
    "DOGE": ["dogecoin", "doge"],
    "AVAX": ["avalanche", "avax"],
    "DOT": ["polkadot", "dot"],
    "LINK": ["chainlink", "link"],
    "MATIC": ["polygon", "matic"],
    "TAO": ["bittensor", "tao"],
    "FET": ["fetch.ai", "fetch ai", "fet"],
    "RNDR": ["render token", "rndr", "render"],
    "AR": ["arweave"],
    "FIL": ["filecoin", "fil"],
    "INJ": ["injective", "inj"],
    "SUI": ["sui"],
    "APT": ["aptos", "apt"],
    "NEAR": ["near protocol", "near"],
    "ONDO": ["ondo finance", "ondo"],
    "AAVE": ["aave"],
    "UNI": ["uniswap", "uni"],
    "MKR": ["makerdao", "maker"],
    "LDO": ["lido"],
    "GRT": ["the graph", "grt"],
    "IMX": ["immutable", "imx"],
    "SEI": ["sei network", "sei"],
    "TIA": ["celestia", "tia"],
    "OP": ["optimism"],
    "ARB": ["arbitrum", "arb"],
    "PEPE": ["pepe"],
    "SHIB": ["shiba inu", "shib"],
}


def detect_coins(text: str):
    text_lower = text.lower()
    found = set()
    for symbol, keywords in COIN_KEYWORDS.items():
        for kw in keywords:
            pattern = r"\b" + re.escape(kw) + r"\b"
            if re.search(pattern, text_lower):
                found.add(symbol)
                break
    return sorted(found)


def _ensure_data_dir():
    os.makedirs("data", exist_ok=True)


def _load_cache():
    _ensure_data_dir()
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cached = json.load(f)
        if time.time() - cached.get("timestamp", 0) < CACHE_TTL_SECONDS:
            return cached.get("data")
    except Exception:
        pass
    return None


def _save_cache(data):
    _ensure_data_dir()
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"timestamp": time.time(), "data": data}, f, ensure_ascii=False)
    except Exception:
        pass


def _fetch_all_news_raw():
    all_news = []

    for source, url in FEEDS.items():
        try:
            feed = feedparser.parse(url)
            if not feed.entries:
                print("no entries: " + source)
                continue
            print(source + ": " + str(len(feed.entries)) + " items")

            for entry in feed.entries[:30]:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                link = entry.get("link", "")

                published_dt = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    try:
                        published_dt = datetime.fromtimestamp(mktime(entry.published_parsed))
                    except Exception:
                        published_dt = None

                full_text = title + " " + summary
                coins = detect_coins(full_text)
                summary_clean = re.sub(r"<[^>]+>", "", summary)[:300]

                all_news.append({
                    "source": source,
                    "title": title,
                    "summary": summary_clean,
                    "link": link,
                    "published": published_dt.isoformat() if published_dt else None,
                    "published_ts": published_dt.timestamp() if published_dt else 0,
                    "coins": coins,
                })
        except Exception as e:
            print("error " + source + ": " + str(e)[:80])

    all_news.sort(key=lambda x: x["published_ts"], reverse=True)
    return all_news


def fetch_all_news(force_refresh: bool = False):
    if not force_refresh:
        cached = _load_cache()
        if cached:
            return cached

    data = _fetch_all_news_raw()
    _save_cache(data)
    return data


def get_news_by_coin(coin_symbol: str, hours: int = 48):
    all_news = fetch_all_news()
    cutoff = datetime.now().timestamp() - (hours * 3600)
    coin_upper = coin_symbol.upper()

    return [
        n for n in all_news
        if coin_upper in n["coins"] and n["published_ts"] >= cutoff
    ]


def get_trending_coins(hours: int = 48, min_sources: int = 2):
    all_news = fetch_all_news()
    cutoff = datetime.now().timestamp() - (hours * 3600)
    recent = [n for n in all_news if n["published_ts"] >= cutoff]

    coin_data = {}
    for news in recent:
        for coin in news["coins"]:
            if coin not in coin_data:
                coin_data[coin] = {
                    "sources": set(),
                    "news_count": 0,
                    "sample_titles": [],
                }
            coin_data[coin]["sources"].add(news["source"])
            coin_data[coin]["news_count"] += 1
            if len(coin_data[coin]["sample_titles"]) < 3:
                coin_data[coin]["sample_titles"].append({
                    "title": news["title"],
                    "source": news["source"],
                    "link": news["link"],
                })

    trending = []
    for coin, data in coin_data.items():
        if len(data["sources"]) >= min_sources:
            trending.append({
                "coin": coin,
                "source_count": len(data["sources"]),
                "sources": sorted(list(data["sources"])),
                "news_count": data["news_count"],
                "sample_titles": data["sample_titles"],
            })

    trending.sort(key=lambda x: (x["source_count"], x["news_count"]), reverse=True)
    return trending