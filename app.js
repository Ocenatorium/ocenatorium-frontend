const infoButton = document.getElementById("infoBtn");
const infoText = document.getElementById("infoText");

if (infoButton && infoText) {
  infoButton.addEventListener("click", () => {
    const isHidden = infoText.hasAttribute("hidden");

    infoText.toggleAttribute("hidden", !isHidden);
    infoButton.setAttribute("aria-expanded", String(isHidden));
  });
}
