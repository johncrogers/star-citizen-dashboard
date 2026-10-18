// Price freshness: how old the crowdsourced prices are, so I know when a refresh is due and which
// prices on my list to double-check before flying out.
(function () {
  const { esc, fmt, short, shopRows, KINDS } = window.Dash;

  const DAY = 864e5;
  const ageDays = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / DAY)) : null);
  const BUCKETS = [
    ["Under a week", 0, 7], ["1–2 weeks", 7, 14], ["2–4 weeks", 14, 30],
    ["1–2 months", 30, 60], ["2–6 months", 60, 180], ["Over 6 months", 180, Infinity],
  ];
  const ageText = (d) => (d == null ? "no date" : d < 1 ? "today" : d < 14 ? `${d} day${d === 1 ? "" : "s"}` : d < 60 ? `${Math.round(d / 7)} weeks` : `${Math.round(d / 30)} months`);

  // Every shop price in an app's catalog, with its age in days.
  function ages(d, catKey, locKey, codeKey) {
    if (!d) return null;
    const out = [];
    for (const s of d[catKey] || []) for (const b of shopRows(s.buy, d[locKey] || [], d[codeKey] || [])) out.push(ageDays(b.date));
    return out;
  }

  function bars(list, color) {
    const counts = BUCKETS.map(([, lo, hi]) => list.filter((a) => a != null && a >= lo && a < hi).length);
    const none = list.filter((a) => a == null).length;
    const max = Math.max(...counts, none, 1);
    const row = (label, n) => `<div class="hbar-row" title="${esc(`${label}: ${fmt(n)} prices (${Math.round((n / list.length) * 100)}%)`)}">
        <span class="hbar-label">${esc(label)}</span>
        <span class="hbar-track"><span class="hbar" style="width:${(n / max) * 100}%;background:${color}"></span></span>
        <span class="hbar-val">${fmt(n)} <small>${Math.round((n / list.length) * 100)}%</small></span></div>`;
    return `<div class="hbars">${BUCKETS.map(([label], i) => row(label, counts[i])).join("")}${none ? row("No date", none) : ""}</div>`;
  }

  const median = (xs) => {
    const s = xs.filter((x) => x != null).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };

  function render(el, data, goals) {
    const metas = [
      ["Ships", data.ships?.SHIP_CATALOG_META], ["Personal items", data.items?.ITEM_CATALOG_META],
      ["Ship parts", data.components?.COMPONENT_CATALOG_META], ["Contracts", data.contracts?.CONTRACTS_META],
    ].filter(([, m]) => m);
    const items = ages(data.items, "ITEM_CATALOG", "ITEM_LOCATIONS", "ITEM_LOCATION_CODES");
    const parts = ages(data.components, "COMPONENT_CATALOG", "COMPONENT_LOCATIONS", "COMPONENT_LOCATION_CODES");

    // Prices on my lists: the cheapest shop's price and how old it is.
    const mine = goals.filter((g) => g.shops.length).map((g) => {
      const best = g.shops.reduce((a, b) => (b.price < a.price ? b : a));
      return { g, best, age: ageDays(best.date) };
    }).sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
    const stale = mine.filter((m) => m.age != null && m.age >= 30).length;

    el.innerHTML = `<div class="cmp-card">
        <h3>When each app's data was gathered</h3>
        <div class="tiles">${metas.map(([label, m]) => {
          const d = ageDays(m.gathered);
          return `<div class="tile${d != null && d >= 30 ? " old" : ""}"><span>${esc(label)}</span><strong>${esc(m.gathered || "?")}</strong><small>${ageText(d)} ago · patch ${esc(m.patch || "?")}</small></div>`;
        }).join("")}</div>
        <p class="note">Rerun the refresh-data skill after each game patch, or when this gets more than a few weeks old.</p>
      </div>
      <div class="shop-grid">
        ${[["Personal item prices", items, KINDS.items.color], ["Ship part prices", parts, KINDS.parts.color]].filter(([, l]) => l && l.length).map(([title, list, color]) => `
          <div class="cmp-card"><h3>${title} <small class="muted">${fmt(list.length)} · median ${ageText(median(list))} old</small></h3>
            <p class="muted">How long ago UEX or cstone last confirmed each shop price.</p>
            ${bars(list, color)}</div>`).join("")}
      </div>
      <div class="cmp-card">
        <h3>Prices on my lists <small class="muted">${stale ? `${stale} over a month old` : "all under a month old"}</small></h3>
        ${mine.length ? `<div class="cmp-scroll"><table><thead><tr><th>Thing</th><th>Cheapest shop</th><th class="num">aUEC</th><th class="num">Confirmed</th></tr></thead><tbody>
          ${mine.map((m) => `<tr${m.age != null && m.age >= 30 ? ' class="stale"' : ""}><td><i class="swatch" style="background:${KINDS[m.g.kind].color}"></i>${m.g.href ? `<a href="${esc(m.g.href)}">${esc(m.g.name)}</a>` : esc(m.g.name)}</td>
            <td>${esc(m.best.location)}</td><td class="num">${fmt(m.best.price)}</td>
            <td class="num">${m.best.date ? `${esc(m.best.date)} <small>${ageText(m.age)} ago</small>` : `<span class="muted">no date</span>`}</td></tr>`).join("")}
          </tbody></table></div>` : `<p class="muted">Nothing on your lists has a shop price.</p>`}
        <p class="note">Ship prices come from cstone without a date, so they show "no date". Prices over a month old are highlighted: check them in game or on UEX before you fly out.</p>
      </div>`;
  }

  window.Freshness = { render, bind() {} };
})();
