(() => {
  "use strict";

  const consentStorageKey = "ocenatorium_analytics_consent";
  const measurementId = "G-X6QE2BE90T";
  const analyticsScriptId = "ocenatorium-ga4";
  let analyticsInitialized = false;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  function getStoredConsent() {
    try {
      const consent = window.localStorage.getItem(consentStorageKey);
      return consent === "granted" || consent === "denied" ? consent : null;
    } catch {
      return null;
    }
  }

  function storeConsent(consent) {
    try {
      window.localStorage.setItem(consentStorageKey, consent);
    } catch {
      // The choice still applies to the current page when storage is unavailable.
    }
  }

  function loadAnalytics() {
    if (analyticsInitialized || document.getElementById(analyticsScriptId)) {
      return;
    }

    analyticsInitialized = true;
    window.gtag("consent", "update", {
      analytics_storage: "granted",
    });
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const analyticsScript = document.createElement("script");
    analyticsScript.id = analyticsScriptId;
    analyticsScript.async = true;
    analyticsScript.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(analyticsScript);
  }

  function hideConsentBanner(banner) {
    banner.remove();
  }

  function createConsentBanner() {
    const banner = document.createElement("section");
    banner.className = "analytics-consent";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Zgoda na statystyki");

    const content = document.createElement("div");
    content.className = "analytics-consent-content";

    const message = document.createElement("p");
    message.className = "analytics-consent-message";
    message.textContent =
      "Używamy anonimowych statystyk Google Analytics, aby sprawdzać, które analizy są najbardziej przydatne. Możesz zaakceptować lub odrzucić pomiar statystyczny.";

    const actions = document.createElement("div");
    actions.className = "analytics-consent-actions";

    const acceptButton = document.createElement("button");
    acceptButton.className = "analytics-consent-button";
    acceptButton.type = "button";
    acceptButton.textContent = "Akceptuję statystyki";

    const rejectButton = document.createElement("button");
    rejectButton.className = "analytics-consent-button";
    rejectButton.type = "button";
    rejectButton.textContent = "Odrzucam";

    acceptButton.addEventListener("click", () => {
      storeConsent("granted");
      hideConsentBanner(banner);
      loadAnalytics();
    });

    rejectButton.addEventListener("click", () => {
      storeConsent("denied");
      hideConsentBanner(banner);
    });

    actions.append(acceptButton, rejectButton);
    content.append(message, actions);
    banner.append(content);
    document.body.appendChild(banner);
  }

  const storedConsent = getStoredConsent();

  if (storedConsent === "granted") {
    loadAnalytics();
  } else if (storedConsent === null) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createConsentBanner, { once: true });
    } else {
      createConsentBanner();
    }
  }
})();
