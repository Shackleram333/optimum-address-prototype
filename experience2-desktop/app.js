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

let selectedAddress = null; // resolved full address string once chosen
let currentRows = []; // parallel data for the rendered dropdown rows
let checkingTimer = null;
let currentPage = "address";

// Same curated address dataset as the mobile Experience 2.
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

// Desktop inline behaviour (matches the Figma dropdown): when the typed query
// resolves to a multi-dwelling building, surface that building's units directly
// as selectable rows. Otherwise show the normal address list.
function getDropdownRows(query) {
  const base = getFilteredSuggestions(query);
  const mdu = base.find((s) => s.units);
  if (mdu) {
    const rows = buildUnitOptions(mdu.units).map((unit) => ({
      type: "unit",
      building: mdu,
      unit,
      line1: `${mdu.line1}, ${unit}`,
      line2: mdu.line2,
    }));
    rows.push({ type: "unit-none", building: mdu, line1: "I don't see my unit here", line2: "" });
    return rows;
  }
  return base.map((s) => ({ type: "address", ...s }));
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
  if (mode === "helper") {
    dropdownTitle.textContent =
      normalizeQuery(addressInput.value).length >= 3
        ? "No address matches yet. Keep typing to refine."
        : "Keep typing to see matches...";
  } else if (mode === "units") {
    dropdownTitle.textContent = "Select a unit to continue...";
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
    if (row.type === "unit-none") {
      btn.classList.add("unit-row-none");
      btn.innerHTML = `<span>${row.line1}</span>`;
    } else {
      btn.innerHTML = `
        <img class="pin-mini" src="./assets/icon-pin-blue.svg" alt="" />
        <span>${row.line1}</span><small>${row.line2}</small>`;
    }
    dropdown.appendChild(btn);
  });
}

function refreshDropdown() {
  const q = normalizeQuery(addressInput.value);
  const rows = getDropdownRows(q);
  if (rows.length > 0) {
    renderRows(rows);
    setDropdownMode(rows[0].type === "address" ? "list" : "units");
  } else {
    renderRows([]);
    setDropdownMode("helper");
  }
}

function chooseRow(row) {
  if (row.type === "address") {
    selectedAddress = row.value;
    addressInput.value = row.value;
  } else if (row.type === "unit") {
    selectedAddress = `${row.building.line1}, ${row.unit}, ${row.building.line2}`;
    addressInput.value = selectedAddress;
  } else if (row.type === "unit-none") {
    selectedAddress = row.building.value;
    addressInput.value = row.building.value;
  }
  syncInputUI();
  showAddressError(false);
  setDropdownMode("hidden");
  setFocusState(false);
  addressInput.blur();
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
  quotesAddress.textContent = selectedAddress || "1111 Stewart Ave, Bethpage, NY 11714";
  quotesSection.classList.remove("hidden");
  currentPage = "quotes";
  window.scrollTo({ top: 0, behavior: "auto" });
}

function enterAddressStep() {
  if (checkingTimer) { window.clearTimeout(checkingTimer); checkingTimer = null; }
  hideCheckModal();
  quotesSection.classList.add("hidden");
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
  selectedAddress = null;
  syncInputUI();
  enterAddressStep();
}

/* ---------- Events ---------- */
addressInput.addEventListener("paste", (e) => e.preventDefault());
addressInput.addEventListener("drop", (e) => e.preventDefault());
addressInput.addEventListener("beforeinput", (e) => {
  if (e.inputType === "insertFromPaste" || e.inputType === "insertFromDrop") e.preventDefault();
});

addressInput.addEventListener("input", () => {
  syncInputUI();
  showAddressError(false);
  selectedAddress = null;
  refreshDropdown();
});

addressInput.addEventListener("focus", () => {
  setFocusState(true);
  showAddressError(false);
  refreshDropdown();
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  selectedAddress = null;
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
  if (row) chooseRow(row);
});

checkBtn.addEventListener("click", () => {
  const q = normalizeQuery(addressInput.value);
  if (!q) { showAddressError(true); return; }
  if (selectedAddress) { enterCheckingFlow(); return; }
  const rows = getDropdownRows(q);
  if (rows.length > 0) {
    renderRows(rows);
    setDropdownMode(rows[0].type === "address" ? "list" : "units");
    setFocusState(true);
    return;
  }
  showAddressError(true);
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

const requestedPage = new URLSearchParams(window.location.search).get("page");
if (requestedPage === "quotes" || requestedPage === "plans") {
  selectedAddress = "1111 Stewart Ave, Apt 1A, Bethpage, NY 11714";
  enterQuotes();
} else {
  enterAddressStep();
}
