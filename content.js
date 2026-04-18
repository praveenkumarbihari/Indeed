(async function () {

  // Prevent duplicate execution
  if (window.__INDEED_AUTO_ACTIVE__) return;
  window.__INDEED_AUTO_ACTIVE__ = true;

  console.log("🚀 Indeed auto downloader started");

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  let wakeLock = null;

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("🔋 Screen wake lock acquired");
    } catch (err) {
      console.warn("⚠️ Could not acquire screen wake lock", err);
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        console.log("🔋 Screen wake lock released");
      }
    } catch (err) {
      console.warn("⚠️ Could not release screen wake lock", err);
    }
  }

  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      window.__INDEED_AUTO_RUNNING__ &&
      !wakeLock
    ) {
      await acquireWakeLock();
    }
  });

  await acquireWakeLock();

  // Detect candidates (left panel)
  const candidates = Array.from(
    document.querySelectorAll('[data-testid="candidate-card"], li')
  );

  console.log(`👥 Candidates found: ${candidates.length}`);

  for (let i = 0; i < candidates.length; i++) {

    // STOP immediately if user clicks Stop
    if (!window.__INDEED_AUTO_RUNNING__) {
      console.log("⏹ Stopped by user");
      await releaseWakeLock();
      window.__INDEED_AUTO_ACTIVE__ = false;
      return;
    }

    try {
      console.log(`➡️ Processing candidate ${i + 1}`);

      candidates[i].scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      candidates[i].click();

      // Wait for profile load
      await sleep(15000);

      // STEP 1: Click "Download CV"
      const downloadBtn = document.querySelector(
        'a[data-dd-action-name="download-resume-inline"]'
      );

      if (!downloadBtn) {
        console.warn("❌ Download CV button not found");
        continue;
      }

      downloadBtn.click();
      console.log("⬇️ Download CV clicked");

      // STEP 2: Wait for confirm arrow
      await sleep(3000);

      const confirmBtn = Array.from(
        document.querySelectorAll("svg.css-1nck947")
      )[0]?.closest("button, a");

      if (confirmBtn) {
        confirmBtn.click();
        console.log("✅ Confirm download clicked");
      } else {
        console.warn("⚠️ Confirm button not found");
      }

      // Cooldown (avoid rate-limit)
      await sleep(2500);

    } catch (err) {
      console.error("🔥 Error processing candidate", err);
    }
  }

  console.log("🎉 All candidates processed");
  await releaseWakeLock();
  window.__INDEED_AUTO_ACTIVE__ = false;

})();
