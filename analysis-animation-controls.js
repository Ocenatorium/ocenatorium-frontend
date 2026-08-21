(function () {
  function create(options) {
    const buttons = Array.from(options.buttons || []);
    const replayButton = options.replayButton || null;
    const stopButton = options.stopButton || null;

    function setActiveTerm(term) {
      buttons.forEach((button) => {
        const isActive = button.dataset.term === String(term);
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
    }

    function setPlaying(isPlaying) {
      if (stopButton) {
        stopButton.disabled = !isPlaying;
        stopButton.setAttribute("aria-disabled", String(!isPlaying));
      }
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => options.onSelect?.(button.dataset.term));
    });
    replayButton?.addEventListener("click", () => options.onReplay?.());
    stopButton?.addEventListener("click", () => options.onStop?.());
    setPlaying(false);

    return { setActiveTerm, setPlaying };
  }

  window.AnalysisAnimationControls = { create };
}());
