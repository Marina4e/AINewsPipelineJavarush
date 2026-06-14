const state = {
  publicStatus: null,
  settings: null,
  topics: [],
  keywords: [],
  sources: [],
  sourceSuggestions: [],
  news: [],
  posts: [],
  pipelineStatus: null,
  pipelineTaskId: sessionStorage.getItem("pipelineTaskId") || "",
  sourceTab: "site",
  savedSearches: readJson("savedNewsSearches", []),
  taskTimers: new Map(),
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

function statusMarkup(token, text) {
  return `<span class="status-token">[${escapeHtml(token)}]</span>${escapeHtml(text)}`;
}

function setStatus(selector, token, text) {
  const node = $(selector);
  if (node) node.innerHTML = statusMarkup(token, text);
}

function setText(selector, text) {
  const node = $(selector);
  if (node) node.textContent = text;
}

function setHtml(selector, html) {
  const node = $(selector);
  if (node) node.innerHTML = html;
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
  const topic = state.topics.find((item) => normalize(item.slug) === normalize(slug));
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
  if (source.last_error) {
    return {
      tone: "error",
      token: "ERROR",
      status: "Джерело вимкнене",
      nameClass: "source-name source-name--error",
    };
  }
  if (source.enabled) {
    return {
      tone: "active",
      token: "OK",
      status: "Джерело активне",
      nameClass: "source-name source-name--active",
    };
  }
  return {
    tone: "disabled",
    token: "ERROR",
    status: "Джерело вимкнене",
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
    "Pipeline Started": "Конвеєр запущено",
    "RSS Processing": "Обробка RSS",
    "Telegram Processing": "Обробка Telegram",
    "AI Processing": "Обробка ШІ",
    "Post Generation": "Створення постів",
    "Publishing": "Публікація",
    "Completed": "Завершено",
  };
  return map[value] || value || "";
}

function translateStageState(value) {
  const map = {
    pending: "очікує",
    running: "виконується",
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
    window.setTimeout(() => {
      button.classList.remove("is-success", "is-error");
      button.textContent = original;
    }, 2500);
  };
}

function selectedSourceType() {
  return $("#sourceType")?.value === "tg" ? "tg" : "site";
}

function renderAdminState() {
  if (!hasAdminKey()) {
    setStatus("#adminKeyStatus", "LOCK", "Адмін-ключ API не задано");
    return;
  }
  setStatus("#adminKeyStatus", "OK", "Адмін-ключ API збережено");
}

function renderOpenAIStatus() {
  const configured = Boolean(state.publicStatus?.openai_configured);
  setStatus("#openaiStatus", configured ? "OK" : "ERROR", configured ? "🟢 OpenAI підключено" : "🔴 OpenAI не підключено");
}

function renderTelegramStatus() {
  const status = state.settings || state.publicStatus;
  if (!status) return;

  const botOnline = Boolean(status.telegram_bot_configured);
  const channelAvailable = Boolean(status.telegram_target_channel);
  const publishingAvailable = Boolean(status.telegram_connected);
  const lastDelivery = status.last_successful_delivery_at ? formatDate(status.last_successful_delivery_at) : "немає";

  setStatus("#telegramBotStatus", botOnline ? "OK" : "ERROR", botOnline ? "Бот онлайн" : "Бот офлайн");
  setStatus("#telegramChannelStatus", channelAvailable ? "OK" : "ERROR", channelAvailable ? "Канал доступний" : "Канал недоступний");
  setStatus("#telegramReaderStatus", publishingAvailable ? "OK" : "ERROR", publishingAvailable ? "Публікація доступна" : "Публікація недоступна");
  setStatus("#deliveryStatus", status.last_successful_delivery_at ? "OK" : "WAIT", `Остання успішна доставка: ${lastDelivery}`);

  const href = sourceHref(status.telegram_target_channel);
  for (const selector of ["#telegramChannelLink", "#telegramChannelLinkTop", "#telegramDeliveryLink"]) {
    const node = $(selector);
    if (!node) continue;
    node.hidden = !href;
    if (href) node.href = href;
  }

  const target = $("#telegramTarget");
  if (target) {
    target.textContent = status.telegram_target_channel
      ? `Канал: ${status.telegram_target_channel}`
      : "Канал не налаштовано";
  }
}

function renderTopicSelects() {
  const html = topicOptions(true);
  for (const selector of ["#sourceTopic", "#keywordTopic", "#newsTopic", "#manualNewsTopic"]) {
    const node = $(selector);
    if (node) node.innerHTML = html;
  }
}

function renderTopics() {
  const list = $("#topicsList");
  if (!list) return;

  list.innerHTML =
    state.topics
      .map((topic) => {
        const tone = topic.enabled ? "Topic Activated" : "Topic Not Activated";
        return `
          <div class="item topic-card ${topic.enabled ? "is-active" : "is-inactive"}">
            <div class="item-title">${escapeHtml(topic.name)}</div>
            <div class="muted">${escapeHtml(topic.description || "Без опису")}</div>
            <div class="status slim">${statusMarkup(topic.enabled ? "OK" : "ERROR", tone)}</div>
            <div class="item-actions">
              <button class="secondary" data-toggle-topic="${escapeHtml(topic.id)}">${topic.enabled ? "Вимкнути" : "Активувати"}</button>
              <button class="danger" data-delete-topic="${escapeHtml(topic.id)}">Видалити</button>
            </div>
          </div>`;
      })
      .join("") || '<div class="item muted">Теми ще не додано.</div>';

  setStatus("#topicSaveStatus", state.topics.length ? "OK" : "WAIT", state.topics.length ? `Теми: ${state.topics.length}` : "Теми ще не додано");
}

function renderKeywords() {
  const list = $("#keywordsList");
  if (!list) return;

  list.innerHTML =
    state.keywords
      .map((keyword) => {
        const topic = state.topics.find((item) => item.id === keyword.topic_id);
        return `
          <div class="item keyword-card">
            <div class="item-title">${escapeHtml(keyword.word)}</div>
            <div class="muted">${escapeHtml(topic ? topic.name : "Без теми")}</div>
            <div class="item-actions">
              <button class="danger" data-delete-keyword="${escapeHtml(String(keyword.id))}">Видалити</button>
            </div>
          </div>`;
      })
      .join("") || '<div class="item muted">Ключових слів ще не додано.</div>';

  setStatus("#keywordSaveStatus", state.keywords.length ? "OK" : "WAIT", state.keywords.length ? `Ключових слів: ${state.keywords.length}` : "Ключових слів ще не додано");
}

function renderSourceFormState() {
  const type = selectedSourceType();
  const submit = $("#sourceSubmitBtn");
  const hint = $("#sourceUrlHint");
  const label = $("#sourceEnabledLabel");

  if (submit) submit.textContent = type === "tg" ? "Додати Telegram джерело" : "Додати RSS джерело";
  if (hint) {
    hint.textContent =
      type === "tg"
        ? "Для Telegram вкажи @назва_каналу або посилання на канал."
        : "Для RSS вкажи повний URL стрічки.";
  }
  if (label) {
    label.innerHTML = statusMarkup("OK", "Нове джерело буде активним після додавання.");
  }
}

function renderSuggestions() {
  const rssList = $("#rssSuggestionsList");
  const tgList = $("#telegramSuggestionsList");
  if (rssList) {
    const items = state.sourceSuggestions.filter((item) => item.type === "site");
    rssList.innerHTML =
      items
        .map(
          (item, index) => `
            <div class="item suggestion-card">
            <div class="item-title">${escapeHtml(item.name)}</div>
            <div class="muted">${escapeHtml(item.description)}</div>
            <div class="muted">${escapeHtml(item.url)}</div>
              <div class="item-actions">
                <button class="secondary" data-fill-source-suggestion="${index}" data-suggestion-type="site">Вибрати приклад</button>
                <button data-add-source-suggestion="${index}" data-suggestion-type="site">Додати у джерела</button>
              </div>
            </div>`
        )
        .join("") || '<div class="item muted">Прикладів RSS ще немає.</div>';
  }
  if (tgList) {
    const items = state.sourceSuggestions.filter((item) => item.type === "tg");
    tgList.innerHTML =
      items
        .map(
          (item, index) => `
            <div class="item suggestion-card">
              <div class="item-title">${escapeHtml(item.name)}</div>
              <div class="muted">${escapeHtml(item.description)}</div>
              <div class="muted">${escapeHtml(item.url)}</div>
              <div class="item-actions">
                <button class="secondary" data-fill-source-suggestion="${index}" data-suggestion-type="tg">Вибрати приклад</button>
                <button data-add-source-suggestion="${index}" data-suggestion-type="tg">Додати у джерела</button>
              </div>
            </div>`
        )
        .join("") || '<div class="item muted">Прикладів Telegram ще немає.</div>';
  }
}

function renderSources() {
  const rssList = $("#rssSourcesList");
  const tgList = $("#telegramSourcesList");
  if (!rssList || !tgList) return;

  const renderOne = (source) => {
    const info = sourceModeInfo(source);
    const topic = state.topics.find((item) => item.id === source.topic_id);
    const href = sourceHref(source.url);
    return `
      <article class="item source-card source-card--${info.tone}">
        <div class="${info.nameClass}">${escapeHtml(source.name)}</div>
        <div class="source-url ${info.nameClass}">${escapeHtml(source.url)}</div>
        <div class="status slim">${statusMarkup(info.token, info.status)}</div>
        <div class="muted">Тема: ${escapeHtml(topic ? topic.name : "Без теми")}</div>
        <div class="muted">Перевірка: ${escapeHtml(formatDate(source.last_checked_at))}</div>
        <div class="muted">Успіх: ${escapeHtml(formatDate(source.last_success_at))}</div>
        ${source.last_error ? `<div class="error-box">🔴 Джерело недоступне<br />Причина: ${escapeHtml(source.last_error)}</div>` : ""}
        <div class="item-actions">
          ${href ? `<a class="link-button secondary" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">Відкрити</a>` : ""}
          <button class="secondary" data-toggle-source="${escapeHtml(source.id)}">${source.enabled ? "Вимкнути" : "Активувати"}</button>
          <button class="secondary" data-edit-source="${escapeHtml(source.id)}">Редагувати</button>
          <button class="danger" data-delete-source="${escapeHtml(source.id)}">Видалити</button>
        </div>
      </article>`;
  };

  const rss = state.sources.filter((source) => source.type === "site");
  const tg = state.sources.filter((source) => source.type === "tg");
    rssList.innerHTML = rss.map(renderOne).join("") || '<div class="item muted">RSS джерел ще немає.</div>';
  tgList.innerHTML = tg.map(renderOne).join("") || '<div class="item muted">Telegram джерел ще немає.</div>';
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
                <p>${escapeHtml(item.summary)}</p>
              <div class="item-actions">
                  <button data-edit-manual="${escapeHtml(item.id)}">Створити чернетку</button>
                  <button class="secondary" data-improve-ai="${escapeHtml(item.id)}">Покращити ШІ</button>
                  <button class="secondary" data-publish-site="${escapeHtml(item.id)}">На підтвердження</button>
                  <button class="secondary" data-publish-telegram="${escapeHtml(item.id)}">У Telegram</button>
                </div>
              </article>`;
          })
          .join("") || '<div class="item muted">Зібраних новин ще немає. Запусти збір новин.</div>';
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
      list.innerHTML =
        filtered
          .map((post) => {
            const headline = post.news?.title || `Матеріал ${post.id.slice(0, 8)}`;
            const statusText =
              post.status === "published" ? "Опубліковано" : post.status === "failed" ? "Помилки" : "Очікує підтвердження";
            return `
              <article class="card queue-card">
                <div class="item-title">${escapeHtml(headline)}</div>
                <div class="muted">${escapeHtml(postStatusLabel(post.status))} · ${escapeHtml(formatDate(post.updated_at))}</div>
                ${post.news ? `<div class="muted">${escapeHtml(post.news.source)} · ${escapeHtml(formatDate(post.news.published_at))}</div>` : ""}
                <textarea data-post-text="${escapeHtml(post.id)}">${escapeHtml(post.generated_text)}</textarea>
                ${post.error ? `<div class="error-box">🔴 Помилка матеріалу<br />Причина: ${escapeHtml(post.error)}</div>` : ""}
                <div class="item-actions">
                  <button data-focus-post="${escapeHtml(post.id)}">Редагувати вручну</button>
                  <button class="secondary" data-confirm-post="${escapeHtml(post.id)}">Підтвердити та надіслати</button>
                </div>
                <div class="status slim">${statusMarkup(post.status === "published" ? "OK" : post.status === "failed" ? "ERROR" : "WAIT", statusText)}</div>
              </article>`;
          })
          .join("") || '<div class="item muted">Матеріалів немає. Перевір джерела або запусти збір новин.</div>';

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
      list.innerHTML = `<div class="item muted">${escapeHtml(error.message)}</div>`;
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
  const aiReady = Boolean(state.publicStatus?.openai_configured);

  setStatus("#pipelineReadyStatus", running ? "RUN" : "WAIT", running ? "🟢 Конвеєр працює" : "🔴 Конвеєр зупинено");
  setStatus("#workflowStatus", running ? "RUN" : "WAIT", running ? "🟢 Конвеєр працює" : "🔴 Конвеєр зупинено");
  setStatus("#rssReadyStatus", rssReady ? "OK" : "ERROR", rssReady ? "RSS готово" : "RSS не готово");
  setStatus("#telegramReadyStatus", telegramReady ? "OK" : "ERROR", telegramReady ? "Telegram готово" : "Telegram не готово");
  setStatus("#aiReadyStatus", aiReady ? "OK" : "ERROR", aiReady ? "ШІ готовий" : "ШІ не підключено");

  const stageNames = [
    { key: "Pipeline Started", label: "Конвеєр запущено" },
    { key: "RSS Processing", label: "Обробка RSS" },
    { key: "Telegram Processing", label: "Обробка Telegram" },
    { key: "AI Processing", label: "Обробка ШІ" },
    { key: "Post Generation", label: "Створення постів" },
    { key: "Publishing", label: "Публікація" },
    { key: "Completed", label: "Завершено" },
  ];
  const stageList = $("#pipelineStageList");
  if (stageList) {
    stageList.innerHTML = stageNames
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
  }

  if (status.task_state === "SUCCESS") {
    setText("#pipelineResult", "Збір новин завершено");
  } else if (status.task_state === "FAILURE") {
    setText("#pipelineResult", explainErrorBody(status.task_result || status.task_meta, "Конвеєр завершився з помилкою"));
  } else if (meta.stage_label) {
    setText("#pipelineResult", translateStageLabel(meta.stage_label));
  } else {
    setText("#pipelineResult", "");
  }
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
}

async function loadPrivateData() {
  const [settings, topics, keywords, sources] = await Promise.all([
    api("/api/settings"),
    api("/api/topics/"),
    api("/api/keywords/"),
    api("/api/sources/"),
  ]);

  state.settings = settings;
  state.topics = topics;
  state.keywords = keywords;
  state.sources = sources;

  renderTopicSelects();
  renderTopics();
  renderKeywords();
  renderSources();
  renderOpenAIStatus();
  renderTelegramStatus();
  renderSourceFormState();

  const pipeline = await api(`/api/pipeline/status${state.pipelineTaskId ? `?task_id=${encodeURIComponent(state.pipelineTaskId)}` : ""}`);
  state.pipelineStatus = pipeline;
  renderPipeline();

  await Promise.all([renderNews(), renderPosts()]);
}

async function refreshAll() {
  await loadPublicData();
  renderTopicSelects();
  renderSourceFormState();

  if (!hasAdminKey()) {
    setHtml("#topicsList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити теми.</div>');
    setHtml("#keywordsList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити ключові слова.</div>');
    setHtml("#rssSourcesList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити RSS джерела.</div>');
    setHtml("#telegramSourcesList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити Telegram джерела.</div>');
    setHtml("#newsList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити новини.</div>');
    setHtml("#postsList", '<div class="item muted">Матеріалів немає. Перевір джерела або запусти збір новин.</div>');
    setHtml("#publishedList", '<div class="item muted">Додайте адмін-ключ API, щоб бачити публікації.</div>');
    setText("#pipelineResult", "");
    setStatus("#workflowStatus", "WAIT", "🔴 Конвеєр зупинено");
    renderSavedSearches();
    renderPipeline();
    return;
  }

  try {
    await loadPrivateData();
  } catch (error) {
    setStatus("#adminKeyStatus", "ERROR", error.message);
    setStatus("#workflowStatus", "ERROR", error.message);
  }
}

async function startPipeline() {
  const done = withButtonState($("#runPipelineBtn"), "Запускаю...");
  try {
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
    await pollPipeline(result.task_id);
  } catch (error) {
    done("error", "Помилка");
    setStatus("#workflowStatus", "ERROR", error.message);
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

async function saveTopic(event) {
  event.preventDefault();
  const done = withButtonState($("#saveTopicBtn"), "Зберігаю...");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    await api("/api/topics/", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || "",
        enabled: payload.enabled === "on",
      }),
    });
    done("success", "Збережено");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#topicSaveStatus", "ERROR", error.message);
  }
}

async function saveKeywords(event) {
  event.preventDefault();
  const done = withButtonState($("#saveKeywordBtn"), "Зберігаю...");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  const words = splitKeywords(payload.keywords);
  try {
    for (const word of words) {
      await api("/api/keywords/", {
        method: "POST",
        body: JSON.stringify({ word, topic_id: payload.topic_id || null }),
      });
    }
    done("success", "Збережено");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#keywordSaveStatus", "ERROR", error.message);
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
    done("success", "Додано");
    setStatus("#sourceSaveStatus", "OK", "Джерело додано до списку");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#sourceSaveStatus", "ERROR", error.message);
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

async function removeKeyword(keywordId) {
  await api(`/api/keywords/${keywordId}`, { method: "DELETE" });
  await loadPrivateData();
}

async function createManualNews(event) {
  event.preventDefault();
  const done = withButtonState($("#createManualNewsBtn"), "Створюю...");
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    await api("/api/news/manual", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        summary: payload.summary,
        url: payload.url || null,
        source: payload.source || "Ручна панель",
        topic_id: payload.topic_id || null,
      }),
    });
    done("success", "Створено");
    setStatus("#manualNewsStatus", "OK", "Ручну новину створено");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#manualNewsStatus", "ERROR", error.message);
  }
}

async function editManually(newsId, button) {
  const done = withButtonState(button, "Створюю...");
  try {
    await api(`/api/news/${newsId}/generate-demo`, { method: "POST" });
    done("success", "Створено");
    await loadPrivateData();
  } catch (error) {
    done("error", "Помилка");
    setStatus("#pipelineResult", "ERROR", error.message);
  }
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
    "AI": { name: "AI", description: "Новини про штучний інтелект, моделі та автоматизацію." },
    "IT Ukraine": { name: "IT Україна", description: "Український IT-ринок, стартапи та події." },
    "Business": { name: "Бізнес", description: "Бізнес, компанії, ринки та економіка." },
    "Science": { name: "Наука", description: "Наука, дослідження, космос та відкриття." },
  };
  const template = templates[key];
  if (!template) return;
  form.name.value = template.name;
  form.description.value = template.description;
  form.enabled.checked = true;
}

function applyKeywordTemplate(key) {
  const form = $("#keywordForm");
  if (!form) return;
  const templates = {
    ai: "ai, openai, машинне навчання, автоматизація",
    rss: "rss, feed, news, updates",
    telegram: "telegram, channel, bot, message",
  };
  form.keywords.value = templates[key] || "";
}

function fillSourceFromSuggestion(index, type) {
  const suggestions = state.sourceSuggestions.filter((item) => item.type === type);
  const suggestion = suggestions[index];
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

async function addSourceSuggestion(index, type) {
  fillSourceFromSuggestion(index, type);
  const form = $("#sourceForm");
  if (!form) return;
  await submitSourceForm(form);
}

function renderSourceTabs() {
  const site = $("#sourceTabSite");
  const tg = $("#sourceTabTg");
  if (site) site.classList.toggle("active", state.sourceTab === "site");
  if (tg) tg.classList.toggle("active", state.sourceTab === "tg");
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

async function toggleAutoPublish() {
  const checkbox = $("#autoPublishToggle");
  if (!checkbox) return;
  try {
    await api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ auto_publish_posts: checkbox.checked }),
    });
    await loadPrivateData();
  } catch (error) {
    checkbox.checked = !checkbox.checked;
    setStatus("#deliveryStatus", "ERROR", error.message);
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
    setStatus("#telegramBotStatus", "ERROR", error.message);
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
    setText("#openaiCheckResult", JSON.stringify(result, null, 2));
    setStatus("#openaiStatus", result.ok ? "OK" : "ERROR", result.message);
    done("success", "Перевірено");
  } catch (error) {
    setText("#openaiCheckResult", error.message);
    setStatus("#openaiStatus", "ERROR", error.message);
    done("error", "Помилка");
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
  } catch (error) {
    done("error", "Помилка");
    setStatus("#adminKeyStatus", "ERROR", error.message);
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

  $("#refreshBtn")?.addEventListener("click", () => refreshAll().catch((error) => setStatus("#adminKeyStatus", "ERROR", error.message)));
  $("#saveKeyBtn")?.addEventListener("click", () => saveAdminKey());
  $("#clearKeyBtn")?.addEventListener("click", clearAdminKey);
  $("#showTelegramEnvBtn")?.addEventListener("click", toggleTelegramEnvBox);
  $("#copyTelegramEnvLinesBtn")?.addEventListener("click", copyTelegramEnvLines);
  $("#verifyOpenaiBtn")?.addEventListener("click", verifyOpenAI);
  $("#runPipelineBtn")?.addEventListener("click", startPipeline);
  $("#refreshPipelineBtn")?.addEventListener("click", refreshPipelineStatus);
  $("#checkDeliveryBtn")?.addEventListener("click", refreshAll);
  $("#autoPublishToggle")?.addEventListener("change", toggleAutoPublish);

  $("#sourceTabSite")?.addEventListener("click", () => {
    state.sourceTab = "site";
    renderSourceTabs();
  });
  $("#sourceTabTg")?.addEventListener("click", () => {
    state.sourceTab = "tg";
    renderSourceTabs();
  });

  $("#topicForm")?.addEventListener("submit", (event) => saveTopic(event));
  $("#keywordForm")?.addEventListener("submit", (event) => saveKeywords(event));
  $("#sourceForm")?.addEventListener("submit", (event) => createSource(event));
  $("#manualNewsForm")?.addEventListener("submit", (event) => createManualNews(event));
  $("#generateForm")?.addEventListener("submit", (event) => testAi(event));
  $("#searchNewsBtn")?.addEventListener("click", () => renderNews());
  $("#saveSearchTemplateBtn")?.addEventListener("click", saveSearchTemplate);
  $("#refreshPostsBtn")?.addEventListener("click", () => renderPosts());
  $("#postStatusFilter")?.addEventListener("change", () => renderPosts());
  $("#searchExampleSelect")?.addEventListener("change", (event) => setSearchExample(event.target.value));

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) return;

    if (target.dataset.topicTemplate) return applyTopicTemplate(target.dataset.topicTemplate);
    if (target.dataset.keywordTemplate) return applyKeywordTemplate(target.dataset.keywordTemplate);

    if (target.dataset.fillSourceSuggestion) {
      return fillSourceFromSuggestion(Number(target.dataset.fillSourceSuggestion), target.dataset.suggestionType || "site");
    }

    if (target.dataset.addSourceSuggestion) {
      const index = Number(target.dataset.addSourceSuggestion);
      const type = target.dataset.suggestionType || "site";
      return addSourceSuggestion(index, type).catch((error) => setStatus("#sourceSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.toggleTopic) {
      const topic = state.topics.find((item) => item.id === target.dataset.toggleTopic);
      if (!topic) return;
      return api(`/api/topics/${topic.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !topic.enabled }),
      })
        .then(loadPrivateData)
        .catch((error) => setStatus("#topicSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.deleteTopic) {
      return removeTopic(target.dataset.deleteTopic).catch((error) => setStatus("#topicSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.deleteKeyword) {
      return removeKeyword(target.dataset.deleteKeyword).catch((error) => setStatus("#keywordSaveStatus", "ERROR", error.message));
    }

    if (target.dataset.toggleSource) {
      const source = state.sources.find((item) => item.id === target.dataset.toggleSource);
      if (!source) return;
      return updateSource(source.id, { enabled: !source.enabled }).catch((error) => setStatus("#sourceSaveStatus", "ERROR", error.message));
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

    if (target.dataset.editManual) return editManually(target.dataset.editManual, target);
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
  await refreshAll();
}

boot().catch((error) => {
  setStatus("#adminKeyStatus", "ERROR", error.message);
  setStatus("#workflowStatus", "ERROR", error.message);
});
