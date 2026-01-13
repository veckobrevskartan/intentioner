(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ---- status dots
  function setDot(dotId, state, textId, text){
    const dot = document.getElementById(dotId);
    const st = document.getElementById(textId);
    if(dot){
      dot.classList.remove("ok","warn","bad");
      dot.classList.add(state);
    }
    if(st) st.textContent = text;
  }

  function bootStatus(){
    if(window.d3) setDot("dotD3","ok","stD3","laddad");
    else setDot("dotD3","bad","stD3","saknas");

    if(Array.isArray(window.EVENTS) && window.EVENTS.length){
      setDot("dotEvents","ok","stEvents",`${window.EVENTS.length} st`);
    } else {
      setDot("dotEvents","bad","stEvents","saknas/tom");
    }

    setDot("dotApp","ok","stApp","kör");
  }

  // ---- normalize events
  const RAW = Array.isArray(window.EVENTS) ? window.EVENTS : [];
  const DATA = RAW.map((e, idx) => ({
    idx,
    cat: (e.cat || e.category || "").toString().trim(),
    country: (e.country || e.land || "").toString().trim(),
    title: (e.title || e.name || "").toString(),
    summary: (e.summary || e.desc || e.description || "").toString(),
    url: (e.url || e.link || "").toString(),
    date: (e.date || e.time || "").toString(),
  }));

  const DIM_ORDER = ["Intentioner","Facilitering","Resurser","Tillfälle"];
  const CAT_TO_DIM = {
    HYBRID:"Intentioner", POLICY:"Intentioner", TERROR:"Intentioner",
    INTEL:"Facilitering", LEGAL:"Facilitering",
    MIL:"Resurser", MAR:"Resurser", INFRA:"Resurser", NUCLEAR:"Resurser",
    DRONE:"Tillfälle", GPS:"Tillfälle"
  };

  function normalizeStr(s){
    return (s||"").toString().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"");
  }
  function escapeHtml(s){
    return (s||"").toString()
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }
  function parseDate(d){
    if(!d) return null;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m) return null;
    const dt = new Date(+m[1], +m[2]-1, +m[3]);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function fmtDate(dt){
    if(!dt) return "";
    const y=dt.getFullYear(), m=String(dt.getMonth()+1).padStart(2,"0"), d=String(dt.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  // ---- init filter selects
  const dates = DATA.map(e=>parseDate(e.date)).filter(Boolean).sort((a,b)=>a-b);
  const minDt = dates[0] || null;
  const maxDt = dates[dates.length-1] || null;

  function fillSelect(sel, arr){
    sel.innerHTML = "";
    arr.forEach(v=>{
      const o=document.createElement("option");
      o.value=v; o.textContent=v;
      sel.appendChild(o);
    });
  }

  function initFilters(){
    const cats = ["Alla", ...Array.from(new Set(DATA.map(e=>e.cat).filter(Boolean))).sort()];
    const ctrs = ["Alla", ...Array.from(new Set(DATA.map(e=>e.country).filter(Boolean))).sort()];
    fillSelect($("#cat"), cats);
    fillSelect($("#country"), ctrs);

    if(minDt) $("#dFrom").value = fmtDate(minDt);
    if(maxDt) $("#dTo").value = fmtDate(maxDt);

    $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
    $("#kwMin").value = "3";
  }

  function applyFilters(){
    $("#limitVal").textContent = `${$("#limit").value} st`;
    $("#kwMinVal").textContent = `${$("#kwMin").value}`;

    const q = normalizeStr($("#q").value || "");
    const cat = $("#cat").value || "Alla";
    const country = $("#country").value || "Alla";
    const from = parseDate($("#dFrom").value || "");
    const to = parseDate($("#dTo").value || "");
    const limit = Number($("#limit").value || 600);

    let out = DATA.filter(e=>{
      if(cat !== "Alla" && e.cat !== cat) return false;
      if(country !== "Alla" && e.country !== country) return false;

      const dt = parseDate(e.date);
      if(from && dt && dt < from) return false;
      if(to && dt && dt > to) return false;

      if(q){
        const hay = normalizeStr(`${e.title} ${e.summary} ${e.cat} ${e.country}`);
        if(!hay.includes(q)) return false;
      }
      return true;
    });

    if(out.length > limit) out = out.slice(0, limit);

    $("#pillCount").textContent = `${out.length} i filter`;
    $("#subTitle").textContent = `${DATA.length} events totalt`;
    $("#pillFilter").textContent = `Filter: ${out.length}`;
    return out;
  }

  // ---- scope (click in graph)
  let SCOPE = { label:"Alla", idxSet:null };
  function setScopeAll(){
    SCOPE = { label:"Alla", idxSet:null };
    $("#pillScope").textContent = "Urval: Alla";
    $("#pillSel").textContent = "–";
    $("#detail").textContent = "Klicka nod i grafen för att sätta urval (påverkar intentioner-fliken).";
  }
  function scoped(events){
    if(SCOPE.idxSet && SCOPE.idxSet.size){
      return events.filter(e=>SCOPE.idxSet.has(e.idx));
    }
    return events;
  }

  // ---- intention computations
  function computeAuto(events){
    const counts = {Intentioner:0, Facilitering:0, Resurser:0, "Tillfälle":0};
    for(const e of events){
      const dim = CAT_TO_DIM[e.cat] || "Intentioner";
      counts[dim] = (counts[dim]||0)+1;
    }
    const total = Math.max(1, events.length);
    const pct = {};
    DIM_ORDER.forEach(d => pct[d] = Math.round((counts[d]/total)*100));
    return {counts, pct};
  }

  // ---- modes/sliders
  let MODE = "auto"; // auto|manual|mix
  let manual = {Intentioner:0, Facilitering:0, Resurser:0, "Tillfälle":0};

  function setMode(m){
    MODE = m;
    $("#modeAuto").classList.toggle("active", MODE==="auto");
    $("#modeManual").classList.toggle("active", MODE==="manual");
    $("#modeMix").classList.toggle("active", MODE==="mix");

    const lock = MODE === "auto";
    ["sInt","sFac","sRes","sTil"].forEach(id => { const s=$("#"+id); if(s) s.disabled = lock; });

    if(MODE==="mix"){
      if($("#sInt").value === "0" && $("#sFac").value === "0" && $("#sRes").value === "0" && $("#sTil").value === "0"){
        $("#sInt").value = "50"; $("#sFac").value="50"; $("#sRes").value="50"; $("#sTil").value="50";
      }
    }
    renderIntent();
  }

  function readManual(){
    manual.Intentioner = Number($("#sInt").value||0);
    manual.Facilitering = Number($("#sFac").value||0);
    manual.Resurser = Number($("#sRes").value||0);
    manual["Tillfälle"] = Number($("#sTil").value||0);
  }

  function setSliderUI(vals){
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

  function mixed(autoPct){
    const off = {
      Intentioner: manual.Intentioner - 50,
      Facilitering: manual.Facilitering - 50,
      Resurser: manual.Resurser - 50,
      "Tillfälle": manual["Tillfälle"] - 50
    };
    const out = {};
    DIM_ORDER.forEach(d => out[d] = clamp(Math.round(autoPct[d] + off[d]), 0, 100));
    return out;
  }

  // ---- radar
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
    const list = $("#topList");
    list.innerHTML = "";
    const weight = {TERROR:10, INFRA:9, NUCLEAR:9, MIL:8, INTEL:7, HYBRID:6, DRONE:6, GPS:6, POLICY:4, LEGAL:4, MAR:6};

    const top = [...events]
      .map(e=>({e, score:(weight[e.cat]||5) + Math.min(5, (e.summary||"").length/300)}))
      .sort((a,b)=>b.score-a.score)
      .slice(0,12);

    top.forEach(({e,score})=>{
      const div=document.createElement("div");
      div.className="item";
      div.innerHTML = `
        <div class="it">${escapeHtml(e.title||"Event")}</div>
        <div class="im">${escapeHtml(e.cat||"–")} • ${escapeHtml(e.country||"–")} • ${escapeHtml(e.date||"–")} • score ${score.toFixed(1)}</div>
        <div class="im">${escapeHtml((e.summary||"").slice(0,220))}${(e.summary||"").length>220?"…":""}</div>
        ${e.url?`<a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>`:""}
      `;
      list.appendChild(div);
    });
  }

  function renderIntent(){
    const filtered = applyFilters();
    const sel = scoped(filtered);

    $("#pillIntent").textContent = `Urval: ${SCOPE.label} • ${sel.length} events`;

    const auto = computeAuto(sel);

    let valsForRadar;
    if(MODE==="auto"){
      $("#sInt").value = String(auto.pct.Intentioner);
      $("#sFac").value = String(auto.pct.Facilitering);
      $("#sRes").value = String(auto.pct.Resurser);
      $("#sTil").value = String(auto.pct["Tillfälle"]);
      setSliderUI({
        Intentioner:auto.pct.Intentioner,
        Facilitering:auto.pct.Facilitering,
        Resurser:auto.pct.Resurser,
        "Tillfälle":auto.pct["Tillfälle"]
      });
      valsForRadar = {
        Intentioner:auto.pct.Intentioner,
        Facilitering:auto.pct.Facilitering,
        Resurser:auto.pct.Resurser,
        "Tillfälle":auto.pct["Tillfälle"]
      };
    } else if(MODE==="manual"){
      readManual();
      const v = {...manual};
      setSliderUI(v);
      valsForRadar = v;
    } else {
      readManual();
      setSliderUI(manual);
      valsForRadar = mixed(auto.pct);
    }

    const idx = Math.round((valsForRadar.Intentioner + valsForRadar.Facilitering + valsForRadar.Resurser + valsForRadar["Tillfälle"]) / 4);
    $("#pillScore").textContent = `Index: ${idx}%`;

    renderRadar(valsForRadar);
    renderTopList(sel);
  }

  // ---- D3 graph
  let svg, gRoot, sim, zoom;
  let currentModel = null;

  function ensureGraph(){
    const host = $("#graph");
    host.innerHTML = "";

    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));

    svg = d3.select(host).append("svg").attr("width", w).attr("height", h);
    gRoot = svg.append("g");
    gRoot.append("g").attr("class","links");
    gRoot.append("g").attr("class","nodes");

    zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev)=> gRoot.attr("transform", ev.transform));
    svg.call(zoom);

    // debounce ResizeObserver
    let raf = 0;
    new ResizeObserver(()=> {
      if(raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{
        resizeGraphNow(false);
      });
    }).observe(host);

    on($("#btnZoomFit"), "click", ()=> zoomReset());
  }

  function resizeGraphNow(resetZoom){
    if(!svg) return;
    const host = $("#graph");
    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));

    svg.attr("width", w).attr("height", h);

    if(sim){
      sim.force("center", d3.forceCenter(w/2, h/2));
      sim.alpha(0.12).restart();
    }
    if(resetZoom) zoomReset();
  }

  function zoomReset(){
    if(!svg || !zoom) return;
    svg.transition().duration(180).call(zoom.transform, d3.zoomIdentity);
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

  function onGraphClick(d, model){
    if(d.type==="ev"){
      const e=d.ev;
      SCOPE = { label: e.title || "Event", idxSet: new Set([e.idx]) };
      $("#pillScope").textContent = `Urval: ${SCOPE.label}`;
      $("#pillSel").textContent = "event";
      $("#detail").innerHTML =
        `<b>${escapeHtml(e.title||"Event")}</b><br>`+
        `<span class="small">${escapeHtml(e.cat||"–")} • ${escapeHtml(e.country||"–")} • ${escapeHtml(e.date||"–")}</span><br>`+
        `${escapeHtml((e.summary||"").slice(0,240))}${(e.summary||"").length>240?"…":""}`+
        (e.url?`<br><a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>`:"");
    } else {
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
      SCOPE = { label: d.label, idxSet };
      $("#pillScope").textContent = `Urval: ${SCOPE.label}`;
      $("#pillSel").textContent = d.type==="cat" ? "kategori" : "land";
      $("#detail").innerHTML = `<b>${escapeHtml(d.label)}</b><br><span class="small">${idxSet.size} relaterade events</span>`;
    }
    renderIntent();
  }

  function renderGraph(model){
    currentModel = model;

    const host = $("#graph");
    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));

    const linkSel = gRoot.select("g.links").selectAll("line").data(model.links);
    linkSel.exit().remove();
    linkSel.enter().append("line")
      .attr("stroke","rgba(255,255,255,.16)")
      .attr("stroke-width",1);

    const nodeSel = gRoot.select("g.nodes").selectAll("circle").data(model.nodes, d=>d.id);
    nodeSel.exit().remove();

    const enter = nodeSel.enter().append("circle")
      .attr("r", d=> d.type==="ev" ? 4 : 11)
      .attr("fill","rgba(255,255,255,.06)")
      .attr("stroke","rgba(219,231,255,.75)")
      .attr("stroke-width",1.1)
      .attr("cursor","pointer")
      .call(d3.drag()
        .on("start",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0.20).restart(); d.fx=d.x; d.fy=d.y; })
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

  function refreshGraph(){
    const filtered = applyFilters();
    if(!svg) ensureGraph();
    const model = buildGraph(filtered);
    renderGraph(model);
    // säkerställ att svg storlek alltid matchar host (särskilt efter layoutändringar)
    resizeGraphNow(false);
  }

  // ---- tabs + fullscreen
  function setTab(which){
    $("#viewGraph").classList.toggle("active", which==="graph");
    $("#viewIntent").classList.toggle("active", which==="intent");
    $("#tabGraph").classList.toggle("active", which==="graph");
    $("#tabIntent").classList.toggle("active", which==="intent");
    $("#rightTitle").textContent = which==="graph" ? "Länkdiagram" : "Intentioner";
    setTimeout(()=>{
      if(which==="graph") refreshGraph();
      else renderIntent();
    }, 80);
  }

  async function fullscreenGraph(){
    const wrap = document.getElementById("graphWrap");
    try{
      if(!document.fullscreenElement) await wrap.requestFullscreen();
      else await document.exitFullscreen();
    }catch(e){}
  }

  async function fullscreenAll(){
    const shell = document.getElementById("appShell");
    try{
      if(!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    }catch(e){}
  }

  // ✅ när fullscreen ändras: tvinga resize + zoom reset (så inget klipps)
  function onFullscreenChanged(){
    // ge browsern en tick att layouta om fullscreen-storlekar
    setTimeout(()=>{
      // Vi vill alltid uppdatera svg-mått (grafen ligger kvar i DOM även om du är på Intentioner)
      if(svg) resizeGraphNow(true);
      // och om du står på graf-fliken, rendera om för säkerhets skull
      if($("#viewGraph").classList.contains("active")) refreshGraph();
    }, 140);
  }

  // ---- bind + boot
  function bind(){
    on($("#tabGraph"), "click", ()=> setTab("graph"));
    on($("#tabIntent"), "click", ()=> setTab("intent"));

    on($("#btnFullscreenGraph"), "click", fullscreenGraph);
    on($("#btnFullscreenAll"), "click", fullscreenAll);

    document.addEventListener("fullscreenchange", onFullscreenChanged);

    on($("#btnClearScope"), "click", ()=>{ setScopeAll(); renderIntent(); });

    on($("#btnReset"), "click", ()=>{
      $("#q").value = "";
      $("#cat").value = "Alla";
      $("#country").value = "Alla";
      if(minDt) $("#dFrom").value = fmtDate(minDt);
      if(maxDt) $("#dTo").value = fmtDate(maxDt);
      $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
      $("#kwMin").value = "3";
      setScopeAll();
      setMode("auto");
      refreshGraph();
      renderIntent();
    });

    ["input","change"].forEach(ev=>{
      ["q","dFrom","dTo","cat","country","limit","kwMin"].forEach(id=>{
        on($("#"+id), ev, ()=>{
          refreshGraph();
          renderIntent();
        });
      });
    });

    on($("#modeAuto"), "click", ()=> setMode("auto"));
    on($("#modeManual"), "click", ()=> setMode("manual"));
    on($("#modeMix"), "click", ()=> setMode("mix"));

    ["input","change"].forEach(ev=>{
      ["sInt","sFac","sRes","sTil"].forEach(id=>{
        on($("#"+id), ev, ()=> renderIntent());
      });
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    bootStatus();
    initFilters();
    bind();
    setScopeAll();
    setMode("auto");
    refreshGraph();
    renderIntent();
  });

})();
