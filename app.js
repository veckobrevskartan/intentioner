(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function setDot(id, state, text){
    const dot = document.getElementById(id);
    const st = document.getElementById("st"+id.replace("dot",""));
    if(dot){
      dot.classList.remove("ok","warn","bad");
      dot.classList.add(state);
    }
    if(st) st.textContent = text;
  }

  function setStatus(){
    // D3
    if (window.d3) setDot("dotD3","ok","laddad");
    else setDot("dotD3","bad","saknas (cdn blockerad/404)");

    // EVENTS
    if (Array.isArray(window.EVENTS) && window.EVENTS.length) {
      setDot("dotEvents","ok",`${window.EVENTS.length} st`);
    } else {
      setDot("dotEvents","bad","saknas eller tom (events.js körs inte)");
    }

    // App
    setDot("dotApp","ok","kör");
  }

  function normalizeEvents(){
    const raw = Array.isArray(window.EVENTS) ? window.EVENTS : [];
    return raw.map((e, idx)=>({
      idx,
      cat: (e.cat || e.category || "").toString().trim(),
      country: (e.country || e.land || "").toString().trim(),
      title: (e.title || e.name || "").toString(),
      summary: (e.summary || e.desc || e.description || "").toString(),
      url: (e.url || e.link || "").toString(),
      date: (e.date || e.time || "").toString(),
    }));
  }

  function fillSelect(sel, values){
    if(!sel) return;
    sel.innerHTML = "";
    values.forEach(v=>{
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
  }

  function applyFilters(data){
    const q = ($("#q")?.value || "").toLowerCase().trim();
    const cat = $("#cat")?.value || "Alla";
    const country = $("#country")?.value || "Alla";
    const limit = Number($("#limit")?.value || 600);

    let out = data.filter(e=>{
      if(cat !== "Alla" && e.cat !== cat) return false;
      if(country !== "Alla" && e.country !== country) return false;
      if(q){
        const hay = `${e.title} ${e.summary} ${e.cat} ${e.country}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });

    if(out.length > limit) out = out.slice(0, limit);
    return out;
  }

  // ---- Minimal D3-graf: event-noder kopplade till kategori + land ----
  let svg, sim, g;
  function ensureGraph(){
    const host = document.getElementById("graph");
    if(!host) return;

    host.innerHTML = "";
    const w = host.clientWidth || 900;
    const h = host.clientHeight || 600;

    svg = d3.select(host).append("svg").attr("width", w).attr("height", h);
    g = svg.append("g");
    g.append("g").attr("class","links");
    g.append("g").attr("class","nodes");

    const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev)=> g.attr("transform", ev.transform));
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

    on($("#btnZoomFit"), "click", ()=> {
      // enkel "fit": centrerar bara
      svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
    });
  }

  function buildGraph(events){
    const nodes = [];
    const links = [];
    const byId = new Map();

    const add = (id, obj)=>{
      if(byId.has(id)) return byId.get(id);
      const n = { id, ...obj };
      byId.set(id, n);
      nodes.push(n);
      return n;
    };

    // cat + country noder
    const cats = Array.from(new Set(events.map(e=>e.cat).filter(Boolean)));
    const ctrs = Array.from(new Set(events.map(e=>e.country).filter(Boolean)));

    cats.forEach(c=> add("cat:"+c, { type:"cat", label:c }));
    ctrs.forEach(c=> add("ctry:"+c, { type:"ctry", label:c }));

    // event-noder
    events.forEach((e,i)=>{
      const eid = "ev:"+e.idx;
      add(eid, { type:"ev", label:e.title || "Event", ev:e });

      if(e.cat) links.push({ source:eid, target:"cat:"+e.cat });
      if(e.country) links.push({ source:eid, target:"ctry:"+e.country });
    });

    return { nodes, links };
  }

  function renderGraph(model){
    const host = document.getElementById("graph");
    const w = host?.clientWidth || 900;
    const h = host?.clientHeight || 600;

    const linkSel = g.select("g.links").selectAll("line").data(model.links);
    linkSel.exit().remove();
    linkSel.enter()
      .append("line")
      .attr("stroke","rgba(255,255,255,.16)")
      .attr("stroke-width",1);

    const nodeSel = g.select("g.nodes").selectAll("circle").data(model.nodes, d=>d.id);
    nodeSel.exit().remove();
    const enter = nodeSel.enter()
      .append("circle")
      .attr("r", d=> d.type==="ev" ? 4 : 10)
      .attr("fill","rgba(255,255,255,.06)")
      .attr("stroke","rgba(219,231,255,.75)")
      .attr("stroke-width",1.1)
      .attr("cursor","pointer")
      .call(d3.drag()
        .on("start",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0.25).restart(); d.fx=d.x; d.fy=d.y; })
        .on("drag",(ev,d)=>{ d.fx=ev.x; d.fy=ev.y; })
        .on("end",(ev,d)=>{ if(!ev.active) sim.alphaTarget(0); })
      )
      .on("click",(_,d)=>{
        if(d.type==="ev"){
          const e = d.ev;
          $("#pillSel").textContent = "event";
          $("#detail").innerHTML = `<b>${e.title || "Event"}</b><br>${e.cat||"–"} • ${e.country||"–"} • ${e.date||"–"}<br>${(e.summary||"").slice(0,220)}${(e.summary||"").length>220?"…":""}${e.url?`<br><a href="${e.url}" target="_blank" rel="noopener">Källa</a>`:""}`;
          $("#pillScope").textContent = `Urval: event`;
          // intentioner räknas på urval = 1 event (för demo)
          renderIntent([e]);
        } else {
          $("#pillSel").textContent = d.type==="cat" ? "kategori" : "land";
          const sel = model.links
            .filter(l => (l.source.id||l.source)===d.id || (l.target.id||l.target)===d.id)
            .map(l => ((l.source.id||l.source)===d.id ? (l.target.id||l.target) : (l.source.id||l.source)))
            .filter(id=>String(id).startsWith("ev:"));
          const chosen = normalizeEvents().filter(e=> sel.includes("ev:"+e.idx));
          $("#pillScope").textContent = `Urval: ${d.label}`;
          $("#detail").innerHTML = `<b>${d.label}</b><br>${chosen.length} events i urval`;
          renderIntent(chosen);
        }
      });

    const nodesAll = enter.merge(nodeSel);

    if(sim) sim.stop();
    sim = d3.forceSimulation(model.nodes)
      .force("link", d3.forceLink(model.links).id(d=>d.id).distance(60).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-240))
      .force("center", d3.forceCenter(w/2, h/2))
      .force("collide", d3.forceCollide().radius(d=> d.type==="ev" ? 6 : 16))
      .on("tick", ()=>{
        g.select("g.links").selectAll("line")
          .attr("x1", d=>d.source.x).attr("y1", d=>d.source.y)
          .attr("x2", d=>d.target.x).attr("y2", d=>d.target.y);

        nodesAll.attr("cx", d=>d.x).attr("cy", d=>d.y);
      });

    $("#hudInfo").textContent = `${model.nodes.length} noder • ${model.links.length} länkar`;
  }

  // ---- Intentioner (superenkel demo på din befintliga data) ----
  const CAT_TO_DIM = {
    HYBRID:"Intentioner", POLICY:"Intentioner", TERROR:"Intentioner",
    INTEL:"Facilitering", LEGAL:"Facilitering",
    MIL:"Resurser", MAR:"Resurser", INFRA:"Resurser", NUCLEAR:"Resurser",
    DRONE:"Tillfälle", GPS:"Tillfälle"
  };

  function renderIntent(events){
    const counts = { "Intentioner":0, "Facilitering":0, "Resurser":0, "Tillfälle":0 };
    events.forEach(e=>{
      const dim = CAT_TO_DIM[e.cat] || "Intentioner";
      counts[dim] = (counts[dim]||0)+1;
    });
    $("#pillIntent").textContent = `Urval: ${events.length} events`;
    $("#intentOut").innerHTML =
      `Intentioner: <b>${counts["Intentioner"]}</b><br>`+
      `Facilitering: <b>${counts["Facilitering"]}</b><br>`+
      `Resurser: <b>${counts["Resurser"]}</b><br>`+
      `Tillfälle: <b>${counts["Tillfälle"]}</b>`;
  }

  function setTab(which){
    $("#viewGraph").classList.toggle("active", which==="graph");
    $("#viewIntent").classList.toggle("active", which==="intent");
    if(which==="graph") setTimeout(run, 80);
  }

  async function toggleFullscreen(){
    const wrap = document.getElementById("graphWrap");
    if(!wrap) return;
    try{
      if(!document.fullscreenElement) await wrap.requestFullscreen();
      else await document.exitFullscreen();
    }catch(e){}
    setTimeout(run, 120);
  }

  function run(){
    setStatus();

    if(!window.d3){
      // d3 saknas – inget mer att göra
      return;
    }

    const all = normalizeEvents();
    const filtered = applyFilters(all);

    $("#pillCount").textContent = `${filtered.length} i filter`;
    $("#subTitle").textContent = `${all.length} events totalt`;

    $("#limitVal").textContent = `${$("#limit").value} st`;
    $("#kwMinVal").textContent = `${$("#kwMin").value}`;

    if(!svg) ensureGraph();
    const model = buildGraph(filtered);
    renderGraph(model);

    // intentioner på filterurval (default)
    renderIntent(filtered);
  }

  // Boot
  document.addEventListener("DOMContentLoaded", ()=>{
    // Fyll dropdowns
    const all = normalizeEvents();
    const cats = ["Alla", ...Array.from(new Set(all.map(e=>e.cat).filter(Boolean))).sort()];
    const ctrs = ["Alla", ...Array.from(new Set(all.map(e=>e.country).filter(Boolean))).sort()];
    fillSelect($("#cat"), cats);
    fillSelect($("#country"), ctrs);

    $("#limit").value = String(Math.min(600, Math.max(200, all.length || 200)));
    $("#kwMin").value = "3";
    $("#limitVal").textContent = `${$("#limit").value} st`;
    $("#kwMinVal").textContent = `${$("#kwMin").value}`;

    on($("#tabGraph"), "click", ()=> setTab("graph"));
    on($("#tabIntent"), "click", ()=> setTab("intent"));
    on($("#btnFullscreen"), "click", toggleFullscreen);

    on($("#btnReset"), "click", ()=>{
      $("#q").value = "";
      $("#cat").value = "Alla";
      $("#country").value = "Alla";
      $("#limit").value = String(Math.min(600, Math.max(200, all.length || 200)));
      $("#kwMin").value = "3";
      $("#pillScope").textContent = "Urval: Alla";
      $("#detail").textContent = "Klicka nod i grafen för urval.";
      run();
    });

    ["input","change"].forEach(ev=>{
      on($("#q"), ev, run);
      on($("#cat"), ev, run);
      on($("#country"), ev, run);
      on($("#limit"), ev, run);
      on($("#kwMin"), ev, run);
    });

    // Start
    setTab("graph");
    run();
  });

})();
