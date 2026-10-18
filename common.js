// Loads the other apps' data and my saved choices, and turns them into one list of things I still
// want to buy. Nothing here is copied: the data files are read from each app's folder (or site),
// so the dashboard always matches them.
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
  const short = (n) => (n == null ? "—" : n >= 1e6 ? `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
  const SITE = window.SITE || {};
  const siteHref = (id) => ((SITE.links || []).find((l) => l.id === id) || {}).href || null;
  // An app's folder, from its link: "../ships-wishlist/index.html" -> "../ships-wishlist/".
  const baseOf = (id) => {
    const h = siteHref(id);
    return h ? h.replace(/[^/]*\.html$/, "") : null;
  };

  // Each app's files, in load order, and the globals to keep from them. Several apps use the same
  // global names (WISHLIST, OWNED), so each app's globals are collected and cleared before the next.
  const SOURCES = [
    { id: "ships", files: ["catalog.data.js", "ships.data.js", "wishlist.js", "purchases.js"],
      keep: ["SHIP_CATALOG", "SHIP_CATALOG_META", "SHIPS", "WISHLIST", "PURCHASES"] },
    { id: "items", files: ["catalog.data.js", "items.data.js", "wishlist.js", "owned.js"],
      keep: ["ITEM_CATALOG", "ITEM_CATALOG_META", "ITEM_LOCATIONS", "ITEM_LOCATION_CODES", "ITEMS", "WISHLIST", "OWNED"] },
    { id: "components", files: ["catalog.data.js", "components.data.js", "wishlist.js", "owned.js", "builds.js"],
      keep: ["COMPONENT_CATALOG", "COMPONENT_CATALOG_META", "COMPONENT_LOCATIONS", "COMPONENT_LOCATION_CODES", "COMPONENTS", "WISHLIST", "OWNED", "BUILDS"] },
    { id: "contracts", files: ["catalog.data.js"], keep: ["CONTRACTS", "CONTRACTS_META"] },
  ];
  const DROP = ["SHIP_LOCATIONS", "ITEM_DESCRIPTIONS", "COMPONENT_DESCRIPTIONS", "SHIP_LOADOUTS", "CONTRACT_PLACES", "CONTRACT_SHIPS", "CONTRACT_BLUEPRINTS", "CONTRACT_TEXT"];

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => { s.remove(); reject(new Error(src)); };
      document.head.appendChild(s);
    });

  async function loadAll(progress) {
    const data = {};
    const missing = [];
    for (const src of SOURCES) {
      const base = baseOf(src.id);
      progress(src.id);
      try {
        if (!base) throw new Error("no link");
        for (const f of src.files) await loadScript(base + f);
        data[src.id] = Object.fromEntries(src.keep.map((k) => [k, window[k]]));
      } catch (e) {
        missing.push(src.id);
      }
      for (const k of [...src.keep, ...DROP]) delete window[k];
    }
    return { data, missing };
  }

  // Saved choices: the .js file, plus changes made in that app's page and not yet saved to the
  // file (kept in this browser under the app's own key). Same rule the apps use.
  function withOverrides(fileState, key) {
    const out = { ...(fileState || {}) };
    let o = {};
    try { o = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { o = {}; }
    for (const [id, v] of Object.entries(o)) {
      if (v) out[id] = v;
      else delete out[id];
    }
    return out;
  }

  // Curated records override catalog records field by field, matched by className then id.
  function merge(catalog, curated, nested) {
    const byClass = new Map(catalog.filter((s) => s.className).map((s) => [s.className.toLowerCase(), s]));
    const byId = new Map(catalog.map((s) => [s.id, s]));
    const out = new Map(catalog.map((s) => [s.id, s]));
    for (const cur of curated || []) {
      const base = (cur.className && byClass.get(cur.className.toLowerCase())) || byId.get(cur.id);
      const merged = { ...(base || {}), ...cur };
      for (const k of nested) merged[k] = { ...((base || {})[k] || {}), ...(cur[k] || {}) };
      if (base) out.delete(base.id);
      out.set(merged.id, merged);
    }
    return out;
  }

  // Compact shop rows ([locationIndex, price, YYMMDD, "c"]) -> { location, code, price, date }.
  const longDate = (d) => (d ? `20${String(d).slice(0, 2)}-${String(d).slice(2, 4)}-${String(d).slice(4, 6)}` : null);
  const shopRows = (rows, locs, codes) =>
    (rows || []).map((b) => (Array.isArray(b)
      ? { location: locs[b[0]], code: codes[b[0]] || null, price: b[1], date: longDate(b[2]) }
      : { location: b.location, code: b.code || null, price: b.price, date: b.date || null }));
  const systemOf = (loc) => (String(loc).match(/\(([^)]+)\)\s*$/) || [, "?"])[1];

  const KINDS = {
    ships: { label: "Ships", color: "var(--k-ships)" },
    items: { label: "Personal items", color: "var(--k-items)" },
    parts: { label: "Ship parts", color: "var(--k-parts)" },
    builds: { label: "Parts for builds", color: "var(--k-builds)" },
  };

  // Everything still wanted: { kind, id, name, group, qty, shops: [{location, code, price}], cost,
  // href, why (when it can't be bought with aUEC) }.
  function buildGoals(data) {
    const goals = [];
    const href = (app, id) => (baseOf(app) ? `${baseOf(app)}index.html#${encodeURIComponent(id)}` : null);
    const add = (g) => {
      g.cost = g.shops.length ? Math.min(...g.shops.map((b) => b.price)) * g.qty : null;
      goals.push(g);
    };

    if (data.ships) {
      const d = data.ships;
      const ships = merge(d.SHIP_CATALOG || [], d.SHIPS, ["stats", "acquisition", "pledge", "links"]);
      const wish = withOverrides(d.WISHLIST, "sc-ships-wishlist:wishlist-overrides");
      const owned = withOverrides(d.PURCHASES, "sc-ships-wishlist:purchase-overrides");
      for (const [id, w] of Object.entries(wish)) {
        const s = ships.get(id);
        if (!s || owned[id]) continue;
        const a = s.acquisition || {};
        const why = (a.buy || []).length ? null
          : (a.rent || []).length ? "Rental only"
          : s.status === "in-concept" ? "Not in the game yet"
          : s.pledge && s.pledge.usd ? `Pledge store only ($${fmt(s.pledge.usd)})`
          : a.method || "Earned in game";
        add({ kind: "ships", id, name: s.name, group: w.group || "Other", qty: 1, shops: shopRows(a.buy), href: href("ships", id), why });
      }
    }

    const parts = (app, kind, d, catKey, locKey, codeKey, curKey, prefix) => {
      if (!d) return null;
      const items = merge(d[catKey] || [], d[curKey], ["stats"]);
      const locs = d[locKey] || [], codes = d[codeKey] || [];
      const wish = withOverrides(d.WISHLIST, `${prefix}:wishlist-overrides`);
      const owned = withOverrides(d.OWNED, `${prefix}:owned-overrides`);
      const why = (s) => (s.loot ? "Loot only" : s.craft ? "Crafted" : s.event ? `Event reward (${s.event})` : "Not sold in game");
      for (const [id, w] of Object.entries(wish)) {
        const s = items.get(id);
        if (!s || owned[id]) continue;
        const shops = shopRows(s.buy, locs, codes);
        add({ kind, id, name: s.name, group: w.group || "Other", qty: 1, shops, href: href(app, id), why: shops.length ? null : why(s) });
      }
      return { items, locs, codes, wish, owned, why };
    };
    parts("items", "items", data.items, "ITEM_CATALOG", "ITEM_LOCATIONS", "ITEM_LOCATION_CODES", "ITEMS", "sc-items-wishlist");
    const comp = parts("components", "parts", data.components, "COMPONENT_CATALOG", "COMPONENT_LOCATIONS", "COMPONENT_LOCATION_CODES", "COMPONENTS", "sc-ship-components");

    // Saved builds: every part picked for a slot, less what I own and what the wishlist already counts.
    if (comp) {
      const builds = withOverrides(data.components.BUILDS, "sc-ship-components:builds-overrides");
      const need = new Map(); // item id -> { qty, builds: Set }
      for (const b of Object.values(builds)) {
        for (const id of Object.values(b.picks || {})) {
          if (!id || id === "x" || !comp.items.has(id)) continue;
          const n = need.get(id) || { qty: 0, builds: new Set() };
          n.qty++;
          n.builds.add(b.name);
          need.set(id, n);
        }
      }
      for (const [id, n] of need) {
        const own = comp.owned[id] ? comp.owned[id].count || 1 : 0;
        const qty = n.qty - own - (comp.wish[id] && !comp.owned[id] ? 1 : 0);
        if (qty <= 0) continue;
        const s = comp.items.get(id);
        const shops = shopRows(s.buy, comp.locs, comp.codes);
        add({ kind: "builds", id, name: s.name, group: [...n.builds].join(", "), qty, shops, href: href("components", id), why: shops.length ? null : comp.why(s) });
      }
    }
    return goals;
  }

  // ── Pay per hour (same rule as the contracts app) ──────────────────────────
  const NO_RATE = new Set(["mining", "wikelo", "gathering"]);
  function perHour(c) {
    const t = c.community;
    if (!t || !c.reward || !t.mins || t.runs < 3 || NO_RATE.has(c.act)) return null;
    return Math.round((c.reward * 60) / Math.max(t.mins, 5));
  }
  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  // Per activity: the median rate, and the median of the better half ("good runs").
  function activityRates(data, { starterOnly = false, legalOnly = false } = {}) {
    const c = data.contracts;
    if (!c) return [];
    const names = (c.CONTRACTS_META || {}).activities || {};
    const by = new Map();
    for (const x of c.CONTRACTS || []) {
      if (x.off || (starterOnly && !x.starter) || (legalOnly && x.illegal)) continue;
      const r = perHour(x);
      if (r == null) continue;
      if (!by.has(x.act)) by.set(x.act, []);
      by.get(x.act).push(r);
    }
    return [...by].map(([act, rates]) => {
      const m = median(rates);
      return { act, label: names[act] || act, n: rates.length, median: m, good: median(rates.filter((r) => r >= m)) };
    }).filter((a) => a.n >= 2).sort((a, b) => b.median - a.median);
  }

  // Where a shop is, for links: items and parts know the UEX terminal code; ships only the name.
  function shopHref(b) {
    const loc = siteHref("locations");
    if (!loc) return null;
    if (b.code) return `${loc}#code:${encodeURIComponent(b.code)}`;
    const [shop, rest = ""] = String(b.location).split(" — ");
    const place = rest.replace(/\s*\([^)]*\)\s*$/, "").split(",")[0].trim();
    return `${loc}?q=${encodeURIComponent([shop, place].filter(Boolean).map((x) => `"${x}"`).join(" "))}`;
  }

  window.Dash = { esc, fmt, short, SITE, siteHref, loadAll, buildGoals, activityRates, shopHref, systemOf, shopRows, KINDS };
})();
