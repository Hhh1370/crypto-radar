from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from concurrent.futures import ThreadPoolExecutor
import httpx
from indicators import (
    calculate_rsi, calculate_sma, calculate_ema, calculate_macd,
    calculate_bollinger, calculate_adx, calculate_atr,
    calculate_gann_square, detect_rsi_divergence,
)
from fundamental import categorize_sectors
from radar import scan_market
from news import fetch_all_news, get_news_by_coin, get_trending_coins
from coins_map import COINS

app = FastAPI(title="Crypto Radar")

BINANCE = "https://api.binance.com/api/v3"
COINPAPRIKA = "https://api.coinpaprika.com/v1"


@app.get("/")
def root():
    return {"status": "ok", "msg": "Crypto Radar"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# ---------- توابع داخلی ----------

def _get_ohlc(coin_id: str, days: int = 365):
    if coin_id not in COINS:
        raise Exception(f"Coin {coin_id} not in mapping")
    _, _, binance_symbol, _ = COINS[coin_id]

    url = f"{BINANCE}/klines"
    params = {"symbol": binance_symbol, "interval": "1d", "limit": min(days, 1000)}
    r = httpx.get(url, params=params, timeout=15.0)
    r.raise_for_status()
    data = r.json()

    return {
        "timestamps": [item[0] for item in data],
        "opens": [float(item[1]) for item in data],
        "highs": [float(item[2]) for item in data],
        "lows": [float(item[3]) for item in data],
        "closes": [float(item[4]) for item in data],
        "volumes": [float(item[5]) for item in data],
    }


def _get_coin_info(coin_id: str):
    if coin_id not in COINS:
        raise Exception(f"Coin {coin_id} not in mapping")
    symbol, name, binance_symbol, paprika_id = COINS[coin_id]

    categories = []
    try:
        r = httpx.get(f"{COINPAPRIKA}/coins/{paprika_id}", timeout=10.0)
        if r.status_code == 200:
            tags = r.json().get("tags") or []
            categories = [t.get("name", "") for t in tags if isinstance(t, dict)]
    except Exception:
        pass

    market_data = {}
    try:
        r = httpx.get(
            f"{BINANCE}/ticker/24hr",
            params={"symbol": binance_symbol},
            timeout=10.0,
        )
        if r.status_code == 200:
            t = r.json()
            volume = float(t.get("quoteVolume", 0))
            market_data = {
                "total_volume": {"usd": volume},
                "market_cap": {"usd": volume * 30},
            }
    except Exception:
        pass

    return {
        "id": coin_id,
        "symbol": symbol.lower(),
        "name": name,
        "categories": categories,
        "developer_data": {},
        "market_data": market_data,
    }


def _translate_macd(status: str) -> str:
    return {
        "bullish_cross": "کراس صعودی",
        "bearish_cross": "کراس نزولی",
        "neutral": "بی‌طرف",
    }.get(status, status)


def _translate_bollinger(position: str) -> str:
    return {
        "above_upper": "بالای باند بالا",
        "below_lower": "زیر باند پایین",
        "above_middle": "بالای میانه",
        "below_middle": "زیر میانه",
    }.get(position, position)


def _translate_adx_strength(strength: str) -> str:
    return {
        "strong": "روند قوی",
        "forming": "در حال شکل‌گیری",
        "weak": "بدون روند",
    }.get(strength, strength)


def _translate_adx_direction(direction: str) -> str:
    return {
        "bullish": "صعودی",
        "bearish": "نزولی",
    }.get(direction, direction)


def _translate_atr_level(level: str) -> str:
    return {
        "very_high": "نوسان بسیار بالا",
        "high": "نوسان بالا",
        "normal": "نوسان معمولی",
    }.get(level, level)


def _translate_divergence(signal: str) -> str:
    return {
        "bullish_divergence": "واگرایی صعودی",
        "bearish_divergence": "واگرایی نزولی",
        "none": "واگرایی خاصی نیست",
    }.get(signal, signal)


def _technical_score(ohlc: dict):
    closes = ohlc["closes"]
    highs = ohlc["highs"]
    lows = ohlc["lows"]

    rsi = calculate_rsi(closes, 14)
    ema50 = calculate_ema(closes, 50)
    ema200 = calculate_ema(closes, 200)
    macd = calculate_macd(closes)
    bollinger = calculate_bollinger(closes)
    adx = calculate_adx(highs, lows, closes)
    atr = calculate_atr(highs, lows, closes)
    gann = calculate_gann_square(closes[-1])
    divergence = detect_rsi_divergence(closes)

    current_price = closes[-1]
    score = 0
    signals = []

    if ema200:
        if current_price > ema200:
            score += 25
            signals.append("قیمت بالای EMA200 ✅")
        else:
            signals.append("قیمت زیر EMA200 ❌")

    if ema50 and ema200:
        if ema50 > ema200:
            score += 10
            signals.append("گلدن کراس ✅")
        else:
            signals.append("دث کراس ❌")

    if rsi:
        if 40 <= rsi <= 65:
            score += 15
            signals.append(f"RSI سالم ({rsi}) ✅")
        elif rsi < 30:
            score += 8
            signals.append(f"RSI اشباع فروش ({rsi}) ⚠️")
        elif rsi > 70:
            signals.append(f"RSI اشباع خرید ({rsi}) ⚠️")

    if macd:
        if macd["status"] == "bullish_cross":
            score += 15
            signals.append("MACD کراس صعودی ✅")
        elif macd["status"] == "bearish_cross":
            signals.append("MACD کراس نزولی ❌")
        else:
            score += 7
            signals.append("MACD بی‌طرف")

    if len(closes) >= 31:
        change_30d = ((closes[-1] - closes[-31]) / closes[-31]) * 100
        if 5 < change_30d < 100:
            score += 10
            signals.append(f"مومنتوم +{change_30d:.1f}% ✅")
        elif 0 < change_30d <= 5:
            score += 5
            signals.append(f"مومنتوم ضعیف ({change_30d:.1f}%)")
        else:
            signals.append(f"مومنتوم منفی ({change_30d:.1f}%) ❌")

    if bollinger:
        if bollinger["position"] == "below_lower":
            score += 10
            signals.append("Bollinger اشباع فروش ✅")
        elif bollinger["position"] == "above_upper":
            signals.append("Bollinger اشباع خرید ⚠️")
        else:
            score += 5
            signals.append(f"Bollinger: {_translate_bollinger(bollinger['position'])}")

    if adx:
        if adx["adx"] >= 25:
            score += 10
            signals.append(f"ADX قوی ({adx['adx']}) ✅")
        elif adx["adx"] >= 20:
            score += 5
            signals.append(f"ADX در حال شکل‌گیری ({adx['adx']})")
        else:
            signals.append(f"ADX ضعیف ({adx['adx']})")

    if divergence:
        if divergence["signal"] == "bullish_divergence":
            score += 5
            signals.append("واگرایی صعودی RSI ✅")
        elif divergence["signal"] == "bearish_divergence":
            signals.append("واگرایی نزولی RSI ⚠️")

    translated_macd = None
    if macd:
        translated_macd = {
            "macd": macd["macd"],
            "signal": macd["signal"],
            "histogram": macd["histogram"],
            "status": _translate_macd(macd["status"]),
        }

    translated_bollinger = None
    if bollinger:
        translated_bollinger = {
            "upper": bollinger["upper"],
            "middle": bollinger["middle"],
            "lower": bollinger["lower"],
            "width_pct": bollinger["width_pct"],
            "position": _translate_bollinger(bollinger["position"]),
        }

    translated_adx = None
    if adx:
        translated_adx = {
            "adx": adx["adx"],
            "plus_di": adx["plus_di"],
            "minus_di": adx["minus_di"],
            "strength": _translate_adx_strength(adx["strength"]),
            "direction": _translate_adx_direction(adx["direction"]),
        }

    translated_atr = None
    if atr:
        translated_atr = {
            "atr": atr["atr"],
            "atr_pct": atr["atr_pct"],
            "level": _translate_atr_level(atr["level"]),
        }

    translated_divergence = None
    if divergence:
        translated_divergence = {
            "current_rsi": divergence["current_rsi"],
            "signal": _translate_divergence(divergence["signal"]),
        }

    return {
        "score": score,
        "signals": signals,
        "indicators": {
            "rsi_14": rsi,
            "ema_50": ema50,
            "ema_200": ema200,
            "macd": translated_macd,
            "bollinger": translated_bollinger,
            "adx": translated_adx,
            "atr": translated_atr,
            "gann": gann,
            "divergence": translated_divergence,
        },
    }


def _fundamental_score(coin_data: dict):
    categories = coin_data.get("categories", [])
    sectors = categorize_sectors(categories)
    market = coin_data.get("market_data", {})
    developer = coin_data.get("developer_data", {})

    score = 0
    signals = []

    if any("هوش مصنوعی" in s for s in sectors):
        score += 20
        signals.append("صنعت هوش مصنوعی 🤖")
    if any("دیفای" in s for s in sectors):
        score += 15
        signals.append("صنعت دیفای 💰")
    if any("ذخیره" in s for s in sectors):
        score += 15
        signals.append("صنعت ذخیره‌سازی 💾")
    if any("DePIN" in s for s in sectors):
        score += 15
        signals.append("صنعت DePIN 📡")
    if any("RWA" in s for s in sectors):
        score += 15
        signals.append("صنعت RWA 🏢")
    if any("امنیت" in s for s in sectors):
        score += 15
        signals.append("صنعت امنیت سایبری 🛡️")
    if any("انرژی" in s for s in sectors):
        score += 15
        signals.append("صنعت انرژی 🔋")

    commits_4w = developer.get("commit_count_4_weeks", 0)
    if commits_4w > 100:
        score += 25
        signals.append(f"توسعه‌دهنده بسیار فعال ({commits_4w}) ✅")
    elif commits_4w > 30:
        score += 15
        signals.append(f"توسعه‌دهنده فعال ({commits_4w}) ✅")

    volume = market.get("total_volume", {}).get("usd", 0)
    mcap = market.get("market_cap", {}).get("usd", 1)
    vol_ratio = (volume / mcap) * 100 if mcap else 0

    if vol_ratio > 20:
        score += 20
        signals.append(f"نقدینگی بسیار بالا ({vol_ratio:.1f}%) ✅")
    elif vol_ratio > 5:
        score += 10
        signals.append(f"نقدینگی مناسب ({vol_ratio:.1f}%) ✅")

    return {
        "score": min(score, 100),
        "signals": signals,
        "sectors": sectors,
        "details": {"commits_4w": commits_4w, "volume_to_mcap": round(vol_ratio, 2)},
    }


def _build_signal(coin_id: str, hours: int = 48):
    """ساخت سیگنال ترکیبی برای یک ارز (کمکی برای /signals/all)"""
    try:
        info = _get_coin_info(coin_id)
    except Exception as e:
        return {"coin": coin_id, "error": str(e)[:80], "combined_signal": 0}

    symbol = info.get("symbol", "").upper()
    name = info.get("name", "")

    try:
        ohlc = _get_ohlc(coin_id)
        tech = _technical_score(ohlc)
        current_price = round(ohlc["closes"][-1], 2)
    except Exception as e:
        tech = {"score": 0, "signals": [f"err: {str(e)[:50]}"]}
        current_price = 0

    fund = _fundamental_score(info)

    try:
        news_items = get_news_by_coin(symbol, hours=hours)
    except Exception:
        news_items = []

    sources_set = sorted(set(n["source"] for n in news_items))
    sources_count = len(sources_set)
    news_count = len(news_items)

    news_score = min(100, sources_count * 20)
    if news_count >= 10:
        news_score = min(100, news_score + 20)
    elif news_count >= 5:
        news_score = min(100, news_score + 10)

    combined = round(
        tech["score"] * 0.5 + fund["score"] * 0.2 + news_score * 0.3, 1
    )

    if combined >= 80:
        verdict = "سیگنال بسیار قوی"
    elif combined >= 60:
        verdict = "سیگنال قوی"
    elif combined >= 40:
        verdict = "سیگنال متوسط"
    elif combined >= 20:
        verdict = "سیگنال ضعیف"
    else:
        verdict = "بدون سیگنال"

    return {
        "coin": coin_id,
        "symbol": symbol,
        "name": name,
        "current_price": current_price,
        "combined_signal": combined,
        "verdict": verdict,
        "breakdown": {
            "technical": {
                "score": tech["score"],
                "weight": 0.5,
                "signals": tech["signals"],
            },
            "fundamental": {
                "score": fund["score"],
                "weight": 0.2,
                "signals": fund["signals"],
                "sectors": fund["sectors"],
            },
            "news": {
                "score": news_score,
                "weight": 0.3,
                "sources_count": sources_count,
                "sources": sources_set,
                "news_count": news_count,
                "top_titles": [
                    {"title": n["title"], "source": n["source"], "link": n["link"]}
                    for n in news_items[:3]
                ],
            },
        },
    }


# ---------- اندپوینت‌ها ----------

@app.get("/analyze/{coin_id}")
def analyze_coin(coin_id: str):
    try:
        ohlc = _get_ohlc(coin_id)
    except Exception as e:
        raise HTTPException(404, f"coin error: {str(e)[:50]}")

    tech = _technical_score(ohlc)
    return {
        "coin": coin_id,
        "current_price": round(ohlc["closes"][-1], 2),
        "technical_score": tech["score"],
        "max_score": 100,
        "indicators": tech["indicators"],
        "signals": tech["signals"],
    }


@app.get("/fundamental/{coin_id}")
def fundamental_analysis(coin_id: str):
    try:
        data = _get_coin_info(coin_id)
    except Exception as e:
        raise HTTPException(404, f"coin error: {str(e)[:50]}")

    fund = _fundamental_score(data)
    return {
        "coin": coin_id,
        "name": data.get("name"),
        "symbol": data.get("symbol", "").upper(),
        "sectors": fund["sectors"],
        "fundamental_score": fund["score"],
        "max_score": 100,
        "signals": fund["signals"],
        "details": fund["details"],
    }


@app.get("/analyze-full/{coin_id}")
def analyze_full(coin_id: str):
    try:
        ohlc = _get_ohlc(coin_id)
    except Exception as e:
        raise HTTPException(404, f"coin error: {str(e)[:50]}")

    try:
        info = _get_coin_info(coin_id)
    except Exception:
        info = {}

    tech = _technical_score(ohlc)
    fund = _fundamental_score(info)

    combined = (tech["score"] * 0.6) + (fund["score"] * 0.4)

    if combined >= 80:
        verdict = "بسیار قوی"
    elif combined >= 60:
        verdict = "قوی"
    elif combined >= 40:
        verdict = "متوسط"
    elif combined >= 20:
        verdict = "ضعیف"
    else:
        verdict = "بسیار ضعیف"

    return {
        "coin": coin_id,
        "name": info.get("name"),
        "symbol": info.get("symbol", "").upper(),
        "current_price": round(ohlc["closes"][-1], 2),
        "combined_score": round(combined, 1),
        "verdict": verdict,
        "sectors": fund["sectors"],
        "breakdown": {
            "technical": {
                "score": tech["score"],
                "weight": 0.6,
                "signals": tech["signals"],
                "indicators": tech["indicators"],
            },
            "fundamental": {
                "score": fund["score"],
                "weight": 0.4,
                "signals": fund["signals"],
                "details": fund["details"],
            },
        },
    }


@app.get("/radar")
def radar(limit: int = 3, refresh: bool = False):
    try:
        results = scan_market(force_refresh=refresh)
    except Exception as e:
        raise HTTPException(502, f"error: {e}")

    valid = [r for r in results if r.get("technical_score", -1) >= 0]
    return {"count": len(valid), "top": valid[:limit], "cached": not refresh}


# ---------- اخبار ----------

@app.get("/news")
def news_all():
    try:
        items = fetch_all_news()
    except Exception as e:
        raise HTTPException(502, f"error: {e}")
    return {"count": len(items), "news": items[:50]}


@app.get("/news/trending")
def news_trending(hours: int = 48, min_sources: int = 2):
    try:
        coins = get_trending_coins(hours=hours, min_sources=min_sources)
    except Exception as e:
        raise HTTPException(502, f"error: {e}")
    return {"count": len(coins), "trending": coins}


@app.get("/news/coin/{symbol}")
def news_by_coin(symbol: str, hours: int = 48):
    try:
        items = get_news_by_coin(symbol, hours=hours)
    except Exception as e:
        raise HTTPException(502, f"error: {e}")
    return {"coin": symbol.upper(), "count": len(items), "news": items}


# ---------- سیگنال ترکیبی ----------

@app.get("/signal/{coin_id}")
def get_signal(coin_id: str, hours: int = 48):
    return _build_signal(coin_id, hours=hours)


@app.get("/signals/all")
def get_all_signals(hours: int = 48):
    """گرفتن سیگنال ۳ ارز به صورت موازی (سریع‌تر)"""
    watchlist = ["bitcoin", "ethereum", "solana"]

    with ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(lambda c: _build_signal(c, hours=hours), watchlist))

    results.sort(key=lambda x: x.get("combined_signal", 0), reverse=True)
    return {"count": len(results), "signals": results}


# ---------- UI ----------

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/app")
def serve_app():
    return FileResponse("static/index.html")