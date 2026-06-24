async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
function render(items) {
  const root = document.getElementById("root");
  root.innerHTML = `<table class="table"><thead><tr><th>Imie i nazwisko</th><th> wykształcenie</th><th> zawód</th><th>Klub</th></tr></thead>
  <tbody>${items
    .map(
      (x) =>
        `<tr><td>${x.firstLastName}</td><td>${x.educationLevel}</td><td>${x.profession}</td><td>${x.club}</td></tr>`
    )
    .join("")}</tbody></table>`;
}

// ===== WYKRES: liczba posłów wg profesji =====

function normalizeProfession(p) {
  return (p || "Brak").trim();
}

function splitProfessions(raw) {
  const text = (raw || "Brak").trim();

  return text
    .split(/[;,]/g) // rozbij po przecinku lub średniku
    .map((s) => s.trim()) // usuń spacje
    .filter((s) => s.length > 0);
}

function buildProfessionCounts(items) {
  const counts = new Map();

  for (const x of items) {
    const profList = splitProfessions(x.profession);
    for (const prof of profList) {
      counts.set(prof, (counts.get(prof) || 0) + 1);
    }
  }

  // sortujemy malejąco (najczęstsze na górze)
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return {
    labels: sorted.map(([prof]) => prof),
    values: sorted.map(([, cnt]) => cnt),
  };
}

let professionChart;

function renderProfessionCountsChart(items) {
  const canvas = document.getElementById("professionChart");
  if (!canvas) return;

  const { labels, values } = buildProfessionCounts(items);

  // jeśli odświeżasz wykres, zniszcz poprzedni
  if (professionChart) professionChart.destroy();

  professionChart = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Liczba posłów",
          data: values,
        },
      ],
    },
    options: {
      responsive: true,
      indexAxis: "y", // poziomo, bo etykiet jest dużo
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: {
          ticks: {
            autoSkip: false, // NIE pomijaj co drugiej etykiety
            font: { size: 11 }, // opcjonalnie mniejsza czcionka
          },
        },
      },
      plugins: {
        legend: { display: false },
        title: { display: true, text: "Liczba posłów wg profesji" },
      },
    },
  });
}

(async () => {
  try {
    const data = await loadJSON("./public/data/deputies.json");
    console.log("RAW data:", data);
    console.log("Czy tablica?", Array.isArray(data));

    // ⬇️ CACHE – zapamiętujemy ostatnio wczytane dane
    window.__data = Array.isArray(data) ? data : data.items;

    // jeśli masz znacznik #lastUpdate i dane z metadanymi, ustaw datę
    if (!Array.isArray(data) && data.generated_at) {
      document.getElementById("lastUpdate").textContent = new Date(
        data.generated_at
      ).toLocaleString("pl-PL");
    }

    // render zawsze z cache
    render(window.__data);
    renderProfessionCountsChart(window.__data);
  } catch (e) {
    document.getElementById(
      "root"
    ).textContent = `Błąd ładowania danych: ${e.message}`;
  }
})();
const btn = document.getElementById("infoBtn");
const text = document.getElementById("infoText");

btn.addEventListener("click", () => {
  if (text.style.display === "none") {
    text.style.display = "block";
    btn.textContent = "❌ Ukryj informacje";
  } else {
    text.style.display = "none";
    btn.textContent = "ℹ️ Pokaż informacje";
  }
});
