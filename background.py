import threading
import time
from datetime import datetime


def start_background_updater(build_signal_func, watchlist, interval_seconds=600):
    """شروع یه thread که هر N ثانیه داده‌ها رو دوباره محاسبه می‌کنه"""
    
    def worker():
        # اولین محاسبه بلافاصله بعد از start
        time.sleep(5)
        
        while True:
            try:
                print(f"[BG] Starting refresh at {datetime.now().isoformat()}")
                results = []
                for coin_id in watchlist:
                    try:
                        sig = build_signal_func(coin_id, hours=48)
                        results.append(sig)
                        print(f"[BG] {coin_id} computed: {sig.get('combined_signal', 0)}")
                    except Exception as e:
                        print(f"[BG] {coin_id} error: {str(e)[:80]}")
                
                results.sort(key=lambda x: x.get("combined_signal", 0), reverse=True)
                
                # این متغیر رو توی main.py به اشتراک می‌ذاریم
                from main import _signals_cache, _signals_lock
                with _signals_lock:
                    _signals_cache["data"] = results
                    _signals_cache["timestamp"] = time.time()
                
                print(f"[BG] Refresh done. {len(results)} signals cached.")
            except Exception as e:
                print(f"[BG] Worker error: {str(e)[:120]}")
            
            time.sleep(interval_seconds)
    
    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return thread