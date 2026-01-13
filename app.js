(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ========= Data =========
  const RAW = Array.isArray(window.EVENTS) ? window.EVENTS : [];
  if (!RAW.length) {
    alert("EVENTS saknas. Kontrollera events.js och att den slutar med window.EVENTS = EVENTS;");
  }

  const DATA = RAW.map((e, idx) => ({
    idx,
    cat: (e.cat || e.category || "").toString().trim(),
    country: (e.country || e.land || "").toString().trim(),
    title: (e.title || e.name || "").toString(),
    summary: (e.summary || e.desc || e.description || "").toString(),
    url: (e.url || e.link || "").toString(),
    date: (e.date || e.time || "").toString(),
  }));

  // ========= UI helpers =========
  const normalizeStr = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  function escapeHtml(s) {
    return (s || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseDate(d) {
    if (!d) return null;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function fmtDate(dt) {
    if (!dt) return "–";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // ========= Filters =========
  function fillSelect(sel, arr) {
    sel.innerHTML = "";
    arr.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
  }

  const dates = DATA.map((e) => parseDate(e.date)).filter(Boolean).sort((a, b) => a - b);
  const minDt = dates[0] || null;
  const maxDt = dates[dates.length - 1] || null;

  function initFilters() {
    const cats = ["Alla", ...Array.from(new Set(DATA.map((e) => e.cat).filter(Boolean))).sort()];
    const ctrs = ["Alla", ...Array.from(new Set(DATA.map((e) => e.country).filter(Boolean))).sort()];
    fillSelect($("#cat"), cats);
    fillSelect($("#country"), ctrs);

    if (minDt) $("#dFrom").value = fmtDate(minDt);
    if (maxDt) $("#dTo").value = fmtDate(maxDt);

    $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
    $("#kwMin").value = "3";
    $("#limitVal").textContent = `${$("#limit").value} st`;
    $("#kwMinVal").textContent = `${$("#kwMin").value}`;
  }

  function applyFilters() {
    $("#limitVal").textContent = `${$("#limit").value} st`;
    $("#kwMinVal").textContent = `${$("#kwMin").value}`;

    const q = normalizeStr($("#q").value || "");
    const cat = $("#cat").value || "Alla";
    const country = $("#country").value || "Alla";
    const from = parseDate($("#dFrom").value || "");
    const to = parseDate($("#dTo").value || "");
    const limit = Number($("#limit").value || 600);

    let out = DATA.filter((e) => {
      if (cat !== "Alla" && e.cat !== cat) return false;
      if (country !== "Alla" && e.country !== country) return false;

      const dt = parseDate(e.date);
      if (from && dt && dt < from) return false;
      if (to && dt && dt > to) return false;

      if (q) {
        const hay = normalizeStr(`${e.title} ${e.summary} ${e.cat} ${e.country}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (out.length > limit) out = out.slice(0, limit);

    $("#pillCount").textContent = `${out.length} i filter`;
    $("#subTitle").textContent = `${DATA.length} events totalt`;

    return out;
  }

  // ========= Scope (urval från graf) =========
  let SCOPE = { type: "all", label: "Alla", idxSet: null };

  function setScopeAll() {
    SCOPE = { type: "all", label: "Alla", idxSet: null };
    $("#pillScope").textContent = "Urval: Alla";
    $("#pillSel").textContent = "–";
    $("#detail").innerHTML = "Klicka nod i grafen för att sätta urval (påverkar intentioner-fliken).";
    refreshAll();
  }

  // ========= Intentions: mapping from categories =========
  const CAT_TO_DIM = {
    HYBRID: "Intentioner",
    POLICY: "Intentioner",
    TERROR: "Intentioner",
    INTEL: "Facilitering",
    LEGAL: "Facilitering",
    MIL: "Resurser",
    MAR: "Resurser",
    INFRA: "Resurser",
    NUCLEAR: "Resurser",
    DRONE: "Tillfälle",
    GPS: "Tillfälle",
  };

  const DIM_ORDER = ["Intentioner", "Facilitering", "Resurser", "Tillfälle"];

  function computeAutoDims(events) {
    const counts = { Intentioner: 0, Facilitering: 0, Resurser: 0, "Tillfälle": 0 };
    for (const e of events) {
      const dim = CAT_TO_DIM[e.cat] || "Intentioner";
      counts[dim] = (counts[dim] || 0) + 1;
    }
    const total = Math.max(1, events.length);
    // 0–100: andel per dimension
    const pct = {};
    DIM_ORDER.forEach((d) => (pct[d] = Math.round((counts[d] / total) * 100)));
    return { counts, pct };
  }

  // ========= Manual sliders logic =========
  let MODE = "auto"; // auto | manual | mix
  let manual = { Intentioner: 0, Facilitering: 0, Resurser: 0, "Tillfälle": 0 }; // values 0-100 (manual OR offset)

  function setMode(m) {
    MODE = m;
    $("#kMode").textContent = MODE === "auto" ? "Auto" : MODE === "manual" ? "Manuell" : "Mix";

    // segment UI
    ["auto","manual","mix"].forEach((x)=>{
      const el = document.getElementById("mode"+x[0].toUpperCase()+x.slice(1));
      if(el) el.classList.toggle("active", MODE===x);
    });

    const lock = MODE === "auto";
    ["sInt","sFac","sRes","sTil"].forEach(id=>{
      const s = document.getElementById(id);
      if(s) s.disabled = lock;
    });

    renderIntentioner(); // re-render
  }

  function readManualFromSliders(){
    manual.Intentioner = Number($("#sInt").value || 0);
    manual.Facilitering = Number($("#sFac").value || 0);
    manual.Resurser = Number($("#sRes").value || 0);
    manual["Tillfälle"] = Number($("#sTil").value || 0);
  }

  function writeSliders(vals){
    // vals: {Intentioner, Facilitering, Resurser, Tillfälle}
    $("#sInt").value = String(vals.Intentioner);
    $("#sFac").value = String(vals.Facilitering);
    $("#sRes").value = String(vals.Resurser);
    $("#sTil").value = String(vals["Tillfälle"]);
    updateSliderVisuals(vals);
  }

  function updateSliderVisuals(vals){
    $("#vInt").textContent = String(vals.Intentioner);
    $("#vFac").textContent = String(vals.Facilitering);
    $("#vRes").textContent = String(vals.Resurser);
    $("#vTil").textContent = String(vals["Tillfälle"]);

    $("#fInt").style.width = `${vals.Intentioner}%`;
    $("#fFac").style.width = `${vals.Facilitering}%`;
    $("#fRes").style.width = `${vals.Resurser}%`;
    $("#fTil").style.width = `${vals["Tillfälle"]}%`;
  }

  function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }

  function mixAutoManual(autoPct){
    // MODE = mix: manual values are offsets in [-50..+50] ideally.
    // men sliders är 0–100. Vi mappar 0..100 till -50..+50.
    const off = {
      Intentioner: (manual.Intentioner - 50),
      Facilitering: (manual.Facilitering - 50),
      Resurser: (manual.Resurser - 50),
      "Tillfälle": (manual["Tillfälle"] - 50),
    };
    const mixed = {};
    DIM_ORDER.forEach(d=>{
      mixed[d] = clamp(Math.round(autoPct[d] + off[d]), 0, 100);
    });
    return mixed;
  }

  function getScopedEvents(filtered){
    if(SCOPE.idxSet && SCOPE.idxSet.size){
      const idxSet = SCOPE.idxSet;
      // idxSet innehåller DATA.idx (originalindex)
      return filtered.filter(e => idxSet.has(e.idx));
    }
    return filtered;
  }

  function renderRadar(vals){
    const el = $("#radar");
    if(!el || !window.d3) return;

    const svg = d3.select(el);
    svg.selectAll("*").remove();

    const W=360, H=300;
    const cx=W/2, cy=150, R=110;
    const axes = DIM_ORDER.length;
    const ang = (i)=> (Math.PI*2*i)/axes - Math.PI/2;

    [0.25,0.5,0.75,1].forEach(rr=>{
      svg.append("circle")
        .attr("cx",cx).attr("cy",cy).attr("r",R*rr)
        .attr("fill","none")
        .attr("stroke","rgba(255,255,255,.10)");
    });

    DIM_ORDER.forEach((lab,i)=>{
      const a=ang(i);
      svg.append("line")
        .attr("x1",cx).attr("y1",cy)
        .attr("x2",cx+Math.cos(a)*R).attr("y2",cy+Math.sin(a)*R)
        .attr("stroke","rgba(255,255,255,.12)");
      svg.append("text")
        .attr("x",cx+Math.cos(a)*(R+18))
        .attr("y",cy+Math.sin(a)*(R+18))
        .attr("fill","rgba(219,231,255,.78)")
        .attr("font-size",11)
        .attr("text-anchor", Math.cos(a)>0.2 ? "start" : (Math.cos(a)<-0.2 ? "end":"middle"))
        .attr("dominant-baseline","middle")
        .text(lab);
    });

    const pts = DIM_ORDER.map((d,i)=>{
      const v = clamp(vals[d]/100, 0, 1);
      const a = ang(i);
      return [cx+Math.cos(a)*R*v, cy+Math.sin(a)*R*v];
    });

    svg.append("polygon")
      .attr("points", pts.map(p=>p.join(",")).join(" "))
      .attr("fill","rgba(219,231,255,.14)")
      .attr("stroke","rgba(219,231,255,.55)")
      .attr("stroke-width",1.2);
  }

  function renderTopList(events){
    // enkel "bidragslista": sortera på längd summary + cat weight (placeholder men stabil)
    const list = $("#topList");
    if(!list) return;
    list.innerHTML = "";

    const weight = {
      TERROR: 10, INFRA: 9, NUCLEAR: 9, MIL: 8, INTEL: 7, HYBRID: 6, DRONE: 6, GPS: 6, POLICY: 4, LEGAL: 4, MAR: 6
    };

    const top = [...events]
      .map(e=>({e, score:(weight[e.cat]||5) + Math.min(5, (e.summary||"").length/300)}))
      .sort((a,b)=>b.score-a.score)
      .slice(0,12);

    top.forEach(({e,score})=>{
      const div = document.createElement("div");
      div.className="item";
      div.innerHTML = `
        <div class="it">${escapeHtml(e.title || "Event")}</div>
        <div class="im">${escapeHtml(e.cat||"–")} • ${escapeHtml(e.country||"–")} • ${escapeHtml(e.date||"–")} • score ${score.toFixed(1)}</div>
        <div class="im">${escapeHtml((e.summary||"").slice(0,240))}${(e.summary||"").length>240?"…":""}</div>
        ${e.url?`<a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>`:""}
      `;
      list.appendChild(div);
    });
  }

  function renderIntentioner(){
    const filtered = applyFilters();
    const scoped = getScopedEvents(filtered);

    $("#kEvents").textContent = String(scoped.length);
    $("#pillIntent").textContent = `Urval: ${SCOPE.label} • ${scoped.length} events`;

    const auto = computeAutoDims(scoped);

    let vals;
    if(MODE === "auto"){
      vals = {
        Intentioner: auto.pct.Intentioner,
        Facilitering: auto.pct.Facilitering,
        Resurser: auto.pct.Resurser,
        "Tillfälle": auto.pct["Tillfälle"]
      };
      // lås/sliders visar auto
      writeSliders(vals);
    } else if(MODE === "manual"){
      readManualFromSliders();
      vals = { ...manual };
      updateSliderVisuals(vals);
    } else { // mix
      readManualFromSliders();
      vals = mixAutoManual(auto.pct);
      // i mix vill du se sliderna som offset, inte resultatet – så vi låter sliders ligga kvar,
      // men visar resultat i pill + radar.
      updateSliderVisuals(manual); // visar offset (0-100) i UI
    }

    // Score text
    const total = Math.round((vals.Intentioner + vals.Facilitering + vals.Resurser + vals["Tillfälle"]) / 4);
    $("#pillScore").textContent = `Index: ${total}%`;

    // Radar visar "vals" (i mix visar vi mixed, inte offset)
    if(MODE === "mix"){
      const mixed = mixAutoManual(auto.pct);
      renderRadar(mixed);
    } else {
      renderRadar(vals);
    }

    // Topp-lista: alltid auto-baserad (stabil)
    renderTopList(scoped);
  }

  // ========= D3 Graph =========
  let svg, gRoot, sim;

  function initGraph(){
    const host = $("#graph");
    host.innerHTML = "";
    const w = host.clientWidth || 900;
    const h = host.clientHeight || 600;

    svg = d3.select(host).append("svg").attr("width", w).attr("height", h);
    gRoot = svg.append("g");
    gRoot.append("g").attr("class","links");
    gRoot.append("g").attr("class","nodes");

    const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev)=> gRoot.attr("transform", ev.transform));
    svg.call(zoom);

    new ResizeObserver(()=>{
      const ww = host.clientWidth || 900;
      const hh = host.clientHeight || 600;
      svg.attr("width", ww).attr("height", hh);
      if(sim){
        sim.force("center", d3.forceCenter(ww/2, hh/2));
        sim.alpha(0.25).restart();
      }
    }).observe(host);

    on($("#btnZoomFit"), "click", ()=> svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity));
  }

  function buildGraph(events){
    const nodes = [];
    const links = [];
    const byId = new Map();

    const add = (id, obj)=>{
      if(byId.has(id)) return byId.get(id);
      const n = { id, ...obj };
      byId.set(id,n);
      nodes.push(n);
      return n;
    };

    const cats = Array.from(new Set(events.map(e=>e.cat).filter(Boolean)));
    const ctrs = Array.from(new Set(events.map(e=>e.country).filter(Boolean)));

    cats.forEach(c=> add("cat:"+c, {type:"cat", label:c}));
    ctrs.forEach(c=> add("ctry:"+c, {type:"ctry", label:c}));

    events.forEach(e=>{
      const id = "ev:"+e.idx;
      add(id, {type:"ev", label:e.title || "Event", ev:e});
      if(e.cat) links.push({source:id, target:"cat:"+e.cat});
      if(e.country) links.push({source:id, target:"ctry:"+e.country});
    });

    return {nodes, links};
  }

  function renderGraph(model){
    const host = $("#graph");
    const w = host.clientWidth || 900;
    const h = host.clientHeight || 600;

    const linkSel = gRoot.select("g.links").selectAll("line").data(model.links);
    linkSel.exit().remove();
    linkSel.enter()
      .append("line")
      .attr("stroke","rgba(255,255,255,.16)")
      .attr("stroke-width",1);

    const nodeSel = gRoot.select("g.nodes").selectAll("circle").data(model.nodes, d=>d.id);
    nodeSel.exit().remove();

    const enter = nodeSel.enter()
      .append("circle")
      .attr("r", d=> d.type==="ev" ? 4 : 11)
      .attr("fill","rgba(255,255,255,.06)")
      .attr("stroke","rgba(219,231,255,.75)")
      .attr("stroke-width",1.1)
      .attr("cursor","pointer")
      .call(d3.drag()
        .on("start",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0.25).restart(); d.fx=d.x; d.fy=d.y; })
        .on("drag",(ev,d)=>{ d.fx=ev.x; d.fy=ev.y; })
        .on("end",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0); })
      )
      .on("click",(_,d)=> onGraphClick(d, model));

    const nodesAll = enter.merge(nodeSel);

    if(sim) sim.stop();
    sim = d3.forceSimulation(model.nodes)
      .force("link", d3.forceLink(model.links).id(d=>d.id).distance(62).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(w/2, h/2))
      .force("collide", d3.forceCollide().radius(d=> d.type==="ev"?7:18))
      .on("tick", ()=>{
        gRoot.select("g.links").selectAll("line")
          .attr("x1", d=>d.source.x).attr("y1", d=>d.source.y)
          .attr("x2", d=>d.target.x).attr("y2", d=>d.target.y);

        nodesAll.attr("cx", d=>d.x).attr("cy", d=>d.y);
      });

    $("#hudInfo").textContent = `${model.nodes.length} noder • ${model.links.length} länkar`;
  }

  function onGraphClick(d, model){
    if(d.type === "ev"){
      const e = d.ev;
      $("#pillSel").textContent = "event";
      $("#detail").innerHTML =
        `<b>${escapeHtml(e.title||"Event")}</b><br>`+
        `<span class="small">${escapeHtml(e.cat||"–")} • ${escapeHtml(e.country||"–")} • ${escapeHtml(e.date||"–")}</span><br>`+
        `${escapeHtml((e.summary||"").slice(0,280))}${(e.summary||"").length>280?"…":""}`+
        (e.url?`<br><a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>`:"");

      SCOPE = { type:"event", label: e.title || "Event", idxSet: new Set([e.idx]) };
      $("#pillScope").textContent = `Urval: ${SCOPE.label}`;
    } else {
      $("#pillSel").textContent = d.type==="cat" ? "kategori" : "land";

      const id = d.id;
      const evIds = new Set(
        model.links
          .filter(l => (l.source.id||l.source)===id || (l.target.id||l.target)===id)
          .map(l => ((l.source.id||l.source)===id ? (l.target.id||l.target) : (l.source.id||l.source)))
          .filter(x => String(x).startsWith("ev:"))
      );

      const idxSet = new Set();
      for(const evId of evIds){
        const m = String(evId).match(/^ev:(\d+)$/);
        if(m) idxSet.add(Number(m[1]));
      }

      SCOPE = { type:d.type, label:d.label, idxSet };
      $("#pillScope").textContent = `Urval: ${SCOPE.label}`;
      $("#detail").innerHTML = `<b>${escapeHtml(d.label)}</b><br><span class="small">${idxSet.size} relaterade events</span>`;
    }

    // uppdatera intentioner direkt (oavsett flik)
    renderIntentioner();
  }

  // ========= Tabs + Fullscreen =========
  function setTab(which){
    $("#viewGraph").classList.toggle("active", which==="graph");
    $("#viewIntent").classList.toggle("active", which==="intent");
    $("#tabGraph").classList.toggle("active", which==="graph");
    $("#tabIntent").classList.toggle("active", which==="intent");
    // re-render efter tabbyte (d3 gillar inte hidden containers)
    setTimeout(()=>{ refreshAll(); }, 80);
  }

  async function toggleFullscreenAll(){
    const shell = document.getElementById("appShell");
    try{
      if(!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    }catch(e){}
    setTimeout(()=>{ refreshAll(); }, 120);
  }

  // ========= Master refresh =========
  function refreshAll(){
    const filtered = applyFilters();
    const scoped = getScopedEvents(filtered);

    // render graph
    if(!svg) initGraph();
    const model = buildGraph(filtered);
    renderGraph(model);

    // intentioner
    renderIntentioner();

    // mode UI text
    $("#kMode").textContent = MODE === "auto" ? "Auto" : MODE === "manual" ? "Manuell" : "Mix";
    $("#pillIntent").textContent = `Urval: ${SCOPE.label} • ${scoped.length} events`;
  }

  // ========= Init =========
  function bind(){
    on($("#tabGraph"), "click", ()=> setTab("graph"));
    on($("#tabIntent"), "click", ()=> setTab("intent"));

    on($("#btnFullscreen"), "click", toggleFullscreenAll);
    document.addEventListener("fullscreenchange", ()=>{
      $("#btnFullscreen").textContent = document.fullscreenElement ? "Avsluta helskärm" : "Helskärm (allt)";
      setTimeout(()=>refreshAll(), 120);
    });

    on($("#btnReset"), "click", ()=>{
      $("#q").value = "";
      $("#cat").value = "Alla";
      $("#country").value = "Alla";
      if(minDt) $("#dFrom").value = fmtDate(minDt);
      if(maxDt) $("#dTo").value = fmtDate(maxDt);
      $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
      $("#kwMin").value = "3";
      manual = { Intentioner: 0, Facilitering: 0, Resurser: 0, "Tillfälle": 0 };
      setMode("auto");
      setScopeAll();
      refreshAll();
    });

    on($("#btnClearScope"), "click", setScopeAll);

    ["input","change"].forEach(ev=>{
      on($("#q"), ev, refreshAll);
      on($("#dFrom"), ev, refreshAll);
      on($("#dTo"), ev, refreshAll);
      on($("#cat"), ev, refreshAll);
      on($("#country"), ev, refreshAll);
      on($("#limit"), ev, refreshAll);
      on($("#kwMin"), ev, refreshAll);
    });

    // mode segments
    on($("#modeAuto"), "click", ()=> setMode("auto"));
    on($("#modeManual"), "click", ()=> setMode("manual"));
    on($("#modeMix"), "click", ()=> {
      // i mix: default sätt sliders mitt (0 offset)
      if(MODE !== "mix"){
        $("#sInt").value = "50";
        $("#sFac").value = "50";
        $("#sRes").value = "50";
        $("#sTil").value = "50";
        readManualFromSliders();
      }
      setMode("mix");
    });

    // sliders
    ["input","change"].forEach(ev=>{
      on($("#sInt"), ev, ()=>{ readManualFromSliders(); renderIntentioner(); });
      on($("#sFac"), ev, ()=>{ readManualFromSliders(); renderIntentioner(); });
      on($("#sRes"), ev, ()=>{ readManualFromSliders(); renderIntentioner(); });
      on($("#sTil"), ev, ()=>{ readManualFromSliders(); renderIntentioner(); });
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    initFilters();
    bind();
    setMode("auto");
    setTab("graph");
    setScopeAll();
    refreshAll();
  });

})();
