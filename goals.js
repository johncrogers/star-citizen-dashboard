// Time to goals: what everything I still want costs, in aUEC and in hours of contracts.
(function () {
  const { esc, fmt, short, activityRates, KINDS } = window.Dash;

  const KEY = "sc-dashboard:goals";
  const opts = { act: null, basis: "median", starter: false, custom: 300000, sort: "cheap", builds: true, all: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch (e) { /* storage unavailable */ } };
  const hours = (aUEC, rate) => (rate ? aUEC / rate : null);
  const hText = (h) => (h == null ? "—" : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 10 ? `${h.toFixed(1)} h` : `${fmt(h)} h`);

  // The chosen earning rate: an activity's median (or good-run) pay per hour, or my own number.
  function chosenRate(acts) {
    if (opts.act === "custom") return { rate: +opts.custom || null, label: "your own rate" };
    const a = acts.find((x) => x.act === opts.act) || acts.find((x) => x.n >= 10) || acts[0];
    if (!a) return { rate: +opts.custom || null, label: "your own rate" };
    return { rate: opts.basis === "good" ? a.good : a.median, label: a.label.toLowerCase(), act: a.act };
  }

  function rateCard(acts, chosen) {
    const max = Math.max(...acts.map((a) => (opts.basis === "good" ? a.good : a.median)), 1);
    const rows = acts.map((a) => {
      const v = opts.basis === "good" ? a.good : a.median;
      const on = chosen.act === a.act && opts.act !== "custom";
      return `<button type="button" class="hbar-row pick${on ? " on" : ""}" data-act="${esc(a.act)}" title="${esc(`${a.label}: ${fmt(v)} aUEC an hour (${opts.basis === "good" ? "median of the better half" : "median"} of ${a.n} contracts with reported times)`)}">
        <span class="hbar-label">${esc(a.label)}</span>
        <span class="hbar-track"><span class="hbar" style="width:${(v / max) * 100}%"></span></span>
        <span class="hbar-val">${short(v)}/h${on ? " ✓" : ""}</span></button>`;
    }).join("");
    return `<div class="cmp-card">
      <h3>How fast I earn</h3>
      <p class="muted">Pay per hour from the contracts app: reward ÷ the time players reported for a run. Pick the activity you play.</p>
      <div class="rate-controls">
        <label><input type="radio" name="basis" value="median" data-g="basis"${opts.basis === "median" ? " checked" : ""}> Typical run</label>
        <label><input type="radio" name="basis" value="good" data-g="basis"${opts.basis === "good" ? " checked" : ""}> Good runs (better half)</label>
        <label><input type="checkbox" data-g="starter"${opts.starter ? " checked" : ""}> Good-to-start contracts only</label>
      </div>
      <div class="hbars">${rows || `<p class="muted">The contracts data didn't load, so set your own rate.</p>`}</div>
      <label class="custom-rate${opts.act === "custom" ? " on" : ""}">Or my own rate
        <input type="number" min="1000" step="10000" value="${esc(opts.custom)}" data-g="custom" aria-label="My own aUEC per hour"> aUEC an hour</label>
    </div>`;
  }

  function summaryCard(goals, chosen) {
    const priced = goals.filter((g) => g.cost != null);
    const total = priced.reduce((s, g) => s + g.cost, 0);
    const by = (k) => priced.filter((g) => g.kind === k);
    const tiles = Object.keys(KINDS).map((k) => {
      const list = by(k);
      if (!goals.some((g) => g.kind === k)) return "";
      const t = list.reduce((s, g) => s + g.cost, 0);
      return `<div class="tile"><span><i class="swatch" style="background:${KINDS[k].color}"></i>${esc(KINDS[k].label)}</span>
        <strong>${short(t)} <small>aUEC</small></strong><small>${list.length} to buy · ${hText(hours(t, chosen.rate))}</small></div>`;
    }).join("");
    return `<div class="cmp-card hero-card">
      <div class="hero-num">
        <span>Still to buy</span>
        <strong>${fmt(total)} aUEC</strong>
        <span>about <b>${hText(hours(total, chosen.rate))}</b> of ${esc(chosen.label)}${chosen.rate ? ` at ${short(chosen.rate)} an hour` : ""}</span>
      </div>
      <div class="tiles">${tiles}</div>
    </div>`;
  }

  function costCard(goals, chosen) {
    const priced = goals.filter((g) => g.cost != null);
    if (!priced.length) return `<div class="cmp-card"><h3>What each one costs</h3><p class="muted">Nothing on your wishlists can be bought with aUEC yet. Star ships, items or parts in the other apps.</p></div>`;
    const list = [...priced];
    if (opts.sort === "cheap") list.sort((a, b) => a.cost - b.cost);
    if (opts.sort === "dear") list.sort((a, b) => b.cost - a.cost);
    if (opts.sort === "group") list.sort((a, b) => a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group) || a.cost - b.cost);
    const max = Math.max(...list.map((g) => g.cost));
    let run = 0;
    const LIMIT = 40;
    const shown = opts.all ? list : list.slice(0, LIMIT);
    let lastGroup = null;
    const rows = list.map((g) => {
      run += g.cost;
      if (!shown.includes(g)) return "";
      const head = opts.sort === "group" && `${g.kind}|${g.group}` !== lastGroup
        ? `<div class="cost-group">${esc(KINDS[g.kind].label)} · ${esc(g.group)}</div>` : "";
      lastGroup = `${g.kind}|${g.group}`;
      return `${head}<div class="cost-row" title="${esc(`${g.name}: ${fmt(g.cost)} aUEC${g.qty > 1 ? ` for ${g.qty}` : ""}, ${hText(hours(g.cost, chosen.rate))}. Everything up to here: ${fmt(run)} aUEC, ${hText(hours(run, chosen.rate))}.`)}">
        <span class="cost-name">${g.href ? `<a href="${esc(g.href)}">${esc(g.name)}</a>` : esc(g.name)}${g.qty > 1 ? ` <small>×${g.qty}</small>` : ""}<small class="muted"> ${esc(g.group)}</small></span>
        <span class="hbar-track"><span class="hbar" style="width:${(g.cost / max) * 100}%;background:${KINDS[g.kind].color}"></span></span>
        <span class="cost-val">${short(g.cost)} <small>${hText(hours(g.cost, chosen.rate))}</small></span>
        <span class="cost-run" >${hText(hours(run, chosen.rate))}</span>
      </div>`;
    }).join("");
    return `<div class="cmp-card">
      <h3>What each one costs</h3>
      <div class="rate-controls">
        <label>Order <select data-g="sort">
          <option value="cheap"${opts.sort === "cheap" ? " selected" : ""}>Cheapest first</option>
          <option value="dear"${opts.sort === "dear" ? " selected" : ""}>Most expensive first</option>
          <option value="group"${opts.sort === "group" ? " selected" : ""}>By wishlist group</option>
        </select></label>
        <label><input type="checkbox" data-g="builds"${opts.builds ? " checked" : ""}> Include parts for my saved builds</label>
      </div>
      <div class="legend">${Object.keys(KINDS).filter((k) => list.some((g) => g.kind === k)).map((k) => `<span><i class="swatch" style="background:${KINDS[k].color}"></i>${esc(KINDS[k].label)}</span>`).join("")}</div>
      <div class="cost-head"><span>Thing</span><span></span><span>Cost · time</span><span>Done after</span></div>
      <div class="cost-rows">${rows}</div>
      ${list.length > LIMIT ? `<button type="button" class="ghost" data-g="all">${opts.all ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}
      <p class="note">Prices are the cheapest shop. "Done after" adds everything above it, so in this order you'd have it all after the last row.</p>
    </div>`;
  }

  function cantCard(goals) {
    const list = goals.filter((g) => g.cost == null);
    if (!list.length) return "";
    return `<div class="cmp-card"><h3>Can't buy with aUEC</h3>
      <table><thead><tr><th>Thing</th><th>Kind</th><th>How to get it</th></tr></thead><tbody>
      ${list.map((g) => `<tr><td>${g.href ? `<a href="${esc(g.href)}">${esc(g.name)}</a>` : esc(g.name)}</td><td>${esc(KINDS[g.kind].label)}</td><td>${esc(g.why || "Not sold")}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function render(el, data, allGoals) {
    const goals = opts.builds ? allGoals : allGoals.filter((g) => g.kind !== "builds");
    const acts = activityRates(data, { starterOnly: opts.starter });
    const chosen = chosenRate(acts);
    el.innerHTML = `<div class="goal-grid">
        <div class="goal-main">${summaryCard(goals, chosen)}${costCard(goals, chosen)}${cantCard(goals)}</div>
        <div class="goal-side">${rateCard(acts, chosen)}</div>
      </div>`;
  }

  function bind(el, rerender) {
    el.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-act]");
      if (pick) { opts.act = pick.dataset.act; save(); rerender(); return; }
      const btn = e.target.closest('button[data-g="all"]');
      if (btn) { opts.all = !opts.all; save(); rerender(); }
    });
    el.addEventListener("change", (e) => {
      const k = e.target.dataset.g;
      if (!k) return;
      if (k === "basis") opts.basis = e.target.value;
      if (k === "starter" || k === "builds") opts[k] = e.target.checked;
      if (k === "sort") opts.sort = e.target.value;
      if (k === "custom") { opts.custom = Math.max(1000, +e.target.value || 0); opts.act = "custom"; }
      save();
      rerender();
    });
  }

  window.Goals = { render, bind, opts };
})();
