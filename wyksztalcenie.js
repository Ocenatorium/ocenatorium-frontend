const EDUCATION_TERMS_CSV_PATH = "./public/data/education_groups_web_by_term.csv";
const EDUCATION_CLUBS_CSV_PATH = "./public/data/education_groups_web_by_club_term.csv";

const TERM_ORDER = ["7", "8", "9", "10"];
const TERM_META = {
  7: { label: "VII", years: "2011–2015" },
  8: { label: "VIII", years: "2015–2019" },
  9: { label: "IX", years: "2019–2023" },
  10: { label: "X", years: "2023–2027" },
};

const EDUCATION_GROUPS = ["Wyższe", "Średnie", "Zasadnicze zawodowe", "Brak danych"];
const EDUCATION_LABEL_GROUPS = ["Wyższe", "Średnie"];
const EDUCATION_COLORS = {
  Wyższe: "#4E79A7",
  Średnie: "#A8C5E5",
  "Zasadnicze zawodowe": "#E0A34A",
  "Brak danych": "#C9BED1",
};

const RANKING_BAR_COLOR = EDUCATION_COLORS.Wyższe;
const OTHER_RANKING_BAR_COLOR = "#A8B0BD";

const TERMS_REQUIRED_COLUMNS = [
  "term",
  "education_group",
  "mp_count",
  "denominator_all",
  "share_all_percent",
  "denominator_known",
  "share_known_percent",
];

const CLUBS_REQUIRED_COLUMNS = [
  "term",
  "club",
  "club_mp_count",
  "education_group",
  "mp_count",
];

const termsChartElement = document.getElementById("educationTermsChart");
const termsReplayElement = document.getElementById("educationTermsReplay");
const termsStopElement = document.getElementById("educationTermsStop");
const storyTermTabs = Array.from(document.querySelectorAll(".education-story-term-tab"));
const higherRankingElement = document.getElementById("educationHigherRanking");
const termsStatusElement = document.getElementById("educationTermsStatus");
const rankingStatusElement = document.getElementById("educationRankingStatus");
const termTabs = Array.from(document.querySelectorAll(".education-term-tab"));
const currentTermElement = document.getElementById("educationCurrentTerm");
const rankingInsightElement = document.getElementById("educationRankingInsight");
const otherClubsElement = document.getElementById("educationOtherClubsList");
const overNinetyElement = document.getElementById("educationOverNinetyValue");
const termsConclusionElement = document.getElementById("educationTermsConclusion");
const termsConclusionTextElement = document.getElementById("educationTermsConclusionText");

let clubsRows = [];
let termsChart = null;
let termsRows = [];
let termsAnimationRunId = 0;
let termsAnimationControls = null;
let termsAnimationTargetTerm = "10";

const TERMS_SEGMENT_DURATIONS = {
  Wyższe: 2400,
  Średnie: 1600,
  "Zasadnicze zawodowe": 800,
  "Brak danych": 800,
};
const TERMS_INITIAL_PAUSE = 350;
const TERMS_AFTER_TERM_PAUSE = 1300;
const TERMS_FRAME_MS = 32;

function setStatus(element, message, isError = false) {
  if (!element) {
    return;
  }

  element.hidden = !message;
  element.textContent = message;
  element.classList.toggle("is-error", isError);
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

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

function getEducationLabelColor(group) {
  return group === "Wyższe" ? "#fffdf9" : "#0f2247";
}

function shouldShowEducationPercentLabel(group, value) {
  if (group === "Wyższe") {
    return value >= 8;
  }

  if (group === "Średnie") {
    return value >= 0.4;
  }

  return false;
}

function getTermTitle(term) {
  return `Kadencja ${TERM_META[term].label}`;
}

function getTermAxisLabel(term) {
  return TERM_META[term].label;
}

function normalizeTermRows(rows) {
  return rows.map((row) => ({
    term: row.term,
    educationGroup: row.education_group,
    mpCount: Number(row.mp_count),
    denominatorAll: Number(row.denominator_all),
    shareAllPercent: Number(row.share_all_percent),
    denominatorKnown: Number(row.denominator_known),
    shareKnownPercent: row.share_known_percent === "" ? null : Number(row.share_known_percent),
  }));
}

function normalizeClubRows(rows) {
  return rows.map((row) => ({
    term: row.term,
    club: row.club || "Brak danych o klubie",
    clubMpCount: Number(row.club_mp_count),
    educationGroup: row.education_group,
    mpCount: Number(row.mp_count),
  }));
}

function getVisibleEducationGroups(rows) {
  return EDUCATION_GROUPS.filter((group) => (
    group !== "Inne"
    && rows.some((row) => row.educationGroup === group && row.mpCount > 0)
  ));
}

function indexByTermAndGroup(rows) {
  const map = new Map();
  rows.forEach((row) => {
    map.set(`${row.term}::${row.educationGroup}`, row);
  });
  return map;
}

function getTermsDisplayValues(rows, currentTerm = null, currentGroup = null, progress = 1) {
  const byTermAndGroup = indexByTermAndGroup(rows);
  const values = new Map();

  EDUCATION_GROUPS.forEach((group) => {
    values.set(group, TERM_ORDER.map((term) => {
      const row = byTermAndGroup.get(`${term}::${group}`);
      const finalValue = row ? Number(row.shareAllPercent.toFixed(3)) : 0;
      const termIndex = TERM_ORDER.indexOf(term);
      const currentTermIndex = currentTerm ? TERM_ORDER.indexOf(currentTerm) : TERM_ORDER.length;
      const groupIndex = EDUCATION_GROUPS.indexOf(group);
      const currentGroupIndex = currentGroup ? EDUCATION_GROUPS.indexOf(currentGroup) : EDUCATION_GROUPS.length;

      if (termIndex < currentTermIndex) {
        return finalValue;
      }

      if (termIndex > currentTermIndex) {
        return 0;
      }

      if (!currentTerm || !currentGroup) {
        return finalValue;
      }

      if (groupIndex < currentGroupIndex) {
        return finalValue;
      }

      if (group === currentGroup) {
        return Number((finalValue * progress).toFixed(3));
      }

      return 0;
    }));
  });

  return values;
}

function buildTermsOption(rows, options = {}) {
  const groups = getVisibleEducationGroups(rows);
  const byTermAndGroup = indexByTermAndGroup(rows);
  const isNarrow = window.matchMedia("(max-width: 760px)").matches;
  const displayValues = options.displayValues || getTermsDisplayValues(rows);
  const showLabels = options.showLabels !== false;
  const animationCurrentTerm = options.animationCurrentTerm || null;
  const animationCurrentGroup = options.animationCurrentGroup || null;
  const animationCurrentTermIndex = animationCurrentTerm ? TERM_ORDER.indexOf(animationCurrentTerm) : -1;
  const animationCurrentGroupIndex = animationCurrentGroup ? EDUCATION_GROUPS.indexOf(animationCurrentGroup) : -1;

  return {
    color: groups.map((group) => EDUCATION_COLORS[group]),
    animation: options.animation !== false,
    animationDuration: options.animationDuration ?? 600,
    animationDurationUpdate: options.animationDurationUpdate ?? 600,
    animationEasingUpdate: "cubicOut",
    grid: {
      left: isNarrow ? 54 : 70,
      right: isNarrow ? 34 : 42,
      top: 64,
      bottom: isNarrow ? 28 : 34,
      containLabel: true,
    },
    legend: {
      top: 0,
      left: 0,
      itemGap: 18,
      icon: "roundRect",
      textStyle: {
        color: "#1c3158",
        fontSize: isNarrow ? 12 : 13,
        fontWeight: 750,
      },
      data: groups,
    },
    graphic: {
      elements: [
        {
          type: "text",
          left: isNarrow ? 28 : 42,
          top: 42,
          silent: true,
          style: {
            text: "Kadencja",
            fill: "#6b7588",
            font: `${isNarrow ? 11 : 12}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
            fontWeight: 750,
          },
        },
      ],
    },
    tooltip: {
      trigger: "item",
      confine: true,
      appendToBody: true,
      borderWidth: 0,
      extraCssText:
        "box-shadow:0 16px 38px rgba(15,34,71,.16);border-radius:14px;padding:14px 16px;max-width:320px;",
      textStyle: {
        color: "#0f2247",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },
      formatter: (params) => {
        const row = byTermAndGroup.get(`${params.name}::${params.seriesName}`);
        if (!row) {
          return "";
        }

        const percent = row.educationGroup === "Brak danych"
          ? row.shareAllPercent
          : row.shareKnownPercent;
        const denominatorText = row.educationGroup === "Brak danych"
          ? "wszystkich posłów kadencji"
          : "wśród posłów ze znanym wykształceniem";
        const unit = row.educationGroup === "Brak danych" ? "osoby" : "posłów";

        return `<strong>${getTermTitle(row.term)}</strong><br>${row.educationGroup}<br><br>
          ${formatCount(row.mpCount)} ${unit}<br>
          ${formatPercent(percent || 0)} ${denominatorText}`;
      },
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: {
        color: "#59657a",
        formatter: "{value}%",
      },
      splitLine: {
        lineStyle: { color: "rgba(15, 34, 71, 0.1)" },
      },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: TERM_ORDER,
      axisTick: { show: false },
      axisLine: {
        lineStyle: { color: "rgba(15, 34, 71, 0.14)" },
      },
      axisLabel: {
        color: "#0f2247",
        fontSize: isNarrow ? 13 : 14,
        fontWeight: 850,
        formatter: getTermAxisLabel,
      },
    },
    series: [
      {
        name: "Tło",
        type: "bar",
        barWidth: isNarrow ? 34 : 42,
        barGap: "-100%",
        silent: true,
        tooltip: { show: false },
        itemStyle: {
          color: "rgba(78, 121, 167, 0.09)",
          borderRadius: [8, 8, 8, 8],
        },
        emphasis: { disabled: true },
        z: 0,
        data: TERM_ORDER.map(() => 100),
      },
      ...groups.map((group, index) => ({
      name: group,
      type: "bar",
      stack: "education",
      barGap: index === 0 ? "-100%" : undefined,
      barWidth: isNarrow ? 34 : 42,
      z: 2,
      itemStyle: {
        color: EDUCATION_COLORS[group],
        borderRadius: group === "Brak danych" ? [0, 8, 8, 0] : 0,
      },
      label: {
        show: EDUCATION_LABEL_GROUPS.includes(group) && (showLabels || Boolean(animationCurrentTerm)),
        position: group === "Średnie" ? "insideLeft" : "inside",
        color: getEducationLabelColor(group),
        fontSize: isNarrow ? 12 : 13,
        fontWeight: 900,
        distance: group === "Średnie" ? 4 : 0,
        formatter: (params) => {
          if (animationCurrentTerm) {
            const termIndex = TERM_ORDER.indexOf(params.name);
            const groupIndex = EDUCATION_GROUPS.indexOf(group);
            if (termIndex < animationCurrentTermIndex) {
              return shouldShowEducationPercentLabel(group, params.value)
                ? formatPercent(params.value)
                : "";
            }

            if (termIndex === animationCurrentTermIndex) {
              if (groupIndex <= animationCurrentGroupIndex) {
                return shouldShowEducationPercentLabel(group, params.value)
                  ? formatPercent(params.value)
                  : "";
              }

              return "";
            }

            return "";
          }

          return shouldShowEducationPercentLabel(group, params.value)
            ? formatPercent(params.value)
            : "";
        },
      },
      data: TERM_ORDER.map((term) => {
        const values = displayValues.get(group);
        return values ? values[TERM_ORDER.indexOf(term)] : 0;
      }),
    }))],
  };
}

function updateCallouts(rows) {
  const higherRows = rows.filter((row) => row.educationGroup === "Wyższe");
  const topRow = higherRows.reduce((best, row) => (
    !best || row.shareAllPercent > best.shareAllPercent ? row : best
  ), null);
  const allAboveNinety = higherRows.every((row) => row.shareAllPercent > 90);

  if (overNinetyElement) {
    overNinetyElement.textContent = allAboveNinety
      ? "Ponad 90% w każdej kadencji"
      : `Najwyżej ${topRow ? formatPercent(topRow.shareAllPercent) : ""}`;
  }

  if (termsConclusionTextElement && topRow) {
    termsConclusionTextElement.textContent = `Wyższe wykształcenie zdecydowanie dominuje, a najwyższy udział widać w ${TERM_META[topRow.term].label} kadencji — ${formatPercent(topRow.shareAllPercent)}.`;
  }
}

function getClubRowsForTerm(rows, term) {
  return rows.filter((row) => row.term === term && EDUCATION_GROUPS.includes(row.educationGroup));
}

function buildClubTotals(rowsForTerm) {
  const clubs = new Map();

  rowsForTerm.forEach((row) => {
    if (!clubs.has(row.club)) {
      clubs.set(row.club, {
        club: row.club,
        total: row.clubMpCount,
        counts: new Map(EDUCATION_GROUPS.map((group) => [group, 0])),
      });
    }

    const club = clubs.get(row.club);
    club.total = Math.max(club.total, row.clubMpCount);
    club.counts.set(row.educationGroup, (club.counts.get(row.educationGroup) || 0) + row.mpCount);
  });

  return Array.from(clubs.values()).sort((a, b) => b.total - a.total || a.club.localeCompare(b.club, "pl"));
}

function getKnownEducationCount(counts) {
  return Array.from(counts.entries())
    .filter(([group]) => group !== "Brak danych")
    .reduce((sum, [, count]) => sum + count, 0);
}

function buildRankingRow(club, options = {}) {
  const higherCount = club.counts.get("Wyższe") || 0;
  const missingCount = club.counts.get("Brak danych") || 0;
  const knownCount = getKnownEducationCount(club.counts);

  return {
    club: club.club,
    clubMpCount: club.total,
    higherCount,
    knownCount,
    missingCount,
    higherSharePercent: knownCount > 0 ? (higherCount / knownCount) * 100 : 0,
    isOther: Boolean(options.isOther),
    includedClubNames: options.includedClubNames || [],
  };
}

function buildOtherClubsRow(otherClubs) {
  const counts = new Map();

  otherClubs.forEach((club) => {
    club.counts.forEach((count, group) => {
      counts.set(group, (counts.get(group) || 0) + count);
    });
  });

  return buildRankingRow({
    club: "Inne kluby",
    total: otherClubs.reduce((sum, club) => sum + club.total, 0),
    counts,
  }, {
    isOther: true,
    includedClubNames: otherClubs.map((club) => club.club).filter(Boolean),
  });
}

function buildClubRankingDataset(rows, term) {
  const clubTotals = buildClubTotals(getClubRowsForTerm(rows, term));
  const topClubs = clubTotals.slice(0, 5);
  const otherClubs = clubTotals.slice(5);

  const topRankingRows = topClubs.map((club) => buildRankingRow(club));

  topRankingRows.sort((a, b) => (
    b.higherSharePercent - a.higherSharePercent
    || b.knownCount - a.knownCount
    || a.club.localeCompare(b.club, "pl")
  ));

  const otherRow = otherClubs.length > 0 ? buildOtherClubsRow(otherClubs) : null;
  const rankingRows = otherRow ? [...topRankingRows, otherRow] : topRankingRows;

  return {
    rankingRows,
    topRankingRows,
    otherClubNames: otherClubs.map((club) => club.club).filter(Boolean),
    topClubNames: topClubs.map((club) => club.club),
  };
}

function getPersonUnit(count) {
  const absoluteCount = Math.abs(count);
  const lastTwoDigits = absoluteCount % 100;
  const lastDigit = absoluteCount % 10;

  if (absoluteCount === 1) {
    return "osoba";
  }

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) {
    return "osoby";
  }

  return "osób";
}

function getDeputyUnit(count) {
  return Math.abs(count) === 1 ? "poseł" : "posłów";
}

function formatClubNames(names) {
  if (names.length <= 1) {
    return names.join("");
  }

  if (names.length === 2) {
    return `${names[0]} i ${names[1]}`;
  }

  return `${names.slice(0, -1).join(", ")} i ${names[names.length - 1]}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function buildRankingTooltip(row) {
  const missingText = row.missingCount > 0
    ? `<br><span class="tooltip-muted">Brak danych o wykształceniu: ${formatCount(row.missingCount)} ${getPersonUnit(row.missingCount)}</span>`
    : "";
  const includedClubsText = row.isOther && row.includedClubNames.length > 0
    ? `<br><br><span class="tooltip-muted">Obejmuje:<br>${escapeHtml(row.includedClubNames.join(", "))}</span>`
    : "";

  return `
    <div class="education-ranking-tooltip" role="tooltip">
      <strong>${escapeHtml(row.club)}</strong><br>
      Wyższe wykształcenie<br><br>
      ${formatCount(row.higherCount)} z ${formatCount(row.knownCount)} posłów z podanym wykształceniem<br>
      ${formatPercent(row.higherSharePercent)}
      ${missingText}
      ${includedClubsText}
    </div>
  `;
}

function renderTermsFinal(animate = true) {
  if (!termsChart || termsRows.length === 0) {
    return;
  }

  termsChart.setOption(buildTermsOption(termsRows, {
    animation: animate,
    animationDuration: animate ? 600 : 0,
    animationDurationUpdate: animate ? 600 : 0,
    showLabels: true,
  }), true);
}

function renderTermsThrough(term) {
  if (!termsChart || termsRows.length === 0) {
    return;
  }
  termsAnimationTargetTerm = term;
  termsAnimationControls?.setActiveTerm(term);
  termsChart.setOption(buildTermsOption(termsRows, {
    displayValues: getTermsDisplayValues(termsRows, term, EDUCATION_GROUPS.at(-1), 1),
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    showLabels: true,
    animationCurrentTerm: term,
    animationCurrentGroup: EDUCATION_GROUPS.at(-1),
  }), true);
  if (term === "10") showTermsConclusion();
  else hideTermsConclusion();
}

function stopTermsStoryAnimation() {
  termsAnimationRunId += 1;
  renderTermsThrough(termsAnimationTargetTerm);
  termsAnimationControls?.setPlaying(false);
}

function hideTermsConclusion() {
  if (!termsConclusionElement) {
    return;
  }

  termsConclusionElement.hidden = true;
  termsConclusionElement.classList.add("is-hidden");
}

function showTermsConclusion() {
  if (!termsConclusionElement) {
    return;
  }

  termsConclusionElement.hidden = false;
  requestAnimationFrame(() => {
    termsConclusionElement.classList.remove("is-hidden");
  });
}

function renderTermsAnimationFrame(term, group, progress, runId) {
  if (!termsChart || runId !== termsAnimationRunId) {
    return false;
  }

  termsChart.setOption(buildTermsOption(termsRows, {
    displayValues: getTermsDisplayValues(termsRows, term, group, progress),
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    showLabels: false,
    animationCurrentTerm: term,
    animationCurrentGroup: group,
  }), true);
  return true;
}

function animateTermsSegment(term, group, duration, runId) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    const step = (now) => {
      if (runId !== termsAnimationRunId) {
        resolve(false);
        return;
      }

      const rawProgress = Math.max(0, Math.min((now - startedAt) / duration, 1));
      const progress = easeOutCubic(rawProgress);
      renderTermsAnimationFrame(term, group, progress, runId);

      if (rawProgress < 1) {
        window.setTimeout(() => requestAnimationFrame(step), TERMS_FRAME_MS);
      } else {
        resolve(true);
      }
    };

    requestAnimationFrame(step);
  });
}

async function playTermsStoryAnimation() {
  if (!termsChart || termsRows.length === 0) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    termsAnimationRunId += 1;
    renderTermsFinal(false);
    termsAnimationTargetTerm = "10";
    termsAnimationControls?.setActiveTerm("10");
    showTermsConclusion();
    termsAnimationControls?.setPlaying(false);
    return;
  }

  const runId = ++termsAnimationRunId;
  hideTermsConclusion();
  termsAnimationControls?.setPlaying(true);
  termsAnimationTargetTerm = "7";
  termsAnimationControls?.setActiveTerm("7");
  termsChart.setOption(buildTermsOption(termsRows, {
    displayValues: getTermsDisplayValues(termsRows, "7", "Wyższe", 0),
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    showLabels: false,
    animationCurrentTerm: "7",
    animationCurrentGroup: "Wyższe",
  }), true);

  await wait(TERMS_INITIAL_PAUSE);
  if (runId !== termsAnimationRunId) {
    return;
  }

  for (const term of TERM_ORDER) {
    termsAnimationTargetTerm = term;
    termsAnimationControls?.setActiveTerm(term);
    for (const group of EDUCATION_GROUPS) {
      const completed = await animateTermsSegment(
        term,
        group,
        TERMS_SEGMENT_DURATIONS[group],
        runId,
      );

      if (!completed) {
        return;
      }
    }

    await wait(TERMS_AFTER_TERM_PAUSE);
    if (runId !== termsAnimationRunId) {
      return;
    }
  }

  renderTermsFinal(false);
  showTermsConclusion();
  termsAnimationControls?.setPlaying(false);
}

function renderTermsChart(rows) {
  if (!termsChartElement || !window.echarts) {
    return;
  }

  termsRows = rows;
  termsChart = window.echarts.init(termsChartElement, null, { renderer: "svg" });
  termsAnimationControls = window.AnalysisAnimationControls?.create({
    buttons: storyTermTabs,
    replayButton: termsReplayElement,
    stopButton: termsStopElement,
    onSelect: (term) => {
      termsAnimationRunId += 1;
      renderTermsThrough(term);
      termsAnimationControls?.setPlaying(false);
    },
    onStop: stopTermsStoryAnimation,
    onReplay: playTermsStoryAnimation,
  });
  window.addEventListener("resize", () => {
    renderTermsFinal(false);
    termsChart.resize();
  });
  requestAnimationFrame(() => {
    termsChart.resize();
    setStatus(termsStatusElement, "");
    playTermsStoryAnimation();
  });
}

function updateTermButtons(term) {
  termTabs.forEach((button) => {
    const isActive = button.dataset.term === term;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function updateCurrentTerm(term) {
  if (!currentTermElement) {
    return;
  }

  currentTermElement.textContent = `Kadencja ${TERM_META[term].label} · ${TERM_META[term].years}`;
}

function updateOtherClubsList(dataset) {
  if (!otherClubsElement) {
    return;
  }

  if (dataset.otherClubNames.length === 0) {
    otherClubsElement.textContent = "Inne kluby obejmują: brak.";
    return;
  }

  otherClubsElement.textContent = `Inne kluby obejmują: ${dataset.otherClubNames.join(", ")}.`;
}

function updateRankingInsight(dataset) {
  if (!rankingInsightElement) {
    return;
  }

  if (dataset.topRankingRows.length === 0) {
    rankingInsightElement.textContent = "";
    return;
  }

  const leaders = dataset.topRankingRows.filter((row) => (
    Math.abs(row.higherSharePercent - dataset.topRankingRows[0].higherSharePercent) < 0.000001
  ));
  if (leaders.length === 0) {
    rankingInsightElement.textContent = "";
    return;
  }

  rankingInsightElement.textContent = `Najwyższy udział w tej kadencji: ${formatClubNames(leaders.map((row) => row.club))} — ${formatPercent(leaders[0].higherSharePercent)}.`;
}

function renderHigherRanking(dataset) {
  if (!higherRankingElement) {
    return;
  }

  higherRankingElement.innerHTML = dataset.rankingRows.map((row) => {
    const percent = Math.max(0, Math.min(100, row.higherSharePercent));
    const safeClub = escapeHtml(row.club);
    const visibleCount = `${formatCount(row.knownCount)} ${getDeputyUnit(row.knownCount)} z podanym wykształceniem`;
    const label = `${row.club}: ${formatPercent(row.higherSharePercent)}, ${formatCount(row.higherCount)} z ${formatCount(row.knownCount)} posłów z podanym wykształceniem`;
    const barColor = row.isOther ? OTHER_RANKING_BAR_COLOR : RANKING_BAR_COLOR;

    return `
      <article class="education-ranking-row${row.isOther ? " is-other" : ""}" tabindex="0" aria-label="${escapeHtml(label)}">
        <div class="education-ranking-label">
          <strong>${safeClub}</strong>
          <span>${visibleCount}</span>
        </div>
        <div class="education-ranking-track" aria-hidden="true">
          <span class="education-ranking-fill" style="width: ${percent}%; background: ${barColor};"></span>
        </div>
        <strong class="education-ranking-value">${formatPercent(row.higherSharePercent)}</strong>
        ${buildRankingTooltip(row)}
      </article>
    `;
  }).join("");
}

function updateClubsChart(term) {
  if (!higherRankingElement || clubsRows.length === 0) {
    return;
  }

  const dataset = buildClubRankingDataset(clubsRows, term);
  renderHigherRanking(dataset);
  updateTermButtons(term);
  updateCurrentTerm(term);
  updateRankingInsight(dataset);
  updateOtherClubsList(dataset);
  requestAnimationFrame(() => setStatus(rankingStatusElement, ""));
}

function renderClubsChart(rows) {
  if (!higherRankingElement) {
    return;
  }

  clubsRows = rows;
  updateClubsChart("10");
}

function bindTermTabs() {
  termTabs.forEach((button) => {
    button.addEventListener("click", () => {
      updateClubsChart(button.dataset.term);
    });
  });
}

async function initEducationPage() {
  if (!termsChartElement && !higherRankingElement) {
    return;
  }

  if (!window.echarts) {
    setStatus(termsStatusElement, "Biblioteka ECharts nie została załadowana.", true);
  }

  setStatus(termsStatusElement, "Ładowanie wykresu...");
  setStatus(rankingStatusElement, "Ładowanie rankingu...");
  bindTermTabs();

  try {
    const [termsCsv, clubsCsv] = await Promise.all([
      fetchText(EDUCATION_TERMS_CSV_PATH),
      fetchText(EDUCATION_CLUBS_CSV_PATH),
    ]);
    const termRows = normalizeTermRows(parseCsv(termsCsv, TERMS_REQUIRED_COLUMNS));
    const clubRows = normalizeClubRows(parseCsv(clubsCsv, CLUBS_REQUIRED_COLUMNS));

    updateCallouts(termRows);
    renderTermsChart(termRows);
    renderClubsChart(clubRows);
  } catch (error) {
    const message = `${error.message} Uruchom stronę przez lokalny serwer HTTP, ponieważ fetch nie działa poprawnie z adresu file://.`;
    setStatus(termsStatusElement, message, true);
    setStatus(rankingStatusElement, message, true);
  }
}

initEducationPage();
