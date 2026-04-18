(async function () {
  const STATE_KEY = "indeedAutoState";
  const PROGRESS_KEY = "indeedAutoProgress";

  const data = await chrome.storage.local.get([STATE_KEY, PROGRESS_KEY]);
  if (!data[STATE_KEY]) return;

  if (window.__INDEED_AUTO_ACTIVE__) return;
  window.__INDEED_AUTO_ACTIVE__ = true;

  console.log("Indeed auto downloader started");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function isRunning() {
    const d = await chrome.storage.local.get(STATE_KEY);
    return Boolean(d[STATE_KEY]);
  }

  let progress = data[PROGRESS_KEY] || { index: 0, downloadedIds: [] };
  const downloaded = new Set(progress.downloadedIds || []);

  async function persistProgress(index) {
    await chrome.storage.local.set({
      [PROGRESS_KEY]: {
        index,
        downloadedIds: Array.from(downloaded).slice(-400)
      }
    });
  }

  let wakeLock = null;

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (err) {
      console.warn("Could not acquire screen wake lock", err);
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (err) {
      console.warn("Could not release screen wake lock", err);
    }
  }

  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      (await isRunning()) &&
      !wakeLock
    ) {
      await acquireWakeLock();
    }
  });

  await acquireWakeLock();

  function parsePaginationCounts() {
    const nodes = document.querySelectorAll("span, div, p, li");
    for (const el of nodes) {
      const t = (el.textContent || "").trim();
      if (/^\d+\s+of\s+\d+$/.test(t)) {
        const m = t.match(/^(\d+)\s+of\s+(\d+)$/);
        if (m) {
          return { current: Number(m[1]), total: Number(m[2]) };
        }
      }
    }
    return null;
  }

  function isNextNavDisabled() {
    for (const el of document.querySelectorAll("button, [role='button'], a[role='button']")) {
      const al = (el.getAttribute("aria-label") || "").toLowerCase();
      if (!al.includes("next")) continue;
      if (el.getAttribute("aria-disabled") === "true") return true;
      if (el.disabled === true) return true;
      const cls = String(el.className || "").toLowerCase();
      if (cls.includes("disabled") && !cls.includes("undisabled")) return true;
    }
    return false;
  }

  function needsPaginationRecovery() {
    const counts = parsePaginationCounts();
    if (!counts || counts.current >= counts.total) return false;
    return isNextNavDisabled();
  }

  function clickIndeedHeaderLogo() {
    const img = document.querySelector(
      '[role="banner"] img[alt*="Indeed" i], header img[alt*="Indeed" i], nav img[alt*="Indeed" i]'
    );
    if (img) {
      const a = img.closest("a");
      if (a) {
        a.click();
        return true;
      }
    }
    const imgs = document.querySelectorAll('a img[alt*="Indeed" i]');
    if (imgs.length) {
      const a = imgs[0].closest("a");
      if (a) {
        a.click();
        return true;
      }
    }
    for (const a of document.querySelectorAll(
      '[role="banner"] a[href], header a[href], nav a[href]'
    )) {
      const href = a.getAttribute("href") || "";
      if (!/indeed\.com/i.test(href)) continue;
      if (
        /\/emp|employer|dashboard|^\/$|\/m\/|\/jobs/.test(href) ||
        a.querySelector("svg")
      ) {
        a.click();
        return true;
      }
    }
    return false;
  }

  function queryCandidateCards() {
    let cards = Array.from(
      document.querySelectorAll('[data-testid="candidate-card"]')
    );
    if (cards.length) return cards;
    return Array.from(document.querySelectorAll('li, [role="listitem"]')).filter(
      (el) => el.closest("aside, [data-testid]")
    );
  }

  function getCandidateFingerprint() {
    try {
      const u = new URL(location.href);
      for (const k of [
        "candidateId",
        "applicantId",
        "applicationId",
        "id"
      ]) {
        const v = u.searchParams.get(k);
        if (v && v.length > 2) return `id:${v}`;
      }
    } catch (_) {}
    const h1 = document.querySelector("h1");
    const title = (h1?.textContent || "").trim().slice(0, 120);
    return `path:${location.pathname}|${title}`;
  }

  async function stopAutomation() {
    await releaseWakeLock();
    try {
      await chrome.runtime.sendMessage({ type: "SET_RUNNING", running: false });
    } catch (_) {
      await chrome.storage.local.set({ [STATE_KEY]: false });
    }
    window.__INDEED_AUTO_ACTIVE__ = false;
  }

  let i = progress.index || 0;
  let recoveryStreak = 0;

  while (true) {
    if (!(await isRunning())) {
      console.log("Stopped by user");
      await releaseWakeLock();
      window.__INDEED_AUTO_ACTIVE__ = false;
      return;
    }

    if (needsPaginationRecovery()) {
      recoveryStreak++;
      if (recoveryStreak > 6) {
        console.warn("Pagination recovery limit — continuing best-effort");
        recoveryStreak = 0;
      } else {
        console.log(
          "Next control disabled but not on last item — clicking Indeed logo"
        );
        if (clickIndeedHeaderLogo()) {
          await sleep(9000);
        } else {
          console.warn("Indeed header logo not found");
          await sleep(3000);
        }
        continue;
      }
    } else {
      recoveryStreak = 0;
    }

    const candidates = queryCandidateCards();
    if (i >= candidates.length) {
      console.log("All candidates processed");
      await stopAutomation();
      return;
    }

    try {
      console.log(`Processing candidate index ${i + 1}`);

      candidates[i].scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      candidates[i].click();

      await sleep(15000);

      if (!(await isRunning())) {
        await releaseWakeLock();
        window.__INDEED_AUTO_ACTIVE__ = false;
        return;
      }

      const fingerprint = getCandidateFingerprint();
      if (downloaded.has(fingerprint)) {
        console.log("Skipping duplicate resume:", fingerprint);
        i += 1;
        await persistProgress(i);
        continue;
      }

      const downloadBtn = document.querySelector(
        'a[data-dd-action-name="download-resume-inline"]'
      );

      if (!downloadBtn) {
        console.warn("Download CV button not found");
        i += 1;
        await persistProgress(i);
        continue;
      }

      downloadBtn.click();

      await sleep(3000);

      const confirmBtn = Array.from(
        document.querySelectorAll("svg.css-1nck947")
      )[0]?.closest("button, a");

      if (confirmBtn) {
        confirmBtn.click();
      } else {
        console.warn("Confirm button not found");
      }

      downloaded.add(fingerprint);
      i += 1;
      await persistProgress(i);

      await sleep(2500);
    } catch (err) {
      console.error("Error processing candidate", err);
      i += 1;
      await persistProgress(i);
    }
  }
})();
