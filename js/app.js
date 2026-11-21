/* Lesja lokalhistorie – søkeregister
 * Ren JavaScript uten byggesteg. Lokale data ligger i data/*.js,
 * og live-søk går direkte mot åpne API-er (Lokalhistoriewiki, Nasjonalbiblioteket,
 * Kartverket, Wikipedia) som tillater kall fra nettleseren.
 */
(function () {
  "use strict";

  const KNR = "3432"; // Lesja kommune
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;

  // ---------- Normalisering for «snill» matching av gamle og nye skrivemåter ----------
  function fold(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/aa/g, "a")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/æ/g, "e").replace(/ø/g, "o")
      .replace(/th/g, "t").replace(/ck/g, "k").replace(/ph/g, "f").replace(/w/g, "v").replace(/c/g, "k").replace(/z/g, "s")
      .replace(/([a-z])\1+/g, "$1")
      .replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // ---------- Bygg lokalt register ----------
  const STEDTYPER = (window.LH_STEDER && window.LH_STEDER.typer) || [];
  const GARDTYPER = new Set(["Gard", "Bruk", "Navnegard", "Eiendom", "Gammel bosettingsplass", "Tuft", "Allmenning"]);
  const SETERTYPER = new Set(["Seter/støl", "Setervoll", "Støls-/setereiendom"]);
  const BYGDEBOK = [
    { bd: 1, urn: "URN:NBN:no-nb_digibok_2013091224006", t: "Bd. 1 – Lesjaskogen (1987)" },
    { bd: 2, urn: "URN:NBN:no-nb_digibok_2007112804068", t: "Bd. 2 – nørdre del av Lesja hovudsokn (1992)" },
    { bd: 3, urn: "URN:NBN:no-nb_digibok_2011021408109", t: "Bd. 3 – søre del av Lesja hovudsokn (1996)" },
  ];

  const R = []; // alle poster
  function add(o) { o.f = fold([o.tittel, o.alt || "", o.tekst || "", (o.stikk || []).join(" ")].join(" ")); o.ft = fold(o.tittel); R.push(o); }

  (window.LH_WIKI || []).forEach((w) => {
    add({
      kind: w.y === "person" ? "person" : w.y === "gard" ? "gard" : "artikkel",
      tittel: w.t,
      meta: [w.l ? "f. " + w.l.replace("–", ", d. ").replace(/, d\. $/, "") : "", w.k ? "" : "nevner Lesja", "Lokalhistoriewiki"].filter(Boolean).join(" · "),
      tekst: w.e, stikk: w.c,
      url: "https://lokalhistoriewiki.no/wiki/" + enc(w.t.replace(/ /g, "_")),
      gnr: w.g ? [w.g] : [], vekt: w.k ? 1 : 0.6, kilde: "wiki",
    });
  });

  (window.LH_STEDER && window.LH_STEDER.navn || []).forEach((s) => {
    const [navn, ti, nord, ost, nr, mat] = s;
    const type = STEDTYPER[ti] || "";
    if (type === "Adressenavn") return;
    const kind = GARDTYPER.has(type) ? "gard" : SETERTYPER.has(type) ? "seter" : "sted";
    add({
      kind, tittel: navn, type, nord, ost, nr,
      gnr: mat ? mat.split(",") : [],
      meta: type + (mat ? "" : ""),
      tekst: type, vekt: kind === "sted" ? 0.8 : 1, kilde: "ssr",
    });
  });

  (window.LH_NB || []).forEach((b) => {
    add({
      kind: "litt", tittel: b.t, meta: [b.a, b.y, b.m].filter(Boolean).join(" · "),
      tekst: b.a, url: b.u.startsWith("URN") ? "https://www.nb.no/items/" + b.u : "https://www.nb.no/items/" + b.u,
      tilgang: b.x, vekt: 0.9, kilde: "nb", gnr: [],
    });
  });

  (window.LH_ARKIV || []).forEach((a) => {
    add({ kind: "arkiv", tittel: a.t, meta: a.k + " · Digitalarkivet", tekst: a.k, url: "https://www.digitalarkivet.no/source/" + a.i, vekt: 0.9, kilde: "da", gnr: [], kat: a.k });
  });

  (window.LH_EGNE || []).forEach((e) => {
    if (!e || !e.tittel) return;
    add({
      kind: "egen", tittel: e.tittel,
      meta: [e.type, e.forfatter, e.kilde, e.aar].filter(Boolean).join(" · "),
      tekst: e.tekst || "", stikk: e.stikkord || [], url: e.lenke || "",
      gnr: e.gnr ? String(e.gnr).split(/[,;]\s*/) : [], vekt: 1.2, kilde: "egen", undertype: e.type,
    });
  });

  // Indeks gnr -> poster
  const GNR = new Map();
  R.forEach((o) => (o.gnr || []).forEach((g) => { const h = String(g).split("/")[0]; if (!GNR.has(h)) GNR.set(h, []); GNR.get(h).push(o); }));

  const FILTER = {
    alle: () => true,
    person: (o) => o.kind === "person" || (o.kind === "egen" && o.undertype === "person"),
    gard: (o) => o.kind === "gard" || o.kind === "seter" || (o.kind === "egen" && o.undertype === "gard"),
    sted: (o) => o.kind === "sted" || (o.kind === "egen" && o.undertype === "sted"),
    artikkel: (o) => o.kind === "artikkel" || (o.kind === "egen" && !["person", "gard", "sted"].includes(o.undertype)),
    litt: (o) => o.kind === "litt",
    arkiv: (o) => o.kind === "arkiv",
  };
  const SEKSJONER = [
    ["person", "Personer"], ["gard", "Gårder, bruk og setre"], ["artikkel", "Artikler og egne notater"],
    ["sted", "Stedsnavn"], ["litt", "Litteratur (Nasjonalbiblioteket)"], ["arkiv", "Kirkebøker og arkiv (Digitalarkivet)"],
  ];
  const MERKE = { person: "Person", gard: "Gård", seter: "Seter", sted: "Sted", artikkel: "Artikkel", litt: "Litteratur", arkiv: "Arkiv", egen: "Egen" };

  // ---------- Søk ----------
  function tolkGnr(q) {
    const m = q.trim().match(/^(?:gnr\.?\s*)?(\d{1,3})(?:\s*(?:[\/.\-]|\s+bnr\.?|\s)\s*(\d{1,4}))?$/i);
    return m ? { g: m[1], b: m[2] || null } : null;
  }

  function sok(q) {
    const gn = tolkGnr(q);
    if (gn) {
      const liste = (GNR.get(gn.g) || []).map((o) => {
        const eksakt = gn.b ? o.gnr.some((x) => x === gn.g + "/" + gn.b) : true;
        return eksakt ? { o, s: 100 * o.vekt } : null;
      }).filter(Boolean);
      // Arkiv: folkeregisterkort ordnet etter gnr
      R.filter((o) => o.kind === "arkiv" && /gnr\./.test(o.tittel)).forEach((o) => {
        const m = o.tittel.match(/gnr\.\s*(\d+)\s*(?:bnr\.\s*\d+\s*)?-\s*(?:gnr\.\s*)?(\d+)/);
        if (m && +gn.g >= +m[1] && +gn.g <= +m[2]) liste.push({ o, s: 20 });
      });
      return { treff: liste, gnr: gn };
    }
    const fq = fold(q);
    if (!fq) return { treff: [] };
    const ord = fq.split(" ").filter((w) => w.length > 0);
    const res = [];
    for (const o of R) {
      if (!ord.every((w) => o.f.includes(w))) continue;
      let s = 5;
      if (o.ft === fq) s = 100;
      else if (o.ft.startsWith(fq)) s = 70;
      else if ((" " + o.ft).includes(" " + fq)) s = 50;
      else if (ord.every((w) => o.ft.includes(w))) s = 35;
      res.push({ o, s: s * o.vekt });
    }
    return { treff: res };
  }

  function utheve(tekst, q) {
    const t = esc(tekst);
    if (!q || tolkGnr(q)) return t;
    const ord = q.trim().split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!ord.length) return t;
    try { return t.replace(new RegExp("(" + ord.join("|") + ")", "gi"), "<mark>$1</mark>"); } catch { return t; }
  }

  function gnrTekst(o) { return (o.gnr || []).map((g) => `<span class="gnr">${esc(g)}</span>`).join(" "); }

  function kortHTML(o, q) {
    const kl = o.kind === "seter" ? "seter" : o.kind;
    const tittel = o.kilde === "ssr"
      ? `<button class="knapp-lenke" data-detalj="${R.indexOf(o)}">${utheve(o.tittel, q)}</button>`
      : o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener">${utheve(o.tittel, q)}</a>` : utheve(o.tittel, q);
    const ekstra = o.kilde === "nb" && o.tilgang ? ` · ${o.tilgang === "EVERYWHERE" ? "åpen" : o.tilgang === "NORWAY" ? "åpen i Norge" : "kun hos NB"}` : "";
    const utdrag = o.kilde === "wiki" || o.kilde === "egen" ? o.tekst : "";
    return `<div class="treff t-${kl}"><span class="merke m-${kl}">${MERKE[o.kind]}</span><div class="treff-tekst">
      <div class="treff-tittel">${tittel} ${gnrTekst(o)}</div>
      <div class="treff-meta">${esc(o.meta || "")}${ekstra}${o.kilde === "ssr" ? ` · <button class="knapp-lenke" data-detalj="${R.indexOf(o)}">detaljer og kilder</button>` : ""}</div>
      ${utdrag ? `<div class="treff-utdrag">${utheve(utdrag.slice(0, 220), q)}${utdrag.length > 220 ? "…" : ""}</div>` : ""}
    </div></div>`;
  }

  const visAntall = {};
  function visLokale(q, filter, sortert) {
    const el = $("#lokale");
    const seksjoner = filter === "alle" ? SEKSJONER : SEKSJONER.filter(([k]) => k === filter);
    let html = "";
    let total = 0;
    for (const [k, navn] of seksjoner) {
      const liste = sortert.filter((x) => FILTER[k](x.o));
      total += liste.length;
      if (!liste.length && filter === "alle") continue;
      const max = visAntall[k] || (filter === "alle" ? 8 : 60);
      html += `<div class="seksjon"><div class="seksjon-topp"><h2>${navn}</h2><small>${liste.length} treff</small></div>`;
      html += liste.slice(0, max).map((x) => kortHTML(x.o, q)).join("") || `<p class="ingen">Ingen treff i registeret.</p>`;
      if (liste.length > max) html += `<button class="vis-flere" data-flere="${k}">Vis flere (${liste.length - max} til)</button>`;
      html += `</div>`;
    }
    const navnF = { alle: "", person: "personer", gard: "gårder og setre", sted: "stedsnavn", artikkel: "artikler", litt: "litteratur", arkiv: "kirkebøker og arkiv" }[filter];
    const status = q ? `<div class="sokestatus"><b>«${esc(q)}»</b>${total.toLocaleString("nb-NO")} treff i registeret${navnF ? " – " + navnF : ""}</div>`
                     : `<div class="sokestatus"><b>${esc(navnF.charAt(0).toUpperCase() + navnF.slice(1))}</b>${total.toLocaleString("nb-NO")} oppføringer</div>`;
    if (!total) html = `<div class="boks"><h2>Ingen treff i det lokale registeret</h2><p>Prøv en annen skrivemåte, eller se resultatene fra kildene til høyre. Registeret matcher gamle og nye skrivemåter (f.eks. <em>Botheim/Bottheim</em>, <em>aa/å</em>).</p></div>`;
    el.innerHTML = status + html;
  }

  // ---------- Live-søk mot kildene ----------
  let liveToken = 0;
  const cacheNB = {};

  async function hentJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function liveBoks(id, tittel, lenke) {
    return `<div class="livebox" id="lb-${id}"><h4><span>${tittel}</span>${lenke ? `<small><a href="${esc(lenke)}" target="_blank" rel="noopener">åpne ↗</a></small>` : ""}</h4><div class="laster">Henter</div></div>`;
  }
  function fyll(id, token, html) {
    if (token !== liveToken) return;
    const b = document.getElementById("lb-" + id);
    if (b) b.querySelector(".laster, .lb-innhold").outerHTML = `<div class="lb-innhold">${html}</div>`;
  }
  const feil = (e) => `<span class="u">Kunne ikke hente (${esc(e.message || e)}). Bruk lenken «åpne».</span>`;
  const ingenLive = `<span class="u">Ingen treff.</span>`;

  function nbDato(s) { return s && s.length === 8 ? `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}` : s || ""; }

  async function liveSok(q, gn) {
    const token = ++liveToken;
    const boks = $("#live-bokser");
    const term = q.trim();
    const parts = [];
    if (gn) {
      parts.push(liveBoks("matr", `Matrikkel: gnr ${gn.g}${gn.b ? "/" + gn.b : ""} i dag`, null));
    }
    if (!gn) {
      parts.push(`<div class="livebox"><h4><span>Bilder</span><small><button class="knapp-lenke" data-bildesok="${esc(term)}">se alle →</button></small></h4><div id="live-bilder" class="laster">Henter</div></div>`);
      parts.push(liveBoks("bb", "Bygdebok for Lesja bd. 1–3", null));
      parts.push(liveBoks("wiki", "Lokalhistoriewiki", `https://lokalhistoriewiki.no/index.php?search=${enc(term + " Lesja")}&fulltext=1`));
      parts.push(liveBoks("avis", "Aviser (Nasjonalbiblioteket)", `https://www.nb.no/search?q=${enc(term + " Lesja")}&mediatype=aviser`));
      parts.push(liveBoks("bok", "Bøker (Nasjonalbiblioteket)", `https://www.nb.no/search?q=${enc(term + " Lesja")}&mediatype=b%C3%B8ker`));
      parts.push(liveBoks("ssr", "Stedsnavn (Kartverket)", null));
      parts.push(liveBoks("wp", "Wikipedia", `https://no.wikipedia.org/w/index.php?search=${enc(term + " Lesja")}`));
    }
    boks.innerHTML = parts.join("");

    if (gn) {
      const u = `https://ws.geonorge.no/adresser/v1/sok?kommunenummer=${KNR}&gardsnummer=${gn.g}${gn.b ? "&bruksnummer=" + gn.b : ""}&treffPerSide=100`;
      hentJSON(u).then((j) => {
        const a = j.adresser || [];
        if (!a.length) return fyll("matr", token, `<span class="u">Ingen adresser registrert på denne eiendommen i dag (vanlig for setre og utmark).</span>`);
        a.sort((x, y) => x.bruksnummer - y.bruksnummer || x.adressetekst.localeCompare(y.adressetekst, "no"));
        fyll("matr", token, `<ol>${a.slice(0, 40).map((x) => `<li><span class="gnr">${x.gardsnummer}/${x.bruksnummer}${x.festenummer ? "/" + x.festenummer : ""}</span> ${esc(x.adressetekst)}${x.adressetilleggsnavn ? " (" + esc(x.adressetilleggsnavn) + ")" : ""} <a href="https://www.openstreetmap.org/?mlat=${x.representasjonspunkt.lat}&mlon=${x.representasjonspunkt.lon}#map=16/${x.representasjonspunkt.lat}/${x.representasjonspunkt.lon}" target="_blank" rel="noopener">kart</a></li>`).join("")}</ol><span class="u">${a.length} adresser i dagens matrikkel (Kartverket).</span>`);
      }).catch((e) => fyll("matr", token, feil(e)));
      return;
    }

    bildestripe(document.getElementById("live-bilder"), term, 6, "live");

    // Bygdebøkene – søk i fulltekst
    (async () => {
      try {
        const rader = [];
        for (const b of BYGDEBOK) {
          if (!cacheNB[b.urn]) {
            const j = await hentJSON(`https://api.nb.no/catalog/v1/items?q=*&filter=${enc('urn:"' + b.urn + '"')}&size=1`);
            cacheNB[b.urn] = j._embedded && j._embedded.items[0] && j._embedded.items[0].id;
          }
          const id = cacheNB[b.urn];
          if (!id) continue;
          const f = await hentJSON(`https://api.nb.no/catalog/v1/items/${id}/contentfragments?q=${enc(term)}&fragments=200`);
          const sider = [...new Set((f.contentFragments || []).map((x) => x.pageNumber).filter(Boolean))];
          rader.push(`<li><a href="https://www.nb.no/items/${b.urn}?searchText=${enc(term)}" target="_blank" rel="noopener">${esc(b.t)}</a><span class="u">${sider.length ? "Treff på side " + sider.slice(0, 25).join(", ") + (sider.length > 25 ? ` … (${sider.length} sider)` : "") : "Ingen treff"}</span></li>`);
        }
        fyll("bb", token, rader.length ? `<ol>${rader.join("")}</ol><span class="u">Bøkene er åpne for lesing fra norske nettadresser.</span>` : ingenLive);
      } catch (e) { fyll("bb", token, feil(e)); }
    })();

    // Lokalhistoriewiki
    hentJSON(`https://lokalhistoriewiki.no/api.php?action=query&list=search&format=json&origin=*&srlimit=10&srsearch=${enc(term + " Lesja")}`)
      .then((j) => {
        const s = j.query.search;
        fyll("wiki", token, s.length ? `<ol>${s.map((x) => `<li><a href="https://lokalhistoriewiki.no/wiki/${enc(x.title.replace(/ /g, "_"))}" target="_blank" rel="noopener">${esc(x.title)}</a><span class="u">${x.snippet.replace(/<(?!\/?span)[^>]*>/g, "").replace(/<span class="searchmatch">/g, "<mark>").replace(/<\/span>/g, "</mark>")}</span></li>`).join("")}</ol><span class="u">${j.query.searchinfo.totalhits} treff totalt.</span>` : ingenLive);
      }).catch((e) => fyll("wiki", token, feil(e)));

    // NB aviser og bøker
    const nb = (mt, id) => hentJSON(`https://api.nb.no/catalog/v1/items?q=${enc(term + " Lesja")}&filter=mediatype:${enc(mt)}&searchType=FULL_TEXT_SEARCH&size=10`)
      .then((j) => {
        const it = (j._embedded && j._embedded.items) || [];
        const tot = j.page ? j.page.totalElements : 0;
        fyll(id, token, it.length ? `<ol>${it.map((x) => {
          const m = x.metadata, urn = m.identifiers && m.identifiers.urn;
          const lenke = "https://www.nb.no/items/" + (urn || x.id) + "?searchText=" + enc(term);
          const dato = mt === "aviser" ? nbDato(m.originInfo && m.originInfo.issued) : (m.originInfo && m.originInfo.issued) || "";
          return `<li><a href="${lenke}" target="_blank" rel="noopener">${esc((m.title || "").trim())}</a><span class="u">${esc([dato, (m.creators || []).slice(0, 2).join("; ")].filter(Boolean).join(" · "))}</span></li>`;
        }).join("")}</ol><span class="u">${tot.toLocaleString("nb-NO")} treff totalt.</span>` : ingenLive);
      }).catch((e) => fyll(id, token, feil(e)));
    nb("aviser", "avis");
    nb("bøker", "bok");

    // Kartverket stedsnavn
    hentJSON(`https://api.kartverket.no/stedsnavn/v1/navn?sok=${enc(term)}&knr=${KNR}&fuzzy=true&treffPerSide=15`)
      .then((j) => {
        const n = j.navn || [];
        fyll("ssr", token, n.length ? `<ol>${n.map((x) => `<li><a href="https://stadnamn.kartverket.no/fakta/${x.stedsnummer}" target="_blank" rel="noopener">${esc(x.skrivemåte)}</a><span class="u">${esc(x.navneobjekttype)}</span></li>`).join("")}</ol>` : ingenLive);
      }).catch((e) => fyll("ssr", token, feil(e)));

    // Wikipedia (bokmål + nynorsk)
    Promise.all(["no", "nn"].map((l) => hentJSON(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=${enc(term + " Lesja")}`).then((j) => j.query.search.map((x) => ({ ...x, l }))).catch(() => [])))
      .then(([a, b]) => {
        const s = [...a, ...b];
        fyll("wp", token, s.length ? `<ol>${s.map((x) => `<li><a href="https://${x.l}.wikipedia.org/wiki/${enc(x.title.replace(/ /g, "_"))}" target="_blank" rel="noopener">${esc(x.title)}</a> <span class="u">${x.l === "nn" ? "nynorsk" : "bokmål"}</span></li>`).join("")}</ol>` : ingenLive);
      });
  }

  function dyplenker(q) {
    const term = q.trim();
    $("#dyplenker").innerHTML = (window.LH_KILDER || []).filter((k) => k.sok)
      .map((k) => `<li><a href="${esc(k.sok.replace(/\{q\}/g, enc(term)))}" target="_blank" rel="noopener">${esc(k.navn)} ↗</a></li>`).join("");
  }

  // ---------- Detaljvisning for gård/sted ----------
  function osm(lat, lon, z = 15) { return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`; }

  function visDetalj(o) {
    const nabo = [];
    (o.gnr || []).forEach((g) => (GNR.get(g.split("/")[0]) || []).forEach((x) => { if (x !== o && !nabo.includes(x)) nabo.push(x); }));
    const wikiTreff = R.filter((x) => x.kilde === "wiki" && fold(x.tittel).split(" ").includes(fold(o.tittel)));
    const t = o.tittel;
    let html = `<span class="merke m-${o.kind === "seter" ? "seter" : o.kind}">${MERKE[o.kind]}</span>
      <h2>${esc(t)}</h2>
      <div class="treff-meta">${esc(o.type || "")}${o.gnr.length ? " · Gnr/bnr i dag: " + gnrTekst(o) : ""}</div>
      <div class="knapperad">
        ${o.nord ? `<a href="${osm(o.nord, o.ost)}" target="_blank" rel="noopener">Vis i kart</a>` : ""}
        ${o.nr ? `<a href="https://stadnamn.kartverket.no/fakta/${o.nr}" target="_blank" rel="noopener">Faktaark hos Kartverket</a>` : ""}
        <a href="https://www.digitalarkivet.no/search/persons?s=${enc(t + " Lesja")}" target="_blank" rel="noopener">Digitalarkivet: personer</a>
        <a href="https://www.nb.no/search?q=${enc('"' + t + '" Lesja')}&mediatype=aviser" target="_blank" rel="noopener">Aviser</a>
        <a href="https://lokalhistoriewiki.no/index.php?search=${enc(t + " Lesja")}&fulltext=1" target="_blank" rel="noopener">Lokalhistoriewiki</a>
      </div>`;
    if (wikiTreff.length) html += `<div class="boks"><h3>Artikler på Lokalhistoriewiki</h3><ul>${wikiTreff.slice(0, 10).map((x) => `<li><a href="${x.url}" target="_blank" rel="noopener">${esc(x.tittel)}</a></li>`).join("")}</ul></div>`;
    if (nabo.length) {
      nabo.sort((a, b) => (a.gnr[0] || "").localeCompare(b.gnr[0] || "", "no", { numeric: true }));
      html += `<div class="boks"><h3>Andre navn og artikler på samme gårdsnummer</h3><table class="tabell"><tr><th>Navn</th><th>Type</th><th>Gnr/bnr</th></tr>${nabo.slice(0, 60).map((x) => `<tr><td>${x.kilde === "ssr" ? `<button class="knapp-lenke" data-detalj="${R.indexOf(x)}">${esc(x.tittel)}</button>` : `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.tittel)}</a>`}</td><td>${esc(x.type || MERKE[x.kind])}</td><td>${gnrTekst(x)}</td></tr>`).join("")}</table></div>`;
    }
    html += `<div class="boks"><h3>Bilder</h3><div id="detalj-bilder" class="laster">Henter</div><p style="margin:8px 0 0"><button class="knapp-lenke" data-bildesok="${esc(t)}">Søk etter flere bilder av ${esc(t)} →</button></p></div>`;
    html += `<p class="hjelp">Gnr/bnr er matrikkelenheten der navnepunktet ligger i dagens matrikkel (Kartverket). For en navnegard (gruppe av gårder) kan flere bruk være relevante. Eldre matrikler (1838, 1886, 1950) og bygdeboka kan ha annen inndeling.</p>
      <p><button class="knapp-lenke" data-sok="${esc(t)}">Søk etter «${esc(t)}» i alle kilder →</button></p>`;
    $("#detalj-innhold").innerHTML = html;
    $("#detalj").hidden = false;
    bildestripe(document.getElementById("detalj-bilder"), t, 8, "detalj");
  }

  // ---------- Forside og bla-visninger ----------
  const IKON = {
    gard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11 L12 4 L21 11"/><path d="M5 10 V20 H19 V10"/><path d="M10 20 V14 H14 V20"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 16 8 14 12 14 C16 14 20 16 20 21"/></svg>',
    artikkel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3 H15 L19 7 V21 H6 Z"/><path d="M9 11 H16 M9 15 H16 M9 7 H13"/></svg>',
    litt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6 C9 4 6 4 3 5 V19 C6 18 9 18 12 20 C15 18 18 18 21 19 V5 C18 4 15 4 12 6 Z"/><path d="M12 6 V20"/></svg>',
    arkiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9 V20 H19 V9"/><path d="M10 13 H14"/></svg>',
    bilder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M3 17 L9 13 L13 16 L16 13 L21 17"/></svg>',
    kilder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12 H21 M12 3 C15 6 15 18 12 21 C9 18 9 6 12 3"/></svg>',
    kart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z"/><path d="M9 4 V18 M15 6 V20"/></svg>',
  };

  function forside() {
    const ant = (k) => R.filter((o) => FILTER[k](o)).length;
    const kirke = R.filter((o) => o.kind === "arkiv" && /Kirkebøker|Folketellinger/.test(o.kat));
    kirke.sort((a, b) => (a.kat + a.tittel).localeCompare(b.kat + b.tittel, "no", { numeric: true }));
    const tall = [["person", "personer", "--person"], ["gard", "gårder, bruk og setre", "--gard"], ["sted", "stedsnavn", "--sted"], ["artikkel", "artikler", "--artikkel"], ["litt", "bøker, tidsskrift, kart", "--litt"], ["arkiv", "arkivkilder", "--arkiv"]];
    const bla = [
      ["gard", "Gårder etter gnr", "Alle gårder, bruk og setre sortert på gårdsnummer", "--gard"],
      ["person", "Personer", "Biografier fra Lokalhistoriewiki", "--person"],
      ["artikkel", "Artikler", "Hendelser, lag, kirker, setre og mer", "--artikkel"],
      ["litt", "Litteratur", "Bøker, årsskrift og kart hos Nasjonalbiblioteket", "--litt"],
      ["arkiv", "Kirkebøker og arkiv", "Skannede kilder i Digitalarkivet", "--arkiv"],
      ["bilder", "Bilder", "Gamle og nye fotografier fra Lesja", "--rust"],
      ["kart", "Kart", "Gårder og setre i kart", "--sted"],
      ["kilder", "Kilder", "Alle kildene og hvor du kan lete videre", "--sepia"],
    ];
    $("#forside").innerHTML = `
      <div class="talband">${tall.map(([k, t, v]) => `<button data-fane="${k}" style="--farge:var(${v})"><b>${ant(k).toLocaleString("nb-NO")}</b><span>${t}</span></button>`).join("")}</div>
      <div class="forside-grid">
        <div>
          <p class="etikett">Kom i gang</p>
          <h2>Søk slik du husker det</h2>
          <p class="ingress">Skriv et personnavn, et gårdsnavn, et stedsnavn eller et gårds- og bruksnummer. Søket kjenner igjen gamle og nye skrivemåter, så <em>Botheim</em> finner også <em>Bottheim</em>, og <em>aa</em> finner <em>å</em>.</p>
          <div class="eksempel">${["Skotte", "Bottheim", "13", "128/2", "Lesjaverk", "Einbu", "utvandring", "Folketelling 1865", "Lesjaskog kyrkje"].map((e) => `<button data-sok="${esc(e)}">${esc(e)}</button>`).join("")}</div>
          <div class="tips">
            <div><b>Gnr/bnr</b>Skriv <em>13</em> for hele gården eller <em>13/4</em> for ett bruk.</div>
            <div><b>Bygdeboka</b>Hvert søk viser hvilke sider i bygdeboka navnet står på.</div>
            <div><b>Egne notater</b>Legg til årsskriftartikler og egne funn i <em>data/egne.js</em>.</div>
          </div>
        </div>
        <div>
          <div class="boks"><h3>Bygdebok for Lesja</h3><ul class="bokliste">
            ${BYGDEBOK.map((b) => `<li><span class="bd">Bd. ${b.bd}</span><a href="https://www.nb.no/items/${b.urn}" target="_blank" rel="noopener">${esc(b.t.replace(/^Bd\. \d – /, ""))}</a></li>`).join("")}
            <li><span class="bd">Bd. 4</span><a href="https://www.nb.no/items/URN:NBN:no-nb_digibok_2015050648007" target="_blank" rel="noopener">Foto og fotografering i Lesja 1850–1950 (2008)</a></li>
          </ul><p class="hjelp" style="margin-top:10px">Bd. 1–3 er åpne for norske nettadresser.</p></div>
          <div class="boks"><h3>Kirkebøker og folketellinger</h3><ul>
            ${kirke.slice(0, 7).map((o) => `<li><a href="${o.url}" target="_blank" rel="noopener">${esc(o.tittel.replace(/ \(0512P?\)$/, ""))}</a></li>`).join("")}
          </ul><p style="margin:10px 0 0"><button class="knapp-lenke" data-fane="arkiv">Se alle ${ant("arkiv")} arkivkilder →</button></p></div>
        </div>
      </div>
      <div class="seksjonstittel"><h2>Gamle bilder fra Lesja</h2><button class="knapp-lenke" data-fane="bilder">Se alle bilder →</button></div>
      <div id="forside-bilder" class="laster">Henter bilder fra Nasjonalbiblioteket</div>
      <div class="seksjonstittel"><h2>Bla i registeret</h2></div>
      <div class="blagrid">${bla.map(([k, t, u, v]) => `<button class="blakort" data-fane="${k}" style="--farge:var(${v})"><span class="ikon">${IKON[k]}</span><b>${t}</b><span>${u}</span></button>`).join("")}</div>`;
    bildestripe(document.getElementById("forside-bilder"), "Lesja", 12, "forside");
  }

  function blaListe(filter) {
    let liste = R.filter((o) => FILTER[filter](o)).map((o) => ({ o, s: 0 }));
    if (filter === "gard") {
      const nr = (o) => { const g = (o.gnr[0] || "9999/9999").split("/"); return (+g[0]) * 10000 + (+g[1] || 0); };
      liste.sort((a, b) => nr(a.o) - nr(b.o) || a.o.tittel.localeCompare(b.o.tittel, "no"));
    } else if (filter === "arkiv") {
      liste.sort((a, b) => (a.o.kat + a.o.tittel).localeCompare(b.o.kat + b.o.tittel, "no", { numeric: true }));
    } else {
      liste.sort((a, b) => (b.o.vekt - a.o.vekt) || a.o.tittel.localeCompare(b.o.tittel, "no"));
    }
    return liste;
  }

  // ---------- Kart ----------
  let kartet = null;
  function lastLeaflet() {
    return new Promise((ok, feil) => {
      if (window.L) return ok();
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = ok; s.onerror = feil; document.head.appendChild(s);
    });
  }
  async function visKart() {
    try { await lastLeaflet(); } catch { $("#kart").innerHTML = `<p class="boks">Kartbiblioteket kunne ikke lastes (krever nettilgang).</p>`; return; }
    if (kartet) { kartet.invalidateSize(); return; }
    kartet = L.map("kart").setView([62.15, 8.75], 10);
    L.tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", { maxZoom: 18, attribution: "© Kartverket" }).addTo(kartet);
    const farge = { gard: "#5b7d2b", seter: "#b5651d" };
    R.filter((o) => (o.kind === "gard" || o.kind === "seter") && o.nord).forEach((o) => {
      L.circleMarker([o.nord, o.ost], { radius: o.type === "Navnegard" ? 7 : 5, color: "#fff", weight: 1, fillColor: farge[o.kind], fillOpacity: .9 })
        .addTo(kartet).bindTooltip(`${o.tittel}${o.gnr.length ? " (" + o.gnr[0] + ")" : ""}`).on("click", () => visDetalj(o));
    });
  }


  // ---------- Bilder ----------
  // Tre åpne bildekilder: Nasjonalbiblioteket, Lokalhistoriewiki og Wikimedia Commons.
  const strip = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const medLesja = (t) => (/lesja/i.test(t) ? t : (t + " Lesja").trim());

  async function bilderNB(term, side = 0, antall = 40) {
    const j = await hentJSON(`https://api.nb.no/catalog/v1/items?q=${enc(medLesja(term))}&filter=mediatype:bilder&size=${antall}&page=${side}`);
    const it = (j._embedded && j._embedded.items) || [];
    return {
      total: j.page ? j.page.totalElements : 0,
      mer: j.page ? side + 1 < j.page.totalPages : false,
      liste: it.map((x) => {
        const m = x.metadata, urn = m.identifiers && m.identifiers.urn;
        const mal = x._links.thumbnail_custom && x._links.thumbnail_custom.href;
        if (!mal) return null;
        const sted = (m.geographic && m.geographic.placeString || "").split(";").filter(Boolean).filter((v) => !/^(Norge|Oppland|Innlandet)$/.test(v)).join(", ");
        return {
          kilde: "nb", kildeNavn: "Nasjonalbiblioteket",
          tittel: (m.title || "").replace(/^\[|\]$/g, ""),
          liten: mal.replace("{width},{height}", "400,"), stor: mal.replace("{width},{height}", "1600,"),
          fotograf: (m.creators || []).join("; "), aar: m.dateCreated || (m.originInfo && m.originInfo.issued) || "",
          sted, lisens: x.accessInfo && x.accessInfo.isPublicDomain ? "Falt i det fri" : "",
          lenke: "https://www.nb.no/items/" + (urn || x.id),
        };
      }).filter(Boolean),
    };
  }

  async function bilderWiki(base, kildeNavn, kilde, term, fortsett) {
    const p = { action: "query", format: "json", origin: "*", generator: "search", gsrsearch: medLesja(term) + (kilde === "commons" ? " filetype:bitmap" : ""), gsrnamespace: 6, gsrlimit: 30, prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: 400 };
    if (fortsett) p.gsroffset = fortsett;
    const j = await hentJSON(base + "?" + new URLSearchParams(p));
    const sider = Object.values((j.query && j.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
    return {
      mer: j.continue ? j.continue.gsroffset : null,
      liste: sider.map((pg) => {
        const i = pg.imageinfo && pg.imageinfo[0];
        if (!i || !/^image\//.test(i.mime || "image/")) return null;
        const em = i.extmetadata || {};
        const stor = kilde === "wiki" ? i.thumburl.replace(/width=\d+/, "width=1600") : (i.thumburl.match(/\/\d+px-/) ? i.thumburl.replace(/\/\d+px-/, "/1280px-") : i.url);
        return {
          kilde, kildeNavn,
          tittel: strip(em.ObjectName && em.ObjectName.value) || pg.title.replace(/^(Fil|File):/, "").replace(/\.\w+$/, ""),
          beskrivelse: strip(em.ImageDescription && em.ImageDescription.value).slice(0, 300),
          liten: i.thumburl, stor, original: i.url,
          fotograf: strip(em.Artist && em.Artist.value), aar: strip(em.DateTimeOriginal && em.DateTimeOriginal.value).replace(/date QS.*$/, "").slice(0, 30),
          lisens: strip(em.LicenseShortName && em.LicenseShortName.value),
          lenke: i.descriptionurl,
        };
      }).filter(Boolean),
    };
  }

  const BK = {
    nb: (t, f) => bilderNB(t, f || 0).then((r) => ({ ...r, mer: r.mer ? (f || 0) + 1 : null })),
    wiki: (t, f) => bilderWiki("https://lokalhistoriewiki.no/api.php", "Lokalhistoriewiki", "wiki", t, f),
    commons: (t, f) => bilderWiki("https://commons.wikimedia.org/w/api.php", "Wikimedia Commons", "commons", t, f),
  };

  function bildeKort(b, i) {
    return `<button class="bildekort" data-bilde="${i}"><img src="${esc(b.liten)}" alt="${esc(b.tittel)}" loading="lazy" onerror="this.closest('.bildekort').remove()"><span class="bk-tekst"><b>${esc(b.tittel)}</b><small>${esc([b.aar, b.kildeNavn].filter(Boolean).join(" · "))}</small></span></button>`;
  }

  let bildeliste = [], bildeTilstand = null, bildeToken = 0;

  async function bildesok(term, kilde, mer) {
    const token = mer ? bildeToken : ++bildeToken;
    const kilder = kilde === "alle" ? ["nb", "wiki", "commons"] : [kilde];
    if (!mer) {
      bildeliste = [];
      bildeTilstand = { term, kilde, neste: {} };
      $("#galleri").innerHTML = `<p class="laster">Henter bilder</p>`;
      $("#bildestatus").innerHTML = `<b>${term ? "Bilder: «" + esc(term) + "»" : "Bilder fra Lesja"}</b><span id="bildeantall">Søker i kildene …</span>`;
      const t = medLesja(term || "");
      $("#bildelenker").innerHTML = `Flere bilder: <a href="https://www.nb.no/search?q=${enc(t)}&mediatype=bilder" target="_blank" rel="noopener">Nasjonalbiblioteket ↗</a> · <a href="https://digitaltmuseum.no/search/?q=${enc(t)}" target="_blank" rel="noopener">DigitaltMuseum (bl.a. Lesja historielag) ↗</a> · <a href="https://commons.wikimedia.org/w/index.php?search=${enc(t)}&title=Special:MediaSearch&type=image" target="_blank" rel="noopener">Wikimedia Commons ↗</a>`;
    }
    const svar = await Promise.all(kilder.map((k) => {
      if (mer && bildeTilstand.neste[k] == null) return Promise.resolve({ k, liste: [] });
      return BK[k](term || "", mer ? bildeTilstand.neste[k] : undefined).then((r) => ({ k, ...r })).catch(() => ({ k, liste: [], feil: true }));
    }));
    if (token !== bildeToken) return;
    // Fletter kildene slik at alle synes i toppen
    const nye = [];
    const maks = Math.max(0, ...svar.map((x) => x.liste.length));
    for (let i = 0; i < maks; i++) svar.forEach((x) => x.liste[i] && nye.push(x.liste[i]));
    svar.forEach((x) => (bildeTilstand.neste[x.k] = x.mer != null ? x.mer : null));
    const start = bildeliste.length;
    bildeliste = bildeliste.concat(nye);
    if (!mer) $("#galleri").innerHTML = "";
    $("#galleri").insertAdjacentHTML("beforeend", nye.map((b, i) => bildeKort(b, start + i)).join(""));
    if (!bildeliste.length) $("#galleri").innerHTML = `<div class="boks"><h3>Fant ingen bilder</h3><p>Prøv et annet ord, eller bruk lenkene under for å søke direkte hos kildene.${svar.some((x) => x.feil) ? " (Noen kilder svarte ikke – sjekk nettilgangen.)" : ""}</p></div>`;
    const nb = svar.find((x) => x.k === "nb");
    $("#bildeantall").textContent = `${bildeliste.length} bilder vist${nb && nb.total ? ` · ${nb.total.toLocaleString("nb-NO")} treff hos Nasjonalbiblioteket` : ""}`;
    $("#flere-bilder").hidden = !Object.values(bildeTilstand.neste).some((v) => v != null);
  }

  // Lysboks
  let lbListe = [], lbIndeks = 0;
  function apneLysboks(liste, i) {
    lbListe = liste; lbIndeks = i; visLysboks(); $("#lysboks").hidden = false;
  }
  function visLysboks() {
    const b = lbListe[lbIndeks]; if (!b) return;
    const img = $("#lb-bilde");
    img.onerror = () => { if (b.original && img.src !== b.original) img.src = b.original; else img.src = b.liten; };
    img.src = b.stor; img.alt = b.tittel;
    $("#lb-tekst").innerHTML = `<b>${esc(b.tittel)}</b>${b.beskrivelse && b.beskrivelse !== b.tittel ? `<span>${esc(b.beskrivelse)}</span>` : ""}
      <span>${esc([b.fotograf && "Foto: " + b.fotograf, b.aar, b.sted].filter(Boolean).join(" · "))}</span>
      <span>${esc([b.lisens, b.kildeNavn].filter(Boolean).join(" · "))} · <a href="${esc(b.lenke)}" target="_blank" rel="noopener">Se hos kilden ↗</a> · ${lbIndeks + 1} av ${lbListe.length}</span>`;
    $("#lb-forrige").hidden = lbIndeks === 0;
    $("#lb-neste").hidden = lbIndeks >= lbListe.length - 1;
  }
  function flyttLysboks(d) { const n = lbIndeks + d; if (n >= 0 && n < lbListe.length) { lbIndeks = n; visLysboks(); } }

  // Små bildestriper (forside, resultatpanel, gårdsvisning)
  const stripeLister = {};
  async function bildestripe(el, term, antall, id) {
    if (!el) return;
    const ferdig = () => el.classList.remove("laster");
    try {
      const r = await bilderNB(term, 0, antall);
      ferdig();
      const liste = r.liste.slice(0, antall);
      if (!liste.length) { el.innerHTML = `<span class="u">Ingen bilder hos Nasjonalbiblioteket.</span>`; return; }
      stripeLister[id] = liste;
      el.innerHTML = `<div class="stripe">${liste.map((b, i) => `<button class="stripe-bilde" data-stripe="${id}" data-i="${i}" title="${esc(b.tittel)}"><img src="${esc(b.liten)}" alt="${esc(b.tittel)}" loading="lazy" onerror="this.parentNode.remove()"></button>`).join("")}</div>`;
    } catch (e) { ferdig(); el.innerHTML = `<span class="u">Kunne ikke hente bilder (krever nettilgang).</span>`; }
  }

  // ---------- Kildeoversikt ----------
  function visKilder() {
    const grupper = {};
    (window.LH_KILDER || []).forEach((k) => (grupper[k.gruppe] = grupper[k.gruppe] || []).push(k));
    $("#kildevisning").innerHTML = `<h1>Kilder</h1><p class="hjelp">Kildene registeret bygger på, og andre steder det lønner seg å lete. Listen ligger i <code>data/kilder.js</code> og kan utvides.</p>` +
      Object.entries(grupper).map(([g, l]) => `<h2>${esc(g)}</h2><div class="kildegrid">${l.map((k) => `<div class="boks"><h3><a href="${esc(k.hjem)}" target="_blank" rel="noopener">${esc(k.navn)} ↗</a></h3><p>${esc(k.om)}</p></div>`).join("")}</div>`).join("");
  }

  // ---------- Ruting ----------
  let tilstand = { q: "", f: "alle" };
  function lesHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { q: p.get("q") || "", f: p.get("f") || "alle" };
  }
  function settHash(q, f) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f && f !== "alle") p.set("f", f);
    const h = p.toString();
    if (location.hash.slice(1) !== h) location.hash = h; else gjengi();
  }

  function gjengi() {
    tilstand = lesHash();
    const { q, f } = tilstand;
    $("#q").value = q;
    document.querySelectorAll("#faner button").forEach((b) => b.classList.toggle("aktiv", b.dataset.f === f));
    ["#forside", "#resultat", "#kartvisning", "#kildevisning", "#bildevisning"].forEach((s) => ($(s).hidden = true));
    Object.keys(visAntall).forEach((k) => delete visAntall[k]);

    document.body.classList.remove("pa-forside");
    if (f === "kart") { $("#kartvisning").hidden = false; visKart(); return; }
    if (f === "bilder") {
      $("#bildevisning").hidden = false;
      const bk = (document.querySelector("#bildekilder .aktiv") || {}).dataset?.bk || "alle";
      bildesok(q, bk);
      document.title = (q ? q + " – " : "") + "Bilder – Lesja lokalhistorie";
      return;
    }
    if (f === "kilder") { $("#kildevisning").hidden = false; visKilder(); return; }
    document.body.classList.toggle("pa-forside", !q && f === "alle");
    if (!q && f === "alle") { $("#forside").hidden = false; forside(); return; }

    $("#resultat").hidden = false;
    if (!q) {
      $("#live").hidden = true;
      const liste = blaListe(f);
      visAntall[f] = 200;
      gjengiLokale = () => visLokale("", f, liste);
      gjengiLokale();
      return;
    }
    $("#live").hidden = false;
    const { treff, gnr } = sok(q);
    treff.sort((a, b) => b.s - a.s || a.o.tittel.localeCompare(b.o.tittel, "no"));
    gjengiLokale = () => visLokale(q, f, treff);
    gjengiLokale();
    liveSok(q, gnr);
    dyplenker(q);
    document.title = `${q} – Lesja lokalhistorie`;
  }
  let gjengiLokale = () => {};

  // ---------- Hendelser ----------
  $("#sokeskjema").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#q").value.trim(); settHash(q, tilstand.f === "kart" || tilstand.f === "kilder" ? "alle" : tilstand.f); });
  $("#bildekilder").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-bk]"); if (!b) return;
    document.querySelectorAll("#bildekilder button").forEach((x) => x.classList.toggle("aktiv", x === b));
    bildesok(tilstand.q, b.dataset.bk);
  });
  $("#flere-bilder").addEventListener("click", () => bildeTilstand && bildesok(bildeTilstand.term, bildeTilstand.kilde, true));
  $("#galleri").addEventListener("click", (e) => { const b = e.target.closest("[data-bilde]"); if (b) apneLysboks(bildeliste, +b.dataset.bilde); });
  $("#lb-lukk").addEventListener("click", () => ($("#lysboks").hidden = true));
  $("#lb-forrige").addEventListener("click", () => flyttLysboks(-1));
  $("#lb-neste").addEventListener("click", () => flyttLysboks(1));
  $("#lysboks").addEventListener("click", (e) => { if (e.target.id === "lysboks" || e.target.tagName === "FIGURE") $("#lysboks").hidden = true; });
  $("#faner").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (b) settHash(tilstand.q, b.dataset.f); });
  document.addEventListener("click", (e) => {
    const st = e.target.closest("[data-stripe]"); if (st) { apneLysboks(stripeLister[st.dataset.stripe] || [], +st.dataset.i); return; }
    const bs = e.target.closest("[data-bildesok]"); if (bs) { $("#detalj").hidden = true; settHash(bs.dataset.bildesok, "bilder"); window.scrollTo(0, 0); return; }
    const d = e.target.closest("[data-detalj]"); if (d) { visDetalj(R[+d.dataset.detalj]); return; }
    const s = e.target.closest("[data-sok]"); if (s) { $("#detalj").hidden = true; settHash(s.dataset.sok, "alle"); window.scrollTo(0, 0); return; }
    const fa = e.target.closest("[data-fane]"); if (fa) { settHash("", fa.dataset.fane); window.scrollTo(0, 0); return; }
    const fl = e.target.closest("[data-flere]"); if (fl) { visAntall[fl.dataset.flere] = (visAntall[fl.dataset.flere] || (tilstand.f === "alle" ? 8 : 60)) + 60; gjengiLokale(); return; }
  });
  $("#lukk").addEventListener("click", () => ($("#detalj").hidden = true));
  $("#detalj").addEventListener("click", (e) => { if (e.target.id === "detalj") $("#detalj").hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (!$("#lysboks").hidden) {
      if (e.key === "Escape") $("#lysboks").hidden = true;
      if (e.key === "ArrowLeft") flyttLysboks(-1);
      if (e.key === "ArrowRight") flyttLysboks(1);
      return;
    }
    if (e.key === "Escape") $("#detalj").hidden = true;
    if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
  });
  window.addEventListener("hashchange", gjengi);

  const dato = (document.querySelector('script[src="data/wiki.js"]') && window.LH_DATADATO) || "";
  if (dato) $("#datadato").textContent = "Data hentet " + dato + ".";
  gjengi();
})();
