const STATE_KEY = "indeedAutoState";

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
