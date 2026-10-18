// Dashboard: loads the other apps' data once, then shows one view at a time.
(function () {
  const { esc, fmt, SITE, loadAll, buildGoals } = window.Dash;
  const VIEWS = [
    ["goals", "Time to goals", window.Goals],
    ["shop", "Where to shop", window.Shopping],
    ["fresh", "Price freshness", window.Freshness],
  ];
  const $ = (id) => document.getElementById(id);
  let current = "goals";
  let data = null;
  let goals = [];

  $("siteLinks").innerHTML = (SITE.links || []).map((l) => `<a href="${esc(l.href)}">${esc(l.label)} →</a>`).join("");

  // Replacing the view can blur a focused box, whose "change" asks for another render while this
  // one is still running. Run that one afterwards instead.
  let busy = false, again = false;
  function render() {
    if (busy) { again = true; return; }
    busy = true;
    try { draw(); } finally { busy = false; }
    if (again) { again = false; render(); }
  }

  function draw() {
    $("scope").innerHTML = VIEWS.map(([k, label]) => `<button class="tab${k === current ? " on" : ""}" data-view="${k}">${label}</button>`).join("");
    if (!data) return;
    // Saved choices can change in another tab (another app), so rebuild the list each time.
    goals = buildGoals(data);
    VIEWS.find(([k]) => k === current)[2].render($("view"), data, goals);
  }

  function fromHash() {
    const h = location.hash.slice(1);
    if (VIEWS.some(([k]) => k === h)) current = h;
  }

  $("scope").addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    current = b.dataset.view;
    try { history.replaceState(null, "", `#${current}`); } catch (err) { /* file:// */ }
    render();
  });
  window.addEventListener("hashchange", () => { fromHash(); render(); });
  // Coming back from another app's tab: pick up any stars or ticks made there.
  window.addEventListener("focus", () => render());
  for (const [, , view] of VIEWS) view.bind($("view"), render);

  const NAMES = { ships: "Ships", items: "Items", components: "Ship components", contracts: "Contracts" };
  fromHash();
  render();
  loadAll((id) => { $("meta").textContent = `Loading ${NAMES[id] || id}…`; }).then((res) => {
    data = res.data;
    const metas = [
      ["Ships", data.ships?.SHIP_CATALOG_META], ["items", data.items?.ITEM_CATALOG_META],
      ["parts", data.components?.COMPONENT_CATALOG_META], ["contracts", data.contracts?.CONTRACTS_META],
    ].filter(([, m]) => m);
    const oldest = metas.map(([, m]) => m.gathered).filter(Boolean).sort()[0];
    $("meta").textContent = `Built from your wishlists and owned lists in the other apps · data for patch ${metas[0]?.[1]?.patch || "?"}${oldest ? ` · oldest data gathered ${oldest}` : ""}`;
    if (res.missing.length) {
      $("missing").hidden = false;
      $("missing").textContent = `Couldn't load ${res.missing.map((m) => NAMES[m] || m).join(", ")}. Those parts are left out.`;
    }
    render();
  });
})();
