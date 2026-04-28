const STORAGE_KEYS = {
  apiKey: "paperPasteSiliconFlowApiKey",
  items: "paperPasteCanvasItems",
  groupByWindow: "paperPasteGroupByWindow",
  clusterMode: "paperPasteClusterMode",
  modelConfig: "paperPasteModelConfig"
};

const CRAWLER_PROXY_URL = "https://r.jina.ai/http://";
const CARD_WIDTH = 320;
const CARD_HEIGHT = 520;
const CARD_GAP = 28;
const GROUP_GAP = 72;
const GROUP_TITLE_HEIGHT = 44;
const EXPORT_PADDING = 32;
const IMPORTED_WINDOW_LABEL = "导入链接";
const MIN_CONTENT_LENGTH = 120;
const SYSTEM_PROMPT = "你是一个专业的中文助手，负责提供简洁准确的中文摘要。如果用户要求早报，请输出结构化的新闻摘要。";
const MODEL_PROVIDERS = {
  siliconflow: {
    label: "SiliconFlow",
    protocol: "openai",
    endpoint: "https://api.siliconflow.cn/v1/chat/completions",
    model: "Qwen/Qwen2.5-7B-Instruct"
  },
  openai: {
    label: "OpenAI",
    protocol: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4.1-mini"
  },
  anthropic: {
    label: "Anthropic",
    protocol: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    model: "claude-3-5-haiku-latest"
  },
  gemini: {
    label: "Google Gemini",
    protocol: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash"
  },
  openrouter: {
    label: "OpenRouter",
    protocol: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4.1-mini"
  },
  custom: {
    label: "自定义 OpenAI 兼容",
    protocol: "openai",
    endpoint: "",
    model: ""
  }
};
const CONTENT_CLUSTER_STOP_WORDS = new Set([
  "内容",
  "页面",
  "网页",
  "链接",
  "标题",
  "摘要",
  "详情",
  "信息",
  "使用",
  "支持",
  "功能",
  "系统",
  "平台",
  "服务",
  "我们",
  "他们",
  "可以",
  "进行",
  "以及",
  "如果",
  "因为",
  "about",
  "with",
  "from",
  "that",
  "this",
  "have",
  "your",
  "page",
  "content",
  "using"
]);

const state = {
  items: [],
  dragging: null,
  syncing: false,
  editingItemId: null,
  searchQuery: "",
  clusterMode: "none"
};

const elements = {
  searchInput: document.querySelector("#search-input"),
  clusterModeSelect: document.querySelector("#cluster-mode"),
  settingsProviderSelect: document.querySelector("#settings-provider"),
  settingsModelInput: document.querySelector("#settings-model"),
  settingsEndpointInput: document.querySelector("#settings-endpoint"),
  settingsApiKeyInput: document.querySelector("#settings-api-key"),
  settingsProviderHint: document.querySelector("#settings-provider-hint"),
  saveKeyButton: document.querySelector("#save-key"),
  openSettingsButton: document.querySelector("#open-settings"),
  closeSettingsButton: document.querySelector("#close-settings"),
  settingsModal: document.querySelector("#settings-modal"),
  settingsBackdrop: document.querySelector("#settings-backdrop"),
  editModal: document.querySelector("#edit-modal"),
  editBackdrop: document.querySelector("#edit-backdrop"),
  closeEditButton: document.querySelector("#close-edit"),
  editTitleInput: document.querySelector("#edit-title-input"),
  editSummaryInput: document.querySelector("#edit-summary-input"),
  editUrlInput: document.querySelector("#edit-url-input"),
  saveEditButton: document.querySelector("#save-edit"),
  importUrlInput: document.querySelector("#import-url"),
  importLinkButton: document.querySelector("#import-link"),
  syncTabsButton: document.querySelector("#sync-tabs"),
  syncCurrentWindowButton: document.querySelector("#sync-current-window"),
  exportImageButton: document.querySelector("#export-image"),
  exportJsonButton: document.querySelector("#export-json"),
  clearCanvasButton: document.querySelector("#clear-canvas"),
  status: document.querySelector("#status"),
  canvas: document.querySelector("#canvas"),
  canvasMeta: document.querySelector("#canvas-meta"),
  canvasHint: document.querySelector("#canvas-hint"),
  template: document.querySelector("#tab-card-template")
};

window.addEventListener("DOMContentLoaded", init);
window.addEventListener("mousemove", handleDragMove);
window.addEventListener("mouseup", stopDrag);

async function init() {
  bindEvents();
  await loadPersistedState();
  renderCanvas();
}

function bindEvents() {
  elements.saveKeyButton.addEventListener("click", saveApiKey);
  elements.openSettingsButton.addEventListener("click", openSettingsModal);
  elements.closeSettingsButton.addEventListener("click", closeSettingsModal);
  elements.settingsBackdrop.addEventListener("click", closeSettingsModal);
  elements.settingsProviderSelect.addEventListener("change", handleProviderChange);
  elements.closeEditButton.addEventListener("click", closeEditModal);
  elements.editBackdrop.addEventListener("click", closeEditModal);
  elements.saveEditButton.addEventListener("click", saveEditedCard);
  elements.settingsApiKeyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      saveApiKey();
    }
  });
  elements.importLinkButton.addEventListener("click", importLinkToCanvas);
  elements.importUrlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      importLinkToCanvas();
    }
  });
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.clusterModeSelect.addEventListener("change", handleClusterModeChange);
  elements.syncTabsButton.addEventListener("click", () => syncTabsToCanvas("all"));
  elements.syncCurrentWindowButton.addEventListener("click", () => syncTabsToCanvas("currentWindow"));
  elements.exportImageButton.addEventListener("click", exportCanvasAsImage);
  elements.exportJsonButton.addEventListener("click", exportCanvasAsJson);
  elements.clearCanvasButton.addEventListener("click", clearCanvas);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.settingsModal.hidden) {
      closeSettingsModal();
      return;
    }
    if (event.key === "Escape" && !elements.editModal.hidden) {
      closeEditModal();
    }
  });
}

async function loadPersistedState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.apiKey,
    STORAGE_KEYS.items,
    STORAGE_KEYS.groupByWindow,
    STORAGE_KEYS.clusterMode,
    STORAGE_KEYS.modelConfig
  ]);
  const legacyGroupByWindow = Boolean(stored[STORAGE_KEYS.groupByWindow]);
  applyModelConfigToForm(getStoredModelConfig(stored));
  state.items = Array.isArray(stored[STORAGE_KEYS.items]) ? stored[STORAGE_KEYS.items] : [];
  state.clusterMode = stored[STORAGE_KEYS.clusterMode] || (legacyGroupByWindow ? "window" : "none");
  elements.clusterModeSelect.value = state.clusterMode;
  updateCanvasHint();
  setStatus(`已加载 ${state.items.length} 张卡片`);
}

async function saveApiKey() {
  const config = getCurrentModelConfig();
  const validationError = getModelConfigValidationError(config);
  if (validationError) {
    setStatus(validationError);
    openSettingsModal();
    return;
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.apiKey]: config.apiKey,
    [STORAGE_KEYS.modelConfig]: config
  });
  closeSettingsModal();
  setStatus(`${getProviderMeta(config.provider).label} 配置已保存`);
}

async function persistModelConfig(config) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.apiKey]: config.apiKey,
    [STORAGE_KEYS.modelConfig]: config
  });
}

async function clearCanvas() {
  state.items = [];
  await persistItems();
  renderCanvas();
  setStatus("画布已清空");
}

function openSettingsModal() {
  if (!elements.settingsProviderSelect.value) {
    applyModelConfigToForm(getDefaultModelConfig());
  }
  elements.settingsModal.hidden = false;
  elements.settingsApiKeyInput.focus();
  elements.settingsApiKeyInput.select();
}

function closeSettingsModal() {
  elements.settingsModal.hidden = true;
}

function handleProviderChange() {
  const current = getCurrentModelConfig();
  const provider = current.provider;
  const meta = getProviderMeta(provider);
  const previousProvider = elements.settingsProviderSelect.dataset.lastProvider;
  if (!current.model || previousProvider !== provider) {
    elements.settingsModelInput.value = meta.model;
  }
  if (!current.endpoint || previousProvider !== provider) {
    elements.settingsEndpointInput.value = meta.endpoint;
  }
  elements.settingsProviderSelect.dataset.lastProvider = provider;
  updateProviderHint(provider);
}

function getDefaultModelConfig() {
  return {
    provider: "siliconflow",
    model: MODEL_PROVIDERS.siliconflow.model,
    endpoint: MODEL_PROVIDERS.siliconflow.endpoint,
    apiKey: ""
  };
}

function getStoredModelConfig(stored) {
  const saved = stored[STORAGE_KEYS.modelConfig];
  if (saved && typeof saved === "object") {
    return normalizeModelConfig(saved);
  }

  const legacyApiKey = stored[STORAGE_KEYS.apiKey] || "";
  return normalizeModelConfig({
    ...getDefaultModelConfig(),
    apiKey: legacyApiKey
  });
}

function normalizeModelConfig(config) {
  const provider = MODEL_PROVIDERS[config?.provider] ? config.provider : "siliconflow";
  const meta = getProviderMeta(provider);
  return {
    provider,
    model: String(config?.model || meta.model).trim(),
    endpoint: String(config?.endpoint || meta.endpoint).trim(),
    apiKey: String(config?.apiKey || "").trim()
  };
}

function applyModelConfigToForm(config) {
  const normalized = normalizeModelConfig(config);
  elements.settingsProviderSelect.value = normalized.provider;
  elements.settingsModelInput.value = normalized.model;
  elements.settingsEndpointInput.value = normalized.endpoint;
  elements.settingsApiKeyInput.value = normalized.apiKey;
  elements.settingsProviderSelect.dataset.lastProvider = normalized.provider;
  updateProviderHint(normalized.provider);
}

function getCurrentModelConfig() {
  return normalizeModelConfig({
    provider: elements.settingsProviderSelect.value,
    model: elements.settingsModelInput.value,
    endpoint: elements.settingsEndpointInput.value,
    apiKey: elements.settingsApiKeyInput.value
  });
}

function getEffectiveModelConfig() {
  return getCurrentModelConfig();
}

function getProviderMeta(provider) {
  return MODEL_PROVIDERS[provider] || MODEL_PROVIDERS.siliconflow;
}

function updateProviderHint(provider) {
  const meta = getProviderMeta(provider);
  elements.settingsProviderHint.textContent = `${meta.label} 默认模型：${meta.model || "请手动填写"}；未配置模型密钥时，导入链接和同步标签页会自动唤起当前弹窗。`;
}

function getModelConfigValidationError(config) {
  if (!config.apiKey) {
    return "请先在系统设置中配置模型密钥";
  }
  if (!config.model) {
    return "请先在系统设置中填写模型名称";
  }
  if (!config.endpoint) {
    return "请先在系统设置中填写接口地址";
  }
  if (!normalizeEditableUrl(config.endpoint)) {
    return "模型接口地址格式无效";
  }
  return "";
}

function ensureModelConfigReady() {
  const config = getEffectiveModelConfig();
  const validationError = getModelConfigValidationError(config);
  if (validationError) {
    setStatus(validationError);
    openSettingsModal();
    return null;
  }
  return config;
}

function openEditModal(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  state.editingItemId = itemId;
  elements.editTitleInput.value = item.title || "";
  elements.editSummaryInput.value = item.summary || "";
  elements.editUrlInput.value = item.url || "";
  elements.editModal.hidden = false;
  elements.editTitleInput.focus();
  elements.editTitleInput.select();
}

function closeEditModal() {
  state.editingItemId = null;
  elements.editModal.hidden = true;
}

async function saveEditedCard() {
  if (!state.editingItemId) {
    return;
  }

  const nextTitle = elements.editTitleInput.value.trim() || "未命名标签页";
  const nextSummary = elements.editSummaryInput.value.trim() || "该页面暂未生成摘要。";
  const normalizedUrl = normalizeEditableUrl(elements.editUrlInput.value.trim());
  if (!normalizedUrl) {
    setStatus("编辑卡片时请输入有效链接");
    return;
  }

  state.items = state.items.map((item) => {
    if (item.id !== state.editingItemId) {
      return item;
    }
    return {
      ...item,
      title: nextTitle,
      summary: nextSummary,
      url: normalizedUrl,
      updatedAt: new Date().toISOString()
    };
  });
  await persistItems();
  closeEditModal();
  renderCanvas();
  setStatus("已更新卡片内容");
}

function handleSearchInput(event) {
  state.searchQuery = event.target.value.trim();
  updateCanvasHint();
  renderCanvas();
}

async function handleClusterModeChange(event) {
  state.clusterMode = event.target.value;
  await chrome.storage.local.set({
    [STORAGE_KEYS.clusterMode]: state.clusterMode,
    [STORAGE_KEYS.groupByWindow]: state.clusterMode === "window"
  });
  updateCanvasHint();
  renderCanvas();
  setStatus(getClusterModeStatusText());
}

async function importLinkToCanvas() {
  if (state.syncing) {
    return;
  }

  const rawUrl = elements.importUrlInput.value.trim();
  if (!rawUrl) {
    setStatus("请先输入要导入的网页链接");
    return;
  }

  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) {
    setStatus("链接格式无效，请输入完整的 http 或 https 地址");
    return;
  }

  const modelConfig = ensureModelConfigReady();
  if (!modelConfig) {
    return;
  }

  state.syncing = true;
  setControlDisabled(true);
  await persistModelConfig(modelConfig);
  setStatus(`正在导入链接\n${normalizedUrl}`);

  try {
    const card = await buildImportedCanvasItem(normalizedUrl, modelConfig);
    const existingIndex = state.items.findIndex((item) => item.url === card.url);
    const nextItems = state.items.filter((item) => item.url !== card.url);
    const existingItem = existingIndex >= 0 ? state.items[existingIndex] : null;
    const nextCard = existingItem ? { ...card, id: existingItem.id } : card;

    nextItems.unshift(nextCard);

    state.items = layoutItems(nextItems, "none");
    await persistItems();
    renderCanvas();
    elements.importUrlInput.value = "";
    setStatus(existingIndex >= 0 ? "已更新该链接对应的卡片" : "已导入链接并生成卡片");
  } catch (error) {
    console.error(error);
    setStatus(`导入失败：${error.message || String(error)}`);
  } finally {
    state.syncing = false;
    setControlDisabled(false);
  }
}

function updateCanvasHint() {
  const filters = [];
  if (state.searchQuery) {
    filters.push(`搜索：${state.searchQuery}`);
  }
  if (state.clusterMode !== "none") {
    filters.push(`聚类：${getClusterModeLabel(state.clusterMode)}`);
  }
  elements.canvasHint.textContent = filters.length
    ? `${filters.join(" · ")} · 当前为智能视图`
    : "拖动卡片可重新布局";
}

async function syncTabsToCanvas(scope) {
  if (state.syncing) {
    return;
  }

  const modelConfig = ensureModelConfigReady();
  if (!modelConfig) {
    return;
  }

  state.syncing = true;
  setControlDisabled(true);
  await persistModelConfig(modelConfig);

  const queryInfo = scope === "currentWindow" ? { currentWindow: true } : {};
  const allTabs = await chrome.tabs.query(queryInfo);
  const runtimePrefix = chrome.runtime.getURL("");
  const tabs = allTabs.filter((tab) => {
    const url = tab.url || tab.pendingUrl || "";
    return Boolean(tab.id) && !url.startsWith(runtimePrefix);
  });

  const windowMetaMap = await buildWindowMetaMap(tabs);
  const originalActiveTabs = new Map();
  for (const tab of tabs) {
    if (tab.active && typeof tab.windowId === "number" && typeof tab.id === "number") {
      originalActiveTabs.set(tab.windowId, tab.id);
    }
  }

  const lastFocusedWindow = await chrome.windows.getLastFocused().catch(() => null);
  const nextItems = state.items.filter((item) => item.tabId == null);

  try {
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const windowLabel = windowMetaMap.get(tab.windowId)?.label || `窗口 ${index + 1}`;
      setStatus(`正在同步第 ${index + 1}/${tabs.length} 个标签页\n${windowLabel} · ${tab.title || tab.url || "未命名标签页"}`);
      const card = await buildTabCanvasItem(tab, modelConfig, windowLabel);
      nextItems.push(card);
      state.items = layoutItems(nextItems, "none");
      renderCanvas();
      await persistItems();
    }

    setStatus(`同步完成，共生成 ${nextItems.length} 张标签页卡片`);
  } catch (error) {
    console.error(error);
    setStatus(`同步失败：${error.message || String(error)}`);
  } finally {
    await restoreActiveTabs(originalActiveTabs, lastFocusedWindow);
    state.syncing = false;
    setControlDisabled(false);
  }
}

async function buildWindowMetaMap(tabs) {
  const uniqueWindowIds = [...new Set(tabs.map((tab) => tab.windowId).filter((value) => typeof value === "number"))];
  const result = new Map();
  uniqueWindowIds.forEach((windowId, index) => {
    result.set(windowId, { label: `窗口 ${index + 1}` });
  });
  return result;
}

async function buildTabCanvasItem(tab, modelConfig, windowLabel) {
  const tabId = tab.id;
  const windowId = tab.windowId;
  const url = tab.url || tab.pendingUrl || "";
  const title = tab.title || "未命名标签页";

  let screenshot = "";
  let summary = "该页面暂未生成摘要。";
  let finalTitle = title;
  let finalUrl = url;

  if (typeof windowId === "number" && typeof tabId === "number") {
    screenshot = await captureTabSnapshot(windowId, tabId);
  }

  if (isRestrictedUrl(url)) {
    summary = "该标签页属于浏览器限制页面，无法读取 HTML 内容，已保留标题、链接和页面截图。";
  } else if (typeof windowId === "number" && typeof tabId === "number") {
    const html = await extractTabHTML(tabId);
    const pageContent = await resolvePageContent({
      url,
      preferredTitle: title,
      directHtml: html
    });
    finalTitle = pageContent.title || title;
    finalUrl = pageContent.url || url;
    summary = await generateSummary({
      modelConfig,
      title: finalTitle,
      url: finalUrl,
      html: pageContent.html,
      textContent: pageContent.textContent,
      contentSource: pageContent.contentSource
    });
  }

  return {
    id: `${windowId}-${tabId}`,
    tabId,
    windowId,
    windowLabel,
    title: finalTitle,
    url: finalUrl,
    summary,
    screenshot,
    x: 0,
    y: 0,
    updatedAt: new Date().toISOString()
  };
}

async function buildImportedCanvasItem(url, modelConfig) {
  if (isRestrictedUrl(url)) {
    throw new Error("浏览器内部链接暂不支持导入");
  }

  const page = await resolvePageContent({
    url,
    preferredTitle: humanizeUrl(url) || "未命名链接"
  });
  const title = page.title || humanizeUrl(page.url) || "未命名链接";
  const summary = await generateSummary({
    modelConfig,
    title,
    url: page.url,
    html: page.html,
    textContent: page.textContent,
    contentSource: page.contentSource
  });

  return {
    id: `imported-${createItemKey(page.url)}`,
    tabId: null,
    windowId: "imported",
    windowLabel: IMPORTED_WINDOW_LABEL,
    title,
    url: page.url,
    summary,
    screenshot: "",
    x: 0,
    y: 0,
    updatedAt: new Date().toISOString()
  };
}

async function fetchPageContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`页面请求失败：HTTP ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    "";
  const textContent = extractMeaningfulTextFromHtml(html);

  return {
    url: response.url || url,
    title,
    html,
    textContent
  };
}

async function resolvePageContent({ url, preferredTitle, directHtml = "" }) {
  const directText = extractMeaningfulTextFromHtml(directHtml);
  if (hasMeaningfulHtml(directHtml) || hasMeaningfulText(directText)) {
    return {
      url,
      title: preferredTitle,
      html: directHtml,
      textContent: directText,
      contentSource: "页面HTML"
    };
  }

  try {
    const directPage = await fetchPageContent(url);
    if (hasMeaningfulHtml(directPage.html) || hasMeaningfulText(directPage.textContent)) {
      return {
        ...directPage,
        title: directPage.title || preferredTitle,
        contentSource: "直连抓取"
      };
    }
  } catch (error) {
    console.warn("fetchPageContent failed", error);
  }

  try {
    const crawledPage = await fetchCrawlerContent(url);
    if (hasMeaningfulText(crawledPage.textContent)) {
      return {
        ...crawledPage,
        title: crawledPage.title || preferredTitle,
        contentSource: "爬虫抓取"
      };
    }
  } catch (error) {
    console.warn("fetchCrawlerContent failed", error);
  }

  return {
    url,
    title: preferredTitle,
    html: directHtml,
    textContent: directText,
    contentSource: "内容不可用"
  };
}

async function fetchCrawlerContent(url) {
  const response = await fetch(buildCrawlerUrl(url));
  if (!response.ok) {
    throw new Error(`爬虫请求失败：HTTP ${response.status}`);
  }

  const text = (await response.text()).trim();
  const title = extractTitleFromCrawlerText(text);

  return {
    url,
    title,
    html: "",
    textContent: text
  };
}

function layoutItems(items, groupMode = "none") {
  if (!items.length) {
    return [];
  }

  const canvasWidth = Math.max(1280, elements.canvas.clientWidth || 1280);
  const columns = Math.max(1, Math.floor((canvasWidth - 48) / (CARD_WIDTH + CARD_GAP)));

  if (groupMode === "none") {
    return items.map((item, index) => ({
      ...item,
      x: 24 + (index % columns) * (CARD_WIDTH + CARD_GAP),
      y: 24 + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP)
    }));
  }

  const groups = buildGroups(items, groupMode);
  const nextItems = [];
  let cursorY = 24;
  for (const group of groups) {
    group.items.forEach((item, index) => {
      nextItems.push({
        ...item,
        groupKey: group.key,
        groupLabel: group.label,
        x: 24 + (index % columns) * (CARD_WIDTH + CARD_GAP),
        y: cursorY + GROUP_TITLE_HEIGHT + Math.floor(index / columns) * (CARD_HEIGHT + CARD_GAP)
      });
    });
    cursorY += GROUP_TITLE_HEIGHT + Math.ceil(group.items.length / columns) * (CARD_HEIGHT + CARD_GAP) + GROUP_GAP;
  }

  return nextItems;
}

function buildGroupFrames(items) {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.groupKey ?? item.windowId ?? "unknown");
    const label = item.groupLabel || item.windowLabel || `窗口 ${key}`;
    const frame = groups.get(key) || {
      label,
      minX: Infinity,
      minY: Infinity,
      maxX: 0,
      maxY: 0
    };
    frame.minX = Math.min(frame.minX, item.x);
    frame.minY = Math.min(frame.minY, item.y);
    frame.maxX = Math.max(frame.maxX, item.x + CARD_WIDTH);
    frame.maxY = Math.max(frame.maxY, item.y + CARD_HEIGHT);
    groups.set(key, frame);
  }
  return [...groups.values()];
}

async function deleteCard(itemId) {
  const nextItems = state.items.filter((item) => item.id !== itemId);
  if (nextItems.length === state.items.length) {
    return;
  }

  state.items = layoutItems(nextItems, "none");
  await persistItems();
  renderCanvas();
  setStatus("已删除卡片");
}

async function captureTabSnapshot(windowId, tabId) {
  try {
    await chrome.windows.update(windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    await delay(500);
    return await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 70
    });
  } catch (error) {
    console.warn("captureTabSnapshot failed", error);
    return "";
  }
}

async function extractTabHTML(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.documentElement?.cloneNode(true);
        if (!root) {
          return "";
        }
        root.querySelectorAll("script, style, noscript, svg, canvas, iframe").forEach((node) => node.remove());
        return `<!doctype html>\n${root.outerHTML}`;
      }
    });
    return results?.[0]?.result || "";
  } catch (error) {
    console.warn("extractTabHTML failed", error);
    return "";
  }
}

async function summarizeHTML({ modelConfig, title, url, html }) {
  const prompt = buildSummaryPrompt({ title, url, html });
  return requestModelSummary({ modelConfig, prompt });
}

async function summarizeText({ modelConfig, title, url, textContent }) {
  const prompt = buildTextSummaryPrompt({ title, url, textContent });
  return requestModelSummary({ modelConfig, prompt });
}

async function requestModelSummary({ modelConfig, prompt }) {
  const config = normalizeModelConfig(modelConfig);
  const meta = getProviderMeta(config.provider);

  if (meta.protocol === "anthropic") {
    return requestAnthropicSummary(config, prompt);
  }
  if (meta.protocol === "gemini") {
    return requestGeminiSummary(config, prompt);
  }
  return requestOpenAICompatibleSummary(config, prompt);
}

async function requestOpenAICompatibleSummary(config, prompt) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      max_tokens: 700
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${getProviderMeta(config.provider).label} 请求失败：HTTP ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim();
  return content || "模型未返回摘要内容。";
}

async function requestAnthropicSummary(config, prompt) {
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic 请求失败：HTTP ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.content?.map((item) => item?.text || "").join("\n").trim();
  return content || "模型未返回摘要内容。";
}

async function requestGeminiSummary(config, prompt) {
  const endpoint = buildGeminiEndpoint(config);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 700
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini 请求失败：HTTP ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.candidates?.[0]?.content?.parts?.map((item) => item?.text || "").join("\n").trim();
  return content || "模型未返回摘要内容。";
}

async function generateSummary({ modelConfig, title, url, html, textContent, contentSource }) {
  try {
    if (hasMeaningfulHtml(html)) {
      return await summarizeHTML({ modelConfig, title, url, html });
    }

    if (hasMeaningfulText(textContent)) {
      return await summarizeText({ modelConfig, title, url, textContent });
    }
  } catch (error) {
    console.warn("generateSummary failed", error);
    return buildLocalSummary({ title, url, textContent, contentSource });
  }

  return buildUnavailableSummary({ title, url, contentSource });
}

function buildSummaryPrompt({ title, url, html }) {
  const normalizedHtml = html
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .slice(0, 18000);

  return [
    "请将以下 HTML 页面内容用中文简洁地总结，提取最重要的要点。",
    "输出要求：",
    "1. 先用一句话说明页面主题",
    "2. 再用 3-5 条要点总结核心信息",
    "3. 避免输出无意义的导航、脚本或样式内容",
    "",
    `标题：${title}`,
    `链接：${url}`,
    "",
    "HTML 内容：",
    normalizedHtml
  ].join("\n");
}

function buildTextSummaryPrompt({ title, url, textContent }) {
  const normalizedText = String(textContent || "").replace(/\s+/g, " ").trim().slice(0, 12000);

  return [
    "请将以下网页提取内容用中文简洁地总结，提取最重要的要点。",
    "输出要求：",
    "1. 先用一句话说明页面主题",
    "2. 再用 3-5 条要点总结核心信息",
    "3. 如果内容疑似不完整，也请明确说明",
    "",
    `标题：${title}`,
    `链接：${url}`,
    "",
    "网页提取内容：",
    normalizedText
  ].join("\n");
}

function buildLocalSummary({ title, url, textContent, contentSource }) {
  const highlights = collectHighlights(textContent);
  const lines = [
    `页面主题：${title || humanizeUrl(url) || "未命名页面"}`,
    `内容来源：${contentSource}`
  ];

  if (highlights.length) {
    return `${lines.join("\n")}\n${highlights.map((item) => `- ${item}`).join("\n")}`;
  }

  return `${lines.join("\n")}\n- 自动摘要生成失败，当前仅保留标题与链接信息。`;
}

function buildUnavailableSummary({ title, url, contentSource }) {
  return [
    `页面主题：${title || humanizeUrl(url) || "未命名页面"}`,
    `内容来源：${contentSource}`,
    "- 未能获取可用于生成摘要的正文内容，当前仅保留标题与链接信息。"
  ].join("\n");
}

function collectHighlights(textContent) {
  const normalized = String(textContent || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = [];
  for (const segment of segments) {
    const cleaned = segment.replace(/^[-•*\d.\s]+/, "").trim();
    if (cleaned.length < 16) {
      continue;
    }
    if (unique.some((item) => item.includes(cleaned) || cleaned.includes(item))) {
      continue;
    }
    unique.push(cleaned.slice(0, 96));
    if (unique.length === 3) {
      break;
    }
  }

  if (unique.length) {
    return unique;
  }

  return [normalized.slice(0, 96)];
}

function extractMeaningfulTextFromHtml(html) {
  const markup = String(html || "").trim();
  if (!markup) {
    return "";
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(markup, "text/html");
    doc.querySelectorAll("script, style, noscript, svg, canvas, iframe").forEach((node) => node.remove());
    const description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "";
    const bodyText = doc.body?.innerText?.trim() || doc.body?.textContent?.trim() || "";
    return [description, bodyText].filter(Boolean).join("\n").replace(/\s+/g, " ").trim();
  } catch {
    return stripTags(markup).replace(/\s+/g, " ").trim();
  }
}

function extractTitleFromCrawlerText(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const heading = line.replace(/^#{1,6}\s*/, "").trim();
    if (heading && heading.length <= 120) {
      return heading;
    }
  }

  return "";
}

function hasMeaningfulHtml(html) {
  return hasMeaningfulText(extractMeaningfulTextFromHtml(html));
}

function hasMeaningfulText(text) {
  return String(text || "").trim().length >= MIN_CONTENT_LENGTH;
}

function buildCrawlerUrl(url) {
  return `${CRAWLER_PROXY_URL}${String(url).replace(/^https?:\/\//i, "")}`;
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

async function restoreActiveTabs(originalActiveTabs, lastFocusedWindow) {
  for (const [windowId, tabId] of originalActiveTabs.entries()) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(windowId, { focused: true });
    } catch (error) {
      console.warn("restoreActiveTabs failed", error);
    }
  }

  if (lastFocusedWindow?.id) {
    try {
      await chrome.windows.update(lastFocusedWindow.id, { focused: true });
    } catch (error) {
      console.warn("restore focus failed", error);
    }
  }
}

function setControlDisabled(disabled) {
  elements.importUrlInput.disabled = disabled;
  elements.importLinkButton.disabled = disabled;
  elements.syncTabsButton.disabled = disabled;
  elements.syncCurrentWindowButton.disabled = disabled;
  elements.searchInput.disabled = disabled;
  elements.clusterModeSelect.disabled = disabled;
  elements.openSettingsButton.disabled = disabled;
  elements.exportImageButton.disabled = disabled;
  elements.exportJsonButton.disabled = disabled;
  elements.clearCanvasButton.disabled = disabled;
}

async function persistItems() {
  await chrome.storage.local.set({ [STORAGE_KEYS.items]: state.items });
}

function renderCanvas() {
  const renderState = getRenderState();
  elements.canvas.innerHTML = "";
  elements.canvasMeta.textContent = renderState.metaText;

  if (!renderState.items.length) {
    elements.canvas.style.minHeight = "720px";
    elements.canvas.style.minWidth = "100%";
    const empty = document.createElement("div");
    empty.className = "canvas-empty";
    empty.textContent = state.searchQuery ? "没有匹配到卡片，请尝试其他关键词" : "当前画布暂无卡片";
    elements.canvas.appendChild(empty);
    return;
  }

  let maxBottom = 720;
  let maxRight = 1200;

  if (renderState.showGroupFrames) {
    const groupFrames = buildGroupFrames(renderState.items);
    for (const group of groupFrames) {
      const label = document.createElement("div");
      label.className = "window-group-label";
      label.textContent = group.label;
      label.style.left = `${group.minX}px`;
      label.style.top = `${Math.max(12, group.minY - 40)}px`;
      elements.canvas.appendChild(label);
    }
  }

  for (const item of renderState.items) {
    const fragment = elements.template.content.cloneNode(true);
    const card = fragment.querySelector(".tab-card");
    const header = fragment.querySelector(".card-header");
    const title = fragment.querySelector(".card-title");
    const windowLabel = fragment.querySelector(".card-window");
    const editButton = fragment.querySelector(".card-edit-button");
    const deleteButton = fragment.querySelector(".card-delete-button");
    const shot = fragment.querySelector(".card-shot");
    const placeholder = fragment.querySelector(".shot-placeholder");
    const summary = fragment.querySelector(".card-summary");
    const summaryToggle = fragment.querySelector(".summary-toggle");
    const link = fragment.querySelector(".card-link");

    title.textContent = item.title;
    title.title = item.title;
    windowLabel.textContent = item.windowLabel || "未分组窗口";
    summary.textContent = item.summary;
    summary.title = item.summary;
    link.href = item.url;
    link.textContent = formatDisplayUrl(item.url);
    link.title = item.url;

    if (item.screenshot) {
      shot.src = item.screenshot;
      shot.classList.add("ready");
      placeholder.style.display = "none";
    } else {
      placeholder.style.display = "grid";
    }

    card.style.left = `${item.x}px`;
    card.style.top = `${item.y}px`;
    card.dataset.itemId = item.id;

    if (renderState.dragEnabled) {
      header.addEventListener("mousedown", (event) => {
        startDrag(item.id, event);
      });
    } else {
      header.style.cursor = "default";
    }
    editButton.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });
    editButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditModal(item.id);
    });
    deleteButton.addEventListener("mousedown", (event) => {
      event.stopPropagation();
    });
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteCard(item.id);
    });
    summaryToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSummary(summary, summaryToggle);
    });

    elements.canvas.appendChild(fragment);
    syncSummaryCollapse(summary, summaryToggle);
    maxBottom = Math.max(maxBottom, item.y + CARD_HEIGHT + 48);
    maxRight = Math.max(maxRight, item.x + CARD_WIDTH + 48);
  }

  elements.canvas.style.minHeight = `${maxBottom}px`;
  elements.canvas.style.minWidth = `${maxRight}px`;
}

function startDrag(itemId, event) {
  if (!isManualLayoutMode()) {
    return;
  }

  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const card = elements.canvas.querySelector(`[data-item-id="${itemId}"]`);
  if (card) {
    card.classList.add("dragging");
  }

  state.dragging = {
    itemId,
    originMouseX: event.clientX,
    originMouseY: event.clientY,
    originItemX: item.x,
    originItemY: item.y
  };
}

function handleDragMove(event) {
  if (!state.dragging) {
    return;
  }

  const { itemId, originMouseX, originMouseY, originItemX, originItemY } = state.dragging;
  const deltaX = event.clientX - originMouseX;
  const deltaY = event.clientY - originMouseY;
  const nextX = Math.max(16, originItemX + deltaX);
  const nextY = Math.max(16, originItemY + deltaY);

  state.items = state.items.map((item) => {
    if (item.id !== itemId) {
      return item;
    }
    return { ...item, x: nextX, y: nextY };
  });

  renderCanvas();
}

async function stopDrag() {
  if (!state.dragging) {
    return;
  }

  const { itemId } = state.dragging;
  const card = elements.canvas.querySelector(`[data-item-id="${itemId}"]`);
  if (card) {
    card.classList.remove("dragging");
  }

  state.dragging = null;
  await persistItems();
}

async function exportCanvasAsJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    clusterMode: state.clusterMode,
    searchQuery: state.searchQuery,
    items: state.items
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  triggerDownload(blob, `paper-paste-tab-canvas-${Date.now()}.json`);
  setStatus("已导出画布 JSON");
}

async function exportCanvasAsImage() {
  const renderState = getRenderState();
  if (!renderState.items.length) {
    setStatus("当前没有可导出的卡片");
    return;
  }

  const bounds = getCanvasBounds(renderState.items);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width + EXPORT_PADDING * 2);
  canvas.height = Math.ceil(bounds.height + EXPORT_PADDING * 2);
  const context = canvas.getContext("2d");

  context.fillStyle = "#f4f5f7";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (renderState.showGroupFrames) {
    const groups = buildGroupFrames(renderState.items);
    for (const group of groups) {
      drawGroupLabel(context, group, bounds);
    }
  }

  for (const item of renderState.items) {
    await drawCardToCanvas(context, item, bounds);
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    setStatus("导出 PNG 失败");
    return;
  }
  triggerDownload(blob, `paper-paste-tab-canvas-${Date.now()}.png`);
  setStatus("已导出画布 PNG");
}

function getCanvasBounds(items) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + CARD_WIDTH);
    maxY = Math.max(maxY, item.y + CARD_HEIGHT);
  }

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function drawGroupLabel(context, group, bounds) {
  const x = group.minX - bounds.minX + EXPORT_PADDING;
  const y = Math.max(16, group.minY - bounds.minY - 28 + EXPORT_PADDING);
  const text = group.label;
  context.font = "800 12px Inter, sans-serif";
  const width = context.measureText(text).width + 24;
  const height = 28;

  roundRect(context, x, y, width, height, 14, "rgba(31,35,41,0.08)");
  context.fillStyle = "rgba(31,35,41,0.72)";
  context.fillText(text, x + 12, y + 18);
}

async function drawCardToCanvas(context, item, bounds) {
  const x = item.x - bounds.minX + EXPORT_PADDING;
  const y = item.y - bounds.minY + EXPORT_PADDING;

  roundRect(context, x, y, CARD_WIDTH, CARD_HEIGHT, 20, "rgba(255,255,255,0.96)", "rgba(31,35,41,0.08)");

  context.fillStyle = "#1f2329";
  context.font = "800 16px Inter, sans-serif";
  fillWrappedText(context, item.title, x + 16, y + 32, CARD_WIDTH - 32, 22, 1);

  context.fillStyle = "rgba(31,35,41,0.46)";
  context.font = "700 12px Inter, sans-serif";
  fillWrappedText(context, item.groupLabel || item.windowLabel || "未分组窗口", x + 16, y + 62, CARD_WIDTH - 32, 18, 1);

  roundRect(context, x + 16, y + 86, CARD_WIDTH - 32, 180, 16, "#eef1f5");
  if (item.screenshot) {
    try {
      const image = await loadImage(item.screenshot);
      context.save();
      roundedClip(context, x + 16, y + 86, CARD_WIDTH - 32, 180, 16);
      context.drawImage(image, x + 16, y + 86, CARD_WIDTH - 32, 180);
      context.restore();
    } catch {
      drawPlaceholderText(context, "暂无截图", x + 16, y + 86, CARD_WIDTH - 32, 180);
    }
  } else {
    drawPlaceholderText(context, "暂无截图", x + 16, y + 86, CARD_WIDTH - 32, 180);
  }

  context.fillStyle = "rgba(31,35,41,0.45)";
  context.font = "800 12px Inter, sans-serif";
  context.fillText("摘要", x + 16, y + 298);

  context.fillStyle = "rgba(31,35,41,0.88)";
  context.font = "13px Inter, sans-serif";
  fillWrappedText(context, item.summary, x + 16, y + 322, CARD_WIDTH - 32, 20, 2);

  context.fillStyle = "rgba(31,35,41,0.45)";
  context.font = "800 12px Inter, sans-serif";
  context.fillText("链接", x + 16, y + 476);

  context.fillStyle = "#2660b8";
  context.font = "13px Inter, sans-serif";
  fillWrappedText(context, formatDisplayUrl(item.url, 44), x + 16, y + 500, CARD_WIDTH - 32, 18, 2);
}

function drawPlaceholderText(context, text, x, y, width, height) {
  context.fillStyle = "rgba(31,35,41,0.42)";
  context.font = "600 13px Inter, sans-serif";
  const textWidth = context.measureText(text).width;
  context.fillText(text, x + (width - textWidth) / 2, y + height / 2);
}

function roundRect(context, x, y, width, height, radius, fillStyle, strokeStyle) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();

  if (fillStyle) {
    context.fillStyle = fillStyle;
    context.fill();
  }

  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = 1;
    context.stroke();
  }
}

function roundedClip(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.clip();
}

function fillWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapText(context, text, maxWidth);
  const visibleLines = lines.slice(0, maxLines);
  visibleLines.forEach((line, index) => {
    const content = index === maxLines - 1 && lines.length > maxLines ? `${line}…` : line;
    context.fillText(content, x, y + index * lineHeight);
  });
}

function wrapText(context, text, maxWidth) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return [""];
  }

  const chars = [...clean];
  const lines = [];
  let currentLine = "";
  for (const char of chars) {
    const nextLine = currentLine + char;
    if (context.measureText(nextLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = nextLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function syncSummaryCollapse(summaryElement, toggleButton) {
  if (!summaryElement || !toggleButton) {
    return;
  }

  const shouldCollapse = isTextOverflowing(summaryElement, 2);
  toggleButton.hidden = !shouldCollapse;
  toggleButton.textContent = "展开";
  summaryElement.classList.toggle("is-collapsed", shouldCollapse);
  summaryElement.classList.remove("is-expanded");
  summaryElement.closest(".tab-card")?.classList.remove("summary-expanded");
}

function toggleSummary(summaryElement, toggleButton) {
  if (!summaryElement || !toggleButton || toggleButton.hidden) {
    return;
  }

  const isExpanded = summaryElement.classList.toggle("is-expanded");
  summaryElement.classList.toggle("is-collapsed", !isExpanded);
  toggleButton.textContent = isExpanded ? "收起" : "展开";
  summaryElement.closest(".tab-card")?.classList.toggle("summary-expanded", isExpanded);
}

function isTextOverflowing(element, maxLines) {
  const computedStyle = window.getComputedStyle(element);
  const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.6;
  const maxHeight = lineHeight * maxLines;
  return element.scrollHeight > maxHeight + 1;
}

function getRenderState() {
  const filteredItems = filterItems(state.items, state.searchQuery);
  const autoLayout = !isManualLayoutMode();
  const items = autoLayout
    ? layoutItems(filteredItems, state.clusterMode)
    : filteredItems;

  return {
    items,
    showGroupFrames: state.clusterMode !== "none",
    dragEnabled: !autoLayout,
    metaText: filteredItems.length === state.items.length
      ? `${filteredItems.length} 个标签页卡片`
      : `${filteredItems.length} / ${state.items.length} 个标签页卡片`
  };
}

function filterItems(items, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) {
    return items.map((item) => ({ ...item }));
  }

  const keywords = normalizedQuery.split(/\s+/).filter(Boolean);
  return items
    .filter((item) => {
      const haystack = `${item.title || ""}\n${item.summary || ""}`.toLowerCase();
      return keywords.every((keyword) => haystack.includes(keyword));
    })
    .map((item) => ({ ...item }));
}

function buildGroups(items, groupMode) {
  if (groupMode === "window") {
    return buildWindowGroups(items);
  }
  if (groupMode === "domain") {
    return buildDomainGroups(items);
  }
  if (groupMode === "content") {
    return buildContentGroups(items);
  }
  return [
    {
      key: "all",
      label: "全部卡片",
      items
    }
  ];
}

function buildWindowGroups(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = String(item.windowId ?? "unknown");
    const label = item.windowLabel || `窗口 ${key}`;
    const group = groups.get(key) || { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  });
  return [...groups.values()].map(appendGroupCountLabel);
}

function buildDomainGroups(items) {
  const groups = new Map();
  items.forEach((item) => {
    const domain = humanizeUrl(item.url);
    const key = domain || "other";
    const label = `域名 · ${domain || "未知来源"}`;
    const group = groups.get(key) || { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  });
  return [...groups.values()].sort((left, right) => right.items.length - left.items.length).map(appendGroupCountLabel);
}

function buildContentGroups(items) {
  const clusters = [];

  items.forEach((item) => {
    const tokens = extractContentTokens(`${item.title || ""}\n${item.summary || ""}`);
    let bestCluster = null;
    let bestScore = 0;

    clusters.forEach((cluster) => {
      const score = calculateTokenSimilarity(tokens, cluster.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    });

    if (!bestCluster || bestScore < 0.34) {
      const label = tokens[0] ? `主题 · ${formatClusterToken(tokens[0])}` : "主题 · 其他";
      clusters.push({
        key: `content-${clusters.length + 1}`,
        label,
        tokens,
        items: [item]
      });
      return;
    }

    bestCluster.items.push(item);
    bestCluster.tokens = mergeTokens(bestCluster.tokens, tokens);
    if (bestCluster.tokens[0]) {
      bestCluster.label = `主题 · ${formatClusterToken(bestCluster.tokens[0])}`;
    }
  });

  return clusters.sort((left, right) => right.items.length - left.items.length).map(appendGroupCountLabel);
}

function appendGroupCountLabel(group) {
  return {
    ...group,
    label: `${group.label} · ${group.items.length}`
  };
}

function extractContentTokens(text) {
  const rawTokens = String(text || "")
    .toLowerCase()
    .match(/[a-z]{4,}|[\u4e00-\u9fff]{2,}/g) || [];

  const counts = new Map();
  rawTokens.forEach((token) => {
    if (CONTENT_CLUSTER_STOP_WORDS.has(token)) {
      return;
    }
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].length - right[0].length)
    .slice(0, 6)
    .map(([token]) => token);
}

function calculateTokenSimilarity(leftTokens, rightTokens) {
  if (!leftTokens.length || !rightTokens.length) {
    return 0;
  }
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });
  return intersection / new Set([...left, ...right]).size;
}

function mergeTokens(baseTokens, incomingTokens) {
  const merged = [...new Set([...baseTokens, ...incomingTokens])];
  return merged.slice(0, 6);
}

function formatClusterToken(token) {
  if (/^[a-z]+$/.test(token)) {
    return token.charAt(0).toUpperCase() + token.slice(1);
  }
  return token;
}

function isManualLayoutMode() {
  return state.clusterMode === "none" && !state.searchQuery;
}

function getClusterModeLabel(mode) {
  return {
    none: "不聚类",
    window: "按窗口聚合",
    domain: "按域名聚合",
    content: "按内容聚合"
  }[mode] || "不聚类";
}

function getClusterModeStatusText() {
  return state.clusterMode === "none"
    ? "已切换为普通画布视图"
    : `已切换为${getClusterModeLabel(state.clusterMode)}`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function humanizeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "链接";
  }
}

function formatDisplayUrl(url, maxLength = 52) {
  const raw = String(url || "").trim();
  if (!raw) {
    return "链接";
  }

  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.replace(":", "");
    const base = ["http", "https"].includes(protocol)
      ? parsed.hostname.replace(/^www\./, "")
      : `${protocol}://${shortenMiddle(parsed.hostname, 18)}`;
    const pathPreview = buildPathPreview(parsed.pathname);
    const suffix = `${parsed.search ? "?…" : ""}${parsed.hash ? "#…" : ""}`;
    return shortenMiddle(`${base}${pathPreview}${suffix}`, maxLength);
  } catch {
    return shortenMiddle(raw, maxLength);
  }
}

function buildPathPreview(pathname) {
  const segments = String(pathname || "")
    .split("/")
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  if (segments.length === 1) {
    return `/${segments[0]}`;
  }

  const first = segments[0];
  const last = segments[segments.length - 1];
  return segments.length === 2 ? `/${first}/${last}` : `/${first}/…/${last}`;
}

function shortenMiddle(text, maxLength) {
  const content = String(text || "");
  if (content.length <= maxLength) {
    return content;
  }

  const available = Math.max(1, maxLength - 1);
  const startLength = Math.ceil(available * 0.6);
  const endLength = Math.max(1, available - startLength);
  return `${content.slice(0, startLength)}…${content.slice(-endLength)}`;
}

function isRestrictedUrl(url) {
  return /^(chrome|chrome-extension|edge|about|devtools):/i.test(url);
}

function normalizeUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeEditableUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function buildGeminiEndpoint(config) {
  const normalizedEndpoint = config.endpoint.replace(/\/$/, "");
  if (normalizedEndpoint.includes(":generateContent")) {
    return `${normalizedEndpoint}${normalizedEndpoint.includes("?") ? "&" : "?"}key=${encodeURIComponent(config.apiKey)}`;
  }
  if (/\/models\/[^/]+$/.test(normalizedEndpoint)) {
    return `${normalizedEndpoint}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  }
  return `${normalizedEndpoint}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
}

function createItemKey(url) {
  return `${Date.now()}-${btoa(url).replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
}

function setStatus(text) {
  elements.status.textContent = text;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
