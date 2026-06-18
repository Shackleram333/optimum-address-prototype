const addressInput = document.getElementById("addressInput");
const clearAddress = document.getElementById("clearAddress");
const checkBtn = document.getElementById("checkBtn");
const dropdown = document.getElementById("dropdown");
const dropdownTitle = document.getElementById("dropdownTitle");
const addressField = document.getElementById("addressField");
const addressError = document.getElementById("addressError");
const scrim = document.getElementById("scrim");

const checkBand = document.getElementById("checkBand");
const heroBento = document.getElementById("heroBento");
const siteFooter = document.getElementById("siteFooter");
const quotesSection = document.getElementById("quotesSection");
const quotesAddress = document.getElementById("quotesAddress");
const quotesCart = document.getElementById("quotesCart");
const checkModal = document.getElementById("checkModal");
const checkModalText = document.getElementById("checkModalText");
const endPrototype = document.getElementById("endPrototype");
const heroCardLink = document.getElementById("heroCardLink");

let selectedSuggestion = null; // the chosen building/address object
let selectedUnit = ""; // chosen unit for MDU addresses ("" = none picked yet)
let latestResults = []; // most recent set of live Smarty results
let searchTimer = null;
let searchAbort = null;
let checkingTimer = null;
let currentPage = "address";

// LIVE US address search via Smarty US Autocomplete Pro. This uses a browser
// ("embedded"/website) key that is restricted by domain in the Smarty console,
// so it can be called directly from this static site. Smarty returns real
// secondary/unit data (apartments), which we expand into the unit picker. The
// key is supplied via config.js (window.SMARTY_WEBSITE_KEY).
const SMARTY_KEY = ((window.SMARTY_WEBSITE_KEY || "") + "").trim();
const SMARTY_ENDPOINT = "https://us-autocomplete-pro.api.smarty.com/lookup";

function smartyKeyConfigured() {
  return SMARTY_KEY.length > 0;
}

// Sentinel for the "I don't see my unit here" option — lets the flow proceed on
// the building address without a specific apartment.
const UNIT_NONE = "__none__";

// Turn a Smarty suggestion into the prototype's { line1, line2, value } shape.
// `entries` > 1 means the address is a building with multiple secondary units
// (an MDU) — we surface that count and expand the units after selection.
function smartyToSuggestion(s) {
  const completeUnit = s.secondary && s.entries <= 1;
  const line1 = completeUnit ? `${s.street_line} ${s.secondary}`.trim() : s.street_line;
  const line2 = `${s.city}, ${s.state} ${s.zipcode}`;
  return {
    line1,
    line2,
    value: `${line1}, ${line2}`,
    units: s.entries > 1 ? s.entries : 0,
    raw: s,
  };
}

async function fetchSmarty(query) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  const params = new URLSearchParams({
    key: SMARTY_KEY,
    search: query,
    max_results: "10",
  });
  const res = await fetch(`${SMARTY_ENDPOINT}?${params.toString()}`, {
    signal: searchAbort.signal,
  });
  if (!res.ok) throw new Error(`Smarty ${res.status}`);
  const data = await res.json();
  const mapped = (data.suggestions || []).map(smartyToSuggestion);

  // For a building, Smarty returns both the bare street address (entries 0) and
  // a "(N units...)" container (entries > 1) for the same base address. When a
  // units container exists, hide the plain no-unit row so the building shows once
  // (customers without a specific unit use "I don't see my unit here").
  const baseKey = (s) => `${s.line1}|${s.line2}`.toLowerCase();
  const hasUnits = new Set(
    mapped.filter((s) => s.units > 0).map((s) => baseKey(s))
  );
  const filtered = mapped.filter((s) => !(s.units === 0 && hasUnits.has(baseKey(s))));

  return filtered.slice(0, 6);
}

// Expand a building (entries > 1) into its individual unit addresses using the
// `selected` parameter, per Smarty's secondary-number expansion. Returns the
// list of unit label strings (e.g. "Apt A101", "Apt A102", ...).
async function fetchSecondaries(suggestion) {
  const s = suggestion.raw;
  const selected =
    `${s.street_line} ${s.secondary} (${s.entries}) ${s.city} ${s.state} ${s.zipcode}`;
  const params = new URLSearchParams({
    key: SMARTY_KEY,
    search: s.street_line,
    selected,
    max_results: "10",
  });
  const res = await fetch(`${SMARTY_ENDPOINT}?${params.toString()}`);
  if (!res.ok) throw new Error(`Smarty ${res.status}`);
  const data = await res.json();
  return (data.suggestions || [])
    .map((x) => (x.secondary || "").trim())
    .filter(Boolean);
}

// Fallback unit list if secondary expansion fails or returns nothing, so the
// demo stays usable. Four units per floor (A–D).
function buildUnitOptions(count) {
  const total = Number(count) > 0 ? Math.min(Number(count), 24) : 12;
  const letters = ["A", "B", "C", "D"];
  const units = [];
  for (let i = 0; i < total; i++) {
    const floor = Math.floor(i / letters.length) + 1;
    units.push(`Apt ${floor}${letters[i % letters.length]}`);
  }
  return units;
}

function unitOptionsFor(suggestion) {
  return buildUnitOptions(suggestion && suggestion.units);
}

// Smarty marks buildings with multiple secondary units via `entries` (mapped to
// `units`). Those rows show a "(N units...)" label and expand into a real unit
// picker; single addresses complete directly.
function isMDU(suggestion) {
  return !!(suggestion && suggestion.units);
}

function fullSelectedAddress() {
  if (!selectedSuggestion) return "";
  if (selectedUnit && selectedUnit !== UNIT_NONE) {
    return `${selectedSuggestion.line1}, ${selectedUnit}, ${selectedSuggestion.line2}`;
  }
  return selectedSuggestion.value;
}

function resetSelection() {
  selectedSuggestion = null;
  selectedUnit = "";
}

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

function setFocusState(active) {
  addressField.classList.toggle("focused", active);
  scrim.classList.toggle("hidden", !active);
}

function showAddressError(show) {
  addressError.classList.toggle("hidden", !show);
  addressField.classList.toggle("error", show);
}

function syncInputUI() {
  clearAddress.classList.toggle("hidden", addressInput.value.length === 0);
}

// mode: "hidden" | "helper" | "list" | "units"
function setDropdownMode(mode) {
  if (mode === "hidden") {
    dropdown.classList.add("hidden");
    return;
  }
  dropdown.classList.remove("hidden");
  dropdown.classList.toggle("helper-only", mode === "helper");
  dropdown.classList.toggle("dropdown-units", mode === "units");
  if (mode === "units") {
    dropdownTitle.textContent = "Select a unit to continue...";
  } else if (mode === "list") {
    dropdownTitle.textContent = "Select an address to continue...";
  }
  // "helper" mode keeps whatever message the caller set on dropdownTitle.
}

function renderDropdownRows(rows) {
  dropdown.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
  rows.forEach((suggestion, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row";
    row.dataset.index = String(index);
    const label = isMDU(suggestion)
      ? `${suggestion.line1} <em class="unit-count">(${suggestion.units} units...)</em>`
      : suggestion.line1;
    row.innerHTML = `
      <img class="pin-mini" src="./assets/icon-pin-blue.svg" alt="" />
      <span>${label}</span><small>${suggestion.line2}</small>`;
    dropdown.appendChild(row);
  });
  dropdown._rows = rows;
}

function renderUnitRows(units) {
  dropdown.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
  units.forEach((unit) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row unit-row";
    row.dataset.unit = unit;
    row.innerHTML = `<span>${unit}</span>`;
    dropdown.appendChild(row);
  });
  const noneRow = document.createElement("button");
  noneRow.type = "button";
  noneRow.className = "dropdown-row unit-row unit-row-none";
  noneRow.dataset.unitNone = "true";
  noneRow.innerHTML = `<span>I don't see my unit here</span>`;
  dropdown.appendChild(noneRow);
  dropdown._rows = null;
}

// Debounced live address lookup. Updates `latestResults` and renders the
// dropdown. Stale/aborted requests are ignored. Handles the graceful
// "configure key" and "keep typing" helper states.
function requestSuggestions(rawValue) {
  const query = (rawValue || "").trim();
  if (searchTimer) clearTimeout(searchTimer);

  if (!smartyKeyConfigured()) {
    latestResults = [];
    renderDropdownRows([]);
    setDropdownMode("helper");
    dropdownTitle.textContent =
      "Add your Smarty website key in config.js to enable live search.";
    return;
  }

  if (query.length < 3) {
    latestResults = [];
    renderDropdownRows([]);
    setDropdownMode("helper");
    dropdownTitle.textContent = "Keep typing to see matches...";
    return;
  }

  // Immediate lightweight "searching" affordance while the request is in flight.
  setDropdownMode("helper");
  dropdownTitle.textContent = "Searching addresses\u2026";

  searchTimer = setTimeout(async () => {
    try {
      const results = await fetchSmarty(query);
      // Drop the response if the field has since changed.
      if (addressInput.value.trim() !== query) return;
      latestResults = results;
      if (results.length) {
        renderDropdownRows(results);
        setDropdownMode("list");
      } else {
        renderDropdownRows([]);
        setDropdownMode("helper");
        dropdownTitle.textContent = "No matching addresses. Keep typing to refine.";
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      latestResults = [];
      renderDropdownRows([]);
      setDropdownMode("helper");
      dropdownTitle.textContent =
        "Couldn't reach address search — check your connection or key.";
    }
  }, 250);
}

// Choose an address suggestion. Single/no-unit addresses complete directly;
// multi-unit buildings expand to the REAL Smarty unit list (cached on the
// suggestion) plus the "I don't see my unit here" row.
async function selectSuggestion(suggestion) {
  selectedSuggestion = suggestion;
  selectedUnit = "";
  showAddressError(false);
  addressInput.value = suggestion.value;
  syncInputUI();

  if (!isMDU(suggestion)) {
    // Complete single address (no further secondary units) → confirm in place.
    selectedUnit = UNIT_NONE;
    setDropdownMode("hidden");
    setFocusState(false);
    addressInput.blur();
    return;
  }

  // Building with multiple units → expand to the REAL apartment list from Smarty.
  setFocusState(true);

  // Reuse the already-expanded unit list if we've fetched it before (avoids
  // burning extra Smarty lookups when the picker is re-shown).
  if (Array.isArray(suggestion._units)) {
    renderUnitRows(suggestion._units.length ? suggestion._units : unitOptionsFor(suggestion));
    setDropdownMode("units");
    return;
  }

  renderUnitRows([]);
  setDropdownMode("units");
  dropdownTitle.textContent = "Loading units\u2026";

  try {
    const units = await fetchSecondaries(suggestion);
    // Ignore if the user moved on (selection changed) while loading.
    if (selectedSuggestion !== suggestion) return;
    suggestion._units = units;
    renderUnitRows(units.length ? units : unitOptionsFor(suggestion));
  } catch (err) {
    if (selectedSuggestion !== suggestion) return;
    renderUnitRows(unitOptionsFor(suggestion));
  }
  dropdownTitle.textContent = "Select a unit to continue...";
}

/* ---------- Checking flow ---------- */
function enterCheckingFlow() {
  setDropdownMode("hidden");
  setFocusState(false);
  showAddressError(false);
  currentPage = "checking";
  checkModal.classList.remove("hidden");
  checkModal.setAttribute("aria-hidden", "false");
  checkModalText.textContent = "Checking availability...";
  if (checkingTimer) window.clearTimeout(checkingTimer);
  checkingTimer = window.setTimeout(() => {
    checkModalText.textContent = "Finding plans...";
    checkingTimer = window.setTimeout(() => {
      checkingTimer = null;
      hideCheckModal();
      enterQuotes();
    }, 1400);
  }, 1600);
}

function hideCheckModal() {
  checkModal.classList.add("hidden");
  checkModal.setAttribute("aria-hidden", "true");
}

function enterQuotes() {
  checkBand.classList.add("hidden");
  heroBento.classList.add("hidden");
  siteFooter.classList.add("hidden");
  scrim.classList.add("hidden");
  setDropdownMode("hidden");
  quotesAddress.textContent = fullSelectedAddress() || addressInput.value.trim();
  quotesSection.classList.remove("hidden");
  document.body.classList.add("in-quotes");
  currentPage = "quotes";
  window.scrollTo({ top: 0, behavior: "auto" });
}

function enterAddressStep() {
  if (checkingTimer) { window.clearTimeout(checkingTimer); checkingTimer = null; }
  hideCheckModal();
  quotesSection.classList.add("hidden");
  document.body.classList.remove("in-quotes");
  checkBand.classList.remove("hidden");
  heroBento.classList.remove("hidden");
  siteFooter.classList.remove("hidden");
  setDropdownMode("hidden");
  setFocusState(false);
  showAddressError(false);
  currentPage = "address";
  window.scrollTo({ top: 0, behavior: "auto" });
}

/* ---------- End of prototype ---------- */
function showEndPrototype() {
  endPrototype.classList.remove("hidden");
  endPrototype.setAttribute("aria-hidden", "false");
}
function restartPrototype() {
  endPrototype.classList.add("hidden");
  endPrototype.setAttribute("aria-hidden", "true");
  addressInput.value = "";
  resetSelection();
  latestResults = [];
  syncInputUI();
  enterAddressStep();
}

/* ---------- Events ---------- */
// This is a "realistic" prototype: the customer types (or pastes) their actual
// address and we query live results, so paste / autofill are intentionally
// allowed here (unlike the curated demos).
addressInput.addEventListener("input", () => {
  syncInputUI();
  showAddressError(false);
  resetSelection();
  requestSuggestions(addressInput.value);
});

addressInput.addEventListener("focus", () => {
  setFocusState(true);
  showAddressError(false);
  const v = addressInput.value.trim();
  if (selectedSuggestion && !selectedUnit) {
    selectSuggestion(selectedSuggestion);
    return;
  }
  if (v.length === 0) {
    renderDropdownRows([]);
    setDropdownMode("helper");
    dropdownTitle.textContent = smartyKeyConfigured()
      ? "Keep typing to see matches..."
      : "Add your Smarty website key in config.js to enable live search.";
  } else if (latestResults.length > 0) {
    renderDropdownRows(latestResults);
    setDropdownMode("list");
  } else {
    requestSuggestions(addressInput.value);
  }
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  resetSelection();
  latestResults = [];
  syncInputUI();
  showAddressError(false);
  renderDropdownRows([]);
  setDropdownMode("helper");
  dropdownTitle.textContent = smartyKeyConfigured()
    ? "Keep typing to see matches..."
    : "Add your Smarty website key in config.js to enable live search.";
  addressInput.focus();
});

dropdown.addEventListener("click", (event) => {
  // Keep dropdown interactions from reaching the document-level outside-click
  // handler (rows get swapped out mid-event when entering unit mode).
  event.stopPropagation();
  const rowEl = event.target.closest(".dropdown-row");
  if (!rowEl) return;

  // Unit pick (inline MDU selection).
  if (rowEl.classList.contains("unit-row")) {
    selectedUnit = rowEl.dataset.unitNone === "true" ? UNIT_NONE : rowEl.dataset.unit;
    addressInput.value = fullSelectedAddress();
    syncInputUI();
    showAddressError(false);
    setDropdownMode("hidden");
    setFocusState(false);
    addressInput.blur();
    return;
  }

  // Address pick.
  const rows = dropdown._rows || [];
  const suggestion = rows[Number(rowEl.dataset.index)];
  if (suggestion) selectSuggestion(suggestion);
});

checkBtn.addEventListener("click", () => {
  const q = normalizeQuery(addressInput.value);
  if (!q) { showAddressError(true); return; }

  // Address chosen but no unit yet → re-show the real unit picker.
  if (selectedSuggestion && !selectedUnit) {
    selectSuggestion(selectedSuggestion);
    setFocusState(true);
    return;
  }

  // Typed a partial address without selecting → surface the live list (or
  // trigger a fresh lookup if results haven't landed yet).
  if (!selectedSuggestion) {
    if (latestResults.length > 0) {
      renderDropdownRows(latestResults);
      setDropdownMode("list");
      setFocusState(true);
      return;
    }
    requestSuggestions(addressInput.value);
    setFocusState(true);
    return;
  }

  enterCheckingFlow();
});

addressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); checkBtn.click(); }
});

heroCardLink.addEventListener("click", (e) => {
  e.preventDefault();
  addressInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Outside click closes the dropdown / dims.
document.addEventListener("click", (event) => {
  const inControls =
    addressField.contains(event.target) ||
    dropdown.contains(event.target) ||
    event.target === checkBtn;
  if (!inControls && currentPage === "address") {
    setFocusState(false);
    setDropdownMode("hidden");
  }
});

// Last screen: click anywhere reveals the end-of-prototype overlay.
quotesSection.addEventListener("click", (event) => {
  if (currentPage === "quotes" && !event.target.closest("a, button")) showEndPrototype();
});
quotesCart.addEventListener("click", () => { if (currentPage === "quotes") showEndPrototype(); });
endPrototype.addEventListener("click", (event) => { event.stopPropagation(); restartPrototype(); });

syncInputUI();

/* ---------- Quotes screen: plan selection + order summary ---------- */
// Self-contained enhancement for the redesigned #quotesSection. Internet plans
// are single-select (one always selected); TV cards toggle on/off. The Monthly
// charges panel recomputes from the current selection. Guarded so the rest of
// the prototype keeps working even if the markup changes.
(function initQuotesSelection() {
  const internetGrid = document.getElementById("internetGrid");
  const tvGrid = document.getElementById("tvGrid");
  const summaryLines = document.getElementById("summaryLines");
  const summaryPlanName = document.getElementById("summaryPlanName");
  const summaryPlanPrice = document.getElementById("summaryPlanPrice");
  const summaryDueTotal = document.getElementById("summaryDueTotal");
  const summaryTopTotal = document.getElementById("summaryTopTotal");
  if (!internetGrid || !summaryLines) return;

  const money = (n) => `$${n.toFixed(2)}`;
  const internetCards = Array.from(internetGrid.querySelectorAll(".plan-card"));
  const tvCards = tvGrid ? Array.from(tvGrid.querySelectorAll(".plan-card")) : [];

  function selectedInternet() {
    return internetGrid.querySelector(".plan-card.is-selected") || internetCards[0];
  }

  function renderSummary() {
    const net = selectedInternet();
    const netName = net ? net.dataset.plan : "Internet";
    const netPrice = net ? Number(net.dataset.price) : 0;
    const addedTv = tvCards.filter((c) => c.classList.contains("is-selected"));
    const tvSubtotal = addedTv.reduce((sum, c) => sum + Number(c.dataset.price), 0);
    const tvDiscount = addedTv.length ? 5 : 0; // "Save $5 when you add TV"
    const due = netPrice + tvSubtotal - tvDiscount;

    if (summaryPlanName) summaryPlanName.textContent = netName;
    if (summaryPlanPrice) summaryPlanPrice.textContent = `${money(netPrice)}/mo`;

    // Remove any previously injected dynamic rows (TV + discount).
    summaryLines.querySelectorAll("[data-dynamic]").forEach((el) => el.remove());
    const creditRow = summaryLines.querySelector(".sl-credit");
    addedTv.forEach((c) => {
      const row = document.createElement("div");
      row.className = "summary-line";
      row.dataset.dynamic = "tv";
      row.innerHTML = `<span class="sl-label">${c.dataset.tv}</span><span class="sl-value">${money(Number(c.dataset.price))}/mo</span>`;
      summaryLines.insertBefore(row, creditRow || null);
    });
    if (tvDiscount) {
      const row = document.createElement("div");
      row.className = "summary-line sl-credit";
      row.dataset.dynamic = "tvdiscount";
      row.innerHTML = `<span class="sl-label">Save $5 when you add TV</span><span class="sl-value">-${money(tvDiscount)}/mo</span>`;
      summaryLines.insertBefore(row, creditRow || null);
    }

    if (summaryDueTotal) summaryDueTotal.textContent = `${money(due)}/mo`;
    if (summaryTopTotal) summaryTopTotal.textContent = money(due);
  }

  internetCards.forEach((card) => {
    const btn = card.querySelector(".plan-select");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      internetCards.forEach((c) => {
        c.classList.remove("is-selected");
        const b = c.querySelector(".plan-select");
        if (b) b.textContent = "Select";
      });
      card.classList.add("is-selected");
      btn.textContent = "Selected";
      renderSummary();
    });
  });

  tvCards.forEach((card) => {
    const btn = card.querySelector(".plan-select");
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const on = card.classList.toggle("is-selected");
      btn.textContent = on ? "Added" : "Add TV";
      renderSummary();
    });
  });

  renderSummary();
})();

const requestedPage = new URLSearchParams(window.location.search).get("page");
if (requestedPage === "quotes" || requestedPage === "plans") {
  enterQuotes();
} else {
  enterAddressStep();
}
