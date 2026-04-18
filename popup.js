const btn = document.getElementById("toggle");

function renderButton(isRunning) {
  btn.textContent = isRunning ? "Stop Download" : "Start Download";
  btn.className = isRunning ? "stop" : "start";
}

async function getRunningState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  return Boolean(response?.running);
}

async function setRunningState(isRunning) {
  await chrome.runtime.sendMessage({
    type: "SET_RUNNING",
    running: isRunning
  });
}

async function applyRunningStateToActiveTab(isRunning) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (state) => {
      window.__INDEED_AUTO_RUNNING__ = state;
    },
    args: [isRunning]
  });

  if (isRunning) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  }
}

async function initPopup() {
  const running = await getRunningState();
  renderButton(running);
}

btn.addEventListener("click", async () => {
  const current = await getRunningState();
  const next = !current;

  await setRunningState(next);
  renderButton(next);
  await applyRunningStateToActiveTab(next);
});

initPopup().catch((err) => {
  console.error("Failed to initialize popup state", err);
});
