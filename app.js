import {StockChart, movingAverage, visibleBars} from './chart.js';
export {movingAverage, visibleBars};

export function percentage(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) && previous > 0
    ? (current - previous) / previous * 100 : null;
}

export function normalizeStatus(value) {
  return value === 'pass' || value === 'fail' || value === 'unknown' ? value : 'unknown';
}

export function routeCandidates(stocks, route) {
  const rows = Array.isArray(stocks) ? stocks : [];
  if (route === 'market') return rows;
  if (route === 'all' || route === 'candidates') return rows.filter(stock=>['mge','sfz'].some(lane=>normalizeStatus(stock?.routes?.[lane]?.status)==='pass'));
  return rows.filter(stock => normalizeStatus(stock?.routes?.[route]?.status) === 'pass');
}

export function filterStocks(stocks, query = '', route = 'all') {
  const needle = String(query).trim().toLocaleLowerCase('zh-TW');
  return routeCandidates(stocks, route).filter(stock => !needle || `${stock?.id || ''} ${stock?.name || ''}`.toLocaleLowerCase('zh-TW').includes(needle));
}

export function manualReviewKey(stockId, schemaVersion, dataDate, routeVersions = {}, origin = '') {
  const version = [schemaVersion,routeVersions.mge,routeVersions.mge_as_of,routeVersions.sfz,routeVersions.sfz_as_of].map(value=>value||'unknown').join('|');
  return ['mge-sfz-review',origin || 'unknown-origin',stockId || 'unknown-stock',version,dataDate || 'unknown-date'].map(encodeURIComponent).join(':');
}

export class ReviewSaveQueue {
  constructor(storage,setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id),onError=()=>{}){this.storage=storage;this.setTimer=setTimer;this.clearTimer=clearTimer;this.onError=onError;this.timer=null;this.pending=null;}
  schedule(snapshot,onSaved,delay=250){this.cancel();this.pending={snapshot,onSaved};this.timer=this.setTimer(()=>this.flush(),delay);}
  flush(){if(!this.pending)return null;if(this.timer!==null)this.clearTimer(this.timer);const {snapshot,onSaved}=this.pending;this.pending=null;this.timer=null;try{this.storage.setItem(snapshot.key,JSON.stringify(snapshot.value));onSaved?.(snapshot.value);}catch(error){this.onError(error);}return snapshot.value;}
  cancel(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.pending=null;}
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear(), month = String(date.getMonth()+1).padStart(2,'0'), day = String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export async function sha256Hex(buffer, cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.subtle) return null;
  const digest = await cryptoObject.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const STATUS_TEXT = {pass:'符合',fail:'不符合',unknown:'未知'};
const REVIEW_TEXT = {pending:'待核對',confirmed:'已確認',watching:'持續觀察',excluded:'排除'};
const UNIT_TEXT = {lots:'張',percent:'%',people:'人',TWD:'元',price:'元',raw_shares:'股'};
const SOURCE_TEXT = {official_adjusted_manifest:'還原價來源清單',official_stock_roster:'上市櫃股票名冊',sfz_vendored_engine:'SFZ 教材初篩引擎',official_workspace_research:'官方行情與籌碼彙整',official_workspace_institutional:'三大法人每日買賣超',legacy_public_evidence_index:'歷史公開證據索引',mge_xq_export:'M哥 XQ 歷史匯出'};
const VALUE_TEXT = {ma5:'MA5',ma20:'MA20',ma21:'MA21',ma34:'MA34',ma89:'MA89',ma120_change:'MA120 變化',ma240_change:'MA240 變化',day:'當日成交量',close:'收盤價',threshold:'門檻',value_shares:'五日合計',value_lots:'五日合計',threshold_lots:'門檻',average_gain_pct:'八週平均漲幅',threshold_pct:'門檻',ma34_change_one_bar:'MA34 單日變化',formula_provenance:'公式依據'};
const $ = id => document.getElementById(id);
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString('zh-TW',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '—';
const signed = (value, digits = 2) => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${fmt(value,digits)}` : '—';
function availability(value) {
  const exact={
    historical_xq_verified:{className:'pass',text:'歷史 XQ 匯出已核對'},
    xq_import_unverified:{className:'unknown',text:'XQ 匯入未獨立驗證'},
    verified_historical_xq_export:{className:'pass',text:'歷史 XQ 匯出已核對'},
    imported_not_independently_verified:{className:'unknown',text:'已匯入，未獨立驗證'},
    computed:{className:'pass',text:'已計算'},
    computed_with_partial_prices:{className:'unknown',text:'已計算，部分個股待驗證'},
    regular_ohlc_gap:{className:'unknown',text:'官方日K有缺漏'},
  };
  if (exact[value]) return exact[value];
  if (['ok','complete','available','ready','pass'].includes(value)) return {className:'pass',text:'可用'};
  if (['error','missing','unavailable','fail'].includes(value)) return {className:'fail',text:'不可用'};
  if (['partial','stale','data_limited'].includes(value)) return {className:'unknown',text:'部分可用'};
  return {className:'unknown',text:'未知'};
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function clear(target) { target.replaceChildren(); return target; }
function appendText(target, tag, text, className = '') { const child=node(tag,className,text); target.append(child); return child; }
function safeHttpUrl(value) {
  try { const url = new URL(String(value)); return ['http:','https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function statusBadge(status, extra = '') {
  const safe = normalizeStatus(status), badge = node('span',`badge ${safe}`,extra || STATUS_TEXT[safe]);
  badge.dataset.status = safe; return badge;
}
function formatDate(date) { return date || '日期未知'; }
function routeLabel(route) { return route === 'mge' ? 'M哥' : 'SFZ'; }
function priceBasisText(basis) {
  if (!basis || typeof basis !== 'object') return '價格基準未知';
  const raw = basis.label || basis.chart || basis.mode || basis.basis || basis.type || basis.price_basis;
  const labels={raw:'未還原價格',unadjusted:'未還原價格',adjusted:'還原價格',back_adjusted:'後還原價格',reference_ratio_back_adjusted_mixed_sources_v1:'跨來源參考比率後還原',back_adjusted_price_and_raw_share_volume:'後還原價格／原始股數量'};
  const kind = labels[raw] || raw || '價格基準未說明';
  const adjustment = basis.adjusted === true ? '已還原' : basis.adjusted === false ? '未還原' : '';
  const verified = basis.verified === true ? '基準已核對' : basis.verified === false ? '基準未核對' : '';
  return [...new Set([kind,adjustment,verified].filter(Boolean))].join(' · ');
}
function resolvedSource(value) {
  if (value && typeof value === 'object') return value;
  const alias=String(value||'').startsWith('sfz-engine:')?'sfz_vendored_engine':String(value||'').startsWith('xs-sha256:')?'mge_xq_export':value;
  return (catalog?.sources || []).find(source=>[source?.id,source?.reference_id,source?.name].includes(alias)) || null;
}
function resolveSourceLabel(value) {
  const match=resolvedSource(value), id=match?.id || (typeof value==='string'?value:'');
  return SOURCE_TEXT[id] || match?.label || match?.name || match?.title || match?.kind || (id.startsWith('xs-sha256:')?'M哥 XQ 歷史匯出':id.startsWith('sfz-engine:')?'SFZ 教材初篩引擎':id||'來源未提供');
}
function formatUnit(unit){return UNIT_TEXT[unit]||unit||'';}
export function formatCheckValue(value,unit='') {
  if(value==null)return '未知';
  if(typeof value==='boolean')return value?'是':'否';
  if(Number.isFinite(value))return `${fmt(value,4)}${formatUnit(unit)?` ${formatUnit(unit)}`:''}`;
  if(typeof value!=='object')return String(value);
  return Object.entries(value).slice(0,8).map(([key,item])=>{
    const label=VALUE_TEXT[key]||key.replaceAll('_',' ');
    if(item==null)return `${label}：未知`;
    if(typeof item==='boolean')return `${label}：${item?'是':'否'}`;
    if(!Number.isFinite(item))return `${label}：${key==='formula_provenance'?'工程詮釋':String(item)}`;
    const itemUnit=key.endsWith('_pct')?'%':key.endsWith('_shares')?'股':key.endsWith('_lots')||unit==='lots'?'張':['close','threshold','ma5','ma20','ma21','ma34','ma89','ma120_change','ma240_change','ma34_change_one_bar'].includes(key)?'元':formatUnit(unit);
    return `${label}：${fmt(item,4)}${itemUnit?` ${itemUnit}`:''}`;
  }).join('；');
}
function describeCoverage(coverage, stockCount) {
  if (!coverage || typeof coverage !== 'object') return {value:`${stockCount} 檔`,detail:'涵蓋狀態未提供'};
  const roster=coverage.roster ?? coverage.total ?? coverage.requested ?? coverage.universe_count ?? stockCount;
  const details=coverage.details ?? coverage.available ?? coverage.stock_count ?? coverage.available_stocks;
  const price=coverage.price || {};
  const priceUnknown=['regular_ohlc_gap','stale','missing','rejected'].reduce((sum,key)=>sum+(price[key]||0),0);
  const indicatorUnknown=coverage.sfz?.unknown==null?null:Math.max(0,coverage.sfz.unknown-priceUnknown);
  const detail=[details!=null?`詳情 ${details}`:null,coverage.full_history_details!=null?`完整歷史圖 ${coverage.full_history_details}`:null,price.current!=null?`最新且無已知價格缺口 ${price.current}`:null,price.regular_ohlc_gap?`價格已到參考日，但歷史OHLC缺值 ${price.regular_ohlc_gap}`:null,price.stale?`價格日期落後 ${price.stale}`:null,price.missing?`無通過驗證的歷史 ${price.missing}`:null,price.rejected?`輸入驗證拒收 ${price.rejected}`:null,indicatorUnknown?`價格可用但指標未定 ${indicatorUnknown}`:null,coverage.sfz?.unknown!=null?`SFZ未知合計 ${coverage.sfz.unknown}`:null].filter(Boolean).join(' · ')||'以 catalog 股票清單為準';
  return {value:`${roster} 檔`,detail};
}

let catalog = null, selectedRow = null, detail = null, activeRoute = 'candidates', detailCache = new Map(), reviewQueue = null, selectionRequestId = 0;
let chart = null;

async function fetchJsonWithHash(path, expectedHash) {
  const url = new URL(path,location.href);
  if (url.origin !== location.origin) throw new Error('個股資料網址不是同源相對路徑。');
  const response = await fetch(url,{cache:'no-store'});
  if (!response.ok) throw new Error(`讀取個股資料失敗（HTTP ${response.status}）`);
  const buffer = await response.arrayBuffer();
  let verification = '未提供雜湊';
  if (expectedHash) {
    const actual = await sha256Hex(buffer);
    if (actual === null) verification = '此瀏覽器不支援 WebCrypto，資料未驗證';
    else {
      const expected = String(expectedHash).toLowerCase().replace(/^sha256:/,'');
      if (actual !== expected) throw new Error('個股資料雜湊不符，可能混用了不同版本的資料封包。');
      verification = 'SHA-256 已驗證';
    }
  }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new Error('個股資料不是有效 JSON。'); }
  return {data:parsed,verification};
}

function validateCatalog(value) {
  if (value?.schema_version !== 'mge-sfz-integration-1') throw new Error('catalog schema_version 不相容。');
  if (!Array.isArray(value.stocks)) throw new Error('catalog 缺少 stocks 清單。');
  if (!value.routes?.mge || !value.routes?.sfz) throw new Error('catalog 缺少 M哥或 SFZ 路線資訊。');
  return value;
}
function validateDetail(value, expectedId) {
  if (String(value?.id) !== String(expectedId)) throw new Error('個股資料代號與 catalog 不一致。');
  if (!value?.candles || !['day','week','month'].every(frame => Array.isArray(value.candles[frame]))) throw new Error('個股 K 線欄位不完整。');
  if (!value?.routes?.mge || !value?.routes?.sfz || !value?.checks) throw new Error('個股路線或條件欄位不完整。');
  return value;
}

function renderHeader() {
  const refresh=catalog.refresh;
  $('refresh-status').textContent=refresh ? refresh.status === 'blocked' ? `更新受阻 · 目前 SFZ 仍截至 ${formatDate(refresh.source_as_of)} · 檢查時間 ${refresh.attempted_at || '未知'}。${refresh.note}` : `SFZ 官方行情截至 ${formatDate(refresh.source_as_of)} · 取得時間 ${refresh.retrieved_at || '未知'} · ${refresh.status === 'complete' || refresh.status === 'current' ? '來源刷新完成' : '部分資料可用'}。${refresh.note}` : '此版本尚無每日更新紀錄；名單依下方各路資料日呈現。';
  const historical = catalog.reference_date && catalog.reference_date !== localDateString();
  $('snapshot-label').textContent = historical ? '歷史資料快照' : '當日資料快照';
  $('snapshot-time').textContent = catalog.generated_at ? `產生時間 ${new Date(catalog.generated_at).toLocaleString('zh-TW',{hour12:false})}` : '產生時間未知';
  $('snapshot-reference').textContent = `${historical ? '歷史資料' : '資料'} · 參考日 ${formatDate(catalog.reference_date)} · 非即時報價`;
  for (const route of ['mge','sfz']) {
    const meta = catalog.routes[route] || {}, actual = routeCandidates(catalog.stocks,route).length;
    const health = availability(meta.status);
    const statusTarget = $(`${route}-status`); statusTarget.textContent = health.text; statusTarget.className = `badge ${health.className}`;
    $(`${route}-count`).textContent = `${actual} 檔`;
    $(`${route}-meta`).textContent = `${formatDate(meta.as_of)} · ${meta.rule_version || '版本未知'}`;
    const mismatch = Number.isFinite(meta.count) && meta.count !== actual ? `宣告 ${meta.count} 檔，catalog 實際 ${actual} 檔。` : '';
    $(`${route}-note`).textContent = [meta.note,mismatch].filter(Boolean).join(' ') || '未提供路線備註。';
  }
  const coverage = describeCoverage(catalog.coverage,catalog.stocks.length);
  $('coverage-value').textContent=coverage.value; $('coverage-detail').textContent=coverage.detail;
  const market = catalog.market || {}, marketHealth = availability(market.status);
  $('market-summary').textContent = `${marketHealth.text} · ${formatDate(market.as_of || market.date)}`;
  const marketContent = clear($('market-content'));
  const marketFields = [
    [['as_of','date'],'資料日',value=>String(value)],
    [['name','index_name'],'指數',value=>String(value)],
    [['close','index_close'],'收盤',value=>fmt(value)],
    [['change_points','change'],'漲跌點',value=>signed(value)],
    [['change_pct'],'漲跌幅',value=>`${signed(value)}%`],
    [['turnover_twd','turnover'],'成交金額',value=>Number.isFinite(value)?`${fmt(value/1e8,0)} 億元`:'未知'],
  ];
  const marketRows = marketFields.flatMap(([keys,label,format])=>{const key=keys.find(candidate=>market[candidate]!=null);return key?[{label,value:format(market[key])}]:[];});
  if (!marketRows.length) appendText(marketContent,'p','大盤資料未知。','muted');
  else for (const item of marketRows) { const row=node('div','market-row'); appendText(row,'span',item.label); appendText(row,'b',item.value); marketContent.append(row); }
  if (marketHealth.className === 'unknown') $('market-details').open = false;
  $('catalog-limit').textContent = catalog.limitations?.[0] || '未提供全站限制說明。';
}

function renderStockList() {
  const rows = filterStocks(catalog.stocks,$('stock-search').value,activeRoute);
  $('result-count').textContent = `${rows.length} / ${catalog.stocks.length}`;
  const list = clear($('stock-list'));
  if (!rows.length) { appendText(list,'p','沒有符合搜尋與名單條件的股票。','empty'); return; }
  const shown=rows.slice(0,100);
  for (const stock of shown) {
    const button=node('button','stock-button'); button.type='button'; button.dataset.stock=String(stock.id);
    if (String(stock.id)===String(selectedRow?.id)) button.classList.add('selected');
    button.setAttribute('aria-pressed',String(String(stock.id)===String(selectedRow?.id)));
    const identity=node('span'), name=node('b','',stock.name || '名稱未知'), meta=node('small','',`${stock.id} · ${stock.market || '市場未知'} · ${formatDate(stock.price_as_of)}`);
    identity.append(name,meta);
    const quote=node('span','list-quote'), close=node('b','',fmt(stock.close)), change=node('small',stock.change_pct>0?'up':stock.change_pct<0?'down':'',`${signed(stock.change_pct)}%`);
    quote.append(close,change);
    const lanes=node('span','lane-dots');
    for (const route of ['mge','sfz']) { const state=normalizeStatus(stock.routes?.[route]?.status), lane=node('i',state,route==='mge'?'M':'S'); lane.title=`${routeLabel(route)}：${STATUS_TEXT[state]}`; lanes.append(lane); }
    button.append(identity,quote,lanes); button.addEventListener('click',()=>selectStock(stock)); list.append(button);
  }
  if (rows.length>shown.length) appendText(list,'p',`另有 ${rows.length-shown.length} 檔，請輸入代號或名稱縮小範圍。`,'list-overflow');
}

function addStockBadge(target, route, value) {
  const status=normalizeStatus(value?.status), badge=statusBadge(status,`${routeLabel(route)} ${STATUS_TEXT[status]} · ${formatDate(value?.as_of)}`);
  badge.title = value?.rule_version || '版本未知'; target.append(badge);
}
function renderStockHeader() {
  $('stock-symbol').textContent = `${detail.id} / ${detail.market || selectedRow.market || '市場未知'} · 價格日 ${formatDate(detail.price_as_of)}`;
  $('stock-name').textContent = detail.name || selectedRow.name || '名稱未知';
  $('stock-close').textContent = fmt(selectedRow.close);
  $('stock-change').textContent = `${signed(selectedRow.change_pct)}%`;
  $('stock-change').className = selectedRow.change_pct>0?'up':selectedRow.change_pct<0?'down':'';
  $('price-basis').textContent = `${priceBasisText(detail.price_basis)} · ${selectedRow.price_status || '價格狀態未知'}`;
  const badges=clear($('stock-badges')); addStockBadge(badges,'mge',detail.routes.mge); addStockBadge(badges,'sfz',detail.routes.sfz);
  if (normalizeStatus(detail.routes.mge.status)==='pass' && normalizeStatus(detail.routes.sfz.status)==='pass') {
    const same=detail.routes.mge.as_of===detail.routes.sfz.as_of;
    appendText(badges,'span',same?'兩路皆有入選紀錄 · 同日資料':'兩路曾入選，日期不同');
  }
}

function renderChecks(route) {
  const target=clear($(`${route}-checks`)), rows=Array.isArray(detail.checks?.[route])?detail.checks[route]:[];
  const status=normalizeStatus(detail.routes?.[route]?.status), badge=$(`${route}-detail-status`); badge.textContent=STATUS_TEXT[status]; badge.className=`badge ${status}`;
  const reasonFallback={not_observed_in_selected_only_export:'未出現在只含入選股的歷史匯出',weekly_ma_5_21_89:'週線均線排列',five_day_volume:'最近五日成交量',eight_week_average_gain:'最近八週平均漲幅',minimum_price:'最低價格門檻',daily_ma34_position:'收盤與日 MA34 位置',daily_ma34_rising:'日 MA34 方向'};
  const reasons=(detail.routes?.[route]?.reasons || []).filter(value=>typeof value==='string'&&value).map(reason=>rows.find(check=>check.id===reason||check.id.endsWith(`_${reason}`))?.label||reasonFallback[reason]||reason.replaceAll('_',' '));
  if (reasons.length) appendText(target,'p',reasons.join('；'),'route-reasons');
  if (!rows.length) { appendText(target,'p','沒有條件明細；狀態維持未知。','empty'); return; }
  let currentGroup='';
  for (const check of rows) {
    const inferred = route==='mge' ? (/^b1/i.test(check.id)?'B1':/^b2/i.test(check.id)?'B2':/^a/i.test(check.id)?'A':'其他') : 'SFZ';
    if (inferred!==currentGroup) { currentGroup=inferred; appendText(target,'h4',inferred,'check-group'); }
    const row=node('div','check-row'), copy=node('div'), top=node('div','check-title');
    appendText(top,'strong',check.label || check.id || '未命名條件'); top.append(statusBadge(check.status)); copy.append(top);
    appendText(copy,'small',check.method === 'price_regular_ohlc_gap' ? '官方部分日期沒有可用日K；未補值，SFZ維持未知。' : check.method || '方法未提供','method-copy');
    appendText(copy,'p',`${formatCheckValue(check.value,check.unit)} · ${formatDate(check.as_of)}`,'check-value');
    appendText(copy,'p',resolveSourceLabel(check.source),'check-source');
    row.append(copy); target.append(row);
  }
}

function reviewContext() {
  const routeContext={mge:detail.routes.mge.rule_version,sfz:detail.routes.sfz.rule_version,mge_as_of:detail.routes.mge.as_of,sfz_as_of:detail.routes.sfz.as_of};
  return {
    key:manualReviewKey(detail.id,catalog.schema_version,detail.price_as_of,routeContext,location.origin),
    versions:{schema:catalog.schema_version,mge:detail.routes.mge.rule_version || null,sfz:detail.routes.sfz.rule_version || null},
    route_as_of:{mge:detail.routes.mge.as_of || null,sfz:detail.routes.sfz.as_of || null},
  };
}
function buildReviewSnapshot() {
  if(!detail)return null;
  const context=reviewContext(),value={stock_id:String(detail.id),stock_name:detail.name,status:$('review-status').value,status_label:REVIEW_TEXT[$('review-status').value],note:$('review-note').value,data_date:detail.price_as_of||null,route_as_of:context.route_as_of,versions:context.versions,origin:location.origin,updated_at:new Date().toISOString()};
  return {key:context.key,value};
}
function loadReview() {
  const context=reviewContext(); let saved=null;
  try { saved=JSON.parse(localStorage.getItem(context.key)||'null'); } catch {}
  $('review-status').value=REVIEW_TEXT[saved?.status] ? saved.status : 'pending'; $('review-note').value=typeof saved?.note==='string'?saved.note:'';
  $('review-scope').textContent = `${detail.id} · 資料日 ${formatDate(detail.price_as_of)} · M哥 ${detail.routes.mge.rule_version||'版本未知'} · SFZ ${detail.routes.sfz.rule_version||'版本未知'}`;
  $('review-saved').textContent = saved?.updated_at ? `已保存 ${new Date(saved.updated_at).toLocaleString('zh-TW',{hour12:false})}` : '尚未保存';
}
function persistReview(snapshot=buildReviewSnapshot()) {
  if (!snapshot) return;
  try { localStorage.setItem(snapshot.key,JSON.stringify(snapshot.value)); $('review-saved').textContent='已保存於本機'; } catch { $('review-saved').textContent='瀏覽器儲存空間不可用'; }
  return snapshot.value;
}
function downloadJson(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})), anchor=node('a'); anchor.href=url; anchor.download=name; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function renderSources() {
  const sources=clear($('stock-sources'));
  if (!detail.sources?.length) appendText(sources,'p','未提供來源。','empty');
  for (const [index,source] of (detail.sources||[]).entries()) {
    const resolved=resolvedSource(source);
    const row=node('div','source-row'), title=resolveSourceLabel(source)||`來源 ${index+1}`, url=safeHttpUrl(typeof resolved==='string'?resolved:resolved?.url);
    if (url) { const link=appendText(row,'a',title); link.href=url; link.target='_blank'; link.rel='noopener noreferrer'; }
    else appendText(row,'span',title);
    appendText(row,'small',[resolved?.as_of||resolved?.dates?.at(-1),availability(resolved?.status).text].filter((value,index)=>value&&(index===0||resolved?.status)).join(' · '));
    sources.append(row);
  }
  const researchSource=resolvedSource('official_workspace_research'), urls=researchSource?.official_urls||[], listed=String(detail.market||selectedRow.market).includes('上市');
  const linkSpecs=listed?[['TDCC 股權分散表',url=>url.includes('openapi.tdcc.com.tw/v1/opendata/1-5')],['證交所三大法人',url=>url.includes('twse.com.tw')&&url.includes('/fund/T86')],['證交所融資融券',url=>url.includes('twse.com.tw')&&url.includes('/marginTrading/')]]:[['TDCC 股權分散表',url=>url.includes('openapi.tdcc.com.tw/v1/opendata/1-5')],['櫃買中心外資買賣',url=>url.includes('tpex.org.tw')&&url.includes('/insti/qfii')],['櫃買中心融資融券',url=>url.includes('tpex.org.tw')&&url.includes('/margin/balance')]];
  for(const [label,predicate] of linkSpecs){const url=[...urls].reverse().find(predicate);if(url){const row=node('div','source-row'),link=appendText(row,'a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';appendText(row,'small','官方端點');sources.append(row);}}
  const download=node('div','source-row'),downloadLink=appendText(download,'a','下載完整來源清單');downloadLink.href='data/sources.json';downloadLink.download='m-ge-sfz-sources.json';appendText(download,'small','JSON');sources.append(download);
  const limitations=clear($('stock-limitations'));
  const items=detail.limitations?.length?detail.limitations:['未提供個股限制說明。'];
  for (const item of items) appendText(limitations,'li',String(item));
}

async function selectStock(row,{updateUrl=true}={}) {
  try{reviewQueue?.flush();}catch{$('review-saved').textContent='瀏覽器儲存空間不可用';}
  const requestId=++selectionRequestId;
  selectedRow=row; detail=null; renderStockList();
  chart.setDetail(null);
  $('stock-symbol').textContent=`${row.id} / 資料讀取中`;
  for(const id of ['stock-close','stock-change','price-basis','hash-status','mge-detail-status','sfz-detail-status']) $(id).textContent='—';
  $('hash-status').className='unverified';
  $('stock-change').className='';
  for(const id of ['mge-detail-status','sfz-detail-status']) $(id).className='badge unknown';
  $('chart-readout').textContent='等待個股資料驗證';
  clear($('stock-sources'));clear($('stock-limitations'));
  $('review-status').value='pending';$('review-note').value='';
  $('review-scope').textContent='等待個股資料驗證';$('review-saved').textContent='尚未載入';
  $('stock-name').textContent=`正在讀取 ${row.name || row.id}…`; $('chart').replaceChildren(node('div','loading','讀取個股資料…'));
  clear($('stock-badges')); clear($('mge-checks')).append(node('p','loading','讀取條件…')); clear($('sfz-checks')).append(node('p','loading','讀取條件…'));
  for (const id of ['review-status','review-note','export-review','clear-review']) $(id).disabled=true;
  $('error').hidden=true;
  try {
    let packet=detailCache.get(String(row.id));
    if (!packet) { packet=await fetchJsonWithHash(row.detail,row.detail_sha256); validateDetail(packet.data,row.id); detailCache.set(String(row.id),packet); }
    if (requestId!==selectionRequestId) return;
    detail=packet.data; $('hash-status').textContent=packet.verification;
    $('hash-status').className=packet.verification==='SHA-256 已驗證'?'verified':'unverified';
    renderStockHeader(); renderChecks('mge'); renderChecks('sfz'); renderSources(); loadReview();
    for (const id of ['review-status','review-note','export-review','clear-review']) $(id).disabled=false;
    chart.setDetail(detail); $('chart-readout').textContent='移到圖表查看各日數值'; syncChartControls();
    if (updateUrl) { const url=new URL(location.href); url.searchParams.set('stock',row.id); history.replaceState(null,'',url); }
  } catch (error) {
    if (requestId!==selectionRequestId) return;
    detail=null; $('error').hidden=false; $('error').textContent=`${row.id} 無法載入：${error.message}`;
    $('chart-readout').textContent='個股資料無法驗證';
    $('stock-name').textContent='個股資料無法驗證'; clear($('stock-badges')).append(statusBadge('unknown','資料載入失敗 · 無法列為已驗證'));
    $('chart').replaceChildren(node('div','empty','資料載入失敗，不顯示圖表。'));
  }
}
function syncChartControls() {
  document.querySelectorAll('[data-frame]').forEach(button=>{const selected=button.dataset.frame===chart.frame;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-range]').forEach(button=>{const selected=button.dataset.range===chart.range;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
}

function bind() {
  $('stock-search').addEventListener('input',renderStockList);
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){event.preventDefault();$('stock-search').focus();}});
  document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{
    activeRoute=button.dataset.route; document.querySelectorAll('[data-route]').forEach(item=>{const selected=item===button;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));}); renderStockList();
  }));
  document.querySelectorAll('[data-route-jump]').forEach(button=>button.addEventListener('click',()=>{
    const route=button.dataset.routeJump, tab=document.querySelector(`[data-route="${route}"]`); tab.click(); $('workspace').scrollIntoView({behavior:'smooth'}); $('stock-search').focus({preventScroll:true});
  }));
  document.querySelectorAll('[data-frame]').forEach(button=>button.addEventListener('click',()=>{chart.setFrame(button.dataset.frame);syncChartControls();}));
  document.querySelectorAll('[data-range]').forEach(button=>button.addEventListener('click',()=>{chart.setRange(button.dataset.range);syncChartControls();}));
  document.querySelectorAll('[data-ma]').forEach(input=>input.addEventListener('change',()=>chart.setMovingAverage(Number(input.dataset.ma),input.checked)));
  $('chart-back').addEventListener('click',()=>{chart.pan(1);syncChartControls();}); $('chart-forward').addEventListener('click',()=>{chart.pan(-1);syncChartControls();});
  $('chart-zoom-in').addEventListener('click',()=>{chart.zoom(.77);syncChartControls();}); $('chart-zoom-out').addEventListener('click',()=>{chart.zoom(1.3);syncChartControls();}); $('chart-reset').addEventListener('click',()=>{chart.reset();syncChartControls();});
  $('review-status').addEventListener('change',()=>{reviewQueue.cancel();persistReview();}); $('review-note').addEventListener('input',()=>{const snapshot=buildReviewSnapshot();if(snapshot)reviewQueue.schedule(snapshot,()=>{$('review-saved').textContent='已保存於本機';});});
  $('export-review').addEventListener('click',()=>{if(!detail)return; reviewQueue.flush();const review=persistReview();downloadJson({review,catalog_reference_date:catalog.reference_date,routes:detail.routes},`人工核對-${detail.id}-${detail.price_as_of||'日期未知'}.json`);});
  $('clear-review').addEventListener('click',()=>{if(!detail)return;reviewQueue.cancel();try{localStorage.removeItem(reviewContext().key);}catch{}$('review-status').value='pending';$('review-note').value='';$('review-saved').textContent='此筆已清除';});
  $('chart').addEventListener('chartchange',syncChartControls);
}

async function start() {
  chart=new StockChart($('chart'),$('chart-readout'),$('chart-meta')); reviewQueue=new ReviewSaveQueue({setItem:(key,value)=>localStorage.setItem(key,value)},undefined,undefined,()=>{$('review-saved').textContent='本機儲存不可用，請先匯出此筆再切換股票';}); bind();
  const response=await fetch('data/catalog.json',{cache:'no-store'}); if(!response.ok)throw new Error(`讀取 catalog 失敗（HTTP ${response.status}）`);
  catalog=validateCatalog(await response.json()); renderHeader(); renderStockList();
  const requested=new URL(location.href).searchParams.get('stock'), first=catalog.stocks.find(stock=>String(stock.id)===requested)||routeCandidates(catalog.stocks,'candidates')[0]||catalog.stocks[0];
  if(first)await selectStock(first,{updateUrl:Boolean(requested)||String(first.id)!==requested}); else throw new Error('catalog 沒有可顯示的股票。');
  if ('ResizeObserver' in globalThis) new ResizeObserver(()=>chart.queueRender()).observe($('chart'));
}

if (typeof document !== 'undefined') start().catch(error=>{
  const target=$('error'); target.hidden=false; target.textContent=`目前無法顯示工作台：${error.message} 請確認 data/catalog.json 已產生，並從 HTTP 或 HTTPS 網址開啟。`;
});
