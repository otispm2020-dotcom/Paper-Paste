const DASHBOARD_URL = chrome.runtime.getURL("dashboard.html");

async function openDashboard() {
  const existingTabs = await chrome.tabs.query({ url: DASHBOARD_URL });
  if (existingTabs.length > 0) {
    const existingTab = existingTabs[0];
    await chrome.tabs.update(existingTab.id, { active: true });
    if (existingTab.windowId) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: DASHBOARD_URL });
}

chrome.action.onClicked.addListener(() => {
  openDashboard();
});

chrome.runtime.onInstalled.addListener(() => {
  openDashboard();
});
