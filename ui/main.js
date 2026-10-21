import "@rogieking/figui3/fig.css";
import "@rogieking/figui3/fig.js";
import "./styles.css";

// =================================================================
// Message contract with code.ts (must stay in sync)
//   UI → plugin:  INIT                       (no payload)
//                 RUN { collectionIds, nameMode, format, unitPxForFloat, prefix, modesByCollection }
//   plugin → UI:  INIT_DATA [{ id, name, modes: [{ modeId, name }], variableCount }]
//                 RESULT { css, tailwind }
//                 ERROR { request: "INIT" | "RUN", message }
// =================================================================

const $ = (id) => document.getElementById(id);

const PREFIX_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
const RUN_TIMEOUT_MS = 30000;

const state = {
  collections: [],
  // collectionId -> Set of selected modeIds
  selection: new Map(),
  nameMode: "code-syntax",
  formats: { css: true, tailwind: true },
  unitPxForFloat: true,
  prefixEnabled: false,
  prefix: "",
  loading: false,
  activeTab: "css",
  output: { css: "", tailwind: "" },
};

const el = {
  collections: $("collections"),
  summary: $("collections-summary"),
  nameMode: $("name-mode"),
  fmtCss: $("fmt-css"),
  fmtTailwind: $("fmt-tw"),
  unitPx: $("unit-px"),
  formError: $("form-error"),
  prefixToggle: $("prefix-toggle"),
  prefixBody: $("prefix-body"),
  prefix: $("prefix"),
  prefixHint: $("prefix-hint"),
  prefixPreview: $("prefix-preview"),
  tabs: $("output-tabs"),
  outCss: $("out-css"),
  outTailwind: $("out-tailwind"),
  copy: $("copy"),
  run: $("run"),
  toast: $("toast"),
};

let runTimer = null;
// Generate is disabled while loading, which drops its focus; return it there afterwards
let focusAfterRun = false;

function post(type, payload) {
  parent.postMessage({ pluginMessage: payload === undefined ? { type } : { type, payload } }, "*");
}

// ===== Payload & validation

function buildPayload() {
  const collectionIds = [];
  const modesByCollection = {};
  for (const col of state.collections) {
    const modes = state.selection.get(col.id);
    if (!modes || !modes.size) continue;
    collectionIds.push(col.id);
    // Keep the collection's mode order, not the click order
    modesByCollection[col.id] = col.modes.filter((m) => modes.has(m.modeId)).map((m) => m.modeId).join(",");
  }
  return {
    collectionIds,
    nameMode: state.nameMode,
    format: ["css", "tailwind"].filter((f) => state.formats[f]),
    unitPxForFloat: state.unitPxForFloat,
    prefix: state.prefixEnabled ? state.prefix.trim() : "",
    modesByCollection,
  };
}

function validate() {
  const errors = {};
  const prefix = state.prefix.trim();
  if (state.prefixEnabled && prefix && !PREFIX_PATTERN.test(prefix)) {
    errors.prefix = "Use letters, numbers, - or _, and don't start with a number.";
  }
  if (!state.formats.css && !state.formats.tailwind) {
    errors.formats = "Choose at least one format.";
  }
  if (!buildPayload().collectionIds.length) {
    errors.collections = "Select at least one collection.";
  }
  return errors;
}

// ===== Rendering

function render() {
  const errors = validate();

  const selectedCount = buildPayload().collectionIds.length;
  el.summary.textContent = state.collections.length ? `${selectedCount} of ${state.collections.length}` : "";

  el.formError.textContent = errors.formats || "";
  el.formError.hidden = !errors.formats;

  const prefix = state.prefix.trim();
  el.prefixPreview.textContent = `--${prefix || "ds"}-`;
  el.prefixHint.classList.toggle("error", Boolean(errors.prefix));
  if (errors.prefix) el.prefixHint.textContent = errors.prefix;
  else if (!el.prefixHint.contains(el.prefixPreview)) el.prefixHint.replaceChildren("Variables start with ", el.prefixPreview);
  // fig-input-text forwards aria-label but not these, so set them on the real <input>
  const prefixInput = el.prefix.querySelector("input");
  if (prefixInput) {
    prefixInput.setAttribute("aria-invalid", String(Boolean(errors.prefix)));
    prefixInput.setAttribute("aria-describedby", "prefix-hint");
  }

  const canRun = !state.loading && Object.keys(errors).length === 0;
  setDisabled(el.run, !canRun);
  el.run.textContent = state.loading ? "Generating…" : "Generate";
  el.run.setAttribute("aria-busy", String(state.loading));
  el.run.title = errors.collections || errors.formats || errors.prefix || "";

  // fig-tab toggles its panel on the next animation frame, which doesn't run while the window is hidden;
  // keep the panels in sync with state ourselves
  el.outCss.parentElement.style.display = state.activeTab === "css" ? "flex" : "none";
  el.outTailwind.parentElement.style.display = state.activeTab === "tailwind" ? "flex" : "none";

  const tabLabel = state.activeTab === "css" ? "CSS" : "Tailwind";
  el.copy.textContent = `Copy ${tabLabel}`;
  setDisabled(el.copy, !state.output[state.activeTab]);
}

function setDisabled(node, disabled) {
  if (disabled) node.setAttribute("disabled", "");
  else node.removeAttribute("disabled");
}

function renderCollections() {
  el.collections.setAttribute("aria-busy", "false");
  if (!state.collections.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "This file has no local variable collections.";
    el.collections.replaceChildren(empty);
    return;
  }

  // Built with DOM APIs: collection and mode names come from the document and are never parsed as HTML
  const rows = state.collections.map((col) => {
    const item = document.createElement("div");
    item.className = "collection";

    const row = document.createElement("div");
    row.className = "collection-row";
    const check = document.createElement("fig-checkbox");
    check.setAttribute("label", col.name);
    check.setAttribute("value", col.id);
    check.dataset.collectionId = col.id;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = String(col.variableCount);
    count.setAttribute("aria-label", `${col.variableCount} variables`);
    row.append(check, count);
    item.append(row);

    if (col.modes.length > 1) {
      const modes = document.createElement("div");
      modes.className = "modes";
      modes.setAttribute("role", "group");
      modes.setAttribute("aria-label", `${col.name} modes`);
      for (const mode of col.modes) {
        const modeCheck = document.createElement("fig-checkbox");
        modeCheck.setAttribute("label", mode.name || mode.modeId);
        modeCheck.setAttribute("value", mode.modeId);
        modeCheck.dataset.collectionId = col.id;
        modeCheck.dataset.modeId = mode.modeId;
        modes.append(modeCheck);
      }
      item.append(modes);
    }
    return item;
  });
  el.collections.replaceChildren(...rows);
  syncCollectionChecks();
}

// Reflects state.selection into the checkboxes (collection = all/some/none of its modes)
function syncCollectionChecks() {
  for (const col of state.collections) {
    const modes = state.selection.get(col.id) || new Set();
    const colCheck = el.collections.querySelector(`fig-checkbox[data-collection-id="${CSS.escape(col.id)}"]:not([data-mode-id])`);
    if (colCheck) {
      const all = modes.size === col.modes.length && modes.size > 0;
      colCheck.checked = all;
      if (modes.size > 0 && !all) colCheck.setAttribute("indeterminate", "");
      else colCheck.removeAttribute("indeterminate");
    }
    el.collections.querySelectorAll(`fig-checkbox[data-collection-id="${CSS.escape(col.id)}"][data-mode-id]`).forEach((modeCheck) => {
      modeCheck.checked = modes.has(modeCheck.dataset.modeId);
    });
  }
}

function setTab(tab) {
  state.activeTab = tab;
  el.tabs.setAttribute("value", tab);
  render();
}

function toast(message, theme = "auto") {
  // The toast is a <dialog> and takes focus when shown; give it back so keyboard users keep their place
  const active = document.activeElement;
  const returnTo = active && active !== document.body ? active : (focusAfterRun ? el.run : null);
  focusAfterRun = false;
  el.toast.textContent = message;
  el.toast.setAttribute("theme", theme);
  el.toast.showToast();
  if (returnTo) returnTo.focus({ preventScroll: true });
}

function setLoading(loading) {
  state.loading = loading;
  clearTimeout(runTimer);
  if (loading) {
    // Safety net: never leave the button stuck if the plugin doesn't answer
    runTimer = setTimeout(() => {
      setLoading(false);
      toast("The plugin didn't respond. Try again.", "danger");
    }, RUN_TIMEOUT_MS);
  }
  render();
}

// ===== Events

el.collections.addEventListener("change", (e) => {
  const check = e.target.closest("fig-checkbox");
  if (!check || !check.dataset.collectionId) return;
  const col = state.collections.find((c) => c.id === check.dataset.collectionId);
  if (!col) return;
  const checked = e.detail ? e.detail.checked : check.checked;

  if (check.dataset.modeId) {
    const modes = new Set(state.selection.get(col.id) || []);
    if (checked) modes.add(check.dataset.modeId);
    else modes.delete(check.dataset.modeId);
    if (modes.size) state.selection.set(col.id, modes);
    else state.selection.delete(col.id);
  } else if (checked) {
    state.selection.set(col.id, new Set(col.modes.map((m) => m.modeId)));
  } else {
    state.selection.delete(col.id);
  }
  syncCollectionChecks();
  render();
});

el.nameMode.addEventListener("change", (e) => {
  state.nameMode = (typeof e.detail === "string" && e.detail) || el.nameMode.value || "code-syntax";
  render();
});

for (const [node, key] of [[el.fmtCss, "css"], [el.fmtTailwind, "tailwind"]]) {
  node.addEventListener("change", (e) => {
    state.formats[key] = e.detail ? e.detail.checked : node.checked;
    render();
  });
}

el.unitPx.addEventListener("change", (e) => {
  state.unitPxForFloat = e.detail ? e.detail.checked : el.unitPx.checked;
  render();
});

el.prefixToggle.addEventListener("click", () => {
  state.prefixEnabled = !state.prefixEnabled;
  el.prefixBody.hidden = !state.prefixEnabled;
  el.prefixToggle.setAttribute("aria-expanded", String(state.prefixEnabled));
  el.prefixToggle.setAttribute("aria-label", state.prefixEnabled ? "Remove prefix" : "Add prefix");
  el.prefixToggle.querySelector("fig-icon").setAttribute("name", state.prefixEnabled ? "minus" : "add");
  if (state.prefixEnabled) {
    requestAnimationFrame(() => el.prefix.focus());
  } else {
    state.prefix = "";
    el.prefix.setAttribute("value", "");
    el.prefix.value = "";
  }
  render();
});

el.prefix.addEventListener("input", () => {
  state.prefix = String(el.prefix.value || "");
  render();
});

// fig-tabs handles selection itself; read the selected tab after it updates
function readActiveTab() {
  const selected = el.tabs.querySelector('fig-tab[selected="true"]');
  const tab = selected ? selected.getAttribute("value") : state.activeTab;
  if (tab && tab !== state.activeTab) {
    state.activeTab = tab;
    render();
  }
}
el.tabs.addEventListener("change", readActiveTab);
el.tabs.addEventListener("click", () => queueMicrotask(readActiveTab));
el.tabs.addEventListener("keyup", () => queueMicrotask(readActiveTab));

el.run.addEventListener("click", () => {
  if (el.run.hasAttribute("disabled")) return;
  if (Object.keys(validate()).length) return render();
  focusAfterRun = el.run.matches(":focus-within") || document.activeElement === el.run;
  setLoading(true);
  post("RUN", buildPayload());
});

el.copy.addEventListener("click", async () => {
  const area = state.activeTab === "css" ? el.outCss : el.outTailwind;
  if (!area.value) return;
  // Figma's iframe blocks navigator.clipboard, so execCommand is the primary path
  area.focus();
  area.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch (_e) { copied = false; }
  if (!copied && navigator.clipboard) {
    try { await navigator.clipboard.writeText(area.value); copied = true; } catch (_e) { copied = false; }
  }
  area.setSelectionRange(0, 0);
  el.copy.focus();
  toast(copied ? `${state.activeTab === "css" ? "CSS" : "Tailwind"} copied to clipboard` : "Couldn't copy. Select the text and copy it manually.", copied ? "auto" : "danger");
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") el.run.click();
});

// ===== Plugin messages

function isCollectionList(payload) {
  return Array.isArray(payload) && payload.every((c) => c && typeof c.id === "string" && Array.isArray(c.modes));
}

window.addEventListener("message", (event) => {
  const msg = event.data && event.data.pluginMessage;
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "INIT_DATA": {
      if (!isCollectionList(msg.payload)) {
        console.error("INIT_DATA with unexpected payload", msg.payload);
        return;
      }
      state.collections = msg.payload.map((c) => ({
        id: c.id,
        name: String(c.name || c.id),
        modes: c.modes.map((m) => ({ modeId: String(m.modeId), name: String(m.name || m.modeId) })),
        variableCount: Number(c.variableCount) || 0,
      }));
      // Drop selections for collections that no longer exist
      for (const id of Array.from(state.selection.keys())) {
        if (!state.collections.some((c) => c.id === id)) state.selection.delete(id);
      }
      renderCollections();
      render();
      break;
    }
    case "RESULT": {
      const { css = "", tailwind = "" } = msg.payload || {};
      state.output = { css: String(css), tailwind: String(tailwind) };
      el.outCss.value = state.output.css;
      el.outTailwind.value = state.output.tailwind;
      setLoading(false);
      // Show the tab that has content if the current one came back empty
      if (!state.output[state.activeTab]) setTab(state.output.css ? "css" : "tailwind");
      // The output sits below the options: bring it into view
      el.tabs.closest("section").scrollIntoView({ block: "end" });
      toast("Code generated");
      break;
    }
    case "ERROR": {
      const { request, message } = msg.payload || {};
      if (request === "INIT") {
        el.collections.setAttribute("aria-busy", "false");
        const p = document.createElement("p");
        p.className = "empty error";
        p.textContent = "Couldn't load the collections.";
        el.collections.replaceChildren(p);
      }
      setLoading(false);
      const action = request === "INIT" ? "load the collections" : "generate the code";
      toast(`Couldn't ${action}${message ? `: ${String(message)}` : "."}`, "danger");
      break;
    }
    default:
      console.warn("Unknown plugin message", msg.type);
  }
});

render();
post("INIT");
