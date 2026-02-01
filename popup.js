let isRunning = false;
const btn = document.getElementById("toggle");

btn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  isRunning = !isRunning;

  btn.textContent = isRunning ? "Stop Download" : "Start Download";
  btn.className = isRunning ? "stop" : "start";

  // Update running state in page context
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (state) => {
      window.__INDEED_AUTO_RUNNING__ = state;
    },
    args: [isRunning]
  });

  // Start script only when switching to RUNNING
  if (isRunning) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  }
});
