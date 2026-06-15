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

const ADDRESS_SUGGESTIONS = [
  { line1: "111 Main St", line2: "Bethpage, NY 11714", value: "111 Main St, Bethpage, NY 11714" },
  { line1: "111 W Main St", line2: "Babylon, NY 11702", value: "111 W Main St, Babylon, NY 11702" },
  { line1: "111 E Main St", line2: "Patchogue, NY 11772", value: "111 E Main St, Patchogue, NY 11772" },
  { line1: "111 Stewart Ave", line2: "Bethpage, NY 11714", value: "111 Stewart Ave, Bethpage, NY 11714" },
  { line1: "1111 Stewart Ave", line2: "Bethpage, NY 11714", value: "1111 Stewart Ave, Bethpage, NY 11714" },
  { line1: "1115 Stewart Ave", line2: "Bethpage, NY 11714", value: "1115 Stewart Ave, Bethpage, NY 11714" },
  { line1: "1119 Stewart Ave", line2: "Bethpage, NY 11714", value: "1119 Stewart Ave, Bethpage, NY 11714" },
  { line1: "111 Merrick Rd", line2: "Lynbrook, NY 11563", value: "111 Merrick Rd, Lynbrook, NY 11563" },
  { line1: "111 Old Country Rd", line2: "Carle Place, NY 11514", value: "111 Old Country Rd, Carle Place, NY 11514" },
  { line1: "111 Sunrise Hwy", line2: "Rockville Centre, NY 11570", value: "111 Sunrise Hwy, Rockville Centre, NY 11570" },
];

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

function setFocusState(active) {
  addressField.classList.toggle("focused", active);
  topScrim.classList.toggle("hidden", !active);
  // The overlay should end below the CTA button.
  bottomScrim.classList.add("hidden");
}

function updateDropdownPlacement() {
  const rect = addressField.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom}px`;
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.width = `${rect.width}px`;
}

function syncDropdownPlacementIfVisible() {
  if (!dropdown.classList.contains("hidden")) {
    updateDropdownPlacement();
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

  // Keep broader nearby options visible (ex: typing "1111" still shows other
  // relevant 111* addresses like in the Figma flow).
  if (/^\d{4,}$/.test(query)) {
    const broadPrefix = query.slice(0, 3);
    const broadMatches = ADDRESS_SUGGESTIONS.filter((suggestion) =>
      matchesQuery(suggestion, broadPrefix)
    );
    const merged = [...primaryMatches];
    broadMatches.forEach((suggestion) => {
      if (!merged.includes(suggestion)) {
        merged.push(suggestion);
      }
    });
    return merged.slice(0, 6);
  }

  return primaryMatches.slice(0, 6);
}

function renderDropdownRows(rows) {
  dropdownRowsHost.querySelectorAll(".dropdown-row").forEach((row) => row.remove());
  rows.forEach((suggestion) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dropdown-row";
    row.dataset.address = suggestion.value;
    row.innerHTML = `
      <img class="pin-mini" src="./assets/icon-pin-blue.svg" alt="" />
      <span>${suggestion.line1}</span><small>${suggestion.line2}</small>
    `;
    dropdownRowsHost.appendChild(row);
  });
}

function setDropdownMode(mode) {
  if (mode === "hidden") {
    dropdown.classList.add("hidden");
    return;
  }
  updateDropdownPlacement();
  dropdown.classList.remove("hidden");
  const helperOnly = mode === "helper";
  dropdown.classList.toggle("helper-only", helperOnly);
  dropdownTitle.textContent = helperOnly
    ? "Enter street, city and zip to see matches..."
    : "Select an address to continue";
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
  const keyboardTop = keyboard.classList.contains("hidden")
    ? phoneRect.bottom
    : keyboard.getBoundingClientRect().top;
  const availableHeight = Math.max(120, Math.floor(keyboardTop - dropdownRect.top - 6));
  aptDropdown.style.maxHeight = `${availableHeight}px`;
}

function showKeyboard(show, focusEl) {
  if (show) {
    keyboard.classList.remove("hidden");
    phone.classList.add("keyboard-open");
    if (focusEl) {
      window.setTimeout(() => {
        focusEl.scrollIntoView({ behavior: "smooth", block: "start" });
        updateDropdownPlacement();
        updateAptDropdownMaxHeight();
      }, 60);
    }
    window.setTimeout(updateDropdownPlacement, 140);
    window.setTimeout(updateAptDropdownMaxHeight, 140);
    return;
  }
  keyboard.classList.add("hidden");
  phone.classList.remove("keyboard-open");
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
  footer.classList.remove("hidden");
  dropdown.classList.add("hidden");
  setFocusState(false);
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

addressInput.addEventListener("input", () => {
  const v = normalizeQuery(addressInput.value);
  syncAddressInputUI();
  showAddressError(false);
  const addressInputIsActive =
    document.activeElement === addressInput || activeInput === addressInput;

  // Selecting from dropdown should be the only way to "confirm" address.
  selectedAddress = "";

  const results = getFilteredSuggestions(v);
  renderDropdownRows(results);

  if (results.length > 0) {
    setDropdownMode("list");
    return;
  }

  if (v.length >= 3) {
    setDropdownMode("helper");
    dropdownTitle.textContent = "No address matches yet. Keep typing to refine.";
    return;
  }

  if (addressInputIsActive) {
    setDropdownMode("helper");
  } else {
    setDropdownMode("hidden");
  }
});

clearAddress.addEventListener("click", () => {
  addressInput.value = "";
  syncAddressInputUI();
  showAddressError(false);
  setDropdownMode("helper");
  addressInput.focus();
});

checkPlansBtn.addEventListener("click", () => {
  const v = normalizeQuery(addressInput.value);
  setDropdownMode("hidden");

  if (!v) {
    showAddressError(true);
    return;
  }

  // If user typed a partial address and tries CTA, keep them in the same
  // screen and guide them to choose from suggestions first.
  const matchesSuggestion = getFilteredSuggestions(v).length > 0;
  if (matchesSuggestion && !selectedAddress) {
    renderDropdownRows(getFilteredSuggestions(v));
    setDropdownMode("list");
    return;
  }

  if (!selectedAddress) {
    showAddressError(true);
    return;
  }

  enterCheckingStep();
});

dropdown.addEventListener("click", (event) => {
  const row = event.target.closest(".dropdown-row");
  if (!row) {
    return;
  }
  const picked = row.dataset.address || row.querySelector("span").textContent;
  selectedAddress = picked;
  addressInput.value = picked;
  syncAddressInputUI();
  setDropdownMode("hidden");
  showAddressError(false);
  // Match prototype behavior: selecting suggestion confirms in-place.
  addressInput.blur();
  keyboardPinned = false;
  showKeyboard(false);
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
  if (addressInput.value.trim().length === 0) {
    setDropdownMode("helper");
  }
  showKeyboard(true, addressSection);
});

aptInput.addEventListener("focus", () => {
  keyboardPinned = true;
  activeInput = aptInput;
  aptField.classList.add("focused");
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
  if (key === "space") {
    activeInput.value += " ";
  } else if (key === "backspace") {
    activeInput.value = activeInput.value.slice(0, -1);
  } else if (key === "return") {
    activeInput.blur();
    keyboardPinned = false;
    showKeyboard(false);
    return;
  } else if (key !== "123") {
    let char = key;
    if (keyboard.classList.contains("kb-shift") && /^[a-z]$/.test(char)) {
      char = char.toUpperCase();
      keyboard.classList.remove("kb-shift");
    }
    activeInput.value += char;
  }

  activeInput.dispatchEvent(new Event("input", { bubbles: true }));
  activeInput.focus();
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
