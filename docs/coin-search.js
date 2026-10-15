/* Free on-demand coin lookup and evidence-first single-asset review. */
(function(){
 const $=id=>document.getElementById(id);
 const form=$("coin-search-form"),input=$("coin-search-input"),status=$("search-status"),results=$("search-results"),button=$("coin-search-btn");
 if(!form||!input||!results)return;
 let requestNo=0,activeQuery="";
 const esc=v=>String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 const money=v=>v==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:v>=1?2:8}).format(v);
 const number=v=>v==null?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
 const pct=v=>v==null?"—":(Number(v)>0?"+":"")+Number(v).toFixed(2)+"%";
 const row=(label,value)=>'<div class="coin-fact"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';
 async function search(q){
   const data=await api("/api/search?q="+encodeURIComponent(q));
   return data.results||[];
 }
 function showMatches(matches,q,request){
   results.innerHTML="";
   if(!matches.length){status.textContent="نتیجه‌ای پیدا نشد. املای نام یا نماد را تغییر بده؛ ممکن است کوین در منبع عمومی موجود نباشد.";return;}
   status.textContent=matches.length+" نتیجه از جست‌وجوی عمومی CoinGecko. برای دیدن وضعیت، یکی را انتخاب کن.";
   const list=document.createElement("div");list.className="coin-search-results";
   for(const coin of matches){
     const b=document.createElement("button");b.type="button";b.className="coin-search-result";
     b.innerHTML='<span class="search-coin-main"><b>'+esc(coin.name)+'</b><small>'+esc(coin.symbol)+' · '+esc(coin.id)+'</small></span><span class="search-coin-rank">'+(coin.marketCapRank?'رتبه بازار #'+esc(coin.marketCapRank):'رتبه نامشخص')+'</span>';
     b.addEventListener("click",()=>analyze(coin,request));list.appendChild(b);
   }
   results.appendChild(list);
 }
 form.addEventListener("submit",async e=>{
   e.preventDefault();const q=input.value.trim();if(!q)return;
   const req=++requestNo;activeQuery=q;button.disabled=true;button.textContent="در حال جست‌وجو…";status.textContent="در حال جست‌وجو در منبع رایگان…";results.innerHTML="";
   try{showMatches(await search(q),q,req);}catch(err){if(req===requestNo)status.textContent="جست‌وجو ناموفق بود: "+(err.message||"منبع موقتاً در دسترس نیست")+"؛ محدودیت درخواست CoinGecko یا اتصال Worker را بررسی کن.";}
   finally{if(req===requestNo){button.disabled=false;button.textContent="تحلیل کوین";}}
 });
 async function analyze(coin,request){
   if(request!==requestNo)return;
   results.innerHTML="";status.textContent="در حال دریافت داده‌های رایگان برای "+coin.name+"…";
   const wait=document.createElement("p");wait.className="hint";wait.textContent="قیمت و عرضه، داده‌های بازار، اخبار و در صورت وجود کندل‌های بایننس در حال دریافت است.";results.appendChild(wait);
   try{
     const [overview,marketsResp,newsResp,protocolResp]=await Promise.all([
       api("/api/coin?id="+encodeURIComponent(coin.id)),
       api("/api/market?limit=1000"),
       api("/api/news").catch(()=>({news:[],failedSources:["منبع خبر در دسترس نیست"]})),
       api("/api/protocols").catch(()=>({protocols:[]}))
     ]);
     if(request!==requestNo)return;
     results.innerHTML="";
     const facts=document.createElement("section");facts.className="coin-overview";
     const fields=[
       ["قیمت فعلی",money(overview.price)],["رتبه ارزش بازار",overview.marketCapRank==null?"نامشخص":"#"+overview.marketCapRank],
       ["ارزش بازار",money(overview.marketCap)],["ارزش رقیق‌شده (FDV)",money(overview.fullyDilutedValuation)],
       ["حجم معاملات ۲۴ساعته",money(overview.totalVolume24h)],["تغییر ۲۴ساعته",pct(overview.change24h)],
       ["تغییر ۷روزه",pct(overview.change7d)],["تغییر ۳۰روزه",pct(overview.change30d)],
       ["عرضه در گردش",number(overview.circulatingSupply)],["کل عرضه",number(overview.totalSupply)],
       ["حداکثر عرضه",number(overview.maxSupply)],["فاصله از سقف تاریخی",pct(overview.athChangePercentage)]
     ];
     facts.innerHTML='<div class="coin-overview-head"><div><h3>'+esc(overview.name||coin.name)+' ('+esc(overview.symbol||coin.symbol)+')</h3><p class="hint">منبع: CoinGecko عمومی · آخرین بروزرسانی داده: '+esc(overview.lastUpdated||overview.updatedAt||"نامشخص")+'</p></div><a href="https://www.coingecko.com/en/coins/'+encodeURIComponent(coin.id)+'" target="_blank" rel="noopener">صفحه منبع ↗</a></div><div class="coin-facts">'+fields.map(f=>row(f[0],f[1])).join("")+'</div><p class="hint">این اعداد داده‌های بازار و عرضه‌اند؛ به‌تنهایی ارزان یا گران‌بودن توکن را ثابت نمی‌کنند. اطلاعات عرضه/FDV را با زمان آزادسازی توکن‌ها و ارزش‌گذاری رقبا مقایسه کن.</p>';
     results.appendChild(facts);
     const markets=marketsResp.markets||[];
     const symbol=String(coin.symbol||"").toUpperCase();
     const pair=markets.find(m=>String(m.base||"").toUpperCase()===symbol&&m.quote==="USDT");
     const news=newsResp.news||[];
     const nameLower=String(coin.name||"").toLowerCase(),symLower=symbol.toLowerCase();
     const relevant=news.filter(n=>{
       const title=(n.title||"").toLowerCase(),summary=(n.summary||"").toLowerCase();
       const nameMatch=nameLower.length>=4&&(title.includes(nameLower)||summary.includes(nameLower));
       const escaped=symLower.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
       const symbolMatch=symLower.length>=3&&new RegExp("(^|[^a-z0-9])"+escaped+"([^a-z0-9]|$)","i").test(title+" "+summary);
       return nameMatch||symbolMatch;
     }).slice(0,8);
     const newsBox=document.createElement("section");newsBox.className="coin-overview";
     newsBox.innerHTML='<h3>📰 اخبار مرتبط از منابع رایگان</h3>'+(relevant.length?'<div class="news-list">'+relevant.map(n=>'<a class="news-item" href="'+esc(/^https?:\/\//i.test(n.link||"")?n.link:"#")+'" target="_blank" rel="noopener"><span class="news-source">['+esc(n.source)+']</span> '+esc(n.title)+'<small>'+esc(n.published||"تاریخ نامشخص")+'</small></a>').join("")+'</div>':'<p class="hint">خبر مرتبط قابل‌تأییدی در فیدهای در دسترس پیدا نشد؛ این به معنی نبود خبر نیست.</p>')+'<p class="hint">خبر با تطبیق نام/نماد پیدا می‌شود؛ نمادهای کوتاه ممکن است برخورد اشتباه داشته باشند. تیتر خبر به‌تنهایی سیگنال خریدوفروش نیست.</p>';
     results.appendChild(newsBox);
     const protocol=(protocolResp.protocols||[]).filter(p=>String(p.symbol||"").toUpperCase()===symbol);
     const fundBox=document.createElement("section");fundBox.className="coin-overview";
     fundBox.innerHTML='<h3>🏛 بررسی بنیادی با منابع رایگان</h3><div class="coin-facts">'+row("داده عرضه و ارزش‌گذاری",overview.available?"موجود · CoinGecko":"موجود نیست")+row("تطبیق پروتکل DeFiLlama",protocol.length===1?protocol[0].name:protocol.length>1?"نماد مبهم؛ تطبیق انجام نشد":"تطبیق معتبر پیدا نشد")+row("TVL پروتکل",protocol.length===1?money(protocol[0].tvl):"—")+row("تغییر TVL هفتگی",protocol.length===1?pct(protocol[0].change7d):"—")+'</div><p class="hint">امتیاز بنیادی ساخته نمی‌شود مگر داده‌های معتبر کافی وجود داشته باشد. این بررسی رایگان فعلاً اطلاعات بازار/عرضه، اخبار و در صورت تطبیق یکتای نماد، TVL را نشان می‌دهد؛ داده کامل آزادسازی توکن، درآمد پروتکل، فعالیت توسعه‌دهندگان و امنیت هنوز برای همه پروژه‌ها فراهم نیست.</p>';
     if(protocol.length===1&&protocol[0].url){const a=document.createElement("a");a.className="news-item";a.href=/^https?:\/\//i.test(protocol[0].url)?protocol[0].url:"#";a.target="_blank";a.rel="noopener";a.textContent="مشاهده منبع پروتکل در DeFiLlama";fundBox.appendChild(a);}
     results.appendChild(fundBox);
     if(!pair){
       const note=document.createElement("section");note.className="coin-overview";note.innerHTML='<h3>📈 تحلیل تکنیکال</h3><p class="hint">برای این کوین جفت USDT در فهرست بازار اسپات بایننس پیدا نشد. قیمت و عرضه از CoinGecko نمایش داده شد، اما تکنیکال بایننس و داده مشتقات را حدس نمی‌زنیم. ممکن است جفت دیگری یا منبع رایگان دیگری لازم باشد.</p>';results.appendChild(note);
       status.textContent="تحلیل اطلاعات بازار و بنیادی رایگان تکمیل شد؛ تکنیکال برای این جفت در دسترس نیست.";return;
     }
     status.textContent="در حال محاسبه تکنیکال چندبازه‌ای برای "+pair.symbol+"…";
     let daily,weekly,monthly,deriv=null;
     try{
       [daily,weekly,monthly,deriv]=await Promise.all([
         api("/api/candles?symbol="+encodeURIComponent(pair.symbol)+"&interval=1d&limit=365"),
         api("/api/candles?symbol="+encodeURIComponent(pair.symbol)+"&interval=1w&limit=260"),
         api("/api/candles?symbol="+encodeURIComponent(pair.symbol)+"&interval=1M&limit=120"),
         api("/api/derivatives?symbol="+encodeURIComponent(pair.symbol)).catch(()=>null)
       ]);
     }catch(err){
       const note=document.createElement("p");note.className="hint";note.textContent="کندل‌های تکنیکال از بایننس در دسترس نشدند: "+err.message;results.appendChild(note);status.textContent="اطلاعات رایگان بازار/بنیادی نمایش داده شد؛ تکنیکال در دسترس نیست.";return;
     }
     const candles=x=>(x.candles||[]).map(k=>({time:k.time,open:k.open,high:k.high,low:k.low,close:k.close,volume:k.volume}));
     const d=candles(daily),w=candles(weekly),m=candles(monthly),tech=multi(d,w,m);
     const matchedNews=relevant.map(n=>({...n,summary:n.summary||""}));
     let ns=50;for(const n of matchedNews){if(/hack|exploit|lawsuit|delist|fraud|breach|outage|investigation/i.test(n.title))ns-=9;else if(/launch|upgrade|partnership|adoption|revenue|mainnet|funding|approval|integration/i.test(n.title))ns+=4;}
     ns=Math.max(0,Math.min(100,ns));
     const ds=scoreDerivatives(deriv,overview.change24h||pair.change24h),hasDeriv=Boolean(deriv&&deriv.available),ts=tech.score==null?null:tech.score;
     const combined=ts==null?null:Math.round((ts*(hasDeriv ? .60 : .70)+ns*(hasDeriv ? .20 : .30)+(hasDeriv?ds.score*.20:0))*10)/10;
     const data={symbol:overview.symbol||symbol,name:overview.name||coin.name,marketSymbol:pair.symbol,current_price:overview.price||pair.price,change24h:overview.change24h==null?pair.change24h:overview.change24h,combined_signal:combined==null?0:combined,verdict:tech.conflict?"تضاد تایم‌فریم؛ احتیاط":combined==null?"داده ناکافی":combined>=70?"بررسی اولویت‌دار":combined>=55?"تحت مراقبت":"اولویت پایین",watch_status:"جست‌وجو",breakdown:{technical:{score:ts==null?0:ts,multi:tech,signals:Object.values(tech.frames).filter(f=>f.available).flatMap(f=>f.signals||[])},fundamental:{score:null,sectors:[],protocol:protocol.length===1?{name:protocol[0].name,tvl:protocol[0].tvl,change1d:protocol[0].change1d,change7d:protocol[0].change7d,url:protocol[0].url}:null},news:{score:ns,news_count:relevant.length,top_titles:relevant.slice(0,3).map(n=>({title:n.title,source:n.source,link:n.link}))},derivatives:{score:hasDeriv?ds.score:null,available:hasDeriv,source:deriv?.source||"Binance Futures",openInterestChange24hPct:deriv?.openInterestChange24hPct??null,fundingRate:deriv?.fundingRate??null,globalLongShortRatio:deriv?.globalLongShortRatio??null,takerBuySellRatio:deriv?.takerBuySellRatio??null,signals:ds.signals}},data_quality:{dailyCandles:d.length,weeklyCandles:w.length,monthlyCandles:m.length}};
     const technicalHeading=document.createElement("h3");technicalHeading.textContent="📈 تحلیل تکنیکال چندبازه‌ای · "+pair.symbol;results.appendChild(technicalHeading);
     if(ts==null){const note=document.createElement("p");note.className="hint";note.textContent="برای امتیازدهی تکنیکال، تاریخچهٔ کافی دریافت نشد.";results.appendChild(note);}else renderCard(data,"search-results");
     status.textContent="تحلیل کوین تکمیل شد. منبع داده‌ها رایگان است؛ امتیاز بنیادی عمداً داده‌محور و بدون حدس باقی مانده است.";
   }catch(err){if(request===requestNo){results.innerHTML="";status.textContent="تحلیل کوین ناموفق بود: "+(err.message||"منبع موقتاً در دسترس نیست")+"؛ اتصال Worker و محدودیت منابع رایگان را بررسی کن.";}}
 }
})();