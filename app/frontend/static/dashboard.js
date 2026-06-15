const state = {
  publicStatus: null,
  settings: null,
  telegramCheckResult: null,
  openaiCheckResult: null,
  topics: [],
  keywords: [],
  sources: [],
  sourceSuggestions: [],
  customSourceSuggestions: readJson("customSourceSuggestions", { site: [], tg: [] }),
  news: [],
  posts: [],
  errorLogs: [],
  pipelineStatus: null,
  pipelineTaskId: sessionStorage.getItem("pipelineTaskId") || "",
  sourceTab: "site",
  savedSearches: readJson("savedNewsSearches", []),
  taskTimers: new Map(),
  uiPaused: false,
};

const SOURCE_EXAMPLE_FALLBACKS = {
  site: [
    {
      name: "OpenAI News",
      url: "https://openai.com/news/rss.xml",
      topic_slug: "ai",
      description: "Новини OpenAI, моделі, API та релізи продуктів.",
    },
    {
      name: "Anthropic",
      url: "https://www.anthropic.com/news",
      topic_slug: "ai",
      description: "Офіційні новини Anthropic про Claude та AI-дослідження.",
    },
    {
      name: "Google DeepMind",
      url: "https://deepmind.google/discover/blog/",
      topic_slug: "ai",
      description: "Дослідження, моделі та публікації DeepMind.",
    },
    {
      name: "Hugging Face",
      url: "https://huggingface.co/blog/feed.xml",
      topic_slug: "ai",
      description: "Оновлення open-source AI та ML-екосистеми.",
    },
    {
      name: "VentureBeat AI",
      url: "https://venturebeat.com/category/ai/feed/",
      topic_slug: "ai",
      description: "Швидкі новини про AI, стартапи й корпоративні запуски.",
    },
  ],
  tg: [
    {
      name: "@therundownai",
      url: "@therundownai",
      topic_slug: "ai",
      description: "AI новини, щоденні дайджести та тренди.",
    },
    {
      name: "@aibreakfast",
      url: "@aibreakfast",
      topic_slug: "ai",
      description: "Короткі AI дайджести для швидкого читання.",
    },
    {
      name: "@analyticsindiamag",
      url: "@analyticsindiamag",
      topic_slug: "science",
      description: "AI, data science, ML та аналітика.",
    },
    {
      name: "@machinelearningnews",
      url: "@machinelearningnews",
      topic_slug: "technology",
      description: "Новини про машинне навчання та LLM.",
    },
    {
      name: "@openaicommunity",
      url: "@openaicommunity",
      topic_slug: "ai",
      description: "Спільнота навколо OpenAI та AI-екосистеми.",
    },
  ],
};

const $ = (selector) => document.querySelector(selector);
const adminKeyInput = $("#apiKey");
if (adminKeyInput) adminKeyInput.value = sessionStorage.getItem("adminApiKey") || "";

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
  if (!value) return "немає даних";
  return new Date(value).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });
}

function formatShortTime(value) {
  if (!value) return "";
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

function statusMarkup(token, text) {
  return escapeHtml(text);
}

function setStatus(selector, token, text) {
  const nodes = document.querySelectorAll(selector);
  if (!nodes.length) return;
  const tone = token === "OK" ? "status--ok" : token === "ERROR" ? "status--error" : token === "RUN" ? "status--run" : "status--wait";
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
      // Fall back to a simple visible state.
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
      // Continue with the fallback state reset.
    }
  }
  dialog.removeAttribute("open");
  dialog.classList.remove("is-open");
  dialog.hidden = true;
}

function closeAllDetails(exceptId = "") {
  document.querySelectorAll("details.section").forEach((node) => {
    if (node.id !== exceptId) node.open = false;
  });
}

function openSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  closeAllDetails(sectionId);
  section.open = true;
  document.querySelectorAll(".sidebar .nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.openSection === sectionId);
  });
  const topbarHeight = Math.max(96, document.querySelector(".topbar")?.offsetHeight || 96);
  window.requestAnimationFrame(() => {
    const top = section.getBoundingClientRect().top + window.scrollY - topbarHeight - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  });
}

function hasAdminKey() {
  return Boolean(sessionStorage.getItem("adminApiKey"));
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "X-API-Key": sessionStorage.getItem("adminApiKey") || "",
  };
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

function topicOptions(includeEmpty = true) {
  const options = [];
  if (includeEmpty) options.push('<option value="">Без теми</option>');
  for (const topic of state.topics) {
    options.push(`<option value="${escapeHtml(topic.id)}">${escapeHtml(topic.name)}</option>`);
  }
  return options.join("");
}

function topicIdBySlug(slug) {
  const normalized = normalize(slug).toLowerCase();
  const aliases = {
    ai: ["ai", "ші", "шi", "ш і", "штучн", "інтелект"],
    business: ["business", "бізнес", "економ"],
    career: ["career", "кар'єр", "junior"],
    science: ["science", "наука", "дослід", "космос"],
    technology: ["technology", "tech", "технолог", "цифров"],
    "it-ukraine": ["it-ukraine", "it укра", "іт укра", "it", "розроб", "dev"],
  };
  const topic = state.topics.find((item) => {
    const itemSlug = normalize(item.slug).toLowerCase();
    const itemName = normalize(item.name).toLowerCase();
    const aliasesForSlug = aliases[normalized] || [];
    return itemSlug === normalized || itemName === normalized || aliasesForSlug.some((part) => itemSlug.includes(part) || itemName.includes(part));
  });
  return topic ? topic.id : "";
}

function sourceHref(value) {
  const text = normalize(value);
  if (!text) return "";
  if (text.startsWith("http://") || text.startsWith("https://")) return text;
  if (text.startsWith("@")) return `https://t.me/${text.slice(1)}`;
  return `https://t.me/${text}`;
}

function sourceModeInfo(source) {
  const isTelegram = source.type === "tg";
  if (source.last_error) {
    return {
      tone: "error",
      token: "ERROR",
      status: isTelegram ? "Канал недоступний" : "Джерело вимкнене",
      nameClass: "source-name source-name--error",
    };
  }
  if (source.enabled) {
    return {
      tone: "active",
      token: "OK",
      status: isTelegram ? "Канал запущено" : "Джерело активне",
      nameClass: "source-name source-name--active",
    };
  }
  return {
    tone: "disabled",
    token: "WAIT",
    status: isTelegram ? "Канал недоступний" : "Джерело вимкнене",
    nameClass: "source-name source-name--disabled",
  };
}

function pipelineTone(stageState) {
  if (stageState === "running") return "stage-running";
  if (stageState === "completed") return "stage-completed";
  if (stageState === "failed") return "stage-failed";
  return "stage-pending";
}

function translateStageLabel(value) {
  const map = {
    "Pipeline Started": "Запуск",
    "RSS Processing": "Збір новин",
    "Telegram Processing": "Пошук у каналах",
    "AI Processing": "AI-обробка",
    "Post Generation": "Чернетки",
    "Publishing": "Публікація",
    "Completed": "Готово",
  };
  return map[value] || value || "";
}

function translateStageState(value) {
  const map = {
    pending: "очікує",
    running: "у процесі",
    completed: "завершено",
    failed: "помилка",
  };
  return map[value] || value || "";
}

function postStatusLabel(value) {
  const map = {
    new: "Нове",
    generated: "Згенеровано",
    pending_approval: "Очікує підтвердження",
    published: "Опубліковано",
    failed: "Помилка",
    rejected: "Відхилено",
  };
  return map[value] || value || "";
}

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

function selectedSourceType() {
  return $("#sourceType")?.value === "tg" ? "tg" : "site";
}

function renderAdminState() {
  if (!hasAdminKey()) {
    setStatus("#settingsAdminKeyStatus", "WAIT", "Код доступу: не перевірено");
    return;
  }
  setStatus("#settingsAdminKeyStatus", "OK", "Код доступу: активний");
}

function renderOpenAIStatus() {
  const check = state.openaiCheckResult;
  const temporaryIssue = check ? ["rate_limited", "timeout", "unavailable"].includes(check.status) : false;
  const configured = check ? Boolean(check.ok) : Boolean(state.publicStatus?.openai_configured);
  const label = check
    ? check.ok
      ? "ШІ підключено"
      : temporaryIssue
        ? "ШІ тимчасово недоступний"
        : "ШІ не підтверджено"
    : configured
      ? "ШІ підключено"
      : "Потрібен ключ OpenAI";
  const tone = check ? (check.ok ? "OK" : temporaryIssue ? "WAIT" : "ERROR") : configured ? "OK" : "WAIT";
  setStatus("#openaiStatus", tone, label);
}

function renderTelegramStatus() {
  const status = state.settings || state.publicStatus;
  if (!status) return;

  const telegramCheck = state.telegramCheckResult;
  const botOnline = telegramCheck ? Boolean(telegramCheck.bot_ok) : Boolean(status.telegram_bot_configured);
  const channelAvailable = telegramCheck ? Boolean(telegramCheck.channel_ok) : Boolean(status.telegram_target_channel);
  const publishingAvailable = telegramCheck ? Boolean(telegramCheck.ok) : Boolean(status.telegram_connected);
  const lastDelivery = status.last_successful_delivery_at ? formatDate(status.last_successful_delivery_at) : "немає";

  setStatus(
    "#telegramConnectionStatus, #settingsTelegramConnectionStatus",
    publishingAvailable ? "OK" : "WAIT",
    publishingAvailable ? "Telegram підключено та готовий до публікації" : "Telegram: сценарій підключення"
  );

  let reason = "Telegram підключено та готовий до публікації.";
  if (telegramCheck?.message) {
    reason = telegramCheck.message;
  } else if (!botOnline && !channelAvailable) {
    reason = "Відкрий Налаштування → Telegram і заповни API ID, API HASH, Session та Channel Username.";
  } else if (!botOnline) {
    reason = "Боту ще не вистачає доступу. Перевір API ID, API HASH і Session у блоці Telegram.";
  } else if (!channelAvailable) {
    reason = "Канал ще не вказано. Додай Channel Username або відкрий сценарій підключення.";
  } else if (!publishingAvailable) {
    reason = "Telegram зараз недоступний. Перевір конфігурацію або спробуй ще раз.";
  }
  setText("#telegramConnectionReason, #settingsTelegramConnectionReason", reason);
  setStatus(
    "#deliveryStatus, #settingsDeliveryStatus",
    status.last_successful_delivery_at ? "OK" : "WAIT",
    status.last_successful_delivery_at ? `Остання успішна доставка: ${lastDelivery}` : "Остання успішна доставка: ще не було"
  );

  const href = publishingAvailable ? sourceHref(status.telegram_target_channel) : "";
  const node = $("#telegramChannelLinkTop");
  if (node) {
    node.hidden = false;
    node.classList.remove("is-success", "is-error", "is-warn");
    if (href) {
      node.href = href;
      node.removeAttribute("data-open-section");
      node.removeAttribute("aria-disabled");
      node.textContent = "📢 Відкрити Telegram-канал";
      node.classList.add("is-success");
      node.title = "Відкрити підключений канал";
    } else {
      node.href = "#settingsSection";
      node.setAttribute("data-open-section", "settingsSection");
      node.removeAttribute("aria-disabled");
      node.textContent = "📢 Підключити Telegram";
      node.classList.add("is-warn");
      node.title = "Відкрити сценарій підключення Telegram";
    }
  }

  setText(
    "#telegramTarget, #settingsTelegramTarget",
    status.telegram_target_channel ? `Канал: ${status.telegram_target_channel}` : "Сценарій підключення відкрито"
  );
}

function renderTopicSelects() {
  const html = topicOptions(true);
  for (const selector of ["#sourceTopic", "#newsTopic"]) {
    const node = $(selector);
    if (node) node.innerHTML = html;
  }
}

function keywordsForTopic(topicId) {
  return state.keywords.filter((item) => item.topic_id === topicId).map((item) => item.word);
}

function renderTopics() {
  const list = $("#topicsList");
  if (!list) return;

  list.innerHTML =
    state.topics
      .map((topic) => {
        const words = keywordsForTopic(topic.id);
        return `
          <div class="item topic-card ${topic.enabled ? "is-active" : "is-inactive"}">
            <div class="topic-card-head">
              <div>
                <div class="item-title">${escapeHtml(topic.name)}</div>
                <div class="muted">${escapeHtml(topic.description || "Без опису")}</div>
              </div>
              <div class="topic-card-state ${topic.enabled ? "is-active" : "is-inactive"}">${topic.enabled ? "Тему активовано" : "Тему не активовано"}</div>
            </div>
            <div class="topic-keywords">
              ${words.length ? words.map((word) => `<span class="badge">${escapeHtml(word)}</span>`).join("") : '<span class="muted">Ключові слова не додано</span>'}
            </div>
            <div class="item-actions">
              <button class="danger" data-delete-topic="${escapeHtml(topic.id)}">Видалити</button>
            </div>
          </div>`;
      })
      .join("") || '<div class="item muted">Теми ще не додано.</div>';
}

function renderSourceFormState() {
  const type = selectedSourceType();
  const submit = $("#sourceSubmitBtn");
  const hint = $("#sourceUrlHint");
  const modal = $("#sourceModal");

  if (submit) submit.textContent = type === "tg" ? "Додати Telegram-канал" : "Додати RSS джерело";
  if (modal) modal.dataset.activeSourceType = type;
  if (hint) {
    hint.textContent =
      type === "tg"
        ? "Для Telegram вкажи @назва_каналу або посилання на канал."
        : "Для RSS вкажи повний URL стрічки.";
  }
}

function mergedSourceSuggestions(type) {
  const base = state.sourceSuggestions.filter((item) => item.type === type);
  const custom = state.customSourceSuggestions?.[type] || [];
  const fallback = SOURCE_EXAMPLE_FALLBACKS[type] || [];
  const seen = new Set();
  const merged = [];

  for (const item of [...custom, ...base, ...fallback]) {
    const key = `${normalize(item.name).toLowerCase()}|${normalize(item.url).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function renderSuggestionCard(item, index, type) {
  return `
    <details class="item suggestion-card">
      <summary>
        <div class="source-summary-main">
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="muted">${escapeHtml(item.url)}</div>
        </div>
        <span class="pill pill--wait">Шаблон</span>
      </summary>
      <div class="suggestion-body">
        <div class="muted">${escapeHtml(item.description)}</div>
        <div class="item-actions item-actions--center">
          <button type="button" class="secondary suggestion-apply-btn" data-use-source-suggestion="${index}" data-suggestion-type="${type}">
            ⬇ Застосувати шаблон
          </button>
        </div>
      </div>
    </details>`;
}

function renderSourceCard(source) {
  const info = sourceModeInfo(source);
  const topic = state.topics.find((item) => item.id === source.topic_id);
  const href = sourceHref(source.url);
  return `
    <details class="item source-card source-card--${info.tone}">
      <summary>
        <div class="source-summary-main">
          <div class="${info.nameClass}">${escapeHtml(source.name)}</div>
          <div class="source-url ${info.nameClass}">${escapeHtml(source.url)}</div>
        </div>
        <div class="status slim ${info.tone === "active" ? "status--ok" : info.tone === "error" ? "status--error" : "status--wait"}">${statusMarkup(info.token, info.status)}</div>
      </summary>
      <div class="source-card-body">
        <div class="muted">Тема: ${escapeHtml(topic ? topic.name : "Без теми")}</div>
        ${source.last_error ? `<div class="error-box">🔴 Джерело недоступне<br />Причина: ${escapeHtml(source.last_error)}</div>` : ""}
        <div class="item-actions">
          ${href ? `<a class="link-button secondary" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Відкрити</a>` : ""}
          <button class="secondary" data-edit-source="${escapeHtml(source.id)}">Редагувати</button>
          <button class="secondary" data-save-source-example="${escapeHtml(source.id)}">Додати до прикладів</button>
          <button class="danger" data-delete-source="${escapeHtml(source.id)}">Видалити</button>
        </div>
      </div>
    </details>`;
}

function renderSuggestions() {
  const renderGroup = (selectors, type, emptyText) => {
    const items = mergedSourceSuggestions(type);
    const html = items.map((item, index) => renderSuggestionCard(item, index, type)).join("") || `<div class="item muted">${escapeHtml(emptyText)}</div>`;
    for (const selector of selectors) {
      const node = $(selector);
      if (node) node.innerHTML = html;
    }
  };
  renderGroup(["#rssSuggestionsList", "#rssVisibleSuggestionsList"], "site", "Прикладів RSS ще немає.");
  renderGroup(["#telegramSuggestionsList", "#telegramVisibleSuggestionsList"], "tg", "Прикладів Telegram ще немає.");
}

function renderSources() {
  const rssList = $("#rssSourcesList");
  const tgList = $("#telegramSourcesList");
  if (!rssList || !tgList) return;

  const rss = state.sources.filter((source) => source.type === "site");
  const tg = state.sources.filter((source) => source.type === "tg");
  rssList.innerHTML = rss.map(renderSourceCard).join("") || '<div class="item muted">RSS джерел ще немає. Натисни «Додати джерело» вище.</div>';
  tgList.innerHTML = tg.map(renderSourceCard).join("") || '<div class="item muted">Telegram-джерел ще немає. Натисни «Додати джерело» вище.</div>';
  setStatus("#sourcesStatus", rss.length + tg.length ? "OK" : "WAIT", rss.length + tg.length ? `Джерела додано: ${rss.length + tg.length}` : "Джерела ще не додано");
  const rssHeading = rssList.closest(".source-column")?.querySelector("h3");
  const tgHeading = tgList.closest(".source-column")?.querySelector("h3");
  if (rssHeading) rssHeading.innerHTML = `RSS джерела <span class="pill">${rss.length}</span>`;
  if (tgHeading) tgHeading.innerHTML = `Telegram джерела <span class="pill">${tg.length}</span>`;
}

function renderSavedSearches() {
  const box = $("#savedSearches");
  if (!box) return;
  box.innerHTML =
    state.savedSearches
      .map(
        (search, index) => `
          <button class="secondary" data-apply-search="${index}" type="button">${escapeHtml(search.label)}</button>`
      )
      .join("") || "";
}

function renderNews() {
  const list = $("#newsList");
  if (!list) return Promise.resolve();

  const query = normalize($("#newsSearch")?.value);
  const topicId = normalize($("#newsTopic")?.value);
  const params = new URLSearchParams({ limit: "50" });
  if (query) params.set("search", query);
  if (topicId) params.set("topic_id", topicId);

  return api(`/api/news/?${params.toString()}`)
    .then((items) => {
      state.news = items;
      list.innerHTML =
        items
          .map((item) => {
            const title = item.url
              ? `<a class="news-title" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`
              : `<div class="news-title">${escapeHtml(item.title)}</div>`;
            return `
              <article class="card news-card">
                ${title}
                <div class="muted">${escapeHtml(item.source)} · ${escapeHtml(formatDate(item.published_at))}</div>
                <div class="status slim ${item.raw_text ? "status--ok" : "status--wait"}">${item.raw_text ? "Текст новини готовий" : "Текст новини не зчитано"}</div>
                <p>${escapeHtml(item.summary)}</p>
                <div class="item-actions">
                  <button class="secondary" data-improve-ai="${escapeHtml(item.id)}">AI-редагування</button>
                  <button class="secondary" data-publish-site="${escapeHtml(item.id)}">На сайт</button>
                  <button class="secondary" data-publish-telegram="${escapeHtml(item.id)}">Telegram</button>
                </div>
              </article>`;
          })
          .join("") || '<div class="item muted">Новини не знайдено. Перевірте джерела або запустіть збір новин.</div>';
    })
    .catch((error) => {
      list.innerHTML = `<div class="item muted">${escapeHtml(error.message)}</div>`;
    });
}

function renderPosts() {
  const list = $("#postsList");
  const publishedList = $("#publishedList");
  if (!list || !publishedList) return Promise.resolve();

  const filter = $("#postStatusFilter")?.value || "pending_approval";

  return api("/api/posts/?limit=50")
    .then((items) => {
      state.posts = items;

      const matchesFilter = (post) => {
        if (filter === "all") return true;
        if (filter === "published") return post.status === "published";
        if (filter === "failed") return post.status === "failed";
        return ["new", "generated", "pending_approval"].includes(post.status);
      };

      const filtered = items.filter(matchesFilter);
      const rowMarkup = filtered
        .map((post) => {
          const headline = post.news?.title || `Матеріал ${post.id.slice(0, 8)}`;
          const statusText = post.status === "published" ? "Опубліковано" : post.status === "failed" ? "Помилка" : "Очікує";
          return `
            <tr class="posts-row posts-row--${post.status}">
              <td>${escapeHtml(formatDate(post.updated_at))}</td>
              <td>${escapeHtml(post.news?.source || "—")}</td>
              <td>
                <div class="table-title">${escapeHtml(headline)}</div>
                <div class="table-actions">
                  <button class="secondary" data-focus-post="${escapeHtml(post.id)}">Редагувати</button>
                  <button class="secondary" data-confirm-post="${escapeHtml(post.id)}">Підтвердити</button>
                </div>
              </td>
              <td>
                <span class="pill pill--${post.status === "published" ? "ok" : post.status === "failed" ? "error" : "wait"}">${escapeHtml(statusText)}</span>
              </td>
            </tr>`;
        })
        .join("");

      list.innerHTML = rowMarkup || '<tr><td colspan="4" class="muted">Матеріалів немає. Перевір джерела або запусти збір новин.</td></tr>';

      publishedList.innerHTML =
        items
          .filter((post) => post.status === "published")
          .map((post) => {
            const headline = post.news?.title || `Матеріал ${post.id.slice(0, 8)}`;
            return `
              <article class="card queue-card">
                <div class="item-title">${escapeHtml(headline)}</div>
                <div class="muted">${escapeHtml(formatDate(post.published_at || post.updated_at))}</div>
                <textarea readonly>${escapeHtml(post.generated_text)}</textarea>
                <div class="status slim">${statusMarkup("OK", "Опубліковано")}</div>
              </article>`;
          })
          .join("") || '<div class="item muted">Опублікованих матеріалів ще немає.</div>';
    })
    .catch((error) => {
      list.innerHTML = `<tr><td colspan="4" class="muted">${escapeHtml(error.message)}</td></tr>`;
      publishedList.innerHTML = `<div class="item muted">${escapeHtml(error.message)}</div>`;
    });
}

function renderPipeline() {
  const status = state.pipelineStatus || {};
  const meta = status.task_result && Object.keys(status.task_result).length ? status.task_result : status.task_meta || {};
  const stages = meta.stages || {};
  const running =
    Boolean(meta.pipeline_running) || ["PENDING", "STARTED", "PROGRESS", "RETRY", "queued", "running"].includes(status.task_state);

  const rssReady = state.sources.some((source) => source.type === "site" && source.enabled && !source.last_error);
  const telegramReady = state.sources.some((source) => source.type === "tg" && source.enabled && !source.last_error);
  const aiCheck = state.openaiCheckResult;
  const aiTemporary = Boolean(aiCheck && !aiCheck.ok && ["rate_limited", "timeout", "unavailable"].includes(aiCheck.status));
  const aiReady = Boolean(aiCheck ? aiCheck.ok : state.publicStatus?.openai_configured);
  const failed = status.task_state === "FAILURE";
  const sourceCount = state.sources.length;
  const currentStage = translateStageLabel(meta.stage_label || meta.stage_key || "");

  setStatus(
    "#pipelineReadyStatus",
    running ? "RUN" : failed ? "ERROR" : "WAIT",
    running ? "Конвеєр працює" : failed ? "Помилка конвеєра" : sourceCount ? "Сценарій конвеєра готовий" : "Додай джерела, щоб запустити конвеєр"
  );
  setStatus(
    "#workflowStatus",
    running ? "RUN" : failed ? "ERROR" : "WAIT",
    running ? currentStage || "Поточний крок" : failed ? "Помилка конвеєра" : "Натисни «Запустити конвеєр»"
  );

  const hasRssSources = state.sources.some((source) => source.type === "site");
  const hasTelegramSources = state.sources.some((source) => source.type === "tg");
  setStatus(
    "#rssReadyStatus",
    rssReady ? "OK" : hasRssSources ? "ERROR" : "WAIT",
    rssReady ? "RSS готово" : hasRssSources ? "RSS має помилки" : "RSS ще не додано"
  );
  setStatus(
    "#telegramReadyStatus",
    telegramReady ? "OK" : hasTelegramSources ? "ERROR" : "WAIT",
    telegramReady ? "Telegram готово" : hasTelegramSources ? "Telegram має помилки" : "Telegram: сценарій підключення"
  );
  setStatus(
    "#aiReadyStatus",
    aiReady ? "OK" : aiTemporary ? "WAIT" : aiCheck ? "ERROR" : "WAIT",
    aiReady ? "ШІ готовий" : aiTemporary ? "ШІ тимчасово недоступний" : aiCheck ? "ШІ не підтверджено" : "Потрібен ключ OpenAI"
  );

  const stageNames = [
    { key: "Pipeline Started", label: "Конвеєр запущено" },
    { key: "RSS Processing", label: "Обробка RSS" },
    { key: "Telegram Processing", label: "Обробка Telegram" },
    { key: "AI Processing", label: "Обробка ШІ" },
    { key: "Post Generation", label: "Створення постів" },
    { key: "Publishing", label: "Публікація" },
    { key: "Completed", label: "Завершено" },
  ];
  const stageHtml = stageNames
    .map((item) => {
      const stageState = stages[item.key] || "pending";
      const active = meta.stage_key === item.key || (item.key === "Completed" && status.task_state === "SUCCESS");
      return `
        <div class="stage-card ${pipelineTone(stageState)} ${active ? "is-active" : ""}">
          <div class="stage-name">${escapeHtml(item.label)}</div>
          <div class="stage-state">${escapeHtml(translateStageState(stageState))}</div>
        </div>`;
    })
    .join("");
  setHtml("#pipelineStageList, #pipelineModalStageList", stageHtml);

  if (status.task_state === "SUCCESS") {
    setText(
      "#pipelineResult, #pipelineModalResult",
      "Збір новин завершено. Перейдіть до огляду, відредагуйте пости й відправте їх у Telegram або на сайт."
    );
  } else if (status.task_state === "FAILURE") {
    setText("#pipelineResult, #pipelineModalResult", explainErrorBody(status.task_result || status.task_meta, "Конвеєр завершився з помилкою"));
  } else if (meta.stage_label) {
    setText("#pipelineResult, #pipelineModalResult", translateStageLabel(meta.stage_label));
  } else {
    const rssCount = state.sources.filter((source) => source.type === "site").length;
    const tgCount = state.sources.filter((source) => source.type === "tg").length;
    const aiState = aiReady ? "готовий" : aiTemporary ? "тимчасово недоступний" : aiCheck ? "не підтверджено" : "потрібен ключ";
    setText(
      "#pipelineResult, #pipelineModalResult",
      `Сценарій готовий: RSS ${rssCount}, Telegram ${tgCount}, AI ${aiState}. Натисни «Запустити конвеєр», щоб побачити кроки в реальному часі.`
    );
  }
}

function renderOverview() {
  const today = new Date();
  const activeSources = state.sources.filter((item) => item.enabled && !item.last_error).length;
  const todayNews = state.news.filter((item) => isSameLocalDay(item.published_at, today)).length;
  const generatedPosts = state.posts.filter((item) => ["generated", "pending_approval", "published"].includes(item.status)).length;
  const publishedPosts = state.posts.filter((item) => item.status === "published").length;
  const errors =
    state.sources.filter((item) => item.last_error).length +
    state.posts.filter((item) => item.status === "failed" || item.error).length +
    (state.errorLogs?.length || 0);

  setText("#overviewSourcesCount", String(activeSources));
  setText("#overviewNewsCount", String(todayNews));
  setText("#overviewGeneratedCount", String(generatedPosts));
  setText("#overviewPublishedCount", String(publishedPosts));
  setText("#overviewErrorsCount", String(errors));

  const openaiReady = Boolean(state.openaiCheckResult ? state.openaiCheckResult.ok : state.publicStatus?.openai_configured);
  const openaiTemporary = Boolean(state.openaiCheckResult && !state.openaiCheckResult.ok && ["rate_limited", "timeout", "unavailable"].includes(state.openaiCheckResult.status));
  const telegramReady = Boolean(state.publicStatus?.telegram_connected || state.settings?.telegram_connected);
  const pipelineRunning = Boolean(
    state.pipelineStatus?.task_meta?.pipeline_running ||
      ["PENDING", "STARTED", "PROGRESS", "RETRY", "queued", "running"].includes(state.pipelineStatus?.task_state)
  );

  setStatus(
    "#overviewOpenAIStatus",
    openaiReady ? "OK" : openaiTemporary ? "WAIT" : "ERROR",
    openaiReady ? "ШІ підключено" : openaiTemporary ? "ШІ тимчасово недоступний" : "ШІ не підключено"
  );
  setStatus(
    "#overviewTelegramStatus",
    telegramReady ? "OK" : "WAIT",
    telegramReady ? "Telegram підключено" : "Telegram: сценарій підключення"
  );
  setStatus("#overviewPipelineStatus", pipelineRunning ? "RUN" : "WAIT", pipelineRunning ? "Конвеєр працює" : "Конвеєр зупинено");
  setText("#overviewLastSync", `Оновлено: ${new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`);
}

function renderLogs() {
  const list = $("#logsList");
  if (!list) return;

  const todayNews = state.news.filter((item) => isSameLocalDay(item.published_at)).length;
  const generatedPosts = state.posts.filter((item) => ["generated", "pending_approval", "published"].includes(item.status)).length;
  const publishedPosts = state.posts.filter((item) => item.status === "published").length;
  const errorCount = state.sources.filter((item) => item.last_error).length + state.posts.filter((item) => item.status === "failed" || item.error).length;
  const recentErrors = (state.errorLogs || []).slice(-4).reverse();

  const items = [
    { time: formatShortTime(new Date()), text: `Сьогодні отримано ${todayNews} новин`, tone: "ok" },
    { time: formatShortTime(new Date()), text: `Створено ${generatedPosts} постів`, tone: "ok" },
    { time: formatShortTime(new Date()), text: `Опубліковано ${publishedPosts} постів`, tone: "ok" },
    { time: formatShortTime(new Date()), text: `Проблем потребують уваги: ${errorCount}`, tone: errorCount ? "warn" : "ok" },
    ...recentErrors.map((line) => ({
      time: line.split(" ")[0]?.replace(",", "") || "",
      text: line.length > 160 ? `${line.slice(0, 157)}...` : line,
      tone: "error",
    })),
  ];

  list.innerHTML =
    items
      .map(
        (item) => `
          <div class="event-row event-row--${item.tone}">
            <span class="event-time">${escapeHtml(item.time || "зараз")}</span>
            <span class="event-text">${escapeHtml(item.text)}</span>
          </div>`
      )
      .join("") || '<div class="item muted">Подій поки що немає.</div>';
}

async function loadPublicData() {
  const [publicStatus, sourceSuggestions] = await Promise.all([
    publicApi("/api/public-status"),
    publicApi("/api/source-suggestions/"),
  ]);
  state.publicStatus = publicStatus;
  state.sourceSuggestions = sourceSuggestions;
  renderOpenAIStatus();
  renderTelegramStatus();
  renderSuggestions();
  renderOverview();
}

async function loadPrivateData() {
  const [settings, topics, keywords, sources, logs] = await Promise.all([
    api("/api/settings"),
    api("/api/topics/"),
    api("/api/keywords/"),
    api("/api/sources/"),
    api("/api/logs/errors").catch(() => ({ errors: [] })),
  ]);

  state.settings = settings;
  state.topics = topics;
  state.keywords = keywords;
  state.sources = sources;
  state.errorLogs = logs.errors || [];

  renderTopicSelects();
  renderTopics();
  renderSources();
  renderOpenAIStatus();
  renderTelegramStatus();
  renderSourceFormState();
  renderOverview();
  renderLogs();

  const pipeline = await api(`/api/pipeline/status${state.pipelineTaskId ? `?task_id=${encodeURIComponent(state.pipelineTaskId)}` : ""}`);
  state.pipelineStatus = pipeline;
  renderPipeline();

  await Promise.all([renderNews(), renderPosts()]);
}

async function refreshAll() {
  await loadPublicData();
  renderTopicSelects();
  renderSourceFormState();
  renderOverview();
  renderLogs();

  if (!hasAdminKey()) {
    setHtml("#topicsList", '<div class="item muted">Додайте код доступу, щоб бачити правила відбору.</div>');
    setHtml("#rssSourcesList", '<div class="item muted">Додайте код доступу, щоб бачити джерела.</div>');
    setHtml("#telegramSourcesList", '<div class="item muted">Додайте код доступу, щоб бачити Telegram-джерела.</div>');
    setHtml("#newsList", '<div class="item muted">Додайте код доступу, щоб бачити новини.</div>');
    setHtml("#postsList", '<tr><td colspan="4" class="muted">Додайте код доступу, щоб бачити пости.</td></tr>');
    setHtml("#publishedList", '<div class="item muted">Додайте код доступу, щоб бачити публікації.</div>');
    setHtml("#logsList", '<div class="item muted">Додайте код доступу, щоб бачити події.</div>');
    setText("#pipelineResult", "");
    setStatus("#workflowStatus", "WAIT", "Очікує запуску");
    renderSavedSearches();
    renderPipeline();
    renderSuggestions();
    return;
  }

  try {
    await loadPrivateData();
  } catch (error) {
    setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
    setStatus("#workflowStatus", "ERROR", error.message);
  }
}

async function startPipeline() {
  const done = withButtonState($("#runPipelineBtn"), "Запускаю...");
  try {
    openDialog("#pipelineModal");
    openSection("logsSection");
    state.uiPaused = false;
    const result = await api("/api/pipeline/run", { method: "POST" });
    state.pipelineTaskId = result.task_id;
    sessionStorage.setItem("pipelineTaskId", result.task_id);
    state.pipelineStatus = {
      task_state: "STARTED",
      task_meta: { pipeline_running: true, stage_key: "Pipeline Started", stage_label: "Конвеєр запущено", stages: {} },
      task_result: {},
    };
    renderPipeline();
    done("success", "Почато");
    showToast("Конвеєр запущено", "ok");
    await pollPipeline(result.task_id);
  } catch (error) {
    done("error", "Помилка");
    setStatus("#workflowStatus", "ERROR", error.message);
    showToast(`Конвеєр не запустився: ${error.message}`, "error");
  }
}

async function pollPipeline(taskId) {
  const previous = state.taskTimers.get(taskId);
  if (previous) window.clearInterval(previous);

  const timer = window.setInterval(async () => {
    try {
      const status = await api(`/api/pipeline/status?task_id=${encodeURIComponent(taskId)}`);
      state.pipelineStatus = status;
      renderPipeline();
      if (status.task_state === "SUCCESS" || status.task_state === "FAILURE") {
        window.clearInterval(timer);
        state.taskTimers.delete(taskId);
        state.pipelineTaskId = "";
        sessionStorage.removeItem("pipelineTaskId");
        await loadPrivateData();
      }
    } catch {
      window.clearInterval(timer);
      state.taskTimers.delete(taskId);
    }
  }, 1800);

  state.taskTimers.set(taskId, timer);
}

function pausePipeline() {
  const done = withButtonState($("#pausePipelineBtn"), "Зупиняю...");
  for (const timer of state.taskTimers.values()) {
    window.clearInterval(timer);
  }
  state.taskTimers.clear();
  state.pipelineTaskId = "";
  sessionStorage.removeItem("pipelineTaskId");
  state.uiPaused = true;
  renderPipeline();
  setStatus("#workflowStatus", "WAIT", "Оновлення зупинено");
  done("warn", "Пауза");
  showToast("Пауза панелі включена. Активну backend-задачу не скасовано.", "warn");
}

async function saveTopic(event) {
  event.preventDefault();
  const done = withButtonState($("#saveTopicBtn"), "Зберігаю...");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    const topic = await api("/api/topics/", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || "",
        enabled: true,
      }),
    });
    const keywords = splitKeywords(payload.keywords);
    for (const word of keywords) {
      await api("/api/keywords/", {
        method: "POST",
        body: JSON.stringify({ word, topic_id: topic.id }),
      });
    }
    setStatus("#topicSaveStatus", "OK", "Тему активовано");
    done("success", "Збережено");
    showToast("Правило додано", "ok");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#topicSaveStatus", "ERROR", error.message);
    showToast(`Не вдалося зберегти правило: ${error.message}`, "error");
  }
}

async function createSource(event) {
  event.preventDefault();
  const form = event.target;
  await submitSourceForm(form);
}

async function submitSourceForm(form) {
  const done = withButtonState($("#sourceSubmitBtn"), "Додаю...");
  const payload = Object.fromEntries(new FormData(form).entries());
  const status = $("#sourceSaveStatus");
  const duplicate = state.sources.some((item) => {
    const sameType = normalize(item.type) === normalize(payload.type);
    const sameUrl = normalize(item.url).toLowerCase() === normalize(payload.url).toLowerCase();
    return sameType && sameUrl;
  });
  if (duplicate) {
    done("warn", "Вже є");
    setStatus("#sourceSaveStatus", "WAIT", "Таке джерело вже додано");
    showToast("⚠️ Джерело вже існує", "warn");
    return;
  }
  if (status) {
    status.classList.remove("status--ok", "status--error");
    status.classList.add("status--wait", "is-loading");
    status.textContent = "Додавання джерела";
  }
  try {
    await api("/api/sources/", {
      method: "POST",
      body: JSON.stringify({
        type: payload.type,
        name: payload.name,
        url: payload.url,
        topic_id: payload.topic_id || null,
        enabled: true,
      }),
    });
    form.reset();
    state.sourceTab = payload.type || "site";
    renderSourceTabs();
    done("success", "Додано");
    setStatus("#sourceSaveStatus", "OK", "Джерело додано. Можеш закрити вікно або вибрати ще один шаблон.");
    showToast("Джерело додано", "ok");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#sourceSaveStatus", "ERROR", error.message);
    showToast(`Не вдалося додати джерело: ${error.message}`, "error");
  } finally {
    if (status) status.classList.remove("is-loading");
  }
}

async function updateSource(sourceId, payload) {
  await api(`/api/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  await loadPrivateData();
}

async function removeSource(sourceId) {
  await api(`/api/sources/${sourceId}`, { method: "DELETE" });
  await loadPrivateData();
}

async function removeTopic(topicId) {
  await api(`/api/topics/${topicId}`, { method: "DELETE" });
  await loadPrivateData();
}

async function improveWithAI(newsId, button) {
  const done = withButtonState(button, "Виконую...");
  try {
    await api(`/api/news/${newsId}/generate`, { method: "POST" });
    done("success", "У черзі");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#pipelineResult", "ERROR", error.message);
  }
}

async function publishNews(newsId, endpoint, button) {
  const done = withButtonState(button, "Виконую...");
  try {
    await api(endpoint, { method: "POST" });
    done("success", "Готово");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#pipelineResult", "ERROR", error.message);
  }
}

async function approvePost(postId, button) {
  const textarea = $(`[data-post-text="${postId}"]`);
  const done = withButtonState(button, "Підтверджую...");
  try {
    await api(`/api/posts/${postId}/approve`, {
      method: "POST",
      body: JSON.stringify({ generated_text: textarea ? textarea.value : "" }),
    });
    done("success", "Відправлено");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#pipelineResult", "ERROR", error.message);
  }
}

async function testAi(event) {
  event.preventDefault();
  const done = withButtonState($("#testAiBtn"), "Тестую...");
  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());

  try {
    const result = await api("/api/generate/", {
      method: "POST",
      body: JSON.stringify({
        text: payload.text,
        title: "AI Test",
        mode: payload.mode || "demo",
      }),
    });
    setText("#generateResult", result.generated_text || "Порожня відповідь");
    setStatus("#aiCheckStatus", "OK", payload.mode === "demo" ? "Режим демо" : "Режим OpenAI");
    done("success", "Тест виконано");
  } catch (error) {
    setText("#generateResult", error.message);
    setStatus("#aiCheckStatus", "ERROR", error.message);
    done("error", "Помилка");
  }
}

function applyTopicTemplate(key) {
  const form = $("#topicForm");
  if (!form) return;
  const templates = {
    AI: {
      name: "AI",
      description: "Новини про штучний інтелект, моделі та автоматизацію.",
      keywords: "ai, openai, машинне навчання, автоматизація",
    },
    "IT Ukraine": {
      name: "IT Україна",
      description: "Український IT-ринок, стартапи та події.",
      keywords: "it, ukraine, startup, dev",
    },
    Business: {
      name: "Бізнес",
      description: "Бізнес, компанії, ринки та економіка.",
      keywords: "business, finance, market, economy",
    },
    Science: {
      name: "Наука",
      description: "Наука, дослідження, космос та відкриття.",
      keywords: "science, research, space, discovery",
    },
    Technology: {
      name: "Технології",
      description: "Технологічні новини, сервіси та цифрові продукти.",
      keywords: "technology, gadgets, software, platform",
    },
  };
  const template = templates[key];
  if (!template) return;
  form.name.value = template.name;
  form.description.value = template.description;
  form.keywords.value = template.keywords;
}

function fillSourceFromSuggestion(suggestion, type) {
  if (!suggestion) return;

  const form = $("#sourceForm");
  if (!form) return;
  form.type.value = type;
  form.name.value = suggestion.name;
  form.url.value = suggestion.url;
  form.topic_id.value = topicIdBySlug(suggestion.topic_slug) || "";
  state.sourceTab = type;
  renderSourceTabs();
  renderSourceFormState();
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function saveSourceToExamples(sourceId) {
  const source = state.sources.find((item) => item.id === sourceId);
  if (!source) return;
  const type = source.type === "tg" ? "tg" : "site";
  const bucket = Array.isArray(state.customSourceSuggestions?.[type]) ? [...state.customSourceSuggestions[type]] : [];
  const payload = {
    name: source.name,
    url: source.url,
    topic_slug: state.topics.find((item) => item.id === source.topic_id)?.slug || "",
    description: `Користувацький приклад: ${source.name}`,
    type,
  };
  const key = `${normalize(payload.name).toLowerCase()}|${normalize(payload.url).toLowerCase()}`;
  if (!bucket.some((item) => `${normalize(item.name).toLowerCase()}|${normalize(item.url).toLowerCase()}` === key)) {
    bucket.unshift(payload);
  }
  state.customSourceSuggestions = {
    ...(state.customSourceSuggestions || {}),
    [type]: bucket,
  };
  writeJson("customSourceSuggestions", state.customSourceSuggestions);
  renderSuggestions();
}

async function useSourceSuggestion(index, type, button) {
  const suggestions = mergedSourceSuggestions(type);
  const suggestion = suggestions[index];
  fillSourceFromSuggestion(suggestion, type);
  const form = $("#sourceForm");
  if (!form) return;
  const details = button?.closest("details");
  if (details) details.open = false;
  await submitSourceForm(form);
}

function renderSourceTabs() {
  const site = $("#sourceTabSite");
  const tg = $("#sourceTabTg");
  const modal = $("#sourceModal");
  if (site) site.classList.toggle("active", state.sourceTab === "site");
  if (tg) tg.classList.toggle("active", state.sourceTab === "tg");
  if (modal) modal.dataset.activeSourceType = state.sourceTab;
  const type = $("#sourceType");
  if (type) type.value = state.sourceTab;
  renderSourceFormState();
}

function applySearchTemplate(index) {
  const search = state.savedSearches[index];
  if (!search) return;
  const input = $("#newsSearch");
  const topic = $("#newsTopic");
  if (input) input.value = search.query || "";
  if (topic) topic.value = search.topic_id || "";
  renderNews();
}

function saveSearchTemplate() {
  const query = normalize($("#newsSearch")?.value);
  const topicId = normalize($("#newsTopic")?.value);
  const label = query || topicId ? `${query || "Пошук"}${topicId ? " · тема" : ""}` : "Порожній пошук";
  state.savedSearches = [...state.savedSearches, { label, query, topic_id: topicId }];
  writeJson("savedNewsSearches", state.savedSearches);
  renderSavedSearches();
}

function setSearchExample(value) {
  const input = $("#newsSearch");
  if (!input) return;
  input.value = value;
}

function syncAiPromptPreview() {
  const style = $("#postStyleSelect")?.value || "Інформативний";
  const preview = $("#aiPromptPreview");
  if (!preview) return;
  preview.value = [
    `Стиль поста: ${style}.`,
    "Створи короткий Telegram-пост.",
    "Додай емодзі.",
    "Додай CTA.",
    "Максимум 500 символів.",
  ].join("\n");
}

async function toggleAutoPublish() {
  const checkbox = $("#autoPublishToggle");
  if (!checkbox) return;
  try {
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ auto_publish_posts: checkbox.checked }),
    });
    await loadPrivateData();
    showToast(checkbox.checked ? "Автопублікацію увімкнено" : "Автопублікацію вимкнено", "ok");
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    setStatus("#deliveryStatus, #settingsDeliveryStatus", "ERROR", error.message);
    showToast(`Не вдалося змінити автопублікацію: ${error.message}`, "error");
  }
}

async function checkTelegramConnection() {
  const done = withButtonState($("#checkTelegramBtn"), "Перевіряю...");
  try {
    const result = await api("/api/telegram/check", { method: "POST" });
    state.telegramCheckResult = result;
    setText("#telegramCheckResult", JSON.stringify(result, null, 2));
    renderTelegramStatus();
    renderOverview();
    done(result.ok ? "success" : "warn", result.ok ? "Перевірено" : "Є нюанс");
    showToast(result.ok ? "Telegram перевірено" : result.message, result.ok ? "ok" : "warn");
  } catch (error) {
    done("error", "Помилка");
    const message = error.message || "Не вдалося перевірити Telegram";
    setText("#telegramCheckResult", message);
    setStatus("#telegramConnectionStatus, #settingsTelegramConnectionStatus", "ERROR", message);
    showToast(`Не вдалося перевірити Telegram: ${message}`, "error");
  }
}

async function copyTelegramEnvLines() {
  const done = withButtonState($("#copyTelegramEnvLinesBtn"), "Копіюю...");
  const token = normalize($("#telegramBotTokenInput")?.value);
  const channel = normalize($("#telegramChannelInput")?.value);
  try {
    const text = [`TELEGRAM_BOT_TOKEN=${token}`, `TELEGRAM_TARGET_CHANNEL=${channel}`].join("\n");
    await navigator.clipboard.writeText(text);
    done("success", "Скопійовано");
  } catch (error) {
    done("error", "Помилка");
    setStatus("#telegramConnectionStatus, #settingsTelegramConnectionStatus", "ERROR", error.message);
  }
}

function toggleTelegramEnvBox() {
  const box = $("#telegramEnvBox");
  if (!box) return;
  box.hidden = !box.hidden;
}

async function verifyOpenAI() {
  const done = withButtonState($("#verifyOpenaiBtn"), "Перевіряю...");
  try {
    const result = await api("/api/openai/check", { method: "POST" });
    state.openaiCheckResult = result;
    setText("#openaiCheckResult", JSON.stringify(result, null, 2));
    const temporaryIssue = ["rate_limited", "timeout", "unavailable"].includes(result.status);
    const statusText = result.ok ? "ШІ підключено" : temporaryIssue ? "ШІ тимчасово недоступний" : "ШІ не підтверджено";
    setStatus("#openaiStatus", result.ok ? "OK" : temporaryIssue ? "WAIT" : "ERROR", statusText);
    renderOverview();
    done(result.ok ? "success" : temporaryIssue ? "warn" : "error", result.ok ? "Перевірено" : temporaryIssue ? "Тимчасово" : "Помилка");
    showToast(result.ok ? "AI підключено" : result.message, result.ok ? "ok" : temporaryIssue ? "warn" : "error");
  } catch (error) {
    setText("#openaiCheckResult", error.message);
    setStatus("#openaiStatus", "ERROR", error.message);
    done("error", "Помилка");
    showToast(`Не вдалося перевірити AI: ${error.message}`, "error");
  }
}

function showAdminKey() {
  const key = normalize($("#apiKey")?.value);
  if (!key) {
    sessionStorage.removeItem("adminApiKey");
    renderAdminState();
    return;
  }
  sessionStorage.setItem("adminApiKey", key);
  renderAdminState();
}

async function clearAdminKey() {
  sessionStorage.removeItem("adminApiKey");
  if (adminKeyInput) adminKeyInput.value = "";
  renderAdminState();
  await refreshAll();
}

async function saveAdminKey() {
  const done = withButtonState($("#saveKeyBtn"), "Перевіряю...");
  const key = normalize($("#apiKey")?.value);
  if (!key) {
    clearAdminKey();
    done("error", "Немає ключа");
    return;
  }

  sessionStorage.setItem("adminApiKey", key);
  renderAdminState();
  try {
    await loadPrivateData();
    done("success", "Ключ збережено");
    showToast("Код доступу збережено", "ok");
  } catch (error) {
    done("error", "Помилка");
    setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
    showToast(`Не вдалося перевірити код доступу: ${error.message}`, "error");
  }
}

async function refreshPipelineStatus() {
  try {
    const status = await api(`/api/pipeline/status${state.pipelineTaskId ? `?task_id=${encodeURIComponent(state.pipelineTaskId)}` : ""}`);
    state.pipelineStatus = status;
    renderPipeline();
  } catch (error) {
    setStatus("#workflowStatus", "ERROR", error.message);
  }
}

function bindEvents() {
  $("#toastCloseBtn")?.addEventListener("click", () => {
    const toast = $("#toast");
    if (toast) toast.hidden = true;
  });

  $("#telegramChannelLinkTop")?.addEventListener("click", (event) => {
    const node = event.currentTarget;
    if (node instanceof HTMLAnchorElement && node.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      showToast($("#telegramConnectionReason")?.textContent || "Telegram-канал не підключено", "warn");
    } else if (node instanceof HTMLAnchorElement && node.dataset.openSection) {
      event.preventDefault();
    }
  });

  $("#openSourceModalBtn")?.addEventListener("click", () => openDialog("#sourceModal"));
  $("#openAiTestBtn")?.addEventListener("click", () => {
    const textarea = document.querySelector('#aiModal textarea[name="text"]');
    if (textarea instanceof HTMLTextAreaElement && !normalize(textarea.value)) {
      textarea.value =
        "Сьогодні OpenAI анонсувала оновлення свого API, а Telegram-канал з AI-новинами опублікував короткий огляд змін. Потрібен лаконічний Telegram-пост українською мовою з емодзі та CTA.";
    }
    openDialog("#aiModal");
  });
  $("#openPipelineModalBtn")?.addEventListener("click", () => openDialog("#pipelineModal"));
  $("#pausePipelineBtn")?.addEventListener("click", pausePipeline);

  $("#refreshBtn")?.addEventListener("click", async () => {
    const done = withButtonState($("#refreshBtn"), "Оновлюю...");
    try {
      await refreshAll();
      if (hasAdminKey()) {
        done("success", "Оновлено");
        setText("#panelStatusNote", "Панель оновлено. Усі доступні дані синхронізовані.");
        showToast("Панель оновлено", "ok");
      } else {
        done("warn", "Частково");
        setText("#panelStatusNote", "Панель оновлено частково. Для джерел, правил і постів потрібен код доступу.");
        showToast("Панель оновлено частково: потрібен код доступу для приватних блоків.", "warn");
      }
    } catch (error) {
      done("error", "Не оновлено");
      setText("#panelStatusNote", `Панель не оновилась: ${error.message}`);
      showToast(`Панель не оновилась: ${error.message}`, "error");
      setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
    }
  });
  $("#saveKeyBtn")?.addEventListener("click", () => saveAdminKey());
  $("#clearKeyBtn")?.addEventListener("click", clearAdminKey);
  $("#showTelegramEnvBtn")?.addEventListener("click", toggleTelegramEnvBox);
  $("#copyTelegramEnvLinesBtn")?.addEventListener("click", copyTelegramEnvLines);
  $("#checkTelegramBtn")?.addEventListener("click", checkTelegramConnection);
  $("#verifyOpenaiBtn")?.addEventListener("click", verifyOpenAI);
  $("#runPipelineBtn")?.addEventListener("click", startPipeline);
  $("#checkDeliveryBtn")?.addEventListener("click", async () => {
    const done = withButtonState($("#checkDeliveryBtn"), "Перевіряю...");
    try {
      await refreshAll();
      done("success", "Оновлено");
      openSection("overviewSection");
      showToast("Доставку перевірено", "ok");
    } catch (error) {
      done("error", "Помилка");
      showToast(`Не вдалося оновити доставку: ${error.message}`, "error");
    }
  });
  $("#autoPublishToggle")?.addEventListener("change", toggleAutoPublish);

  $("#sourceTabSite")?.addEventListener("click", () => {
    state.sourceTab = "site";
    renderSourceTabs();
  });
  $("#sourceTabTg")?.addEventListener("click", () => {
    state.sourceTab = "tg";
    renderSourceTabs();
  });

  $("#closeSourceModalBtn")?.addEventListener("click", () => closeDialog("#sourceModal"));
  $("#closePipelineModalBtn")?.addEventListener("click", () => closeDialog("#pipelineModal"));
  $("#closeAiModalBtn")?.addEventListener("click", () => closeDialog("#aiModal"));

  $("#topicForm")?.addEventListener("submit", (event) => saveTopic(event));
  $("#sourceForm")?.addEventListener("submit", (event) => createSource(event));
  $("#generateForm")?.addEventListener("submit", (event) => testAi(event));
  $("#startPipelineFromSourcesBtn")?.addEventListener("click", startPipeline);
  $("#searchNewsBtn")?.addEventListener("click", () => renderNews());
  $("#saveSearchTemplateBtn")?.addEventListener("click", saveSearchTemplate);
  $("#refreshPostsBtn")?.addEventListener("click", () => renderPosts());
  $("#postStatusFilter")?.addEventListener("change", () => renderPosts());
  $("#searchExampleSelect")?.addEventListener("change", (event) => setSearchExample(event.target.value));
  $("#topicExampleSelect")?.addEventListener("change", (event) => applyTopicTemplate(event.target.value));
  $("#postStyleSelect")?.addEventListener("change", syncAiPromptPreview);

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;

    if (target.dataset.openSection) {
      openSection(target.dataset.openSection);
      return;
    }

    if (target.dataset.openDialog) {
      openDialog(`#${target.dataset.openDialog}`);
      return;
    }

    if (target.dataset.topicTemplate) return applyTopicTemplate(target.dataset.topicTemplate);

    if (target.dataset.useSourceSuggestion) {
      const index = Number(target.dataset.useSourceSuggestion);
      const type = target.dataset.suggestionType || "site";
      return useSourceSuggestion(index, type, target).catch((error) => setStatus("#sourceSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.saveSourceExample) {
      return saveSourceToExamples(target.dataset.saveSourceExample);
    }

    if (target.dataset.deleteTopic) {
      return removeTopic(target.dataset.deleteTopic).catch((error) => setStatus("#topicSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.editSource) {
      const source = state.sources.find((item) => item.id === target.dataset.editSource);
      if (!source) return;
      const form = $("#sourceForm");
      if (!form) return;
      state.sourceTab = source.type;
      renderSourceTabs();
      form.name.value = source.name;
      form.url.value = source.url;
      form.topic_id.value = source.topic_id || "";
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (target.dataset.deleteSource) {
      return removeSource(target.dataset.deleteSource).catch((error) => setStatus("#sourceSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.improveAi) return improveWithAI(target.dataset.improveAi, target);
    if (target.dataset.publishSite) return publishNews(target.dataset.publishSite, `/api/news/${target.dataset.publishSite}/publish-site`, target);
    if (target.dataset.publishTelegram) return publishNews(target.dataset.publishTelegram, `/api/news/${target.dataset.publishTelegram}/publish-telegram`, target);

    if (target.dataset.focusPost) {
      const textarea = $(`[data-post-text="${target.dataset.focusPost}"]`);
      textarea?.focus();
      return;
    }

    if (target.dataset.confirmPost) return approvePost(target.dataset.confirmPost, target);
    if (target.dataset.applySearch) return applySearchTemplate(Number(target.dataset.applySearch));
  });
}

async function boot() {
  bindEvents();
  renderAdminState();
  renderSourceTabs();
  renderSavedSearches();
  syncAiPromptPreview();
  await refreshAll();
}

boot().catch((error) => {
  setStatus("#settingsAdminKeyStatus", "ERROR", error.message);
  setStatus("#workflowStatus", "ERROR", error.message);
});
