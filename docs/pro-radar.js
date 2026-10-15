/* Multi-timeframe market scanner for Crypto Radar. */
const API_KEY = "cryptoRadarApiBase";
function apiBase(){return(localStorage.getItem(API_KEY)||"").trim().replace(/\/$/,"");}
function saveApiBase(v){v=(v||"").trim().replace(/\/$/,"");if(v)localStorage.setItem(API_KEY,v);else localStorage.removeItem(API_KEY);}
async function api(path){if(!apiBase())throw Error("آدرس Worker کلادفلر را در تنظیمات وارد کن.");const r=await fetch(apiBase()+path);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||("HTTP "+r.status));return d;}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function ema(a,p){if(a.length<p)return null;let v=mean(a.slice(0,p)),k=2/(p+1);for(let i=p;i<a.length;i++)v=a[i]*k+v*(1-k);return v;}
function atr(c,p=14){if(c.length<p+1)return null;let t=[];for(let i=1;i<c.length;i++)t.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)));return mean(t.slice(-p));}
function aggregate(c,unit){let m=new Map();for(const x of c){let d=new Date(x.time),k;if(unit==="weekly"){let z=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));z.setUTCDate(z.getUTCDate()-(z.getUTCDay()+6)%7);k=z.getTime();}else k=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);let v=m.get(k);if(!v)m.set(k,{time:k,open:x.open,high:x.high,low:x.low,close:x.close,volume:x.volume});else{v.high=Math.max(v.high,x.high);v.low=Math.min(v.low,x.low);v.close=x.close;v.volume+=x.volume;}}return [...m.values()].sort((a,b)=>a.time-b.time);}
function levels(c,p){let hi=[],lo=[];for(let i=3;i<c.length-3;i++){let w=c.slice(i-3,i+4);if(c[i].high===Math.max(...w.map(x=>x.high)))hi.push(c[i].high);if(c[i].low===Math.min(...w.map(x=>x.low)))lo.push(c[i].low);}let tol=Math.max((atr(c)||p*.01)*.45,p*.002);function cl(a){let g=[];for(let x of a.sort((a,b)=>a-b)){let z=g.at(-1);if(z&&Math.abs(x-mean(z))<=tol)z.push(x);else g.push([x]);}return g.map(mean);}return{support:cl(lo).filter(x=>x<p).sort((a,b)=>p-a-(p-b)).slice(0,3),resistance:cl(hi).filter(x=>x>p).sort((a,b)=>a-b).slice(0,3)};}
function frame(c,name){let a=c.map(x=>x.close);if(c.length<60)return{name,available:false,score:null,signals:[]};let p=a.at(-1),e20=ema(a,20),e50=ema(a,50),e200=ema(a,200),s=50,signals=[];if(e20&&e50){if(p>e20&&e20>e50){s+=15;signals.push("روند کوتاه‌مدت صعودی");}else if(p<e20&&e20<e50){s-=15;signals.push("روند کوتاه‌مدت نزولی");}else s+=p>e20?5:-5;}if(e200)s+=p>e200?10:-10;let prev=c.slice(-21,-1),h=Math.max(...prev.map(x=>x.high)),l=Math.min(...prev.map(x=>x.low)),bo="none";if(p>h){s+=12;bo="up";signals.push("شکست سقف ۲۰ کندل");}else if(p<l){s-=12;bo="down";signals.push("شکست کف ۲۰ کندل");}let bv=mean(prev.map(x=>x.volume)),rv=bv?c.at(-1).volume/bv:null;if(bo!=="none"&&rv>=1.5){s+=bo==="up"?8:-8;signals.push("شکست با حجم بالا");}let av=atr(c);return{name,available:true,score:Math.max(0,Math.min(100,s)),price:p,atr:av,atrPct:av?av/p*100:null,relativeVolume:rv,breakout:bo,levels:levels(c,p),signals};}
function multi(c,weekly,monthly){let f={monthly:frame(monthly,"ماهانه"),weekly:frame(weekly,"هفتگی"),daily:frame(c,"روزانه")},w={monthly:.4,weekly:.35,daily:.25},sum=0,den=0;for(let k in w)if(f[k].available){sum+=f[k].score*w[k];den+=w[k];}let ss=Object.values(f).filter(x=>x.available).map(x=>x.score);return{score:den?Math.round(sum/den*10)/10:null,frames:f,conflict:ss.length>1&&Math.max(...ss)-Math.min(...ss)>=35};}
const sectorRules=[["AI",/artificial intelligence|ai agent|machine learning|gpu|bittensor|fetch\.ai/i],["DeFi",/defi|decentralized finance|lending|staking|uniswap|aave/i],["Energy / DePIN",/energy|renewable|solar|depin|helium/i],["Cybersecurity / Privacy",/cybersecurity|privacy|zero knowledge|security/i],["Storage / Data",/storage|filecoin|arweave|data availability/i],["Health",/health|medical|biotech/i],["Gaming",/gaming|gamefi|play to earn|immutable/i],["RWA",/real world asset|tokenized treasury|tokenization/i],["Aerospace / Defense",/aerospace|satellite|defense|military/i]];
function newsScore(items,coin){let text=coin.base+" "+coin.symbol,matched=items.filter(n=>(n.title+" "+n.summary).toLowerCase().includes(text.toLowerCase()));let s=50;for(let n of matched.slice(0,15)){if(/hack|exploit|lawsuit|delist|fraud|breach|outage/i.test(n.title))s-=10;else if(/launch|upgrade|partnership|adoption|revenue|mainnet|funding|approval/i.test(n.title))s+=5;}return{score:Math.max(0,Math.min(100,s)),matches:matched.slice(0,4),count:matched.length};}
async function pool(a,n,fn){let out=Array(a.length),next=0;await Promise.all(Array.from({length:Math.min(n,a.length)},async()=>{while(true){let i=next++;if(i>=a.length)return;try{out[i]=await fn(a[i],i);}catch(e){out[i]={error:e.message};}}}));return out;}
function scoreDerivatives(d, priceChange){
 if(!d||!d.available)return {score:null,signals:["داده مشتقات در دسترس نیست"]};
 let score=50,signals=[];
 const oi=Number(d.openInterestChange24hPct),fund=Number(d.fundingRate),ls=Number(d.globalLongShortRatio);
 if(Number.isFinite(oi)){if(oi>5){signals.push("رشد OI بیش از ۵٪؛ افزایش اهرم/مشارکت");if(priceChange>0)score+=5;else if(priceChange<0)score-=5;}else if(oi< -5)signals.push("افت OI بیش از ۵٪؛ کاهش موقعیت‌های باز");}
 if(Number.isFinite(fund)){if(fund>=0.0005){score-=8;signals.push("فاندینگ بسیار مثبت؛ ریسک ازدحام لانگ");}else if(fund<=-0.0005){score+=4;signals.push("فاندینگ بسیار منفی؛ احتمال ازدحام شورت");}else signals.push("فاندینگ نزدیک محدوده خنثی");}
 if(Number.isFinite(ls)){if(ls>=1.5){score-=5;signals.push("غلبه محسوس حساب‌های لانگ؛ ریسک شلوغی");}else if(ls<=0.67){score+=3;signals.push("غلبه حساب‌های شورت؛ امکان فشار خرید در صورت تأیید");}}
 return {score:Math.max(0,Math.min(100,score)),signals};
}
async function loadAllSignals(){
 let [md,nd]=await Promise.all([api("/api/market?limit=250"),api("/api/news")]);
 let news=nd.news||[],markets=(md.markets||[]).slice(0,30);
 let out=await pool(markets,3,async (coin,index)=>{
  const sym=encodeURIComponent(coin.symbol);
  const [d1,w1,m1,deriv]=await Promise.all([
   api("/api/candles?symbol="+sym+"&interval=1d&limit=365"),
   api("/api/candles?symbol="+sym+"&interval=1w&limit=260"),
   api("/api/candles?symbol="+sym+"&interval=1M&limit=120")
  ]);
  const map=x=>(x.candles||[]).map(c=>({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume}));
  const daily=map(d1),weekly=map(w1),monthly=map(m1),t=multi(daily,weekly,monthly),n=newsScore(news,coin);
  const txt=(coin.base+" "+n.matches.map(x=>x.title+" "+x.summary).join(" ")).toLowerCase();
  const sectors=sectorRules.filter(x=>x[1].test(txt)).map(x=>x[0]),fs=Math.min(100,25+sectors.length*10),ts=t.score||0;
  const ds=scoreDerivatives(deriv,coin.change24h),hasDeriv=ds.score!==null;\n  const combined=Math.round((ts*(hasDeriv ? .50 : .55)+fs*.15+n.score*(hasDeriv ? .25 : .30)+(hasDeriv?ds.score*.10:0))*10)/10;
  return {symbol:coin.base,name:coin.base,marketSymbol:coin.symbol,current_price:coin.price,change24h:coin.change24h,volume24h:coin.quoteVolume24h,combined_signal:combined,verdict:t.conflict?"تضاد تایم‌فریم؛ احتیاط":combined>=70?"بررسی اولویت‌دار":combined>=55?"تحت مراقبت":"اولویت پایین",
   breakdown:{technical:{score:ts,signals:Object.entries(t.frames).filter(x=>x[1].available).flatMap(x=>[x[0]+": "+x[1].score,...x[1].signals.slice(0,2)]),multi:t},
   fundamental:{score:fs,sectors,signals:["امتیاز حوزه مقدماتی است و جایگزین بررسی توکنومیک و صورت‌های مالی نیست."]},
   news:{score:n.score,sources_count:new Set(n.matches.map(x=>x.source)).size,news_count:n.count,top_titles:n.matches.map(x=>({title:x.title,source:x.source,link:x.link}))},\n   derivatives:{score:ds.score,source:deriv?.source||"Binance public futures",available:Boolean(deriv?.available),openInterestUsdApprox:deriv?.openInterestUsdApprox??null,openInterestChange24hPct:deriv?.openInterestChange24hPct??null,fundingRate:deriv?.fundingRate??null,globalLongShortRatio:deriv?.globalLongShortRatio??null,longAccountPct:deriv?.longAccountPct??null,takerBuySellRatio:deriv?.takerBuySellRatio??null,signals:ds.signals,errors:deriv?.errors||[],note:deriv?.note||"داده مشتقات فقط برای ۱۵ بازار اول از نظر حجم بررسی می‌شود."}},
   data_quality:{dailyCandles:daily.length,weeklyCandles:weekly.length,monthlyCandles:monthly.length,market_updated:md.updatedAt,news_updated:nd.updatedAt}};
 });
 let valid=out.filter(x=>x&&!x.error&&x.current_price>0).sort((a,b)=>b.combined_signal-a.combined_signal);
 if(!valid.length)throw Error("هیچ دارایی با داده معتبر تحلیل نشد.");
 return valid.map((x,i)=>({...x,rank:i+1,watch_status:i<5?"اصلی":i<10?"مراقبت":"اسکن‌شده"}));
}
