const CSV_PATH = "./public/data/profession_groups_web_presence_percent_by_term.csv";
const WEIGHTED_CSV_PATH = "./public/data/profession_groups_web_weighted_percent_by_term.csv";

const TERM_ORDER = ["7", "8", "9", "10"];
const TERM_META = {
  7: { label: "VII", years: "2011–2015" },
  8: { label: "VIII", years: "2015–2019" },
  9: { label: "IX", years: "2019–2023" },
  10: { label: "X", years: "2023–2027" },
};
const GROUP_ORDER = [
  "Polityka",
  "Edukacja i nauka",
  "Biznes i finanse",
  "Prawo",
  "Sektor publiczny i służby",
  "Technika i IT",
  "Kultura, media i sport",
  "Zdrowie",
  "Inne",
];

const HIDDEN_GROUPS = new Set(["Brak danych"]);

const GROUP_AXIS_LABELS = {
  Polityka: "Polityka",
  "Edukacja i nauka": "Edukacja\ni nauka",
  "Biznes i finanse": "Biznes\ni finanse",
  Prawo: "Prawo",
  "Sektor publiczny i służby": "Sektor publiczny\ni służby",
  "Technika i IT": "Technika\ni IT",
  "Kultura, media i sport": "Kultura, media\ni sport",
  Zdrowie: "Zdrowie",
  Inne: "Inne",
};

const TERM_STYLES = {
  7: { shortLabel: "VII", color: "#9BB7D3" },
  8: { shortLabel: "VIII", color: "#D6A36A" },
  9: { shortLabel: "IX", color: "#B8783A" },
  10: { shortLabel: "X", color: "#6889A9" },
};

const GROUP_COLORS = {
  Polityka: "#B36A2E",
  "Edukacja i nauka": "#8FAFD4",
  "Biznes i finanse": "#D4A44B",
  Prawo: "#5F7EA4",
  "Sektor publiczny i służby": "#4F9D9D",
  "Technika i IT": "#6FAE63",
  "Kultura, media i sport": "#8D6AAE",
  Zdrowie: "#D97C7C",
  Inne: "#9DA8B8",
  Pozostałe: "#AEB7C5",
};

const DONUT_TOP_GROUP_COUNT = 5;
const DONUT_OTHER_GROUP = "Pozostałe";
const DONUT_OTHER_COLOR = GROUP_COLORS[DONUT_OTHER_GROUP];

const DONUT_GROUP_LABELS = {
  Polityka: "Polityka",
  "Edukacja i nauka": "Edukacja i\nnauka",
  "Biznes i finanse": "Biznes i\nfinanse",
  Prawo: "Prawo",
  "Sektor publiczny i służby": "Sektor publiczny\ni służby",
  "Technika i IT": "Technika i IT",
  "Kultura, media i sport": "Kultura, media\ni sport",
  Zdrowie: "Zdrowie",
  Inne: "Inne",
  Pozostałe: "Pozostałe",
};

const DONUT_CONTAINERS = {
  7: "professionDonutTerm7",
  8: "professionDonutTerm8",
  9: "professionDonutTerm9",
  10: "professionDonutTerm10",
};

const DONUT_TOP_LISTS = {
  7: "professionDonutLegendTerm7",
  8: "professionDonutLegendTerm8",
  9: "professionDonutLegendTerm9",
  10: "professionDonutLegendTerm10",
};

const PRESENCE_REQUIRED_COLUMNS = [
  "term",
  "profession_group_web",
  "mp_count",
  "denominator_mp_count",
  "presence_share_percent",
];

const WEIGHTED_REQUIRED_COLUMNS = [
  "term",
  "profession_group_web",
  "weighted_mp_count",
  "denominator_mp_count",
  "weighted_share_percent",
];

const chartElement = document.getElementById("professionGroupsChart");
const statusElement = document.getElementById("professionChartStatus");
const donutsStatusElement = document.getElementById("professionDonutsStatus");
const raceChartElement = document.getElementById("professionRaceChart");
const raceStatusElement = document.getElementById("professionRaceStatus");
const raceReplayElement = document.getElementById("professionRaceReplay");
const raceTermNumberElement = document.querySelector(".profession-race-term-number");
const raceTermYearsElement = document.querySelector(".profession-race-term-years");
const VALUE_ANIMATION_DURATION = 3000;
const RANK_MOVE_DURATION = 1800;
const TERM_PAUSE = 1200;
let weightedRowsPromise;

function showLoadingStatus(message) {
  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = message;
  statusElement.classList.remove("is-error");
}

function hideLoadingStatus() {
  if (!statusElement) {
    return;
  }

  statusElement.hidden = true;
  statusElement.textContent = "";
  statusElement.classList.remove("is-error");
}

function setStatus(message, isError = false) {
  if (!statusElement) {
    return;
  }

  statusElement.hidden = false;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function setDonutsStatus(message, isError = false) {
  if (!donutsStatusElement) {
    return;
  }

  donutsStatusElement.hidden = false;
  donutsStatusElement.textContent = message;
  donutsStatusElement.classList.toggle("is-error", isError);
}

function hideDonutsStatus() {
  if (!donutsStatusElement) {
    return;
  }

  donutsStatusElement.hidden = true;
  donutsStatusElement.textContent = "";
  donutsStatusElement.classList.remove("is-error");
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

function formatPercent(value) {
  return `${value.toLocaleString("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatCount(value) {
  return value.toLocaleString("pl-PL");
}

function formatWeightedCount(value) {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function loadWeightedRows() {
  if (!weightedRowsPromise) {
    weightedRowsPromise = fetchText(WEIGHTED_CSV_PATH).then((csvText) => (
      parseCsv(csvText, WEIGHTED_REQUIRED_COLUMNS)
    ));
  }

  return weightedRowsPromise;
}

function buildProfessionRaceDataset(rows) {
  const valuesByTerm = new Map();

  TERM_ORDER.forEach((term) => {
    valuesByTerm.set(term, new Map(GROUP_ORDER.map((group) => [group, 0])));
  });

  rows.forEach((row) => {
    const term = row.term;
    const group = row.profession_group_web;
    const value = Number(row.weighted_share_percent);

    if (
      !TERM_ORDER.includes(term)
      || !GROUP_ORDER.includes(group)
      || !Number.isFinite(value)
      || HIDDEN_GROUPS.has(group)
    ) {
      return;
    }

    valuesByTerm.get(term).set(group, value);
  });

  const dataset = new Map(
    TERM_ORDER.map((term) => {
      const rowsForTerm = GROUP_ORDER.map((group) => ({
        group,
        value: valuesByTerm.get(term).get(group),
      }));

      rowsForTerm.sort((a, b) => b.value - a.value || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
      return [term, rowsForTerm];
    }),
  );

  const maxValueAcrossTerms = Math.max(
    ...Array.from(dataset.values()).flat().map((row) => row.value),
    0,
  );
  dataset.raceAxisMax = Math.max(5, Math.ceil(maxValueAcrossTerms / 5) * 5);

  return dataset;
}

function setProfessionRaceTerm(term) {
  if (!raceTermNumberElement || !raceTermYearsElement) {
    return;
  }

  raceTermNumberElement.textContent = TERM_META[term].label;
  raceTermYearsElement.textContent = TERM_META[term].years;
}

function getProfessionRaceRows(term, dataset) {
  return dataset.get(term) || [];
}

function getProfessionRaceOrder(term, dataset) {
  return getProfessionRaceRows(term, dataset).map((row) => row.group);
}

function buildProfessionRaceSeriesData(order, valuesTerm, dataset) {
  const values = new Map(
    getProfessionRaceRows(valuesTerm, dataset).map((row) => [row.group, row.value]),
  );

  return order.map((group) => ({
    id: group,
    name: group,
    value: Number((values.get(group) || 0).toFixed(3)),
    itemStyle: { color: GROUP_COLORS[group] },
  }));
}

function getProfessionRaceValues(term, order, dataset) {
  const values = new Map(
    getProfessionRaceRows(term, dataset).map((row) => [row.group, row.value]),
  );

  return order.map((group) => values.get(group) || 0);
}

function updateRaceChartValues(chart, order, values) {
  chart.setOption({
    animation: false,
    series: [{
      data: order.map((group, index) => ({
        id: group,
        name: group,
        value: values[index],
        itemStyle: { color: GROUP_COLORS[group] },
      })),
    }],
  });
}

function animateRaceRanking(chart, order, targetOrder, values, runId, getRunId) {
  return new Promise((resolve) => {
    if (runId !== getRunId()) {
      resolve(false);
      return;
    }

    chart.setOption({
      animation: true,
      animationDurationUpdate: RANK_MOVE_DURATION,
      animationEasingUpdate: "cubicInOut",
      yAxis: { data: targetOrder },
      series: [{
        data: targetOrder.map((group) => ({
          id: group,
          name: group,
          value: values[order.indexOf(group)],
          itemStyle: { color: GROUP_COLORS[group] },
        })),
      }],
    });

    window.setTimeout(() => resolve(runId === getRunId()), RANK_MOVE_DURATION);
  });
}

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function animateBarValues(chart, order, fromValues, toValues, duration, runId, getRunId) {
  return new Promise((resolve) => {
    const startTime = performance.now();

    function frame(now) {
      if (runId !== getRunId()) {
        resolve(false);
        return;
      }

      const progress = Math.min((now - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const currentValues = fromValues.map((from, index) => (
        from + (toValues[index] - from) * eased
      ));

      updateRaceChartValues(chart, order, currentValues);

      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }

      resolve(true);
    }

    requestAnimationFrame(frame);
  });
}

function renderProfessionRace(term, dataset, chart, animate = true) {
  const rows = dataset.get(term) || [];
  setProfessionRaceTerm(term);

  chart.setOption({
    animation: animate,
    animationDuration: animate ? 900 : 0,
    animationDurationUpdate: animate ? VALUE_ANIMATION_DURATION : 0,
    animationEasingUpdate: "cubicInOut",
    yAxis: { data: rows.map((row) => row.group) },
    series: [{ data: buildProfessionRaceSeriesData(rows.map((row) => row.group), term, dataset) }],
  });
}

function renderProfessionRaceChart(dataset) {
  if (!raceChartElement || !window.echarts) {
    return null;
  }

  const isNarrow = window.matchMedia("(max-width: 760px)").matches;
  const chart = window.echarts.init(raceChartElement, null, { renderer: "svg" });

  chart.setOption({
    animationDuration: 900,
    animationDurationUpdate: VALUE_ANIMATION_DURATION,
    animationEasingUpdate: "cubicInOut",
    grid: {
      left: isNarrow ? 140 : 190,
      right: isNarrow ? 22 : 40,
      top: isNarrow ? 24 : 26,
      bottom: isNarrow ? 28 : 34,
      containLabel: false,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: dataset.raceAxisMax,
      interval: 5,
      axisLabel: {
        color: "#6b7588",
        fontSize: isNarrow ? 10 : 11,
        formatter: "{value}%",
      },
      axisLine: { lineStyle: { color: "rgba(15, 34, 71, 0.14)" } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "rgba(15, 34, 71, 0.08)" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: [],
      animationDuration: 900,
      animationDurationUpdate: VALUE_ANIMATION_DURATION,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: "#0f2247",
        fontSize: isNarrow ? 11 : 13,
        fontWeight: 700,
        width: isNarrow ? 132 : 180,
        overflow: "break",
        lineHeight: isNarrow ? 14 : 16,
        margin: isNarrow ? 8 : 12,
      },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: isNarrow ? 26 : 32,
        showBackground: true,
        backgroundStyle: { color: "rgba(15, 34, 71, 0.055)", borderRadius: 8 },
        label: {
          show: true,
          position: "right",
          valueAnimation: true,
          color: "#0f2247",
          fontWeight: 800,
          fontSize: isNarrow ? 11 : 13,
          formatter: (params) => formatPercent(params.value),
        },
        itemStyle: { borderRadius: [0, 8, 8, 0] },
        data: [],
      },
    ],
  });

  renderProfessionRace("7", dataset, chart, false);
  return chart;
}

async function initProfessionRace() {
  if (!raceChartElement) {
    return;
  }

  try {
    if (!window.echarts) {
      throw new Error("Biblioteka ECharts nie została załadowana.");
    }

    const rows = await loadWeightedRows();
    const dataset = buildProfessionRaceDataset(rows);
    const chart = renderProfessionRaceChart(dataset);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationRunId = 0;

    if (!chart) {
      return;
    }

    raceStatusElement.hidden = true;

    const play = async () => {
      const runId = ++animationRunId;
      renderProfessionRace("7", dataset, chart, false);
      if (reducedMotion) {
        renderProfessionRace("8", dataset, chart, false);
        return;
      }

      await wait(1500);
      if (runId !== animationRunId) {
        return;
      }

      for (let termIndex = 1; termIndex < TERM_ORDER.length; termIndex += 1) {
        const previousTerm = TERM_ORDER[termIndex - 1];
        const nextTerm = TERM_ORDER[termIndex];
        const order = getProfessionRaceOrder(previousTerm, dataset);
        const targetOrder = getProfessionRaceOrder(nextTerm, dataset);
        const fromValues = getProfessionRaceValues(previousTerm, order, dataset);
        const toValues = getProfessionRaceValues(nextTerm, order, dataset);
        const valuesCompleted = await animateBarValues(
          chart,
          order,
          fromValues,
          toValues,
          VALUE_ANIMATION_DURATION,
          runId,
          () => animationRunId,
        );

        if (!valuesCompleted) {
          return;
        }

        const rankingCompleted = await animateRaceRanking(
          chart,
          order,
          targetOrder,
          toValues,
          runId,
          () => animationRunId,
        );

        if (!rankingCompleted) {
          return;
        }

        setProfessionRaceTerm(nextTerm);
        await wait(TERM_PAUSE);
        if (runId !== animationRunId) {
          return;
        }
      }
    };

    raceReplayElement?.addEventListener("click", play);
    play();
    window.addEventListener("resize", () => chart.resize());
  } catch (error) {
    raceStatusElement.textContent = `${error.message} Nie udało się załadować animacji.`;
    raceStatusElement.classList.add("is-error");
  }
}

function buildDataset(rows) {
  const byGroupAndTerm = new Map();

  rows.forEach((row) => {
    const term = row.term;
    const group = row.profession_group_web;
    const mpCount = Number(row.mp_count);
    const denominator = Number(row.denominator_mp_count);
    const percent = Number(row.presence_share_percent);

    if (!TERM_ORDER.includes(term) || !group) {
      return;
    }

    if (
      !Number.isFinite(mpCount)
      || !Number.isFinite(denominator)
      || !Number.isFinite(percent)
    ) {
      throw new Error("CSV zawiera nieprawidłowe wartości liczbowe.");
    }

    byGroupAndTerm.set(`${group}::${term}`, {
      term,
      group,
      mpCount,
      percent,
      denominator,
      termLabel: TERM_STYLES[term].shortLabel,
    });
  });

  const groupsInData = Array.from(
    new Set(
      rows
        .map((row) => row.profession_group_web)
        .filter((group) => group && !HIDDEN_GROUPS.has(group)),
    ),
  );
  const orderedGroups = GROUP_ORDER.filter((group) => groupsInData.includes(group));
  const extraGroups = groupsInData
    .filter((group) => !GROUP_ORDER.includes(group))
    .sort((a, b) => a.localeCompare(b, "pl"));

  return {
    groups: [...orderedGroups, ...extraGroups],
    byGroupAndTerm,
  };
}

function getYAxisMax(dataset) {
  const values = Array.from(dataset.byGroupAndTerm.values()).map((row) => row.percent);
  const maxValue = Math.max(...values, 0);
  return Math.max(5, Math.ceil(maxValue / 5) * 5);
}

function buildTooltip(params, dataset) {
  const group = params[0]?.axisValue || "";
  const lines = [`<strong>${group}</strong>`];

  TERM_ORDER.forEach((term) => {
    const row = dataset.byGroupAndTerm.get(`${group}::${term}`);
    const style = TERM_STYLES[term];
    const label = row?.termLabel || style.shortLabel;
    const mpCount = row ? row.mpCount : 0;
    const denominator = row ? row.denominator : 0;
    const percent = row ? row.percent : 0;

    lines.push(
      `<div class="chart-tooltip-row">
        <span class="chart-tooltip-dot" style="background:${style.color}"></span>
        <span>
          <b>${label} kadencja</b><br>
          ${formatCount(mpCount)} z ${formatCount(denominator)} posłów<br>
          ${formatPercent(percent)}
        </span>
      </div>`,
    );
  });

  return lines.join("");
}

function renderChart(dataset) {
  if (!chartElement) {
    return;
  }

  if (!window.echarts) {
    throw new Error("Biblioteka ECharts nie została załadowana.");
  }

  const chart = window.echarts.init(chartElement, null, { renderer: "svg" });
  const isNarrow = window.matchMedia("(max-width: 760px)").matches;

  chart.setOption({
    color: TERM_ORDER.map((term) => TERM_STYLES[term].color),
    animationDuration: 650,
    grid: {
      left: isNarrow ? 70 : 90,
      right: isNarrow ? 28 : 36,
      top: isNarrow ? 88 : 90,
      bottom: isNarrow ? 140 : 135,
      containLabel: true,
    },
    legend: {
      top: 0,
      left: 0,
      itemGap: 24,
      icon: "roundRect",
      textStyle: {
        color: "#1c3158",
        fontSize: 13,
        fontWeight: 700,
      },
      data: TERM_ORDER.map((term) => TERM_STYLES[term].shortLabel),
    },
    tooltip: {
      trigger: "axis",
      confine: true,
      appendToBody: true,
      axisPointer: {
        type: "shadow",
        shadowStyle: {
          color: "rgba(15, 34, 71, 0.06)",
        },
      },
      borderWidth: 0,
      extraCssText:
        "box-shadow:0 16px 38px rgba(15,34,71,.16);border-radius:14px;padding:14px 16px;max-width:320px;",
      textStyle: {
        color: "#0f2247",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      formatter: (params) => buildTooltip(params, dataset),
    },
    xAxis: {
      type: "category",
      data: dataset.groups,
      axisTick: { show: false },
      axisLine: {
        lineStyle: { color: "rgba(15, 34, 71, 0.18)" },
      },
      axisLabel: {
        color: "#34415a",
        fontSize: isNarrow ? 12 : 13,
        fontWeight: 700,
        interval: 0,
        lineHeight: 17,
        margin: 18,
        rotate: 0,
        formatter: (value) => GROUP_AXIS_LABELS[value] || value,
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(15, 34, 71, 0.025)", "rgba(255, 255, 255, 0)"],
        },
      },
    },
    yAxis: {
      type: "value",
      name: "Odsetek posłów danej kadencji (%)",
      nameLocation: "middle",
      nameGap: 44,
      max: getYAxisMax(dataset),
      interval: 5,
      axisLabel: {
        color: "#59657a",
        formatter: "{value}%",
      },
      splitLine: {
        lineStyle: {
          color: "rgba(15, 34, 71, 0.1)",
        },
      },
    },
    dataZoom: isNarrow
      ? [
          {
            type: "inside",
            start: 0,
            end: 48,
            zoomLock: false,
          },
          {
            type: "slider",
            height: 22,
            bottom: 20,
            start: 0,
            end: 48,
            brushSelect: false,
            borderColor: "rgba(15, 34, 71, 0.16)",
            fillerColor: "rgba(104, 137, 169, 0.18)",
            handleStyle: {
              color: "#6889A9",
            },
          },
        ]
      : [],
    series: TERM_ORDER.map((term) => ({
      name: TERM_STYLES[term].shortLabel,
      type: "bar",
      barMaxWidth: isNarrow ? 18 : 24,
      barGap: "12%",
      barCategoryGap: isNarrow ? "38%" : "34%",
      itemStyle: {
        opacity: 0.92,
        borderRadius: [7, 7, 0, 0],
      },
      label: {
        show: false,
      },
      emphasis: {
        focus: "series",
      },
      data: dataset.groups.map((group) => {
        const row = dataset.byGroupAndTerm.get(`${group}::${term}`);
        return row ? Number(row.percent.toFixed(3)) : 0;
      }),
    })),
  });

  window.addEventListener("resize", () => {
    chart.resize();
  });

  return chart;
}

function buildWeightedDonutDataset(rows) {
  const byTerm = new Map();

  rows.forEach((row) => {
    const term = row.term;
    const group = row.profession_group_web;
    const value = Number(row.weighted_share_percent);
    const weightedMpCount = Number(row.weighted_mp_count);
    const denominator = Number(row.denominator_mp_count);
    const percent = Number(row.weighted_share_percent);

    if (!TERM_ORDER.includes(term) || !group || HIDDEN_GROUPS.has(group)) {
      return;
    }

    if (
      !Number.isFinite(value)
      || !Number.isFinite(weightedMpCount)
      || !Number.isFinite(denominator)
      || !Number.isFinite(percent)
    ) {
      throw new Error("CSV ważony zawiera nieprawidłowe wartości liczbowe.");
    }

    if (!byTerm.has(term)) {
      byTerm.set(term, []);
    }

    byTerm.get(term).push({
      group,
      value,
      weightedMpCount,
      denominator,
      percent,
    });
  });

  const dataset = new Map();

  TERM_ORDER.forEach((term) => {
    const rowsForTerm = byTerm.get(term) || [];
    const byGroup = new Map(rowsForTerm.map((row) => [row.group, row]));
    const orderedRows = GROUP_ORDER
      .filter((group) => byGroup.has(group))
      .map((group) => byGroup.get(group));
    const extraRows = rowsForTerm
      .filter((row) => !GROUP_ORDER.includes(row.group))
      .sort((a, b) => a.group.localeCompare(b.group, "pl"));

    dataset.set(term, [...orderedRows, ...extraRows]);
  });

  return dataset;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildDonutDisplayData(data) {
  const sortedRows = [...data].sort((a, b) => {
    if (b.percent !== a.percent) {
      return b.percent - a.percent;
    }

    return a.group.localeCompare(b.group, "pl");
  });
  const topRows = sortedRows.slice(0, DONUT_TOP_GROUP_COUNT);
  const otherRows = sortedRows.slice(DONUT_TOP_GROUP_COUNT);

  if (otherRows.length === 0) {
    return {
      segments: topRows,
      topRows,
      otherSegment: null,
      otherRows,
    };
  }

  const denominator = otherRows[0]?.denominator || topRows[0]?.denominator || 0;
  const otherSegment = {
    group: DONUT_OTHER_GROUP,
    value: otherRows.reduce((sum, row) => sum + row.value, 0),
    weightedMpCount: otherRows.reduce((sum, row) => sum + row.weightedMpCount, 0),
    denominator,
    percent: otherRows.reduce((sum, row) => sum + row.percent, 0),
    color: DONUT_OTHER_COLOR,
    breakdown: otherRows,
  };

  return {
    segments: [...topRows, otherSegment],
    topRows,
    otherSegment,
    otherRows,
  };
}

function renderDonutTopList(term, displayData) {
  const listElement = document.getElementById(DONUT_TOP_LISTS[term]);

  if (!listElement) {
    return;
  }

  const { topRows, otherSegment, otherRows } = displayData;

  function createRankingItem(row, options = {}) {
    const { rankLabel = "", isLeading = false, isOther = false } = options;
    const item = document.createElement("li");
    const rowElement = document.createElement("div");
    const main = document.createElement("div");
    const rank = document.createElement("span");
    const dot = document.createElement("span");
    const name = document.createElement("span");
    const value = document.createElement("span");
    const track = document.createElement("div");
    const fill = document.createElement("div");
    const color = row.color || GROUP_COLORS[row.group] || GROUP_COLORS.Inne;
    const barWidth = Math.max(0, Math.min(row.percent, 100));

    item.className = "donut-top-item";
    item.classList.toggle("is-leading", isLeading);
    item.classList.toggle("is-other", isOther);
    rowElement.className = "donut-top-row";
    main.className = "donut-top-main";
    rank.className = "donut-rank";
    rank.textContent = rankLabel;
    dot.className = "dot";
    dot.style.backgroundColor = color;
    name.className = "name";
    name.textContent = row.group;
    value.className = "value";
    value.textContent = formatPercent(row.percent);
    track.className = "donut-bar-track";
    fill.className = "donut-bar-fill";
    fill.style.width = `${barWidth}%`;
    fill.style.backgroundColor = color;

    main.append(rank, dot, name);
    rowElement.append(main, value);
    track.append(fill);
    item.append(rowElement, track);

    return item;
  }

  const listItems = topRows.map((row, index) => (
    createRankingItem(row, {
      rankLabel: String(index + 1),
      isLeading: index === 0,
    })
  ));

  if (otherSegment) {
    const breakdown = document.createElement("li");
    const otherItem = createRankingItem(otherSegment, {
      rankLabel: "+",
      isOther: true,
    });

    breakdown.className = "breakdown";
    breakdown.textContent = `W pozostałych: ${otherRows
      .map((row) => `${row.group} ${formatPercent(row.percent)}`)
      .join(", ")}`;

    listItems.push(otherItem, breakdown);
  }

  listElement.setAttribute("aria-label", `Pięć największych grup w kadencji ${TERM_STYLES[term].shortLabel}`);
  listElement.replaceChildren(...listItems);
}

function renderDonutChart(term, data) {
  const element = document.getElementById(DONUT_CONTAINERS[term]);

  if (!element) {
    return null;
  }

  if (!window.echarts) {
    throw new Error("Biblioteka ECharts nie została załadowana.");
  }

  const chart = window.echarts.init(element, null, { renderer: "svg" });
  const termLabel = TERM_STYLES[term].shortLabel;
  const displayData = buildDonutDisplayData(data);

  renderDonutTopList(term, displayData);

  chart.setOption({
    color: displayData.segments.map((row) => row.color || GROUP_COLORS[row.group] || GROUP_COLORS.Inne),
    animationDuration: 650,
    tooltip: {
      trigger: "item",
      confine: true,
      appendToBody: true,
      borderWidth: 0,
      extraCssText:
        "box-shadow:0 16px 38px rgba(15,34,71,.16);border-radius:14px;padding:13px 15px;max-width:300px;",
      textStyle: {
        color: "#0f2247",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      formatter: (params) => {
        const row = params.data;
        const breakdown = row.breakdown?.length
          ? `<br><span class="tooltip-muted">${row.breakdown
              .map((item) => `${escapeHtml(item.group)} — ${formatPercent(item.percent)}`)
              .join("<br>")}</span>`
          : "";

        return `<strong>${escapeHtml(row.group)}</strong><br>
          ${formatPercent(row.percent)}<br>
          ważony udział: ${formatWeightedCount(row.weightedMpCount)}
          z ${formatCount(row.denominator)} posłów${breakdown}`;
      },
    },
    graphic: {
      type: "text",
      left: "center",
      top: "center",
      style: {
        text: termLabel,
        fill: "#0f2247",
        fontSize: 22,
        fontWeight: 800,
        textAlign: "center",
      },
    },
    series: [
      {
        name: `Kadencja ${termLabel}`,
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "52%"],
        avoidLabelOverlap: true,
        minAngle: 2,
        itemStyle: {
          borderColor: "#fffdf9",
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: (params) => DONUT_GROUP_LABELS[params.name] || params.name || "",
          color: "#0f2247",
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 16,
        },
        labelLine: {
          show: true,
          length: 14,
          length2: 10,
          lineStyle: {
            color: "rgba(15, 34, 71, 0.22)",
          },
        },
        emphasis: {
          scaleSize: 5,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(15, 34, 71, 0.16)",
          },
        },
        data: displayData.segments.map((row) => ({
          name: row.group,
          value: Number(row.value.toFixed(6)),
          group: row.group,
          weightedMpCount: row.weightedMpCount,
          denominator: row.denominator,
          percent: row.percent,
          breakdown: row.breakdown || [],
        })),
      },
    ],
  });

  return chart;
}

async function initProfessionDonuts() {
  const hasDonutContainer = TERM_ORDER.some((term) => (
    document.getElementById(DONUT_CONTAINERS[term])
  ));

  if (!hasDonutContainer) {
    return;
  }

  setDonutsStatus("Ładowanie wykresów kołowych...");

  try {
    const rows = await loadWeightedRows();
    const dataset = buildWeightedDonutDataset(rows);
    const charts = TERM_ORDER
      .map((term) => renderDonutChart(term, dataset.get(term) || []))
      .filter(Boolean);

    requestAnimationFrame(() => {
      charts.forEach((chart) => chart.resize());
      hideDonutsStatus();
    });

    window.addEventListener("resize", () => {
      charts.forEach((chart) => chart.resize());
    });
  } catch (error) {
    setDonutsStatus(
      `${error.message} Nie udało się załadować sekcji wykresów kołowych.`,
      true,
    );
  }
}

async function initProfessionChart() {
  if (!chartElement) {
    return;
  }

  showLoadingStatus("Ładowanie wykresu...");

  try {
    const csvText = await fetchText(CSV_PATH);
    const rows = parseCsv(csvText, PRESENCE_REQUIRED_COLUMNS);
    const dataset = buildDataset(rows);
    const chart = renderChart(dataset);

    requestAnimationFrame(() => {
      chart.resize();
      hideLoadingStatus();
    });
  } catch (error) {
    setStatus(
      `${error.message} Uruchom stronę przez lokalny serwer HTTP, ponieważ fetch nie działa poprawnie z adresu file://.`,
      true,
    );
  }
}

initProfessionChart();
initProfessionRace();
initProfessionDonuts();
