async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}
function render(items) {
  const root = document.getElementById("root");
  root.innerHTML = `<table class="table"><thead><tr><th>Imie i nazwisko</th><th>Klub</th></tr></thead>
  <tbody>${items
    .map((x) => `<tr><td>${x.name}</td><td>${x.club}</td></tr>`)
    .join("")}</tbody></table>`;
}
(async () => {
  try {
    const data = await loadJSON("./public/data/deputies.json");

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
  } catch (e) {
    document.getElementById(
      "root"
    ).textContent = `Błąd ładowania danych: ${e.message}`;
  }
})();
