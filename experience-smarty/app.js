const header = document.getElementById("header");
const headerLogo = document.getElementById("headerLogo");
const phone = document.querySelector(".phone");
const phoneViewport = document.getElementById("phoneViewport");
const keyboard = document.getElementById("keyboard");
const keyboardModeToggle = document.getElementById("keyboardModeToggle");
const addressInput = document.getElementById("addressInput");
const clearAddress = document.getElementById("clearAddress");
const checkPlansBtn = document.getElementById("checkPlansBtn");
const dropdown = document.getElementById("dropdown");
const dropdownTitle = document.getElementById("dropdownTitle");
const dropdownRowsHost = dropdown;
const addressSection = document.getElementById("addressSection");
const addressField = document.getElementById("addressField");
const addressError = document.getElementById("addressError");
const heroSection = document.getElementById("heroSection");
const topScrim = document.getElementById("topScrim");
const bottomScrim = document.getElementById("bottomScrim");

const endPrototype = document.getElementById("endPrototype");
const checkingSection = document.getElementById("checkingSection");
const activeAccountSection = document.getElementById("activeAccountSection");
const activeAddressText = document.getElementById("activeAddressText");
const editAddressLink = document.getElementById("editAddressLink");
const startShoppingBtn = document.getElementById("startShoppingBtn");
const myAccountBtn = document.getElementById("myAccountBtn");
const footer = document.getElementById("footer");
const plansModal = document.getElementById("plansModal");
const plansModalText = document.getElementById("plansModalText");
const quotesSection = document.getElementById("quotesSection");

// Phones / touchscreens use the real OS keyboard; the simulated (Figma) keyboard
// is only for pointer devices (laptop/desktop) where there is no OS keyboard.
const isTouchDevice =
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

let keyboardPinned = false;
let activeInput = null;
let keyboardMode = "numeric";
let selectedSuggestion = null; // the chosen building/address object
let selectedUnit = ""; // chosen unit for MDU addresses
let checkingTimer = null;
let currentPage = "address";
// While true, the address step actively holds the headline pinned ~10px from the top.
// The native keyboard/autofill on iOS likes to drift the inner scroller after focus;
// we re-pin (geometrically, to the headline) on every scroll so the search box stays
// put. A real finger drag (touchstart) clears this so manual scrolling always works.
let holdPin = false;

function setPageInUrl(page) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", page);
  window.history.replaceState({}, "", url);
}

function normalizePageName(rawPage) {
  const value = (rawPage || "").trim().toLowerCase();
  if (["address", "home"].includes(value)) return "address";
  if (["checking", "checking-address", "loading"].includes(value)) return "checking";
  if (["active", "active-account", "account"].includes(value)) return "active";
  if (["quotes", "plans", "list-quotes", "results"].includes(value)) return "quotes";
  return "address";
}

function setCurrentPage(page, updateUrl = true) {
  currentPage = page;
  document.body.dataset.page = page;
  if (updateUrl) {
    setPageInUrl(page);
  }
}

function getRequestedPageFromUrl() {
  const queryPage = new URLSearchParams(window.location.search).get("page");
  if (queryPage) {
    return normalizePageName(queryPage);
  }
  const hashPage = window.location.hash.replace("#", "");
  if (hashPage) {
    return normalizePageName(hashPage);
  }
  return "address";
}

// LIVE US address search via Smarty US Autocomplete Pro. This uses a browser
// ("embedded"/website) key that is restricted by domain in the Smarty console,
// so it can be called directly from this static site. Unlike Photon, Smarty
// returns real secondary/unit data (apartments), which we expand into the unit
// picker. The key is supplied via config.js (window.SMARTY_WEBSITE_KEY).
const SMARTY_KEY = ((window.SMARTY_WEBSITE_KEY || "") + "").trim();
const SMARTY_ENDPOINT = "https://us-autocomplete-pro.api.smarty.com/lookup";

function smartyKeyConfigured() {
  return SMARTY_KEY.length > 0;
}

// Most recent set of live results, used by the dropdown, the keyboard predictive
// bar, and the "Find plans" button.
let latestResults = [];
let searchTimer = null;
let searchAbort = null;

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
    search: stripCountry(query),
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

const kbSuggest = document.getElementById("kbSuggest");

function insertChar(ch) {
  if (!ch) return;
  addressInput.value += ch;
  activeInput = addressInput;
  addressInput.dispatchEvent(new Event("input", { bubbles: true }));
  addressInput.focus();
}

// Once a house number followed by a space is present, the user has moved on to
// the street name, so flip to the letter keyboard automatically (and back to
// the number pad while still in the leading number).
function syncKeyboardModeForInput() {
  const desired = /\d\s/.test(addressInput.value) ? "alpha" : "numeric";
  if (keyboardMode !== desired) {
    applyKeyboardLayout(desired);
  }
}

// Smarty marks buildings with multiple secondary units via `entries` (mapped to
// `units`). Those rows show a "(N units...)" label and expand into a real unit
// picker; single addresses complete directly.
function isMDU(suggestion) {
  return !!(suggestion && suggestion.units);
}

function selectionComplete() {
  return !!selectedSuggestion && !!selectedUnit;
}

// Sentinel for the "I don't see my unit here" option — lets the flow proceed on
// the building address without a specific apartment.
const UNIT_NONE = "__none__";

function fullSelectedAddress() {
  if (!selectedSuggestion) return "";
  if (selectedUnit && selectedUnit !== UNIT_NONE) {
    return `${selectedSuggestion.line1}, ${selectedUnit}, ${selectedSuggestion.line2}`;
  }
  return selectedSuggestion.value;
}

function updateCtaLabel() {
  if (selectedSuggestion && !selectedUnit) {
    checkPlansBtn.textContent = "Select a unit";
  } else {
    checkPlansBtn.textContent = "Find plans";
  }
}

async function selectSuggestion(suggestion) {
  selectedSuggestion = suggestion;
  selectedUnit = "";
  showAddressError(false);
  addressInput.value = suggestion.value;
  syncAddressInputUI();

  if (!isMDU(suggestion)) {
    // Complete single address (no further secondary units) → confirm in place.
    selectedUnit = UNIT_NONE;
    updateCtaLabel();
    setDropdownMode("hidden");
    setFocusState(false);
    addressInput.blur();
    keyboardPinned = false;
    showKeyboard(false);
    return;
  }

  // Building with multiple units → expand to the REAL apartment list from Smarty.
  updateCtaLabel();
  setFocusState(true);
  keyboardPinned = true;
  if (!isTouchDevice) {
    // Desktop preview: swap the simulated keyboard for the unit list WITHOUT
    // moving the page. Keep `keyboard-open` so the reserved scroll height stays
    // and the viewport doesn't clamp/jump; only hide the simulated keyboard.
    const preservedScrollTop = phoneViewport.scrollTop;
    keyboard.classList.add("hidden");
    updateDropdownMaxHeight();
    phoneViewport.scrollTo({ top: preservedScrollTop });
  }
  // Touch: do NOT call showKeyboard(false) — it would strip `keyboard-open` and its
  // reserved scroll height before units mode is set, clamping scrollTop and dropping
  // the headline. The native keyboard is dismissed by addressInput.blur() inside
  // setDropdownMode("units"), which also restores the scroll position.

  // Reuse the already-expanded unit list if we've fetched it before (avoids
  // burning extra Smarty lookups when the picker is re-shown).
  if (Array.isArray(suggestion._units)) {
    renderUnitRows(suggestion._units.length ? suggestion._units : unitOptionsFor(suggestion));
    setDropdownMode("units");
    return;
  }

  renderUnitRows([]);
  setDropdownMode("units");
  if (dropdownTitle) dropdownTitle.textContent = "Loading units\u2026";

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
  if (dropdownTitle) dropdownTitle.textContent = "Select a unit to continue...";
}

let predictionSuggestions = [];

function updatePredictions() {
  if (!kbSuggest) return;
  const items = kbSuggest.querySelectorAll(".kb-suggest-item");
  const typed = addressInput.value.trim();
  const matches = latestResults.slice(0, 3);

  let candidates;
  if (matches.length > 0) {
    candidates = matches.map((s) => ({ label: s.line1, suggestion: s }));
  } else {
    candidates = [
      { label: typed ? `\u201C${typed}\u201D` : "\u201CThe\u201D", generic: true },
      { label: "address", generic: true },
      { label: "unit", generic: true },
    ];
  }
  while (candidates.length < 3) candidates.push({ label: "", generic: true });

  predictionSuggestions = candidates.map((c) => c.suggestion || null);

  items.forEach((item, i) => {
    const c = candidates[i] || { label: "", generic: true };
    item.textContent = c.label;
    item.dataset.slot = String(i);
    item.style.visibility = c.label ? "visible" : "hidden";
  });
}

function setFocusState(active) {
  addressField.classList.toggle("focused", active);
  topScrim.classList.toggle("hidden", !active);
  bottomScrim.classList.add("hidden");
  if (active) {
    // Anchor the dimming scrim near the top of the hero (a little above it) so it
    // always covers the same area regardless of headline height.
    topScrim.style.top = `${heroSection.offsetTop - 24}px`;
  }
}

function updateDropdownPlacement() {
  // The dropdown is anchored under the input via CSS (position:absolute on the
  // relative .address-input-wrap), so it tracks the field and scrolls with the
  // page automatically — no per-scroll repositioning needed.
}

function updateDropdownMaxHeight() {
  if (dropdown.classList.contains("hidden")) {
    return;
  }
  const dropdownRect = dropdown.getBoundingClientRect();
  const phoneRect = phone.getBoundingClientRect();
  // During unit selection there is no keyboard, so the list can run to the
  // bottom of the screen and show many more units at once.
  const unitsMode = dropdown.classList.contains("dropdown-units");
  let boundaryTop;
  if (unitsMode) {
    if (isTouchDevice) {
      // Clamp to the visible viewport height (window.innerHeight is stable and
      // doesn't shrink while the keyboard dismisses, unlike visualViewport),
      // leaving a gap so the last rows clear the browser's bottom URL bar.
      boundaryTop = Math.min(phoneRect.bottom, window.innerHeight) - 72;
    } else {
      boundaryTop = phoneRect.bottom;
    }
  } else if (isTouchDevice) {
    // The OS keyboard overlays roughly the lower half of the screen on phones.
    boundaryTop = window.innerHeight * 0.52;
  } else {
    boundaryTop = keyboard.classList.contains("hidden")
      ? phoneRect.bottom
      : keyboard.getBoundingClientRect().top;
  }
  const availableHeight = Math.max(140, Math.floor(boundaryTop - dropdownRect.top - 8));
  dropdown.style.maxHeight = `${availableHeight}px`;
}

function syncDropdownPlacementIfVisible() {
  if (!dropdown.classList.contains("hidden")) {
    updateDropdownPlacement();
    updateDropdownMaxHeight();
  }
}

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

// Strip a trailing country token so Smarty autocomplete still matches when the
// user pastes / autofills a full address ending in the country (e.g. "..., United States").
function stripCountry(value) {
  let v = (value || "").trim();
  const country = /[\s,]+(?:united states of america|united states|u\.?\s?s\.?\s?a\.?|u\.?\s?s\.?|usa|us|america)\s*$/i;
  // Run twice in case of doubled tokens like "USA, United States".
  v = v.replace(country, "").replace(country, "");
  v = v.replace(/[\s,]+$/, "").trim();
  return v;
}

// Debounced live address lookup. Updates `latestResults`, renders the dropdown,
// and refreshes the keyboard predictive bar. Stale/aborted requests are ignored.
function requestSuggestions(rawValue) {
  const query = (rawValue || "").trim();
  if (searchTimer) clearTimeout(searchTimer);

  if (!smartyKeyConfigured()) {
    latestResults = [];
    renderDropdownRows([]);
    setDropdownMode("helper");
    if (dropdownTitle)
      dropdownTitle.textContent =
        "Add your Smarty website key in config.js to enable live search.";
    updatePredictions();
    return;
  }

  if (query.length < 3) {
    latestResults = [];
    renderDropdownRows([]);
    setDropdownMode("helper");
    if (dropdownTitle) dropdownTitle.textContent = "Keep typing to see matches...";
    updatePredictions();
    return;
  }

  // Immediate lightweight "searching" affordance while the request is in flight.
  setDropdownMode("helper");
  if (dropdownTitle) dropdownTitle.textContent = "Searching addresses\u2026";

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
        if (dropdownTitle)
          dropdownTitle.textContent = "No matching addresses. Keep typing to refine.";
      }
      updatePredictions();
      syncDropdownPlacementIfVisible();
    } catch (err) {
      if (err && err.name === "AbortError") return;
      latestResults = [];
      renderDropdownRows([]);
      setDropdownMode("helper");
      if (dropdownTitle)
        dropdownTitle.textContent = "Couldn't reach address search — check your connection or key.";
      updatePredictions();
    }
  }, 250);
}

function renderDropdownRows(rows) {
  dropdownRowsHost.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
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
      <span>${label}</span><small>${suggestion.line2}</small>
    `;
    dropdownRowsHost.appendChild(row);
  });
  // Keep a reference to the rendered set for click resolution.
  dropdown._rows = rows;
}

function renderUnitRows(units) {
  dropdownRowsHost.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
  units.forEach((unit) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row unit-row";
    row.dataset.unit = unit;
    row.innerHTML = `<span>${unit}</span>`;
    dropdownRowsHost.appendChild(row);
  });
  const noneRow = document.createElement("button");
  noneRow.type = "button";
  noneRow.className = "dropdown-row unit-row unit-row-none";
  noneRow.dataset.unitNone = "true";
  noneRow.innerHTML = `<span>I don't see my unit here</span>`;
  dropdownRowsHost.appendChild(noneRow);
  dropdown._rows = null;
}

// mode: "hidden" | "helper" | "list" | "units"
function setDropdownMode(mode) {
  if (mode === "hidden") {
    dropdown.classList.add("hidden");
    return;
  }
  updateDropdownPlacement();
  dropdown.classList.remove("hidden");
  dropdown.classList.toggle("helper-only", mode === "helper");
  dropdown.classList.toggle("dropdown-units", mode === "units");
  if (mode === "helper") {
    dropdownTitle.textContent = "Keep typing to see matches...";
  } else if (mode === "units") {
    dropdownTitle.textContent = "Select a unit to continue...";
    // No typing happens during unit selection — dismiss the OS keyboard, but keep
    // the scroll position from the address search (don't snap back to the top and
    // re-reveal the header). Keeping `keyboard-open` preserves the scroll height.
    if (isTouchDevice) {
      const y = phoneViewport.scrollTop;
      addressInput.blur();
      const restore = () => {
        phoneViewport.scrollTo({ top: y });
        updateDropdownMaxHeight();
      };
      window.requestAnimationFrame(restore);
      window.setTimeout(restore, 60);
      window.setTimeout(restore, 300);
      window.setTimeout(restore, 500);
      window.setTimeout(restore, 700);
    }
  } else {
    dropdownTitle.textContent = "Select an address to continue...";
  }
  window.requestAnimationFrame(updateDropdownMaxHeight);
}

const alphaLayout = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["shift", "z", "x", "c", "v", "b", "n", "m", "backspace"],
];

const numericLayout = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["-", "/", ":", ";", "(", ")", "$", "&", "@", "\""],
  ["#+=", ".", ",", "?", "!", "'", "backspace"],
];

function syncAddressInputUI() {
  clearAddress.classList.toggle("hidden", addressInput.value.length === 0);
}

function setHeaderVariant(variant) {
  if (variant === "white") {
    header.classList.remove("header-blue");
    header.classList.add("header-white");
    headerLogo.src = "./assets/logo-optimum.png";
    headerLogo.style.height = "24px";
    return;
  }
  header.classList.remove("header-white");
  header.classList.add("header-blue");
  headerLogo.src = "./assets/logo-optimum-white.png";
  headerLogo.style.height = "27px";
}

function showAddressError(show) {
  addressError.classList.toggle("hidden", !show);
  addressField.classList.toggle("error", show);
}

// Freeze BOTH scrollers so the native iOS keyboard/autofill can't drift the page:
// the inner .phone-viewport (via the pin-frozen class) AND the window itself (the
// .phone is taller than the screen, so the document can scroll ~230px — if the inner
// scroller is locked, iOS just scrolls the window instead). A finger drag releases.
let frozenPvTop = 0;
let frozenWinY = 0;
function applyPinFreeze() {
  holdPin = true;
  frozenPvTop = phoneViewport.scrollTop;
  frozenWinY = window.scrollY || window.pageYOffset || 0;
  phone.classList.add("pin-frozen");
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}
function releasePinFreeze() {
  holdPin = false;
  phone.classList.remove("pin-frozen");
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}
// Safety net: if iOS still nudges either scroller for the focused input/autofill,
// snap it back instantly. Direct scrollTop assignment + window.scrollTo("instant")
// ignore CSS smooth-scroll, so this corrects in one frame and never crawls.
function snapBackToFrozen() {
  if (!holdPin) return;
  if (phoneViewport.scrollTop !== frozenPvTop) phoneViewport.scrollTop = frozenPvTop;
  const wy = window.scrollY || window.pageYOffset || 0;
  if (wy !== frozenWinY) window.scrollTo(0, frozenWinY);
}

// Scroll the search step so the "See if Optimum..." headline sits just under the
// top of the viewport (~10px), maximizing room for the dropdown/keyboard.
function scrollSearchToTop(behavior = "smooth") {
  const headline = addressSection.querySelector("h1") || addressSection;
  const delta =
    headline.getBoundingClientRect().top -
    phoneViewport.getBoundingClientRect().top -
    10;
  if (Math.abs(delta) <= 1) return; // already pinned — avoid redundant scrolls/loops
  phoneViewport.scrollTo({
    top: phoneViewport.scrollTop + delta,
    behavior,
  });
}

function showKeyboard(show, focusEl) {
  // On touch devices the OS provides the keyboard; never show the simulated one,
  // but still reserve bottom scroll space so content can be scrolled up above
  // the native keyboard.
  if (isTouchDevice) {
    // Stay-put rule: never collapse the reserved keyboard space or move the page
    // during the address step. The native keyboard is dismissed via blur(); the
    // reserved space is released on a page transition (enterAddressStep / quotes /
    // etc.). This keeps the focus-pin scroll position stable through autofill,
    // typing, and opening the apartment picker — while manual scrolling still works.
    if (!show && (currentPage === "address" || dropdown.classList.contains("dropdown-units"))) {
      updateDropdownMaxHeight();
      return;
    }
    phone.classList.toggle("keyboard-open", !!show);
    updateDropdownMaxHeight();
    if (show) {
      // Pin the headline near the top on focus, then FREEZE the scroller. Once frozen
      // (overflow:hidden) the native iOS keyboard/autofill physically cannot scroll
      // the page, so it stays perfectly still through autofill/typing — no re-pinning,
      // no tug-of-war, no slow-motion drift. A finger drag releases it (touchmove).
      holdPin = true;
      window.setTimeout(() => {
        if (!holdPin) return; // user already grabbed the page with a finger
        scrollSearchToTop("instant");
        updateDropdownMaxHeight();
        applyPinFreeze();
      }, 120);
    }
    return;
  }
  if (show) {
    keyboard.classList.remove("hidden");
    phone.classList.add("keyboard-open");
    if (focusEl) {
      window.setTimeout(() => {
        scrollSearchToTop();
        updateDropdownPlacement();
        updateDropdownMaxHeight();
      }, 60);
    }
    window.setTimeout(updateDropdownPlacement, 140);
    window.setTimeout(updateDropdownMaxHeight, 140);
    return;
  }
  keyboard.classList.add("hidden");
  phone.classList.remove("keyboard-open");
  updateDropdownMaxHeight();
}

function keyLabel(key) {
  if (key === "shift") return "⇧";
  if (key === "backspace") return "⌫";
  return key;
}

function applyKeyboardLayout(mode) {
  keyboardMode = mode;
  keyboard.classList.toggle("kb-numeric", mode === "numeric");
  keyboard.classList.toggle("kb-alpha", mode !== "numeric");
  keyboard.classList.remove("kb-shift");

  const rows = keyboard.querySelectorAll(".kb-row");
  const layout = mode === "numeric" ? numericLayout : alphaLayout;

  rows.forEach((rowEl, rowIndex) => {
    rowEl.replaceChildren();
    (layout[rowIndex] || []).forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.key = key;
      btn.textContent = keyLabel(key);
      rowEl.appendChild(btn);
    });
  });

  if (keyboardModeToggle) {
    keyboardModeToggle.dataset.key = mode === "numeric" ? "ABC" : "123";
    keyboardModeToggle.textContent = mode === "numeric" ? "ABC" : "123";
  }
}

function resetSelection() {
  selectedSuggestion = null;
  selectedUnit = "";
  updateCtaLabel();
}

function enterAddressStep() {
  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
    checkingTimer = null;
  }
  setHeaderVariant("blue");
  header.classList.remove("hidden");
  addressSection.classList.remove("hidden");
  heroSection.classList.remove("hidden");
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  footer.classList.add("hidden");
  dropdown.classList.add("hidden");
  showAddressError(false);
  setFocusState(false);
  updateCtaLabel();
  keyboardPinned = false;
  showKeyboard(false);
  // Force-release any reserved keyboard space on a fresh address entry (the
  // stay-put guard in showKeyboard intentionally skips this while on the
  // address step, so clear it explicitly here).
  phone.classList.remove("keyboard-open");
  releasePinFreeze();
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("address");
}

const PLANS_STATE_TEXT = {
  checking: "Checking address...",
  finding: "Finding plans...",
  success: "Plans found!",
};

function showPlansModalState(state) {
  plansModal.classList.remove(
    "hidden",
    "state-checking",
    "state-finding",
    "state-success"
  );
  plansModal.classList.add("state-" + state);
  plansModal.setAttribute("aria-hidden", "false");
  plansModalText.textContent = PLANS_STATE_TEXT[state];
}

function hidePlansModal() {
  plansModal.classList.add("hidden");
  plansModal.classList.remove("state-checking", "state-finding", "state-success");
  plansModal.setAttribute("aria-hidden", "true");
}

// Post–Find plans flow (Figma 807:40918 →): a single centered modal over the
// home screen cycling Checking address → Finding plans → Plans found, then the
// List Quotes results page.
function enterPlansFlow() {
  setDropdownMode("hidden");
  setFocusState(false);
  showAddressError(false);
  keyboardPinned = false;
  showKeyboard(false);
  activeInput = null;
  releasePinFreeze();
  // Home (header/address/hero) stays visible behind the modal's scrim.
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  // Keep the scroll position where it was — on phones the modal is fixed to the
  // viewport (see CSS), so the card stays in view without snapping to the top.
  if (!isTouchDevice) {
    phoneViewport.scrollTo({ top: 0, behavior: "auto" });
  }
  setCurrentPage("checking");

  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
  }
  showPlansModalState("checking");
  checkingTimer = window.setTimeout(() => {
    showPlansModalState("finding");
    checkingTimer = window.setTimeout(() => {
      showPlansModalState("success");
      checkingTimer = window.setTimeout(() => {
        checkingTimer = null;
        hidePlansModal();
        enterQuotesStep();
      }, 1200);
    }, 1700);
  }, 1600);
}

// Back-compat aliases for existing callers / deep links.
function enterCheckingStep() {
  enterPlansFlow();
}

function enterFindingPlansStep() {
  enterPlansFlow();
}

function enterActiveAccountStep() {
  header.classList.add("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  checkingSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  footer.classList.add("hidden");
  setDropdownMode("hidden");
  showKeyboard(false);
  activeInput = null;
  keyboardPinned = false;

  const upperAddress = (fullSelectedAddress() || "1111 STEWART AVE, BETHPAGE, NY 11714");
  activeAddressText.textContent = upperAddress.toUpperCase().replaceAll(",", "");

  activeAccountSection.classList.remove("hidden");
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("active");
}

function enterQuotesStep() {
  header.classList.add("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  footer.classList.add("hidden");
  setDropdownMode("hidden");
  showKeyboard(false);
  activeInput = null;
  keyboardPinned = false;

  quotesSection.classList.remove("hidden");
  phoneViewport.scrollTo({ top: 0, behavior: "auto" });
  setCurrentPage("quotes");
}

function showEndPrototype() {
  endPrototype.classList.remove("hidden");
  endPrototype.setAttribute("aria-hidden", "false");
}

function hideEndPrototype() {
  endPrototype.classList.add("hidden");
  endPrototype.setAttribute("aria-hidden", "true");
}

function restartPrototype() {
  hideEndPrototype();
  addressInput.value = "";
  resetSelection();
  syncAddressInputUI();
  enterAddressStep();
}

// Last screen (List Quotes): a tap reveals the "End of prototype" overlay; a tap
// on the overlay restarts the flow from the address step.
quotesSection.addEventListener("click", () => {
  if (currentPage === "quotes") {
    showEndPrototype();
  }
});

const quotesCart = document.getElementById("quotesCart");
if (quotesCart) {
  quotesCart.addEventListener("click", () => {
    if (currentPage === "quotes") {
      showEndPrototype();
    }
  });
}

endPrototype.addEventListener("click", (event) => {
  event.stopPropagation();
  restartPrototype();
});

// This is the "realistic" prototype: the customer types (or pastes) their actual
// address and we query live results, so paste / autofill are intentionally
// allowed here (unlike the curated demos).
addressInput.addEventListener("input", () => {
  // The customer's actual characters are kept exactly as entered.
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);

  // Typing invalidates any prior selection / unit.
  resetSelection();

  // Debounced live lookup handles rendering + the predictive bar.
  requestSuggestions(addressInput.value);
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);
  resetSelection();
  latestResults = [];
  renderDropdownRows([]);
  setDropdownMode("helper");
  if (dropdownTitle) dropdownTitle.textContent = "Keep typing to see matches...";
  updatePredictions();
  addressInput.focus();
});

checkPlansBtn.addEventListener("click", () => {
  const v = normalizeQuery(addressInput.value);

  if (!v) {
    showAddressError(true);
    return;
  }

  // Address chosen but no unit yet → CTA acts as "Select a unit" (re-show the
  // real unit picker, using the cached expansion).
  if (selectedSuggestion && !selectedUnit) {
    selectSuggestion(selectedSuggestion);
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

  setDropdownMode("hidden");
  enterCheckingStep();
});

dropdown.addEventListener("click", (event) => {
  // Keep dropdown interactions from reaching the document-level outside-click
  // handler (rows get swapped out mid-event when entering unit mode).
  event.stopPropagation();
  const row = event.target.closest(".dropdown-row");
  if (!row) {
    return;
  }

  // Unit pick (inline MDU selection).
  if (row.classList.contains("unit-row")) {
    selectedUnit = row.dataset.unitNone === "true" ? UNIT_NONE : row.dataset.unit;
    addressInput.value = fullSelectedAddress();
    syncAddressInputUI();
    updateCtaLabel();
    setDropdownMode("hidden");
    setFocusState(false);
    showAddressError(false);
    addressInput.blur();
    keyboardPinned = false;
    showKeyboard(false);
    return;
  }

  // Address pick.
  const rows = dropdown._rows || [];
  const idx = Number(row.dataset.index);
  const suggestion = rows[idx];
  if (!suggestion) {
    return;
  }
  selectSuggestion(suggestion);
});

kbSuggest.addEventListener("click", (event) => {
  event.stopPropagation();
  const item = event.target.closest(".kb-suggest-item");
  if (!item) {
    return;
  }
  keyboardPinned = true;
  const slot = Number(item.dataset.slot);
  const suggestion = predictionSuggestions[slot];
  if (suggestion) {
    selectSuggestion(suggestion);
    return;
  }
  // Generic candidate (only shown before real matches exist) → no-op, keep typing.
  addressInput.focus();
});

editAddressLink.addEventListener("click", (event) => {
  event.preventDefault();
  enterAddressStep();
  addressInput.focus();
});

startShoppingBtn.addEventListener("click", () => {
  window.alert("Continue to Start shopping.");
});

myAccountBtn.addEventListener("click", () => {
  window.alert("Continue to My account.");
});

addressInput.addEventListener("focus", () => {
  keyboardPinned = true;
  activeInput = addressInput;
  updateDropdownPlacement();
  showAddressError(false);
  setFocusState(true);

  const v = addressInput.value.trim();
  if (selectedSuggestion && !selectedUnit) {
    selectSuggestion(selectedSuggestion);
    return;
  }
  if (v.length === 0) {
    renderDropdownRows([]);
    setDropdownMode("helper");
    updatePredictions();
  } else if (latestResults.length > 0) {
    renderDropdownRows(latestResults);
    setDropdownMode("list");
    updatePredictions();
  } else {
    // Re-run the lookup for whatever is already in the field.
    requestSuggestions(addressInput.value);
  }
  showKeyboard(true, addressSection);
});

addressInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    // Keep the field looking active while the inline unit picker is open — the
    // blur there is intentional (to dismiss the OS keyboard), not a real exit.
    const inUnitsMode = dropdown.classList.contains("dropdown-units");
    if (document.activeElement !== addressInput && !inUnitsMode) {
      setFocusState(false);
    }
    if (!keyboardPinned) {
      showKeyboard(false);
      activeInput = null;
    }
  }, 120);
});

keyboard.addEventListener("click", (event) => {
  const keyButton = event.target.closest("[data-key]");
  if (!keyButton || !activeInput) {
    return;
  }

  const key = keyButton.dataset.key;
  keyboardPinned = true;
  const isModeToggle = keyButton === keyboardModeToggle;

  if (isModeToggle && key === "123") {
    applyKeyboardLayout("numeric");
    return;
  }
  if (isModeToggle && key === "ABC") {
    applyKeyboardLayout("alpha");
    return;
  }
  if (!isModeToggle && (key === "123" || key === "ABC")) {
    return;
  }
  if (key === "shift") {
    keyboard.classList.toggle("kb-shift");
    return;
  }
  if (key === "#+=") {
    return;
  }
  if (key === "backspace") {
    activeInput.value = activeInput.value.slice(0, -1);
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.focus();
    return;
  }
  if (key === "return") {
    activeInput.blur();
    keyboardPinned = false;
    showKeyboard(false);
    return;
  }

  // Any character-producing key inserts that actual character (normal keyboard).
  const shifted = keyboard.classList.contains("kb-shift");
  if (shifted) {
    keyboard.classList.remove("kb-shift");
  }
  const ch = key === "space" ? " " : shifted ? key.toUpperCase() : key;
  insertChar(ch);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  const clickedInputOrControl =
    addressField.contains(target) ||
    keyboard.contains(target) ||
    dropdown.contains(target) ||
    target === checkPlansBtn;

  keyboardPinned = clickedInputOrControl;
  if (!clickedInputOrControl) {
    setFocusState(false);
    setDropdownMode("hidden");
    showKeyboard(false);
  }
});

syncAddressInputUI();
updateCtaLabel();
updatePredictions();
window.addEventListener("resize", syncDropdownPlacementIfVisible);
window.addEventListener("scroll", syncDropdownPlacementIfVisible, { passive: true });
phoneViewport.addEventListener("scroll", syncDropdownPlacementIfVisible, { passive: true });
applyKeyboardLayout(keyboardMode);

// Release the freeze the instant the user actually drags with a finger (touchmove,
// not just a tap) so manual scrolling always works. iOS keyboard/autofill drift is
// not a finger drag, so it never reaches here — the page stays frozen and still.
if (isTouchDevice) {
  phoneViewport.addEventListener(
    "touchmove",
    () => {
      if (holdPin) releasePinFreeze();
    },
    { passive: true }
  );
  phoneViewport.addEventListener("scroll", snapBackToFrozen, { passive: true });
  window.addEventListener("scroll", snapBackToFrozen, { passive: true });
}

const requestedPage = getRequestedPageFromUrl();
if (requestedPage === "checking") {
  enterAddressStep();
  enterPlansFlow();
} else if (requestedPage === "active") {
  enterActiveAccountStep();
} else if (requestedPage === "quotes") {
  enterQuotesStep();
} else {
  enterAddressStep();
}
