const STATE_KEY = "indeedAutoState";
const PROGRESS_KEY = "indeedAutoProgress";

async function setRunningState(running) {
  await chrome.storage.local.set({ [STATE_KEY]: running });
}

async function getRunningState() {
  const data = await chrome.storage.local.get(STATE_KEY);
  return Boolean(data[STATE_KEY]);
}

async function updateKeepAwake(running) {
  if (running) {
    chrome.power.requestKeepAwake("display");
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" });
  } else {
    chrome.power.releaseKeepAwake();
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setRunningState(false);
  await updateKeepAwake(false);
});

chrome.runtime.onStartup.addListener(async () => {
  const running = await getRunningState();
  await updateKeepAwake(running);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATE") {
      const running = await getRunningState();
      sendResponse({ running });
      return;
    }

    if (message?.type === "SET_RUNNING") {
      const running = Boolean(message.running);
      await setRunningState(running);
      if (running) {
        await chrome.storage.local.set({
          [PROGRESS_KEY]: { index: 0, downloadedIds: [] }
        });
      } else {
        await chrome.storage.local.remove(PROGRESS_KEY);
      }
      await updateKeepAwake(running);
      sendResponse({ ok: true, running });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.startsWith("https://employers.indeed.com")) return;
  (async () => {
    const running = await getRunningState();
    if (!running) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
    } catch (_) {
      /* tab may not allow injection */
    }
  })();
});
