const SETTINGS_DRAFT_KEY = "newsPublisherSettingsDraft";
const SOURCE_TEMPLATE_QUERY_KEY = "newsPublisherSourceTemplateQuery";
const ADMIN_API_KEY_KEY = "adminApiKey";

const SOURCE_EXAMPLE_FALLBACKS = {
  site: [
    {
      name: "OpenAI News",
      url: "https://openai.com/news/rss.xml",
      description: "Official OpenAI product and research updates.",
    },
    {
      name: "Anthropic",
      url: "https://www.anthropic.com/news",
      description: "Claude updates and AI research from Anthropic.",
    },
    {
      name: "Google DeepMind",
      url: "https://deepmind.google/discover/blog/",
      description: "Research posts and model announcements from DeepMind.",
    },
    {
      name: "Hugging Face",
      url: "https://huggingface.co/blog/feed.xml",
      description: "Open-source AI and machine learning ecosystem updates.",
    },
    {
      name: "VentureBeat AI",
      url: "https://venturebeat.com/category/ai/feed/",
      description: "Fast AI news about startups, products, and market shifts.",
    },
  ],
  tg: [
    {
      name: "NEXTA Live",
      url: "https://t.me/nexta_live",
      description: "Fast channel for breaking news and social updates.",
    },
    {
      name: "IT Ukraine Association",
      url: "https://t.me/itukraineassociation",
      description: "Ukrainian IT community, events, and market updates.",
    },
    {
      name: "IT Ukraine",
      url: "https://t.me/itukraine",
      description: "Ukrainian technology news and community updates.",
    },
    {
      name: "Telegraf UA",
      url: "https://t.me/Telegraf_UA_channel",
      description: "Ukrainian media, analysis, and breaking updates.",
    },
    {
      name: "Ukraine Online",
      url: "https://t.me/UaOnlii",
      description: "Operational Ukrainian news and social topics.",
    },
    {
      name: "Sota.Vision",
      url: "https://t.me/sotavisionmedia",
      description: "Independent social and public affairs coverage.",
    },
  ],
};

const PIPELINE_STEPS = [
  { key: "Pipeline Started", label: "Start" },
  { key: "RSS Processing", label: "RSS" },
  { key: "Telegram Processing", label: "Telegram" },
  { key: "AI Processing", label: "Filters" },
  { key: "Post Generation", label: "AI" },
  { key: "Publishing", label: "Publish" },
  { key: "Completed", label: "Done" },
];

const DEFAULT_SETTINGS_DRAFT = {
  adminApiKey: "",
  openaiApiKey: "",
  telegramApiId: "",
  telegramApiHash: "",
  telegramChannel: "",
  parsingInterval: "",
  aiGenerationInterval: "",
  publishingInterval: "",
  language: "Ukrainian",
  duplicateDetection: true,
  sourceFiltering: true,
  autoPublishPosts: false,
};

const state = {
  publicStatus: null,
  settings: null,
  openaiCheckResult: null,
  telegramCheckResult: null,
  sources: [],
  sourceSuggestions: [],
  topics: [],
  keywords: [],
  news: [],
  posts: [],
  errorLogs: [],
  pipelineStatus: null,
  pipelineTaskId: sessionStorage.getItem("pipelineTaskId") || "",
  pipelineStepFocus: "",
  postStatusFilter: "",
  selectedPostId: "",
  sourceTemplateQuery: readJson(SOURCE_TEMPLATE_QUERY_KEY, ""),
  settingsDraft: loadSettingsDraft(),
  uiPaused: false,
  taskTimers: new Map(),
};

const $ = (selector) => document.querySelector(selector);

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadSettingsDraft() {
  const draft = readJson(SETTINGS_DRAFT_KEY, DEFAULT_SETTINGS_DRAFT);
  const merged = { ...DEFAULT_SETTINGS_DRAFT, ...draft };
  if (merged.adminApiKey) {
    sessionStorage.setItem(ADMIN_API_KEY_KEY, merged.adminApiKey);
  }
  return merged;
}

function saveSettingsDraft(patch = {}) {
  state.settingsDraft = { ...state.settingsDraft, ...patch };
  writeJson(SETTINGS_DRAFT_KEY, state.settingsDraft);
  if (typeof patch.adminApiKey === "string") {
    const key = normalize(patch.adminApiKey);
    if (key) {
      sessionStorage.setItem(ADMIN_API_KEY_KEY, key);
    } else {
      sessionStorage.removeItem(ADMIN_API_KEY_KEY);
    }
  }
}

function hasAdminKey() {
  return Boolean(sessionStorage.getItem(ADMIN_API_KEY_KEY));
}

function setAdminKey(value) {
  const key = normalize(value);
  if (key) {
    sessionStorage.setItem(ADMIN_API_KEY_KEY, key);
  } else {
    sessionStorage.removeItem(ADMIN_API_KEY_KEY);
  }
  saveSettingsDraft({ adminApiKey: key });
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": sessionStorage.getItem(ADMIN_API_KEY_KEY) || "",
  };
}

function normalize(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });
}

function formatShortTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

function isSameLocalDay(value, reference = new Date()) {
  if (!value) return false;
  const left = new Date(value);
  return (
    left.getFullYear() === reference.getFullYear() &&
    left.getMonth() === reference.getMonth() &&
    left.getDate() === reference.getDate()
  );
}

function setStatus(selector, token, text) {
  const nodes = document.querySelectorAll(selector);
  if (!nodes.length) return;
  const tone =
    token === "OK"
      ? "status--ok"
      : token === "ERROR"
        ? "status--error"
        : token === "RUN"
          ? "status--run"
          : "status--wait";
  nodes.forEach((node) => {
    node.classList.remove("status--ok", "status--error", "status--wait", "status--run");
    node.classList.add(tone);
    node.textContent = text;
  });
}

function setText(selector, text) {
  const nodes = document.querySelectorAll(selector);
  nodes.forEach((node) => {
    node.textContent = text;
  });
}

function setHtml(selector, html) {
  const nodes = document.querySelectorAll(selector);
  nodes.forEach((node) => {
    node.innerHTML = html;
  });
}

function showToast(message, tone = "info") {
  const toast = $("#toast");
  const messageNode = $("#toastMessage");
  if (!toast || !messageNode) return;
  toast.classList.remove("toast--ok", "toast--error", "toast--warn");
  if (tone === "ok") toast.classList.add("toast--ok");
  if (tone === "error") toast.classList.add("toast--error");
  if (tone === "warn") toast.classList.add("toast--warn");
  messageNode.textContent = message;
  toast.hidden = false;
}

function openDialog(selector) {
  const dialog = $(selector);
  if (!dialog) return;
  dialog.hidden = false;
  if (typeof dialog.showModal === "function") {
    try {
      dialog.showModal();
      return;
    } catch {
      // Fall back below.
    }
  }
  dialog.setAttribute("open", "");
  dialog.classList.add("is-open");
}

function closeDialog(selector) {
  const dialog = $(selector);
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    try {
      dialog.close();
    } catch {
      // Keep the fallback reset below.
    }
  }
  dialog.removeAttribute("open");
  dialog.classList.remove("is-open");
  dialog.hidden = true;
}

function closeAllDialogs() {
  document.querySelectorAll("dialog").forEach((dialog) => {
    if (typeof dialog.close === "function" && dialog.open) {
      try {
        dialog.close();
      } catch {
        // ignore
      }
    }
    dialog.removeAttribute("open");
    dialog.classList.remove("is-open");
    dialog.hidden = true;
  });
}

function closeAllDetails(exceptId = "") {
  document.querySelectorAll("details.section, details.subdetails").forEach((node) => {
    if (node.id !== exceptId) {
      node.open = false;
    }
  });
}

function resetDashboardView({ scroll = true } = {}) {
  state.pipelineStepFocus = "";
  closeAllDialogs();
  closeAllDetails();
  if (scroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function openSection(sectionId, { scroll = true } = {}) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  closeAllDetails(sectionId);
  section.open = true;
  document.querySelectorAll(".sidebar .nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.openSection === sectionId);
  });
  if (scroll) {
    window.requestAnimationFrame(() => {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

function explainErrorBody(body, fallback) {
  if (!body) return fallback;
  if (typeof body === "string") return body;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) return body.detail.map((item) => item.msg || JSON.stringify(item)).join("; ");
  if (body.message) return String(body.message);
  return JSON.stringify(body);
}

async function requestJson(path, options = {}, auth = true) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(auth ? authHeaders() : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error("Не вдалося з'єднатися з API. Перевір, що сервер запущено.");
  }

  if (!response.ok) {
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    throw new Error(explainErrorBody(parsed, `${response.status} ${response.statusText}`));
  }

  if (response.status === 204) return null;
  return response.json();
}

const api = (path, options = {}) => requestJson(path, options, true);
const publicApi = (path, options = {}) => requestJson(path, options, false);

function withButtonState(button, busyLabel) {
  if (!button) return () => {};
  const original = button.dataset.originalText || button.textContent;
  button.dataset.originalText = original;
  button.disabled = true;
  button.textContent = busyLabel;
  return (mode, finalLabel) => {
    button.disabled = false;
    button.textContent = finalLabel || original;
    button.classList.toggle("is-success", mode === "success");
    button.classList.toggle("is-error", mode === "error");
    button.classList.toggle("is-warn", mode === "warn");
    window.setTimeout(() => {
      button.classList.remove("is-success", "is-error", "is-warn");
      button.textContent = original;
    }, 2500);
  };
}

function splitKeywords(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function sourceHref(value) {
  const text = normalize(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) {
    return text
      .replace(/^http:\/\//i, "https://")
      .replace(/^https:\/\/telegram\.me\//i, "https://t.me/")
      .replace(/^http:\/\/telegram\.me\//i, "https://t.me/")
      .replace(/^http:\/\/t\.me\//i, "https://t.me/")
      .replace(/^https:\/\/t\.me\//i, "https://t.me/");
  }
  if (text.startsWith("@")) return `https://t.me/${text.slice(1)}`;
  if (text.startsWith("t.me/")) return `https://${text}`;
  if (text.startsWith("telegram.me/")) return `https://t.me/${text.slice("telegram.me/".length)}`;
  if (text.includes("/") || text.includes(".")) return `https://${text}`;
  return `https://t.me/${text}`;
}

function normalizeTelegramUrl(value) {
  const text = normalize(value);
  if (!text) return "";
  if (text.startsWith("@")) return `https://t.me/${text.slice(1)}`;
  if (/^(https?:\/\/)?telegram\.me\//i.test(text)) {
    return `https://t.me/${text.replace(/^(https?:\/\/)?telegram\.me\//i, "")}`;
  }
  if (/^(https?:\/\/)?t\.me\//i.test(text)) {
    return `https://t.me/${text.replace(/^(https?:\/\/)?t\.me\//i, "")}`;
  }
  return `https://t.me/${text.replace(/^\/+/, "")}`;
}

function normalizeSourceUrl(type, value) {
  const text = normalize(value);
  if (type === "tg") return normalizeTelegramUrl(text);
  if (/^https?:\/\//i.test(text)) return text.replace(/^http:\/\//i, "https://");
  if (text.includes(".")) return `https://${text}`;
  return text;
}

function sourceTypeLabel(type) {
  return type === "tg" ? "Telegram" : "Website";
}

function sourceTone(source) {
  if (source.last_error) return "error";
  if (source.enabled) return "ok";
  return "wait";
}

function sourceStatusLabel(source) {
  if (source.enabled) return "Enabled";
  return "Disabled";
}

function slugifyText(value) {
  return normalize(value).toLowerCase().replace(/\s+/g, "-");
}

function topicById(topicId) {
  return state.topics.find((item) => item.id === topicId) || null;
}

function topicNameById(topicId) {
  return topicById(topicId)?.name || "Global";
}

function topicSlugById(topicId) {
  return topicById(topicId)?.slug || "";
}

function topicIdBySlug(slug) {
  const target = normalize(slug).toLowerCase();
  if (!target) return "";
  return topicByIdList().find((item) => normalize(item.slug).toLowerCase() === target)?.id || "";
}

function topicByIdList() {
  return state.topics;
}

function renderTopicSelectOptions(selector, selectedValue = "", placeholder = "Global / no theme") {
  const node = $(selector);
  if (!node) return;
  const current = normalize(selectedValue);
  const options = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...state.topics.map(
      (topic) =>
        `<option value="${escapeHtml(topic.id)}"${topic.id === current ? " selected" : ""}>${escapeHtml(topic.name)}</option>`
    ),
  ];
  node.innerHTML = options.join("");
  if (current) {
    node.value = current;
  } else {
    node.value = "";
  }
}

function postStatusInfo(status) {
  const map = {
    new: { label: "New", tone: "run" },
    generated: { label: "Generated", tone: "wait" },
    pending_approval: { label: "Generated", tone: "wait" },
    published: { label: "Published", tone: "ok" },
    failed: { label: "Failed", tone: "error" },
    rejected: { label: "Failed", tone: "error" },
  };
  return map[status] || { label: String(status || "New"), tone: "wait" };
}

function pipelineTone(stageState) {
  if (stageState === "running") return "is-running";
  if (stageState === "completed") return "is-complete";
  if (stageState === "failed") return "is-failed";
  if (stageState === "stopped") return "is-stopped";
  return "";
}

function translateStageLabel(value) {
  const map = {
    "Pipeline Started": "Start",
    "RSS Processing": "Collect RSS",
    "Telegram Processing": "Collect Telegram",
    "AI Processing": "Filters",
    "Post Generation": "AI",
    "Publishing": "Publish",
    "Completed": "Done",
  };
  return map[value] || value || "";
}

function translateStageState(value) {
  const map = {
    pending: "waiting",
    running: "active",
    completed: "done",
    failed: "failed",
    stopped: "stopped",
  };
  return map[value] || value || "";
}

function statusExplanation(value) {
  const map = {
    Ready: "Ready means the dashboard can start a new run, but no collection is active right now.",
    Running: "Running means Celery is collecting sources, filtering news, or queueing AI/publish tasks.",
    Stopped: "Stopped means no main collection task is running. If the last run was fast, it may have simply found no new news.",
    Done: "Done means the main collection task finished. AI generation and publishing can still be separate queued tasks.",
    Error: "Error means the task failed. Check Failed Tasks, source errors, and logs.",
  };
  return map[value] || map.Ready;
}

function stageExplanation(stageKey, stageState) {
  const descriptions = {
    "Pipeline Started": "prepares the run",
    "RSS Processing": "checks website feeds",
    "Telegram Processing": "checks channels",
    "AI Processing": "applies filters",
    "Post Generation": "queues AI drafts",
    Publishing: "queues Telegram sends",
    Completed: "main run finished",
  };
  if (stageState === "pending") return descriptions[stageKey] || "waiting for its turn";
  if (stageState === "running") return descriptions[stageKey] || "running now";
  if (stageState === "completed") return "completed";
  if (stageState === "stopped") return "stopped here";
  if (stageState === "failed") return "failed here";
  return descriptions[stageKey] || "";
}

function pipelineOutcomeMessage(meta, context) {
  if (context.running) {
    return `Running: ${translateStageLabel(meta.stage_label || meta.stage_key || "Pipeline Started")}. Watch the live feed below for active changes.`;
  }
  if (context.failed) {
    return explainErrorBody(context.status.task_result || context.status.task_meta, "Pipeline finished with an error");
  }
  if (context.stopped) {
    return "Pipeline stopped. Stop works only while the main collection task is still running.";
  }
  if (context.status.task_state === "SUCCESS") {
    const newItems = Number(meta.new_items || 0);
    const queued = Number(meta.queued_for_ai || 0);
    const errors = Number(meta.errors || 0);
    if (!newItems && !queued && !errors) {
      return "Pipeline finished quickly: no new news was found, so there was nothing to generate or publish.";
    }
    return `Pipeline finished: ${newItems} new, ${queued} queued for AI, ${errors} failed source checks.`;
  }
  return "Ready means sources and settings can be checked, but no collection is running yet.";
}

function pipelineToastMessage(status, stopped) {
  const meta = status.task_result && Object.keys(status.task_result).length ? status.task_result : status.task_meta || {};
  if (stopped) return "Pipeline stopped. There may be no need to stop it if the run already finished.";
  if (status.task_state === "FAILURE") return "Pipeline finished with an error. Check Failed Tasks and source errors.";
  const newItems = Number(meta.new_items || 0);
  const queued = Number(meta.queued_for_ai || 0);
  const errors = Number(meta.errors || 0);
  if (!newItems && !queued && !errors) return "Pipeline completed quickly: no new news was found, so nothing was generated.";
  return `Pipeline completed: ${newItems} new, ${queued} queued for AI, ${errors} failed.`;
}

function pipelineContext() {
  const status = state.pipelineStatus || {};
  const meta = status.task_result && Object.keys(status.task_result).length ? status.task_result : status.task_meta || {};
  const terminal = ["SUCCESS", "FAILURE", "REVOKED"].includes(status.task_state);
  const stopped = Boolean(
    meta.stopped ||
      status.task_state === "REVOKED" ||
      status.task_result?.stopped ||
      status.task_meta?.stopped ||
      (state.uiPaused && state.pipelineTaskId && !terminal)
  );
  const running =
    !stopped && (Boolean(meta.pipeline_running) || ["PENDING", "STARTED", "PROGRESS", "RETRY", "queued", "running"].includes(status.task_state));
  const failed = status.task_state === "FAILURE";
  return { status, meta, stopped, running, failed };
}

function isPipelineTerminal(status) {
  return ["SUCCESS", "FAILURE", "REVOKED"].includes(status?.task_state);
}

function renderPlaceholder(bodySelector, message, colspan) {
  const body = $(bodySelector);
  if (!body) return;
  body.innerHTML = `<tr><td colspan="${colspan}" class="muted">${escapeHtml(message)}</td></tr>`;
}

function renderPublicState() {
  const pub = state.publicStatus || {};
  const connected = Boolean(pub.telegram_connected);
  const target = normalize(pub.telegram_target_channel);

  const link = $("#telegramChannelLinkTop");
  if (link) {
    link.hidden = false;
    link.classList.remove("is-success", "is-error", "is-warn");
    if (connected && target) {
      link.href = sourceHref(target);
      link.removeAttribute("data-open-section");
      link.textContent = "📢 Відкрити Telegram-канал";
      link.classList.add("is-success");
      link.title = "Open the connected Telegram channel";
    } else {
      link.href = "#settingsSection";
      link.setAttribute("data-open-section", "settingsSection");
      link.textContent = "📢 Telegram connection scenario";
      link.classList.add("is-warn");
      link.title = "Open Settings to finish Telegram connection";
    }
  }

  if (!hasAdminKey()) {
    setText(
      "#panelStatusNote",
      connected ? "Telegram connected. Add the admin access code in Settings to unlock private data." : "Add the admin access code in Settings to unlock private data and Telegram setup."
    );
  } else if (connected) {
    setText("#panelStatusNote", `Telegram connected to ${target || "the configured channel"}. Private blocks are unlocked.`);
  } else {
    setText("#panelStatusNote", "Private blocks are unlocked. Telegram is shown as a connection scenario until the channel is confirmed.");
  }
}

function mergedSourceSuggestions(type) {
  const query = normalize(state.sourceTemplateQuery).toLowerCase();
  const base = state.sourceSuggestions.filter((item) => item.type === type);
  const fallback = SOURCE_EXAMPLE_FALLBACKS[type] || [];
  const seen = new Set();
  const merged = [];

  for (const item of [...base, ...fallback]) {
    const name = normalize(item.name).toLowerCase();
    const url = normalize(item.url).toLowerCase();
    const key = `${name}|${url}`;
    if (seen.has(key)) continue;
    if (query) {
      const haystack = `${name} ${url} ${normalize(item.description).toLowerCase()}`;
      if (!haystack.includes(query)) continue;
    }
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function renderSuggestionCard(item, index, type, locked = false) {
  const typeLabel = sourceTypeLabel(type);
  return `
    <article class="template-card">
      <div class="template-head">
        <div>
          <div class="row-title">${escapeHtml(item.name)}</div>
          <div class="template-url">${escapeHtml(item.url)}</div>
        </div>
        <span class="badge badge--ok">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="template-desc">${escapeHtml(item.description || "")}</div>
      <div class="template-actions">
        <button type="button" class="secondary" data-use-source-suggestion="${index}" data-suggestion-type="${type}" ${locked ? "disabled" : ""}>Use template</button>
      </div>
    </article>`;
}

function renderSourceTemplates() {
  const search = $("#sourceTemplateSearch");
  if (search && search.value !== state.sourceTemplateQuery) {
    search.value = state.sourceTemplateQuery;
  }
  const locked = !hasAdminKey();
  const renderGroup = (selectors, type, emptyText) => {
    const items = mergedSourceSuggestions(type);
    const html =
      items.map((item, index) => renderSuggestionCard(item, index, type, locked)).join("") ||
      `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
    selectors.forEach((selector) => {
      const node = $(selector);
      if (node) node.innerHTML = html;
    });
  };

  renderGroup(["#rssVisibleSuggestionsList"], "site", "No RSS templates match your search.");
  renderGroup(["#telegramVisibleSuggestionsList"], "tg", "No Telegram templates match your search.");
}

function renderSourceModalState() {
  const form = $("#sourceForm");
  if (!form) return;
  const mode = form.dataset.mode || "create";
  const type = $("#sourceType")?.value === "tg" ? "tg" : "site";
  const title = $("#sourceModalTitle");
  const submit = $("#sourceSubmitBtn");
  const hint = $("#sourceUrlHint");
  const themeSelect = $("#sourceThemeSelect");
  const selectedTopic = normalize(themeSelect?.dataset.selectedValue || themeSelect?.value || "");

  renderTopicSelectOptions("#sourceThemeSelect", selectedTopic);
  if (themeSelect) {
    themeSelect.disabled = !hasAdminKey();
    delete themeSelect.dataset.selectedValue;
  }

  if (title) title.textContent = mode === "edit" ? "Edit source" : "Add source (manual)";
  if (submit) submit.textContent = mode === "edit" ? "Update source" : "Save source";
  if (hint) {
    hint.textContent =
      type === "tg"
        ? "For Telegram, use @username or a t.me link. Pick a theme if this channel should feed theme-scoped keywords."
        : "For RSS, use the full feed URL. Pick a theme if this website should feed theme-scoped keywords.";
  }
  const enabled = $("#sourceEnabled");
  if (enabled && !enabled.checked) {
    setStatus("#sourceSaveStatus", "WAIT", "Source is currently disabled");
  }
}

function openSourceModal({ type = "site", source = null } = {}) {
  const form = $("#sourceForm");
  if (!form) return;
  form.dataset.mode = source ? "edit" : "create";
  form.dataset.sourceId = source?.id || "";
  form.reset();

  const typeField = $("#sourceType");
  const nameField = $("#sourceName");
  const urlField = $("#sourceUrl");
  const enabledField = $("#sourceEnabled");
  const themeField = $("#sourceThemeSelect");

  if (typeField) typeField.value = source?.type || type || "site";
  if (nameField) nameField.value = source?.name || "";
  if (urlField) urlField.value = source?.url || "";
  if (enabledField) enabledField.checked = source ? Boolean(source.enabled) : true;
  if (themeField) themeField.dataset.selectedValue = source?.topic_id || "";

  renderSourceModalState();
  setStatus("#sourceSaveStatus", "WAIT", source ? "Edit the source and save changes." : "Ready to save the source.");
  openDialog("#sourceModal");
  window.requestAnimationFrame(() => {
    nameField?.focus();
  });
}

function fillSourceFormFromSuggestion(suggestion, type) {
  const form = $("#sourceForm");
  if (!form || !suggestion) return;
  form.dataset.mode = "create";
  form.dataset.sourceId = "";
  const typeField = $("#sourceType");
  const nameField = $("#sourceName");
  const urlField = $("#sourceUrl");
  const enabledField = $("#sourceEnabled");
  const themeField = $("#sourceThemeSelect");
  if (typeField) typeField.value = type;
  if (nameField) nameField.value = suggestion.name;
  if (urlField) urlField.value = normalizeSourceUrl(type, suggestion.url);
  if (enabledField) enabledField.checked = true;
  if (themeField) themeField.dataset.selectedValue = topicIdBySlug(suggestion.topic_slug) || "";
  renderSourceModalState();
  setStatus("#sourceSaveStatus", "WAIT", "Ready to save the source.");
  openDialog("#sourceModal");
  window.requestAnimationFrame(() => {
    nameField?.focus();
  });
}

function renderSourceRow(source) {
  const infoTone = sourceTone(source);
  const statusBadge = source.enabled ? "Enabled" : "Disabled";
  const themeName = topicNameById(source.topic_id);
  const themeSlug = topicSlugById(source.topic_id);
  const note = source.last_error
    ? `Last error: ${source.last_error}`
    : source.enabled
      ? source.topic_id
        ? `Ready for launch under ${themeName}`
        : "Ready for launch"
      : "Turned off";
  const href = sourceHref(source.url);
  return `
    <tr data-source-id="${escapeHtml(source.id)}">
      <td data-label="Name">
        <div class="row-title">${escapeHtml(source.name)}</div>
        <div class="row-subtle">${escapeHtml(source.url)}</div>
      </td>
      <td data-label="Type">
        <span class="badge ${infoTone === "error" ? "badge--error" : "badge--ok"}">${escapeHtml(sourceTypeLabel(source.type))}</span>
      </td>
      <td data-label="Theme">
        <span class="badge ${source.topic_id ? "badge--ok" : "badge--wait"}">${escapeHtml(themeName)}</span>
        <div class="row-subtle">${escapeHtml(source.topic_id ? themeSlug : "Global source")}</div>
      </td>
      <td data-label="Status">
        <div class="source-status">
          <span class="badge ${source.enabled ? "badge--ok" : "badge--wait"}">${escapeHtml(statusBadge)}</span>
          <div class="row-subtle">${escapeHtml(note)}</div>
          ${href ? `<a class="row-subtle" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Open source</a>` : ""}
        </div>
      </td>
      <td data-label="Actions">
        <div class="row-actions">
          <label class="switch" title="Enable or disable source">
            <input type="checkbox" data-toggle-source="${escapeHtml(source.id)}" ${source.enabled ? "checked" : ""} />
            <span class="switch-track"><span class="switch-thumb"></span></span>
          </label>
          <button class="secondary" type="button" data-edit-source="${escapeHtml(source.id)}">Edit</button>
          <button class="danger" type="button" data-delete-source="${escapeHtml(source.id)}">Delete</button>
        </div>
      </td>
    </tr>`;
}

function renderThemeRow(topic) {
  const sourceCount = state.sources.filter((item) => item.topic_id === topic.id).length;
  const keywordCount = state.keywords.filter((item) => item.topic_id === topic.id).length;
  return `
    <tr>
      <td data-label="Theme">
        <div class="row-title">${escapeHtml(topic.name)}</div>
        <div class="row-subtle">${escapeHtml(topic.slug)}</div>
      </td>
      <td data-label="Sources">
        <span class="badge badge--ok">${sourceCount}</span>
      </td>
      <td data-label="Keywords">
        <span class="badge badge--wait">${keywordCount}</span>
      </td>
    </tr>`;
}

function renderSources() {
  const body = $("#sourcesTableBody");
  const empty = $("#sourcesEmptyState");
  const total = state.sources.length;
  const errors = state.sources.filter((item) => item.last_error).length;
  const disabled = state.sources.filter((item) => !item.enabled).length;
  const locked = !hasAdminKey();

  const addSourceBtn = $("#openSourceModalBtn");
  const manageSourcesBtn = $("#manageSourcesBtn");
  if (addSourceBtn) addSourceBtn.disabled = locked;
  if (manageSourcesBtn) manageSourcesBtn.disabled = locked;

  if (body) {
    if (locked) {
      renderPlaceholder("#sourcesTableBody", "Enter the admin access code to manage sources.", 5);
    } else if (!total) {
      renderPlaceholder("#sourcesTableBody", "No sources added yet. Use Add source (manual) or a ready template to unlock the workflow.", 5);
    } else {
      body.innerHTML = state.sources.map(renderSourceRow).join("");
    }
  }

  if (empty) {
    empty.hidden = locked ? false : total > 0;
    if (locked) {
      empty.textContent = "Enter the admin access code to manage sources.";
    } else if (!total) {
      empty.textContent = "Add a source to unlock the workflow.";
    }
  }

  if (!total) {
    setStatus("#sourcesStatus", "WAIT", "Sources not added yet");
    setStatus("#sourcesCount", "WAIT", "Sources added: 0");
  } else if (errors) {
    setStatus("#sourcesStatus", "ERROR", `${errors} source${errors === 1 ? "" : "s"} need attention`);
    setStatus("#sourcesCount", "OK", `Sources added: ${total}`);
  } else if (disabled) {
    setStatus("#sourcesStatus", "WAIT", `Sources ready with ${disabled} disabled`);
    setStatus("#sourcesCount", "OK", `Sources added: ${total}`);
  } else {
    setStatus("#sourcesStatus", "OK", "Sources ready for launch");
    setStatus("#sourcesCount", "OK", `Sources added: ${total}`);
  }

  renderSourceTemplates();
  renderSourceModalState();
}

function renderThemes() {
  const body = $("#themesTableBody");
  if (!body) return;
  if (!hasAdminKey()) {
    renderPlaceholder("#themesTableBody", "Enter the admin access code to manage themes.", 3);
    return;
  }
  if (!state.topics.length) {
    renderPlaceholder("#themesTableBody", "No themes yet. Add the first theme to group sources and keywords.", 3);
    return;
  }

  body.innerHTML = state.topics.map(renderThemeRow).join("");
}

function renderKeywords() {
  const body = $("#keywordsTableBody");
  if (!body) return;
  if (!hasAdminKey()) {
    renderPlaceholder("#keywordsTableBody", "Enter the admin access code to manage keywords.", 3);
    return;
  }
  if (!state.keywords.length) {
    renderPlaceholder("#keywordsTableBody", "No keywords yet. Add the first keyword to guide filtering.", 3);
    return;
  }

  body.innerHTML = state.keywords
    .map((keyword) => {
      const themeName = topicNameById(keyword.topic_id);
      const themeSlug = topicSlugById(keyword.topic_id);
      return `
        <tr>
          <td data-label="Keyword">
            <span class="badge badge--ok">${escapeHtml(keyword.word)}</span>
          </td>
          <td data-label="Theme">
            <span class="badge ${keyword.topic_id ? "badge--ok" : "badge--wait"}">${escapeHtml(themeName)}</span>
            <div class="row-subtle">${escapeHtml(keyword.topic_id ? themeSlug : "Global keyword")}</div>
          </td>
          <td data-label="Action">
            <div class="row-actions">
              <button class="danger" type="button" data-delete-keyword="${escapeHtml(keyword.id)}">Delete</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");
}

function renderFilters() {
  const draft = state.settingsDraft;
  const language = $("#languageSelect");
  const duplicate = $("#duplicateDetectionToggle");
  const sourceFiltering = $("#sourceFilteringToggle");
  const addThemeBtn = $("#addThemeBtn");
  const themeInput = $("#themeInput");
  const addKeywordBtn = $("#addKeywordBtn");
  const keywordInput = $("#keywordInput");
  const keywordThemeSelect = $("#keywordThemeSelect");

  if (language) language.value = draft.language || "Ukrainian";
  if (duplicate) duplicate.checked = Boolean(draft.duplicateDetection);
  if (sourceFiltering) sourceFiltering.checked = Boolean(draft.sourceFiltering);
  if (addThemeBtn) addThemeBtn.disabled = !hasAdminKey();
  if (themeInput) themeInput.disabled = !hasAdminKey();
  if (addKeywordBtn) addKeywordBtn.disabled = !hasAdminKey();
  if (keywordInput) keywordInput.disabled = !hasAdminKey();
  if (keywordThemeSelect) keywordThemeSelect.disabled = !hasAdminKey();

  renderTopicSelectOptions("#keywordThemeSelect", normalize(keywordThemeSelect?.value || ""));
  renderThemes();

  renderKeywords();
}

function postSummaryCounts(items) {
  const counts = {
    new: items.filter((post) => post.status === "new").length,
    generated: items.filter((post) => post.status === "generated" || post.status === "pending_approval").length,
    published: items.filter((post) => post.status === "published").length,
    failed: items.filter((post) => post.status === "failed" || post.status === "rejected" || post.error).length,
  };
  return counts;
}

function renderPostRow(post) {
  const info = postStatusInfo(post.status);
  const headline = post.news?.title || `Post ${post.id.slice(0, 8)}`;
  const source = post.news?.source || "—";
  const createdAt = post.created_at || post.updated_at;
  return `
    <tr data-open-post-id="${escapeHtml(post.id)}">
      <td data-label="Title">
        <div class="post-row-title">
          <div class="row-title">${escapeHtml(headline)}</div>
          <div class="row-subtle">${escapeHtml(post.news?.summary || post.generated_text || "No preview available.")}</div>
        </div>
      </td>
      <td data-label="Source">
        <div class="row-title">${escapeHtml(source)}</div>
      </td>
      <td data-label="Status">
        <span class="badge post-status post-status--${escapeHtml(info.tone)}">${escapeHtml(info.label)}</span>
      </td>
      <td data-label="Created At">${escapeHtml(formatDate(createdAt))}</td>
    </tr>`;
}

function renderPosts() {
  const body = $("#postsTableBody");
  const summary = $("#postsSummary");
  if (!body || !summary) return;

  if (!hasAdminKey()) {
    renderPlaceholder("#postsTableBody", "Enter the admin access code to view generated posts.", 4);
    setHtml("#postsSummary", "");
    return;
  }

  const filteredPosts = state.postStatusFilter
    ? state.posts.filter((post) => {
        if (state.postStatusFilter === "generated") return post.status === "generated" || post.status === "pending_approval";
        if (state.postStatusFilter === "failed") return post.status === "failed" || post.status === "rejected" || post.error;
        return post.status === state.postStatusFilter;
      })
    : state.posts;

  if (!filteredPosts.length) {
    renderPlaceholder("#postsTableBody", state.postStatusFilter ? "No posts match this status filter." : "No posts yet. Parse sources to create the first draft.", 4);
  } else {
    const sorted = [...filteredPosts].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
    body.innerHTML = sorted.map(renderPostRow).join("");
  }

  const counts = postSummaryCounts(state.posts);
  setHtml(
    "#postsSummary",
    [
      `<button type="button" class="status status--run" data-post-filter="new">New: ${counts.new}</button>`,
      `<button type="button" class="status status--wait" data-post-filter="generated">Generated: ${counts.generated}</button>`,
      `<button type="button" class="status status--ok" data-post-filter="published">Published: ${counts.published}</button>`,
      `<button type="button" class="status status--error" data-post-filter="failed">Failed: ${counts.failed}</button>`,
      state.postStatusFilter ? `<button type="button" class="status slim" data-post-filter="">Show all</button>` : "",
    ].join("")
  );
}

function renderPipelineStepper() {
  const context = pipelineContext();
  const meta = context.meta || {};
  const stages = meta.stages || {};
  const currentKey = meta.stage_key || state.pipelineStepFocus || "Pipeline Started";
  const statusState = context.stopped ? "stopped" : context.running ? "running" : context.failed ? "failed" : "pending";

  setHtml(
    "#pipelineStepper",
    PIPELINE_STEPS.map((step) => {
      const stageState = stages[step.key] || "pending";
      const isCurrent = step.key === currentKey || (step.key === "Completed" && context.status.task_state === "SUCCESS");
      const tone = pipelineTone(stageState);
      return `
        <div class="step ${tone} ${isCurrent ? "is-active" : ""}">
          <span class="step-label">${escapeHtml(step.label)}</span>
          <span class="step-state">${escapeHtml(translateStageState(stageState))}</span>
          <span class="step-state">${escapeHtml(stageExplanation(step.key, stageState))}</span>
        </div>`;
    }).join("")
  );

  const buttonLocked = !hasAdminKey();
  const startBtn = $("#startPipelineBtn");
  const stopBtn = $("#stopPipelineBtn");
  if (startBtn) startBtn.disabled = buttonLocked || context.running;
  if (stopBtn) stopBtn.disabled = buttonLocked || !context.running;

  const badgeText = context.running ? "Running" : context.failed ? "Error" : context.status.task_state === "SUCCESS" ? "Done" : "Ready";
  const badgeToken = context.running ? "RUN" : context.failed ? "ERROR" : "WAIT";
  setStatus("#pipelineStatusBadge", badgeToken, badgeText);

  let message = pipelineOutcomeMessage(meta, context);
  if (buttonLocked) {
    message = "Enter the admin access code in Settings to unlock the pipeline.";
  }
  setText("#pipelineStatusMessage", message);
  setText("#pipelineInsight", statusExplanation(badgeText));

  const note = [];
  if (!state.sources.length) note.push("Add at least one source to unlock the workflow.");
  if (state.sources.some((source) => source.type === "tg")) note.push("Telegram sources are included in the scenario.");
  if (state.settingsDraft.language) note.push(`Language: ${state.settingsDraft.language}.`);
  if (state.settingsDraft.duplicateDetection) note.push("Duplicate detection is enabled.");
  if (state.settingsDraft.sourceFiltering) note.push("Source filtering is enabled.");
  if (!note.length) note.push("Guided workflow: sources → filters → AI → review → publish.");
  setText("#quickActionNote", note.join(" "));

  return statusState;
}

function buildActivityRows() {
  const rows = [];
  const now = Date.now();
  const context = pipelineContext();
  const meta = context.meta || {};

  if (context.status && Object.keys(context.status).length) {
    const pipelineStatusText = context.running ? "Running" : context.failed ? "Error" : context.stopped ? "Stopped" : context.status.task_state === "SUCCESS" ? "Done" : "Ready";
    rows.push({
      ts: now,
      time: formatShortTime(new Date(now)),
      action: `Pipeline · ${translateStageLabel(meta.stage_label || meta.stage_key || "Start")}`,
      status: pipelineStatusText,
      tone: context.running ? "run" : context.failed ? "error" : context.stopped ? "warn" : "ok",
    });
  }

  [...state.news]
    .sort((left, right) => new Date(right.published_at) - new Date(left.published_at))
    .slice(0, 5)
    .forEach((item, index) => {
      const ts = new Date(item.published_at || Date.now()).getTime() || now - (index + 1) * 60000;
      rows.push({
        ts,
        time: formatShortTime(new Date(ts)),
        action: `News collected · ${item.source}`,
        status: "Success",
        tone: "ok",
      });
    });

  [...state.posts]
    .sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
    .slice(0, 5)
    .forEach((post, index) => {
      const info = postStatusInfo(post.status);
      const ts = new Date(post.created_at || post.updated_at || Date.now()).getTime() || now - (index + 1) * 45000;
      const action =
        post.status === "published"
          ? "Telegram publish"
          : post.status === "failed" || post.status === "rejected"
            ? "Post failed"
            : "AI generation";
      rows.push({
        ts,
        time: formatShortTime(new Date(ts)),
        action,
        status: info.label,
        tone: info.tone,
      });
    });

  [...state.errorLogs].slice(-8).reverse().forEach((line, index) => {
    const ts = now - (index + 1) * 30000;
    rows.push({
      ts,
      time: formatShortTime(new Date(ts)),
      action: "System log",
      status: line.length > 48 ? `${line.slice(0, 48)}...` : line,
      tone: "error",
    });
  });

  return rows.sort((left, right) => right.ts - left.ts).slice(0, 20);
}

function buildLiveFeedRows() {
  const context = pipelineContext();
  const meta = context.meta || {};
  const rows = [];
  const now = Date.now();

  rows.push({
    ts: now,
    title: context.running ? `Active stage: ${translateStageLabel(meta.stage_label || meta.stage_key || "Start")}` : "Pipeline is not actively collecting right now",
    meta: pipelineOutcomeMessage(meta, context),
    tone: context.running ? "run" : context.failed ? "error" : "wait",
  });

  if (meta.sources || meta.new_items || meta.duplicates || meta.queued_for_ai || meta.errors) {
    rows.push({
      ts: now - 1,
      title: `Run counters: ${Number(meta.new_items || 0)} new, ${Number(meta.duplicates || 0)} duplicates, ${Number(meta.queued_for_ai || 0)} queued for AI`,
      meta: `${Number(meta.sources || 0)} enabled sources checked, ${Number(meta.errors || 0)} source errors.`,
      tone: Number(meta.errors || 0) ? "error" : "ok",
    });
  }

  [...state.news].slice(0, 5).forEach((item, index) => {
    rows.push({
      ts: new Date(item.published_at || Date.now()).getTime() || now - (index + 2) * 60000,
      title: item.title || "Collected news",
      meta: `News collected from ${item.source || "unknown source"} · ${formatDate(item.published_at)}`,
      tone: "run",
    });
  });

  [...state.posts].slice(0, 4).forEach((post, index) => {
    const info = postStatusInfo(post.status);
    rows.push({
      ts: new Date(post.created_at || post.updated_at || Date.now()).getTime() || now - (index + 8) * 60000,
      title: post.news?.title || `Post ${post.id.slice(0, 8)}`,
      meta: `Post status: ${info.label}. Click Posts to review generated text.`,
      tone: info.tone,
    });
  });

  (state.errorLogs || []).slice(-3).forEach((line, index) => {
    rows.push({
      ts: now - (index + 20) * 60000,
      title: "Error log entry",
      meta: line,
      tone: "error",
    });
  });

  return rows.sort((left, right) => right.ts - left.ts).slice(0, 12);
}

function renderLiveFeed() {
  const context = pipelineContext();
  const meta = context.meta || {};
  const liveBadge = context.running ? "Live" : context.failed ? "Needs attention" : "Idle";
  const liveToken = context.running ? "RUN" : context.failed ? "ERROR" : "WAIT";
  setStatus("#pipelineLiveBadge", liveToken, liveBadge);
  setText("#pipelineLiveSummary", pipelineOutcomeMessage(meta, context));

  setHtml(
    "#pipelineLiveFeed",
    buildLiveFeedRows()
      .map(
        (row) => `
          <div class="live-item">
            <span class="live-dot"></span>
            <div>
              <div class="live-title">${escapeHtml(row.title)}</div>
              <div class="live-meta">${escapeHtml(row.meta)}</div>
            </div>
            <span class="badge badge--${escapeHtml(row.tone)}">${escapeHtml(row.tone === "run" ? "active" : row.tone)}</span>
          </div>`
      )
      .join("")
  );
}

function renderDashboard() {
  const context = pipelineContext();
  const meta = context.meta || {};
  const collected = meta.new_items ?? state.news.length;
  const filtered = meta.queued_for_ai ?? state.posts.filter((post) => ["generated", "pending_approval", "published"].includes(post.status)).length;
  const generated = state.posts.filter((post) => ["generated", "pending_approval", "published"].includes(post.status)).length;
  const published = state.posts.filter((post) => post.status === "published").length;
  const failed =
    state.sources.filter((item) => item.last_error).length +
    state.posts.filter((post) => post.status === "failed" || post.status === "rejected" || post.error).length +
    (state.errorLogs?.length || 0) +
    (context.failed ? 1 : 0);

  setText("#statNewsCollected", String(collected));
  setText("#statNewsFiltered", String(filtered));
  setText("#statPostsGenerated", String(generated));
  setText("#statPostsPublished", String(published));
  setText("#statFailedTasks", String(failed));

  if (!hasAdminKey()) {
    renderPlaceholder("#activityTableBody", "Enter the admin access code to unlock live activity.", 3);
  } else {
    setHtml(
      "#activityTableBody",
      buildActivityRows()
        .map(
          (row) => `
            <tr>
              <td data-label="Time">${escapeHtml(row.time)}</td>
              <td data-label="Action">${escapeHtml(row.action)}</td>
              <td data-label="Status"><span class="badge badge--${escapeHtml(row.tone)}">${escapeHtml(row.status)}</span></td>
            </tr>`
        )
        .join("") || `<tr><td colspan="3" class="muted">No activity yet.</td></tr>`
    );
  }

  const startBtn = $("#startPipelineBtn");
  const stopBtn = $("#stopPipelineBtn");
  const parseBtn = $("#parseNewsBtn");
  const generateBtn = $("#generatePostsBtn");
  const publishBtn = $("#publishPendingBtn");
  if (startBtn) startBtn.disabled = !hasAdminKey() || context.running;
  if (stopBtn) stopBtn.disabled = !hasAdminKey() || !context.running;
  if (parseBtn) parseBtn.disabled = !hasAdminKey();
  if (generateBtn) generateBtn.disabled = !hasAdminKey();
  if (publishBtn) publishBtn.disabled = !hasAdminKey();

  renderPipelineStepper();
  renderLiveFeed();
}

function renderOpenAIStatus() {
  const check = state.openaiCheckResult;
  const configured = check ? Boolean(check.ok) : Boolean(state.publicStatus?.openai_configured);
  const temporaryIssue = check ? !check.ok && ["rate_limited", "timeout", "unavailable"].includes(check.status) : false;
  const label = check
    ? check.ok
      ? "OpenAI connected"
      : temporaryIssue
        ? "OpenAI temporarily unavailable"
        : "OpenAI not verified"
    : configured
      ? "OpenAI connected"
      : "OpenAI not configured";
  const token = check ? (check.ok ? "OK" : temporaryIssue ? "WAIT" : "ERROR") : configured ? "OK" : "WAIT";
  setStatus("#openaiStatus", token, label);
  setText("#openaiCheckResult", check ? JSON.stringify(check, null, 2) : "OpenAI test will show the live server response.");
}

function renderTelegramStatus() {
  const settings = state.settings || state.publicStatus || {};
  const check = state.telegramCheckResult;
  const botOk = check ? Boolean(check.bot_ok) : Boolean(settings.telegram_bot_configured);
  const channelOk = check ? Boolean(check.channel_ok) : Boolean(settings.telegram_target_channel);
  const connected = check ? Boolean(check.ok) : Boolean(settings.telegram_connected);
  const lastDelivery = settings.last_successful_delivery_at ? formatDate(settings.last_successful_delivery_at) : "—";

  setStatus(
    "#settingsTelegramConnectionStatus",
    connected ? "OK" : check && check.status && check.status !== "missing_bot" && check.status !== "missing_channel" ? "ERROR" : "WAIT",
    connected ? "Telegram connected and ready" : "Telegram connection scenario"
  );

  let reason = "Telegram connection scenario will explain what is missing.";
  if (check?.message) {
    reason = check.message;
  } else if (!botOk && !channelOk) {
    reason = "Open Settings → Telegram and fill API ID, API HASH, Session, and Channel Username in the live server config.";
  } else if (!botOk) {
    reason = "Bot access is incomplete. Check API ID, API HASH, and Session.";
  } else if (!channelOk) {
    reason = "Channel is missing. Add Channel Username or a valid t.me link.";
  } else if (!connected) {
    reason = "Telegram is configured but not confirmed yet. Use Test Telegram.";
  }
  setText("#settingsTelegramConnectionReason", reason);

  setStatus(
    "#deliveryStatus, #settingsDeliveryStatus",
    settings.last_successful_delivery_at ? "OK" : "WAIT",
    settings.last_successful_delivery_at ? `Last successful delivery: ${lastDelivery}` : "Last successful delivery: none yet"
  );

  setText("#telegramCheckResult", check ? JSON.stringify(check, null, 2) : "Telegram test will show the live server response.");
}

function renderSettings() {
  const draft = state.settingsDraft;
  const apiKey = $("#apiKey");
  const openai = $("#openaiApiKeyInput");
  const telegramApiId = $("#telegramApiIdInput");
  const telegramApiHash = $("#telegramApiHashInput");
  const telegramChannel = $("#telegramChannelInput");
  const parsingInterval = $("#parsingIntervalInput");
  const aiGenerationInterval = $("#aiGenerationIntervalInput");
  const publishingInterval = $("#publishingIntervalInput");
  const language = $("#languageSelect");
  const duplicate = $("#duplicateDetectionToggle");
  const sourceFiltering = $("#sourceFilteringToggle");
  const autoPublish = $("#autoPublishToggle");

  if (apiKey) apiKey.value = draft.adminApiKey || "";
  if (openai) openai.value = draft.openaiApiKey || "";
  if (telegramApiId) telegramApiId.value = draft.telegramApiId || "";
  if (telegramApiHash) telegramApiHash.value = draft.telegramApiHash || "";
  if (telegramChannel) telegramChannel.value = draft.telegramChannel || "";
  if (parsingInterval) parsingInterval.value = draft.parsingInterval || "";
  if (aiGenerationInterval) aiGenerationInterval.value = draft.aiGenerationInterval || "";
  if (publishingInterval) publishingInterval.value = draft.publishingInterval || "";
  if (language) language.value = draft.language || "Ukrainian";
  if (duplicate) duplicate.checked = Boolean(draft.duplicateDetection);
  if (sourceFiltering) sourceFiltering.checked = Boolean(draft.sourceFiltering);
  if (autoPublish) autoPublish.checked = Boolean(draft.autoPublishPosts);

  setStatus("#settingsAdminKeyStatus", hasAdminKey() ? "OK" : "WAIT", hasAdminKey() ? "Access code active" : "Access code not checked yet");
  renderOpenAIStatus();
  renderTelegramStatus();

  const verifyOpenaiBtn = $("#verifyOpenaiBtn");
  const checkTelegramBtn = $("#checkTelegramBtn");
  if (verifyOpenaiBtn) verifyOpenaiBtn.disabled = !hasAdminKey();
  if (checkTelegramBtn) checkTelegramBtn.disabled = !hasAdminKey();
  if ($("#sourceSubmitBtn")) $("#sourceSubmitBtn").disabled = !hasAdminKey();
}

function renderLockedPrivateBlocks() {
  renderPlaceholder("#themesTableBody", "Enter the admin access code to manage themes.", 3);
  renderPlaceholder("#keywordsTableBody", "Enter the admin access code to manage keywords.", 3);
  renderPlaceholder("#postsTableBody", "Enter the admin access code to view generated posts.", 4);
  renderPlaceholder("#sourcesTableBody", "Enter the admin access code to manage sources.", 5);
  setHtml("#postsSummary", "");
  setStatus("#sourcesStatus", "WAIT", "Sources not added yet");
  setStatus("#sourcesCount", "WAIT", "Sources added: 0");
  setText("#pipelineStatusBadge", "Stopped");
  setText("#pipelineStatusMessage", "Enter the admin access code in Settings to unlock the pipeline.");
  setText("#quickActionNote", "Enter the admin access code in Settings to unlock private actions.");
}

function sortByDateDesc(items, key) {
  return [...items].sort((left, right) => new Date(right[key] || 0) - new Date(left[key] || 0));
}

async function loadPublicData() {
  const [publicStatus, sourceSuggestions] = await Promise.all([
    publicApi("/api/public-status"),
    publicApi("/api/source-suggestions/"),
  ]);
  state.publicStatus = publicStatus;
  state.sourceSuggestions = sourceSuggestions;
  renderPublicState();
  renderSourceTemplates();
}

async function loadPrivateData() {
  const [settings, sources, topics, keywords, news, posts, logs, pipeline] = await Promise.all([
    api("/api/settings"),
    api("/api/sources/"),
    api("/api/topics/"),
    api("/api/keywords/"),
    api("/api/news/?limit=50"),
    api("/api/posts/?limit=50"),
    api("/api/logs/errors").catch(() => ({ errors: [] })),
    api(`/api/pipeline/status${state.pipelineTaskId ? `?task_id=${encodeURIComponent(state.pipelineTaskId)}` : ""}`),
  ]);

  state.settings = settings;
  if (!localStorage.getItem(SETTINGS_DRAFT_KEY)) {
    state.settingsDraft.autoPublishPosts = Boolean(settings.auto_publish_posts);
    writeJson(SETTINGS_DRAFT_KEY, state.settingsDraft);
  }
  state.sources = sortByDateDesc(sources, "created_at");
  state.topics = [...topics].sort((left, right) => String(left.name).localeCompare(String(right.name), "uk"));
  state.keywords = [...keywords].sort((left, right) => String(left.word).localeCompare(String(right.word), "uk"));
  state.news = sortByDateDesc(news, "published_at");
  state.posts = sortByDateDesc(posts, "created_at");
  state.errorLogs = logs.errors || [];
  state.pipelineStatus = pipeline;

  if (pipeline && isPipelineTerminal(pipeline)) {
    state.pipelineTaskId = "";
    sessionStorage.removeItem("pipelineTaskId");
  }

  if (state.pipelineTaskId && pipeline && !isPipelineTerminal(pipeline) && !state.taskTimers.has(state.pipelineTaskId)) {
    pollPipeline(state.pipelineTaskId);
  }
}

async function refreshAll() {
  closeAllDialogs();
  await loadPublicData();
  if (hasAdminKey()) {
    try {
      await loadPrivateData();
    } catch (error) {
      state.sources = [];
      state.topics = [];
      state.keywords = [];
      state.news = [];
      state.posts = [];
      state.errorLogs = [];
      state.pipelineStatus = null;
      setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
      showToast(`Private data could not be loaded: ${error.message}`, "error");
    }
  } else {
    state.sources = [];
    state.topics = [];
    state.keywords = [];
    state.news = [];
    state.posts = [];
    state.errorLogs = [];
    state.pipelineStatus = null;
  }
  renderAll();
}

function renderAll() {
  renderPublicState();
  renderDashboard();
  renderSources();
  renderFilters();
  renderPosts();
  renderSettings();
  if (!hasAdminKey()) {
    renderLockedPrivateBlocks();
  }
}

async function startPipeline() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to start the pipeline.", "warn");
    return;
  }
  const done = withButtonState($("#startPipelineBtn"), "Starting...");
  try {
    state.uiPaused = false;
    state.pipelineStepFocus = "Pipeline Started";
    const result = await api("/api/pipeline/run", { method: "POST" });
    state.pipelineTaskId = result.task_id;
    sessionStorage.setItem("pipelineTaskId", result.task_id);
    state.pipelineStatus = {
      task_state: "STARTED",
      task_meta: { pipeline_running: true, stage_key: "Pipeline Started", stage_label: "Pipeline Started", stages: {} },
      task_result: {},
    };
    renderDashboard();
    done("success", "Started");
    showToast("Pipeline started", "ok");
    await pollPipeline(result.task_id);
  } catch (error) {
    done("error", "Error");
    setStatus("#pipelineStatusBadge", "ERROR", "Error");
    setText("#pipelineStatusMessage", error.message);
    showToast(`Pipeline did not start: ${error.message}`, "error");
  }
}

async function stopPipeline() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to stop the pipeline.", "warn");
    return;
  }
  const done = withButtonState($("#stopPipelineBtn"), "Stopping...");
  try {
    const result = await api("/api/pipeline/stop", { method: "POST" });
    state.uiPaused = true;
    state.pipelineStatus = {
      ...(state.pipelineStatus || {}),
      task_state: "REVOKED",
      task_meta: {
        ...(state.pipelineStatus?.task_meta || {}),
        pipeline_running: false,
        stopped: true,
        stage_label: "Stopped",
      },
      task_result: {
        ...(state.pipelineStatus?.task_meta || {}),
        ...(state.pipelineStatus?.task_result || {}),
        stopped: true,
      },
    };
    renderDashboard();
    done("success", "Stopped");
    showToast(result.message || "Pipeline stopped", "ok");
    await loadPrivateData().catch(() => null);
    renderAll();
  } catch (error) {
    done("error", "Error");
    setStatus("#pipelineStatusBadge", "ERROR", "Error");
    setText("#pipelineStatusMessage", error.message);
    showToast(`Could not stop pipeline: ${error.message}`, "error");
  }
}

async function pollPipeline(taskId) {
  const existing = state.taskTimers.get(taskId);
  if (existing) return;

  const timer = window.setInterval(async () => {
    try {
      let status = await api(`/api/pipeline/status?task_id=${encodeURIComponent(taskId)}`);
      if (status.task_state === "REVOKED" && state.uiPaused && state.pipelineStatus) {
        status = {
          ...state.pipelineStatus,
          task_state: "REVOKED",
          task_meta: {
            ...(state.pipelineStatus.task_meta || {}),
            stopped: true,
          },
          task_result: {
            ...(state.pipelineStatus.task_meta || {}),
            ...(state.pipelineStatus.task_result || {}),
            stopped: true,
          },
        };
      }
      state.pipelineStatus = status;
      renderDashboard();
      const stopped = status.task_state === "REVOKED" || Boolean(status.task_result?.stopped || status.task_meta?.stopped);
      if (status.task_state === "SUCCESS" || status.task_state === "FAILURE" || stopped) {
        window.clearInterval(timer);
        state.taskTimers.delete(taskId);
        state.pipelineStepFocus = stopped
          ? status.task_result?.stage_key || status.task_meta?.stage_key || state.pipelineStepFocus
          : status.task_state === "SUCCESS"
            ? "Completed"
            : state.pipelineStepFocus;
        showToast(pipelineToastMessage(status, stopped), stopped ? "warn" : status.task_state === "SUCCESS" ? "ok" : "error");
        state.pipelineTaskId = "";
        sessionStorage.removeItem("pipelineTaskId");
        await loadPrivateData().catch(() => null);
        renderAll();
      }
    } catch {
      window.clearInterval(timer);
      state.taskTimers.delete(taskId);
    }
  }, 1800);

  state.taskTimers.set(taskId, timer);
}

async function addTheme(event) {
  event.preventDefault();
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to manage themes.", "warn");
    return;
  }

  const done = withButtonState($("#addThemeBtn"), "Saving...");
  const input = $("#themeInput");
  const name = normalize(input?.value);
  if (!name) {
    done("warn", "Empty");
    showToast("Theme cannot be empty", "warn");
    return;
  }

  const normalizedName = name.toLowerCase();
  const normalizedSlug = slugifyText(name);
  const duplicate = state.topics.some((topic) => {
    const existingName = normalize(topic.name).toLowerCase();
    const existingSlug = slugifyText(topic.slug || topic.name);
    return existingName === normalizedName || existingSlug === normalizedSlug;
  });

  if (duplicate) {
    done("warn", "Duplicate");
    showToast("Theme already exists", "warn");
    return;
  }

  try {
    const created = await api("/api/topics/", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (input) input.value = "";
    await loadPrivateData();
    renderAll();
    renderTopicSelectOptions("#keywordThemeSelect", created.id);
    done("success", "Added");
    showToast("Theme added", "ok");
    window.requestAnimationFrame(() => {
      input?.focus();
    });
  } catch (error) {
    done("error", "Error");
    showToast(`Could not add theme: ${error.message}`, "error");
  }
}

async function addKeyword(event) {
  event.preventDefault();
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to manage keywords.", "warn");
    return;
  }
  const done = withButtonState($("#addKeywordBtn"), "Saving...");
  const input = $("#keywordInput");
  const themeSelect = $("#keywordThemeSelect");
  const word = normalize(input?.value);
  const topicId = normalize(themeSelect?.value);
  if (!word) {
    done("warn", "Empty");
    showToast("Keyword cannot be empty", "warn");
    return;
  }

  try {
    await api("/api/keywords/", {
      method: "POST",
      body: JSON.stringify({ word, topic_id: topicId || null }),
    });
    if (input) input.value = "";
    await loadPrivateData();
    renderAll();
    renderTopicSelectOptions("#keywordThemeSelect", topicId);
    done("success", "Added");
    showToast("Keyword added", "ok");
    window.requestAnimationFrame(() => {
      input?.focus();
    });
  } catch (error) {
    done("error", "Error");
    showToast(`Could not add keyword: ${error.message}`, "error");
  }
}

async function deleteKeyword(keywordId) {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to manage keywords.", "warn");
    return;
  }
  await api(`/api/keywords/${keywordId}`, { method: "DELETE" });
  await loadPrivateData();
  renderAll();
  showToast("Keyword deleted", "ok");
}

async function submitSourceForm(event) {
  event.preventDefault();
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to save sources.", "warn");
    return;
  }

  const form = event.target;
  const done = withButtonState($("#sourceSubmitBtn"), "Saving...");
  const payload = Object.fromEntries(new FormData(form).entries());
  const sourceId = normalize(form.dataset.sourceId);
  const mode = form.dataset.mode || "create";
  const type = normalize(payload.type) === "tg" ? "tg" : "site";
  const normalizedUrl = normalizeSourceUrl(type, payload.url);
  const enabled = $("#sourceEnabled")?.checked ?? true;
  const topicId = normalize(payload.topic_id);

  const duplicate = state.sources.some((item) => {
    if (mode === "edit" && item.id === sourceId) return false;
    const sameType = normalize(item.type) === type;
    const sameUrl = normalizeSourceUrl(item.type, item.url).toLowerCase() === normalizedUrl.toLowerCase();
    return sameType && sameUrl;
  });

  if (duplicate) {
    done("warn", "Duplicate");
    setStatus("#sourceSaveStatus", "WAIT", "This source already exists");
    showToast("⚠️ Source already exists", "warn");
    return;
  }

  try {
    const body = {
      type,
      name: payload.name,
      url: normalizedUrl,
      topic_id: topicId || null,
      enabled,
    };

    if (mode === "edit" && sourceId) {
      await api(`/api/sources/${sourceId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      await api("/api/sources/", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    await loadPrivateData();
    renderAll();
    const total = state.sources.length;
    const rssCount = state.sources.filter((item) => item.type === "site").length;
    const tgCount = state.sources.filter((item) => item.type === "tg").length;
    const message = `${type === "tg" ? "Telegram channel" : "RSS source"} saved. RSS: ${rssCount}. Telegram: ${tgCount}. Total: ${total}.`;
    setStatus("#sourceSaveStatus", "OK", message);
    done("success", "Saved");
    showToast(mode === "edit" ? "Source updated" : "Source added", "ok");
    form.dataset.sourceId = "";
    form.dataset.mode = "create";
    closeDialog("#sourceModal");
  } catch (error) {
    done("error", "Error");
    setStatus("#sourceSaveStatus", "ERROR", error.message);
    showToast(`Could not save source: ${error.message}`, "error");
  }
}

async function toggleSourceEnabled(sourceId, enabled) {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to manage sources.", "warn");
    return;
  }
  try {
    await api(`/api/sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: Boolean(enabled) }),
    });
    await loadPrivateData();
    renderAll();
    showToast(enabled ? "Source enabled" : "Source disabled", "ok");
  } catch (error) {
    showToast(`Could not update source: ${error.message}`, "error");
  }
}

async function deleteSource(sourceId) {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to manage sources.", "warn");
    return;
  }
  await api(`/api/sources/${sourceId}`, { method: "DELETE" });
  await loadPrivateData();
  renderAll();
  showToast("Source deleted", "ok");
}

function openPostModal(postId) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return;
  state.selectedPostId = postId;
  const news = post.news || state.news.find((item) => item.id === post.news_id) || null;
  const info = postStatusInfo(post.status);
  const original = news?.raw_text || news?.summary || post.generated_text || "No original text available.";
  const generated = post.generated_text || news?.summary || news?.raw_text || "";

  setText("#postModalTitle", news?.title || `Post ${post.id.slice(0, 8)}`);
  setText("#postModalMeta", `${news?.source || "—"} · ${formatDate(post.created_at || post.updated_at)}${news?.url ? ` · ${news.url}` : ""}`);
  setStatus("#postModalStatus", info.tone === "ok" ? "OK" : info.tone === "error" ? "ERROR" : info.tone === "run" ? "RUN" : "WAIT", info.label);
  setText("#postModalNewsTitle", news?.title || "News");
  setText("#postModalOriginal", original);
  const textarea = $("#postModalGeneratedText");
  if (textarea) textarea.value = generated;

  const publishBtn = $("#publishPostBtn");
  const regenerateBtn = $("#regeneratePostBtn");
  if (publishBtn) publishBtn.disabled = !hasAdminKey() || post.status === "published";
  if (regenerateBtn) regenerateBtn.disabled = !hasAdminKey() || !post.news_id;

  openDialog("#postModal");
}

async function regeneratePost(postId) {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to regenerate posts.", "warn");
    return;
  }
  const post = state.posts.find((item) => item.id === postId);
  if (!post?.news_id) {
    showToast("This post is missing its original news item.", "warn");
    return;
  }
  const done = withButtonState($("#regeneratePostBtn"), "Regenerating...");
  try {
    await api(`/api/news/${post.news_id}/generate`, { method: "POST" });
    done("success", "Regenerated");
    await loadPrivateData();
    renderAll();
    openPostModal(postId);
    showToast("Post regenerated", "ok");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not regenerate post: ${error.message}`, "error");
  }
}

async function publishPost(postId, generatedText = "") {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to publish posts.", "warn");
    return;
  }
  const done = withButtonState($("#publishPostBtn"), "Publishing...");
  try {
    await api(`/api/posts/${postId}/approve`, {
      method: "POST",
      body: JSON.stringify({ generated_text: generatedText }),
    });
    done("success", "Published");
    await loadPrivateData();
    renderAll();
    openPostModal(postId);
    showToast("Post published", "ok");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not publish post: ${error.message}`, "error");
  }
}

async function deletePost(postId) {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to delete posts.", "warn");
    return;
  }
  const done = withButtonState($("#deletePostBtn"), "Deleting...");
  try {
    await api(`/api/posts/${postId}`, { method: "DELETE" });
    done("success", "Deleted");
    await loadPrivateData();
    renderAll();
    state.selectedPostId = "";
    closeDialog("#postModal");
    showToast("Post deleted", "ok");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not delete post: ${error.message}`, "error");
  }
}

async function generateLatestPost() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to generate posts.", "warn");
    return;
  }
  const done = withButtonState($("#generatePostsBtn"), "Generating...");
  const candidate = [...state.news].sort((left, right) => new Date(right.published_at) - new Date(left.published_at))[0];
  if (!candidate) {
    done("warn", "No news");
    showToast("No news found. Parse sources first.", "warn");
    return;
  }
  try {
    await api(`/api/news/${candidate.id}/generate`, { method: "POST" });
    done("success", "Generated");
    await loadPrivateData();
    renderAll();
    openSection("postsSection");
    showToast("AI generation started", "ok");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not generate a post: ${error.message}`, "error");
  }
}

async function publishPendingPost() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to publish posts.", "warn");
    return;
  }
  const done = withButtonState($("#publishPendingBtn"), "Publishing...");
  const candidate = [...state.posts].find((post) => post.status === "generated" || post.status === "pending_approval");
  if (!candidate) {
    done("warn", "No posts");
    showToast("No pending posts to publish.", "warn");
    return;
  }
  const text = candidate.generated_text || candidate.news?.summary || candidate.news?.raw_text || "";
  try {
    await api(`/api/posts/${candidate.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ generated_text: text }),
    });
    done("success", "Published");
    await loadPrivateData();
    renderAll();
    openSection("postsSection");
    showToast("Pending post published", "ok");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not publish pending post: ${error.message}`, "error");
  }
}

async function verifyOpenAI() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to test OpenAI.", "warn");
    return;
  }
  const done = withButtonState($("#verifyOpenaiBtn"), "Testing...");
  try {
    const result = await api("/api/openai/check", { method: "POST" });
    state.openaiCheckResult = result;
    renderOpenAIStatus();
    renderSettings();
    done(result.ok ? "success" : result.status === "rate_limited" || result.status === "timeout" || result.status === "unavailable" ? "warn" : "error", result.ok ? "Checked" : "Issue");
    showToast(result.ok ? "OpenAI connected" : result.message, result.ok ? "ok" : "warn");
  } catch (error) {
    done("error", "Error");
    state.openaiCheckResult = null;
    setText("#openaiCheckResult", error.message);
    renderSettings();
    showToast(`Could not test OpenAI: ${error.message}`, "error");
  }
}

async function checkTelegramConnection() {
  if (!hasAdminKey()) {
    showToast("Add the admin access code in Settings to test Telegram.", "warn");
    return;
  }
  const done = withButtonState($("#checkTelegramBtn"), "Testing...");
  try {
    const result = await api("/api/telegram/check", { method: "POST" });
    state.telegramCheckResult = result;
    renderTelegramStatus();
    renderSettings();
    done(result.ok ? "success" : "warn", result.ok ? "Checked" : "Issue");
    showToast(result.ok ? "Telegram confirmed" : result.message, result.ok ? "ok" : "warn");
  } catch (error) {
    done("error", "Error");
    state.telegramCheckResult = null;
    setText("#telegramCheckResult", error.message);
    renderSettings();
    showToast(`Could not test Telegram: ${error.message}`, "error");
  }
}

function syncDraftFromInputs() {
  const draft = {
    ...state.settingsDraft,
    adminApiKey: normalize($("#apiKey")?.value),
    openaiApiKey: normalize($("#openaiApiKeyInput")?.value),
    telegramApiId: normalize($("#telegramApiIdInput")?.value),
    telegramApiHash: normalize($("#telegramApiHashInput")?.value),
    telegramChannel: normalize($("#telegramChannelInput")?.value),
    parsingInterval: normalize($("#parsingIntervalInput")?.value),
    aiGenerationInterval: normalize($("#aiGenerationIntervalInput")?.value),
    publishingInterval: normalize($("#publishingIntervalInput")?.value),
    language: $("#languageSelect")?.value || "Ukrainian",
    duplicateDetection: Boolean($("#duplicateDetectionToggle")?.checked),
    sourceFiltering: Boolean($("#sourceFilteringToggle")?.checked),
    autoPublishPosts: Boolean($("#autoPublishToggle")?.checked),
  };
  state.settingsDraft = draft;
  writeJson(SETTINGS_DRAFT_KEY, draft);
  sessionStorage.setItem(ADMIN_API_KEY_KEY, draft.adminApiKey || "");
}

async function saveSettings() {
  syncDraftFromInputs();
  const done = withButtonState($("#saveSettingsBtn"), "Saving...");
  try {
    if (hasAdminKey()) {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ auto_publish_posts: Boolean(state.settingsDraft.autoPublishPosts) }),
      });
      await loadPrivateData().catch(() => null);
    }
    renderAll();
    done("success", "Saved");
    showToast(hasAdminKey() ? "Settings saved" : "Settings saved locally", hasAdminKey() ? "ok" : "warn");
  } catch (error) {
    done("error", "Error");
    showToast(`Could not save settings: ${error.message}`, "error");
  }
}

function applySettingsFromDraftToInputs() {
  const draft = state.settingsDraft;
  const apiKey = $("#apiKey");
  const openai = $("#openaiApiKeyInput");
  const telegramApiId = $("#telegramApiIdInput");
  const telegramApiHash = $("#telegramApiHashInput");
  const telegramChannel = $("#telegramChannelInput");
  const parsingInterval = $("#parsingIntervalInput");
  const aiGenerationInterval = $("#aiGenerationIntervalInput");
  const publishingInterval = $("#publishingIntervalInput");
  const language = $("#languageSelect");
  const duplicate = $("#duplicateDetectionToggle");
  const sourceFiltering = $("#sourceFilteringToggle");
  const autoPublish = $("#autoPublishToggle");

  if (apiKey) apiKey.value = draft.adminApiKey || "";
  if (openai) openai.value = draft.openaiApiKey || "";
  if (telegramApiId) telegramApiId.value = draft.telegramApiId || "";
  if (telegramApiHash) telegramApiHash.value = draft.telegramApiHash || "";
  if (telegramChannel) telegramChannel.value = draft.telegramChannel || "";
  if (parsingInterval) parsingInterval.value = draft.parsingInterval || "";
  if (aiGenerationInterval) aiGenerationInterval.value = draft.aiGenerationInterval || "";
  if (publishingInterval) publishingInterval.value = draft.publishingInterval || "";
  if (language) language.value = draft.language || "Ukrainian";
  if (duplicate) duplicate.checked = Boolean(draft.duplicateDetection);
  if (sourceFiltering) sourceFiltering.checked = Boolean(draft.sourceFiltering);
  if (autoPublish) autoPublish.checked = Boolean(draft.autoPublishPosts);
}

function clearPrivateState() {
  state.settings = null;
  state.sources = [];
  state.topics = [];
  state.keywords = [];
  state.news = [];
  state.posts = [];
  state.errorLogs = [];
  state.pipelineStatus = null;
}

function bindEvents() {
  $("#toastCloseBtn")?.addEventListener("click", () => {
    const toast = $("#toast");
    if (toast) toast.hidden = true;
  });

  $("#telegramChannelLinkTop")?.addEventListener("click", (event) => {
    const node = event.currentTarget;
    if (node instanceof HTMLAnchorElement && node.dataset.openSection) {
      event.preventDefault();
      openSection(node.dataset.openSection);
    }
  });

  $("#openSourceModalBtn")?.addEventListener("click", () => openSourceModal());
  $("#manageSourcesBtn")?.addEventListener("click", () => {
    document.getElementById("sourcesManagementPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#startPipelineBtn")?.addEventListener("click", startPipeline);
  $("#stopPipelineBtn")?.addEventListener("click", stopPipeline);
  $("#parseNewsBtn")?.addEventListener("click", startPipeline);
  $("#generatePostsBtn")?.addEventListener("click", generateLatestPost);
  $("#publishPendingBtn")?.addEventListener("click", publishPendingPost);
  $("#refreshBtn")?.addEventListener("click", async () => {
    const done = withButtonState($("#refreshBtn"), "Refreshing...");
    try {
      await refreshAll();
      done("success", "Refreshed");
      showToast("Panel refreshed", "ok");
    } catch (error) {
      done("error", "Error");
      showToast(`Refresh failed: ${error.message}`, "error");
    }
  });
  $("#verifyOpenaiBtn")?.addEventListener("click", verifyOpenAI);
  $("#checkTelegramBtn")?.addEventListener("click", checkTelegramConnection);
  $("#saveSettingsBtn")?.addEventListener("click", saveSettings);

  $("#closeSourceModalBtn")?.addEventListener("click", () => closeDialog("#sourceModal"));
  $("#closePostModalBtn")?.addEventListener("click", () => {
    state.selectedPostId = "";
    closeDialog("#postModal");
  });
  $("#sourceForm")?.addEventListener("submit", submitSourceForm);
  $("#themeForm")?.addEventListener("submit", addTheme);
  $("#keywordForm")?.addEventListener("submit", addKeyword);

  $("#sourceType")?.addEventListener("change", renderSourceModalState);
  $("#sourceEnabled")?.addEventListener("change", renderSourceModalState);
  $("#sourceTemplateSearch")?.addEventListener("input", (event) => {
    state.sourceTemplateQuery = event.target.value;
    writeJson(SOURCE_TEMPLATE_QUERY_KEY, state.sourceTemplateQuery);
    renderSourceTemplates();
  });

  $("#apiKey")?.addEventListener("input", () => {
    syncDraftFromInputs();
    renderSettings();
  });
  ["#openaiApiKeyInput", "#telegramApiIdInput", "#telegramApiHashInput", "#telegramChannelInput", "#parsingIntervalInput", "#aiGenerationIntervalInput", "#publishingIntervalInput"].forEach((selector) => {
    $(selector)?.addEventListener("input", syncDraftFromInputs);
  });
  $("#languageSelect")?.addEventListener("change", () => {
    syncDraftFromInputs();
    renderFilters();
    renderDashboard();
  });
  $("#duplicateDetectionToggle")?.addEventListener("change", () => {
    syncDraftFromInputs();
    renderFilters();
    renderDashboard();
  });
  $("#sourceFilteringToggle")?.addEventListener("change", () => {
    syncDraftFromInputs();
    renderFilters();
    renderDashboard();
  });
  $("#autoPublishToggle")?.addEventListener("change", () => {
    syncDraftFromInputs();
    renderSettings();
  });

  $("#postModalGeneratedText")?.addEventListener("input", () => {
    // Keep the current text in the textarea only. The publish button will read it directly.
  });

  $("#regeneratePostBtn")?.addEventListener("click", async () => {
    if (!state.selectedPostId) return;
    await regeneratePost(state.selectedPostId);
  });
  $("#publishPostBtn")?.addEventListener("click", async () => {
    if (!state.selectedPostId) return;
    const text = $("#postModalGeneratedText")?.value || "";
    await publishPost(state.selectedPostId, text);
  });
  $("#deletePostBtn")?.addEventListener("click", async () => {
    if (!state.selectedPostId) return;
    await deletePost(state.selectedPostId);
  });

  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("button, a, tr");
    if (!target) return;

    if (target.dataset.openSection) {
      event.preventDefault();
      if (Object.prototype.hasOwnProperty.call(target.dataset, "postFilter")) {
        state.postStatusFilter = target.dataset.postFilter || "";
      }
      openSection(target.dataset.openSection);
      renderPosts();
      if (target.dataset.focusPanel === "liveFeed") {
        window.requestAnimationFrame(() => {
          document.getElementById("pipelineLiveFeedCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(target.dataset, "postFilter")) {
      event.preventDefault();
      state.postStatusFilter = target.dataset.postFilter || "";
      renderPosts();
      return;
    }

    if (target.dataset.useSourceSuggestion) {
      const type = target.dataset.suggestionType || "site";
      const index = Number(target.dataset.useSourceSuggestion);
      const items = mergedSourceSuggestions(type);
      const suggestion = items[index];
      if (suggestion) fillSourceFormFromSuggestion(suggestion, type);
      return;
    }

    if (target.dataset.editSource) {
      const source = state.sources.find((item) => item.id === target.dataset.editSource);
      if (source) openSourceModal({ source });
      return;
    }

    if (target.dataset.deleteSource) {
      await deleteSource(target.dataset.deleteSource).catch((error) => showToast(`Could not delete source: ${error.message}`, "error"));
      return;
    }

    if (target.dataset.deleteKeyword) {
      await deleteKeyword(target.dataset.deleteKeyword).catch((error) => showToast(`Could not delete keyword: ${error.message}`, "error"));
      return;
    }

    if (target.dataset.openPostId) {
      openPostModal(target.dataset.openPostId);
      return;
    }

    if (target.closest("tr") && target.closest("#postsTableBody")) {
      const row = target.closest("tr[data-open-post-id]");
      if (row) {
        openPostModal(row.dataset.openPostId);
        return;
      }
    }
  });

  document.body.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches("[data-toggle-source]")) {
      await toggleSourceEnabled(target.dataset.toggleSource, target.checked).catch((error) => showToast(`Could not update source: ${error.message}`, "error"));
    }
  });
}

function renderAccessNoteIfNeeded() {
  if (!hasAdminKey()) {
    setText("#panelStatusNote", "Add the admin access code in Settings to unlock private data and the guided workflow.");
  }
}

async function boot() {
  bindEvents();
  closeAllDialogs();
  closeAllDetails();
  applySettingsFromDraftToInputs();
  renderAccessNoteIfNeeded();
  openSection("dashboardSection", { scroll: false });
  await refreshAll();
}

boot().catch((error) => {
  setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
  setStatus("#pipelineStatusBadge", "ERROR", "Error");
  setText("#pipelineStatusMessage", error.message);
  showToast(error.message, "error");
});
