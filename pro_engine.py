"""Multi-timeframe technical engine for Crypto Radar.

Uses OHLCV candle data; no network access here. Inputs must contain aligned
timestamps, opens, highs, lows, closes and volumes arrays.
"""
from __future__ import annotations

from typing import Any


def _ema(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    alpha = 2 / (period + 1)
    result = float(values[0])
    for value in values[1:]:
        result = alpha * float(value) + (1 - alpha) * result
    return result


def _atr(candles: dict[str, list[float]], period: int = 14) -> float | None:
    h, l, c = candles["highs"], candles["lows"], candles["closes"]
    if min(len(h), len(l), len(c)) < period + 1:
        return None
    tr = []
    for i in range(1, len(c)):
        tr.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
    return sum(tr[-period:]) / period if tr else None


def _pivots(values: list[float], left: int = 3, right: int = 3, kind: str = "high") -> list[float]:
    out = []
    for i in range(left, len(values) - right):
        window = values[i-left:i+right+1]
        if kind == "high" and values[i] == max(window) and window.count(values[i]) == 1:
            out.append(float(values[i]))
        if kind == "low" and values[i] == min(window) and window.count(values[i]) == 1:
            out.append(float(values[i]))
    return out


def _nearest_levels(candles: dict[str, list[float]], count: int = 3) -> dict[str, list[float]]:
    close = candles["closes"][-1]
    highs = _pivots(candles["highs"], kind="high")
    lows = _pivots(candles["lows"], kind="low")
    # Cluster nearby pivot levels so repeated touches do not inflate the list.
    atr = _atr(candles) or close * 0.01
    tolerance = max(atr * 0.45, close * 0.002)
    def cluster(levels: list[float]) -> list[float]:
        groups: list[list[float]] = []
        for level in sorted(levels):
            if groups and abs(level - sum(groups[-1]) / len(groups[-1])) <= tolerance:
                groups[-1].append(level)
            else:
                groups.append([level])
        return [sum(g) / len(g) for g in groups]
    resistance = sorted((x for x in cluster(highs) if x > close), key=lambda x: x-close)[:count]
    support = sorted((x for x in cluster(lows) if x < close), key=lambda x: close-x)[:count]
    return {"support": [round(x, 8) for x in support], "resistance": [round(x, 8) for x in resistance]}


def analyze_timeframe(candles: dict[str, list[float]], label: str) -> dict[str, Any]:
    closes = candles.get("closes", [])
    highs = candles.get("highs", [])
    lows = candles.get("lows", [])
    volumes = candles.get("volumes", [])
    if len(closes) < 60 or min(len(highs), len(lows)) < 60:
        return {"timeframe": label, "available": False, "score": None,
                "reason": "حداقل ۶۰ کندل معتبر لازم است"}
    close = float(closes[-1])
    ema20, ema50, ema200 = _ema(closes, 20), _ema(closes, 50), _ema(closes, 200)
    score, signals = 50, []
    if ema20 is not None and ema50 is not None:
        if close > ema20 > ema50:
            score += 15; signals.append("قیمت بالای EMA20 و EMA50")
        elif close < ema20 < ema50:
            score -= 15; signals.append("قیمت زیر EMA20 و EMA50")
        elif close > ema20:
            score += 5; signals.append("قیمت بالای EMA20")
        else:
            score -= 5; signals.append("قیمت زیر EMA20")
    if ema200 is not None:
        if close > ema200:
            score += 10; signals.append("بالای EMA200")
        else:
            score -= 10; signals.append("زیر EMA200")
    lookback = min(20, len(closes) - 1)
    prior_high = max(highs[-lookback-1:-1])
    prior_low = min(lows[-lookback-1:-1])
    breakout = "up" if close > prior_high else "down" if close < prior_low else "none"
    if breakout == "up":
        score += 12; signals.append("شکست سقف ۲۰ کندل")
    elif breakout == "down":
        score -= 12; signals.append("شکست کف ۲۰ کندل")
    atr = _atr(candles)
    vol_ratio = None
    if len(volumes) >= 21:
        baseline = sum(volumes[-21:-1]) / 20
        vol_ratio = round(float(volumes[-1]) / baseline, 2) if baseline > 0 else None
        if breakout != "none" and vol_ratio is not None:
            if vol_ratio >= 1.5:
                score += 8 if breakout == "up" else -8
                signals.append("شکست با حجم نسبی بالا")
            elif vol_ratio < 0.8:
                signals.append("حجم شکست ضعیف است")
    levels = _nearest_levels(candles)
    # Keep the score interpretable and avoid implying calibrated probability.
    score = max(0, min(100, score))
    return {
        "timeframe": label, "available": True, "score": score,
        "trend": "صعودی" if score >= 60 else "نزولی" if score <= 40 else "خنثی",
        "close": close, "ema20": ema20, "ema50": ema50, "ema200": ema200,
        "atr": round(atr, 8) if atr is not None else None,
        "atr_pct": round(atr / close * 100, 2) if atr is not None and close else None,
        "relative_volume": vol_ratio, "breakout": breakout,
        "levels": levels, "signals": signals,
    }


def analyze_multi_timeframe(candles_by_timeframe: dict[str, dict[str, list[float]]]) -> dict[str, Any]:
    """Expected keys: daily, weekly, monthly. Missing timeframes remain unavailable."""
    frames = {}
    weights = {"monthly": 0.40, "weekly": 0.35, "daily": 0.25}
    weighted, total_weight = 0.0, 0.0
    for key in ("monthly", "weekly", "daily"):
        candles = candles_by_timeframe.get(key)
        frames[key] = analyze_timeframe(candles, key) if candles else {
            "timeframe": key, "available": False, "score": None,
            "reason": "داده این بازه زمانی در دسترس نیست"}
        if frames[key]["available"]:
            weighted += frames[key]["score"] * weights[key]
            total_weight += weights[key]
    score = round(weighted / total_weight, 1) if total_weight else None
    available = [frames[k]["score"] for k in ("monthly", "weekly", "daily") if frames[k]["available"]]
    conflict = bool(len(available) >= 2 and max(available) - min(available) >= 35)
    return {
        "score": score,
        "trend": "صعودی" if score is not None and score >= 60 else "نزولی" if score is not None and score <= 40 else "خنثی" if score is not None else "نامشخص",
        "timeframes": frames,
        "timeframe_conflict": conflict,
        "confidence_note": "تضاد بین بازه‌های زمانی؛ ریسک سناریو بالاتر است" if conflict else "امتیاز فنی است، نه احتمال موفقیت کالیبره‌شده",
    }
