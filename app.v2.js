// EVENTS → INTENTIONER (statisk GitHub Pages)
// Robust: ingen fetch krävs om EVENTS finns i events.js.
// D3 används för graf + enkla SVG-diagram.

const LIKELIHOOD = [
  { key: "bekraftat", label: "Bekräftat", color: "#3b82f6", w: 1.0, rank: 5 },
  { key: "sannolikt", label: "Sannolikt", color: "#fb923c", w: 0.8, rank: 4 },
  { key: "troligt",   label: "Troligt",   color: "#facc15", w: 0.6, rank: 3 },
  { key: "mojligt",   label: "Möjligt",   color: "#9ca3af", w: 0.3, rank: 2 },
  { key: "tveksamt",  label: "Tveksamt",  color: "#ffffff", w: 0.05, rank: 1 },
];

const DIMENSIONS = [
  { key: "intention", label: "Intentioner" },
  { key: "facilitering", label: "Facilitering" },
  { key: "resurser", label: "Resurser" },
  { key: "tillfalle", label: "Tillfälle" },
];

// Mappning: kategori → dimension (justera efter din egen logik)
const CAT_TO_DIM = {
  HYBRID: "intention",
  POLICY: "intention",
  TERROR: "intention",

  INTEL: "facilitering",
  LEGAL: "facilitering",

  MIL: "resurser",
  NUCLEAR: "resurser",

  INFRA: "tillfalle",
  DRONE: "tillfalle",
  GPS: "tillfalle",
  MAR: "tillfalle",
};

// Default risk per kategori om event saknar risk (1–5)
const CAT_RISK_DEFAULT = {
  HYBRID: 4, POLICY: 3, TERROR: 4,
  INTEL: 3, LEGAL: 3,
  MIL: 4, NUCLEAR: 4,
  INFRA: 4, DRONE: 3, GPS: 3, MAR: 3,
};

const STOPWORDS = new Set([
  "the","and","for","with","from","into","over","under","after","before","this","that","these","those",
  "som","och","för","med","från","till","över","under","efter","innan","det","den","de","att","i","på","av","en","ett",
  "om","vid","har","hade","kan","kunde","ska","skall","samt","mot","utan","inom","där","här"
]);

function byKey(arr, key){ return arr.find(d => d.key === key); }
function esc(s){ return (s ?? "").toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function parseDate(ev){
  const v = ev.date || ev.time || ev.dt || ev.datetime || ev.timestamp;
  if(!v) return null;
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function normalizeEvent(ev){
  const d = parseDate(ev);
  const cat = (ev.cat || ev.category || ev.type || "").toString().trim().toUpperCase();
  const country = (ev.country || ev.land || ev.nation || "Okänt").toString().trim();
  const title = (ev.title || ev.name || ev.headline || "").toString().trim();
  const summary = (ev.summary || ev.desc || ev.description || "").toString().trim();
  const place = (ev.place || ev.location || "").toString().trim();
  const url = (ev.url || ev.link || "").toString().trim();
  const source = (ev.source || ev.src || "").toString().trim();

  let likelihood = (ev.likelihood || ev.trolighet || "").toString().trim().toLowerCase();
  if(!likelihood) likelihood = "mojligt";
  if(!byKey(LIKELIHOOD, likelihood)) likelihood = "mojligt";

  let risk = parseInt(ev.risk ?? ev.riskLevel ?? ev.risknivå ?? "", 10);
  if(!risk || Number.isNaN(risk)) risk = CAT_RISK_DEFAULT[cat] ?? 3;
  risk = clamp(risk, 1, 5);

  const dim = CAT_TO_DIM[cat] || "intention";

  return {
    _raw: ev,
    id: ev.id || ev.uuid || ev.guid || (cat + "_" + Math.random().toString(16).slice(2) + "_" + (d ? d.toISOString().slice(0,10) : "nodate")),
    date: d,
    dateStr: d ? d.toISOString().slice(0,10) : "",
    cat, country, title, summary, place, url, source,
    likelihood, risk, dimension: dim
  };
}

function tokenise(ev){
  const txt = (ev.title + " " + ev.summary).toLowerCase();
  const toks = txt
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-zåäö0-9\s-]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 4 && !STOPWORDS.has(t));
  const seen = new Set();
  const out = [];
  for(const t of toks){
    if(seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if(out.length >= 6) break;
  }
  return out;
}

// --- State ---
let ALL = [];
let FILTERED = [];
let state = {
  minLikelihood: "bekraftat",
  clamp: true,
  showKeywords: true,
  kwFilter: "",
  cat: "ALL",
  country: "ALL",
  from: null,
  to: null,
  search: "",
};

// --- UI ---
function initUI(){
  const dates = ALL.filter(e=>e.date).map(e=>e.date.getTime()).sort((a,b)=>a-b);
  if(dates.length){
    const minD = new Date(dates[0]);
    const maxD = new Date(dates[dates.length-1]);
    const from = new Date(minD);
    from.setUTCDate(from.getUTCDate() - 30);
    state.from = from;
    state.to = maxD;
    document.getElementById("dateFrom").value = from.toISOString().slice(0,10);
    document.getElementById("dateTo").value = maxD.toISOString().slice(0,10);
  }

  const cats = Array.from(new Set(ALL.map(e=>e.cat).filter(Boolean))).sort();
  const countries = Array.from(new Set(ALL.map(e=>e.country).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"sv"));

  const selCat = document.getElementById("selCat");
  cats.forEach(c=>{
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    selCat.appendChild(o);
  });

  const selCountry = document.getElementById("selCountry");
  countries.forEach(c=>{
    const o = document.createElement("option");
    o.value = c; o.textContent = c;
    selCountry.appendChild(o);
  });

  document.getElementById("selMinLikelihood").addEventListener("change",(e)=>{ state.minLikelihood=e.target.value; refresh(); });
  document.getElementById("chkClamp").addEventListener("change",(e)=>{ state.clamp=e.target.checked; refresh(); });
  document.getElementById("chkKeywordNodes").addEventListener("change",(e)=>{ state.showKeywords=e.target.checked; refreshGraph(); });
  document.getElementById("txtKW").addEventListener("input",(e)=>{ state.kwFilter=e.target.value.trim().toLowerCase(); refresh(); });
  document.getElementById("selCat").addEventListener("change",(e)=>{ state.cat=e.target.value; refresh(); });
  document.getElementById("selCountry").addEventListener("change",(e)=>{ state.country=e.target.value; refresh(); });

  document.getElementById("dateFrom").addEventListener("change",(e)=>{
    state.from = e.target.value ? new Date(e.target.value+"T00:00:00Z") : null;
    refresh();
  });
  document.getElementById("dateTo").addEventListener("change",(e)=>{
    state.to = e.target.value ? new Date(e.target.value+"T00:00:00Z") : null;
    refresh();
  });

  document.getElementById("txtSearch").addEventListener("input",(e)=>{ state.search=e.target.value.trim().toLowerCase(); renderList(); });
  document.getElementById("btnClear").addEventListener("click",()=>{ document.getElementById("txtSearch").value=""; state.search=""; renderList(); });

  document.getElementById("btnExportEvents").addEventListener("click", exportEventsJSON);
  document.getElementById("btnExportModel").addEventListener("click", exportModelJSON);

  document.getElementById("fileImportEvents").addEventListener("change",(e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    importEventsJSON(f).catch(err=>alert(err.message));
    e.target.value = "";
  });

  const btnFS = document.getElementById("btnFS");
  const graphCard = document.getElementById("graphCard");
  btnFS.addEventListener("click", async ()=>{
    if(!document.fullscreenElement){
      graphCard.classList.add("graphfs");
      if(graphCard.requestFullscreen) await graphCard.requestFullscreen();
      initGraph();
    } else {
      await document.exitFullscreen();
    }
  });
  document.addEventListener("fullscreenchange", ()=>{
    if(!document.fullscreenElement){
      graphCard.classList.remove("graphfs");
      initGraph();
    }
  });

  document.getElementById("btnReset").addEventListener("click", ()=>zoomToFit());
  window.addEventListener("resize", ()=>initGraph());
}

function likelihoodAllowed(lik){
  const minRank = byKey(LIKELIHOOD, state.minLikelihood).rank;
  const r = byKey(LIKELIHOOD, lik)?.rank ?? 1;
  return r >= minRank;
}

function eventWeight(ev){
  const w = byKey(LIKELIHOOD, ev.likelihood)?.w ?? 0.3;
  return ev.risk * w;
}

function applyFilters(){
  const kw = state.kwFilter;
  FILTERED = ALL.filter(ev=>{
    if(state.from && ev.date && ev.date < state.from) return false;
    if(state.to && ev.date && ev.date > state.to) return false;
    if(state.cat !== "ALL" && ev.cat !== state.cat) return false;
    if(state.country !== "ALL" && ev.country !== state.country) return false;
    if(!likelihoodAllowed(ev.likelihood)) return false;
    if(kw){
      const txt = (ev.title + " " + ev.summary).toLowerCase();
      if(!txt.includes(kw)) return false;
    }
    return true;
  });
}

function fmtPct(x){
  const v = state.clamp ? clamp(x,0,100) : x;
  return (Math.round(v*10)/10).toString().replace(".",",") + "%";
}

function computeModel(){
  const dim = {};
  DIMENSIONS.forEach(d=>dim[d.key]={sum:0, n:0});

  for(const ev of FILTERED){
    const k = ev.dimension;
    if(!dim[k]) continue;
    dim[k].sum += eventWeight(ev);
    dim[k].n += 1;
  }

  const out = DIMENSIONS.map(d=>{
    const v = dim[d.key];
    const avg = v.n ? (v.sum / v.n) : 0;
    const pct = (avg / 5) * 100;
    return { key:d.key, label:d.label, value:pct, n:v.n };
  });

  const total = out.reduce((a,b)=>a+b.value,0) / out.length;
  return { dims: out, total };
}

function renderModel(){
  const m = computeModel();
  document.getElementById("capTotal").textContent = fmtPct(m.total);
  document.getElementById("nEvents").textContent = String(FILTERED.length);

  const cats = new Set(FILTERED.map(e=>e.cat));
  const countries = new Set(FILTERED.map(e=>e.country));
  document.getElementById("nCats").textContent = String(cats.size);
  document.getElementById("nCountries").textContent = String(countries.size);

  renderDimBars(m.dims);
  renderRadar(m.dims);
}

function renderDimBars(dims){
  const wrap = document.getElementById("dimBars");
  wrap.innerHTML = "";
  for(const d of dims){
    const row = document.createElement("div");
    row.style.display="grid";
    row.style.gridTemplateColumns="150px 1fr 70px";
    row.style.gap="10px";
    row.style.alignItems="center";
    row.style.margin="8px 0";

    const l = document.createElement("div");
    l.textContent = d.label;
    l.style.color="rgba(231,236,247,.92)";
    l.style.fontSize="12px";

    const bar = document.createElement("div");
    bar.style.height="12px";
    bar.style.border="1px solid rgba(38,50,74,.9)";
    bar.style.borderRadius="999px";
    bar.style.overflow="hidden";
    bar.style.background="rgba(11,14,20,.45)";

    const fill = document.createElement("div");
    fill.style.height="100%";
    fill.style.width = clamp(d.value,0,100).toFixed(1)+"%";
    fill.style.background="rgba(122,162,255,.75)";
    bar.appendChild(fill);

    const r = document.createElement("div");
    r.style.textAlign="right";
    r.style.fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
    r.style.fontSize="12px";
    r.style.color="rgba(138,151,178,.95)";
    r.textContent = fmtPct(d.value);

    row.appendChild(l); row.appendChild(bar); row.appendChild(r);
    wrap.appendChild(row);
  }
}

function renderRadar(dims){
  const svg = d3.select("#radar");
  svg.selectAll("*").remove();

  const w=360, h=320, cx=w/2, cy=150, r=110;

  const levels=[20,40,60,80,100];
  levels.forEach(lv=>{
    svg.append("circle").attr("cx",cx).attr("cy",cy).attr("r",r*(lv/100))
      .attr("fill","none").attr("stroke","rgba(38,50,74,.8)").attr("stroke-dasharray","3,3");
  });

  const angle = (2*Math.PI)/dims.length;
  dims.forEach((a,i)=>{
    const ang = -Math.PI/2 + i*angle;
    const x = cx + Math.cos(ang)*r;
    const y = cy + Math.sin(ang)*r;
    svg.append("line").attr("x1",cx).attr("y1",cy).attr("x2",x).attr("y2",y).attr("stroke","rgba(38,50,74,.9)");

    const lx = cx + Math.cos(ang)*(r+26);
    const ly = cy + Math.sin(ang)*(r+26);
    svg.append("text")
      .attr("x",lx).attr("y",ly)
      .attr("text-anchor",(Math.cos(ang)>0.2)?"start":(Math.cos(ang)<-0.2?"end":"middle"))
      .attr("fill","rgba(231,236,247,.92)")
      .attr("font-size","11")
      .text(a.label);
  });

  const pts = dims.map((a,i)=>{
    const ang=-Math.PI/2+i*angle;
    const rr=r*(clamp(a.value,0,100)/100);
    return [cx+Math.cos(ang)*rr, cy+Math.sin(ang)*rr];
  });

  svg.append("polygon")
    .attr("points", pts.map(p=>p.join(",")).join(" "))
    .attr("fill","rgba(122,162,255,.20)")
    .attr("stroke","rgba(122,162,255,.9)")
    .attr("stroke-width",2);
}

function weekKey(d){
  const dd = new Date(d.getTime());
  dd.setUTCDate(dd.getUTCDate() + 4 - (dd.getUTCDay()||7));
  const year = dd.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year,0,1));
  const weekNo = Math.ceil((((dd - yearStart) / 86400000) + 1) / 7);
  return year + "-W" + String(weekNo).padStart(2,"0");
}

function renderTimeline(){
  const svg = d3.select("#timeline");
  svg.selectAll("*").remove();

  const w=720,h=180, pad={l:40,r:14,t:12,b:28};

  const counts = new Map();
  FILTERED.filter(e=>e.date).forEach(e=>{
    const k=weekKey(e.date);
    counts.set(k, (counts.get(k)||0)+1);
  });

  const keys = Array.from(counts.keys()).sort();
  const data = keys.map(k=>({k, v:counts.get(k)}));
  const maxV = Math.max(1, ...data.map(d=>d.v));

  const x = d3.scaleBand().domain(keys).range([pad.l, w-pad.r]).padding(0.15);
  const y = d3.scaleLinear().domain([0,maxV]).nice().range([h-pad.b, pad.t]);

  svg.append("line").attr("x1",pad.l).attr("y1",h-pad.b).attr("x2",w-pad.r).attr("y2",h-pad.b).attr("stroke","rgba(38,50,74,.9)");
  svg.append("line").attr("x1",pad.l).attr("y1",pad.t).attr("x2",pad.l).attr("y2",h-pad.b).attr("stroke","rgba(38,50,74,.9)");

  svg.selectAll("rect.bar").data(data).enter().append("rect")
    .attr("x",d=>x(d.k)).attr("y",d=>y(d.v))
    .attr("width",x.bandwidth()).attr("height",d=>(h-pad.b)-y(d.v))
    .attr("fill","rgba(122,162,255,.75)")
    .attr("rx",6).attr("ry",6);

  const ticks = y.ticks(4);
  ticks.forEach(t=>{
    svg.append("text").attr("x",pad.l-8).attr("y",y(t)+4).attr("text-anchor","end")
      .attr("fill","rgba(138,151,178,.95)").attr("font-size","10").text(t);
    svg.append("line").attr("x1",pad.l).attr("y1",y(t)).attr("x2",w-pad.r).attr("y2",y(t))
      .attr("stroke","rgba(38,50,74,.45)").attr("stroke-dasharray","3,3");
  });

  const step = Math.max(1, Math.floor(keys.length/8));
  keys.forEach((k,i)=>{
    if(i%step!==0 && i!==keys.length-1) return;
    svg.append("text").attr("x",x(k)+x.bandwidth()/2).attr("y",h-10).attr("text-anchor","middle")
      .attr("fill","rgba(138,151,178,.95)").attr("font-size","10").text(k);
  });
}

function renderList(){
  const wrap = document.getElementById("eventList");
  const q = state.search;

  const items = FILTERED
    .filter(e=>{
      if(!q) return true;
      const txt = (e.title+" "+e.summary+" "+e.url+" "+e.country+" "+e.cat).toLowerCase();
      return txt.includes(q);
    })
    .slice()
    .sort((a,b)=>{
      const ta = a.date ? a.date.getTime() : 0;
      const tb = b.date ? b.date.getTime() : 0;
      return tb-ta;
    });

  wrap.innerHTML = "";
  for(const e of items){
    const lik = byKey(LIKELIHOOD, e.likelihood);
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="t">${esc(e.title || "(utan titel)")}</div>
      <div class="m">${esc(e.dateStr)} · ${esc(e.cat)} · ${esc(e.country)}${e.place?(" · "+esc(e.place)):""}</div>
      <div class="badges">
        <span class="badge">${esc(lik?.label || e.likelihood)}</span>
        <span class="badge">risk ${e.risk}</span>
        <span class="badge">${esc(DIMENSIONS.find(d=>d.key===e.dimension)?.label || e.dimension)}</span>
        ${e.source?`<span class="badge">${esc(e.source)}</span>`:""}
      </div>
    `;
    el.addEventListener("click", ()=>showDetail(e));
    wrap.appendChild(el);
  }
}

function showDetail(e){
  document.getElementById("detailPill").textContent = e.id;
  const lik = byKey(LIKELIHOOD, e.likelihood);
  const html = `
    <div><b>${esc(e.title || "(utan titel)")}</b></div>
    <div class="badges" style="margin:10px 0 12px">
      <span class="badge">${esc(e.dateStr)}</span>
      <span class="badge">${esc(e.cat)}</span>
      <span class="badge">${esc(e.country)}</span>
      ${e.place?`<span class="badge">${esc(e.place)}</span>`:""}
      <span class="badge">${esc(lik?.label || e.likelihood)}</span>
      <span class="badge">risk ${e.risk}</span>
      <span class="badge">${esc(DIMENSIONS.find(d=>d.key===e.dimension)?.label || e.dimension)}</span>
    </div>
    ${e.summary?`<div>${esc(e.summary)}</div>`:""}
    ${e.url?`<div style="margin-top:10px"><a href="${esc(e.url)}" target="_blank" rel="noreferrer">Öppna källa</a></div>`:""}
  `;
  document.getElementById("detail").innerHTML = html;
}

// --- Graph ---
let sim=null, svgG=null, zoom=null, zoomHost=null;

function buildGraph(){
  const nodes = [];
  const links = [];
  const nodeIndex = new Map();

  function addNode(id, type, label){
    if(nodeIndex.has(id)) return nodeIndex.get(id);
    const n = {id, type, label, fx:null, fy:null};
    nodeIndex.set(id,n);
    nodes.push(n);
    return n;
  }

  const showKW = state.showKeywords;
  const kwFilter = state.kwFilter;

  const kwCount = new Map();
  FILTERED.forEach(e=>{
    if(showKW){
      tokenise(e).forEach(t=>{
        if(kwFilter && !t.includes(kwFilter)) return;
        kwCount.set(t, (kwCount.get(t)||0)+1);
      });
    }
  });

  const kwMin = Math.max(2, Math.floor(FILTERED.length/40));
  const allowedKW = new Set(Array.from(kwCount.entries()).filter(([k,v])=>v>=kwMin).map(([k])=>k));

  FILTERED.forEach(e=>{
    const c = addNode("cat:"+e.cat, "cat", e.cat);
    const n = addNode("country:"+e.country, "country", e.country);
    links.push({source:c.id, target:n.id, kind:"cat-country"});

    if(showKW){
      tokenise(e).forEach(t=>{
        if(!allowedKW.has(t)) return;
        const k = addNode("kw:"+t, "kw", t);
        links.push({source:c.id, target:k.id, kind:"cat-kw"});
      });
    }
  });

  const seen = new Set();
  const uniq = [];
  for(const l of links){
    const key = l.source + "→" + l.target + "|" + l.kind;
    if(seen.has(key)) continue;
    seen.add(key);
    uniq.push(l);
  }

  return {nodes, links:uniq};
}

function nodeFill(n){
  if(n.type==="cat") return "rgba(122,162,255,.55)";
  if(n.type==="country") return "rgba(92,225,182,.45)";
  return "rgba(17,23,37,.9)";
}
function nodeStroke(n){
  if(n.type==="kw") return "rgba(231,236,247,.45)";
  return "rgba(231,236,247,.55)";
}

function initGraph(){
  const container = document.getElementById("graph");
  container.innerHTML = "";

  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select(container).append("svg")
    .attr("width", width)
    .attr("height", height);

  zoomHost = svg;
  const g = svg.append("g");
  svgG = g;

  zoom = d3.zoom()
    .scaleExtent([0.35, 3.2])
    .on("zoom", (event) => g.attr("transform", event.transform));

  svg.call(zoom);

  const {nodes, links} = buildGraph();

  const link = g.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", d => d.kind==="cat-country" ? "rgba(138,151,178,.40)" : "rgba(138,151,178,.28)")
    .attr("stroke-width", d => d.kind==="cat-country" ? 1.6 : 1.1);

  const node = g.append("g")
    .selectAll("g")
    .data(nodes, d=>d.id)
    .join("g")
    .attr("class", d => "node " + d.type);

  node.append("circle")
    .attr("r", d => d.type==="kw" ? 9 : 13)
    .attr("fill", d => nodeFill(d))
    .attr("stroke", d => nodeStroke(d))
    .attr("stroke-width", 2);

  node.append("text")
    .attr("x", 16)
    .attr("y", 4)
    .attr("fill","rgba(231,236,247,.92)")
    .attr("font-size", 11)
    .text(d=>d.label);

  node.on("click", (event, d)=>{
    event.stopPropagation();
    if(d.fx == null){
      d.fx = d.x; d.fy = d.y;
    } else {
      d.fx = null; d.fy = null;
    }
  });

  const drag = d3.drag()
    .on("start", (event, d)=>{
      if(!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", (event, d)=>{ d.fx = event.x; d.fy = event.y; })
    .on("end", (event)=>{ if(!event.active) sim.alphaTarget(0); });

  node.call(drag);

  sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d=>d.id).distance(l=> l.kind==="cat-country" ? 90 : 70))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(width/2, height/2))
    .force("collide", d3.forceCollide().radius(d=> (d.type==="kw"?16:22)))
    .on("tick", ticked);

  function ticked(){
    link
      .attr("x1", d => nodeRef(d.source).x)
      .attr("y1", d => nodeRef(d.source).y)
      .attr("x2", d => nodeRef(d.target).x)
      .attr("y2", d => nodeRef(d.target).y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  }
  function nodeRef(ref){ return (typeof ref === "object") ? ref : nodes.find(n=>n.id===ref); }

  requestAnimationFrame(()=>zoomToFit());
}

function zoomToFit(){
  if(!zoomHost || !svgG) return;
  const container = document.getElementById("graph");
  const width = container.clientWidth;
  const height = container.clientHeight;
  const bounds = svgG.node().getBBox();
  if(!bounds.width || !bounds.height) return;
  const scale = Math.max(0.35, Math.min(2.6, 0.92 / Math.max(bounds.width/width, bounds.height/height)));
  const tx = (width/2) - scale*(bounds.x + bounds.width/2);
  const ty = (height/2) - scale*(bounds.y + bounds.height/2);
  zoomHost.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
}
function refreshGraph(){ initGraph(); }

// --- Export/Import ---
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function exportEventsJSON(){ downloadJSON(ALL.map(e=>e._raw), "events-export.json"); }
function computeModelFromEvents(){
  const map = new Map();
  FILTERED.forEach(e=>{
    const key = e.dimension + "|" + e.cat;
    if(!map.has(key)){
      map.set(key, {dimension:e.dimension, cat:e.cat, sum:0, n:0, maxLik:"tveksamt"});
    }
    const o = map.get(key);
    o.sum += eventWeight(e);
    o.n += 1;
    const cur = byKey(LIKELIHOOD, o.maxLik)?.rank ?? 1;
    const nxt = byKey(LIKELIHOOD, e.likelihood)?.rank ?? 1;
    if(nxt > cur) o.maxLik = e.likelihood;
  });

  const phenomena = [];
  for(const o of map.values()){
    const avg = o.n ? (o.sum/o.n) : 0;
    const riskApprox = clamp(Math.round(avg), 1, 5);
    phenomena.push({
      id: o.dimension.slice(0,1) + "_" + o.cat,
      dimension: o.dimension,
      name: `${o.cat} (${o.n} st)`,
      likelihood: o.maxLik,
      risk: riskApprox,
      note: "Skapad från EVENTS-urval."
    });
  }

  const links = [];
  const byCountry = new Map();
  FILTERED.forEach(e=>{
    if(!byCountry.has(e.country)) byCountry.set(e.country, new Set());
    byCountry.get(e.country).add(e.dimension.slice(0,1) + "_" + e.cat);
  });
  for(const setIds of byCountry.values()){
    const ids = Array.from(setIds);
    for(let i=0;i<ids.length;i++){
      for(let j=i+1;j<ids.length;j++){
        links.push({source: ids[i], target: ids[j]});
      }
    }
  }
  const s = new Set(); const uniq = [];
  for(const l of links){
    const a = l.source < l.target ? l.source : l.target;
    const b = l.source < l.target ? l.target : l.source;
    const key = a + "|" + b;
    if(s.has(key)) continue;
    s.add(key);
    uniq.push({source:a,target:b});
  }

  return {phenomena, links};
}
function exportModelJSON(){ downloadJSON(computeModelFromEvents(), "intentioner-data.json"); }

async function importEventsJSON(file){
  const txt = await file.text();
  const arr = JSON.parse(txt);
  if(!Array.isArray(arr)) throw new Error("Import: väntade en array av events");
  ALL = arr.map(normalizeEvent).filter(e=>e.cat);
  document.getElementById("selCat").innerHTML = '<option value="ALL" selected>Alla</option>';
  document.getElementById("selCountry").innerHTML = '<option value="ALL" selected>Alla</option>';
  initUI();
  refresh();
}

// --- Refresh ---
function refresh(){
  applyFilters();
  renderModel();
  renderTimeline();
  renderList();
  refreshGraph();
}

// --- Boot ---
function boot(){
  if(!window.EVENTS || !Array.isArray(window.EVENTS)){
    alert("EVENTS saknas. Lägg in en EVENTS-array i events.js som const EVENTS = [...]");
    return;
  }
  ALL = window.EVENTS.map(normalizeEvent).filter(e=>e.cat);
  initUI();
  refresh();
}
boot();
