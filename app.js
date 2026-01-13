// INTENTIONER – interaktiv modell (GitHub Pages, statisk)
// D3 används för länkdiagram (force layout). Inga build-verktyg behövs.

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

const SCENARIO_FILTERS = {
  best:   new Set(["bekraftat"]),
  likely: new Set(["bekraftat","sannolikt"]),
  worst:  new Set(["bekraftat","sannolikt","troligt","mojligt","tveksamt"]),
};

// FIX: scenario labels (tidigare användes byKey felaktigt på ett object)
const SCENARIO_LABEL = {
  best: "Bästa",
  likely: "Troligast",
  worst: "Värsta",
};

// --- State ---
let state = {
  data: null,
  dim: "intention",
  scenario: "likely",
  minLikelihood: "bekraftat",
  clamp: false,
  linkMode: false,
  selectedPhen: null,
  hover: null,
  pendingLink: null,
};

// --- Helpers ---
function byKey(arr, key){ return arr.find(d => d.key === key); }
function esc(s){ return (s ?? "").toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function uuid(){ return "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16); }

function likelihoodAllowed(phen){
  const minRank = byKey(LIKELIHOOD, state.minLikelihood).rank;
  const r = byKey(LIKELIHOOD, phen.likelihood)?.rank ?? 1;
  return r >= minRank;
}

function scenarioAllowed(phen){
  return SCENARIO_FILTERS[state.scenario].has(phen.likelihood);
}

function phenPercent(phen){
  const w = byKey(LIKELIHOOD, phen.likelihood)?.w ?? 0;
  return (phen.risk ?? 1) * w * 20;
}

function dimStats(dimKey){
  const phen = state.data.phenomena.filter(p => p.dimension === dimKey);
  const filtered = phen.filter(p => scenarioAllowed(p) && likelihoodAllowed(p));
  if(!filtered.length){
    return { mean: 0, max: 0, n: 0, all: phen.length };
  }
  const vals = filtered.map(phenPercent);
  const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
  const max = Math.max(...vals);
  return { mean, max, n: filtered.length, all: phen.length };
}

function totalStats(){
  const per = DIMENSIONS.map(d => ({ dim: d.key, ...dimStats(d.key) }));
  const means = per.map(d => d.mean);
  const total = means.reduce((a,b)=>a+b,0) / means.length;
  return { per, total };
}

function clamp100(x){
  if(!state.clamp) return x;
  return Math.max(0, Math.min(100, x));
}

function fmtPct(x){
  const v = clamp100(x);
  const s = (Math.round(v * 10) / 10).toString().replace(".", ",");
  return s + "%";
}

function updateOverview(){
  const savedScenario = state.scenario;

  state.scenario = "best";
  const best = totalStats().total;

  state.scenario = "likely";
  const likely = totalStats().total;

  state.scenario = "worst";
  const worst = totalStats().total;

  state.scenario = savedScenario;

  document.getElementById("capBest").textContent = fmtPct(best);
  document.getElementById("capLikely").textContent = fmtPct(likely);
  document.getElementById("capWorst").textContent = fmtPct(worst);

  document.getElementById("phenCount").textContent = state.data.phenomena.length.toString();
  document.getElementById("pillDim").textContent = byKey(DIMENSIONS, state.dim).label;
  document.getElementById("pillMode").textContent = state.linkMode ? "Länkläge" : "Länkdiagram";

  renderRadar();
}

function renderPhenList(){
  const wrap = document.getElementById("phenList");
  const q = (document.getElementById("txtSearch").value || "").trim().toLowerCase();
  const items = state.data.phenomena
    .filter(p => p.dimension === state.dim)
    .filter(p => !q || (p.name||"").toLowerCase().includes(q) || (p.note||"").toLowerCase().includes(q))
    .sort((a,b)=> (b.risk||1)-(a.risk||1));

  wrap.innerHTML = "";
  for(const p of items){
    const lik = byKey(LIKELIHOOD, p.likelihood);
    const el = document.createElement("div");
    el.className = "item";
    el.dataset.id = p.id;
    el.innerHTML = `
      <div>
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${lik?.label ?? "–"} · risk ${p.risk ?? 1} · ${fmtPct(phenPercent(p))}</div>
      </div>
      <div class="badge">${esc(p.id)}</div>
    `;
    el.addEventListener("click", () => selectPhen(p.id));
    wrap.appendChild(el);
  }
}

function selectPhen(id){
  state.selectedPhen = id;
  const p = state.data.phenomena.find(x => x.id === id);
  if(!p) return;
  const ed = document.getElementById("editor");
  ed.hidden = false;

  document.getElementById("edName").value = p.name || "";
  document.getElementById("edLik").value = p.likelihood || "tveksamt";
  document.getElementById("edRisk").value = p.risk || 1;
  document.getElementById("edRiskVal").textContent = String(p.risk || 1);
  document.getElementById("edNote").value = p.note || "";

  highlightNode(id);
}

function commitEditor(){
  const id = state.selectedPhen;
  const p = state.data.phenomena.find(x => x.id === id);
  if(!p) return;
  p.name = document.getElementById("edName").value.trim() || p.name;
  p.likelihood = document.getElementById("edLik").value;
  p.risk = parseInt(document.getElementById("edRisk").value, 10);
  p.note = document.getElementById("edNote").value;

  updateOverview();
  renderPhenList();
  updateGraph();
}

function deleteSelected(){
  const id = state.selectedPhen;
  if(!id) return;
  state.data.phenomena = state.data.phenomena.filter(p => p.id !== id);
  state.data.links = (state.data.links || []).filter(l => l.source !== id && l.target !== id);

  state.selectedPhen = null;
  document.getElementById("editor").hidden = true;

  updateOverview();
  renderPhenList();
  initGraph();
}

function addPhen(){
  const p = {
    id: uuid(),
    dimension: state.dim,
    name: "Nytt fenomen",
    likelihood: "tveksamt",
    risk: 1,
    note: ""
  };
  state.data.phenomena.unshift(p);
  updateOverview();
  renderPhenList();
  initGraph();
  selectPhen(p.id);
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state.data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "intentioner-data.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

async function importJSON(file){
  const txt = await file.text();
  const data = JSON.parse(txt);
  validateData(data);
  state.data = data;
  state.selectedPhen = null;
  document.getElementById("editor").hidden = true;
  updateOverview();
  rebuildDimensionSelect();
  renderPhenList();
  initGraph();
}

function validateData(d){
  if(!d || !Array.isArray(d.phenomena)) throw new Error("Ogiltig data: phenomena saknas");
  if(!Array.isArray(d.links)) d.links = [];
  for(const p of d.phenomena){
    if(!p.id) p.id = uuid();
    if(!p.dimension) p.dimension = "intention";
    if(!p.likelihood) p.likelihood = "tveksamt";
    if(!p.risk) p.risk = 1;
  }
}

function rebuildDimensionSelect(){
  const sel = document.getElementById("selDimension");
  sel.innerHTML = "";
  for(const d of DIMENSIONS){
    const opt = document.createElement("option");
    opt.value = d.key;
    opt.textContent = d.label;
    sel.appendChild(opt);
  }
  sel.value = state.dim;
}

// --- Radar (enkelt SVG) ---
function renderRadar(){
  const svg = d3.select("#radar");
  svg.selectAll("*").remove();

  const w = 360, h = 320;
  const cx = w/2, cy = 150;
  const r = 110;

  const axes = DIMENSIONS.map(d => ({...d, v: clamp100(dimStats(d.key).mean)}));

  const levels = [20,40,60,80,100];
  for(const lv of levels){
    svg.append("circle")
      .attr("cx", cx).attr("cy", cy)
      .attr("r", r*(lv/100))
      .attr("fill","none")
      .attr("stroke","rgba(38,50,74,.8)")
      .attr("stroke-dasharray","3,3");

    svg.append("text")
      .attr("x", cx + r*(lv/100) + 6)
      .attr("y", cy + 4)
      .attr("fill","rgba(138,151,178,.9)")
      .attr("font-size","10")
      .text(lv + "%");
  }

  const angle = (2*Math.PI) / axes.length;
  axes.forEach((a,i)=>{
    const ang = -Math.PI/2 + i*angle;
    const x = cx + Math.cos(ang)*r;
    const y = cy + Math.sin(ang)*r;

    svg.append("line")
      .attr("x1", cx).attr("y1", cy)
      .attr("x2", x).attr("y2", y)
      .attr("stroke","rgba(38,50,74,.9)");

    const lx = cx + Math.cos(ang)*(r+26);
    const ly = cy + Math.sin(ang)*(r+26);

    svg.append("text")
      .attr("x", lx).attr("y", ly)
      .attr("text-anchor", (Math.cos(ang) > 0.2) ? "start" : (Math.cos(ang) < -0.2 ? "end" : "middle"))
      .attr("fill","rgba(231,236,247,.92)")
      .attr("font-size","11")
      .text(a.label);
  });

  const pts = axes.map((a,i)=>{
    const ang = -Math.PI/2 + i*angle;
    const rr = r*(a.v/100);
    return [cx + Math.cos(ang)*rr, cy + Math.sin(ang)*rr];
  });

  svg.append("polygon")
    .attr("points", pts.map(p=>p.join(",")).join(" "))
    .attr("fill", "rgba(122,162,255,.20)")
    .attr("stroke", "rgba(122,162,255,.9)")
    .attr("stroke-width", 2);

  pts.forEach((p,i)=>{
    svg.append("circle")
      .attr("cx", p[0]).attr("cy", p[1])
      .attr("r", 4)
      .attr("fill", "rgba(122,162,255,.95)");

    svg.append("text")
      .attr("x", p[0]).attr("y", p[1]-8)
      .attr("text-anchor","middle")
      .attr("fill","rgba(231,236,247,.9)")
      .attr("font-size","10")
      .text(Math.round(axes[i].v) + "%");
  });

  // FIX: använd SCENARIO_LABEL istället för byKey på object
  svg.append("text")
    .attr("x", 12).attr("y", 300)
    .attr("fill","rgba(138,151,178,.95)")
    .attr("font-size","11")
    .text(`Scenario: ${SCENARIO_LABEL[state.scenario] || state.scenario}`);
}

// --- Graph (D3 force) ---
let sim = null;
let svgG = null;
let zoom = null;

function buildGraphData(){
  const dimNodes = DIMENSIONS.map(d => ({
    id: d.key,
    type: "dimension",
    label: d.label,
    likelihood: null,
    risk: null,
    dimension: d.key,
  }));

  const phenNodes = state.data.phenomena.map(p => ({
    id: p.id,
    type: "phenomenon",
    label: p.name,
    likelihood: p.likelihood,
    risk: p.risk,
    dimension: p.dimension,
  }));

  const nodes = [...dimNodes, ...phenNodes];

  const links = [];
  for(const p of state.data.phenomena){
    links.push({ source: p.dimension, target: p.id, kind: "belongs" });
  }
  for(const l of (state.data.links || [])){
    links.push({ source: l.source, target: l.target, kind: "custom" });
  }

  return { nodes, links };
}

function nodeColor(n){
  if(n.type === "dimension") return "rgba(17,23,37,.9)";
  const lik = byKey(LIKELIHOOD, n.likelihood);
  return lik ? lik.color : "#ffffff";
}

function nodeStroke(n){
  if(n.type === "dimension") return "rgba(122,162,255,.45)";
  const allowed = scenarioAllowed({likelihood:n.likelihood}) && likelihoodAllowed({likelihood:n.likelihood});
  return allowed ? "rgba(231,236,247,.55)" : "rgba(138,151,178,.35)";
}

function nodeOpacity(n){
  if(n.type === "dimension") return 1;
  const inDim = (state.dim === "all") ? true : n.dimension === state.dim;
  if(!inDim) return 0.25;
  const allowed = scenarioAllowed({likelihood:n.likelihood}) && likelihoodAllowed({likelihood:n.likelihood});
  return allowed ? 1 : 0.35;
}

function initGraph(){
  const container = document.getElementById("graph");
  container.innerHTML = "";

  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select(container).append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g");
  svgG = g;

  zoom = d3.zoom()
    .scaleExtent([0.4, 2.8])
    .on("zoom", (event) => g.attr("transform", event.transform));

  svg.call(zoom);

  const { nodes, links } = buildGraphData();

  const link = g.append("g")
    .attr("stroke", "rgba(138,151,178,.55)")
    .attr("stroke-width", 1.2)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", d => "lnk " + d.kind);

  const node = g.append("g")
    .selectAll("g")
    .data(nodes, d => d.id)
    .join("g")
    .attr("class", d => "node " + d.type);

  node.append("circle")
    .attr("r", d => d.type === "dimension" ? 18 : 10)
    .attr("fill", d => nodeColor(d))
    .attr("stroke", d => nodeStroke(d))
    .attr("stroke-width", 2)
    .attr("opacity", d => nodeOpacity(d));

  node.append("text")
    .attr("x", d => d.type === "dimension" ? 24 : 14)
    .attr("y", 4)
    .attr("fill", "rgba(231,236,247,.92)")
    .attr("font-size", 11)
    .text(d => d.label);

  node.on("click", (event, d) => {
    event.stopPropagation();
    if(d.type === "phenomenon"){
      if(state.linkMode){
        handleLinkClick(d.id);
      } else {
        selectPhen(d.id);
      }
    } else {
      state.dim = d.id;
      document.getElementById("selDimension").value = state.dim;
      renderPhenList();
      updateOverview();
      updateGraph();
    }
  });

  node.on("mouseover", (event, d) => {
    state.hover = d.id;
    updateGraph();
  }).on("mouseout", () => {
    state.hover = null;
    updateGraph();
  });

  svg.on("click", () => {
    state.pendingLink = null;
    updateGraph();
  });

  sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(l => l.kind === "custom" ? 90 : 55))
    .force("charge", d3.forceManyBody().strength(-320))
    .force("center", d3.forceCenter(width/2, height/2))
    .force("collide", d3.forceCollide().radius(d => d.type === "dimension" ? 32 : 18))
    .on("tick", ticked);

  function ticked(){
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node.attr("transform", d => `translate(${d.x},${d.y})`);
  }

  requestAnimationFrame(()=>zoomToFit(svg, g, width, height));
  updateGraph();
}

function zoomToFit(svg, g, width, height){
  const bounds = g.node().getBBox();
  if(!bounds.width || !bounds.height) return;
  const scale = Math.max(0.45, Math.min(2.2, 0.9 / Math.max(bounds.width/width, bounds.height/height)));
  const tx = (width/2) - scale*(bounds.x + bounds.width/2);
  const ty = (height/2) - scale*(bounds.y + bounds.height/2);
  svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(scale));
}

function updateGraph(){
  if(!svgG) return;

  svgG.selectAll("g.node circle")
    .attr("stroke", d => {
      const base = nodeStroke(d);
      if(state.hover && d.id === state.hover) return "rgba(122,162,255,.95)";
      if(state.pendingLink && d.id === state.pendingLink) return "rgba(92,225,182,.95)";
      if(state.selectedPhen && d.id === state.selectedPhen) return "rgba(122,162,255,.95)";
      return base;
    })
    .attr("opacity", d => nodeOpacity(d));

  svgG.selectAll("line.lnk.belongs")
    .attr("stroke", "rgba(138,151,178,.35)")
    .attr("opacity", d => {
      const t = d.target;
      if(t && t.type === "phenomenon"){
        const inDim = (state.dim === "all") ? true : t.dimension === state.dim;
        return inDim ? 0.55 : 0.18;
      }
      return 0.35;
    });

  svgG.selectAll("line.lnk.custom")
    .attr("stroke", "rgba(92,225,182,.75)")
    .attr("stroke-width", 1.6)
    .attr("opacity", 0.85);
}

function highlightNode(id){
  state.selectedPhen = id;
  updateGraph();
}

function handleLinkClick(id){
  if(!state.pendingLink){
    state.pendingLink = id;
    updateGraph();
    return;
  }
  const a = state.pendingLink;
  const b = id;
  state.pendingLink = null;

  if(a === b){
    updateGraph();
    return;
  }

  const links = state.data.links || [];
  const idx = links.findIndex(l => (l.source === a && l.target === b) || (l.source === b && l.target === a));
  if(idx >= 0){
    links.splice(idx, 1);
  } else {
    links.push({ source: a, target: b });
  }
  state.data.links = links;

  initGraph();
}

// --- Boot ---
async function boot(){
  const res = await fetch("data.json", {cache:"no-store"});
  const data = await res.json();
  validateData(data);
  state.data = data;

  rebuildDimensionSelect();

  document.getElementById("selDimension").addEventListener("change", (e)=>{
    state.dim = e.target.value;
    renderPhenList();
    updateOverview();
    updateGraph();
  });

  document.getElementById("selScenario").addEventListener("change", (e)=>{
    state.scenario = e.target.value;
    updateOverview();
    updateGraph();
  });

  document.getElementById("selMinLikelihood").addEventListener("change", (e)=>{
    state.minLikelihood = e.target.value;
    updateOverview();
    updateGraph();
  });

  document.getElementById("chkClamp").addEventListener("change", (e)=>{
    state.clamp = e.target.checked;
    updateOverview();
    renderPhenList();
    updateGraph();
  });

  document.getElementById("chkLinkMode").addEventListener("change", (e)=>{
    state.linkMode = e.target.checked;
    state.pendingLink = null;
    updateOverview();
    updateGraph();
  });

  document.getElementById("txtSearch").addEventListener("input", ()=>renderPhenList());
  document.getElementById("btnAdd").addEventListener("click", ()=>addPhen());

  document.getElementById("edName").addEventListener("input", commitEditor);
  document.getElementById("edLik").addEventListener("change", commitEditor);
  document.getElementById("edRisk").addEventListener("input", ()=>{
    document.getElementById("edRiskVal").textContent = document.getElementById("edRisk").value;
    commitEditor();
  });
  document.getElementById("edNote").addEventListener("input", commitEditor);

  document.getElementById("btnDelete").addEventListener("click", deleteSelected);
  document.getElementById("btnDone").addEventListener("click", ()=>{
    document.getElementById("editor").hidden = true;
    state.selectedPhen = null;
    updateGraph();
  });

  document.getElementById("btnExport").addEventListener("click", exportJSON);
  document.getElementById("fileImport").addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJSON(f).catch(err => alert(err.message));
    e.target.value = "";
  });

  document.getElementById("btnReset").addEventListener("click", ()=>{
    const container = document.getElementById("graph");
    const svg = d3.select(container).select("svg");
    if(svg.empty()) return;
    zoomToFit(svg, svgG, container.clientWidth, container.clientHeight);
  });

  updateOverview();
  renderPhenList();
  initGraph();

  window.addEventListener("resize", ()=>{
    initGraph();
  });
}

boot().catch(err => {
  console.error(err);
  alert("Kunde inte ladda data.json: " + err.message);
});
