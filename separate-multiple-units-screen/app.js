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
const kbSuggest = document.getElementById("kbSuggest");

const aptSection = document.getElementById("aptSection");
const checkingSection = document.getElementById("checkingSection");
const activeAccountSection = document.getElementById("activeAccountSection");
const activeAddressText = document.getElementById("activeAddressText");
const editAddressLink = document.getElementById("editAddressLink");
const startShoppingBtn = document.getElementById("startShoppingBtn");
const myAccountBtn = document.getElementById("myAccountBtn");
const aptInput = document.getElementById("aptInput");
const aptField = document.getElementById("aptField");
const clearApt = document.getElementById("clearApt");
const aptDropdown = document.getElementById("aptDropdown");
const aptError = document.getElementById("aptError");
const findPlansAptBtn = document.getElementById("findPlansAptBtn");
const footer = document.getElementById("footer");
const plansModal = document.getElementById("plansModal");
const plansModalText = document.getElementById("plansModalText");
const quotesSection = document.getElementById("quotesSection");
const endPrototype = document.getElementById("endPrototype");

// Phones / touchscreens use the real OS keyboard; the simulated (Figma) keyboard
// is only for pointer devices (laptop/desktop) where there is no OS keyboard.
const isTouchDevice =
  (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
  "ontouchstart" in window ||
  navigator.maxTouchPoints > 0;

let keyboardPinned = false;
let activeInput = null;
let keyboardMode = "numeric";
let selectedAddress = "";
let selectedApartment = "";
let checkingTimer = null;
let currentPage = "address";

// Sentinel for the "I don't see my unit here" option — lets the flow proceed on
// the building address without a specific apartment.
const UNIT_NONE = "__none__";

function setPageInUrl(page) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", page);
  window.history.replaceState({}, "", url);
}

function normalizePageName(rawPage) {
  const value = (rawPage || "").trim().toLowerCase();
  if (["address", "home"].includes(value)) return "address";
  if (["checking", "checking-address", "loading"].includes(value)) return "checking";
  if (["apartment", "apartments", "apt"].includes(value)) return "apartment";
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

// Unified Google + Optimum database. Some buildings are multi-dwelling units
// (MDUs) and carry a `units` count, surfaced as a "(N units...)" hint in the
// dropdown. Selecting any address routes through the separate apartment screen.
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

const APARTMENT_OPTIONS = [
  "Apt 1A",
  "Apt 1B",
  "Apt 1C",
  "Apt 1D",
  "Apt 2A",
  "Apt 2B",
  "Apt 2C",
  "Apt 2D",
  "Apt 3A",
  "Apt 3B",
  "Apt 3C",
  "Apt 3D",
  "Unit 4",
  "Unit 5",
];

function insertChar(ch) {
  if (!ch || !activeInput) return;
  activeInput.value += ch;
  activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  activeInput.focus();
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

let predictionSuggestions = [];

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

  predictionSuggestions = candidates.map((c) => c.suggestion || null);

  items.forEach((item, i) => {
    const c = candidates[i] || { label: "", generic: true };
    item.textContent = c.label;
    item.dataset.slot = String(i);
    item.style.visibility = c.label ? "visible" : "hidden";
  });
}

function hideKbSuggest() {
  if (!kbSuggest) return;
  predictionSuggestions = [];
  kbSuggest.querySelectorAll(".kb-suggest-item").forEach((item) => {
    item.textContent = "";
    item.style.visibility = "hidden";
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
  let boundaryTop;
  if (isTouchDevice) {
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

function getFilteredSuggestions(query) {
  if (query.length < 3) {
    return [];
  }
  const matchesQuery = (suggestion, q) =>
    suggestion.value.toLowerCase().includes(q) ||
    suggestion.line1.toLowerCase().includes(q) ||
    suggestion.line2.toLowerCase().includes(q);

  // Two curated Figma states for the "1111" house number: the bare number shows
  // one list, and starting the street ("1111 S") shows another. The target
  // "Stewart" results stay hidden until the query is specific enough ("1111 St").
  if (query.startsWith("1111") && !query.startsWith("1111 st")) {
    const flag = query.startsWith("1111 s") ? "figmaS" : "figma1111";
    return ADDRESS_SUGGESTIONS.filter((s) => s[flag]);
  }

  const primaryMatches = ADDRESS_SUGGESTIONS.filter((suggestion) =>
    matchesQuery(suggestion, query)
  );
  if (primaryMatches.length > 0) {
    return primaryMatches.slice(0, 6);
  }

  // No curated match: synthesize realistic-looking suggestions from what was
  // typed, so the customer always sees plausible results (without exposing any
  // real personal data). The intended target stays "1111 Stewart Ave".
  return generateRealisticMatches(query);
}

const FALLBACK_STREETS = [
  "Main Street",
  "Oak Avenue",
  "Maple Drive",
  "Washington Avenue",
  "Park Place",
  "Lincoln Boulevard",
  "Cedar Lane",
  "Highland Avenue",
  "Sunset Drive",
  "Riverside Drive",
];
const FALLBACK_CITIES = [
  "New York, NY",
  "Brooklyn, NY",
  "Newark, NJ",
  "Yonkers, NY",
  "Stamford, CT",
];

function generateRealisticMatches(query) {
  const parts = query.match(/^(\d+)\s*(.*)$/);
  const number = parts ? parts[1] : "";
  const streetText = (parts ? parts[2] : query).trim().toLowerCase();

  let streets = FALLBACK_STREETS;
  if (streetText) {
    const narrowed = FALLBACK_STREETS.filter((s) =>
      s.toLowerCase().includes(streetText)
    );
    streets = narrowed.length ? narrowed : FALLBACK_STREETS;
  }

  return streets.slice(0, 5).map((street, i) => {
    const line1 = number ? `${number} ${street}` : street;
    const line2 = `${FALLBACK_CITIES[i % FALLBACK_CITIES.length]}, USA`;
    return { line1, line2, value: `${line1}, ${line2}` };
  });
}

function renderDropdownRows(rows) {
  dropdownRowsHost.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
  rows.forEach((suggestion, index) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row";
    row.dataset.index = String(index);
    row.innerHTML = `
      <img class="pin-mini" src="./assets/icon-pin-blue.svg" alt="" />
      <span>${suggestion.line1}</span><small>${suggestion.line2}</small>
    `;
    dropdownRowsHost.appendChild(row);
  });
  // Keep a reference to the rendered set for click resolution.
  dropdown._rows = rows;
}

// mode: "hidden" | "helper" | "list"
function setDropdownMode(mode) {
  if (mode === "hidden") {
    dropdown.classList.add("hidden");
    return;
  }
  updateDropdownPlacement();
  dropdown.classList.remove("hidden");
  dropdown.classList.toggle("helper-only", mode === "helper");
  if (mode === "helper") {
    dropdownTitle.textContent = "Keep typing to see matches...";
  } else {
    dropdownTitle.textContent = "Select an address to continue...";
  }
  window.requestAnimationFrame(updateDropdownMaxHeight);
}

function selectSuggestion(suggestion) {
  if (!suggestion) return;
  selectedAddress = suggestion.value;
  showAddressError(false);
  addressInput.value = suggestion.value;
  syncAddressInputUI();
  // Selecting a suggestion confirms in place; the apartment screen comes after
  // "Find plans" → checking.
  setDropdownMode("hidden");
  setFocusState(false);
  addressInput.blur();
  keyboardPinned = false;
  showKeyboard(false);
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

function syncAptInputUI() {
  clearApt.classList.toggle("hidden", aptInput.value.length === 0);
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

function showAptError(show) {
  aptError.classList.toggle("hidden", !show);
  aptField.classList.toggle("error", show);
  aptInput.placeholder = show ? "Apartment or Unit" : "Select apartment or unit";
}

function getFilteredApartments(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) {
    return APARTMENT_OPTIONS;
  }
  return APARTMENT_OPTIONS.filter((option) =>
    option.toLowerCase().includes(normalized)
  );
}

function renderAptDropdownRows(rows) {
  aptDropdown.innerHTML = "";
  rows.forEach((option) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row apt-dropdown-row";
    row.dataset.apartment = option;
    row.innerHTML = `<span>${option}</span>`;
    aptDropdown.appendChild(row);
  });
  const noneRow = document.createElement("button");
  noneRow.type = "button";
  noneRow.className = "dropdown-row apt-dropdown-row apt-dropdown-row-none";
  noneRow.dataset.apartmentNone = "true";
  noneRow.innerHTML = `<span>I don't see my unit here</span>`;
  aptDropdown.appendChild(noneRow);
}

function setAptDropdownVisible(show) {
  aptDropdown.classList.toggle("hidden", !show);
  if (show) {
    window.requestAnimationFrame(updateAptDropdownMaxHeight);
  }
}

function updateAptDropdownMaxHeight() {
  if (aptDropdown.classList.contains("hidden")) {
    return;
  }
  const phoneRect = phone.getBoundingClientRect();
  const dropdownRect = aptDropdown.getBoundingClientRect();
  let boundaryTop;
  if (isTouchDevice) {
    // Clamp to the visible viewport height (window.innerHeight is stable and
    // doesn't shrink while the keyboard dismisses, unlike visualViewport),
    // leaving a gap so the last rows clear the browser's bottom URL bar.
    boundaryTop = Math.min(phoneRect.bottom, window.innerHeight) - 72;
  } else {
    boundaryTop = keyboard.classList.contains("hidden")
      ? phoneRect.bottom
      : keyboard.getBoundingClientRect().top;
  }
  const availableHeight = Math.max(120, Math.floor(boundaryTop - dropdownRect.top - 6));
  aptDropdown.style.maxHeight = `${availableHeight}px`;
}

function showKeyboard(show, focusEl) {
  // On touch devices the OS provides the keyboard; never show the simulated one,
  // but still reserve bottom scroll space so content can be scrolled up above
  // the native keyboard.
  if (isTouchDevice) {
    phone.classList.toggle("keyboard-open", !!show);
    updateDropdownMaxHeight();
    updateAptDropdownMaxHeight();
    if (show) {
      // Pin the focused section to the top so the blue header scrolls out of view.
      const pinEl = focusEl || addressSection;
      window.setTimeout(() => {
        const delta =
          pinEl.getBoundingClientRect().top -
          phoneViewport.getBoundingClientRect().top;
        phoneViewport.scrollTo({
          top: phoneViewport.scrollTop + delta,
          behavior: "smooth",
        });
        updateDropdownMaxHeight();
        updateAptDropdownMaxHeight();
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
        updateAptDropdownMaxHeight();
      }, 60);
    }
    window.setTimeout(updateDropdownPlacement, 140);
    window.setTimeout(updateDropdownMaxHeight, 140);
    window.setTimeout(updateAptDropdownMaxHeight, 140);
    return;
  }
  keyboard.classList.add("hidden");
  phone.classList.remove("keyboard-open");
  updateDropdownMaxHeight();
  updateAptDropdownMaxHeight();
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

function enterAddressStep() {
  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
    checkingTimer = null;
  }
  setHeaderVariant("blue");
  header.classList.remove("hidden");
  addressSection.classList.remove("hidden");
  heroSection.classList.remove("hidden");
  aptSection.classList.add("hidden");
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  footer.classList.add("hidden");
  dropdown.classList.add("hidden");
  aptField.classList.remove("focused");
  showAddressError(false);
  setFocusState(false);
  keyboardPinned = false;
  showKeyboard(false);
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("address");
}

function enterAptStep() {
  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
    checkingTimer = null;
  }
  setHeaderVariant("white");
  header.classList.remove("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  aptSection.classList.remove("hidden");
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  footer.classList.remove("hidden");
  dropdown.classList.add("hidden");
  setFocusState(false);
  hideKbSuggest();
  showAptError(false);
  selectedApartment = "";
  aptInput.value = "";
  syncAptInputUI();
  renderAptDropdownRows(APARTMENT_OPTIONS);
  setAptDropdownVisible(true);
  aptField.classList.add("focused");
  keyboardPinned = true;
  activeInput = aptInput;
  showKeyboard(true, aptSection);
  window.setTimeout(() => {
    aptInput.focus();
  }, 0);
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("apartment");
}

function enterCheckingStep(autoAdvance = true) {
  setDropdownMode("hidden");
  setFocusState(false);
  aptField.classList.remove("focused");
  showAddressError(false);
  keyboardPinned = false;
  showKeyboard(false);
  header.classList.add("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  aptSection.classList.add("hidden");
  footer.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  quotesSection.classList.add("hidden");
  checkingSection.classList.remove("hidden");
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("checking");

  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
  }
  if (autoAdvance) {
    checkingTimer = window.setTimeout(() => {
      checkingTimer = null;
      enterAptStep();
    }, 2600);
  }
}

function enterFindingPlansStep() {
  setAptDropdownVisible(false);
  aptField.classList.remove("focused");
  keyboardPinned = false;
  showKeyboard(false);
  activeInput = null;

  plansModal.classList.remove("hidden", "is-success");
  plansModal.setAttribute("aria-hidden", "false");
  plansModalText.textContent = "Finding plans...";

  if (checkingTimer) {
    window.clearTimeout(checkingTimer);
  }
  checkingTimer = window.setTimeout(() => {
    plansModal.classList.add("is-success");
    plansModalText.textContent = "Plans found!";
    checkingTimer = window.setTimeout(() => {
      checkingTimer = null;
      plansModal.classList.add("hidden");
      plansModal.classList.remove("is-success");
      plansModal.setAttribute("aria-hidden", "true");
      enterQuotesStep();
    }, 1400);
  }, 1700);
}

function enterActiveAccountStep() {
  header.classList.add("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  aptSection.classList.add("hidden");
  checkingSection.classList.add("hidden");
  footer.classList.add("hidden");
  setDropdownMode("hidden");
  setAptDropdownVisible(false);
  aptField.classList.remove("focused");
  showKeyboard(false);
  activeInput = null;
  keyboardPinned = false;

  const rawUnit = selectedApartment || aptInput.value.trim();
  const selectedUnit = rawUnit === UNIT_NONE ? "" : rawUnit;
  const upperAddress = `${selectedAddress || "1111 STEWART AVE, BETHPAGE, NY 11714"} ${selectedUnit}`.trim();
  activeAddressText.textContent = upperAddress.toUpperCase().replaceAll(",", "");

  activeAccountSection.classList.remove("hidden");
  phoneViewport.scrollTo({ top: 0, behavior: "smooth" });
  setCurrentPage("active");
}

function enterQuotesStep() {
  header.classList.add("hidden");
  addressSection.classList.add("hidden");
  heroSection.classList.add("hidden");
  aptSection.classList.add("hidden");
  checkingSection.classList.add("hidden");
  activeAccountSection.classList.add("hidden");
  footer.classList.add("hidden");
  setDropdownMode("hidden");
  setAptDropdownVisible(false);
  aptField.classList.remove("focused");
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
  selectedAddress = "";
  selectedApartment = "";
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

endPrototype.addEventListener("click", (event) => {
  event.stopPropagation();
  restartPrototype();
});

// Block paste / drag-and-drop into the address field so input always flows
// through the demo's curated suggestion logic.
addressInput.addEventListener("paste", (event) => event.preventDefault());
addressInput.addEventListener("drop", (event) => event.preventDefault());
addressInput.addEventListener("beforeinput", (event) => {
  if (event.inputType === "insertFromPaste" || event.inputType === "insertFromDrop") {
    event.preventDefault();
  }
});

addressInput.addEventListener("input", () => {
  const v = normalizeQuery(addressInput.value);
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);

  // Typing invalidates any prior selection.
  selectedAddress = "";

  const results = getFilteredSuggestions(v);

  if (results.length > 0) {
    renderDropdownRows(results);
    setDropdownMode("list");
    updatePredictions();
    return;
  }

  renderDropdownRows([]);
  setDropdownMode("helper");
  dropdownTitle.textContent =
    v.length >= 3
      ? "No address matches yet. Keep typing to refine."
      : "Keep typing to see matches...";
  updatePredictions();
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  syncAddressInputUI();
  syncKeyboardModeForInput();
  showAddressError(false);
  selectedAddress = "";
  renderDropdownRows([]);
  setDropdownMode("helper");
  updatePredictions();
  addressInput.focus();
});

checkPlansBtn.addEventListener("click", () => {
  const v = normalizeQuery(addressInput.value);
  setDropdownMode("hidden");

  if (!v) {
    showAddressError(true);
    return;
  }

  // Typed a partial address without selecting → surface the list.
  if (!selectedAddress) {
    const matches = getFilteredSuggestions(v);
    if (matches.length > 0) {
      renderDropdownRows(matches);
      setDropdownMode("list");
      return;
    }
    showAddressError(true);
    return;
  }

  enterCheckingStep();
});

dropdown.addEventListener("click", (event) => {
  // Keep dropdown interactions from reaching the document-level outside-click
  // handler.
  event.stopPropagation();
  const row = event.target.closest(".dropdown-row");
  if (!row) {
    return;
  }
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

findPlansAptBtn.addEventListener("click", () => {
  if (!selectedApartment) {
    showAptError(true);
    setAptDropdownVisible(true);
    return;
  }
  showAptError(false);
  enterFindingPlansStep();
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

aptInput.addEventListener("input", () => {
  showAptError(false);
  selectedApartment = "";
  syncAptInputUI();
  renderAptDropdownRows(getFilteredApartments(aptInput.value));
  setAptDropdownVisible(true);
});

clearApt.addEventListener("click", () => {
  aptInput.value = "";
  selectedApartment = "";
  syncAptInputUI();
  showAptError(false);
  renderAptDropdownRows(APARTMENT_OPTIONS);
  setAptDropdownVisible(true);
  aptInput.focus();
});

addressInput.addEventListener("focus", () => {
  keyboardPinned = true;
  activeInput = addressInput;
  updateDropdownPlacement();
  showAddressError(false);
  setFocusState(true);

  const v = normalizeQuery(addressInput.value);
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

aptInput.addEventListener("focus", () => {
  keyboardPinned = true;
  activeInput = aptInput;
  aptField.classList.add("focused");
  hideKbSuggest();
  syncAptInputUI();
  renderAptDropdownRows(getFilteredApartments(aptInput.value));
  setAptDropdownVisible(true);
  showKeyboard(true, aptSection);
});

aptField.addEventListener("click", () => {
  renderAptDropdownRows(getFilteredApartments(aptInput.value));
  setAptDropdownVisible(true);
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

aptInput.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (!keyboardPinned) {
      setAptDropdownVisible(false);
      aptField.classList.remove("focused");
      showKeyboard(false);
      activeInput = null;
    }
  }, 120);
});

aptDropdown.addEventListener("click", (event) => {
  const row = event.target.closest("[data-apartment], [data-apartment-none]");
  if (!row) {
    return;
  }
  if (row.dataset.apartmentNone === "true") {
    selectedApartment = UNIT_NONE;
    aptInput.value = "I don't see my unit here";
  } else {
    selectedApartment = row.dataset.apartment;
    aptInput.value = selectedApartment;
  }
  syncAptInputUI();
  showAptError(false);
  setAptDropdownVisible(false);
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
    aptField.contains(target) ||
    keyboard.contains(target) ||
    dropdown.contains(target) ||
    aptDropdown.contains(target) ||
    target === checkPlansBtn ||
    target === findPlansAptBtn;

  keyboardPinned = clickedInputOrControl;
  if (!clickedInputOrControl) {
    setFocusState(false);
    setDropdownMode("hidden");
    showKeyboard(false);
  }
});

syncAddressInputUI();
updatePredictions();
window.addEventListener("resize", syncDropdownPlacementIfVisible);
window.addEventListener("scroll", syncDropdownPlacementIfVisible, { passive: true });
phoneViewport.addEventListener("scroll", syncDropdownPlacementIfVisible, { passive: true });
window.addEventListener("resize", updateAptDropdownMaxHeight);
window.addEventListener("scroll", updateAptDropdownMaxHeight, { passive: true });
phoneViewport.addEventListener("scroll", updateAptDropdownMaxHeight, { passive: true });
applyKeyboardLayout(keyboardMode);

const requestedPage = getRequestedPageFromUrl();
if (requestedPage === "checking") {
  enterCheckingStep(false);
} else if (requestedPage === "apartment") {
  enterAptStep();
} else if (requestedPage === "active") {
  enterActiveAccountStep();
} else if (requestedPage === "quotes") {
  enterQuotesStep();
} else {
  enterAddressStep();
}
