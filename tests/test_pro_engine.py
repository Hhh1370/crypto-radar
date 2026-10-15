import unittest

from pro_engine import analyze_multi_timeframe, analyze_timeframe


def candles(n=260, trend=1.0):
    out = {"timestamps": [], "opens": [], "highs": [], "lows": [], "closes": [], "volumes": []}
    for i in range(n):
        close = 100 + i * trend + (i % 7) * 0.15
        out["timestamps"].append(i * 86400000)
        out["opens"].append(close - 0.2)
        out["highs"].append(close + 1)
        out["lows"].append(close - 1)
        out["closes"].append(close)
        out["volumes"].append(1000 + i)
    return out


class ProEngineTests(unittest.TestCase):
    def test_daily_analysis_has_structure_levels_and_bounded_score(self):
        result = analyze_timeframe(candles(), "daily")
        self.assertTrue(result["available"])
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertIn("support", result["levels"])
        self.assertIn("resistance", result["levels"])
        self.assertIn(result["breakout"], ("up", "down", "none"))

    def test_insufficient_history_is_explicit(self):
        short = {k: v[:20] for k, v in candles().items()}
        result = analyze_timeframe(short, "daily")
        self.assertFalse(result["available"])
        self.assertIsNone(result["score"])

    def test_multitimeframe_weights_only_available_frames(self):
        daily = candles(365)
        result = analyze_multi_timeframe({"daily": daily})
        self.assertIsNotNone(result["score"])
        self.assertFalse(result["timeframes"]["weekly"]["available"])
        self.assertFalse(result["timeframes"]["monthly"]["available"])
        self.assertIn("confidence_note", result)


if __name__ == "__main__":
    unittest.main()
