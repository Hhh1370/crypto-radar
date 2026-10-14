import httpx
import json
import time
import os
from indicators import (
    calculate_rsi, calculate_ema, calculate_macd,
    calculate_bollinger, calculate_adx, detect_rsi_divergence,
)

COINGECKO = "https://api.coingecko.com/api/v3"
CACHE_FILE = "data/radar_cache.json"
CACHE_TTL_SECONDS = 3600


def _get_top_coins(top_n: int):
    url = f"{COINGECKO}/coins/markets"
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": top_n,
        "page": 1,
        "price_change_percentage": "24h,7d,30d",
    }
    response = httpx.get(url, params=params, timeout=30.0)
    response.raise_for_status()
    return response.json()


def _get_ohlc_from_gecko(coin_id: str, days: int = 365):
    url = f"{COINGECKO}/coins/{coin_id}/market_chart"
    params = {"vs_currency": "usd", "days": days, "interval": "daily"}
    response = httpx.get(url, params=params, timeout=30.0)
    response.raise_for_status()
    data = response.json()
    prices = [p[1] for p in data.get("prices", [])]

    if len(prices) < 50:
        raise Exception("not enough data")

    highs = []
    lows = []
    for i, p in enumerate(prices):
        start = max(0, i - 1)
        end = min(len(prices), i + 2)
        window = prices[start:end]
        highs.append(max(window))
        lows.append(min(window))

    return {
        "closes": prices,
        "highs": highs,
        "lows": lows,
    }


def _get_categories_from_gecko(coin_id: str):
    try:
        url = f"{COINGECKO}/coins/{coin_id}"
        params = {
            "localization": "false",
            "tickers": "false",
            "market_data": "false",
            "community_data": "false",
            "developer_data": "false",
        }
        r = httpx.get(url, params=params, timeout=20.0)
        if r.status_code != 200:
            return []
        data = r.json()
        cats = data.get("categories") or []
        return cats if isinstance(cats, list) else []
    except Exception:
        return []


CATEGORY_SECTOR_MAP = {
    "artificial-intelligence": "AI",
    "ai-agents": "AI",
    "machine-learning": "AI",
    "generative-ai": "AI",
    "decentralized-finance-defi": "DeFi",
    "defi": "DeFi",
    "decentralized-exchange": "DeFi",
    "lending-borrowing": "DeFi",
    "yield-farming": "DeFi",
    "liquid-staking": "DeFi",
    "storage": "Storage",
    "file-sharing": "Storage",
    "distributed-computing": "Storage",
    "depin": "DePIN",
    "infrastructure": "Infrastructure",
    "privacy-coins": "Privacy",
    "cybersecurity": "Security",
    "gaming": "Gaming",
    "play-to-earn": "Gaming",
    "metaverse": "Metaverse",
    "oracle": "Oracle",
    "layer-2": "Layer2",
    "zero-knowledge-zk": "Layer2",
    "smart-contract-platform": "SmartContract",
    "real-world-assets-rwa": "RWA",
    "rwa-protocol": "RWA",
    "renewable-energy": "Energy",
    "energy": "Energy",
}


def _categories_to_sectors(categories):
    if not categories:
        return ["Unknown"]
    sectors = set()
    for cat in categories:
        if not isinstance(cat, str):
            continue
        cat_lower = cat.lower().replace(" ", "-")
        if cat_lower in CATEGORY_SECTOR_MAP:
            sectors.add(CATEGORY_SECTOR_MAP[cat_lower])
            continue
        for key, val in CATEGORY_SECTOR_MAP.items():
            if key in cat_lower:
                sectors.add(val)
                break
    return list(sectors) if sectors else ["Unknown"]


def _technical_score(ohlc: dict):
    closes = ohlc["closes"]
    highs = ohlc["highs"]
    lows = ohlc["lows"]

    if len(closes) < 200:
        return {"score": 0, "signals": ["not enough data"]}

    rsi = calculate_rsi(closes, 14)
    ema50 = calculate_ema(closes, 50)
    ema200 = calculate_ema(closes, 200)
    macd = calculate_macd(closes)
    bollinger = calculate_bollinger(closes)
    adx = calculate_adx(highs, lows, closes)
    divergence = detect_rsi_divergence(closes)

    current_price = closes[-1]
    score = 0
    signals = []

    if ema200 and current_price > ema200:
        score += 25
        signals.append("EMA200 +")

    if ema50 and ema200 and ema50 > ema200:
        score += 10
        signals.append("GoldenCross +")

    if rsi and 40 <= rsi <= 65:
        score += 15
        signals.append("RSI " + str(rsi))

    if macd and macd["status"] == "bullish_cross":
        score += 15
        signals.append("MACD +")

    if len(closes) >= 31:
        change_30d = ((closes[-1] - closes[-31]) / closes[-31]) * 100
        if 5 < change_30d < 100:
            score += 10
            signals.append("Momentum +" + str(round(change_30d)))

    if bollinger and bollinger["position"] == "below_lower":
        score += 10
        signals.append("Bollinger +")

    if adx and adx["adx"] >= 25:
        score += 10
        signals.append("ADX " + str(adx["adx"]))

    if divergence and divergence["signal"] == "bullish_divergence":
        score += 5
        signals.append("Divergence +")

    return {"score": score, "signals": signals[:4]}


def _fundamental_score(categories, coin_data):
    sectors = _categories_to_sectors(categories)
    score = 0
    signals = []
    matched_sectors = []

    sector_scores = [
        ("AI", 25),
        ("DeFi", 15),
        ("Storage", 15),
        ("DePIN", 20),
        ("RWA", 15),
        ("Security", 15),
        ("Energy", 15),
        ("Gaming", 10),
        ("Infrastructure", 10),
        ("Oracle", 15),
        ("Layer2", 10),
    ]

    for sector_name, points in sector_scores:
        if sector_name in sectors:
            score += points
            matched_sectors.append(sector_name)

    volume = coin_data.get("total_volume", 0)
    mcap = coin_data.get("market_cap", 1)
    vol_ratio = (volume / mcap) * 100 if mcap else 0

    if vol_ratio > 20:
        score += 25
        signals.append("LiqHigh")
    elif vol_ratio > 5:
        score += 15
        signals.append("LiqGood")

    return {
        "score": min(score, 100),
        "signals": signals,
        "sectors": sectors,
        "matched_sectors": matched_sectors,
    }


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


def scan_market(top_n: int = 3, force_refresh: bool = False):
    if not force_refresh:
        cached = _load_cache()
        if cached:
            print("using cache")
            return cached

    print("fetching top coins")
    coins = _get_top_coins(top_n)
    print("got " + str(len(coins)) + " coins")
    time.sleep(10)

    results = []
    for idx, coin in enumerate(coins):
        symbol = coin["symbol"].upper()
        coin_id = coin["id"]
        name = coin["name"]
        print("analyzing " + symbol)

        try:
            ohlc = _get_ohlc_from_gecko(coin_id, days=365)
            tech = _technical_score(ohlc)
        except Exception as e:
            print("  OHLCV err: " + str(e)[:60])
            tech = {"score": 0, "signals": ["no data"]}

        time.sleep(10)

        fund = {"score": 0, "signals": [], "sectors": [], "matched_sectors": []}
        try:
            cats = _get_categories_from_gecko(coin_id)
            fund = _fundamental_score(cats, coin)
        except Exception as e:
            print("  Cats err: " + str(e)[:60])

        time.sleep(5)

        tech_score = tech["score"]
        fund_score = fund["score"]
        combined = round(tech_score * 0.6 + fund_score * 0.4, 1)

        if combined >= 80:
            verdict = "VeryStrong"
        elif combined >= 60:
            verdict = "Strong"
        elif combined >= 40:
            verdict = "Medium"
        elif combined >= 20:
            verdict = "Weak"
        else:
            verdict = "VeryWeak"

        results.append({
            "rank": coin.get("market_cap_rank"),
            "id": coin_id,
            "symbol": symbol,
            "name": name,
            "price_usd": coin.get("current_price", 0),
            "market_cap": coin.get("market_cap", 0),
            "change_24h": round(coin.get("price_change_percentage_24h_in_currency") or 0, 2),
            "change_7d": round(coin.get("price_change_percentage_7d_in_currency") or 0, 2),
            "change_30d": round(coin.get("price_change_percentage_30d_in_currency") or 0, 2),
            "technical_score": tech_score,
            "fundamental_score": fund_score,
            "combined_score": combined,
            "verdict": verdict,
            "sectors": fund.get("sectors", []),
            "matched_sectors": fund.get("matched_sectors", []),
            "signals": tech["signals"] + fund["signals"],
        })

    results.sort(key=lambda x: x.get("combined_score", -1), reverse=True)
    _save_cache(results)
    print("done")
    return results