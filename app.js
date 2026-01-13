(() => {
  "use strict";

  // ---------- Safe DOM helpers ----------
  const byId = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);

  const setText = (id, txt) => {
    const el = byId(id);
    if (el) el.textContent = txt == null ? "" : String(txt);
  };
  const setHTML = (id, html) => {
    const el = byId(id);
    if (el) el.innerHTML = html == null ? "" : String(html);
  };
  const setValue = (id, v) => {
    const el = byId(id);
    if (el) el.value = v == null ? "" : String(v);
  };
  const getValue = (id, fallback = "") => {
    const el = byId(id);
    return el ? el.value : fallback;
  };
  const on = (idOrEl, ev, fn) => {
    const el = typeof idOrEl === "string" ? byId(idOrEl) : idOrEl;
    if (el) el.addEventListener(ev, fn, { passive: true });
  };

  function escapeHtml(s) {
    return (s || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function normalizeStr(s) {
    return (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
  }
  function parseDate(d) {
    if (!d) return null;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(dt.getTime()) ? null : dt;
  }
  function fmtDate(dt) {
    if (!dt) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- Status errors (same hook as index.html uses) ----------
  function addStatusError(msg) {
    try {
      const m = String(msg || "Okänt fel");
      window.__APP_ERRORS__ = window.__APP_ERRORS__ || [];
      window.__APP_ERRORS__.push(m);

      const el = byId("statusErrors");
      if (el) {
        el.textContent = window.__APP_ERRORS__.join("\n\n");
        el.style.display = "block";
      }
    } catch (_) {}
  }
  window.addEventListener("error", (e) => addStatusError(e.message || e.error || e));
  window.addEventListener("unhandledrejection", (e) => addStatusError(e.reason || e));

  // ---------- Status dots ----------
  function setDot(dotId, state, textId, text) {
    const dot = byId(dotId);
    const st = byId(textId);
    if (dot) {
      dot.classList.remove("ok", "warn", "bad");
      dot.classList.add(state);
    }
    if (st) st.textContent = text;
  }

  function bootStatus() {
    setDot("dotD3", window.d3 ? "ok" : "bad", "stD3", window.d3 ? "laddad" : "saknas");
    const okEvents = Array.isArray(window.EVENTS) && window.EVENTS.length;
    setDot("dotEvents", okEvents ? "ok" : "bad", "stEvents", okEvents ? `${window.EVENTS.length} st` : "saknas/tom");
    setDot("dotApp", "ok", "stApp", "kör");
  }

  // ---------- Data ----------
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

  const DIM_ORDER = ["Intentioner", "Facilitering", "Resurser", "Tillfälle"];
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

  const dates = DATA.map((e) => parseDate(e.date)).filter(Boolean).sort((a, b) => a - b);
  const minDt = dates[0] || null;
  const maxDt = dates[dates.length - 1] || null;

  function fillSelect(selectId, values) {
    const sel = byId(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    values.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
  }

  function initFilters() {
    fillSelect(
      "cat",
      ["Alla", ...Array.from(new Set(DATA.map((e) => e.cat).filter(Boolean))).sort()]
    );
    fillSelect(
      "country",
      ["Alla", ...Array.from(new Set(DATA.map((e) => e.country).filter(Boolean))).sort()]
    );

    if (minDt) setValue("dFrom", fmtDate(minDt));
    if (maxDt) setValue("dTo", fmtDate(maxDt));

    const defaultLimit = Math.min(600, Math.max(200, DATA.length || 200));
    setValue("limit", String(defaultLimit));
    setValue("kwMin", "3");

    // render initial labels safely
    setText("limitVal", `${getValue("limit", defaultLimit)} st`);
    setText("kwMinVal", `${getValue("kwMin", 3)}`);
  }

  function applyFilters() {
    const q = normalizeStr(getValue("q", ""));
    const cat = getValue("cat", "Alla");
    const country = getValue("country", "Alla");
    const from = parseDate(getValue("dFrom", ""));
    const to = parseDate(getValue("dTo", ""));
    const limit = Number(getValue("limit", 600)) || 600;

    setText("limitVal", `${limit} st`);
    setText("kwMinVal", `${getValue("kwMin", 3)}`);

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

    setText("pillCount", `${out.length} i filter`);
    setText("subTitle", `${DATA.length} events totalt`);
    setText("pillFilter", `Filter: ${out.length}`);

    return out;
  }

  // ---------- Scope ----------
  let SCOPE = { label: "Alla", idxSet: null };

  function setScopeAll() {
    SCOPE = { label: "Alla", idxSet: null };
    setText("pillScope", "Urval: Alla");
    setText("pillSel", "–");
    setText("detail", "Klicka nod i grafen för att sätta urval (påverkar intentioner-fliken).");
  }

  function scoped(events) {
    if (SCOPE.idxSet && SCOPE.idxSet.size) return events.filter((e) => SCOPE.idxSet.has(e.idx));
    return events;
  }

  // ---------- Intentioner: auto/manual/mix ----------
  function computeAuto(events) {
    const counts = { Intentioner: 0, Facilitering: 0, Resurser: 0, Tillfälle: 0 };
    for (const e of events) {
      const dim = CAT_TO_DIM[e.cat] || "Intentioner";
      counts[dim] = (counts[dim] || 0) + 1;
    }
    const total = Math.max(1, events.length);
    const pct = {};
    DIM_ORDER.forEach((d) => (pct[d] = Math.round((counts[d] / total) * 100)));
    return { counts, pct };
  }

  let MODE = "auto"; // auto|manual|mix
  let manual = { Intentioner: 0, Facilitering: 0, Resurser: 0, Tillfälle: 0 };

  function setMode(m) {
    MODE = m;
    const auto = byId("modeAuto");
    const man = byId("modeManual");
    const mix = byId("modeMix");
    if (auto) auto.classList.toggle("active", MODE === "auto");
    if (man) man.classList.toggle("active", MODE === "manual");
    if (mix) mix.classList.toggle("active", MODE === "mix");

    const lock = MODE === "auto";
    ["sInt", "sFac", "sRes", "sTil"].forEach((id) => {
      const s = byId(id);
      if (s) s.disabled = lock;
    });

    if (MODE === "mix") {
      // default offsets center at 50
      const a = byId("sInt"), b = byId("sFac"), c = byId("sRes"), d = byId("sTil");
      if (a && b && c && d && a.value === "0" && b.value === "0" && c.value === "0" && d.value === "0") {
        a.value = "50"; b.value = "50"; c.value = "50"; d.value = "50";
      }
    }
    renderIntent();
  }

  function readManual() {
    manual.Intentioner = Number(getValue("sInt", 0)) || 0;
    manual.Facilitering = Number(getValue("sFac", 0)) || 0;
    manual.Resurser = Number(getValue("sRes", 0)) || 0;
    manual.Tillfälle = Number(getValue("sTil", 0)) || 0;
  }

  function setSliderUI(vals) {
    setText("vInt", vals.Intentioner);
    setText("vFac", vals.Facilitering);
    setText("vRes", vals.Resurser);
    setText("vTil", vals.Tillfälle);

    const fInt = byId("fInt"), fFac = byId("fFac"), fRes = byId("fRes"), fTil = byId("fTil");
    if (fInt) fInt.style.width = `${vals.Intentioner}%`;
    if (fFac) fFac.style.width = `${vals.Facilitering}%`;
    if (fRes) fRes.style.width = `${vals.Resurser}%`;
    if (fTil) fTil.style.width = `${vals.Tillfälle}%`;
  }

  function mixed(autoPct) {
    const off = {
      Intentioner: manual.Intentioner - 50,
      Facilitering: manual.Facilitering - 50,
      Resurser: manual.Resurser - 50,
      Tillfälle: manual.Tillfälle - 50,
    };
    return {
      Intentioner: clamp(Math.round(autoPct.Intentioner + off.Intentioner), 0, 100),
      Facilitering: clamp(Math.round(autoPct.Facilitering + off.Facilitering), 0, 100),
      Resurser: clamp(Math.round(autoPct.Resurser + off.Resurser), 0, 100),
      Tillfälle: clamp(Math.round(autoPct.Tillfälle + off.Tillfälle), 0, 100),
    };
  }

  // ---------- Radar ----------
  function renderRadar(vals) {
    const el = byId("radar");
    if (!el || !window.d3) return;

    const svg = d3.select(el);
    svg.selectAll("*").remove();

    const W = 360, H = 300;
    const cx = W / 2, cy = 150, R = 110;
    const axes = DIM_ORDER.length;
    const ang = (i) => (Math.PI * 2 * i) / axes - Math.PI / 2;

    [0.25, 0.5, 0.75, 1].forEach((rr) => {
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", R * rr)
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,.10)");
    });

    DIM_ORDER.forEach((lab, i) => {
      const a = ang(i);
      svg.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx + Math.cos(a) * R).attr("y2", cy + Math.sin(a) * R)
        .attr("stroke", "rgba(255,255,255,.12)");
      svg.append("text")
        .attr("x", cx + Math.cos(a) * (R + 18))
        .attr("y", cy + Math.sin(a) * (R + 18))
        .attr("fill", "rgba(219,231,255,.78)")
        .attr("font-size", 11)
        .attr("text-anchor", Math.cos(a) > 0.2 ? "start" : (Math.cos(a) < -0.2 ? "end" : "middle"))
        .attr("dominant-baseline", "middle")
        .text(lab);
    });

    const pts = DIM_ORDER.map((d, i) => {
      const v = clamp((vals[d] || 0) / 100, 0, 1);
      const a = ang(i);
      return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v];
    });

    svg.append("polygon")
      .attr("points", pts.map((p) => p.join(",")).join(" "))
      .attr("fill", "rgba(219,231,255,.14)")
      .attr("stroke", "rgba(219,231,255,.55)")
      .attr("stroke-width", 1.2);
  }

  function renderTopList(events) {
    const list = byId("topList");
    if (!list) return;
    list.innerHTML = "";

    const weight = { TERROR: 10, INFRA: 9, NUCLEAR: 9, MIL: 8, INTEL: 7, HYBRID: 6, DRONE: 6, GPS: 6, POLICY: 4, LEGAL: 4, MAR: 6 };

    const top = [...events]
      .map((e) => ({ e, score: (weight[e.cat] || 5) + Math.min(5, (e.summary || "").length / 300) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    for (const { e, score } of top) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="it">${escapeHtml(e.title || "Event")}</div>
        <div class="im">${escapeHtml(e.cat || "–")} • ${escapeHtml(e.country || "–")} • ${escapeHtml(e.date || "–")} • score ${score.toFixed(1)}</div>
        <div class="im">${escapeHtml((e.summary || "").slice(0, 220))}${(e.summary || "").length > 220 ? "…" : ""}</div>
        ${e.url ? `<a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>` : ""}
      `;
      list.appendChild(div);
    }
  }

  function renderIntent() {
    const filtered = applyFilters();
    const sel = scoped(filtered);

    setText("pillIntent", `Urval: ${SCOPE.label} • ${sel.length} events`);

    const auto = computeAuto(sel);

    let valsForRadar;

    if (MODE === "auto") {
      // lock sliders to computed values
      setValue("sInt", String(auto.pct.Intentioner));
      setValue("sFac", String(auto.pct.Facilitering));
      setValue("sRes", String(auto.pct.Resurser));
      setValue("sTil", String(auto.pct.Tillfälle));

      valsForRadar = {
        Intentioner: auto.pct.Intentioner,
        Facilitering: auto.pct.Facilitering,
        Resurser: auto.pct.Resurser,
        Tillfälle: auto.pct.Tillfälle,
      };
      setSliderUI(valsForRadar);
    } else if (MODE === "manual") {
      readManual();
      valsForRadar = { ...manual };
      setSliderUI(valsForRadar);
    } else {
      readManual();
      // show manual (offset knobs) but radar uses mixed value
      setSliderUI(manual);
      valsForRadar = mixed(auto.pct);
    }

    const idx = Math.round(
      (valsForRadar.Intentioner + valsForRadar.Facilitering + valsForRadar.Resurser + valsForRadar.Tillfälle) / 4
    );
    setText("pillScore", `Index: ${idx}%`);

    renderRadar({
      Intentioner: valsForRadar.Intentioner,
      Facilitering: valsForRadar.Facilitering,
      Resurser: valsForRadar.Resurser,
      Tillfälle: valsForRadar.Tillfälle,
    });

    renderTopList(sel);
  }

  // ---------- D3 Graph ----------
  let svg, gRoot, sim, zoom, currentModel = null;

  function ensureGraph() {
    const host = byId("graph");
    if (!host || !window.d3) return;

    host.innerHTML = "";
    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));

    svg = d3.select(host).append("svg").attr("width", w).attr("height", h);
    gRoot = svg.append("g");
    gRoot.append("g").attr("class", "links");
    gRoot.append("g").attr("class", "nodes");

    zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (ev) => gRoot.attr("transform", ev.transform));
    svg.call(zoom);

    // Debounced resize observer
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => resizeGraphNow(false));
    });
    ro.observe(host);
  }

  function resizeGraphNow(resetZoom) {
    if (!svg) return;
    const host = byId("graph");
    if (!host) return;

    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));
    svg.attr("width", w).attr("height", h);

    if (sim) {
      sim.force("center", d3.forceCenter(w / 2, h / 2));
      sim.alpha(0.12).restart();
    }
    if (resetZoom && zoom) {
      svg.interrupt();
      svg.call(zoom.transform, d3.zoomIdentity);
    }
  }

  function buildGraph(events) {
    const nodes = [];
    const links = [];
    const by = new Map();

    const add = (id, obj) => {
      if (by.has(id)) return by.get(id);
      const n = { id, ...obj };
      by.set(id, n);
      nodes.push(n);
      return n;
    };

    const cats = Array.from(new Set(events.map((e) => e.cat).filter(Boolean)));
    const ctrs = Array.from(new Set(events.map((e) => e.country).filter(Boolean)));

    cats.forEach((c) => add("cat:" + c, { type: "cat", label: c }));
    ctrs.forEach((c) => add("ctry:" + c, { type: "ctry", label: c }));

    for (const e of events) {
      const id = "ev:" + e.idx;
      add(id, { type: "ev", label: e.title || "Event", ev: e });
      if (e.cat) links.push({ source: id, target: "cat:" + e.cat });
      if (e.country) links.push({ source: id, target: "ctry:" + e.country });
    }

    return { nodes, links };
  }

  function onGraphClick(d, model) {
    if (!d) return;

    if (d.type === "ev") {
      const e = d.ev;
      SCOPE = { label: e.title || "Event", idxSet: new Set([e.idx]) };
      setText("pillScope", `Urval: ${SCOPE.label}`);
      setText("pillSel", "event");
      setHTML(
        "detail",
        `<b>${escapeHtml(e.title || "Event")}</b><br>` +
          `<span class="small">${escapeHtml(e.cat || "–")} • ${escapeHtml(e.country || "–")} • ${escapeHtml(e.date || "–")}</span><br>` +
          `${escapeHtml((e.summary || "").slice(0, 240))}${(e.summary || "").length > 240 ? "…" : ""}` +
          (e.url ? `<br><a href="${encodeURI(e.url)}" target="_blank" rel="noopener">Källa</a>` : "")
      );
    } else {
      const id = d.id;
      const evIds = new Set(
        model.links
          .filter((l) => (l.source.id || l.source) === id || (l.target.id || l.target) === id)
          .map((l) => ((l.source.id || l.source) === id ? (l.target.id || l.target) : (l.source.id || l.source)))
          .filter((x) => String(x).startsWith("ev:"))
      );

      const idxSet = new Set();
      for (const evId of evIds) {
        const m = String(evId).match(/^ev:(\d+)$/);
        if (m) idxSet.add(Number(m[1]));
      }

      SCOPE = { label: d.label, idxSet };
      setText("pillScope", `Urval: ${SCOPE.label}`);
      setText("pillSel", d.type === "cat" ? "kategori" : "land");
      setHTML("detail", `<b>${escapeHtml(d.label)}</b><br><span class="small">${idxSet.size} relaterade events</span>`);
    }
    renderIntent();
  }

  function renderGraph(model) {
    if (!svg || !gRoot) return;
    currentModel = model;

    const host = byId("graph");
    const r = host ? host.getBoundingClientRect() : { width: 900, height: 600 };
    const w = Math.max(320, Math.floor(r.width || 900));
    const h = Math.max(240, Math.floor(r.height || 600));

    const linkSel = gRoot.select("g.links").selectAll("line").data(model.links);
    linkSel.exit().remove();
    linkSel.enter().append("line")
      .attr("stroke", "rgba(255,255,255,.16)")
      .attr("stroke-width", 1);

    const nodeSel = gRoot.select("g.nodes").selectAll("circle").data(model.nodes, (d) => d.id);
    nodeSel.exit().remove();

    const enter = nodeSel.enter().append("circle")
      .attr("r", (d) => (d.type === "ev" ? 4 : 11))
      .attr("fill", "rgba(255,255,255,.06)")
      .attr("stroke", "rgba(219,231,255,.75)")
      .attr("stroke-width", 1.1)
      .attr("cursor", "pointer")
      .call(
        d3.drag()
          .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); })
      )
      .on("click", (_, d) => onGraphClick(d, model));

    const nodesAll = enter.merge(nodeSel);

    if (sim) sim.stop();
    sim = d3.forceSimulation(model.nodes)
      .force("link", d3.forceLink(model.links).id((d) => d.id).distance(62).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide().radius((d) => (d.type === "ev" ? 7 : 18)))
      .on("tick", () => {
        gRoot.select("g.links").selectAll("line")
          .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
        nodesAll.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      });

    setText("hudInfo", `${model.nodes.length} noder • ${model.links.length} länkar`);
  }

  function refreshGraph() {
    try {
      const filtered = applyFilters();
      if (!svg) ensureGraph();
      if (!svg) return;
      const model = buildGraph(filtered);
      renderGraph(model);
      resizeGraphNow(false);
    } catch (e) {
      addStatusError(e?.message || e);
    }
  }

  // ---------- Tabs / fullscreen ----------
  function setTab(which) {
    const vg = byId("viewGraph");
    const vi = byId("viewIntent");
    const tg = byId("tabGraph");
    const ti = byId("tabIntent");

    if (vg) vg.classList.toggle("active", which === "graph");
    if (vi) vi.classList.toggle("active", which === "intent");
    if (tg) tg.classList.toggle("active", which === "graph");
    if (ti) ti.classList.toggle("active", which === "intent");

    setText("rightTitle", which === "graph" ? "Länkdiagram" : "Intentioner");

    setTimeout(() => {
      if (which === "graph") refreshGraph();
      else renderIntent();
    }, 80);
  }

  async function fullscreenGraph() {
    const wrap = byId("graphWrap");
    if (!wrap) return;
    try {
      if (!document.fullscreenElement) await wrap.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  }

  async function fullscreenAll() {
    const shell = byId("appShell");
    if (!shell) return;
    try {
      if (!document.fullscreenElement) await shell.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {}
  }

  function onFullscreenChanged() {
    setTimeout(() => {
      if (svg) resizeGraphNow(true);
      const vg = byId("viewGraph");
      if (vg && vg.classList.contains("active")) refreshGraph();
    }, 140);
  }

  // ---------- Bindings ----------
  function bind() {
    on("tabGraph", "click", () => setTab("graph"));
    on("tabIntent", "click", () => setTab("intent"));

    on("btnFullscreenGraph", "click", fullscreenGraph);
    on("btnFullscreenAll", "click", fullscreenAll);
    document.addEventListener("fullscreenchange", onFullscreenChanged);

    on("btnClearScope", "click", () => { setScopeAll(); renderIntent(); });

    on("btnZoomFit", "click", () => {
      if (svg && zoom) svg.transition().duration(160).call(zoom.transform, d3.zoomIdentity);
    });

    on("btnReset", "click", () => {
      setValue("q", "");
      setValue("cat", "Alla");
      setValue("country", "Alla");
      if (minDt) setValue("dFrom", fmtDate(minDt));
      if (maxDt) setValue("dTo", fmtDate(maxDt));
      const defaultLimit = Math.min(600, Math.max(200, DATA.length || 200));
      setValue("limit", String(defaultLimit));
      setValue("kwMin", "3");
      setScopeAll();
      setMode("auto");
      refreshGraph();
      renderIntent();
    });

    // filters
    ["input", "change"].forEach((ev) => {
      ["q", "dFrom", "dTo", "cat", "country", "limit", "kwMin"].forEach((id) => {
        on(id, ev, () => { refreshGraph(); renderIntent(); });
      });
    });

    // modes
    on("modeAuto", "click", () => setMode("auto"));
    on("modeManual", "click", () => setMode("manual"));
    on("modeMix", "click", () => setMode("mix"));

    // sliders
    ["input", "change"].forEach((ev) => {
      ["sInt", "sFac", "sRes", "sTil"].forEach((id) => on(id, ev, () => renderIntent()));
    });
  }

  // ---------- Boot ----------
  function boot() {
    try {
      bootStatus();
      initFilters();
      bind();
      setScopeAll();
      setMode("auto");
      refreshGraph();
      renderIntent();
    } catch (e) {
      addStatusError(e?.message || e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
