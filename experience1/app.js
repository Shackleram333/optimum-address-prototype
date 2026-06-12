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

// Experience 1: unified Google + Optimum database. Some buildings are
// multi-dwelling units (MDUs) and carry a `units` count, surfacing an inline
// unit picker right inside the address dropdown.
const ADDRESS_SUGGESTIONS = [
  { line1: "111 Broadway", line2: "New York, NY 10022", units: 172 },
  { line1: "111 Centre Street", line2: "Chinatown, NY 11212" },
  { line1: "111 8th Avenue", line2: "New York, NY 11714", units: 6 },
  { line1: "111 Livingston Street", line2: "Brooklyn, NY 11900" },
  { line1: "111 John Street", line2: "New York, NY 11940" },
  { line1: "1111 Stewart Ave", line2: "Bethpage, NY 11714", units: 56 },
  { line1: "1115 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1119 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1123 Stewart Ave", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Pl", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Place", line2: "Bethpage, NY 11714" },
  { line1: "1111 Stewart Street", line2: "Bethpage, NY 11714" },
  { line1: "1111 Amsterdam Avenue", line2: "New York, NY 10022", units: 47 },
  { line1: "1111 Franklin Avenue", line2: "Garden City, NY 11212" },
].map((s) => ({ ...s, value: `${s.line1}, ${s.line2}` }));

// Figma unit picker: floors 1–14, four units each (A–D) = 56 units.
const UNIT_OPTIONS = (() => {
  const units = [];
  for (let floor = 1; floor <= 14; floor++) {
    for (const letter of ["A", "B", "C", "D"]) {
      units.push(`Apt ${floor}${letter}`);
    }
  }
  return units;
})();

// Demo convenience: every keyboard tap types the next character of this
// address, so the prototype always fills a valid, selectable address no matter
// which key is pressed.
const TARGET_ADDRESS = "1111 Stewart Ave";

const kbSuggest = document.getElementById("kbSuggest");

function nextTargetChar() {
  const cur = addressInput.value;
  if (TARGET_ADDRESS.toLowerCase().startsWith(cur.toLowerCase())) {
    return TARGET_ADDRESS.slice(cur.length, cur.length + 1);
  }
  // Input diverged (e.g. after a selection) — restart the demo string.
  addressInput.value = "";
  return TARGET_ADDRESS.slice(0, 1);
}

function typeNextTargetChar() {
  const ch = nextTargetChar();
  if (ch) {
    addressInput.value += ch;
  }
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

function isMDU(suggestion) {
  return !!(suggestion && suggestion.units);
}

function selectionComplete() {
  return !!selectedSuggestion && (!isMDU(selectedSuggestion) || !!selectedUnit);
}

function fullSelectedAddress() {
  if (!selectedSuggestion) return "";
  if (isMDU(selectedSuggestion) && selectedUnit) {
    return `${selectedSuggestion.line1}, ${selectedUnit}, ${selectedSuggestion.line2}`;
  }
  return selectedSuggestion.value;
}

function updateCtaLabel() {
  if (isMDU(selectedSuggestion) && !selectedUnit) {
    checkPlansBtn.textContent = "Select a unit";
  } else {
    checkPlansBtn.textContent = "Find plans";
  }
}

function selectSuggestion(suggestion) {
  selectedSuggestion = suggestion;
  selectedUnit = "";
  showAddressError(false);
  addressInput.value = suggestion.value;
  syncAddressInputUI();
  updateCtaLabel();

  if (isMDU(suggestion)) {
    // Building selected → show inline unit picker; CTA becomes "Select a unit".
    renderUnitRows(UNIT_OPTIONS);
    setDropdownMode("units");
    setFocusState(true);
    keyboardPinned = true;
    showKeyboard(false);
    return;
  }

  // Single-unit address → confirm in place.
  setDropdownMode("hidden");
  setFocusState(false);
  addressInput.blur();
  keyboardPinned = false;
  showKeyboard(false);
}

function updatePredictions() {
  if (!kbSuggest) return;
  const items = kbSuggest.querySelectorAll(".kb-suggest-item");
  const typed = addressInput.value.trim();
  const matches = getFilteredSuggestions(normalizeQuery(typed)).slice(0, 3);

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

  items.forEach((item, i) => {
    const c = candidates[i] || { label: "", generic: true };
    item.textContent = c.label;
    item.dataset.suggestionIndex =
      c.suggestion ? String(ADDRESS_SUGGESTIONS.indexOf(c.suggestion)) : "";
    item.style.visibility = c.label ? "visible" : "hidden";
  });
}

function setFocusState(active) {
  addressField.classList.toggle("focused", active);
  topScrim.classList.toggle("hidden", !active);
  bottomScrim.classList.add("hidden");
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
  let boundaryTop;
  if (isTouchDevice) {
    // The OS keyboard overlays roughly the lower half of the screen on phones.
    boundaryTop = window.innerHeight * 0.52;
  } else {
    const phoneRect = phone.getBoundingClientRect();
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

function getFilteredSuggestions(query) {
  if (query.length < 3) {
    return [];
  }
  const matchesQuery = (suggestion, q) =>
    suggestion.value.toLowerCase().includes(q) ||
    suggestion.line1.toLowerCase().includes(q) ||
    suggestion.line2.toLowerCase().includes(q);

  const primaryMatches = ADDRESS_SUGGESTIONS.filter((suggestion) =>
    matchesQuery(suggestion, query)
  );
  return primaryMatches.slice(0, 6);
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
  if (mode === "helper") {
    dropdownTitle.textContent = "Enter street, city and zip to see matches...";
  } else if (mode === "units") {
    dropdownTitle.textContent = "Select a unit to continue";
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
    headerLogo.src = "./assets/logo-black.png";
    headerLogo.style.height = "24px";
    return;
  }
  header.classList.remove("header-white");
  header.classList.add("header-blue");
  headerLogo.src = "./assets/logo-white.png";
  headerLogo.style.height = "27px";
}

function showAddressError(show) {
  addressError.classList.toggle("hidden", !show);
  addressField.classList.toggle("error", show);
}

function showKeyboard(show, focusEl) {
  // On touch devices the OS provides the keyboard; never show the simulated one,
  // but still reserve bottom scroll space so content can be scrolled up above
  // the native keyboard.
  if (isTouchDevice) {
    phone.classList.toggle("keyboard-open", !!show);
    updateDropdownMaxHeight();
    if (show) {
      // Pin the search to the top so the blue header scrolls out of view.
      window.setTimeout(() => {
        const delta =
          addressSection.getBoundingClientRect().top -
          phoneViewport.getBoundingClientRect().top;
        phoneViewport.scrollTo({
          top: phoneViewport.scrollTop + delta,
          behavior: "smooth",
        });
        updateDropdownMaxHeight();
      }, 120);
    }
    return;
  }
  if (show) {
    keyboard.classList.remove("hidden");
    phone.classList.add("keyboard-open");
    if (focusEl) {
      window.setTimeout(() => {
        focusEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
  // Home (header/address/hero) stays visible behind the modal's scrim.
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  phoneViewport.scrollTo({ top: 0, behavior: "auto" });
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

addressInput.addEventListener("input", (event) => {
  // Native (phone) typing: any key advances the demo target address, so tapping
  // the number pad still fills "1111 Stewart Ave". (Fake-keyboard taps dispatch a
  // plain Event with no inputType and are already handled by typeNextTargetChar.)
  if (event && typeof event.inputType === "string" && event.inputType.startsWith("insert")) {
    const len = Math.min(addressInput.value.length, TARGET_ADDRESS.length);
    addressInput.value = TARGET_ADDRESS.slice(0, len);
  }

  const v = normalizeQuery(addressInput.value);
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);

  // Typing invalidates any prior selection / unit.
  resetSelection();

  const results = getFilteredSuggestions(v);

  if (results.length > 0) {
    renderDropdownRows(results);
    setDropdownMode("list");
    updatePredictions();
    return;
  }

  // Keep the dropdown as a quiet helper until a few characters are typed.
  renderDropdownRows([]);
  setDropdownMode("helper");
  dropdownTitle.textContent =
    v.length >= 3
      ? "No address matches yet. Keep typing to refine."
      : "Enter street, city and zip to see matches...";
  updatePredictions();
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);
  resetSelection();
  renderDropdownRows([]);
  setDropdownMode("helper");
  updatePredictions();
  addressInput.focus();
});

checkPlansBtn.addEventListener("click", () => {
  const v = normalizeQuery(addressInput.value);

  if (!v) {
    showAddressError(true);
    return;
  }

  // MDU chosen but no unit yet → CTA acts as "Select a unit".
  if (isMDU(selectedSuggestion) && !selectedUnit) {
    setFocusState(true);
    renderUnitRows(UNIT_OPTIONS);
    setDropdownMode("units");
    keyboardPinned = true;
    showKeyboard(false);
    return;
  }

  // Typed a partial address without selecting → surface the list.
  if (!selectedSuggestion) {
    const matches = getFilteredSuggestions(v);
    if (matches.length > 0) {
      renderDropdownRows(matches);
      setDropdownMode("list");
      return;
    }
    showAddressError(true);
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
    selectedUnit = row.dataset.unit;
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
  const sIdx = item.dataset.suggestionIndex;
  if (sIdx !== "" && sIdx != null) {
    const suggestion = ADDRESS_SUGGESTIONS[Number(sIdx)];
    if (suggestion) {
      selectSuggestion(suggestion);
      return;
    }
  }
  // Generic candidate → keep typing the correct address.
  typeNextTargetChar();
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

  const v = normalizeQuery(addressInput.value);
  if (isMDU(selectedSuggestion) && !selectedUnit) {
    renderUnitRows(UNIT_OPTIONS);
    setDropdownMode("units");
    showKeyboard(false);
    return;
  }
  if (v.length === 0) {
    renderDropdownRows([]);
    setDropdownMode("helper");
  } else {
    const results = getFilteredSuggestions(v);
    renderDropdownRows(results);
    setDropdownMode(results.length ? "list" : "helper");
  }
  updatePredictions();
  showKeyboard(true, addressSection);
});

addressInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (document.activeElement !== addressInput) {
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

  // Any character-producing key types the next character of the correct address.
  if (keyboard.classList.contains("kb-shift")) {
    keyboard.classList.remove("kb-shift");
  }
  typeNextTargetChar();
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
