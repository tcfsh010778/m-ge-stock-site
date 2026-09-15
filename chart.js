const SVG_NS = 'http://www.w3.org/2000/svg';
const MA_COLORS = {5:'#a57b42',20:'#577caa',60:'#9472a4',120:'#a35f61',240:'#3e8377'};
const UNIT_TEXT = {lots:'張',percent:'%',people:'人',TWD:'元',price:'元',raw_shares:'股'};
const CHIP_STATUS_TEXT = {ok:'可用',unknown:'未知'};
const PANELS = [
  {id:'price', title:'K 線 · 價格'},
  {id:'volume', title:'成交量 · 原始股'},
  {id:'foreign_hold', title:'外資持股', matches:['foreign hold','foreign ownership','外資持股']},
  {id:'foreign_net', title:'外資日買賣', matches:['foreign_net','foreign daily','外資日買賣','外資買賣超']},
  {id:'trust_hold', title:'投信持股', matches:['trust hold','trust ownership','investment trust hold','investment trust ownership','投信持股']},
  {id:'margin', title:'融資', matches:['margin','融資']},
  {id:'major', title:'大戶', matches:['major','large holder','大戶']},
  {id:'retail', title:'散戶', matches:['retail','small holder','散戶']},
  {id:'shareholders', title:'股東', matches:['shareholder','holders count','股東']},
];

export function movingAverage(bars, period) {
  if (!Number.isInteger(period) || period < 1) throw new Error('Invalid MA period');
  let sum = 0, valid = 0;
  return bars.map((bar, index) => {
    const value = Number.isFinite(bar?.close) ? bar.close : null;
    if (value !== null) { sum += value; valid++; }
    if (index >= period) {
      const old = Number.isFinite(bars[index - period]?.close) ? bars[index - period].close : null;
      if (old !== null) { sum -= old; valid--; }
    }
    return index + 1 >= period && valid === period ? sum / period : null;
  });
}

export function visibleBars(bars, range) {
  if (range === 'all') return bars;
  const count = Number(range);
  return Number.isFinite(count) && count > 0 ? bars.slice(-count) : bars;
}

export function chartWindow(total, requested, offset = 0) {
  if (!Number.isFinite(total) || total <= 0) return {start:0,end:0,count:0,offset:0};
  const count = requested === 'all' ? total : Math.max(Math.min(8, total), Math.min(total, Number(requested) || 120));
  const safeOffset = Math.max(0, Math.min(total - count, Number(offset) || 0));
  const logicalStart = total - safeOffset - count;
  return {start:Math.max(0, Math.floor(logicalStart)), end:Math.min(total, Math.ceil(total - safeOffset)), count, offset:safeOffset, logicalStart};
}

export function zoomWindow(total, count, offset, factor, fraction = .5) {
  if (!total) return {count:0,offset:0};
  const anchorFraction = offset < .01 ? 1 : Math.max(0, Math.min(1, fraction));
  const anchor = total - offset - count + anchorFraction * count;
  const nextCount = Math.max(Math.min(8, total), Math.min(total, count * factor));
  const nextOffset = Math.max(0, Math.min(total - nextCount, total - anchor - (1 - anchorFraction) * nextCount));
  return {count:nextCount, offset:nextOffset};
}

export function finiteSegments(points) {
  const segments = [];
  let active = [];
  for (const point of points || []) {
    if (Number.isFinite(point?.value)) active.push(point);
    else if (active.length) { segments.push(active); active = []; }
  }
  if (active.length) segments.push(active);
  return segments;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function timeOf(row) { return String(row?.time || row?.date || ''); }
function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toLocaleString('zh-TW', {maximumFractionDigits:digits, minimumFractionDigits:digits}) : '—';
}
function findChip(chips, panel) {
  return (chips || []).find(chip => {
    const text = `${chip?.id || ''} ${chip?.label || ''}`.toLowerCase().replace(/[_-]+/g,' ');
    return panel.matches.some(term => text.includes(term));
  });
}
function sourceName(source) {
  if (typeof source === 'string') return source;
  return source?.label || source?.name || source?.url || '';
}
function sourceCategory(source) {
  const value=sourceName(source).toLowerCase();
  if (value.startsWith('tdcc')) return 'TDCC 股權分散表';
  if (value.startsWith('foreign:')) return '外資持股資料';
  if (value.startsWith('institutional:')) return '三大法人買賣超';
  if (value.startsWith('margin:')) return '融資餘額資料';
  return value && !/\d{4}-\d{2}-\d{2}/.test(value) ? sourceName(source) : '';
}
function utcTime(value) {
  const text=String(value||'');
  return Date.parse(text.length===10?`${text}T00:00:00Z`:text);
}
export function timeIndex(bars, date) {
  if (!bars?.length) return null;
  const target=utcTime(date), first=utcTime(timeOf(bars[0])), last=utcTime(timeOf(bars.at(-1)));
  if (!Number.isFinite(target)||target<first||target>last) return null;
  let upper=bars.findIndex(bar=>utcTime(timeOf(bar))>=target);
  if (upper<0)return null;
  const upperTime=utcTime(timeOf(bars[upper]));
  if (upperTime===target||upper===0)return upper;
  const lower=upper-1, lowerTime=utcTime(timeOf(bars[lower]));
  return lower+(target-lowerTime)/(upperTime-lowerTime||1);
}
export function hoverIndexFromX(geometry, clientX, rect) {
  const position=(clientX-rect.left)/rect.width*geometry.width;
  const raw=geometry.window.logicalStart-.5+(position-geometry.left)/geometry.stride;
  return Math.round(raw);
}
function mappedPoints(bars, chip) {
  return (chip?.points || []).map(point => ({
    date:String(point?.date || ''),
    value:Number.isFinite(point?.value) ? point.value : null,
    index:timeIndex(bars, String(point?.date || '')),
  })).filter(point => point.index !== null && point.date);
}

export class StockChart {
  constructor(container, readout, meta) {
    this.container = container;
    this.readout = readout;
    this.meta = meta;
    this.detail = null;
    this.frame = 'day';
    this.range = '120';
    this.count = 120;
    this.offset = 0;
    this.enabledMa = new Set([5,20,60,120,240]);
    this.geometry = null;
    this.drag = null;
    this.cursor = null;
    this.frameRequest = 0;
    this.bindGestures();
  }

  setDetail(detail) { this.detail = detail; this.offset = 0; this.count = this.range === 'all' ? this.bars().length : Number(this.range); this.cursor = null; this.render(); }
  bars() { return Array.isArray(this.detail?.candles?.[this.frame]) ? this.detail.candles[this.frame] : []; }
  setFrame(frame) { this.frame = frame; this.offset = 0; this.count = this.range === 'all' ? this.bars().length : Number(this.range); this.cursor = null; this.render(); }
  setRange(range) { this.range = range; this.offset = 0; this.count = range === 'all' ? this.bars().length : Number(range); this.cursor = null; this.render(); }
  setMovingAverage(period, shown) { shown ? this.enabledMa.add(period) : this.enabledMa.delete(period); this.render(); }
  emitChange() { if (typeof CustomEvent !== 'undefined') this.container.dispatchEvent(new CustomEvent('chartchange')); }
  pan(direction) { const bars = this.bars(); this.offset = Math.max(0, Math.min(bars.length - this.count, this.offset + direction * this.count * .45)); this.range = 'custom'; this.render(); this.emitChange(); }
  zoom(factor, fraction = .5) { const next = zoomWindow(this.bars().length, this.count, this.offset, factor, fraction); this.count = next.count; this.offset = next.offset; this.range = 'custom'; this.render(); this.emitChange(); }
  reset() { this.range = '120'; this.count = 120; this.offset = 0; this.cursor = null; this.render(); this.emitChange(); }
  queueRender() { if (!this.frameRequest) this.frameRequest = requestAnimationFrame(() => { this.frameRequest = 0; this.render(); }); }

  render() {
    this.container.replaceChildren();
    const all = this.bars();
    if (!all.length) {
      this.container.append(el('div','empty','此週期沒有可驗證的 K 線。'));
      this.meta.textContent = '0 根'; this.geometry = null; return;
    }
    const window = chartWindow(all.length, this.count, this.offset);
    this.count = window.count; this.offset = window.offset;
    const bars = all.slice(window.start, window.end);
    const width = Math.max(340, this.container.clientWidth || 900), left = 12, right = 72, plot = width - left - right;
    const stride = plot / window.count;
    const x = index => left + (index - window.logicalStart + .5) * stride;
    this.geometry = {width,left,right,plot,stride,window,bars,all,x};
    this.meta.textContent = `${Math.round(window.count)} 根 · ${timeOf(bars[0])} → ${timeOf(bars.at(-1))}`;
    const moving = {};
    for (const period of [5,20,60,120,240]) {
      const calculated = movingAverage(all, period);
      moving[period] = all.map((bar,index) => Number.isFinite(bar?.[`ma${period}`]) ? bar[`ma${period}`] : calculated[index]);
    }
    for (const panel of PANELS) this.container.append(this.renderPane(panel, bars, all, moving, x, width, left, right, stride, window));
    this.restoreCursor();
  }

  renderPane(panel, bars, all, moving, x, width, left, right, stride, window) {
    const section = el('section','chart-pane'); section.dataset.chartPane = panel.id;
    const heading = el('div','pane-title'), title = el('span','',panel.title), detail = el('small');
    heading.append(title, detail); section.append(heading);
    const height = panel.id === 'price' ? 310 : 122, top = 15, bottom = 21, plotHeight = height - top - bottom;
    const svg = svgEl('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':panel.title});
    section.append(svg);
    let values = [], points = [], chip = null;
    if (panel.id === 'price') {
      values = bars.flatMap(bar => [bar.low,bar.high]).filter(Number.isFinite);
      for (const period of this.enabledMa) values.push(...moving[period].slice(window.start,window.end).filter(Number.isFinite));
      detail.textContent = 'K 線與完整歷史均線';
    } else if (panel.id === 'volume') {
      points = bars.map((bar,index) => ({index:index + window.start,date:timeOf(bar),value:Number.isFinite(bar.volume) ? bar.volume : null}));
      values = points.map(point => point.value).filter(Number.isFinite); values.push(0);
      detail.textContent = `${values.length - 1} 根 · 股`;
    } else {
      chip = findChip(this.detail?.chips, panel);
      points = mappedPoints(all, chip).filter(point => point.index >= window.start && point.index < window.end);
      values = points.map(point => point.value).filter(Number.isFinite);
      const state = CHIP_STATUS_TEXT[chip?.status] || '未知';
      const source = sourceName(chip?.sources?.[0]);
      const sourceLabel=sourceCategory(source), unit=UNIT_TEXT[chip?.unit] || chip?.unit || '單位未知';
      detail.textContent = values.length ? `${state} · ${chip?.as_of || '日期未知'} · ${unit}${sourceLabel ? ` · ${sourceLabel}` : ''}` : `${state} · ${chip?.as_of || '日期未知'} · 無可繪數值${sourceLabel ? ` · ${sourceLabel}` : ''}`;
    }
    if (!values.length) {
      svg.append(svgEl('text',{x:width/2,y:height/2,'text-anchor':'middle',class:'empty-label'}, chip ? '此項為 unknown 或沒有可驗證數值' : '沒有可驗證資料'));
      return section;
    }
    let low = Math.min(...values), high = Math.max(...values);
    if (panel.id === 'volume') low = 0;
    const pad = (high - low) * .08 || Math.max(Math.abs(high) * .03, 1); high += pad; if (panel.id !== 'volume') low -= pad;
    const y = value => top + (high - value) / (high - low || 1) * plotHeight;
    for (let tick = 0; tick < 3; tick++) {
      const value = low + (high - low) * tick / 2, yy = y(value);
      svg.append(svgEl('line',{x1:left,x2:width-right,y1:yy,y2:yy,class:'grid-line'}));
      svg.append(svgEl('text',{x:width-right+7,y:yy+4},fmt(value, panel.id === 'price' ? 1 : 0)));
    }
    if (panel.id === 'price') {
      for (const period of this.enabledMa) {
        const segments = finiteSegments(moving[period].slice(window.start,window.end).map((value,index) => ({value,index:index+window.start})));
        for (const segment of segments) svg.append(svgEl('path',{d:segment.map((point,index)=>`${index?'L':'M'}${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' '),fill:'none',stroke:MA_COLORS[period],'stroke-width':1.35}));
      }
      bars.forEach((bar,index) => {
        if (![bar.open,bar.high,bar.low,bar.close].every(Number.isFinite)) return;
        const global = index + window.start, shade = bar.close >= bar.open ? '#ad4d3f' : '#26755f', bodyWidth = Math.max(.8,Math.min(12,stride*.62));
        svg.append(svgEl('line',{x1:x(global),x2:x(global),y1:y(bar.high),y2:y(bar.low),stroke:shade,'stroke-width':1}));
        svg.append(svgEl('rect',{x:x(global)-bodyWidth/2,y:Math.min(y(bar.open),y(bar.close)),width:bodyWidth,height:Math.max(1,Math.abs(y(bar.open)-y(bar.close))),fill:shade}));
      });
    } else if (panel.id === 'volume') {
      for (const point of points) {
        if (!Number.isFinite(point.value)) continue;
        const bar = all[point.index], shade = bar?.close >= bar?.open ? '#ad4d3f' : '#26755f', barWidth = Math.max(.8,Math.min(12,stride*.62));
        svg.append(svgEl('rect',{x:x(point.index)-barWidth/2,y:y(point.value),width:barWidth,height:Math.max(1,y(0)-y(point.value)),fill:shade,opacity:.58}));
      }
    } else {
      for (const segment of finiteSegments(points)) {
        const path = segment.map((point,index)=>`${index?'L':'M'}${x(point.index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
        svg.append(svgEl('path',{d:path,fill:'none',stroke:'#24715c','stroke-width':1.6}));
        for (const point of segment) svg.append(svgEl('circle',{cx:x(point.index),cy:y(point.value),r:2.1,fill:'#24715c'}));
      }
    }
    for (const index of [window.start, Math.floor((window.start+window.end-1)/2), window.end-1]) {
      svg.append(svgEl('text',{x:x(index),y:height-5,'text-anchor':index===window.start?'start':index===window.end-1?'end':'middle'},timeOf(all[index]).slice(2)));
    }
    svg.append(svgEl('line',{class:'sync-crosshair',y1:0,y2:height-bottom,visibility:'hidden'}));
    return section;
  }

  showCursor(index, visible = true) {
    if (!this.geometry) return;
    const {window,all,x} = this.geometry;
    this.cursor = Math.max(window.start, Math.min(window.end - 1, index));
    const bar = all[this.cursor];
    this.readout.textContent = `${timeOf(bar)}　開 ${fmt(bar.open)}　高 ${fmt(bar.high)}　低 ${fmt(bar.low)}　收 ${fmt(bar.close)}　量 ${fmt(bar.volume,0)} 股`;
    for (const line of this.container.querySelectorAll('.sync-crosshair')) {
      line.setAttribute('x1',x(this.cursor)); line.setAttribute('x2',x(this.cursor)); line.setAttribute('visibility',visible?'visible':'hidden');
    }
  }
  restoreCursor() { if (this.geometry && this.cursor !== null && this.cursor >= this.geometry.window.start && this.cursor < this.geometry.window.end) this.showCursor(this.cursor); }

  bindGestures() {
    this.container.addEventListener('pointermove', event => {
      if (!this.geometry) return;
      if (this.drag) {
        const dx = event.clientX - this.drag.x;
        if (Math.abs(dx) > 3 && !this.drag.moved) { this.drag.moved = true; this.emitChange(); }
        this.offset = Math.max(0, Math.min(this.geometry.all.length-this.count,this.drag.offset-dx/this.geometry.stride)); this.range='custom'; this.queueRender(); return;
      }
      const svg = event.target.closest('svg'); if (!svg) return;
      const rect = svg.getBoundingClientRect();
      this.showCursor(hoverIndexFromX(this.geometry,event.clientX,rect));
    });
    this.container.addEventListener('pointerleave', () => { if (!this.drag) for (const line of this.container.querySelectorAll('.sync-crosshair')) line.setAttribute('visibility','hidden'); });
    this.container.addEventListener('pointerdown', event => {
      if (!this.geometry || event.button !== 0 || !event.target.closest('svg')) return;
      this.drag = {pointerId:event.pointerId,x:event.clientX,offset:this.offset,moved:false};
      this.container.setPointerCapture(event.pointerId); this.container.classList.add('dragging');
    });
    const end = event => { if (this.drag?.pointerId === event.pointerId) { this.drag=null; this.container.classList.remove('dragging'); if (this.container.hasPointerCapture(event.pointerId)) this.container.releasePointerCapture(event.pointerId); } };
    this.container.addEventListener('pointerup',end); this.container.addEventListener('pointercancel',end); this.container.addEventListener('lostpointercapture',end);
    this.container.addEventListener('wheel', event => {
      if (!this.geometry || !event.target.closest('svg')) return;
      event.preventDefault();
      const rect = event.target.closest('svg').getBoundingClientRect(), fraction = Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
      this.zoom(Math.exp(Math.max(-160,Math.min(160,event.deltaY))*.002),fraction);
    },{passive:false});
    this.container.addEventListener('keydown', event => {
      if (!this.geometry) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); this.showCursor((this.cursor ?? this.geometry.window.end-1)+(event.key==='ArrowRight'?1:-1)); }
      else if (event.key === 'PageUp' || event.key === 'PageDown') { event.preventDefault(); this.pan(event.key==='PageUp'?1:-1); }
      else if (['+','=','-'].includes(event.key)) { event.preventDefault(); this.zoom(event.key==='-'?1.25:.8); }
      else if (event.key === 'Home') { event.preventDefault(); this.offset=this.geometry.all.length-this.count; this.range='custom'; this.render(); this.emitChange(); }
      else if (event.key === 'End') { event.preventDefault(); this.offset=0; this.range='custom'; this.render(); this.emitChange(); }
    });
  }
}
