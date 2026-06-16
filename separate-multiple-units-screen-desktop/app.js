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

// Apartment (separate) step.
const aptBand = document.getElementById("aptBand");
const aptField = document.getElementById("aptField");
const aptInput = document.getElementById("aptInput");
const clearApt = document.getElementById("clearApt");
const aptDropdown = document.getElementById("aptDropdown");
const aptDropdownTitle = document.getElementById("aptDropdownTitle");
const aptCheckBtn = document.getElementById("aptCheckBtn");
const aptError = document.getElementById("aptError");
const aptAddressLine = document.getElementById("aptAddressLine");
const editAddressLink = document.getElementById("editAddressLink");

let selectedAddress = null; // resolved full address string once chosen
let selectedBuilding = null; // chosen suggestion object (may be MDU)
let selectedUnit = null;
let currentRows = []; // parallel data for the home address dropdown
let currentUnitRows = []; // parallel data for the apt dropdown
let checkingTimer = null;
let currentPage = "address";

const ADDRESS_SUGGESTIONS = [
  { line1: "111 Broadway", line2: "New York, NY 10022", units: 172 },
  { line1: "111 Centre Street", line2: "Chinatown, NY 11212" },
  { line1: "111 8th Avenue", line2: "New York, NY 11714", units: 6 },
  { line1: "111 Livingston Street", line2: "Brooklyn, NY 11900" },
  { line1: "111 John Street", line2: "New York, NY 11940" },
  { line1: "1111 Amsterdam Avenue", line2: "New York, NY, USA", figma1111: true },
  { line1: "1111 Park Avenue", line2: "New York, NY, USA", figma1111: true },
  { line1: "1111 3rd Avenue", line2: "New York, NY, USA", figma1111: true },
  { line1: "1111 Franklin Avenue", line2: "Garden City, NY, USA", figma1111: true },
  { line1: "1111 Marcus Avenue", line2: "North New Hyde Park, NY, USA", figma1111: true },
  { line1: "1111 6th Avenue", line2: "New York, NY, USA", figmaS: true },
  { line1: "1111 Secaucus Road", line2: "Secaucus, NJ, USA", figmaS: true },
  { line1: "1111 73rd Street", line2: "North Bergen, NJ, USA", figmaS: true },
  { line1: "1111 2nd Avenue", line2: "New York, NY, USA", figmaS: true },
  { line1: "1111 Southern Boulevard", line2: "The Bronx, NY, USA", figmaS: true },
  { line1: "1111 Stewart Ave", line2: "Bethpage, NY 11714", units: 56 },
  { line1: "1115 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1119 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1123 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Pl", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Place", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Street", line2: "Bethpage, NY 11714" },
].map((s) => ({ ...s, value: `${s.line1}, ${s.line2}` }));

const UNIT_NONE = "__none__";

function buildUnitOptions(count) {
  const total = Number(count) > 0 ? Number(count) : 56;
  const letters = ["A", "B", "C", "D"];
  const units = [];
  for (let i = 0; i < total; i++) {
    const floor = Math.floor(i / letters.length) + 1;
    units.push(`Apt ${floor}${letters[i % letters.length]}`);
  }
  return units;
}

const FALLBACK_STREETS = [
  "Main Street", "Oak Avenue", "Maple Drive", "Washington Avenue", "Park Place",
  "Lincoln Boulevard", "Cedar Lane", "Highland Avenue", "Sunset Drive", "Riverside Drive",
];
const FALLBACK_CITIES = ["New York, NY", "Brooklyn, NY", "Newark, NJ", "Yonkers, NY", "Stamford, CT"];

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

function generateRealisticMatches(query) {
  const parts = query.match(/^(\d+)\s*(.*)$/);
  const number = parts ? parts[1] : "";
  const streetText = (parts ? parts[2] : query).trim().toLowerCase();
  let streets = FALLBACK_STREETS;
  if (streetText) {
    const narrowed = FALLBACK_STREETS.filter((s) => s.toLowerCase().includes(streetText));
    streets = narrowed.length ? narrowed : FALLBACK_STREETS;
  }
  return streets.slice(0, 5).map((street, i) => {
    const line1 = number ? `${number} ${street}` : street;
    const line2 = `${FALLBACK_CITIES[i % FALLBACK_CITIES.length]}, USA`;
    return { line1, line2, value: `${line1}, ${line2}` };
  });
}

function getFilteredSuggestions(query) {
  if (query.length < 3) return [];
  const matchesQuery = (s, q) =>
    s.value.toLowerCase().includes(q) ||
    s.line1.toLowerCase().includes(q) ||
    s.line2.toLowerCase().includes(q);

  if (query.startsWith("1111") && !query.startsWith("1111 st")) {
    const flag = query.startsWith("1111 s") ? "figmaS" : "figma1111";
    return ADDRESS_SUGGESTIONS.filter((s) => s[flag]);
  }
  const primary = ADDRESS_SUGGESTIONS.filter((s) => matchesQuery(s, query));
  if (primary.length > 0) return primary.slice(0, 6);
  return generateRealisticMatches(query);
}

// Separate flow: the address dropdown lists addresses only (units are picked
// on their own step afterwards).
function getAddressRows(query) {
  return getFilteredSuggestions(query).map((s) => ({ type: "address", ...s }));
}

function setFocusState(active) {
  addressField.classList.toggle("focused", active);
  scrim.classList.toggle("hidden", !(active && currentPage === "address"));
}
function setAptFocusState(active) {
  aptField.classList.toggle("focused", active);
  scrim.classList.toggle("hidden", !(active && currentPage === "apt"));
}

function showAddressError(show) {
  addressError.classList.toggle("hidden", !show);
  addressField.classList.toggle("error", show);
}
function showAptError(show) {
  aptError.classList.toggle("hidden", !show);
  aptField.classList.toggle("error", show);
}

function syncInputUI() { clearAddress.classList.toggle("hidden", addressInput.value.length === 0); }
function syncAptUI() { clearApt.classList.toggle("hidden", aptInput.value.length === 0); }

/* ---------- Address dropdown ---------- */
function setDropdownMode(mode) {
  if (mode === "hidden") { dropdown.classList.add("hidden"); return; }
  dropdown.classList.remove("hidden");
  if (mode === "helper") {
    dropdownTitle.textContent =
      normalizeQuery(addressInput.value).length >= 3
        ? "No address matches yet. Keep typing to refine."
        : "Keep typing to see matches...";
  } else {
    dropdownTitle.textContent = "Select an address to continue...";
  }
}

function renderRows(rows) {
  dropdown.querySelectorAll(".dropdown-row").forEach((r) => r.remove());
  currentRows = rows;
  rows.forEach((row, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dropdown-row";
    btn.dataset.index = String(index);
    btn.innerHTML = `
      <img class="pin-mini" src="./assets/icon-pin-blue.svg" alt="" />
      <span>${row.line1}</span><small>${row.line2}</small>`;
    dropdown.appendChild(btn);
  });
}

function refreshDropdown() {
  const q = normalizeQuery(addressInput.value);
  const rows = getAddressRows(q);
  if (rows.length > 0) { renderRows(rows); setDropdownMode("list"); }
  else { renderRows([]); setDropdownMode("helper"); }
}

function chooseAddress(row) {
  selectedBuilding = row;
  showAddressError(false);
  setDropdownMode("hidden");
  setFocusState(false);
  if (row.units) {
    // Multi-dwelling unit → go to the dedicated apartment step.
    addressInput.value = row.value;
    syncInputUI();
    enterAptStep(row);
    return;
  }
  selectedAddress = row.value;
  addressInput.value = row.value;
  syncInputUI();
  addressInput.blur();
}

/* ---------- Apartment dropdown ---------- */
function getUnitRows(building, query) {
  const all = buildUnitOptions(building.units);
  const q = normalizeQuery(query);
  const filtered = q ? all.filter((u) => u.toLowerCase().includes(q)) : all;
  const rows = filtered.map((unit) => ({ type: "unit", unit }));
  rows.push({ type: "unit-none" });
  return rows;
}

function renderUnitRows(rows) {
  aptDropdown.querySelectorAll(".dropdown-row").forEach((r) => r.remove());
  currentUnitRows = rows;
  rows.forEach((row, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dropdown-row";
    btn.dataset.index = String(index);
    if (row.type === "unit-none") {
      btn.classList.add("unit-row-none");
      btn.innerHTML = `<span>I don't see my unit here</span>`;
    } else {
      btn.innerHTML = `<span>${row.unit}</span>`;
    }
    aptDropdown.appendChild(btn);
  });
}

function refreshAptDropdown() {
  if (!selectedBuilding) return;
  const rows = getUnitRows(selectedBuilding, aptInput.value);
  renderUnitRows(rows);
  aptDropdown.classList.remove("hidden");
  aptDropdownTitle.textContent = "Select your unit to continue...";
}

function chooseUnit(row) {
  if (row.type === "unit-none") {
    selectedUnit = UNIT_NONE;
    selectedAddress = selectedBuilding.value;
    aptInput.value = "No specific unit";
  } else {
    selectedUnit = row.unit;
    selectedAddress = `${selectedBuilding.line1}, ${row.unit}, ${selectedBuilding.line2}`;
    aptInput.value = row.unit;
  }
  syncAptUI();
  showAptError(false);
  aptDropdown.classList.add("hidden");
  setAptFocusState(false);
  aptInput.blur();
}

/* ---------- Steps ---------- */
function enterAptStep(building) {
  selectedUnit = null;
  selectedAddress = null;
  checkBand.classList.add("hidden");
  aptBand.classList.remove("hidden");
  aptAddressLine.textContent = building.value;
  aptInput.value = "";
  syncAptUI();
  showAptError(false);
  aptDropdown.classList.add("hidden");
  currentPage = "apt";
  window.scrollTo({ top: 0, behavior: "auto" });
}

function enterCheckingFlow() {
  setDropdownMode("hidden");
  aptDropdown.classList.add("hidden");
  setFocusState(false);
  setAptFocusState(false);
  showAddressError(false);
  showAptError(false);
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
  aptBand.classList.add("hidden");
  heroBento.classList.add("hidden");
  siteFooter.classList.add("hidden");
  scrim.classList.add("hidden");
  setDropdownMode("hidden");
  quotesAddress.textContent = selectedAddress || "1111 Stewart Ave, Bethpage, NY 11714";
  quotesSection.classList.remove("hidden");
  currentPage = "quotes";
  window.scrollTo({ top: 0, behavior: "auto" });
}

function enterAddressStep() {
  if (checkingTimer) { window.clearTimeout(checkingTimer); checkingTimer = null; }
  hideCheckModal();
  quotesSection.classList.add("hidden");
  aptBand.classList.add("hidden");
  checkBand.classList.remove("hidden");
  heroBento.classList.remove("hidden");
  siteFooter.classList.remove("hidden");
  setDropdownMode("hidden");
  aptDropdown.classList.add("hidden");
  setFocusState(false);
  setAptFocusState(false);
  showAddressError(false);
  showAptError(false);
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
  aptInput.value = "";
  selectedAddress = null;
  selectedBuilding = null;
  selectedUnit = null;
  syncInputUI();
  syncAptUI();
  enterAddressStep();
}

/* ---------- Events: address ---------- */
addressInput.addEventListener("paste", (e) => e.preventDefault());
addressInput.addEventListener("drop", (e) => e.preventDefault());
addressInput.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") e.preventDefault();
});
addressInput.addEventListener("input", () => {
  syncInputUI();
  showAddressError(false);
  selectedAddress = null;
  selectedBuilding = null;
  refreshDropdown();
});
addressInput.addEventListener("focus", () => {
  setFocusState(true);
  showAddressError(false);
  refreshDropdown();
});
addressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); checkBtn.click(); }
});
clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  selectedAddress = null; selectedBuilding = null;
  syncInputUI();
  showAddressError(false);
  refreshDropdown();
  addressInput.focus();
});
dropdown.addEventListener("click", (event) => {
  event.stopPropagation();
  const rowEl = event.target.closest(".dropdown-row");
  if (!rowEl) return;
  const row = currentRows[Number(rowEl.dataset.index)];
  if (row) chooseAddress(row);
});
checkBtn.addEventListener("click", () => {
  const q = normalizeQuery(addressInput.value);
  if (!q) { showAddressError(true); return; }
  if (selectedAddress) { enterCheckingFlow(); return; }
  const rows = getAddressRows(q);
  if (rows.length > 0) { renderRows(rows); setDropdownMode("list"); setFocusState(true); return; }
  showAddressError(true);
});

/* ---------- Events: apartment ---------- */
aptInput.addEventListener("input", () => {
  syncAptUI();
  showAptError(false);
  selectedUnit = null;
  selectedAddress = null;
  refreshAptDropdown();
});
aptInput.addEventListener("focus", () => {
  setAptFocusState(true);
  showAptError(false);
  refreshAptDropdown();
});
aptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); aptCheckBtn.click(); }
});
clearApt.addEventListener("click", () => {
  aptInput.value = "";
  selectedUnit = null; selectedAddress = null;
  syncAptUI();
  showAptError(false);
  refreshAptDropdown();
  aptInput.focus();
});
aptDropdown.addEventListener("click", (event) => {
  event.stopPropagation();
  const rowEl = event.target.closest(".dropdown-row");
  if (!rowEl) return;
  const row = currentUnitRows[Number(rowEl.dataset.index)];
  if (row) chooseUnit(row);
});
aptCheckBtn.addEventListener("click", () => {
  if (selectedAddress) { enterCheckingFlow(); return; }
  showAptError(true);
});
editAddressLink.addEventListener("click", (e) => {
  e.preventDefault();
  enterAddressStep();
  addressInput.focus();
});

heroCardLink.addEventListener("click", (e) => {
  e.preventDefault();
  addressInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* ---------- Outside click ---------- */
document.addEventListener("click", (event) => {
  if (currentPage === "address") {
    const inControls = addressField.contains(event.target) || dropdown.contains(event.target) || event.target === checkBtn;
    if (!inControls) { setFocusState(false); setDropdownMode("hidden"); }
  } else if (currentPage === "apt") {
    const inControls = aptField.contains(event.target) || aptDropdown.contains(event.target) || event.target === aptCheckBtn;
    if (!inControls) { setAptFocusState(false); aptDropdown.classList.add("hidden"); }
  }
});

/* ---------- End of prototype ---------- */
quotesSection.addEventListener("click", (event) => {
  if (currentPage === "quotes" && !event.target.closest("a, button")) showEndPrototype();
});
quotesCart.addEventListener("click", () => { if (currentPage === "quotes") showEndPrototype(); });
endPrototype.addEventListener("click", (event) => { event.stopPropagation(); restartPrototype(); });

syncInputUI();
syncAptUI();

const requestedPage = new URLSearchParams(window.location.search).get("page");
if (requestedPage === "quotes" || requestedPage === "plans") {
  selectedAddress = "1111 Stewart Ave, Apt 1A, Bethpage, NY 11714";
  enterQuotes();
} else {
  enterAddressStep();
}
