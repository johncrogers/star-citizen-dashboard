// Where to shop: which shops sell the most of what I still want, and the fewest stops that get it all.
(function () {
  const { esc, fmt, short, shopHref, systemOf, KINDS } = window.Dash;

  const KEY = "sc-dashboard:shop";
  const opts = { system: "", builds: true, open: null };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* storage unavailable */ } };
  const link = (b) => {
    const h = shopHref(b);
    return h ? `<a href="${esc(h)}" title="Where it is and how to get there">${esc(b.location)}</a>` : esc(b.location);
  };

  // Each goal's shops in the chosen system.
  function needs(goals) {
    return goals.map((g) => ({ g, shops: g.shops.filter((b) => !opts.system || systemOf(b.location) === opts.system) }));
  }

  // Shop -> what it sells from my list, with its price there.
  function byShop(list) {
    const shops = new Map();
    for (const n of list) {
      for (const b of n.shops) {
        if (!shops.has(b.location)) shops.set(b.location, { location: b.location, code: b.code, rows: [] });
        const s = shops.get(b.location);
        if (!s.code && b.code) s.code = b.code;
        s.rows.push({ n, price: b.price });
      }
    }
    return [...shops.values()];
  }

  // Fewest stops: keep visiting the shop that sells the most of what's left (cheaper on ties).
  function plan(list) {
    const left = new Set(list.filter((n) => n.shops.length));
    const shops = byShop([...left]);
    const stops = [];
    while (left.size) {
      let best = null;
      for (const s of shops) {
        const rows = s.rows.filter((r) => left.has(r.n));
        if (!rows.length) continue;
        const cost = rows.reduce((t, r) => t + r.price * r.n.g.qty, 0);
        if (!best || rows.length > best.rows.length || (rows.length === best.rows.length && cost < best.cost)) best = { ...s, rows, cost };
      }
      if (!best) break;
      best.rows.forEach((r) => left.delete(r.n));
      stops.push(best);
    }
    return stops;
  }

  function chart(shops) {
    const top = shops.sort((a, b) => b.rows.length - a.rows.length || a.location.localeCompare(b.location)).slice(0, 12);
    if (!top.length) return `<p class="muted">Nothing on your lists is sold here.</p>`;
    const max = top[0].rows.length;
    return `<div class="hbars shop-bars">${top.map((s) => {
      const counts = Object.keys(KINDS).map((k) => [k, s.rows.filter((r) => r.n.g.kind === k).length]).filter(([, c]) => c);
      return `<button type="button" class="hbar-row pick${opts.open === s.location ? " on" : ""}" data-shop="${esc(s.location)}" title="${esc(`${s.location}: sells ${s.rows.length} of the things you need (${counts.map(([k, c]) => `${c} ${KINDS[k].label.toLowerCase()}`).join(", ")})`)}">
        <span class="hbar-label">${esc(s.location.replace(/\s*\([^)]*\)\s*$/, ""))}</span>
        <span class="hbar-track">${counts.map(([k, c]) => `<span class="hbar seg" style="width:${(c / max) * 100}%;background:${KINDS[k].color}"></span>`).join("")}</span>
        <span class="hbar-val">${s.rows.length}</span></button>`;
    }).join("")}</div>`;
  }

  function shopDetail(shops, cheapestOf) {
    const s = shops.find((x) => x.location === opts.open);
    if (!s) return "";
    return `<div class="shop-detail"><h4>${link(s)}</h4>
      <table><thead><tr><th>Thing</th><th class="num">Price here</th><th class="num">vs cheapest</th></tr></thead><tbody>
      ${s.rows.sort((a, b) => a.n.g.name.localeCompare(b.n.g.name)).map((r) => {
        const diff = r.price - cheapestOf(r.n);
        return `<tr><td><i class="swatch" style="background:${KINDS[r.n.g.kind].color}"></i>${r.n.g.href ? `<a href="${esc(r.n.g.href)}">${esc(r.n.g.name)}</a>` : esc(r.n.g.name)}${r.n.g.qty > 1 ? ` ×${r.n.g.qty}` : ""}</td>
          <td class="num">${fmt(r.price)}</td><td class="num">${diff > 0 ? `<span class="diff bad">+${fmt(diff)}</span>` : `<span class="diff good">cheapest</span>`}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function render(el, data, allGoals) {
    const goals = (opts.builds ? allGoals : allGoals.filter((g) => g.kind !== "builds")).filter((g) => g.shops.length);
    const list = needs(goals);
    const sold = list.filter((n) => n.shops.length);
    const notHere = list.filter((n) => !n.shops.length);
    const cheapestOf = (n) => Math.min(...n.shops.map((b) => b.price));
    const shops = byShop(sold);
    const stops = plan(sold);
    const planCost = stops.reduce((t, s) => t + s.cost, 0);
    const bestCost = sold.reduce((t, n) => t + cheapestOf(n) * n.g.qty, 0);
    const cheapestStops = new Set(sold.map((n) => n.shops.reduce((a, b) => (b.price < a.price ? b : a)).location)).size;
    const systems = ["", "Stanton", "Pyro", "Nyx"];

    el.innerHTML = `<div class="cmp-card">
        <h3>Where to shop</h3>
        <p class="muted">Everything on your wishlists you don't own yet that a shop sells${opts.builds ? ", plus parts for your saved builds" : ""}.</p>
        <div class="rate-controls">
          <label>System <select data-s="system">${systems.map((x) => `<option value="${x}"${x === opts.system ? " selected" : ""}>${x || "All systems"}</option>`).join("")}</select></label>
          <label><input type="checkbox" data-s="builds"${opts.builds ? " checked" : ""}> Include parts for my saved builds</label>
        </div>
      </div>
      ${!goals.length ? `<div class="cmp-card"><p class="muted">Nothing to buy. Star ships, items or parts in the other apps and they'll show up here.</p></div>` : `
      <div class="shop-grid">
        <div class="cmp-card">
          <h3>Shops that sell the most of your list</h3>
          <div class="legend">${Object.keys(KINDS).filter((k) => sold.some((n) => n.g.kind === k)).map((k) => `<span><i class="swatch" style="background:${KINDS[k].color}"></i>${esc(KINDS[k].label)}</span>`).join("")}</div>
          ${chart(shops)}
          <p class="note">Click a shop to see what it sells from your list.</p>
          ${shopDetail(shops, cheapestOf)}
        </div>
        <div class="cmp-card">
          <h3>Fewest stops <small class="muted">${stops.length} stop${stops.length === 1 ? "" : "s"} · ${fmt(planCost)} aUEC</small></h3>
          <p class="muted">${planCost > bestCost
            ? `Buying each thing at its cheapest shop costs ${fmt(bestCost)} aUEC (${fmt(planCost - bestCost)} less) but takes ${cheapestStops} stop${cheapestStops === 1 ? "" : "s"}.`
            : "These stops are also the cheapest way to buy everything."}</p>
          <ol class="stops">${stops.map((s) => `<li>
            <div class="stop-head">${link(s)} <span class="muted">${s.rows.length} thing${s.rows.length === 1 ? "" : "s"} · ${fmt(s.cost)} aUEC</span></div>
            <ul class="plain">${s.rows.map((r) => {
              const diff = r.price - cheapestOf(r.n);
              return `<li><i class="swatch" style="background:${KINDS[r.n.g.kind].color}"></i>${r.n.g.href ? `<a href="${esc(r.n.g.href)}">${esc(r.n.g.name)}</a>` : esc(r.n.g.name)}${r.n.g.qty > 1 ? ` ×${r.n.g.qty}` : ""}
                <span class="muted">${fmt(r.price * r.n.g.qty)}</span>${diff > 0 ? ` <span class="diff bad" title="More than its cheapest shop">+${short(diff * r.n.g.qty)}</span>` : ""}</li>`;
            }).join("")}</ul></li>`).join("")}</ol>
        </div>
      </div>
      ${notHere.length ? `<div class="cmp-card"><h3>Not sold in ${esc(opts.system)}</h3><p>${notHere.map((n) => `${n.g.href ? `<a href="${esc(n.g.href)}">${esc(n.g.name)}</a>` : esc(n.g.name)}`).join(", ")}</p></div>` : ""}`}
      <p class="note">Prices are crowdsourced (UEX and cstone). Check the date in each app before you fly out. Things no shop sells are on the Time to goals tab.</p>`;
  }

  function bind(el, rerender) {
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-shop]");
      if (!b) return;
      opts.open = opts.open === b.dataset.shop ? null : b.dataset.shop;
      save();
      rerender();
    });
    el.addEventListener("change", (e) => {
      const k = e.target.dataset.s;
      if (!k) return;
      if (k === "system") { opts.system = e.target.value; opts.open = null; }
      if (k === "builds") opts.builds = e.target.checked;
      save();
      rerender();
    });
  }

  window.Shopping = { render, bind };
})();
