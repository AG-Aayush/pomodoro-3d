/*
 * Browser-side Self-Healing Agent for static HTML/CSS/JS websites.
 *
 * Include in a website:
 *
 * <script>
 *   window.SELF_HEALING_CONFIG = {
 *     appName: "Pomodoro 3D",
 *     collectorUrl: "http://127.0.0.1:8766/selfhealing/events",
 *     fallbackImage: "https://placehold.co/600x400?text=Asset+Unavailable",
 *     watchSelectors: [
 *       { name: "Start button", selector: "#start-btn", fallbackSelector: "button" }
 *     ]
 *   };
 * </script>
 * <script src="selfhealing_agent.js"></script>
 */

(function () {
  "use strict";

  const config = window.SELF_HEALING_CONFIG || {};
  const collectorUrl = config.collectorUrl || "http://127.0.0.1:8766/selfhealing/events";
  const appName = config.appName || document.title || "Unknown Website";
  const fallbackImage =
    config.fallbackImage ||
    "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450'%3E%3Crect width='100%25' height='100%25' fill='%23242a31'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Arial' font-size='28'%3EAsset unavailable%3C/text%3E%3C/svg%3E";

  const state = {
    startedAt: Date.now(),
    events: [],
    healingAttempts: 0,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function confidencePolicy(score) {
    if (score >= 75) return "AUTOMATIC HEAL";
    if (score >= 20) return "CAUTIOUS HEAL + LOG";
    return "HALT / ADMIN INTERVENTION REQUIRED";
  }

  function sendEvent(type, severity, message, details) {
    const event = {
      appName,
      pageUrl: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: nowIso(),
      type,
      severity,
      message,
      details: details || {},
    };

    state.events.push(event);
    state.events = state.events.slice(-200);

    try {
      const body = JSON.stringify(event);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(collectorUrl, new Blob([body], { type: "application/json" }));
        return;
      }

      fetch(collectorUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(function () {});
    } catch (error) {
      console.warn("[SelfHealing] Failed to report event", error);
    }
  }

  function installErrorMonitoring() {
    window.addEventListener("error", function (event) {
      const target = event.target;

      if (target && target !== window && target.tagName) {
        handleResourceFailure(target);
        return;
      }

      sendEvent("javascript_error", "critical", event.message || "Unhandled JavaScript error", {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    }, true);

    window.addEventListener("unhandledrejection", function (event) {
      sendEvent("promise_rejection", "critical", "Unhandled promise rejection", {
        reason: String(event.reason || ""),
      });
    });
  }

  function installFetchMonitoring() {
    if (!window.fetch) return;

    const originalFetch = window.fetch.bind(window);
    window.fetch = function () {
      const startedAt = performance.now();
      const args = arguments;
      return originalFetch.apply(null, args)
        .then(function (response) {
          const durationMs = Math.round(performance.now() - startedAt);
          if (!response.ok) {
            sendEvent("api_failure", "warning", "Fetch returned non-success status", {
              url: String(args[0]),
              status: response.status,
              durationMs,
            });
          }
          return response;
        })
        .catch(function (error) {
          sendEvent("api_failure", "critical", "Fetch request failed", {
            url: String(args[0]),
            error: String(error),
          });
          throw error;
        });
    };
  }

  function handleResourceFailure(target) {
    const tag = target.tagName.toLowerCase();
    const source = target.currentSrc || target.src || target.href || "";

    if (tag === "img") {
      healBrokenImage(target, source);
      return;
    }

    sendEvent("resource_failure", "critical", "Static resource failed to load", {
      tag,
      source,
      policy: "HALT / ADMIN INTERVENTION REQUIRED",
    });
  }

  function healBrokenImage(image, failedSource) {
    if (image.dataset.selfHealingApplied === "true") return;

    image.dataset.selfHealingApplied = "true";
    image.dataset.failedSource = failedSource;
    image.src = fallbackImage;
    image.alt = image.alt || "Recovered fallback image";
    state.healingAttempts += 1;

    sendEvent("runtime_heal", "warning", "Broken image replaced with fallback asset", {
      failedSource,
      recoveredSource: fallbackImage,
      confidenceScore: 80,
      policy: confidencePolicy(80),
      action: "replace_image_source",
    });
  }

  function selectorScore(expected, candidate) {
    let score = 0;
    if (expected.id && candidate.id === expected.id) score += 40;
    if (expected.text && candidate.textContent.trim() === expected.text) score += 30;
    if (expected.className && candidate.className === expected.className) score += 20;
    if (expected.tagName && candidate.tagName === expected.tagName) score += 10;
    return score;
  }

  function installSelectorWatch() {
    const watches = Array.isArray(config.watchSelectors) ? config.watchSelectors : [];
    if (!watches.length) return;

    function checkWatch(watch) {
      const expected = document.querySelector(watch.selector);
      if (expected) return;

      const candidates = Array.from(document.querySelectorAll(watch.fallbackSelector || "button, a, input, [role='button']"));
      const expectedFingerprint = watch.fingerprint || {};
      let best = null;

      candidates.forEach(function (candidate) {
        const score = selectorScore(expectedFingerprint, candidate);
        if (!best || score > best.score) {
          best = { element: candidate, score };
        }
      });

      if (!best || best.score < 20) {
        sendEvent("selector_missing", "critical", "Watched selector is missing", {
          name: watch.name,
          selector: watch.selector,
          confidenceScore: best ? best.score : 0,
          policy: confidencePolicy(best ? best.score : 0),
        });
        return;
      }

      best.element.dataset.selfHealingRecoveredFor = watch.selector;
      state.healingAttempts += 1;
      sendEvent("runtime_heal", best.score >= 75 ? "info" : "warning", "Watched selector recovered by fallback candidate", {
        name: watch.name,
        brokenSelector: watch.selector,
        recoveredSelector:
          best.element.id ? "#" + best.element.id : best.element.tagName.toLowerCase(),
        confidenceScore: best.score,
        policy: confidencePolicy(best.score),
      });
    }

    function checkAll() {
      watches.forEach(checkWatch);
    }

    window.addEventListener("load", checkAll);
    new MutationObserver(checkAll).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  function sendHeartbeat() {
    sendEvent("heartbeat", "info", "Self-healing browser agent active", {
      uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
      healingAttempts: state.healingAttempts,
      title: document.title,
    });
  }

  installErrorMonitoring();
  installFetchMonitoring();
  installSelectorWatch();

  window.addEventListener("load", function () {
    sendEvent("page_load", "info", "Page loaded with self-healing agent", {
      loadTimeMs: Math.round(performance.now()),
      title: document.title,
    });
    sendHeartbeat();
  });

  window.SelfHealingAgent = {
    report: sendEvent,
    state,
  };
})();
