const infoButton = document.getElementById("infoBtn");
const infoText = document.getElementById("infoText");
const lastUpdate = document.getElementById("lastUpdate");

if (lastUpdate) {
  const modified = new Date(document.lastModified);
  lastUpdate.textContent = Number.isNaN(modified.getTime())
    ? "brak informacji"
    : modified.toLocaleString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

if (infoButton && infoText) {
  infoButton.addEventListener("click", () => {
    const isHidden = infoText.hasAttribute("hidden");

    infoText.toggleAttribute("hidden", !isHidden);
    infoButton.setAttribute("aria-expanded", String(isHidden));
  });
}
