/* app.js – Graf + Intentioner (Bästa/Troligast/Värsta) utan att ändra EVENTS
   Kräver:
   - events.js som sätter window.EVENTS = EVENTS;
   - d3@7 laddat i index.html
   - index.html med IDs som anges i kommentaren ovan
*/

(() => {
  "use strict";

  // -----------------------------
  // 0) Små helpers
  // -----------------------------
  const $ = (s) => document.querySelector(s);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const normalizeStr = (s) =>
    (s || "")
      .toString()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  const parseDate = (d) => {
    if (!d) return null;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const fmtDate = (dt) => {
    if (!dt) return "–";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const escapeHtml = (s) =>
    (s || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function assertDom(ids) {
    const missing = ids.filter((id) => !document.getElementById(id));
    if (missing.length) {
      console.warn("Saknade element-ID:", missing);
      // Visa något begripligt i UI om möjligt
      const sub = $("#subTitle");
      if (sub) sub.textContent = `Saknar element i index: ${missing.join(", ")}`;
      return false;
    }
    return true;
  }

  // -----------------------------
  // 1) Läs EVENTS (oförändrade)
  // -----------------------------
  const RAW = Array.isArray(window.EVENTS) ? window.EVENTS : [];
  if (!RAW.length) {
    alert(
      "EVENTS saknas. Kontrollera att events.js ligger i samma mapp och slutar med: window.EVENTS = EVENTS;"
    );
  }

  // Normalisera till intern form (men ändrar inte originalobjekten)
  const DATA = RAW.map((e) => {
    const date = e.date || e.time || e.dt || e.datetime || "";
    return {
      ...e,
      date,
      _dt: parseDate(date),
      _cat: (e.cat || e.category || "").toString().trim(),
      _country: (e.country || e.land || "").toString().trim(),
      _title: (e.title || e.name || "").toString(),
      _summary: (e.summary || e.desc || e.description || "").toString(),
      _place: (e.place || "").toString(),
      _url: (e.url || e.link || "").toString(),
      _source: (e.source || "").toString(),
    };
  });

  // -----------------------------
  // 2) Flikar + scope
  // -----------------------------
  function setTab(which) {
    const g = $("#tabGraph"),
      i = $("#tabIntent"),
      vg = $("#viewGraph"),
      vi = $("#viewIntent");
    if (!g || !i || !vg || !vi) return;
    g.classList.toggle("active", which === "graph");
    i.classList.toggle("active", which === "intent");
    vg.classList.toggle("active", which === "graph");
    vi.classList.toggle("active", which === "intent");
  }

  // Scope: delmängd via grafklick (index i aktuell filterlista)
  let SCOPE = { type: "all", label: "Alla", idxSet: null };

  function setScopeAll() {
    SCOPE = { type: "all", label: "Alla", idxSet: null };
    const pill = $("#pillScope");
    if (pill) pill.textContent = `Urval: Alla`;
    const pillSel = $("#pillSel");
    if (pillSel) pillSel.textContent = "–";
    const detail = $("#detail");
    if (detail) detail.innerHTML = `Klicka en nod i grafen.`;
    refresh(); // graf + intentioner
  }

  // -----------------------------
  // 3) Filter UI
  // -----------------------------
  function fillSelect(sel, arr) {
    if (!sel) return;
    sel.innerHTML = "";
    arr.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    });
  }

  const cats = ["Alla", ...Array.from(new Set(DATA.map((e) => e._cat).filter(Boolean))).sort()];
  const ctrs = ["Alla", ...Array.from(new Set(DATA.map((e) => e._country).filter(Boolean))).sort()];

  // Date bounds
  const dates = DATA.map((e) => e._dt).filter(Boolean).sort((a, b) => a - b);
  const minDt = dates[0] || null;
  const maxDt = dates[dates.length - 1] || null;

  function initFilters() {
    fillSelect($("#cat"), cats);
    fillSelect($("#country"), ctrs);

    if (minDt && $("#dFrom")) $("#dFrom").value = fmtDate(minDt);
    if (maxDt && $("#dTo")) $("#dTo").value = fmtDate(maxDt);

    if ($("#limit")) $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
    if ($("#kwMin")) $("#kwMin").value = "3";

    updateSliderLabels();
  }

  function updateSliderLabels() {
    if ($("#limitVal") && $("#limit")) $("#limitVal").textContent = `${$("#limit").value} st`;
    if ($("#kwMinVal") && $("#kwMin")) $("#kwMinVal").textContent = `${$("#kwMin").value}`;
  }

  function applyFilters() {
    updateSliderLabels();

    const q = normalizeStr($("#q")?.value || "");
    const cat = $("#cat")?.value || "Alla";
    const country = $("#country")?.value || "Alla";
    const from = parseDate($("#dFrom")?.value || "");
    const to = parseDate($("#dTo")?.value || "");
    const limit = Number($("#limit")?.value || 600);

    let list = DATA.filter((e) => {
      if (cat !== "Alla" && e._cat !== cat) return false;
      if (country !== "Alla" && e._country !== country) return false;

      if (from && e._dt && e._dt < from) return false;
      if (to && e._dt && e._dt > to) return false;

      if (q) {
        const hay = normalizeStr(`${e._title} ${e._summary} ${e._cat} ${e._country} ${e._source}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // sort by date desc
    list.sort((a, b) => (b._dt?.getTime() || 0) - (a._dt?.getTime() || 0));

    // cap
    if (list.length > limit) list = list.slice(0, limit);

    return list;
  }

  // -----------------------------
  // 4) Nyckelord
  // -----------------------------
  const STOP = new Set([
    "och","att","som","det","den","en","ett","i","på","av","för","med","till","om","från","under","efter","innan",
    "the","a","an","and","or","of","to","in","on","for","with","from","at","by","as","is","are","was","were","be",
    "har","ha","hade","kan","kunde","ska","skulle","säger","uppger","enligt","mot","vid","nu","där","då",
  ]);

  function tokenize(text) {
    const t = normalizeStr(text)
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!t) return [];
    return t
      .split(/\s+/g)
      .filter(Boolean)
      .filter((w) => w.length >= 4 && !STOP.has(w));
  }

  function keywordCounts(events) {
    const c = new Map();
    for (const e of events) {
      const toks = tokenize(`${e._title} ${e._summary} ${e._source}`);
      for (const w of toks) c.set(w, (c.get(w) || 0) + 1);
    }
    return c;
  }

  // -----------------------------
  // 5) Heuristisk härledning (utan att ändra events)
  //    -> dimension, risknivå, sannolikhet
  // -----------------------------
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

  // Basrisk per kategori (1–5)
  const CAT_BASE_RISK = {
    TERROR: 4,
    INFRA: 4,
    NUCLEAR: 4,
    MIL: 4,
    MAR: 3,
    INTEL: 3,
    HYBRID: 3,
    DRONE: 3,
    GPS: 3,
    POLICY: 2,
    LEGAL: 2,
  };

  // Triggerord som justerar risk (kategorioberoende)
  const RISK_TRIGGERS = [
    // våld/sabotage/död
    { re: /\b(sabotage|spräng|explos|bomb|attack|skott|död|döds|dead|killed|mörd)\b/i, delta: +1 },
    // kritisk infra
    { re: /\b(cable|kabel|pipeline|gasledning|substation|kraftnät|power\s?grid|järnväg|rail|bridge|bro|hamn|port|airport|flygplats)\b/i, delta: +1 },
    // cyber/underrättelse/övervakning
    { re: /\b(spyware|implant|sigint|massövervak|mass\s?tracking|geofence|stingray|cell-site|intercept|wiretap|avlyssn)\b/i, delta: +1 },
    // “övning/test”
    { re: /\b(test|övning|exercise|drill)\b/i, delta: -1 },
  ];

  // Sannolikhetsvikter enligt din text
  // Bekräftat (>95%)=0.95; Sannolikt(75-95)=0.85; Troligen(40-75)=0.575; Möjligen(5-40)=0.225; Tveksam(0-5)=0.025
  const P = {
    bekraftat: 0.95,
    bekräftat: 0.95,
    sannolikt: 0.85,
    troligen: 0.575,
    mojligt: 0.225,
    möjligt: 0.225,
    möjligen: 0.225,
    tveksamt: 0.025,
    tveksam: 0.025,
  };

  // Domänklassning (du kan fylla på om du vill – men detta funkar direkt)
  const DOMAIN_CONF = {
    // myndigheter / officiellt
    official: [
      "polisen.se", "regeringen.se", "riksdagen.se", "domstol.se", "forsvarsmakten.se", "sakerhetspolisen.se", "msb.se",
      ".gov", ".mil", "europa.eu",
    ],
    // etablerade medier
    major: [
      "reuters.com","apnews.com","afp.com","bbc.","ft.com","wsj.com","nytimes.com","theguardian.com",
      "svt.se","dn.se","sr.se","sydsvenskan.se","gp.se","aftonbladet.se","expressen.se",
      "politico.","bloomberg.","lemonde.","spiegel.","zeit.de","rfi.fr","france24",
      "yle.fi","hs.fi","nrk.no","dr.dk","tv2.no",
    ],
    // social/aggregator (lägre)
    social: [
      "linkedin.com","x.com","twitter.com","t.me","telegram","facebook.com","instagram.com","youtube.com","tiktok.com",
      "ground.news","substack.com","medium.com",
    ],
  };

  // Språksignaler som drar ned säkerhet
  const UNCERTAIN_CUES = /\b(uppgift|uppgifter|obekräft|rykte|rykten|reportedly|alleged|claim|claims|sources|enligt\s+källor|suspected|possible)\b/i;
  const CONFIRM_CUES = /\b(bekräft|confirmed|confirm|åtal|dömd|dom|charges|indicted|arrested|gripits|häktad)\b/i;

  function classifyLikelihood(e) {
    const url = (e._url || "").toLowerCase();
    const text = `${e._title || ""} ${e._summary || ""} ${e._source || ""}`.toLowerCase();

    // officiellt
    if (DOMAIN_CONF.official.some((d) => (d.startsWith(".") ? url.includes(d) : url.includes(d)))) {
      return "Bekräftat";
    }

    // stora medier
    if (DOMAIN_CONF.major.some((d) => url.includes(d))) {
      if (UNCERTAIN_CUES.test(text)) return "Troligen";
      return "Sannolikt";
    }

    // social/aggregator
    if (DOMAIN_CONF.social.some((d) => url.includes(d))) {
      if (CONFIRM_CUES.test(text)) return "Troligen";
      return "Möjligen";
    }

    // fallback på textsignaler
    if (CONFIRM_CUES.test(text)) return "Sannolikt";
    if (UNCERTAIN_CUES.test(text)) return "Möjligen";
    return "Troligen";
  }

  function deriveRisk(e) {
    let r = CAT_BASE_RISK[e._cat] ?? 3;
    const text = `${e._title || ""} ${e._summary || ""}`;

    for (const t of RISK_TRIGGERS) {
      if (t.re.test(text)) r += t.delta;
    }

    // kategori-specifika småjusteringar
    if (e._cat === "POLICY") {
      if (/\b(sanction|sanktion|förbud|ban|emergency|undantagstillstånd)\b/i.test(text)) r += 1;
    }
    if (e._cat === "GPS") {
      if (/\b(jamming|spoof|störning|spoofing)\b/i.test(text)) r += 1;
    }
    if (e._cat === "DRONE") {
      if (/\b(intrång|intrusion|nedskjuten|shot\s+down|over\s+airport|flygplats)\b/i.test(text)) r += 1;
    }

    return clamp(r, 1, 5);
  }

  function deriveDim(e) {
    return CAT_TO_DIM[e._cat] || "Intentioner";
  }

  function derive(e) {
    const dim = deriveDim(e);
    const risk = deriveRisk(e);
    const likelihood = classifyLikelihood(e);

    // normalisera nyckel för P
    const lkKey = normalizeStr(likelihood).replace("ö", "o").replace("ä", "a"); // grov
    // men vi returnerar label, och gör nyckel senare
    return { dim, risk, likelihood };
  }

  function lkKey(s) {
    return normalizeStr(s)
      .replace("möjligen", "mojligt")
      .replace("möjligt", "mojligt")
      .replace("bekräftat", "bekraftat");
  }

  // -----------------------------
  // 6) Intentioner-beräkning: Bästa/Troligast/Värsta
  // -----------------------------
  const DIM_ORDER = ["Intentioner", "Facilitering", "Resurser", "Tillfälle"];
  const SCEN = ["best", "likely", "worst"];

  // scenarioregler
  const ORDER_LK = ["bekraftat", "sannolikt", "troligen", "mojligt", "tveksamt"];
  function scenarioIncludes(scenario, lk) {
    const i = ORDER_LK.indexOf(lk);
    if (i < 0) return false;
    if (scenario === "best") return i <= 0;      // bara bekräftat
    if (scenario === "likely") return i <= 1;    // bekräftat+sannolikt
    if (scenario === "worst") return i <= 4;     // alla
    return false;
  }

  function computeKapacitet(events) {
    // per dim per scen: array av viktade riskfaktorer
    const per = {};
    for (const d of DIM_ORDER) per[d] = { best: [], likely: [], worst: [] };

    const usable = [];
    for (const e of events) {
      const d = derive(e);
      const lk = lkKey(d.likelihood);
      const p = P[lk];
      if (!p) continue;

      const wr = d.risk * p; // viktad riskfaktor
      usable.push({ e, dim: d.dim, lk, wr, risk: d.risk, likelihood: d.likelihood });

      for (const sc of SCEN) {
        if (scenarioIncludes(sc, lk)) per[d.dim][sc].push(wr);
      }
    }

    const stats = (arr) => {
      if (!arr.length) return { mean: 0, max: 0 };
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const max = Math.max(...arr);
      return { mean, max };
    };

    const out = {};
    for (const d of DIM_ORDER) {
      out[d] = {
        best: stats(per[d].best),
        likely: stats(per[d].likely),
        worst: stats(per[d].worst),
      };
    }

    // total = medel av dimensionernas mean/max (dimension-wise)
    function totalFor(sc) {
      const means = DIM_ORDER.map((d) => out[d][sc].mean);
      const maxes = DIM_ORDER.map((d) => out[d][sc].max);
      const mean = means.reduce((a, b) => a + b, 0) / means.length;
      const max = maxes.reduce((a, b) => a + b, 0) / maxes.length;
      return { mean, max };
    }

    const total = {
      best: totalFor("best"),
      likely: totalFor("likely"),
      worst: totalFor("worst"),
    };

    // Skala till 0–100 på max 5.0 (risk 5 * 0.95 ≈ 4.75; vi använder 5 som tak för enkel läsbarhet)
    const toPct = (x) => Math.round((x / 5) * 100);

    const pct = {};
    for (const d of DIM_ORDER) {
      pct[d] = {
        best: { mean: toPct(out[d].best.mean), max: toPct(out[d].best.max) },
        likely: { mean: toPct(out[d].likely.mean), max: toPct(out[d].likely.max) },
        worst: { mean: toPct(out[d].worst.mean), max: toPct(out[d].worst.max) },
      };
    }
    const pctTotal = {
      best: { mean: toPct(total.best.mean), max: toPct(total.best.max) },
      likely: { mean: toPct(total.likely.mean), max: toPct(total.likely.max) },
      worst: { mean: toPct(total.worst.mean), max: toPct(total.worst.max) },
    };

    // “score” till KPI: välj Troligast mean i procent som total
    const scoreLikely = pctTotal.likely.mean;

    return { usable, out, total, pct, pctTotal, scoreLikely };
  }

  // Render bars + radar + top-lista
  function renderIntentioner(res, scopedEvents) {
    // KPI
    if ($("#kEvents")) $("#kEvents").textContent = String(scopedEvents.length);
    if ($("#kScore")) $("#kScore").textContent = `${res.scoreLikely}%`;

    // Bars: per dimension + total
    const host = $("#bars");
    if (host) {
      host.innerHTML = "";

      const mkRow = (label, p) => {
        const el = document.createElement("div");
        el.className = "bar";
        el.innerHTML = `
          <div class="top">
            <div class="name">${escapeHtml(label)}</div>
            <div class="val">B / T / V</div>
          </div>
          <div class="small">
            <b>Bästa</b>: ${p.best.mean}%–${p.best.max}% &nbsp;|&nbsp;
            <b>Troligast</b>: ${p.likely.mean}%–${p.likely.max}% &nbsp;|&nbsp;
            <b>Värsta</b>: ${p.worst.mean}%–${p.worst.max}%
          </div>
          <div class="track"><div class="fill" style="width:${p.likely.mean}%"></div></div>
        `;
        host.appendChild(el);
      };

      for (const d of DIM_ORDER) mkRow(d, res.pct[d]);
      mkRow("Total", res.pctTotal);
    }

    // Radar: 3 polygoner (best/likely/worst) på mean-värden
    renderRadar(res.pct);

    // Top contributors: sortera på wr (viktad risk) och visa 15
    const top = [...res.usable].sort((a, b) => b.wr - a.wr).slice(0, 15);
    const list = $("#topList");
    if (list) {
      list.innerHTML = "";
      top.forEach((c) => {
        const e = c.e;
        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
          <div class="it">${escapeHtml(e._title || "Event")}</div>
          <div class="im">${escapeHtml(e._cat || "–")} • ${escapeHtml(e._country || "–")} • ${escapeHtml(fmtDate(e._dt) || e.date || "")} •
            dim: <b>${escapeHtml(c.dim)}</b> • risk: <b>${c.risk}</b> • ${escapeHtml(c.likelihood)} • +${c.wr.toFixed(2)}
          </div>
          ${e._url ? `<a href="${encodeURI(e._url)}" target="_blank" rel="noopener">Källa</a>` : ""}
        `;
        list.appendChild(el);
      });
    }

    // pill
    if ($("#pillIntent")) {
      $("#pillIntent").textContent = `Urval: ${SCOPE.label} • ${scopedEvents.length} events`;
    }
  }

  function renderRadar(pctPerDim) {
    const svgEl = $("#radar");
    if (!svgEl || typeof d3 === "undefined") return;

    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();

    const W = 360, H = 300;
    const cx = W / 2, cy = 150, r = 110;

    const axes = DIM_ORDER.length;
    const angle = (i) => (Math.PI * 2 * i) / axes - Math.PI / 2;

    // rings
    [0.25, 0.5, 0.75, 1].forEach((rr) => {
      svg.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", r * rr)
        .attr("fill", "none").attr("stroke", "rgba(255,255,255,.10)");
    });

    // axes + labels
    DIM_ORDER.forEach((lab, i) => {
      const a = angle(i);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      svg.append("line")
        .attr("x1", cx).attr("y1", cy).attr("x2", x).attr("y2", y)
        .attr("stroke", "rgba(255,255,255,.12)");

      svg.append("text")
        .attr("x", cx + Math.cos(a) * (r + 18))
        .attr("y", cy + Math.sin(a) * (r + 18))
        .attr("fill", "rgba(219,231,255,.78)")
        .attr("font-size", 11)
        .attr("text-anchor", Math.cos(a) > 0.2 ? "start" : (Math.cos(a) < -0.2 ? "end" : "middle"))
        .attr("dominant-baseline", "middle")
        .text(lab);
    });

    const scenDefs = [
      { key: "best", label: "Bästa", fill: "rgba(219,231,255,.08)", stroke: "rgba(219,231,255,.25)" },
      { key: "likely", label: "Troligast", fill: "rgba(219,231,255,.16)", stroke: "rgba(219,231,255,.55)" },
      { key: "worst", label: "Värsta", fill: "rgba(219,231,255,.10)", stroke: "rgba(219,231,255,.35)" },
    ];

    scenDefs.forEach((sc) => {
      const pts = DIM_ORDER.map((d, i) => {
        const v = clamp((pctPerDim[d]?.[sc.key]?.mean ?? 0) / 100, 0, 1);
        const a = angle(i);
        return [cx + Math.cos(a) * r * v, cy + Math.sin(a) * r * v];
      });

      svg.append("polygon")
        .attr("points", pts.map((p) => p.join(",")).join(" "))
        .attr("fill", sc.fill)
        .attr("stroke", sc.stroke)
        .attr("stroke-width", 1.2);
    });
  }

  // -----------------------------
  // 7) Graf (D3 force)
  // -----------------------------
  let svg, gRoot, sim;
  let current = { events: [], nodes: [], links: [] };

  function nodeRadius(n) {
    if (n.type === "event") return 6 + Math.min(10, n.degree || 0);
    if (n.type === "cat") return 12 + Math.min(12, n.degree || 0);
    if (n.type === "country") return 12 + Math.min(12, n.degree || 0);
    if (n.type === "kw") return 10 + Math.min(10, n.degree || 0);
    return 10;
  }

  function buildGraph(events) {
    const kwMin = Number($("#kwMin")?.value || 3);

    const counts = keywordCounts(events);
    const kw = Array.from(counts.entries())
      .filter(([, v]) => v >= kwMin)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 140);

    const kwSet = new Set(kw.map(([k]) => k));

    const nodes = [];
    const links = [];
    const byId = new Map();

    const add = (id, obj) => {
      if (byId.has(id)) return byId.get(id);
      const n = { id, degree: 0, ...obj };
      byId.set(id, n);
      nodes.push(n);
      return n;
    };

    // cat/country/kw nodes
    Array.from(new Set(events.map((e) => e._cat).filter(Boolean))).forEach((c) =>
      add(`cat:${c}`, { type: "cat", label: c })
    );
    Array.from(new Set(events.map((e) => e._country).filter(Boolean))).forEach((c) =>
      add(`ctry:${c}`, { type: "country", label: c })
    );
    kwSet.forEach((w) => add(`kw:${w}`, { type: "kw", label: w }));

    // event nodes + links
    events.forEach((e, idx) => {
      const eid = `ev:${idx}`;
      add(eid, { type: "event", label: e._title || "Event", ev: e, evIdx: idx });

      if (e._cat) links.push({ source: eid, target: `cat:${e._cat}` });
      if (e._country) links.push({ source: eid, target: `ctry:${e._country}` });

      const toks = Array.from(
        new Set(tokenize(`${e._title} ${e._summary} ${e._source}`).filter((w) => kwSet.has(w)))
      ).slice(0, 8);

      toks.forEach((w) => links.push({ source: eid, target: `kw:${w}` }));
    });

    // degrees
    links.forEach((l) => {
      const a = byId.get(l.source);
      const b = byId.get(l.target);
      if (a) a.degree++;
      if (b) b.degree++;
    });

    // prune isolated non-event
    const keep = new Set(nodes.filter((n) => n.type === "event" || n.degree > 0).map((n) => n.id));
    const nodes2 = nodes.filter((n) => keep.has(n.id));
    const keep2 = new Set(nodes2.map((n) => n.id));
    const links2 = links.filter((l) => keep2.has(l.source) && keep2.has(l.target));

    return { nodes: nodes2, links: links2 };
  }

  function initGraph() {
    const host = $("#graph");
    if (!host) return;

    host.innerHTML = "";
    const w = host.clientWidth || 900;
    const h = host.clientHeight || 600;

    svg = d3.select(host).append("svg").attr("width", w).attr("height", h);

    const zoom = d3.zoom().scaleExtent([0.12, 4]).on("zoom", (ev) => gRoot.attr("transform", ev.transform));
    svg.call(zoom);

    gRoot = svg.append("g");
    gRoot.append("g").attr("class", "links");
    gRoot.append("g").attr("class", "nodes");
    gRoot.append("g").attr("class", "labels");

    // resize
    const ro = new ResizeObserver(() => {
      const ww = host.clientWidth || 900;
      const hh = host.clientHeight || 600;
      svg.attr("width", ww).attr("height", hh);
      if (sim) {
        sim.force("center", d3.forceCenter(ww / 2, hh / 2));
        sim.alpha(0.25).restart();
      }
    });
    ro.observe(host);

    // zoom fit btn
    on($("#btnZoomFit"), "click", () => zoomToFit(zoom));
  }

  function zoomToFit(zoom, pad = 0.15) {
    if (!svg || !current.nodes.length) return;

    const host = $("#graph");
    const w = host?.clientWidth || 900;
    const h = host?.clientHeight || 600;

    const xs = current.nodes.map((n) => n.x).filter(Number.isFinite);
    const ys = current.nodes.map((n) => n.y).filter(Number.isFinite);
    if (!xs.length || !ys.length) return;

    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = maxX - minX, dy = maxY - minY;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const scale = 0.92 / Math.max(dx / w, dy / h);
    const s = clamp(scale, 0.12, 4);
    const tx = w / 2 - s * cx;
    const ty = h / 2 - s * cy;

    const tr = d3.zoomIdentity.translate(tx, ty).scale(s);
    svg.transition().duration(450).call(zoom.transform, tr);
  }

  function renderGraph(model) {
    if (!gRoot) return;

    current.nodes = model.nodes;
    current.links = model.links;

    const linkG = gRoot.select("g.links");
    const nodeG = gRoot.select("g.nodes");
    const labelG = gRoot.select("g.labels");

    // links
    const linkSel = linkG.selectAll("line").data(current.links, (d) => `${d.source}->${d.target}`);
    linkSel.exit().remove();
    linkSel.enter()
      .append("line")
      .attr("stroke", "rgba(255,255,255,.14)")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.55);

    // nodes
    const nodeSel = nodeG.selectAll("circle").data(current.nodes, (d) => d.id);
    nodeSel.exit().remove();

    const nodeEnter = nodeSel.enter()
      .append("circle")
      .attr("r", (d) => nodeRadius(d))
      .attr("fill", "rgba(255,255,255,.06)")
      .attr("stroke", "rgba(219,231,255,.75)")
      .attr("stroke-width", 1.1)
      .attr("cursor", "pointer")
      .call(
        d3.drag()
          .on("start", (ev, d) => {
            if (!ev.active && sim) sim.alphaTarget(0.25).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x; d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active && sim) sim.alphaTarget(0);
          })
      )
      .on("click", (_, d) => onNodeClick(d));

    // labels (non-event + top events)
    const topEvents = current.nodes
      .filter((n) => n.type === "event")
      .sort((a, b) => (b.degree || 0) - (a.degree || 0))
      .slice(0, 18)
      .map((n) => n.id);

    const labelNodes = current.nodes.filter((n) => n.type !== "event" || topEvents.includes(n.id));
    const labelSel = labelG.selectAll("text").data(labelNodes, (d) => d.id);
    labelSel.exit().remove();
    labelSel.enter()
      .append("text")
      .text((d) => d.label)
      .attr("font-size", (d) => (d.type === "event" ? 10 : 11))
      .attr("fill", "rgba(219,231,255,.75)")
      .attr("pointer-events", "none");

    // simulation
    const host = $("#graph");
    const w = host?.clientWidth || 900;
    const h = host?.clientHeight || 600;
    if (sim) sim.stop();

    sim = d3.forceSimulation(current.nodes)
      .force("link", d3.forceLink(current.links).id((d) => d.id).distance(70).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-420))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collide", d3.forceCollide().radius((d) => nodeRadius(d) + 3).iterations(2))
      .on("tick", () => {
        linkG.selectAll("line")
          .attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y)
          .attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);

        nodeG.selectAll("circle")
          .attr("cx", (d) => d.x).attr("cy", (d) => d.y);

        labelG.selectAll("text")
          .attr("x", (d) => d.x + 10).attr("y", (d) => d.y + 4);
      });

    if ($("#hudInfo")) $("#hudInfo").textContent = `${current.nodes.length} noder • ${current.links.length} länkar`;
  }

  function onNodeClick(n) {
    if ($("#pillSel")) $("#pillSel").textContent = n.type;

    if (n.type === "event") {
      const e = n.ev;
      const d = derive(e);

      if ($("#detail")) {
        $("#detail").innerHTML = `
          <b>${escapeHtml(e._title || "Event")}</b><br>
          <span style="color:var(--muted)">${escapeHtml(e._cat || "–")} • ${escapeHtml(e._country || "–")} • ${escapeHtml(fmtDate(e._dt) || e.date || "")}</span><br>
          <span style="color:var(--muted)">dim: <b>${escapeHtml(d.dim)}</b> • risk: <b>${d.risk}</b> • ${escapeHtml(d.likelihood)}</span><br>
          <span>${escapeHtml((e._summary || "").slice(0, 340))}${(e._summary || "").length > 340 ? "…" : ""}</span><br>
          ${e._url ? `<a href="${encodeURI(e._url)}" target="_blank" rel="noopener">Öppna källa</a>` : ""}`;
      }

      // scope = enbart det eventet (index i aktuell filterlista)
      SCOPE = { type: "event", label: e._title || "Event", idxSet: new Set([n.evIdx]) };
    } else {
      // scope = events som är länkade till noden
      const id = n.id;
      const evIds = new Set(
        current.links
          .filter((l) => (l.source.id || l.source) === id || (l.target.id || l.target) === id)
          .map((l) => ((l.source.id || l.source) === id ? (l.target.id || l.target) : (l.source.id || l.source)))
          .filter((x) => String(x).startsWith("ev:"))
      );

      const idxSet = new Set();
      for (const evId of evIds) {
        const m = String(evId).match(/^ev:(\d+)$/);
        if (m) idxSet.add(Number(m[1]));
      }

      SCOPE = { type: n.type, label: n.label || n.id, idxSet };

      if ($("#detail")) {
        $("#detail").innerHTML = `<b>${escapeHtml(n.label || n.id)}</b><br><span style="color:var(--muted)">${idxSet.size} relaterade events</span>`;
      }
    }

    if ($("#pillScope")) $("#pillScope").textContent = `Urval: ${SCOPE.label}`;
    refreshIntentioner(); // uppdatera direkt
  }

  // -----------------------------
  // 8) Refresh: graf + intentioner
  // -----------------------------
  function refreshIntentioner() {
    // bas = filterlistan som grafen byggs på
    const base = current.events || [];
    let scoped = base;

    if (SCOPE.idxSet && SCOPE.idxSet.size) {
      scoped = base.filter((_, idx) => SCOPE.idxSet.has(idx));
    }

    const res = computeKapacitet(scoped);
    renderIntentioner(res, scoped);
  }

  function refresh() {
    const list = applyFilters();
    current.events = list;

    if ($("#subTitle")) $("#subTitle").textContent = `${DATA.length} events totalt`;
    if ($("#pillCount")) $("#pillCount").textContent = `${list.length} i filter`;

    // Om scope finns: behåll bara index som fortfarande finns
    if (SCOPE.idxSet && SCOPE.idxSet.size) {
      const still = new Set();
      for (const i of SCOPE.idxSet) if (i >= 0 && i < list.length) still.add(i);
      SCOPE.idxSet = still;
      if (!still.size) setScopeAll();
    }

    if (!svg) initGraph();
    const model = buildGraph(list);
    renderGraph(model);

    refreshIntentioner();
  }

  // -----------------------------
  // 9) Fullscreen + reset + listeners
  // -----------------------------
  function setFullscreen(on) {
    document.documentElement.classList.toggle("fullscreen", on);
    const b = $("#btnFullscreen");
    if (b) b.textContent = on ? "Avsluta helskärm" : "Helskärm (graf)";
    setTab("graph");
    setTimeout(() => refresh(), 80);
  }

  function initListeners() {
    on($("#tabGraph"), "click", () => setTab("graph"));
    on($("#tabIntent"), "click", () => setTab("intent"));

    ["input", "change"].forEach((ev) => {
      on($("#q"), ev, refresh);
      on($("#dFrom"), ev, refresh);
      on($("#dTo"), ev, refresh);
      on($("#cat"), ev, refresh);
      on($("#country"), ev, refresh);
      on($("#limit"), ev, refresh);
      on($("#kwMin"), ev, refresh);
    });

    on($("#btnReset"), "click", () => {
      if ($("#q")) $("#q").value = "";
      if ($("#cat")) $("#cat").value = "Alla";
      if ($("#country")) $("#country").value = "Alla";
      if (minDt && $("#dFrom")) $("#dFrom").value = fmtDate(minDt);
      if (maxDt && $("#dTo")) $("#dTo").value = fmtDate(maxDt);
      if ($("#limit")) $("#limit").value = String(Math.min(600, Math.max(200, DATA.length || 200)));
      if ($("#kwMin")) $("#kwMin").value = "3";
      setScopeAll();
      refresh();
    });

    on($("#btnClearScope"), "click", setScopeAll);

    on($("#btnFullscreen"), "click", () => {
      const onFs = !document.documentElement.classList.contains("fullscreen");
      setFullscreen(onFs);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.documentElement.classList.contains("fullscreen")) {
        setFullscreen(false);
      }
    });
  }

  // -----------------------------
  // 10) Init
  // -----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    const ok = assertDom([
      "tabGraph","tabIntent","viewGraph","viewIntent",
      "graph","btnFullscreen","btnReset","btnZoomFit","btnClearScope",
      "pillScope","pillCount","subTitle","hudInfo","pillSel","detail",
      "q","dFrom","dTo","cat","country","limit","limitVal","kwMin","kwMinVal",
      "pillIntent","kEvents","kScore","bars","radar","topList"
    ]);

    // Om index inte matchar – kör ändå graf om möjligt
    initFilters();
    initListeners();
    setTab("graph");

    // Om sidan inte har alla intentioner-ID:n kommer graf ändå funka.
    refresh();

    if (!ok) {
      // inget mer: användaren ser vilka ID som saknas i subTitle/console
    }
  });

})();
