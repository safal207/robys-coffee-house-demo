// Rebuild the standalone Roby's QA artifact. No network or external dependencies.
function reportApp() {
  "use strict";
  const data = JSON.parse(document.getElementById("qa-data").textContent);
  const $ = id => document.getElementById(id);
  const storageKey = "robys.qa.manual-regression.review.v1";
  const labels = { planned: "Запланирован", partial: "Частично проверен", passed: "Пройден", failed: "Ошибка", blocked: "Заблокирован" };
  const actorLabels = { guest: "Гость", cashier: "Кассир", barista: "Бариста", system: "Система" };
  const byId = new Map(data.cases.map(item => [item.id, item]));
  const nodes = new Map(data.graph.nodes.map(item => [item.id, item]));
  // Editorial navigation groups only; these aliases never create graph edges
  // or change a case's exact causal IDs or execution status.
  const stageAliases = {
    SMART_PREFERENCES: ["SMART_START", "SMART_CONTINUE", "SMART_BACK", "SMART_RESTART", "SMART_CHANGE_ANSWERS", "SMART_BUDGET_SELECT", "SMART_CONFLICTING_PREFERENCES"],
    SMART_OPTIONS: ["SMART_RESULTS", "SMART_HELPFUL_OPTIONS", "NO_MATCH_RECOVERABLE", "REAL_PRODUCTS_SUGGESTED", "PREFERENCE_DIFFERENCES_VISIBLE", "SMART_HELPFUL_OPTION_SELECT", "SMART_RECOMMENDATION_SELECT"],
    PHOTO_LOADING: ["PHOTO_LOAD", "PHOTO_SLOW_NETWORK", "PHOTO_PREVIEW_VISIBLE", "CONTROLS_NOT_BLOCKED_BY_PHOTO", "PHOTO_LAYOUT_STABLE", "PHOTO_CACHE_REUSE"],
    PHOTO_READY: ["ALL_VISIBLE_MENU_PHOTOS_RENDERED", "PHOTO_PRODUCT_MATCH", "PHOTO_LOAD_COMPLETE", "LOADED_PHOTO_REUSED", "NO_PHOTO_REQUEST_LOOP", "PHOTO_ASPECT_PRESERVED", "LAZY_PHOTOS_EVENTUALLY_VISIBLE"],
    PHOTO_ERROR: ["PHOTO_THUMBNAIL_ERROR", "PHOTO_ORIGINAL_FALLBACK", "PHOTO_ALL_SOURCES_ERROR", "CART_ADD_DURING_PHOTO_ERROR", "PHOTO_NETWORK_RECOVERED", "PHOTO_EXPLICIT_RETRY", "PHOTO_ERROR_VISIBLE", "PHOTO_RETRY_RECOVERS", "PHOTO_ERROR_RECOVERED"],
    CART_ADD: ["CART_ADD_DOUBLE_ACTIVATE", "CART_ADD_DISTINCT_VARIANTS", "CART_ADD_STANDALONE", "CART_ADD_PAIR", "CART_GROUP_ADDED", "CART_GROUP_MERGE", "CART_PAIR_ADD_REJECTED", "CART_ADD_RETRY"],
    CART_REPLACE: ["CART_REPLACE_OPEN", "CART_EDIT", "CART_EDIT_OPEN", "CART_EDIT_SAVE", "CART_VARIANT_CHANGE", "CART_DESSERT_REPLACE", "QUICK_ORDER_EDITED", "EXTERNAL_CART_CHANGE"],
    CART_REMOVE: ["MENU_CART_DECREASE_TO_ZERO", "CART_REMOVE_ONE_GROUP", "CART_REMOVE_LAST", "CART_EMPTY_AFTER_REMOVE", "CART_QUANTITY_DECREASE", "REMOVED_ITEMS_STAY_REMOVED"],
    CART_TOTAL: ["CART_TOTAL_CORRECT", "CART_REVIEW", "CART_BADGE_TRUTHFUL", "CART_BADGE_AGGREGATE", "CART_QUANTITY_DELTA", "CART_QUANTITY_CHANGE", "SHARED_CART_CONSISTENT", "LATEST_CART_PRESERVED"],
    ORDER_AWAITING_PAYMENT: ["GUEST_ORDER_CREATE", "ORDER_CREATED", "SINGLE_SERVER_ORDER_CREATED", "NO_DUPLICATE_ORDER_FROM_RETRY", "AWAITING_PAYMENT_TRUTHFUL", "MANUAL_PAYMENT_REQUIRED", "SERVER_CART_MATCH"],
    CASHIER_CONFIRM: ["STAFF_TEST_PAYMENT_CONFIRM", "CASHIER_PAYMENT_DIALOG_OPEN", "PAYMENT_NOT_ACKNOWLEDGED", "PAYMENT_CONFIRM_DISABLED", "PAYMENT_RECORDED_ONCE", "PAYMENT_DIALOG_STALE", "PAYMENT_CONFIRM_GUARDED"],
    ORDER_PREPARING: ["BARISTA_QUEUE_UPDATED", "BARISTA_ACTIVE_QUEUE_ONLY", "BARISTA_MARK_READY", "SEQUENTIAL_ACTIONS_ONLY"],
    ORDER_READY: ["BARISTA_MARK_READY", "STAFF_ISSUE", "CURRENT_PROGRESS_STEP", "GUEST_STATUS_UPDATED"],
    ORDER_ISSUED: ["STAFF_ISSUE", "BARISTA_ORDER_REMOVED", "NO_ISSUED_RESURRECTION", "GUEST_NEW_ORDER", "NEW_TICKET_IDENTITY"],
    GUEST_STATUS: ["GUEST_STATUS_UPDATED", "GUEST_STATUS_SYNCHRONIZED", "GUEST_AUTO_REFRESH", "GUEST_POLL", "GUEST_RELOAD", "GUEST_OFFLINE", "GUEST_ONLINE", "SERVER_STATUS_CHANGED"]
  };
  const stageAreas = {
    MENU_READY: ["menu", "smart"], PRODUCT_OPEN: ["menu", "photos"], CUSTOMIZE: ["menu", "cart"],
    SMART_PREFERENCES: ["smart"], SMART_OPTIONS: ["smart"],
    PHOTO_LOADING: ["photos", "performance"], PHOTO_READY: ["photos", "performance"], PHOTO_ERROR: ["photos", "offline"],
    CART_ADD: ["cart"], CART_REPLACE: ["cart"], CART_REMOVE: ["cart"], CART_TOTAL: ["cart"],
    CHECKOUT_ENOUGH: ["checkout"], STATIC_TICKET: ["checkout"], STATIC_CASHIER_VIEW: ["checkout"],
    ORDER_AWAITING_PAYMENT: ["checkout", "staff"], CASHIER_CONFIRM: ["staff", "auth"],
    ORDER_PREPARING: ["barista", "guest-status"], ORDER_READY: ["barista", "guest-status"],
    ORDER_ISSUED: ["barista", "guest-status"], GUEST_STATUS: ["guest-status", "recovery"]
  };
  let reviews = {};
  let activeNode = "CART_TOTAL";
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for (const [id, value] of Object.entries(saved.reviews || {})) {
      if (byId.has(id) && ["partial", "passed", "failed", "blocked"].includes(value.result) && typeof value.note === "string") reviews[id] = value;
    }
  } catch { $("review-message").textContent = "Локальное сохранение недоступно; экспорт JSON остаётся доступен."; }
  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function button(text, action, className = "small-button") {
    const item = element("button", className, text);
    item.type = "button"; item.addEventListener("click", action); return item;
  }
  function sensitive(text) {
    return /(?:[?&#](?:key|guestKey|token|password|ticket)=)[A-Za-z0-9_%.-]{24,}|Bearer\s+[A-Za-z0-9_-]{24,}/i.test(text);
  }
  function saveReviews() {
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, reviews })); }
    catch { $("review-message").textContent = "Не удалось сохранить отметки в браузере. Экспортируйте JSON перед закрытием."; }
    $("review-count").textContent = String(Object.keys(reviews).length);
  }
  function sectionList(title, values, ordered = false) {
    const section = element("section", "case-section"); section.append(element("h4", "", title));
    const list = element(ordered ? "ol" : "ul");
    values.forEach(text => list.append(element("li", "", text))); section.append(list); return section;
  }
  function causalButtons(title, ids) {
    const section = element("section", "case-section"); section.append(element("h4", "", title));
    const row = element("div", "tokens");
    ids.forEach(id => row.append(button(nodes.get(id)?.label || id, () => selectNode(id, true), "node-token")));
    section.append(row); return section;
  }
  function safeEvidence(value) {
    const path = typeof value === "string" ? value : value?.path || value?.url || value?.label || JSON.stringify(value);
    if (typeof path !== "string") return String(path);
    return path;
  }
  function evidenceList(values) {
    const list = element("ul", "evidence-list");
    values.forEach(value => {
      const text = safeEvidence(value);
      const li = element("li");
      // Evidence stays plain text: opening this report never reaches a remote
      // URL or accidentally opens a sensitive capability copied into a record.
      li.append(element("code", "", text)); list.append(li);
    }); return list;
  }
  function effectiveStatus(item) { return reviews[item.id]?.result || item.status; }
  function executionFor(item) {
    const evidence = item.executionEvidence || item;
    return { manualRunIds: evidence.manualRunIds || [], verifiedSubvariants: evidence.verifiedSubvariants || [],
      remainingVariants: evidence.remainingVariants || [], fullyCovered: evidence.fullyCovered === true };
  }
  function caseExecution(item) {
    const evidence = executionFor(item);
    if (!evidence.manualRunIds.length && !evidence.verifiedSubvariants.length && !evidence.remainingVariants.length) return null;
    const section = element("section", "case-execution");
    section.append(element("h4", "", "Фактическое покрытие сценария"));
    section.append(element("p", "origin-note", evidence.fullyCovered
      ? "В исходных данных отмечено полное покрытие. Подтверждающие RUN и проверенные условия перечислены ниже."
      : "Проверены только перечисленные условия. Частичный RUN не подтверждает весь сценарий и остальные варианты."));
    if (evidence.verifiedSubvariants.length) section.append(sectionList("Что проверено", evidence.verifiedSubvariants));
    if (evidence.remainingVariants.length) section.append(sectionList("Что осталось проверить", evidence.remainingVariants));
    if (evidence.manualRunIds.length) {
      section.append(element("h4", "", "Связанные ручные наблюдения"));
      const list = element("ul", "case-run-list");
      evidence.manualRunIds.forEach(id => {
        const record = data.runs.find(run => run.id === id);
        const li = element("li"); li.append(element("code", "", id));
        if (record) {
          li.append(element("strong", "", " · " + record.title), element("p", "", record.actual));
          if (record.environment) li.append(element("p", "muted", "Среда: " + (typeof record.environment === "string" ? record.environment : JSON.stringify(record.environment))));
          if (record.evidence?.length) li.append(evidenceList(record.evidence));
        }
        list.append(li);
      });
      section.append(list);
    }
    return section;
  }
  function renderCases() {
    const query = $("search").value.trim().toLocaleLowerCase("ru");
    const area = $("area").value, priority = $("priority").value, status = $("status").value;
    const shown = data.cases.filter(item => (!area || item.area === area) && (!priority || item.priority === priority) &&
      (!status || effectiveStatus(item) === status) && (!query || JSON.stringify(item).toLocaleLowerCase("ru").includes(query)));
    $("case-count").textContent = shown.length + " из " + data.cases.length;
    $("case-list").replaceChildren();
    if (!shown.length) $("case-list").append(element("p", "empty-filter", "Нет сценариев по выбранным фильтрам. Измените запрос или сбросьте фильтры."));
    shown.forEach(item => {
      const detail = element("details", "case");
      detail.id = "case-" + item.id;
      const summary = element("summary");
      const meta = element("span", "case-meta");
      meta.append(element("code", "", item.id), element("span", "priority " + item.priority.toLowerCase(), item.priority),
        element("span", "status " + effectiveStatus(item), labels[effectiveStatus(item)] || effectiveStatus(item)));
      summary.append(meta, element("span", "case-title", item.title), element("span", "area-name", item.area));
      const body = element("div", "case-body");
      body.append(element("p", "origin-note", "Исходный статус: " + (labels[item.status] || item.status) +
        (reviews[item.id] ? " · поверх него показана ваша отдельная отметка рецензента." : " · статус и связь с RUN записаны явно; успех наблюдения не означает полное покрытие.")));
      const grid = element("div", "case-grid");
      grid.append(sectionList("Перед началом", item.preconditions), sectionList("Шаги", item.steps, true),
        sectionList("Ожидаемый результат", item.expected), sectionList("Варианты прогона", item.variants),
        causalButtons("Причины / условия", item.causes), causalButtons("Эффекты / последствия", item.effects));
      body.append(grid);
      const execution = caseExecution(item); if (execution) body.append(execution);
      if (item.evidence.length) { body.append(element("h4", "", "Доказательства исходного кейса"), evidenceList(item.evidence)); }
      const review = element("div", "review-box");
      review.append(element("h4", "", "Отдельная отметка рецензента"));
      const statusLabel = element("label", "", "Моя оценка");
      const select = element("select"); select.setAttribute("aria-label", "Моя оценка " + item.id);
      for (const [value, title] of [["", "Не отмечено"], ["partial", "Частично проверен"], ["passed", "Пройден"], ["failed", "Ошибка"], ["blocked", "Заблокирован"]]) {
        const option = element("option", "", title); option.value = value; select.append(option);
      }
      select.value = reviews[item.id]?.result || ""; statusLabel.append(select);
      const noteLabel = element("label", "", "Фактический результат / ограничение");
      const note = element("textarea"); note.rows = 3; note.maxLength = 6000;
      note.placeholder = "Что произошло, где проверено, какая часть осталась непроверенной. Без паролей и гостевых ключей.";
      note.value = reviews[item.id]?.note || ""; noteLabel.append(note);
      const save = button("Сохранить мою отметку", () => {
        if (sensitive(note.value)) { $("review-message").textContent = "В заметке обнаружена похожая на секрет ссылка или токен. Удалите её перед сохранением."; return; }
        if (select.value && !note.value.trim()) { $("review-message").textContent = "Добавьте фактический результат: одной отметки недостаточно."; note.focus(); return; }
        if (!select.value) delete reviews[item.id];
        else reviews[item.id] = { result: select.value, note: note.value.trim(), updatedAt: new Date().toISOString(), source: "reviewer-local" };
        saveReviews(); $("review-message").textContent = "Отметка сохранена только в этом браузере и не изменяет исходный RUN или план.";
        renderCases();
        const updated = $("case-" + item.id); if (updated) { updated.open = true; updated.querySelector("summary").focus(); }
      }, "small-button solid");
      review.append(statusLabel, noteLabel, save); body.append(review); detail.append(summary, body); $("case-list").append(detail);
    });
  }
  function jumpToCase(id) {
    $("search").value = id; $("area").value = ""; $("priority").value = ""; $("status").value = "";
    renderCases(); const target = $("case-" + id);
    if (target) { target.open = true; target.scrollIntoView({ block: "start", behavior: "auto" }); target.querySelector("summary").focus(); }
  }
  function jumpToArea(area) {
    $("search").value = ""; $("priority").value = ""; $("status").value = ""; $("area").value = area;
    renderCases(); $("case-list").scrollIntoView({ block: "start", behavior: "auto" }); $("area").focus();
  }
  function edgeList(title, edges, incoming) {
    const section = element("section", "edge-section");
    section.append(element("h4", "", title + " · " + edges.length));
    if (!edges.length) section.append(element("p", "muted", "Связей в этом направлении нет."));
    edges.forEach(edge => {
      const block = element("article", "edge");
      const other = incoming ? edge.from : edge.to;
      block.append(button((incoming ? "Из: " : "К: ") + (nodes.get(other)?.label || other), () => selectNode(other), "edge-link"));
      block.append(element("p", "origin-note", edge.evidenceType === "test-expectation"
        ? "Ожидание тест-кейса · не доказательство выполнения"
        : "Связь исходного графа · статус выполнения смотрите в RUN"));
      const dl = element("dl");
      for (const [term, value] of [["Условие", edge.condition], ["Что видно", edge.observable], ["Не должно нарушаться", edge.invariant]]) {
        dl.append(element("dt", "", term), element("dd", "", value));
      }
      block.append(dl);
      if (edge.caseIds?.length) {
        const references = element("div", "tokens");
        edge.caseIds.forEach(id => references.append(button(id, () => jumpToCase(id), "node-token")));
        block.append(references);
        edge.caseIds.forEach(id => {
          const test = byId.get(id);
          if (!test) return;
          const expectation = element("details", "expectation-detail");
          expectation.append(element("summary", "", id + " · полные условия и ожидания"),
            element("p", "origin-note", "Все предусловия этого кейса должны выполняться одновременно (AND). Причина из ссылки сама по себе не гарантирует эффект."),
            sectionList("Все предусловия (AND)", test.preconditions), sectionList("Действия по порядку", test.steps, true),
            sectionList("Ожидаемый наблюдаемый результат", test.expected));
          block.append(expectation);
        });
      }
      section.append(block);
    }); return section;
  }
  function selectNode(id, scroll = false) {
    if (!nodes.has(id)) return;
    activeNode = id; $("node-select").value = id;
    const item = nodes.get(id), panel = $("node-detail");
    panel.replaceChildren();
    panel.append(element("p", "eyebrow", item.supplemental ? "Условие / эффект тестового сценария" : (actorLabels[item.actor] || item.actor) + " · " + item.kind),
      element("h3", "", item.label), element("code", "node-id", item.id));
    if (item.supplemental) panel.append(element("p", "supplemental-note",
      "Дополнительный узел из ссылок тест-кейсов. Его связи описывают ожидаемое cause → effect при выполнении всех условий сценария. Это проектное ожидание, а не подтверждённый переход приложения."));
    const references = data.cases.filter(test => test.causes.includes(id) || test.effects.includes(id));
    const links = element("div", "tokens");
    references.forEach(test => links.append(button(test.id, () => jumpToCase(test.id), "node-token")));
    panel.append(element("h4", "", "Точные совпадения причинного ID · " + references.length), links);
    const aliases = new Set(stageAliases[id] || []);
    const related = data.cases.filter(test => !references.includes(test) && [...test.causes, ...test.effects].some(key => aliases.has(key)));
    if (related.length) {
      const relatedLinks = element("div", "tokens");
      related.forEach(test => relatedLinks.append(button(test.id + " · " + test.title, () => jumpToCase(test.id), "node-token")));
      panel.append(element("h4", "", "Другие сценарии этого этапа · " + related.length),
        element("p", "origin-note", "Группировка для навигации QA по смыслу условий. Она не добавляет переходы приложения и не подтверждает выполнение."), relatedLinks);
    }
    if (stageAreas[id]?.length) {
      const areas = element("div", "tokens");
      stageAreas[id].forEach(area => areas.append(button("Все сценарии области «" + area + "»", () => jumpToArea(area), "node-token")));
      panel.append(areas);
    }
    const columns = element("div", "edge-columns");
    columns.append(edgeList("Входящие", data.graph.edges.filter(edge => edge.to === id), true),
      edgeList("Исходящие", data.graph.edges.filter(edge => edge.from === id), false));
    panel.append(columns);
    document.querySelectorAll("[data-node]").forEach(item => item.classList.toggle("selected-node", item.getAttribute("data-node") === id));
    if (scroll) $("causal-section").scrollIntoView({ block: "start", behavior: "auto" });
  }
  function renderRecords(key, target, title) {
    const records = data[key]; if (!records.length) return;
    $(target).hidden = false;
    $(target).querySelector("h2").textContent = title;
    const list = $(target).querySelector(".record-list");
    records.forEach(record => {
      const detail = element("details", "record");
      const summary = element("summary");
      const retest = record.resolvedBy && data.runs.concat(data.checks).find(item => item.id === record.resolvedBy && item.result === "passed");
      summary.append(element("code", "", record.id), element("span", "status " + record.result, retest ? "Исправлено · исторический сбой" : labels[record.result]),
        element("strong", "", record.title));
      const body = element("div", "record-body");
      body.append(element("p", "", record.actual));
      if (retest) body.append(element("p", "", "Исправление подтверждено успешным повтором: " + retest.id + " · " + retest.title));
      if (record.environment) body.append(element("p", "muted", "Среда: " + (typeof record.environment === "string" ? record.environment : JSON.stringify(record.environment))));
      if (record.area) body.append(element("p", "muted", "Область: " + record.area));
      if (record.evidence?.length) body.append(evidenceList(record.evidence));
      detail.append(summary, body); list.append(detail);
    });
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = element("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("export").addEventListener("click", () => {
    const result = { ...data, exportedAt: new Date().toISOString(), reviewerMarks: reviews };
    const text = JSON.stringify(result, null, 2);
    if (sensitive(text)) { $("review-message").textContent = "Экспорт остановлен: удалите секретные ссылки или токены из заметок."; return; }
    download("robys-qa-results.json", text, "application/json;charset=utf-8");
  });
  $("export-graph").addEventListener("click", () => download("robys-cause-effect.mmd", graphMermaid(data.graph, data.cases), "text/plain;charset=utf-8"));
  $("clear-reviews").addEventListener("click", () => {
    if (!confirm("Удалить только ваши локальные отметки этого QA-отчёта? Исходные кейсы и RUN останутся.")) return;
    reviews = {}; try { localStorage.removeItem(storageKey); } catch {}
    saveReviews(); renderCases(); $("review-message").textContent = "Локальные отметки очищены.";
  });
  $("print").addEventListener("click", () => {
    const states = [...document.querySelectorAll("details")].map(item => [item, item.open]);
    states.forEach(([item]) => { item.open = true; });
    window.addEventListener("afterprint", () => states.forEach(([item, open]) => { item.open = open; }), { once: true });
    window.print();
  });
  const areas = [...new Set(data.cases.map(item => item.area))].sort();
  areas.forEach(area => { const option = element("option", "", area); option.value = area; $("area").append(option); });
  ["search", "area", "priority", "status"].forEach(id => $(id).addEventListener(id === "search" ? "input" : "change", renderCases));
  $("reset").addEventListener("click", () => { ["search", "area", "priority", "status"].forEach(id => { $(id).value = ""; }); renderCases(); });
  for (const supplemental of [false, true]) {
    const group = element("optgroup"); group.label = supplemental ? "Дополнительные условия из кейсов" : "Причинный граф приложения";
    data.graph.nodes.filter(item => Boolean(item.supplemental) === supplemental).forEach(item => {
      const option = element("option", "", item.label + " · " + item.id); option.value = item.id; group.append(option);
    });
    if (group.children.length) $("node-select").append(group);
  }
  $("node-select").addEventListener("change", () => selectNode($("node-select").value));
  document.querySelectorAll("[data-node]").forEach(item => {
    item.addEventListener("click", () => selectNode(item.getAttribute("data-node")));
    item.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectNode(item.getAttribute("data-node")); } });
  });
  renderRecords("runs", "manual-runs", "Что действительно проверено вручную");
  renderRecords("checks", "automated-checks", "Автоматические проверки");
  $("review-count").textContent = String(Object.keys(reviews).length);
  renderCases(); selectNode(activeNode);
}

function graphMermaid(graph, cases) {
  const mermaidText = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("|", "&#124;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", " ");
  const mmd = ["flowchart TD", "%% Exact graph export; metadata and referenced full cases preserve causal semantics.",
    "%% test-expectation means ALL preconditions (AND), then case steps, then expected observations. It is not runtime proof."];
  const mermaidIds = new Map(graph.nodes.map((node, index) => [node.id, "n" + index]));
  for (const item of cases) mmd.push("%% case " + JSON.stringify(item));
  for (const node of graph.nodes) {
    mmd.push("%% node " + JSON.stringify(node));
    const label = mermaidText(node.id + " · " + node.label);
    mmd.push("  " + mermaidIds.get(node.id) + (node.kind === "decision" ? '{"' + label + '"}' : '["' + label + '"]'));
    if (node.supplemental) mmd.push("  class " + mermaidIds.get(node.id) + " supplemental");
  }
  for (const edge of graph.edges) {
    mmd.push("%% edge " + JSON.stringify(edge));
    const expectation = edge.evidenceType === "test-expectation";
    const label = expectation ? "Ожидание " + edge.caseIds.join(", ") : edge.condition;
    mmd.push("  " + mermaidIds.get(edge.from) + (expectation ? ' -.->|"' : ' -->|"') + mermaidText(label) + '"| ' + mermaidIds.get(edge.to));
  }
  mmd.push("  classDef supplemental fill:#fffdf9,stroke:#756b67,stroke-dasharray:4 3");
  return mmd.join("\n") + "\n";
}

async function generate() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const crypto = await import("node:crypto");
  const url = await import("node:url");
  const base = url.fileURLToPath(new URL("../qa/manual-regression/", import.meta.url));
  const generatorPath = path.relative(process.cwd(), url.fileURLToPath(import.meta.url)).split(path.sep).join("/");
  const caseFiles = ["customer-cases.json", "counter-cases.json", "site-cases.json"];
  const missingSources = [];
  const read = (name, optional = false) => {
    const file = path.join(base, name);
    if (!fs.existsSync(file)) { if (!optional) missingSources.push(name); return null; }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const sourceCases = caseFiles.flatMap(file => {
    const value = read(file);
    if (!value) return [];
    const records = Array.isArray(value) ? value : value.cases;
    if (!Array.isArray(records)) throw new Error(file + ": expected cases array");
    return records.map(item => ({ ...item, sourceFile: file }));
  });
  const sourceGraph = read("causal-graph.json");
  if (!sourceGraph || !Array.isArray(sourceGraph.nodes) || !Array.isArray(sourceGraph.edges)) throw new Error("causal-graph.json: missing graph");
  const normalizeRecords = (name, field) => {
    const value = read(name, true);
    if (!value) return [];
    const records = Array.isArray(value) ? value : value[field];
    if (!Array.isArray(records)) throw new Error(name + ": expected an array or {" + field + ":[...]}");
    return records.map(item => {
      if (!item || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.actual !== "string" ||
        !["passed", "failed", "blocked"].includes(item.result)) throw new Error(name + ": invalid record schema");
      if (item.evidence !== undefined && !Array.isArray(item.evidence)) throw new Error(name + ": evidence must be an array");
      return { ...item, evidence: item.evidence || [] };
    });
  };
  const runs = normalizeRecords("runs.json", "runs");
  const checks = normalizeRecords("checks.json", "checks");
  const sourceReviewSummary = read("review-summary.json", true);
  let reviewSummary = null;
  if (sourceReviewSummary !== null) {
    const text = (value, label, maximum) => {
      if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error("review-summary.json: invalid " + label);
      return value.trim();
    };
    if (!sourceReviewSummary || typeof sourceReviewSummary !== "object" || Array.isArray(sourceReviewSummary)) throw new Error("review-summary.json: expected an object");
    const date = text(sourceReviewSummary.date, "date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("review-summary.json: invalid calendar date");
    if (!Array.isArray(sourceReviewSummary.fixed) || !sourceReviewSummary.fixed.length || sourceReviewSummary.fixed.length > 100) throw new Error("review-summary.json: expected fixed array");
    if (!Array.isArray(sourceReviewSummary.limitations) || sourceReviewSummary.limitations.some(value => typeof value !== "string")) throw new Error("review-summary.json: expected limitations array");
    const knownRecords = new Set([...runs, ...checks].map(record => record.id));
    reviewSummary = {
      date, title: text(sourceReviewSummary.title, "title", 300), scope: text(sourceReviewSummary.scope, "scope", 6000),
      fixed: sourceReviewSummary.fixed.map((item, index) => {
        if (!item || typeof item !== "object" || !Array.isArray(item.verifiedBy) || !item.verifiedBy.length || item.verifiedBy.some(id => typeof id !== "string" || !/^(?:RUN|AUTO)-\d+$/.test(id) || !knownRecords.has(id))) throw new Error("review-summary.json: invalid verifiedBy for fix " + (index + 1));
        return { title: text(item.title, "fix title " + (index + 1), 1000), verifiedBy: [...new Set(item.verifiedBy)] };
      }),
      limitations: sourceReviewSummary.limitations.map((value, index) => text(value, "limitation " + (index + 1), 3000))
    };
  }
  function rejectSecrets(value, at = "input") {
    if (typeof value === "string") {
      if (/(?:[?&#](?:key|guestKey|token|password|ticket)=)[A-Za-z0-9_%.-]{24,}|Bearer\s+[A-Za-z0-9_-]{24,}/i.test(value)) {
        throw new Error("Sensitive URL/token detected at " + at + "; redact before generating.");
      }
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(value)) throw new Error("Private key detected at " + at);
      return;
    }
    if (Array.isArray(value)) { value.forEach((item, index) => rejectSecrets(item, at + "[" + index + "]")); return; }
    if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
      if (/^(?:password|guestKey|guest_key|sessionToken|csrfToken|authorization)$/i.test(key) && item) throw new Error("Secret-bearing field at " + at + "." + key);
      rejectSecrets(item, at + "." + key);
    }
  }
  function unique(items, label) {
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(item.id) || ids.has(item.id)) throw new Error(label + ": invalid/duplicate ID");
      ids.add(item.id);
    }
    return ids;
  }
  const caseIds = unique(sourceCases, "cases"); unique(runs, "runs"); unique(checks, "checks");
  for (const item of sourceCases) {
    if (typeof item.title !== "string" || typeof item.area !== "string" || !["P0", "P1", "P2"].includes(item.priority) ||
      !["planned", "partial", "passed", "failed", "blocked"].includes(item.status)) throw new Error(item.id + ": invalid case");
    for (const key of ["preconditions", "steps", "expected", "causes", "effects", "variants", "evidence"]) {
      if (!Array.isArray(item[key]) || (key !== "evidence" && item[key].some(value => typeof value !== "string"))) throw new Error(item.id + ": invalid " + key);
    }
    const execution = item.executionEvidence || item;
    for (const key of ["manualRunIds", "verifiedSubvariants", "remainingVariants"]) {
      if (execution[key] !== undefined && (!Array.isArray(execution[key]) || execution[key].some(value => typeof value !== "string"))) throw new Error(item.id + ": invalid execution " + key);
    }
    if (execution.fullyCovered !== undefined && typeof execution.fullyCovered !== "boolean") throw new Error(item.id + ": invalid fullyCovered");
    if (execution.manualRunIds?.some(id => !runs.some(run => run.id === id))) throw new Error(item.id + ": unknown manual RUN reference");
    if (item.status === "partial" && execution.fullyCovered === true) throw new Error(item.id + ": partial case cannot claim full coverage");
  }
  const graph = structuredClone(sourceGraph);
  const graphIds = unique(graph.nodes, "graph");
  const originalNodeCount = graph.nodes.length;
  const originalEdgeCount = graph.edges.length;
  const supplementalLabels = {
    MENU_CHECKOUT: "Оформление из полного меню", TICKET_CANONICAL: "Канонический состав билета",
    COUNTER_ENABLED: "Включён сервер общей очереди", ORDER_CREATED: "Создан серверный заказ",
    QUOTE_IMMUTABLE: "Состав и расчёт созданного заказа зафиксированы", QUICK_ORDER_EDITED: "Подтверждено редактирование быстрого заказа",
    REMOVED_ITEMS_STAY_REMOVED: "Удалённые позиции не возвращаются", SESSION_EXPIRED: "Сессия сотрудника истекла"
  };
  for (const item of sourceCases) for (const id of [...item.causes, ...item.effects]) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(item.id + ": invalid causal ID");
    if (!graphIds.has(id)) {
      graphIds.add(id);
      graph.nodes.push({ id, label: supplementalLabels[id] || "Условие / эффект: " + id.replaceAll("_", " ").toLowerCase(),
        actor: "system", kind: "state", supplemental: true });
    }
  }
  // These edges retain the planned cases' causal references. They describe
  // an expectation under all case preconditions, never an observed runtime fact.
  for (const item of sourceCases) {
    if (!item.causes.length || !item.effects.length || !item.steps.length || !item.expected.length) {
      throw new Error(item.id + ": causal expectation needs causes, effects, steps and expected results");
    }
    for (const from of new Set(item.causes)) for (const to of new Set(item.effects)) {
      graph.edges.push({ from, to, evidenceType: "test-expectation", caseIds: [item.id],
        condition: "AND: все предусловия кейса, затем его шаги",
        observable: "Ожидаемые результаты кейса",
        invariant: "Ожидание, не факт выполнения" });
    }
  }
  for (const node of graph.nodes) {
    if (typeof node.label !== "string" || !["guest", "cashier", "barista", "system"].includes(node.actor) ||
      !["intent", "action", "state", "decision"].includes(node.kind)) throw new Error("Invalid graph node " + node.id);
  }
  for (const edge of graph.edges) {
    if (!graphIds.has(edge.from) || !graphIds.has(edge.to) || ["condition", "observable", "invariant"].some(key => typeof edge[key] !== "string" || !edge[key])) throw new Error("Invalid graph edge");
    if (edge.evidenceType === "test-expectation" && (!Array.isArray(edge.caseIds) || !edge.caseIds.length || edge.caseIds.some(id => !caseIds.has(id)))) throw new Error("Invalid expectation case reference");
  }
  const linkedIds = new Set(graph.edges.flatMap(edge => [edge.from, edge.to]));
  if (graph.nodes.some(node => node.supplemental && !linkedIds.has(node.id))) throw new Error("Unlinked supplemental graph node");
  rejectSecrets({ cases: sourceCases, graph, runs, checks, reviewSummary });
  const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const mermaid = graphMermaid(graph, sourceCases);
  const stamp = new Date().toISOString();
  const localStamp = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(stamp)).replace(",", "") + " (МСК)";
  const counts = records => records.reduce((result, item) => { result[item.result]++; return result; }, { passed: 0, failed: 0, blocked: 0 });
  const caseStatuses = sourceCases.reduce((result, item) => { result[item.status]++; return result; }, { planned: 0, partial: 0, passed: 0, failed: 0, blocked: 0 });
  const manifest = {
    schemaVersion: 1, generatedAt: stamp,
    sourceFiles: caseFiles.filter(file => !missingSources.includes(file)).concat(["causal-graph.json"], runs.length ? ["runs.json"] : [], checks.length ? ["checks.json"] : [], reviewSummary ? ["review-summary.json"] : []),
    missingSources, environment: { baseUrl: "http://127.0.0.1:8790", isolatedDatabase: true, liveUserServerTouched: false,
      cashierOrigin: "http://127.0.0.1:8790", baristaOrigin: "http://localhost:8790",
      roleExecution: "Кассир использует 127.0.0.1:8790, бариста localhost:8790. Это одна QA-БД, но разные cookie-сессии. QR с origin кассира принимается только на 127.0.0.1:8790.",
      limitations: ["Эмуляция ширины не подтверждает физический телефон.", "Камера QR не считается проверенной без отдельного RUN.", "RUN-точка не равна выполнению всего запланированного кейса."] },
    counts: { cases: sourceCases.length, sourcePlanned: caseStatuses.planned, sourcePartial: caseStatuses.partial, caseStatuses,
      runs: runs.length, runResults: counts(runs), checks: checks.length, checkResults: counts(checks), originalGraphNodes: originalNodeCount,
      originalGraphEdges: originalEdgeCount, supplementalNodes: graph.nodes.length - originalNodeCount,
      expectationEdges: graph.edges.length - originalEdgeCount, edges: graph.edges.length },
    cases: sourceCases, runs, checks, graph, ...(reviewSummary ? { reviewSummary } : {})
  };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ cases: sourceCases, graph })).digest("hex").slice(0, 12);
  manifest.catalogRevision = fingerprint;
  const resolvedCount = records => records.filter(item => item.result === "failed" && records.some(retest => retest.id === item.resolvedBy && retest.result === "passed")).length;
  const countDescription = records => { const c = counts(records); return c.passed + " пройдено · ошибки в журнале: " + c.failed + ", устранены: " + resolvedCount(records) + " · ограничения прогона: " + c.blocked; };
  const caseSummary = caseStatuses.planned + " ещё запланировано · " + caseStatuses.partial + " частично проверено · " + caseStatuses.passed + " полностью пройдено · " + caseStatuses.failed + " с ошибкой · " + caseStatuses.blocked + " заблокировано";
  const runSummary = runs.length ? counts(runs).passed + " контрольных наблюдений пройдено; ограничения прогона: " + counts(runs).blocked + ". Ошибки в журнале: " + counts(runs).failed + "; устранены успешным повтором: " + resolvedCount(runs) + ". Покрытие полных сценариев: " + caseSummary + "." : "Результаты ручного прогона пока не приложены. Покрытие сценариев: " + caseSummary + ".";
  const summaryDate = reviewSummary?.date.split("-").reverse().join(".");
  const fixedCount = reviewSummary?.fixed.length || 0;
  const fixedNoun = fixedCount % 100 >= 11 && fixedCount % 100 <= 14 ? "ошибок" : fixedCount % 10 === 1 ? "ошибка" : fixedCount % 10 >= 2 && fixedCount % 10 <= 4 ? "ошибки" : "ошибок";
  const summaryHtml = reviewSummary ? `<details class="review-summary"><summary><strong>Исправлено ${fixedCount} ${fixedNoun} · <time datetime="${esc(reviewSummary.date)}">${esc(summaryDate)}</time></strong><span>Исправления, проверки и границы прогона</span></summary><div class="review-summary-body"><h3>${esc(reviewSummary.title)}</h3><p>${esc(reviewSummary.scope)}</p><ol>${reviewSummary.fixed.map(item => `<li><strong>${esc(item.title)}</strong><p class="verified-by">Проверки: ${item.verifiedBy.map(id => `<code>${esc(id)}</code>`).join(", ")}</p></li>`).join("")}</ol>${reviewSummary.limitations.length ? `<h4>Что требует отдельной проверки</h4><ul>${reviewSummary.limitations.map(value => `<li>${esc(value)}</li>`).join("")}</ul>` : ""}</div></details>` : "";
  const svgNode = (id, x, y, width, title, subtitle) => `<g role="button" tabindex="0" data-node="${id}" aria-label="${esc(title)} — открыть причины и последствия"><rect x="${x}" y="${y}" width="${width}" height="64" rx="12"/><text x="${x + 14}" y="${y + 26}" class="flow-title">${esc(title)}</text><text x="${x + 14}" y="${y + 47}" class="flow-subtitle">${esc(subtitle)}</text></g>`;
  const flow = `<svg viewBox="0 0 1120 415" xmlns="http://www.w3.org/2000/svg" aria-labelledby="flow-title flow-desc" role="img">
<title id="flow-title">Путь от выбора до выдачи</title><desc id="flow-desc">Компактная схема главных решений. Статический QR отделён от серверного заказа. Все узлы доступны в списке ниже.</desc>
<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="#756b67" stroke-width="1.4"/></marker></defs>
<g class="flow-lines" fill="none" stroke="#756b67" stroke-width="1.5" marker-end="url(#arrow)">
<path d="M180 49 H225"/><path d="M385 49 H430"/><path d="M590 49 H635"/>
<path d="M730 81 V113 H140 V174"/><path d="M730 113 V174"/>
<path d="M240 206 H290"/><path d="M820 206 H870"/>
<path d="M975 238 V270 H680 V305"/><path d="M750 337 H775"/><path d="M915 337 H940"/>
</g>
${svgNode("MENU_READY",20,17,160,"Выбрать","Меню / помощник")}
${svgNode("CUSTOMIZE",225,17,160,"Настроить","Вкус · пара · число")}
${svgNode("CART_TOTAL",430,17,160,"Проверить","Состав и сумма")}
${svgNode("CHECKOUT_ENOUGH",635,17,190,"Достаточно?","Оформить заказ")}
<text x="40" y="155" class="lane-label">СТАТИЧЕСКИЙ QR · БЕЗ СЕРВЕРНЫХ СТАТУСОВ</text>
${svgNode("STATIC_TICKET",40,174,200,"QR-состав","Показать на кассе")}
${svgNode("STATIC_CASHIER_VIEW",290,174,240,"Прочитать / напечатать","Не подтверждает оплату")}
<text x="610" y="155" class="lane-label">ЛОКАЛЬНЫЙ СЕРВЕР · ОБЩАЯ ОЧЕРЕДЬ</text>
${svgNode("ORDER_AWAITING_PAYMENT",610,174,210,"Ожидает оплаты","Стабильный номер")}
${svgNode("CASHIER_CONFIRM",870,174,210,"Кассир подтвердил","Оплата получена")}
${svgNode("ORDER_PREPARING",610,305,140,"Готовится","Очередь бариста")}
${svgNode("ORDER_READY",775,305,140,"Готов","Можно забирать")}
${svgNode("ORDER_ISSUED",940,305,140,"Выдан","Заказ завершён")}
<text x="610" y="398" class="flow-subtitle">У гостя статус обновляется по подтверждённым ответам сервера.</text>
</svg>`;
  const css = `
:root{--cream:#f4f1ec;--paper:#fffdf9;--ink:#2f2725;--coffee:#241c1b;--muted:#716762;--line:#dfd6ce;--ruby:#bd1820;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--cream);color-scheme:light}
.header-row .run-summary{margin-top:14px;color:#fffdf9;font-weight:700;font-size:14px}.logbook{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px}.logbook>summary{cursor:pointer;font-weight:700;font-size:18px}.logbook>summary span{display:block;font-size:12px;color:var(--muted);font-weight:400;margin-top:5px}.logbook>.section{margin-top:22px}.expectation-detail{font-size:13px;margin:10px 0}.expectation-detail>summary{cursor:pointer;color:var(--ruby)}.expectation-detail .case-section{margin:12px 0}
*{box-sizing:border-box}body{margin:0;line-height:1.5}button,input,select,textarea{font:inherit}button,a,input,select,textarea{outline-offset:4px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible,svg g:focus-visible{outline:3px solid var(--ruby)}
a{color:var(--ruby)}button{cursor:pointer}button,input,select{min-height:42px}button{border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);padding:8px 12px;font-weight:700}button:hover{border-color:var(--ruby)}button.solid{background:var(--ruby);border-color:var(--ruby);color:white}
header{background:var(--coffee);color:var(--paper);padding:30px max(24px,calc((100vw - 1280px)/2))}.brand{font-size:14px;letter-spacing:.13em;font-weight:800}.header-row{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.header-row h1{font-size:clamp(28px,4vw,44px);line-height:1.12;letter-spacing:-.035em;margin:18px 0 12px}.header-row p{max-width:760px;margin:0;color:#e1d4c9}.revision{font:12px monospace;color:#cbb9aa;white-space:nowrap;margin-top:20px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.toolbar button{background:#fffdf9;color:var(--coffee)}main{max-width:1328px;margin:auto;padding:26px 24px 70px}h2{font-size:25px;letter-spacing:-.02em;line-height:1.25;margin:0 0 14px}h3{font-size:21px;margin:7px 0 10px}h4{font-size:14px;margin:0 0 8px}p{margin:0 0 14px}.muted,.origin-note{color:var(--muted)}.eyebrow{font-size:11px;letter-spacing:.11em;font-weight:800;text-transform:uppercase;color:var(--ruby);margin:0}.summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;border-bottom:1px solid var(--line);margin-bottom:18px}.metric{padding:0 22px 24px 0}.metric+.metric{padding-left:22px;border-left:1px solid var(--line)}.metric strong{display:block;font-size:37px;line-height:1.1;margin:0 0 8px;letter-spacing:-.04em}.metric span{font-size:14px;font-weight:700}.metric small{display:block;color:var(--muted);font-size:12px;margin-top:7px}.truth-note{border-left:4px solid var(--ruby);background:var(--paper);padding:14px 18px;margin:20px 0 30px;font-size:14px}.source-warning{color:#763d08;background:#fff2d9;padding:12px 16px;border-radius:9px}.section{margin-top:42px}.section-intro{max-width:940px;color:var(--muted)}.flow-wrap{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:14px;overflow-x:auto}.flow-wrap svg{display:block;width:100%;min-width:760px}.flow-wrap rect{fill:#fffdf9;stroke:#d3c5b8;stroke-width:1.5}.flow-wrap [data-node]{cursor:pointer}.flow-wrap [data-node]:hover rect,.flow-wrap .selected-node rect{stroke:var(--ruby);fill:#fff0e9;stroke-width:2}.flow-title{font:700 16px Arial;fill:var(--ink)}.flow-subtitle{font:12px Arial;fill:var(--muted)}.lane-label{font:700 10px Arial;fill:var(--ruby);letter-spacing:.4px}.doubt-branches{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px}.graph-select label{font-weight:700;display:grid;gap:8px}.graph-select select{width:100%;max-width:100%;background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:9px 12px}.graph-detail{background:var(--paper);border:1px solid var(--line);border-radius:14px;margin-top:14px;padding:24px}.node-id{display:block;font-size:12px;color:var(--muted);margin-bottom:18px;overflow-wrap:anywhere}.supplemental-note{border-left:3px dashed var(--muted);padding-left:12px;color:var(--muted);font-size:13px}.tokens{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px}.node-token{font-size:12px;min-height:34px;padding:6px 9px;font-weight:400;background:#f4eee5;border-color:transparent;text-align:left;overflow-wrap:anywhere}.edge-columns{display:grid;grid-template-columns:1fr 1fr;gap:28px}.edge-section{min-width:0}.edge{padding:14px 0;border-top:1px solid var(--line)}.edge-link{font-size:14px;text-align:left;border:none;background:none;padding:0;color:var(--ruby)}dl{margin:6px 0 0}dt{font-size:11px;font-weight:800;text-transform:uppercase;margin-top:10px;color:var(--muted)}dd{margin:2px 0 0;font-size:13px;overflow-wrap:anywhere}
.filters{display:grid;grid-template-columns:2.3fr 1.2fr .8fr 1.1fr auto;gap:10px;align-items:end;padding:16px;background:var(--paper);border:1px solid var(--line);border-radius:12px}.filters label{font-size:12px;font-weight:700;display:grid;gap:6px;min-width:0}.filters input,.filters select{width:100%;min-width:0;border:1px solid #c8b9ab;border-radius:8px;background:white;padding:8px}.case-count{font-size:13px;color:var(--muted);margin:14px 0}.case{border-top:1px solid #d1c3b8;background:transparent}.case:last-child{border-bottom:1px solid #d1c3b8}.case>summary{display:grid;grid-template-columns:245px 1fr 140px;align-items:start;gap:16px;list-style:none;cursor:pointer;padding:18px 10px}.case>summary::before{content:none}.case-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:12px}.case-meta code{font-weight:700}.case-title{font-weight:700;line-height:1.4}.case[open]{background:var(--paper)}.case[open] .case-title{color:var(--ruby)}.area-name{text-align:right;font-size:11px;color:var(--muted);overflow-wrap:anywhere}.priority,.status{font-size:11px;line-height:1.3;padding:4px 6px;border-radius:4px;white-space:nowrap}.priority{border:1px solid #c8b9ab}.p0{font-weight:800;color:var(--ruby)}.status{background:#e9e2d9;color:#4c443d}.status.passed{background:#e2eddf;color:#285331}.status.failed{background:#f9dfd9;color:#8c211f}.status.blocked{background:#f6eacb;color:#67460c}.case-body{padding:0 24px 22px}.origin-note{font-size:12px;border-top:1px solid var(--line);padding-top:12px}.case-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 32px}.case-section{min-width:0}.case-section ul,.case-section ol{padding-left:21px;font-size:14px;margin:0}.case-section li{margin:0 0 7px;overflow-wrap:anywhere}.case-section .tokens{margin:0}.review-box{margin-top:22px;padding:18px;border:1px dashed #b9a99b;border-radius:10px;background:#f4eee5;display:grid;grid-template-columns:180px 1fr;gap:12px}.review-box h4{grid-column:1/-1}.review-box label{display:grid;align-content:start;gap:7px;font-size:12px;font-weight:700}.review-box select,.review-box textarea{width:100%;border:1px solid #b9a99b;border-radius:7px;padding:8px;background:white}.review-box button{width:max-content;grid-column:1/-1}.review-controls{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:16px}.review-controls p{margin:0;font-size:13px;color:var(--muted)}.record{border-top:1px solid var(--line)}.record summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;cursor:pointer;padding:15px 4px}.record code{font-size:12px}.record-body{padding:0 20px 18px;font-size:14px}.evidence-list{padding-left:20px}.evidence-list code{font-size:11px;overflow-wrap:anywhere}.isolation{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-top:1px solid var(--line);padding-top:22px}.isolation p,.isolation li{font-size:13px;color:var(--muted)}.isolation ul{padding-left:18px}.empty-filter{padding:20px;background:var(--paper)}footer{padding:24px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);text-align:center}[hidden]{display:none!important}
@media(max-width:850px){.summary-grid{grid-template-columns:1fr 1fr}.metric:nth-child(3){border-left:0;padding-left:0}.metric{padding-top:12px}.case>summary{grid-template-columns:1fr}.case-meta{gap:8px}.area-name{text-align:left}.filters{grid-template-columns:1fr 1fr}.filters label:first-child{grid-column:1/-1}.edge-columns,.case-grid,.isolation{grid-template-columns:1fr}.header-row{display:block}.revision{margin-top:14px}.review-box{grid-template-columns:1fr}.review-box>*{grid-column:1!important}}
@media(max-width:480px){header{padding:24px 16px}main{padding:22px 14px 50px}.metric{padding-right:10px}.metric+.metric{padding-left:10px}.metric:nth-child(3){padding-left:0}.metric strong{font-size:30px}.filters{padding:12px;gap:8px}.graph-detail{padding:16px}.case-body{padding:0 14px 18px}.toolbar button{flex:1 1 auto}.summary-grid span{font-size:12px}.case>summary{padding-inline:4px}}
@media print{body{background:white;color:black;font-size:10pt}header{background:white;color:black;padding:0 0 16px;border-bottom:2px solid black}.header-row p{color:#333}main{padding:16px 0;max-width:none}.toolbar,.filters,.review-box,.review-controls,.doubt-branches,#export-graph,.graph-select{display:none!important}.metric strong{font-size:25px}.summary-grid{break-inside:avoid}.case,.record{break-inside:auto}.case>summary,.record summary{break-after:avoid}.case-body{padding:0 8px 10px}.case-grid{display:block}.case-section{margin:14px 0;break-inside:avoid}.flow-wrap{overflow:visible;border:0;padding:0}.flow-wrap svg{min-width:0;width:100%}.graph-detail{break-inside:auto}.edge-columns{display:block}.edge{break-inside:avoid}.node-token{border:0;background:none;padding:1px;min-height:0}.section{margin-top:28px}footer{padding:10px}details>summary{list-style:none}.review-message{display:none}a{color:black;text-decoration:none}}
`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow"><title>Roby's · Карта ручной регрессии</title><style>${css}
.status.partial{background:#e5eafb;color:#253c77}.case-execution{margin-top:22px;padding:18px;border:1px solid var(--line);border-left:4px solid #506da8;border-radius:8px;background:#f4f6fc}.case-execution>.case-section{margin-top:16px}.case-run-list{padding-left:20px;font-size:13px}.case-run-list li{margin-bottom:16px;overflow-wrap:anywhere}.case-run-list p{margin:5px 0}.case-run-list code{font-size:12px}
.review-summary{margin:0 0 18px;border:1px solid var(--line);border-radius:10px;background:var(--paper)}.review-summary>summary{cursor:pointer;padding:13px 16px;font-size:14px;min-height:46px}.review-summary>summary::marker{color:var(--ruby)}.review-summary>summary span{display:inline-block;margin-left:14px;font-size:12px;color:var(--muted)}.review-summary-body{padding:4px 18px 18px;font-size:14px}.review-summary-body h3{font-size:18px}.review-summary-body ol,.review-summary-body ul{padding-left:22px}.review-summary-body li{margin:0 0 12px;overflow-wrap:anywhere}.review-summary-body .verified-by{margin:4px 0 0;font-size:12px;color:var(--muted)}.verified-by code{font-size:11px}@media(max-width:480px){.review-summary>summary span{display:block;margin:5px 0 0 16px}.review-summary-body{padding-inline:14px}}
</style></head><body>
<header><div class="brand">ROBY'S · QUALITY REVIEW</div><div class="header-row"><div><h1>Покупка без растерянности.</h1><p>Проверяем не только нажатия: что хотел человек, что произошло и какой следующий шаг он видит. План сценариев отделён от фактически выполненных проверок.</p><p class="run-summary">${esc(runSummary)}</p></div><div class="revision">Каталог ${fingerprint}<br>Сборка ${esc(localStamp)}</div></div>
<div class="toolbar"><button id="print">Печать текущей выборки</button><button id="export">Экспорт результатов JSON</button><button id="export-graph">Полный граф Mermaid</button></div></header>
<main><div class="summary-grid">
<div class="metric"><strong>${sourceCases.length}</strong><span>Сценариев в каталоге</span><small>${esc(caseSummary)}</small></div>
<div class="metric"><strong>${runs.length}</strong><span>Фактических ручных RUN</span><small>${runs.length ? esc(countDescription(runs)) : "Результаты прогона ещё не приложены"}</small></div>
<div class="metric"><strong>${checks.length}</strong><span>Автоматических проверок</span><small>${checks.length ? esc(countDescription(checks)) : "Отдельные результаты не приложены"}</small></div>
<div class="metric"><strong id="review-count">0</strong><span>Ваших отдельных отметок</span><small>Хранятся только в этом QA-артефакте</small></div></div>
${summaryHtml}
${missingSources.length ? '<p class="source-warning">Неполный комплект исходников: ещё нет ' + esc(missingSources.join(", ")) + ". Пересоберите отчёт после их появления.</p>" : ""}
<div class="truth-note"><strong>План ≠ выполненный тест.</strong> Один RUN — конкретная точка наблюдения, а не автоматическое прохождение всех связанных сценариев. Успех автоматических тестов не заменяет ручную проверку. Физические телефоны и камера QR не считаются проверенными без явных доказательств.</div>
<section id="causal-section" class="section"><p class="eyebrow">Причины → действия → последствия</p><h2>Главный путь и места сомнения</h2><p class="section-intro">Нажмите шаг, чтобы увидеть условия перехода, наблюдаемый результат, инвариант и связанные кейсы. На схеме — основные решения; в списке доступны все ${originalNodeCount} исходных узлов и ${graph.nodes.length-originalNodeCount} дополнительных ссылок из кейсов. Исходный граф: ${originalEdgeCount} связей. Отдельно: ${graph.edges.length-originalEdgeCount} ожидаемых связей из сценариев, с явной пометкой «ожидание тест-кейса». Они не означают проверенный результат.</p>
<div class="flow-wrap">${flow}</div><div class="doubt-branches"><button data-node="SELECTION_CANCEL">Передумал — закрыть выбор</button><button data-node="MORE_ITEMS">Хочу добавить ещё</button><button data-node="PAYMENT_CANCEL">Отменить подтверждение оплаты</button><button data-node="REQUEST_ERROR">Связь потеряна — что дальше?</button><button data-node="PHOTO_ERROR">Фото не загрузилось</button></div>
<div class="graph-select"><label for="node-select">Любой узел полного графа<select id="node-select"></select></label></div><div class="graph-detail" id="node-detail"></div></section>
<section id="cases" class="section"><p class="eyebrow">Каталог воспроизводимых сценариев</p><h2>Проверки по шагам</h2><p class="section-intro">Откройте сценарий, выполните все указанные условия и варианты, затем при необходимости сохраните собственную отметку с фактическим результатом. Фильтр статуса учитывает ваши отметки; исходные данные остаются неизменными.</p>
<div class="filters"><label>Поиск<input id="search" type="search" placeholder="Название, ID, шаг или эффект"></label><label>Область<select id="area"><option value="">Все области</option></select></label><label>Приоритет<select id="priority"><option value="">Все</option><option>P0</option><option>P1</option><option>P2</option></select></label><label>Статус<select id="status"><option value="">Все</option><option value="planned">Запланирован</option><option value="partial">Частично проверен</option><option value="passed">Пройден</option><option value="failed">Ошибка</option><option value="blocked">Заблокирован</option></select></label><button id="reset">Сбросить</button></div>
<p class="case-count" id="case-count"></p><div id="case-list"></div><div class="review-controls"><button id="clear-reviews">Очистить мои отметки</button><p id="review-message" role="status" aria-live="polite"></p></div></section>
${runs.length ? '<details class="logbook section"><summary>Журнал ручных наблюдений · ' + runs.length + ' <span>' + esc(countDescription(runs)) + '</span></summary><section id="manual-runs" class="section" hidden><h2></h2><p class="section-intro">Только записи из runs.json. Связи RUN с условиями кейса заданы отдельно и не переносят успех наблюдения на непроверенные варианты.</p><div class="record-list"></div></section></details>' : ''}
${checks.length ? '<details class="logbook section"><summary>Журнал автоматических проверок · ' + checks.length + ' <span>' + esc(countDescription(checks)) + '</span></summary><section id="automated-checks" class="section" hidden><h2></h2><p class="section-intro">Отдельный слой доказательств из checks.json.</p><div class="record-list"></div></section></details>' : ''}
<section class="section isolation"><div><h2>Честная граница прогона</h2><p>Кассир: <code>http://127.0.0.1:8790</code>. Бариста: <code>http://localhost:8790</code>. У них одна изолированная QA-БД и разные cookie-сессии. HttpOnly, CSRF и проверка Origin сохранены. Пользовательский стенд :8787 не является тестовой БД.</p><p>QR с origin кассира принимается на 127.0.0.1:8790. На localhost бариста использует очередь. Возможность открыть две роли одновременно сама по себе не доказывает, что гонка действий проверена.</p></div><div><h2>Изоляция и доказательства</h2><ul><li>Не менять чужую корзину, профиль, service worker или сетевые настройки.</li><li>Для независимых гостевых корзин нужны отдельные профили; общий origin намеренно синхронизирует корзину.</li><li>Не сохранять пароли, гостевые ключи или URL с секретным hash.</li><li>Записывать реальный CSS viewport, среду, ограничения и фактический результат.</li></ul></div></section>
</main><footer>Автономный QA-артефакт. Нет сетевых запросов и связи с рабочей кассой. Полные исходные сценарии: regression.md · Данные: regression.json · Граф: cause-effect.mmd.</footer>
<script type="application/json" id="qa-data">${JSON.stringify(manifest).replaceAll("<","\\u003c").replaceAll("\u2028","\\u2028").replaceAll("\u2029","\\u2029")}</script>
<script>${graphMermaid.toString()}\n${reportApp.toString()}\nreportApp();</script></body></html>`;
  const fencedMd = value => {
    const content = String(value).split(/\r?\n/).map(line => line.trimEnd()).join("\n");
    const fence = "`".repeat(Math.max(3, ...Array.from(content.matchAll(/`+/g), match => match[0].length + 1)));
    return fence + "text\n" + content + "\n" + fence;
  };
  const compactMd = content => {
    let fence = null;
    let blank = false;
    return content.split("\n").filter(line => {
      const marker = line.match(/^\s*(`{3,})(.*)$/);
      if (marker && (!fence || (marker[1] === fence && !marker[2]))) {
        fence = fence ? null : marker[1];
        blank = false;
      } else if (!fence) {
        const empty = !line.trim();
        if (empty && blank) return false;
        blank = empty;
      }
      return true;
    }).join("\n");
  };
  const recordMd = (record, heading = "###") => [
    `${heading} ${record.id} · ${record.title}`, "", `Результат: **${record.result}**. Область: ${record.area || "не указана"}.`, "",
    /[\r\n]/.test(record.actual) ? fencedMd(record.actual) : record.actual.trimEnd(), "", record.environment ? "Среда: " + (typeof record.environment === "string" ? record.environment : JSON.stringify(record.environment)) + "\n" : "",
    ...(record.evidence?.length ? ["Доказательства:", "", ...record.evidence.map(value => "- " + (typeof value === "string" ? value : JSON.stringify(value))), ""] : [])
  ].join("\n");
  const listMd = (title, values, numbered = false) => ["#### " + title, "", ...values.map((value,index) => {
    const marker = numbered ? `${index+1}. ` : "- ";
    const lines = String(value).split(/\r?\n/);
    if (lines.length === 1) return marker + value;
    const indent = " ".repeat(marker.length);
    return marker + lines[0] + "\n\n" + fencedMd(lines.slice(1).join("\n")).split("\n").map(line => indent + line).join("\n") + "\n";
  }), ""].join("\n");
  const executionMd = item => {
    const execution = item.executionEvidence || item;
    const sections = [];
    if (execution.manualRunIds?.length || execution.verifiedSubvariants?.length || execution.remainingVariants?.length) {
      sections.push("#### Фактическое покрытие сценария\n", execution.fullyCovered === true
        ? "В исходных данных явно отмечено полное покрытие.\n"
        : "Проверены только указанные условия. Остальные шаги и варианты не считаются выполненными.\n");
      if (execution.verifiedSubvariants?.length) sections.push(listMd("Что проверено", execution.verifiedSubvariants));
      if (execution.remainingVariants?.length) sections.push(listMd("Что осталось проверить", execution.remainingVariants));
      if (execution.manualRunIds?.length) sections.push(listMd("Связанные ручные RUN", execution.manualRunIds.map(id => {
        const run = runs.find(record => record.id === id); return id + " · " + run.title + " — " + run.actual;
      })));
    }
    return sections.join("\n");
  };
  const allCaseMd = compactMd(["# Roby's: полный каталог ручной регрессии", "", "Собрано: " + localStamp + ". Ревизия каталога: " + fingerprint + ".", "",
    "**Сценарии и выполненные RUN — разные сущности.** Связи с проверенными условиями записываются явно; результат RUN не подтверждает остальные варианты.", "", "Покрытие сценариев: " + caseSummary + ".", "",
    ...(missingSources.length ? ["Не хватает исходников: " + missingSources.join(", ") + ".", ""] : []),
    ...(runs.length ? ["## Фактические ручные RUN", "", ...runs.map(item=>recordMd(item))] : []),
    ...(checks.length ? ["## Автоматические проверки", "", ...checks.map(item=>recordMd(item))] : []),
    "## Каталог сценариев", "",
    ...sourceCases.map(item => ["### " + item.id + " · " + item.title, "", `Приоритет: **${item.priority}** · область: ${item.area} · исходный статус: **${item.status}**.`,
      "", "Источник: " + item.sourceFile + ".", "", listMd("Предусловия",item.preconditions),listMd("Шаги",item.steps,true),
      listMd("Ожидаемый результат",item.expected),listMd("Варианты",item.variants),listMd("Причины / условия",item.causes),
      listMd("Эффекты / последствия",item.effects), executionMd(item), item.evidence.length ? listMd("Доказательства",item.evidence.map(value=>typeof value==="string"?value:JSON.stringify(value))) : "Дополнительные файлы доказательств исходного кейса: не приложены.\n"].join("\n"))
  ].join("\n"));
  const readme = `# Roby's: ручная регрессия покупки и рабочей очереди

Это воспроизводимый план и журнал доказательств. Здесь ${sourceCases.length} сценариев, ${runs.length} фактических ручных RUN и ${checks.length} записей автоматических проверок. Все три набора считаются отдельно. Создано ${localStamp}.

Покрытие сценариев: ${caseSummary}. Запланированные и частично проверенные кейсы считаются раздельно; RUN не превращается в полный проход всех вариантов.

${missingSources.length ? "**Комплект неполный:** отсутствуют " + missingSources.join(", ") + ". После появления файлов повторите генерацию.\n\n" : ""}## Открыть и пересобрать

Откройте report.html обычным браузером. Интернет и зависимости не нужны. Для пересборки из корня рабочего пространства:

\`\`\`powershell
& 'C:/Users/safal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' '${generatorPath}'
\`\`\`

Если Node 24 уже есть в PATH: \`node "${generatorPath}"\`.

Исходники: customer-cases.json, counter-cases.json, site-cases.json, causal-graph.json. Дополнительные результаты: runs.json и checks.json. Необязательный review-summary.json содержит дату, краткую область прогона, исправления со ссылками verifiedBy на существующие RUN/AUTO и ограничения. В HTML эта сводка свёрнута, чтобы не отодвигать причинный граф; она также включается в regression.json как reviewSummary. Генератор проверяет ссылки на доказательства и безопасно выводит текст сводки. Отсутствие файла не мешает сборке. Генератор меняет только report.html, README.md, regression.md, regression.json и cause-effect.mmd; не меняет исходные кейсы, RUN, приложение или БД.

## Файлы

- report.html — поиск, фильтры, подробности, компактная схема, выбор любого узла, печать и экспорт.
- regression.md — полный читаемый перечень всех кейсов, включая шаги, ожидания и варианты.
- regression.json — собранные данные и отдельные исходные результаты.
- cause-effect.mmd — полный Mermaid-граф; комментарии сохраняют всю метаинформацию каждого узла и ребра.
- Исходный граф: ${originalNodeCount} узлов, ${originalEdgeCount} связей. Дополнительно: ${graph.nodes.length-originalNodeCount} узлов и ${graph.edges.length-originalEdgeCount} ожидаемых связей сценариев.
- Дополнительные узлы \`supplemental: true\` сохраняют все ссылки из кейсов. Связи причина → эффект с \`evidenceType: "test-expectation"\` содержат caseIds и короткие ссылки на условия/ожидания. В деталях перехода раскрываются полные предусловия (все вместе, AND), шаги и expected исходного кейса. Это не означает реализованный либо проверенный переход приложения. В Mermaid они пунктирные; точные метаданные рёбер и полные связанные кейсы сохранены в комментариях. HTML создаёт Mermaid при экспорте из тех же данных без дублирования всего графа в загрузке.

## Пять QA-перспектив

Это распределение ролей проверки, а не утверждение, что пять людей уже выполнили весь план.

1. **Новый нетерпеливый покупатель.** Чистый кеш → главная → меню/умный выбор → фото на медленной сети → понятный первый выбор. Приоритет: вход, производительность, 320–390 px.
2. **Покупатель, знающий свой заказ.** Клавиатура и desktop → выбор вкуса/пары → количество → добавление → удаление/замена → сравнение итогов между меню и умным выбором.
3. **Сомневающийся покупатель.** Помощник → изменение пожеланий и бюджета → альтернативы → отмена → «ещё добавить» или «достаточно» → оформление. Проверить честность обещаний и отсутствие тупиков.
4. **Кассир.** Вход → QR/ID → проверка состава и суммы → отмена оплаты → явное тестовое подтверждение → наблюдение очереди. Проверить чужие QR, истечение сессии, потерю ответа и повтор после сверки.
5. **Бариста и гость, ожидающий заказ.** Видимость только оплаченных заказов → готов → выдан; параллельно у гостя обновление статуса, отключение/возврат сети, сохранение того же номера.

Для каждой перспективы выберите соответствующие области в report.html, затем выполните все предусловия и варианты конкретного кейса. Фактический частичный проход записывайте отдельным RUN с точным ограничением.

## Среда и изоляция

- Кассир: \`http://127.0.0.1:8790\`. Бариста: \`http://localhost:8790\`. Это один QA-сервер с общей временной БД, но отдельными cookie-сессиями. HttpOnly, CSRF, Origin и серверные роли остаются включены.
- Не использовать пользовательский сервер \`:8787\` и его заказы для мутационных тестов.
- Кассир и бариста могут быть открыты одновременно на своих алиасах. QR с origin кассира принимается только на 127.0.0.1:8790; бариста на localhost использует очередь. Наличие двух сессий не считается проверкой гонки действий без конкретного RUN.
- Гостевые вкладки одного профиля/origin намеренно делят корзину. Не запускать независимые мутационные сценарии в такой паре вкладок одновременно.
- Для первого визита, офлайн-кеша и блокировки фото использовать отдельный чистый профиль, затем восстановить его сетевые/viewport-настройки.
- Записывать фактическую CSS-ширину и zoom. Desktop-эмуляция не равна проверке физического телефона. Камера QR не считается проверенной только по успешной вставке URL.
- Пароли, bearer-токены и гостевые URL с ключом не должны попадать в JSON, HTML, скриншоты или журналы. Генератор отклоняет явные секретные поля и длинные capability-значения в URL.

## Маршруты и границы возможностей

- /, /index.html, /discover.html, /menu.html; menu поддерживает категории и допустимый ?product=...#category.
- /smart-choice/#quick и /smart-choice/index.html#quick; внутренние шаги помощника используют сохранённый контекст.
- /cashier.html#<ticket> — **статический** состав и печать; этот маршрут не подтверждает серверную оплату и не меняет очередь.
- /counter/guest.html — локальный серверный заказ; QR гостя открывает /counter/staff.html#order=<id>.
- QR рабочего места канонический, без query. Копия с ?v=... намеренно не проходит строгий входной parser.
- Серверные переходы: awaiting_payment → preparing после ручного подтверждения кассира → ready → issued. Ready/issued доступны кассиру и бариста согласно роли/статусу; отмена уже созданного заказа не реализована.

## Запись фактического результата

runs.json — массив записей (или объект \`{ "runs": [...] }\`):

\`\`\`json
{
  "id": "RUN-001",
  "title": "Краткое название фактически выполненного прохода",
  "result": "passed",
  "actual": "Конкретные действия, наблюдение и границы проверки",
  "area": "cart",
  "evidence": [],
  "environment": "QA :8790; desktop; фактический CSS viewport"
}
\`\`\`

Допустимые результаты: passed, failed, blocked. checks.json использует ту же структуру записей либо объект \`{ "checks": [...] }\`. Не пишите passed для ещё не выполненного кейса и не переносите результат RUN на все сценарии его области.

Статусы исходного кейса: planned, partial, passed, failed, blocked. \`partial\` означает «Частично проверен». Для явной связи с наблюдениями добавьте в кейс \`executionEvidence: { manualRunIds: ["RUN-001"], verifiedSubvariants: ["Фактически проверенное условие"], remainingVariants: ["Оставшееся условие"], fullyCovered: false }\`. Эти поля также поддерживаются непосредственно в объекте кейса. Генератор проверяет ссылки на существующие RUN, показывает их фактические результаты и не вычисляет успешный статус по совпадению области или ID. Нельзя одновременно указать partial и fullyCovered: true.

Отметки рецензента в HTML хранятся отдельно, только в localStorage под ключом \`robys.qa.manual-regression.review.v1\`. Они не переписывают исходные данные. Для обмена используйте «Экспорт результатов JSON»; в нём отметки находятся в отдельном reviewerMarks. Печать отражает текущую фильтрованную выборку.
`;
  const outputs = { "report.html": html, "README.md": readme, "regression.md": allCaseMd, "regression.json": JSON.stringify(manifest,null,2)+"\n", "cause-effect.mmd": mermaid };
  for (const [file, content] of Object.entries(outputs)) { rejectSecrets(content, file); fs.writeFileSync(path.join(base,file),content,"utf8"); }
  console.log(JSON.stringify({ status:"PASS", cases:sourceCases.length, runs:runs.length, checks:checks.length,
    originalNodes:originalNodeCount, originalEdges:originalEdgeCount, supplementalNodes:graph.nodes.length-originalNodeCount,
    expectationEdges:graph.edges.length-originalEdgeCount, edges:graph.edges.length,
    missingSources, outputs:Object.keys(outputs) }));
}

await generate();
