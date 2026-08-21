const BIRTH_LOCATIONS_CSV_PATH = "./public/data/mp_birth_locations_web.csv";
const POLAND_GEOJSON_PATH = "./public/data/poland-voivodeships.geo.json";

const TERM_ORDER = ["7", "8", "9", "10"];
const TERM_META = {
  7: { label: "VII", years: "2011–2015" },
  8: { label: "VIII", years: "2015–2019" },
  9: { label: "IX", years: "2019–2023" },
  10: { label: "X", years: "2023–2027" },
};

const REQUIRED_COLUMNS = [
  "term",
  "mp_term_key",
  "firstLastName",
  "club",
  "birth_location",
  "latitude",
  "longitude",
  "country",
  "country_code",
  "geocoding_status",
];

const DEFAULT_TERM = "10";
const AUTOPLAY_HOLD_MS = 2800;
const RANKING_TRANSITION_MS = 2000;
const RANKING_COLOR = "#4E79A7";
const MAP_DOT_BORDER = "rgba(255, 255, 255, 0.9)";
const MAP_CATEGORY_STYLES = {
  remaining: { label: "Pozostałe miasta", color: "#1F2937", seriesName: "Pozostałe miasta" },
  overOnePercent: { label: "Udział > 1%", color: "#2563EB", seriesName: "Miasta z udziałem > 1%" },
  topFive: { label: "TOP 5", color: "#D97706", seriesName: "TOP 5 miast" },
};
const MAP_LAYER_DELAYS_MS = { remaining: 40, overOnePercent: 420, topFive: 820 };

const statusElement = document.getElementById("birthplaceStatus");
const rankingElement = document.getElementById("birthplaceRanking");
const methodologyInfoElement = document.querySelector(".birthplace-methodology-info");
const methodologyButtonElement = document.getElementById("birthplaceMethodologyButton");
const replayButtonElement = document.getElementById("birthplaceReplay");
const stopButtonElement = document.getElementById("birthplaceStop");
const mapElement = document.getElementById("birthplaceMap");
const mapCountElement = document.getElementById("birthplaceMapCount");
const currentTermElement = document.getElementById("birthplaceCurrentTerm");
const mapCurrentTermElement = document.getElementById("birthplaceMapCurrentTerm");
const foreignNoteElement = document.getElementById("birthplaceForeignNote");
const missingNoteElement = document.getElementById("birthplaceMissingNote");
const termTabs = Array.from(document.querySelectorAll(".birthplace-term-tab"));
const mapTermTabs = Array.from(document.querySelectorAll(".birthplace-map-term-tab"));

let birthRows = [];
let birthplaceMap = null;
let mapConfigured = false;
let selectedRankingTerm = DEFAULT_TERM;
let selectedMapTerm = DEFAULT_TERM;
let autoplayRunId = 0;
let autoplayTimerId = null;
let autoplayWaitResolve = null;
let rankingCleanupTimers = [];
let rankingControls = null;
let mapLayerTimers = [];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function setStatus(message, isError = false) {
  if (!statusElement) {
    return;
  }

  statusElement.hidden = !message;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function parseCsv(text, requiredColumns) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("CSV nie zawiera danych.");
  }

  const headers = rows[0].map((header) => header.trim());
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Brak wymaganych kolumn CSV: ${missingColumns.join(", ")}.`);
  }

  return rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ? values[index].trim() : "";
    });
    return record;
  });
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Nie udało się pobrać pliku ${path} (${response.status}).`);
  }
  return response.text();
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPercent(value) {
  return `${value.toLocaleString("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatCount(value) {
  return value.toLocaleString("pl-PL");
}

function getPersonUnit(value) {
  const absolute = Math.abs(value);
  if (absolute === 1) {
    return "osoba";
  }
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return "osoby";
  }
  return "osób";
}

function getPersonGenitiveUnit(value) {
  return Math.abs(value) === 1 ? "osoby" : "osób";
}

function getDeputyUnit(value) {
  const absolute = Math.abs(value);
  if (absolute === 1) {
    return "poseł";
  }
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return "posłów";
  }
  return "posłów";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNames(names) {
  if (names.length <= 1) {
    return names[0] || "";
  }
  if (names.length === 2) {
    return `${names[0]} i ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
}

function dedupeRowsByMp(rows) {
  const byMp = new Map();
  rows.forEach((row) => {
    const key = row.mp_term_key;
    if (key && !byMp.has(key)) {
      byMp.set(key, row);
    }
  });
  return Array.from(byMp.values());
}

function getRowsForTerm(term) {
  return dedupeRowsByMp(birthRows.filter((row) => row.term === term));
}

function calculateDenominator(rowsForTerm) {
  return new Set(rowsForTerm.map((row) => row.mp_term_key).filter(Boolean)).size;
}

function hasValidCoordinates(row) {
  return parseNumber(row.latitude) !== null && parseNumber(row.longitude) !== null;
}

function isPolishMappableRow(row) {
  return (
    row.country_code === "pl"
    && row.geocoding_status === "ok"
    && Boolean(row.birth_location)
    && hasValidCoordinates(row)
  );
}

function aggregateCities(rowsForTerm, denominator) {
  const cities = new Map();

  rowsForTerm.filter(isPolishMappableRow).forEach((row) => {
    const latitude = parseNumber(row.latitude);
    const longitude = parseNumber(row.longitude);
    const key = `${row.birth_location}::${latitude}::${longitude}`;
    if (!cities.has(key)) {
      cities.set(key, {
        name: row.birth_location,
        latitude,
        longitude,
        mpKeys: new Set(),
      });
    }
    cities.get(key).mpKeys.add(row.mp_term_key);
  });

  return Array.from(cities.values()).map((city) => ({
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    count: city.mpKeys.size,
    sharePercent: denominator > 0 ? (city.mpKeys.size / denominator) * 100 : 0,
  }));
}

function getTopCities(cities) {
  return [...cities]
    .sort((first, second) => (
      second.count - first.count
      || second.sharePercent - first.sharePercent
      || first.name.localeCompare(second.name, "pl")
    ))
    .slice(0, 10);
}

function countForeignRows(rowsForTerm) {
  return rowsForTerm.filter((row) => (
    row.geocoding_status === "ok"
    && row.country_code
    && row.country_code !== "pl"
    && hasValidCoordinates(row)
  )).length;
}

function countMissingLocationRows(rowsForTerm) {
  return rowsForTerm.filter((row) => (
    !row.birth_location
    || row.geocoding_status !== "ok"
    || !hasValidCoordinates(row)
  )).length;
}

function buildTermDataset(term) {
  const rowsForTerm = getRowsForTerm(term);
  const denominator = calculateDenominator(rowsForTerm);
  const cities = aggregateCities(rowsForTerm, denominator);
  const topCities = getTopCities(cities);
  const topFiveKeys = new Set(topCities.slice(0, 5).map((city) => (
    `${city.name}::${city.latitude}::${city.longitude}`
  )));
  const categorizedCities = cities.map((city) => {
    const key = `${city.name}::${city.latitude}::${city.longitude}`;
    const category = topFiveKeys.has(key)
      ? "topFive"
      : city.sharePercent > 1
        ? "overOnePercent"
        : "remaining";
    return { ...city, category };
  });
  return {
    term,
    rowsForTerm,
    denominator,
    cities: categorizedCities,
    topCities,
    foreignCount: countForeignRows(rowsForTerm),
    missingCount: countMissingLocationRows(rowsForTerm),
  };
}

function renderTermMeta(term) {
  if (!currentTermElement) {
    return;
  }
  const meta = TERM_META[term];
  currentTermElement.textContent = `Kadencja ${meta.label}`;
}

function renderMapTermMeta(term) {
  if (!mapCurrentTermElement) {
    return;
  }
  const meta = TERM_META[term];
  mapCurrentTermElement.textContent = `Kadencja ${meta.label} · ${meta.years}`;
}

function createRankingRow(cityName) {
  const row = document.createElement("div");
  row.className = "birthplace-ranking-row";
  row.dataset.city = cityName;
  row.dataset.currentPercent = "0";
  row.dataset.currentWidth = "0";
  row.setAttribute("role", "listitem");
  row.setAttribute("tabindex", "0");
  row.innerHTML = `
    <span class="birthplace-ranking-position"></span>
    <div class="birthplace-ranking-label">
      <strong></strong>
    </div>
    <div class="birthplace-ranking-track" aria-hidden="true">
      <span class="birthplace-ranking-fill"></span>
    </div>
    <strong class="birthplace-ranking-value">0,0%</strong>
    <span class="birthplace-ranking-tooltip" role="tooltip">
      <strong></strong>
      <span class="birthplace-ranking-tooltip-count"></span>
      <span class="birthplace-ranking-tooltip-share"></span>
    </span>
  `;
  return row;
}

function updateRankingRowContent(row, city, index) {
  const isWinner = index === 0;
  const label = `${city.name}. ${formatCount(city.count)} ${getPersonUnit(city.count)}. ${formatPercent(city.sharePercent)} wszystkich osób sprawujących mandat w tej kadencji.`;
  row.setAttribute("aria-label", label);
  row.querySelector(".birthplace-ranking-position").textContent = String(index + 1);
  row.querySelector(".birthplace-ranking-label strong").textContent = city.name;
  row.querySelector(".birthplace-ranking-tooltip strong").textContent = city.name;
  row.querySelector(".birthplace-ranking-tooltip-count").textContent = `${formatCount(city.count)} ${getPersonUnit(city.count)}`;
  row.querySelector(".birthplace-ranking-tooltip-share").textContent = `${formatPercent(city.sharePercent)} wszystkich osób sprawujących mandat w tej kadencji`;
  row.classList.toggle("is-winner", isWinner);
}

function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function animateRankingMetrics(row, targetPercent, targetWidth, duration) {
  if (row._metricAnimationFrame) {
    cancelAnimationFrame(row._metricAnimationFrame);
  }

  const startPercent = Number.parseFloat(row.dataset.currentPercent || "0");
  const startWidth = Number.parseFloat(row.dataset.currentWidth || "0");
  const valueElement = row.querySelector(".birthplace-ranking-value");
  const fillElement = row.querySelector(".birthplace-ranking-fill");

  if (duration === 0) {
    row.dataset.currentPercent = String(targetPercent);
    row.dataset.currentWidth = String(targetWidth);
    valueElement.textContent = formatPercent(targetPercent);
    fillElement.style.width = `${targetWidth.toFixed(2)}%`;
    return;
  }

  const startedAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(Math.max((now - startedAt) / duration, 0), 1);
    const eased = easeInOutCubic(progress);
    const currentPercent = startPercent + (targetPercent - startPercent) * eased;
    const currentWidth = startWidth + (targetWidth - startWidth) * eased;
    row.dataset.currentPercent = String(currentPercent);
    row.dataset.currentWidth = String(currentWidth);
    valueElement.textContent = formatPercent(currentPercent);
    fillElement.style.width = `${currentWidth.toFixed(2)}%`;

    if (progress < 1) {
      row._metricAnimationFrame = requestAnimationFrame(tick);
    } else {
      row._metricAnimationFrame = null;
    }
  };
  row._metricAnimationFrame = requestAnimationFrame(tick);
}

function clearRankingCleanupTimers() {
  rankingCleanupTimers.forEach((timer) => window.clearTimeout(timer));
  rankingCleanupTimers = [];
}

function renderRanking(dataset, animate = false) {
  if (!rankingElement) {
    return;
  }

  clearRankingCleanupTimers();
  rankingElement.querySelectorAll(".birthplace-ranking-row.is-exiting").forEach((row) => row.remove());

  if (dataset.topCities.length === 0) {
    rankingElement.innerHTML = "<p class=\"birthplace-empty\">Brak danych do pokazania rankingu.</p>";
    return;
  }

  const duration = animate && !prefersReducedMotion.matches ? RANKING_TRANSITION_MS : 0;
  const maxShare = Math.max(...dataset.topCities.map((city) => city.sharePercent), 1);
  const targetNames = new Set(dataset.topCities.map((city) => city.name));
  const currentRows = Array.from(rankingElement.querySelectorAll(".birthplace-ranking-row"));
  const oldRects = new Map(currentRows.map((row) => [row, row.getBoundingClientRect()]));
  const rowsByCity = new Map(currentRows.map((row) => [row.dataset.city, row]));
  const targetRows = dataset.topCities.map((city, index) => {
    const row = rowsByCity.get(city.name) || createRankingRow(city.name);
    updateRankingRowContent(row, city, index);
    rankingElement.appendChild(row);
    return { row, city, index, isNew: !oldRects.has(row) };
  });
  const exitingRows = currentRows.filter((row) => !targetNames.has(row.dataset.city));
  exitingRows.forEach((row) => {
    row.classList.remove("is-winner");
    row.classList.add("is-exiting");
    rankingElement.appendChild(row);
  });

  if (duration === 0) {
    exitingRows.forEach((row) => row.remove());
    targetRows.forEach(({ row, city }) => {
      row.style.opacity = "1";
      row.style.transform = "none";
      row.style.transition = "none";
      animateRankingMetrics(row, city.sharePercent, Math.max((city.sharePercent / maxShare) * 100, 4), 0);
    });
    return;
  }

  targetRows.forEach(({ row, isNew }) => {
    const oldRect = oldRects.get(row);
    const newRect = row.getBoundingClientRect();
    const offset = oldRect ? oldRect.top - newRect.top : 48;
    row.style.transition = "none";
    row.style.transform = `translateY(${offset}px)`;
    row.style.opacity = isNew ? "0" : "1";
  });
  exitingRows.forEach((row) => {
    const oldRect = oldRects.get(row);
    const newRect = row.getBoundingClientRect();
    row.style.transition = "none";
    row.style.transform = `translateY(${oldRect.top - newRect.top}px)`;
    row.style.opacity = "1";
  });

  rankingElement.getBoundingClientRect();
  requestAnimationFrame(() => {
    targetRows.forEach(({ row, city }) => {
      row.style.transition = `transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1), opacity 500ms ease, background-color 500ms ease`;
      row.style.transform = "translateY(0)";
      row.style.opacity = "1";
      const targetWidth = Math.max((city.sharePercent / maxShare) * 100, 4);
      animateRankingMetrics(row, city.sharePercent, targetWidth, duration);
    });
    exitingRows.forEach((row) => {
      row.style.transition = `transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1), opacity 500ms ease ${Math.max(0, duration - 500)}ms`;
      row.style.transform = "translateY(0)";
      row.style.opacity = "0";
    });
  });

  rankingCleanupTimers.push(window.setTimeout(() => {
    exitingRows.forEach((row) => row.remove());
    targetRows.forEach(({ row }) => {
      row.style.transition = "";
      row.style.transform = "";
    });
  }, duration + 80));
}

function getMapSymbolSize(count) {
  return Math.min(28, 4.5 + Math.sqrt(Math.max(0, count - 1)) * 3.1);
}

function clearMapLayerTimers() {
  mapLayerTimers.forEach((timer) => window.clearTimeout(timer));
  mapLayerTimers = [];
}

function setMapLayerData(category, data) {
  const seriesIds = {
    remaining: "birthplace-points-remaining",
    overOnePercent: "birthplace-points-over-one-percent",
    topFive: "birthplace-points-top-five",
  };
  birthplaceMap.setOption({
    animation: true,
    series: [{ id: seriesIds[category], data }],
  });
}

function animateMapLayers(scatterDataByCategory) {
  clearMapLayerTimers();
  const categories = ["remaining", "overOnePercent", "topFive"];
  if (prefersReducedMotion.matches) {
    categories.forEach((category) => setMapLayerData(category, scatterDataByCategory[category]));
    return;
  }

  birthplaceMap.setOption({
    animation: false,
    series: [
      { id: "birthplace-points-remaining", data: [] },
      { id: "birthplace-points-over-one-percent", data: [] },
      { id: "birthplace-points-top-five", data: [] },
    ],
  });
  categories.forEach((category) => {
    mapLayerTimers.push(window.setTimeout(() => {
      setMapLayerData(category, scatterDataByCategory[category]);
    }, MAP_LAYER_DELAYS_MS[category]));
  });
}

function renderMap(dataset) {
  if (!birthplaceMap || !mapElement) {
    return;
  }

  const scatterDataByCategory = Object.fromEntries(
    Object.keys(MAP_CATEGORY_STYLES).map((category) => [
      category,
      dataset.cities
        .filter((city) => city.category === category)
        .map((city) => ({
          name: city.name,
          value: [city.longitude, city.latitude, city.count, city.sharePercent],
          count: city.count,
          sharePercent: city.sharePercent,
          category,
          categoryLabel: MAP_CATEGORY_STYLES[category].label,
        })),
    ]),
  );

  if (mapCountElement) {
    const cityCount = dataset.cities.length;
    mapCountElement.textContent = `${formatCount(cityCount)} ${cityCount === 1 ? "miejscowość" : "miejscowości"}`;
  }

  if (mapConfigured) {
    animateMapLayers(scatterDataByCategory);
    return;
  }

  birthplaceMap.setOption({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      confine: true,
      borderWidth: 0,
      backgroundColor: "#fffdf9",
      textStyle: {
        color: "#0f2247",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      },
      extraCssText: "box-shadow: 0 16px 38px rgba(15, 34, 71, 0.16); border-radius: 14px;",
      formatter: (params) => {
        if (!params.data || !Array.isArray(params.data.value)) {
          return "";
        }
        const count = params.data.value[2];
        const percent = params.data.value[3];
        return `
          <strong>${escapeHtml(params.name)}</strong><br><br>
          ${formatCount(count)} ${getDeputyUnit(count)}<br>
          ${formatPercent(percent)} kadencji<br>
          Kategoria: ${escapeHtml(params.data.categoryLabel)}
        `;
      },
    },
    geo: {
      map: "poland-voivodeships",
      roam: false,
      silent: true,
      layoutCenter: ["50%", "52%"],
      layoutSize: "86%",
      aspectScale: 0.78,
      itemStyle: {
        areaColor: "#F5F3EE",
        borderColor: "#C5CBD3",
        borderWidth: 1,
      },
      emphasis: {
        disabled: true,
      },
    },
    series: [
      ["remaining", "birthplace-points-remaining", 2],
      ["overOnePercent", "birthplace-points-over-one-percent", 3],
      ["topFive", "birthplace-points-top-five", 4],
    ].map(([category, id, z]) => ({
      id,
      name: MAP_CATEGORY_STYLES[category].seriesName,
      type: "scatter",
      coordinateSystem: "geo",
      data: [],
      symbolSize: (value) => getMapSymbolSize(value[2]),
      animation: true,
      animationType: "scale",
      animationDuration: category === "topFive" ? 620 : 440,
      animationDurationUpdate: category === "topFive" ? 620 : 440,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",
      animationDelay: (index) => Math.min(index * (category === "remaining" ? 2 : 45), 220),
      animationDelayUpdate: (index) => Math.min(index * (category === "remaining" ? 2 : 45), 220),
      itemStyle: {
        color: MAP_CATEGORY_STYLES[category].color,
        borderColor: MAP_DOT_BORDER,
        borderWidth: category === "topFive" ? 1.5 : 1,
        shadowBlur: category === "topFive" ? 6 : 3,
        shadowColor: "rgba(15, 34, 71, 0.12)",
      },
      emphasis: {
        scale: 1.18,
        itemStyle: {
          color: MAP_CATEGORY_STYLES[category].color,
        },
      },
      label: {
        show: category === "topFive" && !window.matchMedia("(max-width: 760px)").matches,
        formatter: "{b}",
        position: "right",
        distance: 5,
        color: "#0f2247",
        fontSize: 11,
        fontWeight: 800,
        textBorderColor: "#fffdf9",
        textBorderWidth: 3,
      },
      z,
    })),
  }, true);
  mapConfigured = true;
  animateMapLayers(scatterDataByCategory);
}

function renderNotes(dataset) {
  if (foreignNoteElement) {
    if (dataset.foreignCount > 0) {
      const verb = dataset.foreignCount === 1 ? "urodziła się" : "urodziły się";
      const mapVerb = dataset.foreignCount === 1 ? "nie została pokazana" : "nie zostały pokazane";
      foreignNoteElement.hidden = false;
      foreignNoteElement.textContent = `Dodatkowo ${formatCount(dataset.foreignCount)} ${getPersonUnit(dataset.foreignCount)} sprawujące mandat w tej kadencji ${verb} poza Polską i ${mapVerb} na mapie.`;
    } else {
      foreignNoteElement.hidden = true;
      foreignNoteElement.textContent = "";
    }
  }

  if (missingNoteElement) {
    if (dataset.missingCount > 0) {
      missingNoteElement.hidden = false;
      missingNoteElement.textContent = `Dla ${formatCount(dataset.missingCount)} ${getPersonGenitiveUnit(dataset.missingCount)} nie udało się przypisać pewnej lokalizacji.`;
    } else {
      missingNoteElement.hidden = true;
      missingNoteElement.textContent = "";
    }
  }
}

function renderRankingTerm(term, { animateRanking = false } = {}) {
  selectedRankingTerm = term;
  const dataset = buildTermDataset(term);

  termTabs.forEach((tab) => {
    const isActive = tab.dataset.term === term;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  renderTermMeta(term);
  rankingControls?.setActiveTerm(term);
  renderRanking(dataset, animateRanking);
}

function renderMapTerm(term) {
  selectedMapTerm = term;
  const dataset = buildTermDataset(term);

  mapTermTabs.forEach((tab) => {
    const isActive = tab.dataset.mapTerm === term;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  renderMapTermMeta(term);
  renderMap(dataset);
  renderNotes(dataset);
}

function cancelAutoplay() {
  autoplayRunId += 1;
  if (autoplayTimerId !== null) {
    window.clearTimeout(autoplayTimerId);
    autoplayTimerId = null;
  }
  if (autoplayWaitResolve) {
    autoplayWaitResolve();
    autoplayWaitResolve = null;
  }
  rankingControls?.setPlaying(false);
}

function waitForAutoplay(milliseconds) {
  return new Promise((resolve) => {
    autoplayWaitResolve = resolve;
    autoplayTimerId = window.setTimeout(() => {
      autoplayTimerId = null;
      autoplayWaitResolve = null;
      resolve();
    }, milliseconds);
  });
}

async function playRankingSequence() {
  cancelAutoplay();
  const runId = autoplayRunId;
  rankingControls?.setPlaying(true);
  renderRankingTerm("7", { animateRanking: false });
  await waitForAutoplay(AUTOPLAY_HOLD_MS);

  for (const term of ["8", "9", "10"]) {
    if (runId !== autoplayRunId) {
      return;
    }
    renderRankingTerm(term, { animateRanking: true });
    await waitForAutoplay(
      RANKING_TRANSITION_MS + (term === "10" ? 0 : AUTOPLAY_HOLD_MS),
    );
  }
  if (runId === autoplayRunId) {
    rankingControls?.setPlaying(false);
  }
}

function normalizeRows(rows) {
  return rows.map((row) => ({
    term: row.term,
    mp_term_key: row.mp_term_key,
    firstLastName: row.firstLastName,
    club: row.club,
    birth_location: row.birth_location,
    latitude: row.latitude,
    longitude: row.longitude,
    country: row.country,
    country_code: row.country_code.toLowerCase(),
    geocoding_status: row.geocoding_status,
  }));
}

async function initBirthplacePage() {
  try {
    setStatus("Ładowanie danych...");
    const [csvText, geoJsonText] = await Promise.all([
      fetchText(BIRTH_LOCATIONS_CSV_PATH),
      fetchText(POLAND_GEOJSON_PATH),
    ]);
    birthRows = normalizeRows(parseCsv(csvText, REQUIRED_COLUMNS));
    const polandGeoJson = JSON.parse(geoJsonText);

    if (!window.echarts) {
      throw new Error("Biblioteka ECharts nie została załadowana.");
    }

    window.echarts.registerMap("poland-voivodeships", polandGeoJson);
    birthplaceMap = window.echarts.init(mapElement);
    setStatus("");
    renderMapTerm(DEFAULT_TERM);
    rankingControls = window.AnalysisAnimationControls?.create({
      buttons: termTabs,
      replayButton: replayButtonElement,
      stopButton: stopButtonElement,
      onSelect: (term) => {
        cancelAutoplay();
        renderRankingTerm(term, { animateRanking: false });
      },
      onStop: () => {
        const targetTerm = selectedRankingTerm;
        cancelAutoplay();
        renderRankingTerm(targetTerm, { animateRanking: false });
      },
      onReplay: () => {
        if (prefersReducedMotion.matches) {
          cancelAutoplay();
          renderRankingTerm(DEFAULT_TERM, { animateRanking: false });
          return;
        }
        playRankingSequence();
      },
    });
    if (prefersReducedMotion.matches) {
      renderRankingTerm(DEFAULT_TERM, { animateRanking: false });
    } else {
      playRankingSequence();
    }

    mapTermTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        renderMapTerm(tab.dataset.mapTerm);
      });
    });

    if (methodologyInfoElement && methodologyButtonElement) {
      methodologyButtonElement.addEventListener("click", () => {
        const isOpen = methodologyInfoElement.classList.toggle("is-open");
        methodologyButtonElement.setAttribute("aria-expanded", String(isOpen));
      });

      document.addEventListener("click", (event) => {
        if (!methodologyInfoElement.contains(event.target)) {
          methodologyInfoElement.classList.remove("is-open");
          methodologyButtonElement.setAttribute("aria-expanded", "false");
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          methodologyInfoElement.classList.remove("is-open");
          methodologyButtonElement.setAttribute("aria-expanded", "false");
          methodologyButtonElement.focus();
        }
      });
    }

    window.addEventListener("resize", () => {
      if (birthplaceMap) {
        birthplaceMap.resize();
      }
    });
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Nie udało się załadować danych.", true);
  }
}

document.addEventListener("DOMContentLoaded", initBirthplacePage);
