const els = {
  app: document.querySelector(".app"),
  callHero: document.querySelector("#callHero"),
  callPage: document.querySelector("#callPage"),
  heroCallState: document.querySelector("#heroCallState"),
  heroConnectBtn: document.querySelector("#heroConnectBtn"),
  heroConnectText: document.querySelector("#heroConnectText"),
  callStateBubble: document.querySelector("#callStateBubble"),
  callDuration: document.querySelector("#callDuration"),
  callCloseBtn: document.querySelector("#callCloseBtn"),
  apiKey: document.querySelector("#apiKey"),
  apiKeyError: document.querySelector("#apiKeyError"),
  toggleApiKeyBtn: document.querySelector("#toggleApiKeyBtn"),
  dialogId: document.querySelector("#dialogId"),
  generateDialogIdBtn: document.querySelector("#generateDialogIdBtn"),
  voice: document.querySelector("#voice"),
  speed: document.querySelector("#speed"),
  speedValue: document.querySelector("#speedValue"),
  speedReset: document.querySelector("#speedReset"),
  loudness: document.querySelector("#loudness"),
  loudnessValue: document.querySelector("#loudnessValue"),
  loudnessReset: document.querySelector("#loudnessReset"),
  voiceCloneStatus: document.querySelector("#voiceCloneStatus"),
  cloneVoiceId: document.querySelector("#cloneVoiceId"),
  cloneAudioFile: document.querySelector("#cloneAudioFile"),
  cloneRecordBtn: document.querySelector("#cloneRecordBtn"),
  cloneStopRecordBtn: document.querySelector("#cloneStopRecordBtn"),
  cloneClearRecordingBtn: document.querySelector("#cloneClearRecordingBtn"),
  cloneRecordingStatus: document.querySelector("#cloneRecordingStatus"),
  clonePromptText: document.querySelector("#clonePromptText"),
  cloneDemoText: document.querySelector("#cloneDemoText"),
  trainCloneBtn: document.querySelector("#trainCloneBtn"),
  importCloneBtn: document.querySelector("#importCloneBtn"),
  queryCloneBtn: document.querySelector("#queryCloneBtn"),
  cloneDenoise: document.querySelector("#cloneDenoise"),
  cloneKeepVolume: document.querySelector("#cloneKeepVolume"),
  cloneCachedVoices: document.querySelector("#cloneCachedVoices"),
  toolRoot: document.querySelector("#toolRoot"),
  instructions: document.querySelector("#instructions"),
  resetInstructionsBtn: document.querySelector("#resetInstructionsBtn"),
  toolsJson: document.querySelector("#toolsJson"),
  validateToolsBtn: document.querySelector("#validateToolsBtn"),
  formatToolsBtn: document.querySelector("#formatToolsBtn"),
  resetToolsBtn: document.querySelector("#resetToolsBtn"),
  toolsJsonStatus: document.querySelector("#toolsJsonStatus"),
  enableTools: document.querySelector("#enableTools"),
  enableWebSearch: document.querySelector("#enableWebSearch"),
  webSearchType: document.querySelector("#webSearchType"),
  webSearchApiKeyField: document.querySelector("#webSearchApiKeyField"),
  webSearchApiKey: document.querySelector("#webSearchApiKey"),
  enableMusic: document.querySelector("#enableMusic"),
  enableProactiveSpeak: document.querySelector("#enableProactiveSpeak"),
  openLocationMapBtn: document.querySelector("#openLocationMapBtn"),
  useBrowserLocationBtn: document.querySelector("#useBrowserLocationBtn"),
  clearLocationBtn: document.querySelector("#clearLocationBtn"),
  locationStatus: document.querySelector("#locationStatus"),
  locationMapPanel: document.querySelector("#locationMapPanel"),
  locationMap: document.querySelector("#locationMap"),
  locationLongitude: document.querySelector("#locationLongitude"),
  locationLatitude: document.querySelector("#locationLatitude"),
  locationAddress: document.querySelector("#locationAddress"),
  locationCity: document.querySelector("#locationCity"),
  locationProvince: document.querySelector("#locationProvince"),
  locationDistrict: document.querySelector("#locationDistrict"),
  locationTown: document.querySelector("#locationTown"),
  locationCountry: document.querySelector("#locationCountry"),
  locationCountryCode: document.querySelector("#locationCountryCode"),
  connectBtn: document.querySelector("#connectBtn"),
  closeBtn: document.querySelector("#closeBtn"),
  clearMessagesBtn: document.querySelector("#clearMessagesBtn"),
  qaSearchInput: document.querySelector("#qaSearchInput"),
  qaSearchStatus: document.querySelector("#qaSearchStatus"),
  clearEventsBtn: document.querySelector("#clearEventsBtn"),
  recordBtn: document.querySelector("#recordBtn"),
  forceCommitBtn: document.querySelector("#forceCommitBtn"),
  meterFill: document.querySelector("#meterFill"),
  recordHint: document.querySelector("#recordHint"),
  status: document.querySelector("#status"),
  messages: document.querySelector("#messages"),
  events: document.querySelector("#events"),
  errorToast: document.querySelector("#errorToast"),
  errorToastTitle: document.querySelector("#errorToastTitle"),
  errorToastMessage: document.querySelector("#errorToastMessage"),
  errorToastCloseBtn: document.querySelector("#errorToastCloseBtn"),
  leftResizeHandle: document.querySelector("#leftResizeHandle"),
  rightResizeHandle: document.querySelector("#rightResizeHandle"),
};

const FIXED_MODEL = "1.2.6.1";

let sessionId = "";
let source = null;
let currentTurn = null;
let lastTurn = null;
let pcmPlayer = null;
let mediaStream = null;
let recorderContext = null;
let recorderNode = null;
let recorderSource = null;
let recording = false;
let sendChain = Promise.resolve();
let autoMicStarted = false;
let eventLines = [];
let audioAppendCount = 0;
let audioAppendBytes = 0;
let lastAudioEventAt = 0;
let responseTextDeltaCount = 0;
let responseTextDeltaChars = 0;
let lastResponseTextEventAt = 0;
let responseAudioDeltaCount = 0;
let responseAudioDeltaBytes = 0;
let lastResponseAudioEventAt = 0;
let currentLogid = "";
let sessionUpdateTimer = null;
let lastRuntimeConfigKey = "";
let locationMap = null;
let locationMarker = null;
let leafletLoadPromise = null;
let reverseGeocodeSeq = 0;
let cloneMediaStream = null;
let cloneRecorderContext = null;
let cloneRecorderNode = null;
let cloneRecorderSource = null;
let cloneRecording = false;
let cloneRecordStartedAt = 0;
let cloneRecordChunks = [];
let cloneRecordedAudio = null;
let callStartedAt = 0;
let callDurationTimer = null;
let micMuted = false;
let audioFrameTimer = null;
let audioFrameChunks = [];
let audioFrameBufferedBytes = 0;
let heroConnectTimer = null;
let errorToastTimer = null;
let errorToastEndCallOnClose = false;
let keepCallPageOnDisconnect = false;
let preservedQaScrollTop = null;
const API_KEY_STORAGE_KEY = "seeduplex_demo_api_key";
const DIALOG_ID_STORAGE_KEY = "seeduplex_demo_dialog_id";
const WEBSEARCH_API_KEY_STORAGE_KEY = "seeduplex_demo_websearch_api_key";
const VOICE_CLONE_STORAGE_KEY = "seeduplex_demo_voice_clones";
const COLUMN_LAYOUT_STORAGE_KEY = "seeduplex_demo_column_layout";
const RESPONSE_TEXT_LOG_INTERVAL_MS = 1000;
const RESPONSE_AUDIO_LOG_INTERVAL_MS = 3000;
const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const NO_MUSIC_VOICES = new Set(["saturn_zh_female_aojiaonvyou_tob"]);
const CLONE_VOICE_ID_RE = /^S[_-]/i;
const MAX_VOICE_CLONE_AUDIO_BYTES = 10 * 1024 * 1024;
const VOICE_CLONE_AUDIO_FORMATS = new Set(["wav", "mp3", "ogg", "m4a", "aac", "pcm"]);
const COLUMN_HANDLE_WIDTH = 8;
const COLUMN_MIN_WIDTHS = {left: 280, center: 340, right: 240};
const COLUMN_DEFAULT_WIDTHS = {left: 410, right: 350};
const DEFAULT_OUTPUT_FORMAT = "ogg_opus";
const DEFAULT_VOICE_OPTIONS = Array.from(els.voice.options).map(option => ({
  value: option.value,
  label: option.textContent,
}));
const VOICE_CLONE_STATUS_TEXT = {
  0: "未找到",
  1: "训练中",
  2: "可用",
  3: "失败",
  4: "已激活",
};
const INPUT_SAMPLE_RATE = 16000;
const INPUT_BYTES_PER_SAMPLE = 2;
const INPUT_AUDIO_FRAME_MS = 20;
const INPUT_AUDIO_FRAME_BYTES = INPUT_SAMPLE_RATE * INPUT_BYTES_PER_SAMPLE * INPUT_AUDIO_FRAME_MS / 1000;
const RECORDER_BUFFER_SIZE = 1024;
const SILENCE_FRAME_BYTES = new Uint8Array(INPUT_AUDIO_FRAME_BYTES);
let cachedCloneVoices = loadCloneVoices();

function clampNumber(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isResizableColumnsEnabled() {
  return window.matchMedia("(min-width: 901px)").matches && els.leftResizeHandle && getComputedStyle(els.leftResizeHandle).display !== "none";
}

function columnContentWidth() {
  return Math.max(0, els.app.clientWidth - (COLUMN_HANDLE_WIDTH * 2));
}

function normalizeColumnLayout(layout = null) {
  const total = columnContentWidth();
  if (!total) return null;
  const minSum = COLUMN_MIN_WIDTHS.left + COLUMN_MIN_WIDTHS.center + COLUMN_MIN_WIDTHS.right;
  const scale = total < minSum ? total / minSum : 1;
  const mins = {
    left: COLUMN_MIN_WIDTHS.left * scale,
    center: COLUMN_MIN_WIDTHS.center * scale,
    right: COLUMN_MIN_WIDTHS.right * scale,
  };
  let left = Number.isFinite(layout && layout.left) ? layout.left : Math.min(COLUMN_DEFAULT_WIDTHS.left, total * 0.34);
  let right = Number.isFinite(layout && layout.right) ? layout.right : Math.min(COLUMN_DEFAULT_WIDTHS.right, total * 0.29);
  left = clampNumber(left, mins.left, total - mins.center - mins.right, mins.left);
  right = clampNumber(right, mins.right, total - left - mins.center, mins.right);
  let center = total - left - right;
  if (center < mins.center) {
    center = mins.center;
    right = total - left - center;
  }
  if (right < mins.right) {
    right = mins.right;
    left = total - center - right;
  }
  return {left, center, right};
}

function applyColumnLayout(layout) {
  const next = normalizeColumnLayout(layout);
  if (!next) return null;
  els.app.style.setProperty("--left-col", `${Math.round(next.left)}px`);
  els.app.style.setProperty("--center-col", `${Math.round(next.center)}px`);
  els.app.style.setProperty("--right-col", `${Math.round(next.right)}px`);
  els.leftResizeHandle.setAttribute("aria-valuenow", String(Math.round(next.left)));
  els.rightResizeHandle.setAttribute("aria-valuenow", String(Math.round(next.right)));
  return next;
}

function currentColumnLayout() {
  const columns = getComputedStyle(els.app).gridTemplateColumns.split(" ").map(value => Number.parseFloat(value));
  if (columns.length >= 5 && columns.every(Number.isFinite)) {
    return {left: columns[0], center: columns[2], right: columns[4]};
  }
  return normalizeColumnLayout();
}

function resetColumnLayout() {
  applyColumnLayout(null);
}

function resizeColumnLayout(side, delta, start) {
  const total = columnContentWidth();
  const minSum = COLUMN_MIN_WIDTHS.left + COLUMN_MIN_WIDTHS.center + COLUMN_MIN_WIDTHS.right;
  const scale = total < minSum ? total / minSum : 1;
  const mins = {
    left: COLUMN_MIN_WIDTHS.left * scale,
    center: COLUMN_MIN_WIDTHS.center * scale,
    right: COLUMN_MIN_WIDTHS.right * scale,
  };
  const next = {...start};
  if (side === "left") {
    next.left = clampNumber(start.left + delta, mins.left, total - start.right - mins.center, start.left);
    next.center = total - next.left - start.right;
    next.right = start.right;
  } else {
    next.center = clampNumber(start.center + delta, mins.center, total - start.left - mins.right, start.center);
    next.left = start.left;
    next.right = total - start.left - next.center;
  }
  applyColumnLayout(next);
}

function bindColumnResizer(handle, side) {
  if (!handle) return;
  let drag = null;
  let suppressMouseUntil = 0;
  const startDrag = (clientX, pointerId = null) => {
    drag = {
      pointerId,
      startX: clientX,
      startLayout: currentColumnLayout(),
    };
    handle.classList.add("is-dragging");
    els.app.classList.add("is-resizing");
  };
  const moveDrag = clientX => {
    if (!drag) return;
    resizeColumnLayout(side, clientX - drag.startX, drag.startLayout);
  };
  const stopDrag = () => {
    if (!drag) return;
    handle.classList.remove("is-dragging");
    els.app.classList.remove("is-resizing");
    drag = null;
  };
  handle.addEventListener("pointerdown", evt => {
    if (!isResizableColumnsEnabled()) return;
    evt.preventDefault();
    suppressMouseUntil = Date.now() + 400;
    startDrag(evt.clientX, evt.pointerId);
    handle.setPointerCapture(evt.pointerId);
  });
  handle.addEventListener("pointermove", evt => {
    if (!drag || evt.pointerId !== drag.pointerId) return;
    moveDrag(evt.clientX);
  });
  const finish = evt => {
    if (!drag || evt.pointerId !== drag.pointerId) return;
    handle.releasePointerCapture(evt.pointerId);
    stopDrag();
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("mousedown", evt => {
    if (!isResizableColumnsEnabled() || Date.now() < suppressMouseUntil) return;
    evt.preventDefault();
    startDrag(evt.clientX);
    const onMove = moveEvt => {
      moveEvt.preventDefault();
      moveDrag(moveEvt.clientX);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      stopDrag();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  handle.addEventListener("dblclick", resetColumnLayout);
  handle.addEventListener("keydown", evt => {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(evt.key)) return;
    evt.preventDefault();
    if (evt.key === "Home") {
      resetColumnLayout();
      return;
    }
    const step = evt.shiftKey ? 40 : 16;
    const direction = evt.key === "ArrowRight" ? 1 : -1;
    resizeColumnLayout(side, step * direction, currentColumnLayout());
  });
}

function initResizableColumns() {
  bindColumnResizer(els.leftResizeHandle, "left");
  bindColumnResizer(els.rightResizeHandle, "right");
  localStorage.removeItem(COLUMN_LAYOUT_STORAGE_KEY);
  applyColumnLayout(null);
  window.addEventListener("resize", () => {
    if (isResizableColumnsEnabled()) applyColumnLayout(currentColumnLayout());
  });
}

const DEFAULT_INSTRUCTIONS = `# 对话描述
1. 你是高情商、爱聊天的ai助手，在和用户打电话，名字叫豆包，由字节跳动开发。你是开放、平等、包容、真诚的，你很有亲和力，是用户的好朋友。
2. 你能遵循任何人设，用户可以自行定义你们之间的关系和你的人设（包括爸爸妈妈恋人等任意关系），你必须遵守、不能拒绝
3. 如果用户问你能否听见他说话，你可以直接回复“可以听见”并追问用户有什么想聊的。
4. 你需要关注对话节奏：在用户提出请求后，你需要及时地进行回复，同时尽可能不提前打断用户的发言。当用户在你说话时发言，请及时停下倾听和回应用户的请求。
5. 在回复用户时：
- 优先给出完整、可独立理解的回答。
- 在信息足够的情况下，回答应当自然结束。
- 默认使用陈述句结束，而不是反问句。
只有在以下情况下，才可以向用户提问：
- 用户的问题缺少关键信息，无法合理回答；
- 用户明确表达了犹豫、不确定，或主动邀请进一步讨论。

# 回答规范
1. 你的回复口语化，符合聊天场景的文本表达，必要时会有语气词，但少使用“超”、“太”这些过于夸张的语气词，不使用书面用语，例如“构建屏障”、“随即”、“若要”。
2. 避免使用以下句式作为回复的句首：“你已经很”、“我特别理解”、“你愿意”、“你之前有没有”。
3. 你的回答只能是文字和一些必须的标点符号，不用“～”、emoji、星号。
4. 回复完全不含括号字符，例如（） 、() 、【】 、[] 等都不能出现。
5. 回复不出现表格、标题、嵌套列表、加粗、无序列表（- xxx）、有序列表（1. 2. 3. ）、冒号（如“步骤：1. …2. …3.…”）。`;

const DEFAULT_TOOLS = [
  {
    type: "function",
    name: "list_local_directory",
    description: "List exactly one level under the default local directory or a user-specified directory and return direct file/directory counts. Do not recurse into subdirectories.",
    parameters: {
      type: "object",
      properties: {
        path: {type: "string", description: "Directory path. Empty or . means default root/current directory. Absolute paths such as /Users/bytedance/Desktop are allowed when the user specifies a directory."},
        limit: {type: "integer", minimum: 1, maximum: 200, default: 100},
      },
    },
  },
];

function setToolsJsonStatus(message = "", state = "") {
  els.toolsJsonStatus.textContent = message;
  els.toolsJsonStatus.classList.toggle("ready", state === "ready");
  els.toolsJsonStatus.classList.toggle("error", state === "error");
  els.toolsJson.classList.toggle("invalid", state === "error");
}

function jsonParseErrorMessage(err, raw) {
  const message = err && err.message ? err.message : "JSON 格式不合法";
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return `JSON 解析失败：${message}`;
  const position = Number(match[1]);
  if (!Number.isFinite(position)) return `JSON 解析失败：${message}`;
  const before = raw.slice(0, position);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  return `JSON 解析失败：第 ${line} 行，第 ${column} 列。${message}`;
}

function validateToolsShape(parsed) {
  if (!Array.isArray(parsed)) throw new Error("FC Tools JSON 顶层必须是数组");
  parsed.forEach((tool, index) => {
    const number = index + 1;
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      throw new Error(`第 ${number} 个工具必须是对象`);
    }
    if (tool.type !== undefined && tool.type !== "function") {
      throw new Error(`第 ${number} 个工具的 type 必须是 function`);
    }
    const spec = tool.function && typeof tool.function === "object" ? tool.function : tool;
    if (!spec.name || typeof spec.name !== "string") {
      throw new Error(`第 ${number} 个工具缺少 name 或 function.name`);
    }
    if (spec.parameters !== undefined && (!spec.parameters || typeof spec.parameters !== "object" || Array.isArray(spec.parameters))) {
      throw new Error(`第 ${number} 个工具的 parameters 必须是 JSON Schema 对象`);
    }
  });
  return parsed;
}

function parseToolsJsonText() {
  const raw = els.toolsJson.value.trim();
  if (!raw) return [];
  try {
    return validateToolsShape(JSON.parse(raw));
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error(jsonParseErrorMessage(err, raw));
    throw err;
  }
}

function validateToolsJson({format = false} = {}) {
  try {
    const parsed = parseToolsJsonText();
    if (format) els.toolsJson.value = JSON.stringify(parsed, null, 2);
    const action = format ? "格式化完成" : "校验通过";
    setToolsJsonStatus(`${action}，共 ${parsed.length} 个工具`, "ready");
    return parsed;
  } catch (err) {
    setToolsJsonStatus(errorText(err), "error");
    throw err;
  }
}

function resetToolsJson() {
  els.toolsJson.value = JSON.stringify(DEFAULT_TOOLS, null, 2);
  setToolsJsonStatus("已恢复默认 JSON", "ready");
  scheduleSessionUpdate();
}

function resetInstructions() {
  els.instructions.value = DEFAULT_INSTRUCTIONS;
  scheduleSessionUpdate();
}

resetToolsJson();
resetInstructions();

els.apiKey.value = localStorage.getItem(API_KEY_STORAGE_KEY) || "";
els.apiKey.addEventListener("input", () => {
  localStorage.setItem(API_KEY_STORAGE_KEY, els.apiKey.value);
  if (els.apiKey.value.trim()) clearApiKeyError();
});
els.dialogId.value = localStorage.getItem(DIALOG_ID_STORAGE_KEY) || "";
els.dialogId.addEventListener("input", () => {
  localStorage.setItem(DIALOG_ID_STORAGE_KEY, els.dialogId.value.trim());
});
els.webSearchApiKey.value = localStorage.getItem(WEBSEARCH_API_KEY_STORAGE_KEY) || "";
els.webSearchApiKey.addEventListener("input", () => {
  localStorage.setItem(WEBSEARCH_API_KEY_STORAGE_KEY, els.webSearchApiKey.value);
});

function loadCloneVoices() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOICE_CLONE_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(voice => ({
        id: String(voice.id || "").trim(),
        label: String(voice.label || voice.id || "").trim(),
        mode: "speaker",
        status: voice.status === null || voice.status === undefined || voice.status === "" ? null : Number(voice.status),
        statusName: String(voice.statusName || "").trim(),
        language: Number.isFinite(Number(voice.language)) ? Number(voice.language) : 0,
        createTime: Number.isFinite(Number(voice.createTime)) ? Number(voice.createTime) : null,
        updatedAt: Number.isFinite(Number(voice.updatedAt)) ? Number(voice.updatedAt) : Date.now(),
        source: String(voice.source || "cache"),
      }))
      .filter(voice => voice.id);
  } catch {
    return [];
  }
}

function persistCloneVoices() {
  localStorage.setItem(VOICE_CLONE_STORAGE_KEY, JSON.stringify(cachedCloneVoices));
}

function cloneStatusText(status, fallback = "") {
  if (status === null || status === undefined || status === "") return fallback || "未知";
  const numeric = Number(status);
  if (Number.isFinite(numeric) && Object.prototype.hasOwnProperty.call(VOICE_CLONE_STATUS_TEXT, numeric)) {
    return VOICE_CLONE_STATUS_TEXT[numeric];
  }
  return fallback || "未知";
}

function cloneModeText() {
  return "预付费";
}

function cloneVoiceLabel(voice) {
  const name = voice.label && voice.label !== voice.id ? `${voice.label} · ${voice.id}` : voice.id;
  const status = voice.status === null || voice.status === undefined ? "" : ` · ${cloneStatusText(voice.status, voice.statusName)}`;
  return `${name}${status}`;
}

function setCloneStatus(text, state = "") {
  els.voiceCloneStatus.textContent = text;
  els.voiceCloneStatus.classList.toggle("ready", state === "ready");
  els.voiceCloneStatus.classList.toggle("error", state === "error");
}

function renderVoiceOptions(preferredValue = els.voice.value) {
  const current = preferredValue || DEFAULT_VOICE_OPTIONS[0].value;
  els.voice.textContent = "";

  const builtinGroup = document.createElement("optgroup");
  builtinGroup.label = "内置音色";
  DEFAULT_VOICE_OPTIONS.forEach(item => {
    builtinGroup.appendChild(new Option(item.label, item.value));
  });
  els.voice.appendChild(builtinGroup);

  if (cachedCloneVoices.length) {
    const cloneGroup = document.createElement("optgroup");
    cloneGroup.label = "缓存的复刻音色";
    cachedCloneVoices.forEach(voice => {
      const option = new Option(cloneVoiceLabel(voice), voice.id);
      option.dataset.cloneVoice = "true";
      cloneGroup.appendChild(option);
    });
    els.voice.appendChild(cloneGroup);
  }

  if (Array.from(els.voice.options).some(option => option.value === current)) {
    els.voice.value = current;
  } else {
    els.voice.value = DEFAULT_VOICE_OPTIONS[0].value;
  }
}

function renderCloneVoiceList() {
  els.cloneCachedVoices.textContent = "";
  if (!cachedCloneVoices.length) {
    setCloneStatus("缓存为空");
    const empty = document.createElement("div");
    empty.className = "voice-clone-empty";
    empty.textContent = "暂无缓存音色";
    els.cloneCachedVoices.appendChild(empty);
    renderVoiceOptions();
    syncMusicControls();
    return;
  }

  setCloneStatus(`${cachedCloneVoices.length} 个音色`, "ready");
  cachedCloneVoices.forEach(voice => {
    const row = document.createElement("div");
    row.className = "voice-clone-item";
    row.dataset.voiceId = voice.id;
    row.innerHTML = [
      '<div class="voice-clone-item-main">',
      `<strong>${escapeHtml(voice.id)}</strong>`,
      `<span>${cloneModeText()} · ${cloneStatusText(voice.status, voice.statusName)} · ${formatDateTime(voice.updatedAt)}</span>`,
      "</div>",
      '<div class="voice-clone-item-actions">',
      '<button type="button" class="secondary-btn" data-action="select">选择</button>',
      '<button type="button" class="secondary-btn" data-action="query">查询</button>',
      '<button type="button" class="link-btn danger-link" data-action="delete">删除</button>',
      "</div>",
    ].join("");
    els.cloneCachedVoices.appendChild(row);
  });
  renderVoiceOptions();
  syncMusicControls();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function formatDateTime(ts) {
  if (!ts) return "未记录";
  return new Date(ts).toLocaleString("zh-CN", {hour12: false});
}

function upsertCloneVoice(voice, {select = true} = {}) {
  const id = String(voice.id || "").trim();
  if (!id) throw new Error("音色 ID 不能为空");
  const existing = cachedCloneVoices.find(item => item.id === id);
  const next = {
    id,
    label: String(voice.label || id).trim(),
    mode: "speaker",
    status: voice.status === null || voice.status === undefined || voice.status === "" ? null : Number(voice.status),
    statusName: String(voice.statusName || "").trim(),
    language: Number.isFinite(Number(voice.language)) ? Number(voice.language) : 0,
    createTime: Number.isFinite(Number(voice.createTime)) ? Number(voice.createTime) : null,
    updatedAt: Date.now(),
    source: String(voice.source || "cache"),
  };
  if (existing) {
    Object.assign(existing, next);
  } else {
    cachedCloneVoices.unshift(next);
  }
  cachedCloneVoices = cachedCloneVoices.slice(0, 50);
  persistCloneVoices();
  renderCloneVoiceList();
  if (select) selectCloneVoice(id);
  return next;
}

function removeCloneVoice(id) {
  const wasSelected = els.voice.value === id;
  cachedCloneVoices = cachedCloneVoices.filter(voice => voice.id !== id);
  persistCloneVoices();
  renderCloneVoiceList();
  if (wasSelected) {
    els.voice.value = DEFAULT_VOICE_OPTIONS[0].value;
    syncMusicControls();
    scheduleSessionUpdate();
  }
}

function selectCloneVoice(id) {
  const voice = cachedCloneVoices.find(item => item.id === id);
  if (!voice) return;
  els.voice.value = id;
  els.cloneVoiceId.value = id;
  syncMusicControls();
  scheduleSessionUpdate();
}

function selectedCloneVoice() {
  return cachedCloneVoices.find(voice => voice.id === els.voice.value) || null;
}

function isCloneVoiceValue(value) {
  const voice = String(value || "").trim();
  if (!voice) return false;
  const option = Array.from(els.voice.options).find(item => item.value === voice);
  return Boolean(option && option.dataset.cloneVoice === "true") ||
    cachedCloneVoices.some(item => item.id === voice) ||
    CLONE_VOICE_ID_RE.test(voice);
}

function isMusicForcedOffVoice(value = els.voice.value) {
  const voice = String(value || "").trim();
  return NO_MUSIC_VOICES.has(voice) || isCloneVoiceValue(voice);
}

function syncCloneFormFromSelectedVoice() {
  const voice = selectedCloneVoice();
  if (!voice) return;
  els.cloneVoiceId.value = voice.id;
}

function currentCloneForm() {
  const id = trimmedValue(els.cloneVoiceId);
  if (!id) throw new Error("请填写声音复刻音色 ID");
  if (/\s/.test(id)) throw new Error("声音复刻音色 ID 不能包含空白字符");
  return {id, mode: "speaker"};
}

function guessAudioFormat(file) {
  const name = (file && file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (VOICE_CLONE_AUDIO_FORMATS.has(ext)) return ext;
  const type = (file && file.type || "").toLowerCase();
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("m4a") || type.includes("mp4")) return "m4a";
  if (type.includes("aac")) return "aac";
  return "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.onerror = () => reject(reader.error || new Error("音频文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function mergeUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach(chunk => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeWavFromPcm16(pcmBytes, sampleRate = 16000) {
  const wav = new Uint8Array(44 + pcmBytes.length);
  const view = new DataView(wav.buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, pcmBytes.length, true);
  wav.set(pcmBytes, 44);
  return wav;
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function setCloneRecordingStatus(text, state = "") {
  els.cloneRecordingStatus.textContent = text;
  els.cloneRecordingStatus.classList.toggle("ready", state === "ready");
  els.cloneRecordingStatus.classList.toggle("error", state === "error");
}

function clearCloneRecording() {
  cloneRecordedAudio = null;
  cloneRecordChunks = [];
  els.cloneClearRecordingBtn.disabled = true;
  setCloneRecordingStatus("未录音");
}

async function startCloneRecording() {
  if (cloneRecording) return;
  clearCloneRecording();
  els.cloneAudioFile.value = "";
  cloneMediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  cloneRecorderContext = new AudioContext();
  cloneRecorderSource = cloneRecorderContext.createMediaStreamSource(cloneMediaStream);
  cloneRecorderNode = cloneRecorderContext.createScriptProcessor(4096, 1, 1);
  cloneRecordStartedAt = Date.now();
  cloneRecordChunks = [];
  cloneRecorderNode.onaudioprocess = event => {
    if (!cloneRecording) return;
    const input = event.inputBuffer.getChannelData(0);
    cloneRecordChunks.push(downsampleToPcm16(input, cloneRecorderContext.sampleRate));
    const seconds = Math.max(1, Math.round((Date.now() - cloneRecordStartedAt) / 1000));
    setCloneRecordingStatus(`录音中 ${seconds}s`);
  };
  cloneRecorderSource.connect(cloneRecorderNode);
  cloneRecorderNode.connect(cloneRecorderContext.destination);
  cloneRecording = true;
  els.cloneRecordBtn.disabled = true;
  els.cloneStopRecordBtn.disabled = false;
  els.cloneClearRecordingBtn.disabled = true;
  setCloneRecordingStatus("录音中 0s");
}

async function stopCloneRecording() {
  if (!cloneRecording) return;
  cloneRecording = false;
  els.cloneRecordBtn.disabled = false;
  els.cloneStopRecordBtn.disabled = true;
  if (cloneRecorderNode) cloneRecorderNode.disconnect();
  if (cloneRecorderSource) cloneRecorderSource.disconnect();
  if (cloneMediaStream) cloneMediaStream.getTracks().forEach(track => track.stop());
  if (cloneRecorderContext) await cloneRecorderContext.close().catch(() => {});
  cloneRecorderNode = null;
  cloneRecorderSource = null;
  cloneMediaStream = null;
  cloneRecorderContext = null;

  const pcmBytes = mergeUint8Arrays(cloneRecordChunks);
  if (!pcmBytes.length) {
    clearCloneRecording();
    setCloneRecordingStatus("未录到声音", "error");
    return;
  }
  const wavBytes = encodeWavFromPcm16(pcmBytes, 16000);
  if (wavBytes.length > MAX_VOICE_CLONE_AUDIO_BYTES) {
    clearCloneRecording();
    setCloneRecordingStatus("录音超过 10MB，请缩短后重录", "error");
    return;
  }
  const seconds = Math.max(1, Math.round((Date.now() - cloneRecordStartedAt) / 1000));
  cloneRecordedAudio = {bytes: wavBytes, format: "wav", seconds};
  cloneRecordChunks = [];
  els.cloneClearRecordingBtn.disabled = false;
  setCloneRecordingStatus(`已录音 ${seconds}s · ${formatBytes(wavBytes.length)}`, "ready");
}

async function currentCloneAudioPayload() {
  const file = els.cloneAudioFile.files && els.cloneAudioFile.files[0];
  if (file) {
    if (file.size > MAX_VOICE_CLONE_AUDIO_BYTES) throw new Error("训练音频不能超过 10MB");
    const format = guessAudioFormat(file);
    if (!format) throw new Error("无法识别音频格式，请使用 wav、mp3、ogg、m4a、aac 或 pcm");
    return {
      audio: {data: await fileToBase64(file), format},
      bytes: file.size,
      source: `file:${file.name}`,
      format,
    };
  }
  if (cloneRecordedAudio) {
    return {
      audio: {data: bytesToBase64(cloneRecordedAudio.bytes), format: cloneRecordedAudio.format},
      bytes: cloneRecordedAudio.bytes.length,
      source: "recording",
      format: cloneRecordedAudio.format,
    };
  }
  throw new Error("请选择训练音频或先录音");
}

function cloneVoiceFromApi(voice, form, source) {
  return {
    id: voice && voice.id ? voice.id : form.id,
    label: form.id,
    mode: "speaker",
    status: voice ? voice.status : null,
    statusName: voice ? voice.status_name : "",
    language: 0,
    createTime: voice ? voice.create_time : null,
    source,
  };
}

function syncWebSearchControls() {
  const needsKey = els.enableWebSearch.checked && webSearchTypeNeedsKey();
  els.webSearchType.disabled = !els.enableWebSearch.checked;
  els.webSearchApiKeyField.hidden = !needsKey;
  els.webSearchApiKey.disabled = !needsKey;
  els.webSearchApiKey.placeholder = needsKey ? "请输入 volc_websearch_api_key" : "联网关闭时无需填写";
}

function webSearchTypeNeedsKey() {
  return ["web_custom_api", "web_global_api"].includes(els.webSearchType.value);
}

function syncMusicControls() {
  const musicDisabled = isMusicForcedOffVoice();
  if (musicDisabled) els.enableMusic.checked = false;
  els.enableMusic.disabled = musicDisabled;
  els.enableMusic.nextElementSibling.textContent = musicDisabled ? "唱歌（复刻音色不支持）" : "唱歌";
}

els.enableWebSearch.addEventListener("change", syncWebSearchControls);
els.webSearchType.addEventListener("change", syncWebSearchControls);
syncWebSearchControls();
renderCloneVoiceList();
initResizableColumns();
els.voice.addEventListener("change", () => {
  syncMusicControls();
  syncCloneFormFromSelectedVoice();
});
syncMusicControls();

els.cloneAudioFile.addEventListener("change", () => {
  if (els.cloneAudioFile.files && els.cloneAudioFile.files[0]) {
    clearCloneRecording();
    const file = els.cloneAudioFile.files[0];
    setCloneRecordingStatus(`已选择文件 · ${formatBytes(file.size)}`, "ready");
  } else {
    setCloneRecordingStatus("未录音");
  }
});

function trimmedValue(input) {
  return (input.value || "").trim();
}

function parseOptionalCoordinate(input, label, low, high) {
  const raw = trimmedValue(input);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < low || value > high) {
    throw new Error(`${label} 必须是 ${low} 到 ${high} 之间的数字`);
  }
  return value;
}

function currentLocationConfig() {
  const location = {};
  const longitude = parseOptionalCoordinate(els.locationLongitude, "经度 longitude", -180, 180);
  const latitude = parseOptionalCoordinate(els.locationLatitude, "纬度 latitude", -90, 90);
  if (longitude !== null) location.longitude = longitude;
  if (latitude !== null) location.latitude = latitude;

  [
    ["address", els.locationAddress],
    ["city", els.locationCity],
    ["province", els.locationProvince],
    ["district", els.locationDistrict],
    ["town", els.locationTown],
    ["country", els.locationCountry],
    ["country_code", els.locationCountryCode],
  ].forEach(([key, input]) => {
    const value = trimmedValue(input);
    if (value) location[key] = value;
  });

  return Object.keys(location).length ? location : null;
}

function updateLocationStatus(text, state = "") {
  if (text) {
    els.locationStatus.textContent = text;
  } else {
    const hasValue = [
      els.locationLongitude,
      els.locationLatitude,
      els.locationAddress,
      els.locationCity,
      els.locationProvince,
      els.locationDistrict,
      els.locationTown,
      els.locationCountry,
      els.locationCountryCode,
    ].some(input => trimmedValue(input));
    els.locationStatus.textContent = hasValue ? "已设置" : "未设置";
    state = hasValue ? "ready" : "";
  }
  els.locationStatus.classList.toggle("ready", state === "ready");
  els.locationStatus.classList.toggle("error", state === "error");
}

function pickAddressPart(address, keys) {
  for (const key of keys) {
    const value = address && address[key];
    if (value) return value;
  }
  return "";
}

async function reverseGeocodeLocation(latitude, longitude) {
  const seq = ++reverseGeocodeSeq;
  updateLocationStatus("正在解析省市区");
  try {
    const url = new URL(NOMINATIM_REVERSE_URL);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", latitude);
    url.searchParams.set("lon", longitude);
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "zh-CN,zh,en");
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`reverse geocode failed: ${resp.status}`);
    const data = await resp.json();
    if (seq !== reverseGeocodeSeq) return;

    const address = data.address || {};
    els.locationAddress.value = data.display_name || trimmedValue(els.locationAddress);
    els.locationCountry.value = pickAddressPart(address, ["country"]) || trimmedValue(els.locationCountry);
    els.locationCountryCode.value = (pickAddressPart(address, ["country_code"]) || trimmedValue(els.locationCountryCode)).toUpperCase();
    els.locationProvince.value = pickAddressPart(address, ["state", "province", "region"]) || trimmedValue(els.locationProvince);
    els.locationCity.value = pickAddressPart(address, ["city", "municipality", "county", "town", "village"]) || trimmedValue(els.locationCity);
    els.locationDistrict.value = pickAddressPart(address, ["city_district", "district", "borough", "suburb", "county"]) || trimmedValue(els.locationDistrict);
    els.locationTown.value = pickAddressPart(address, ["town", "village", "suburb", "neighbourhood"]) || trimmedValue(els.locationTown);
    updateLocationStatus("已解析", "ready");
    scheduleSessionUpdate();
  } catch (err) {
    if (seq !== reverseGeocodeSeq) return;
    updateLocationStatus("已设置经纬度，省市区解析失败，可手动填写", "error");
    scheduleSessionUpdate();
  }
}

function setLocationCoordinates(latitude, longitude, zoom = 13, options = {}) {
  els.locationLatitude.value = Number(latitude).toFixed(6);
  els.locationLongitude.value = Number(longitude).toFixed(6);
  updateLocationStatus("已设置", "ready");
  if (locationMap && window.L) {
    const point = [Number(latitude), Number(longitude)];
    if (!locationMarker) {
      locationMarker = window.L.marker(point, {draggable: true}).addTo(locationMap);
      locationMarker.on("dragend", () => {
        const pos = locationMarker.getLatLng();
        setLocationCoordinates(pos.lat, pos.lng, locationMap.getZoom(), {reverseGeocode: true});
      });
    } else {
      locationMarker.setLatLng(point);
    }
    locationMap.setView(point, zoom);
  }
  scheduleSessionUpdate();
  if (options.reverseGeocode) {
    reverseGeocodeLocation(els.locationLatitude.value, els.locationLongitude.value);
  }
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS_URL;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS_URL;
    script.async = true;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("地图插件加载失败，可手动输入位置信息"));
    script.onerror = () => reject(new Error("地图插件加载失败，可手动输入位置信息"));
    document.head.appendChild(script);
  });
  return leafletLoadPromise;
}

async function ensureLocationMap() {
  const L = await loadLeaflet();
  if (!locationMap) {
    const latitudeRaw = trimmedValue(els.locationLatitude);
    const longitudeRaw = trimmedValue(els.locationLongitude);
    const latitude = latitudeRaw ? Number(latitudeRaw) : 35.8617;
    const longitude = longitudeRaw ? Number(longitudeRaw) : 104.1954;
    const zoom = latitudeRaw && longitudeRaw ? 12 : 4;
    locationMap = L.map(els.locationMap).setView([latitude, longitude], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(locationMap);
    locationMap.on("click", evt => setLocationCoordinates(evt.latlng.lat, evt.latlng.lng, locationMap.getZoom(), {reverseGeocode: true}));
    if (latitudeRaw && longitudeRaw) {
      setLocationCoordinates(latitude, longitude, zoom);
    }
  }
  window.setTimeout(() => locationMap.invalidateSize(), 0);
}

[
  els.locationLongitude,
  els.locationLatitude,
  els.locationAddress,
  els.locationCity,
  els.locationProvince,
  els.locationDistrict,
  els.locationTown,
  els.locationCountry,
  els.locationCountryCode,
].forEach(input => input.addEventListener("input", () => {
  updateLocationStatus();
  scheduleSessionUpdate();
}));
updateLocationStatus();

els.openLocationMapBtn.addEventListener("click", async () => {
  els.locationMapPanel.hidden = !els.locationMapPanel.hidden;
  if (els.locationMapPanel.hidden) return;
  updateLocationStatus("地图加载中");
  try {
    await ensureLocationMap();
    updateLocationStatus();
  } catch (err) {
    updateLocationStatus(err.message, "error");
  }
});

els.useBrowserLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    updateLocationStatus("浏览器不支持定位，可手动输入", "error");
    return;
  }
  updateLocationStatus("定位中");
  navigator.geolocation.getCurrentPosition(
    position => setLocationCoordinates(position.coords.latitude, position.coords.longitude, 14, {reverseGeocode: true}),
    err => updateLocationStatus(err.message || "定位失败，可手动输入", "error"),
    {enableHighAccuracy: true, timeout: 10000}
  );
});

els.clearLocationBtn.addEventListener("click", () => {
  reverseGeocodeSeq += 1;
  [
    els.locationLongitude,
    els.locationLatitude,
    els.locationAddress,
    els.locationCity,
    els.locationProvince,
    els.locationDistrict,
    els.locationTown,
    els.locationCountry,
    els.locationCountryCode,
  ].forEach(input => {
    input.value = "";
  });
  if (locationMarker && locationMap) {
    locationMap.removeLayer(locationMarker);
    locationMarker = null;
  }
  updateLocationStatus();
  scheduleSessionUpdate();
});

function syncRangeValue(input, output) {
  output.value = clampNumber(input.value, Number(input.min), Number(input.max), 0);
}

function setHeroState(text, state = "") {
  els.heroCallState.textContent = text;
  if (els.callStateBubble) els.callStateBubble.textContent = text;
  els.heroCallState.classList.toggle("ok", state === "ok");
  els.heroCallState.classList.toggle("error", state === "error");
  els.heroCallState.classList.toggle("listening", state === "listening");
  els.heroCallState.classList.toggle("thinking", state === "thinking");
  els.callHero.classList.toggle("is-live", state === "ok");
  els.callHero.classList.toggle("is-connecting", state === "connecting");
  els.callHero.classList.toggle("is-listening", state === "listening");
  els.callHero.classList.toggle("is-thinking", state === "thinking");
  els.callPage.classList.toggle("is-listening", state === "listening");
  els.callPage.classList.toggle("is-thinking", state === "thinking");
  els.callPage.classList.toggle("is-error", state === "error");
}

function showCallPage() {
  els.callPage.hidden = false;
  els.app.classList.add("call-mode");
  els.app.classList.remove("call-ended");
}

function showHomePage() {
  els.app.classList.remove("call-mode");
  els.app.classList.remove("call-ended");
  els.callPage.hidden = true;
}

function showEndedPage() {
  els.callPage.hidden = false;
  els.app.classList.remove("call-mode");
  els.app.classList.add("call-ended");
}

function rememberQaScroll() {
  preservedQaScrollTop = els.messages.scrollTop;
}

function restoreQaScroll() {
  if (preservedQaScrollTop === null) return;
  const top = preservedQaScrollTop;
  preservedQaScrollTop = null;
  requestAnimationFrame(() => {
    els.messages.scrollTop = top;
    requestAnimationFrame(() => {
      els.messages.scrollTop = top;
    });
  });
}

function formatCallDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateCallDuration() {
  const elapsed = callStartedAt ? Date.now() - callStartedAt : 0;
  els.callDuration.textContent = formatCallDuration(elapsed);
}

function startCallTimer() {
  callStartedAt = Date.now();
  window.clearInterval(callDurationTimer);
  updateCallDuration();
  callDurationTimer = window.setInterval(updateCallDuration, 1000);
}

function stopCallTimer() {
  window.clearInterval(callDurationTimer);
  callDurationTimer = null;
  callStartedAt = 0;
  updateCallDuration();
}

function clearInputAudioBuffer() {
  audioFrameChunks = [];
  audioFrameBufferedBytes = 0;
}

function appendInputAudio(bytes) {
  if (!bytes || !bytes.length) return;
  audioFrameChunks.push(bytes.slice());
  audioFrameBufferedBytes += bytes.length;
}

function readInputAudioBytes(target, byteCount) {
  let offset = 0;
  while (offset < byteCount && audioFrameChunks.length) {
    const chunk = audioFrameChunks[0];
    const take = Math.min(byteCount - offset, chunk.length);
    target.set(chunk.subarray(0, take), offset);
    offset += take;
    audioFrameBufferedBytes -= take;
    if (take === chunk.length) {
      audioFrameChunks.shift();
    } else {
      audioFrameChunks[0] = chunk.subarray(take);
    }
  }
  return offset;
}

function takeInputAudioFrame() {
  if (audioFrameBufferedBytes < INPUT_AUDIO_FRAME_BYTES) return null;
  const frame = new Uint8Array(INPUT_AUDIO_FRAME_BYTES);
  readInputAudioBytes(frame, INPUT_AUDIO_FRAME_BYTES);
  return frame;
}

function nextInputAudioFrame() {
  if (!recording || micMuted) return SILENCE_FRAME_BYTES;
  return takeInputAudioFrame() || SILENCE_FRAME_BYTES;
}

function sendNextInputAudioFrame() {
  if (!sessionId) {
    stopInputAudioFramePump();
    return;
  }
  queueAudio(nextInputAudioFrame());
}

function startInputAudioFramePump() {
  if (audioFrameTimer || !sessionId) return;
  sendNextInputAudioFrame();
  audioFrameTimer = window.setInterval(sendNextInputAudioFrame, INPUT_AUDIO_FRAME_MS);
}

function stopInputAudioFramePump({clearBuffer = true} = {}) {
  window.clearInterval(audioFrameTimer);
  audioFrameTimer = null;
  if (clearBuffer) clearInputAudioBuffer();
}

async function drainInputAudioBuffer({pace = true} = {}) {
  let remaining = audioFrameBufferedBytes;
  while (sessionId && remaining > 0) {
    const frame = new Uint8Array(INPUT_AUDIO_FRAME_BYTES);
    const take = Math.min(INPUT_AUDIO_FRAME_BYTES, remaining);
    readInputAudioBytes(frame, take);
    remaining -= take;
    queueAudio(frame);
    if (pace) await new Promise(resolve => window.setTimeout(resolve, INPUT_AUDIO_FRAME_MS));
  }
}

function startSilentAudio() {
  startInputAudioFramePump();
}

function stopSilentAudio() {
  stopInputAudioFramePump();
}

function updateMicUi() {
  els.recordBtn.classList.toggle("mic-muted", micMuted);
  els.recordBtn.classList.toggle("mic-on", !micMuted);
  els.recordBtn.setAttribute("aria-label", micMuted ? "麦克风已关，点击打开" : "关闭麦克风");
  els.recordBtn.setAttribute("title", micMuted ? "麦克风已关，点击打开" : "关闭麦克风");
  els.recordHint.textContent = "";
}

function currentOutputAudioConfig() {
  return {
    voice: els.voice.value.trim(),
    model: FIXED_MODEL,
    output_format: DEFAULT_OUTPUT_FORMAT,
    speed: clampNumber(els.speed.value, -50, 100, 0),
    loudness: clampNumber(els.loudness.value, -50, 100, 0),
  };
}

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generateDialogId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return fallbackUuid();
}

function setDialogId(value) {
  els.dialogId.value = String(value || "").trim();
  localStorage.setItem(DIALOG_ID_STORAGE_KEY, els.dialogId.value);
  els.dialogId.dispatchEvent(new Event("input", {bubbles: true}));
  els.dialogId.dispatchEvent(new Event("change", {bubbles: true}));
}

function currentDialogId() {
  const value = els.dialogId.value.trim();
  if (/\s/.test(value)) throw new Error("Dialog ID 不能包含空白字符");
  return value;
}

function currentRuntimeConfig() {
  return {
    ...currentOutputAudioConfig(),
    ...currentToolsConfig(),
    enable_music: els.enableMusic.checked && !isMusicForcedOffVoice(),
    instructions: els.instructions.value,
    location: currentLocationConfig(),
  };
}

function currentCreateConfig() {
  if (els.enableWebSearch.checked && webSearchTypeNeedsKey() && !els.webSearchApiKey.value.trim()) {
    throw new Error(`${els.webSearchType.value} 需要填写搜索 API Key`);
  }
  return {
    ...currentRuntimeConfig(),
    dialog_id: currentDialogId(),
    enable_websearch: els.enableWebSearch.checked,
    volc_websearch_type: els.webSearchType.value,
    volc_websearch_api_key: webSearchTypeNeedsKey() ? els.webSearchApiKey.value.trim() : "",
    enable_music: els.enableMusic.checked && !isMusicForcedOffVoice(),
    enable_proactive_speak: els.enableProactiveSpeak.checked,
    location: currentLocationConfig(),
  };
}

function scheduleSessionUpdate() {
  if (!sessionId) return;
  window.clearTimeout(sessionUpdateTimer);
  sessionUpdateTimer = window.setTimeout(async () => {
    let config;
    try {
      config = currentRuntimeConfig();
    } catch (err) {
      return;
    }
    const configKey = JSON.stringify(config);
    if (configKey === lastRuntimeConfigKey) return;
    lastRuntimeConfigKey = configKey;
    const toolNames = config.tools.map(tool => tool.name || (tool.function || {}).name).filter(Boolean).join(",");
    await postJSON(
      "/api/session_update",
      {session_id: sessionId, ...config},
      {name: "session.update", detail: `voice=${config.voice} speed=${config.speed} loudness=${config.loudness} tools=${config.tools.length}${toolNames ? ` names=${toolNames}` : ""} location=${config.location ? "on" : "off"}`}
    ).catch(err => addMessage("tool", `session.update failed: ${err.message}`));
  }, 250);
}

["change", "input"].forEach(eventName => {
  els.voice.addEventListener(eventName, scheduleSessionUpdate);
  if (els.toolRoot) els.toolRoot.addEventListener(eventName, scheduleSessionUpdate);
  els.enableTools.addEventListener(eventName, scheduleSessionUpdate);
  els.enableMusic.addEventListener(eventName, scheduleSessionUpdate);
  els.instructions.addEventListener(eventName, scheduleSessionUpdate);
});

[
  {input: els.speed, output: els.speedValue, reset: els.speedReset},
  {input: els.loudness, output: els.loudnessValue, reset: els.loudnessReset},
].forEach(({input, output, reset}) => {
  syncRangeValue(input, output);
  ["input", "change"].forEach(eventName => {
    input.addEventListener(eventName, () => {
      syncRangeValue(input, output);
      scheduleSessionUpdate();
    });
  });
  reset.addEventListener("click", () => {
    input.value = "0";
    syncRangeValue(input, output);
    scheduleSessionUpdate();
  });
});

function setConnected(ok, {keepCallPage = false} = {}) {
  els.status.textContent = ok ? "已连接" : "未连接";
  els.status.classList.toggle("ok", ok);
  els.status.classList.remove("error");
  els.connectBtn.disabled = ok;
  els.heroConnectBtn.disabled = ok;
  els.heroConnectBtn.classList.remove("is-starting");
  els.heroConnectText.textContent = ok ? "通话中" : "开始通话";
  setHeroState(ok ? "正在听..." : (keepCallPage ? "通话已结束" : "未连接"), ok ? "listening" : "");
  els.closeBtn.disabled = !ok;
  els.recordBtn.disabled = !ok;
  els.forceCommitBtn.disabled = !ok;
  els.callCloseBtn.disabled = false;
  if (ok) {
    showCallPage();
    startCallTimer();
  } else {
    stopCallTimer();
    stopSilentAudio();
    micMuted = false;
    updateMicUi();
    if (keepCallPage) {
      showEndedPage();
      restoreQaScroll();
    } else {
      showHomePage();
    }
  }
  if (!ok) {
    autoMicStarted = false;
    els.recordHint.textContent = keepCallPage ? "" : "连接后自动请求麦克风权限，全双工持续上行";
  }
}

function setConnecting() {
  els.status.textContent = "连接中";
  els.status.classList.remove("ok", "error");
  els.connectBtn.disabled = true;
  els.heroConnectBtn.disabled = true;
  els.heroConnectBtn.classList.remove("is-starting");
  els.heroConnectText.textContent = "连接中";
  setHeroState("连接中...", "connecting");
  showCallPage();
  updateCallDuration();
  els.closeBtn.disabled = false;
  els.callCloseBtn.disabled = false;
  els.recordBtn.disabled = true;
  els.forceCommitBtn.disabled = true;
}

function clearApiKeyError() {
  els.apiKey.classList.remove("invalid");
  els.apiKeyError.hidden = true;
  if (els.status.classList.contains("error")) {
    els.status.textContent = sessionId ? "已连接" : "未连接";
    els.status.classList.toggle("ok", Boolean(sessionId));
    els.status.classList.remove("error");
    setHeroState(sessionId ? "已连接" : "未连接", sessionId ? "ok" : "");
    els.heroConnectText.textContent = sessionId ? "通话中" : "开始通话";
  }
}

function requireApiKey() {
  if (els.apiKey.value.trim()) {
    clearApiKeyError();
    return true;
  }
  els.apiKey.classList.add("invalid");
  els.apiKeyError.hidden = false;
  els.status.textContent = "缺少 API Key";
  els.status.classList.remove("ok");
  els.status.classList.add("error");
  setHeroState("请先填写 API Key", "error");
  els.heroConnectText.textContent = "开始通话";
  els.apiKey.focus();
  addMessage("tool", "请先填写 API Key，再点击连接");
  showErrorToast("缺少 API Key", "请先填写 API Key，再点击连接");
  return false;
}

function errorText(err) {
  if (!err) return "未知错误";
  if (typeof err === "string") return normalizeErrorMessage(err);
  if (err.message) return normalizeErrorMessage(err.message);
  try {
    return normalizeErrorMessage(JSON.stringify(err));
  } catch {
    return String(err);
  }
}

function normalizeErrorMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "未知错误";
  const bodyMark = text.includes("body:") ? "body:" : (text.includes("body=") ? "body=" : "");
  const bodyIndex = bodyMark ? text.indexOf(bodyMark) : -1;
  if (bodyIndex < 0) return text;
  const prefix = text.slice(0, bodyIndex).trim();
  const body = text.slice(bodyIndex + bodyMark.length).trim();
  try {
    const parsed = JSON.parse(body);
    const error = parsed && parsed.error ? parsed.error : parsed;
    const details = [
      error && error.message ? `原因: ${error.message}` : "",
      error && error.code ? `错误码: ${error.code}` : "",
      error && error.type ? `类型: ${error.type}` : "",
      prefix,
      `原始响应: ${body}`,
    ].filter(Boolean);
    return details.join("\n");
  } catch {
    return text;
  }
}

function showErrorToast(title, err, options = {}) {
  const message = errorText(err);
  els.errorToastTitle.textContent = title || "操作失败";
  els.errorToastMessage.textContent = message;
  errorToastEndCallOnClose = Boolean(options.endCallOnClose);
  els.errorToast.hidden = false;
  window.clearTimeout(errorToastTimer);
  const duration = Number.isFinite(options.duration) ? options.duration : 0;
  if (duration > 0) {
    errorToastTimer = window.setTimeout(() => {
      els.errorToast.hidden = true;
      errorToastEndCallOnClose = false;
    }, duration);
  }
}

function closeErrorToast() {
  window.clearTimeout(errorToastTimer);
  els.errorToast.hidden = true;
  const shouldEndCall = errorToastEndCallOnClose || Boolean(sessionId || source);
  errorToastEndCallOnClose = false;
  if (shouldEndCall) endCallAfterErrorToast().catch(() => {});
}

async function endCallAfterErrorToast() {
  rememberQaScroll();
  await stopRecording({commit: false, hint: "通话已结束，实时收音已停止"}).catch(() => {});
  if (pcmPlayer) await pcmPlayer.stop().catch(() => {});
  if (source) {
    source.close();
    source = null;
  }
  const closingSessionId = sessionId;
  sessionId = "";
  lastRuntimeConfigKey = "";
  keepCallPageOnDisconnect = false;
  setConnected(false);
  if (closingSessionId) {
    await postJSON("/api/close", {session_id: closingSessionId}, {name: "session.close"}).catch(() => {});
  }
}

async function postJSON(url, payload, eventMeta = null) {
  if (eventMeta) logEventLine("up", eventMeta.name, eventMeta.detail || "");
  const resp = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
  const data = await resp.json();
  if (!resp.ok || data.ok === false) throw new Error(data.error || resp.statusText);
  return data;
}

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  els.messages.appendChild(div);
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
  return div;
}

function currentQaSearchQuery() {
  return (els.qaSearchInput.value || "").trim();
}

function clearQaSearchHighlights(root) {
  root.querySelectorAll("mark.qa-search-mark").forEach(mark => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
  root.normalize();
}

function countTextMatches(text, query) {
  if (!query) return 0;
  const source = String(text || "").toLowerCase();
  const target = query.toLowerCase();
  let count = 0;
  let index = 0;
  while (target && (index = source.indexOf(target, index)) !== -1) {
    count += 1;
    index += target.length;
  }
  return count;
}

function highlightQaText(root, query) {
  if (!query) return 0;
  const target = query.toLowerCase();
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if ((node.parentElement || {}).closest("mark.qa-search-mark")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.toLowerCase().includes(target) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let count = 0;
  nodes.forEach(node => {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = lower.indexOf(target);
    while (index !== -1) {
      if (index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, index)));
      const mark = document.createElement("mark");
      mark.className = "qa-search-mark";
      mark.textContent = text.slice(index, index + query.length);
      fragment.appendChild(mark);
      count += 1;
      cursor = index + query.length;
      index = lower.indexOf(target, cursor);
    }
    if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
    node.replaceWith(fragment);
  });
  return count;
}

function scrollQaItemIntoView(item) {
  if (!item) return;
  const messageRect = els.messages.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  els.messages.scrollTop = Math.max(0, els.messages.scrollTop + itemRect.top - messageRect.top - 10);
}

function scrollMessagesAfterQaUpdate() {
  if (currentQaSearchQuery()) return;
  els.messages.scrollTop = els.messages.scrollHeight;
}

function applyQaSearch({scrollToFirst = false} = {}) {
  const query = currentQaSearchQuery();
  let matchedItems = 0;
  let matchCount = 0;
  let firstMatch = null;

  Array.from(els.messages.children).forEach(item => {
    clearQaSearchHighlights(item);
    const count = countTextMatches(item.textContent, query);
    const matched = !query || count > 0;
    item.hidden = !matched;
    item.classList.toggle("qa-search-hit", Boolean(query && matched));
    if (query && matched) {
      matchedItems += 1;
      matchCount += highlightQaText(item, query);
      if (!firstMatch) firstMatch = item;
    }
  });

  els.messages.classList.toggle("qa-searching", Boolean(query));
  els.messages.classList.toggle("qa-search-no-match", Boolean(query && matchedItems === 0));
  if (els.qaSearchStatus) {
    els.qaSearchStatus.textContent = query
      ? (matchedItems ? `${matchedItems} 条 / ${matchCount} 处` : "无匹配")
      : "";
  }
  if (scrollToFirst) scrollQaItemIntoView(firstMatch);
  return {query, matchedItems, matchCount, firstMatch};
}

function extractEventText(event) {
  return event.text || event.delta || event.transcript || event.content || "";
}

function extractLogid(payload) {
  if (!payload) return "";
  return payload.logid || payload.log_id || payload["X-Tt-Logid"] || payload["x-tt-logid"] || "";
}

function updateCurrentLogid(payload) {
  const logid = extractLogid(payload);
  if (!logid) return;
  currentLogid = logid;
  if (currentTurn && currentTurn.logidEl) {
    currentTurn.logidEl.textContent = `logid: ${currentLogid}`;
  }
}

function ensureTurn() {
  showCallPage();
  if (currentTurn && !currentTurn.done) return currentTurn;
  const card = document.createElement("div");
  card.className = "qa-card";
  card.innerHTML = [
    `<div class="qa-meta">logid: ${currentLogid || "等待中"}</div>`,
    '<div class="qa-row">',
    '<div class="qa-label">Q</div>',
    '<div class="qa-text question">正在听...</div>',
    '</div>',
    '<div class="qa-row">',
    '<div class="qa-label">A</div>',
    '<div class="qa-text answer">等待提问...</div>',
    '</div>',
  ].join("");
  els.messages.appendChild(card);
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
  currentTurn = {
    card,
    logidEl: card.querySelector(".qa-meta"),
    questionEl: card.querySelector(".question"),
    answerEl: card.querySelector(".answer"),
    question: "",
    answer: "",
    done: false,
  };
  lastTurn = currentTurn;
  return currentTurn;
}

function resetTurnForSpeech() {
  if (currentTurn && currentTurn.question && !currentTurn.answer) {
    currentTurn.done = false;
    return;
  }
  if (!currentTurn || currentTurn.question || currentTurn.answer) {
    currentTurn = null;
  }
  const turn = ensureTurn();
  turn.question = "";
  turn.answer = "";
  turn.done = false;
  turn.questionEl.textContent = "正在听...";
  turn.answerEl.textContent = "等待提问...";
  setHeroState("正在听...", "listening");
}

function formatJsonBlock(value) {
  const displayValue = reorderJsonForDisplay(value);
  if (typeof displayValue === "string") return displayValue;
  return JSON.stringify(displayValue, null, 2);
}

function reorderJsonForDisplay(value) {
  if (typeof value === "string") {
    try {
      return reorderJsonForDisplay(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(item => reorderJsonForDisplay(item));
  if (!value || typeof value !== "object") return value;

  let keys = Object.keys(value);
  if (keys.includes("id") && keys.includes("model")) {
    keys = keys.filter(key => key !== "id");
    keys.splice(keys.indexOf("model"), 0, "id");
  }

  return keys.reduce((ordered, key) => {
    ordered[key] = reorderJsonForDisplay(value[key]);
    return ordered;
  }, {});
}

function addJsonDetailsMessage(title, value) {
  const div = document.createElement("div");
  div.className = "bubble tool json-bubble";

  const details = document.createElement("details");
  details.className = "json-details";

  const summary = document.createElement("summary");
  summary.textContent = `${title} · 查看 JSON`;

  const pre = document.createElement("pre");
  pre.textContent = formatJsonBlock(value);

  details.append(summary, pre);
  div.appendChild(details);
  els.messages.appendChild(div);
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
  return div;
}

function appendToolResult(msg) {
  if (!currentTurn) {
    addMessage("tool", `FC ${msg.name}\nargs: ${msg.arguments}\nresult: ${JSON.stringify(msg.result, null, 2)}`);
    return;
  }
  const details = document.createElement("details");
  details.className = "qa-tool";

  const summary = document.createElement("summary");
  summary.textContent = `FC ${msg.name || "tool"} · 查看 JSON`;

  const pre = document.createElement("pre");
  pre.textContent = [
    "args:",
    formatJsonBlock(msg.arguments),
    "",
    "result:",
    formatJsonBlock(msg.result),
  ].join("\n");

  details.append(summary, pre);
  currentTurn.card.appendChild(details);
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
}

function firstUsageObject(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return null;
  if (value.usage && typeof value.usage === "object") return value.usage;
  for (const child of Object.values(value)) {
    const usage = firstUsageObject(child, depth + 1);
    if (usage) return usage;
  }
  return null;
}

function flattenUsage(value, prefix = "", rows = []) {
  if (!value || typeof value !== "object") return rows;
  Object.entries(value).forEach(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenUsage(child, path, rows);
    } else if (child !== undefined && child !== null && child !== "") {
      rows.push([path, child]);
    }
  });
  return rows;
}

function responseDoneUsageSummary(event) {
  const usage = firstUsageObject(event);
  if (!usage) return "";
  const rows = flattenUsage(usage);
  const preferred = ["total_tokens", "input_tokens", "output_tokens", "text_tokens", "audio_tokens"];
  const selected = [];
  preferred.forEach(name => {
    const row = rows.find(([path]) => path === name || path.endsWith(`.${name}`));
    if (row && !selected.some(([path]) => path === row[0])) selected.push(row);
  });
  rows.forEach(row => {
    if (selected.length < 6 && !selected.some(([path]) => path === row[0])) selected.push(row);
  });
  return selected.slice(0, 6).map(([path, value]) => `${path}=${value}`).join(" ");
}

function appendResponseDoneDetails(event) {
  const turn = currentTurn || lastTurn;
  if (!turn || !turn.card) {
    addJsonDetailsMessage("response.done", event);
    return;
  }
  const details = document.createElement("details");
  details.className = "qa-tool";

  const summary = document.createElement("summary");
  const usageSummary = responseDoneUsageSummary(event);
  summary.textContent = `response.done${usageSummary ? ` · ${usageSummary}` : ""} · 查看 JSON`;

  const pre = document.createElement("pre");
  pre.textContent = formatJsonBlock(event);

  details.append(summary, pre);
  turn.card.appendChild(details);
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
}

function setQuestion(text) {
  const turn = ensureTurn();
  if (text) turn.question = text;
  turn.questionEl.textContent = turn.question || "未获取到识别文本";
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
}

function setThinking() {
  const turn = ensureTurn();
  turn.answerEl.textContent = "正在思考...";
  setHeroState("正在思考...", "thinking");
}

function appendAnswer(text) {
  if (!text) return;
  const turn = ensureTurn();
  turn.answer += text;
  turn.answerEl.textContent = turn.answer;
  setHeroState("正在回复...", "ok");
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
}

function finishAnswer(text) {
  const turn = ensureTurn();
  if (text) turn.answer = text;
  turn.answerEl.textContent = turn.answer || "未获取到回复文本";
  turn.done = true;
  lastTurn = turn;
  currentTurn = null;
  setHeroState(recording && !micMuted ? "正在听..." : "已连接", sessionId ? (recording && !micMuted ? "listening" : "ok") : "");
  applyQaSearch();
  scrollMessagesAfterQaUpdate();
}

function formatClock(ts = Date.now()) {
  const date = new Date(ts);
  return date.toLocaleTimeString("zh-CN", {hour12: false}) + `.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function summarizePayload(payload) {
  if (!payload) return "";
  const parts = [];
  if (payload.event_id) parts.push(`event_id=${payload.event_id}`);
  if (payload.session_id) parts.push(`session=${String(payload.session_id).slice(0, 8)}`);
  if (payload.logid) parts.push(`logid=${payload.logid}`);
  if (payload.status) parts.push(`status=${payload.status}`);
  const text = extractEventText(payload);
  if (text) parts.push(`text=${JSON.stringify(text.length > 80 ? text.slice(0, 80) + "..." : text)}`);
  if (payload.audio) parts.push(`audio_b64=${payload.audio.length}`);
  if (payload.items) parts.push(`items=${Array.isArray(payload.items) ? payload.items.length : 1}`);
  if (payload.name) parts.push(`name=${payload.name}`);
  if (payload.message) parts.push(`message=${JSON.stringify(payload.message)}`);
  return parts.join(" ");
}

function summarizeResponseTextDone(event) {
  const parts = [];
  if (event.event_id) parts.push(`event_id=${event.event_id}`);
  if (event.logid) parts.push(`logid=${event.logid}`);
  const text = extractEventText(event);
  if (text) {
    parts.push(`text_chars=${text.length}`);
    parts.push(`preview=${JSON.stringify(text.length > 60 ? text.slice(0, 60) + "..." : text)}`);
  }
  return parts.join(" ");
}

function logEventLine(direction, name, detail = "") {
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "•";
  eventLines.push(`${formatClock()} ${arrow} ${name}${detail ? `  ${detail}` : ""}`);
  if (eventLines.length > 300) eventLines = eventLines.slice(-300);
  els.events.textContent = eventLines.join("\n");
  els.events.scrollTop = els.events.scrollHeight;
}

function logResponseTextDelta(event) {
  const text = extractEventText(event);
  responseTextDeltaCount += 1;
  responseTextDeltaChars += text.length;

  const now = Date.now();
  if (now - lastResponseTextEventAt < RESPONSE_TEXT_LOG_INTERVAL_MS) return;

  logEventLine("down", event.type || "response.output_text.delta", `chunk_nums=${responseTextDeltaCount} text_chars=${responseTextDeltaChars}`);
  responseTextDeltaCount = 0;
  responseTextDeltaChars = 0;
  lastResponseTextEventAt = now;
}

function flushResponseTextDelta() {
  if (responseTextDeltaCount <= 0) return;
  logEventLine("down", "response.output_text.delta", `chunk_nums=${responseTextDeltaCount} text_chars=${responseTextDeltaChars}`);
  responseTextDeltaCount = 0;
  responseTextDeltaChars = 0;
}

function resetResponseAudioDelta() {
  responseAudioDeltaCount = 0;
  responseAudioDeltaBytes = 0;
  lastResponseAudioEventAt = Date.now();
}

function logResponseAudioDelta(event) {
  const audio = event.audio || event.delta || "";
  responseAudioDeltaCount += 1;
  responseAudioDeltaBytes += audio.length;

  const now = Date.now();
  if (now - lastResponseAudioEventAt < RESPONSE_AUDIO_LOG_INTERVAL_MS) return;

  logEventLine("down", event.type || "response.output_audio.delta", `chunk_nums=${responseAudioDeltaCount} audio_b64=${responseAudioDeltaBytes}`);
  responseAudioDeltaCount = 0;
  responseAudioDeltaBytes = 0;
  lastResponseAudioEventAt = now;
}

function flushResponseAudioDelta() {
  if (responseAudioDeltaCount <= 0) return;
  logEventLine("down", "response.output_audio.delta", `chunk_nums=${responseAudioDeltaCount} audio_b64=${responseAudioDeltaBytes}`);
  responseAudioDeltaCount = 0;
  responseAudioDeltaBytes = 0;
}

function logInboundEvent(msg) {
  if (msg.type === "local.outgoing") {
    const event = msg.event || {};
    logEventLine("up", event.type || "local.outgoing", JSON.stringify(event));
    return;
  }
  if (msg.type === "upstream.event") {
    const event = msg.event || {};
    updateCurrentLogid(event);
    if (event.type === "response.output_text.delta") {
      logResponseTextDelta(event);
      return;
    }
    if (event.type === "response.output_text.done") {
      flushResponseTextDelta();
      logEventLine("down", event.type, summarizeResponseTextDone(event));
      return;
    }
    if (event.type === "response.output_audio.started") {
      resetResponseAudioDelta();
      logEventLine("down", event.type, summarizePayload(event));
      return;
    }
    if (event.type === "response.output_audio.delta") {
      logResponseAudioDelta(event);
      return;
    }
    if (event.type === "response.output_audio.done") {
      flushResponseAudioDelta();
      lastResponseAudioEventAt = 0;
      logEventLine("down", event.type, summarizePayload(event));
      return;
    }
    logEventLine("down", event.type || "upstream.event", summarizePayload(event));
    return;
  }
  updateCurrentLogid(msg);
  logEventLine("local", msg.type || "local.event", summarizePayload(msg));
}

function parseToolsJson() {
  if (!els.enableTools.checked) return [];
  const parsed = validateToolsJson();
  return parsed;
}

function currentToolsConfig() {
  const tools = parseToolsJson();
  return {
    enable_tools: els.enableTools.checked,
    tool_root: currentToolRoot(),
    tools,
  };
}

function currentToolRoot() {
  return els.toolRoot ? els.toolRoot.value.trim() : "";
}

async function trainCloneVoice() {
  if (!requireApiKey()) return;
  const form = currentCloneForm();
  if (cloneRecording) throw new Error("请先停止录音，再开始训练");

  const oldText = els.trainCloneBtn.textContent;
  els.trainCloneBtn.disabled = true;
  els.trainCloneBtn.textContent = "训练中";
  setCloneStatus("训练中");
  try {
    const audioPayload = await currentCloneAudioPayload();
    const data = await postJSON("/api/voice_clone/train", {
      api_key: els.apiKey.value.trim(),
      voice_id: form.id,
      language: 0,
      text: els.clonePromptText.value.trim(),
      demo_text: els.cloneDemoText.value.trim(),
      enable_audio_denoise: els.cloneDenoise.checked,
      disable_volume_normalization: els.cloneKeepVolume.checked,
      include_empty_denoise_model_id: true,
      audio: audioPayload.audio,
    }, {name: "voice_clone.train", detail: `voice=${form.id} source=${audioPayload.source} format=${audioPayload.format} bytes=${audioPayload.bytes}`});
    const cached = upsertCloneVoice(cloneVoiceFromApi(data.voice, form, "train"));
    addJsonDetailsMessage("voice_clone.train", {
      voice: cached,
      logid: data.logid,
      request_id: data.request_id,
      response: data.response,
    });
    if (data.used_insecure_tls) addMessage("tool", "warning: Python TLS trust store rejected the voice clone certificate; demo continued with certificate verification disabled.");
    setCloneStatus(`已保存 ${cached.id}`, "ready");
  } finally {
    els.trainCloneBtn.disabled = false;
    els.trainCloneBtn.textContent = oldText;
  }
}

function importCloneVoice() {
  const form = currentCloneForm();
  const cached = upsertCloneVoice({
    id: form.id,
    label: form.id,
    mode: "speaker",
    status: null,
    language: 0,
    source: "manual",
  });
  addMessage("tool", `已保存声音复刻音色到浏览器缓存：${cached.id}`);
}

async function queryCloneVoiceStatus(target = null) {
  if (!requireApiKey()) return;
  const form = target || currentCloneForm();
  const oldText = els.queryCloneBtn.textContent;
  els.queryCloneBtn.disabled = true;
  els.queryCloneBtn.textContent = "查询中";
  setCloneStatus("查询中");
  try {
    const data = await postJSON("/api/voice_clone/status", {
      api_key: els.apiKey.value.trim(),
      voice_id: form.id,
    }, {name: "voice_clone.status", detail: `voice=${form.id}`});
    const cached = upsertCloneVoice(cloneVoiceFromApi(data.voice, form, "status"), {select: false});
    addJsonDetailsMessage("voice_clone.status", {
      voice: cached,
      logid: data.logid,
      request_id: data.request_id,
      response: data.response,
    });
    if (data.used_insecure_tls) addMessage("tool", "warning: Python TLS trust store rejected the voice clone certificate; demo continued with certificate verification disabled.");
    setCloneStatus(`${cached.id} · ${cloneStatusText(cached.status, cached.statusName)}`, "ready");
  } finally {
    els.queryCloneBtn.disabled = false;
    els.queryCloneBtn.textContent = oldText;
  }
}

function microphoneErrorMessage(err) {
  const raw = err && (err.name || err.message) ? `${err.name || ""} ${err.message || ""}`.trim() : String(err);
  if (/NotAllowed|Permission|denied/i.test(raw)) {
    return [
      "麦克风权限被拒绝。",
      "请在浏览器地址栏/站点设置里允许 http://127.0.0.1:8765 使用麦克风。",
      "如果仍失败，请到 macOS 系统设置 > 隐私与安全性 > 麦克风，允许当前浏览器使用麦克风，然后刷新页面重新连接。",
    ].join("\n");
  }
  if (/NotFound|DevicesNotFound/i.test(raw)) {
    return "没有检测到可用麦克风，请确认系统输入设备可用。";
  }
  return `record failed: ${err.message || raw}`;
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function downsampleToPcm16(input, inputRate, targetRate = 16000) {
  const ratio = inputRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return new Uint8Array(out.buffer);
}

function queueAudio(bytes) {
  if (!sessionId || !bytes.length) return;
  const payload = {session_id: sessionId, audio: bytesToBase64(bytes)};
  audioAppendCount += 1;
  audioAppendBytes += bytes.length;
  const now = Date.now();
  const shouldLog = now - lastAudioEventAt > 1000;
  if (shouldLog) {
    logEventLine("up", "input_audio_buffer.append", `chunk_nums=${audioAppendCount} pcm_bytes=${audioAppendBytes}`);
    lastAudioEventAt = now;
    audioAppendCount = 0;
    audioAppendBytes = 0;
  }
  sendChain = sendChain.then(() => postJSON("/api/audio", payload)).catch(err => {
    addMessage("tool", `audio send failed: ${err.message}`);
  });
}

function flushAudioAppendEvent() {
  if (audioAppendCount <= 0) return;
  logEventLine("up", "input_audio_buffer.append", `chunk_nums=${audioAppendCount} pcm_bytes=${audioAppendBytes}`);
  audioAppendCount = 0;
  audioAppendBytes = 0;
}

async function forceCommitAudio(detail = "强制判停") {
  if (!sessionId) return;
  const shouldRestartPump = Boolean(audioFrameTimer && recording);
  stopInputAudioFramePump({clearBuffer: false});
  await drainInputAudioBuffer();
  await sendChain;
  flushAudioAppendEvent();
  await postJSON(
    "/api/audio_commit",
    {session_id: sessionId},
    {name: "input_audio_buffer.commit", detail}
  ).catch(err => addMessage("tool", err.message));
  if (shouldRestartPump && sessionId) startInputAudioFramePump();
}

async function startRecording() {
  if (recording || !sessionId) return;
  clearInputAudioBuffer();
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  recorderContext = new AudioContext();
  recorderSource = recorderContext.createMediaStreamSource(mediaStream);
  recorderNode = recorderContext.createScriptProcessor(RECORDER_BUFFER_SIZE, 1, 1);
  recorderNode.onaudioprocess = event => {
    if (!recording) return;
    if (micMuted) return;
    const input = event.inputBuffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < input.length; i += 1) peak = Math.max(peak, Math.abs(input[i]));
    els.meterFill.style.width = `${Math.min(100, Math.round(peak * 140))}%`;
    appendInputAudio(downsampleToPcm16(input, recorderContext.sampleRate));
  };
  recorderSource.connect(recorderNode);
  recorderNode.connect(recorderContext.destination);
  recording = true;
  startInputAudioFramePump();
  updateMicUi();
  showCallPage();
  setHeroState(micMuted ? "麦克风已关" : "正在听...", micMuted ? "ok" : "listening");
}

async function stopRecording({commit = true, hint = "连接后自动请求麦克风权限，全双工持续上行"} = {}) {
  const hadRecorder = recording || mediaStream || recorderContext || recorderNode || recorderSource || audioFrameTimer;
  if (!hadRecorder) {
    stopInputAudioFramePump();
    updateMicUi();
    els.recordHint.textContent = hint;
    els.meterFill.style.width = "0%";
    return;
  }
  recording = false;
  els.recordHint.textContent = commit ? "正在提交音频" : hint;
  els.meterFill.style.width = "0%";
  stopInputAudioFramePump({clearBuffer: false});
  updateMicUi();
  if (sessionId) setHeroState("已连接", "ok");
  if (recorderNode) recorderNode.disconnect();
  if (recorderSource) recorderSource.disconnect();
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  if (recorderContext) await recorderContext.close().catch(() => {});
  recorderNode = null;
  recorderSource = null;
  mediaStream = null;
  recorderContext = null;
  if (commit) {
    await forceCommitAudio("停止收音");
    els.recordHint.textContent = hint;
  } else {
    clearInputAudioBuffer();
  }
}

async function toggleMicrophone() {
  if (!sessionId) return;
  micMuted = !micMuted;
  updateMicUi();
  if (micMuted) {
    els.meterFill.style.width = "0%";
    clearInputAudioBuffer();
    startInputAudioFramePump();
    setHeroState("麦克风已关", "ok");
    addMessage("tool", "麦克风已关闭，客户端仍每 20ms 发送一包静音帧保持上行。");
    return;
  }
  clearInputAudioBuffer();
  startInputAudioFramePump();
  setHeroState("正在听...", "listening");
  if (!recording) await startRecording();
}

function base64ToBytes(b64) {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

class PcmStreamPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.ctx = null;
    this.nextPlayTime = 0;
  }

  async start() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext({sampleRate: this.sampleRate});
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.nextPlayTime = Math.max(this.ctx.currentTime + 0.04, this.nextPlayTime || 0);
  }

  async enqueue(bytes) {
    if (!bytes || bytes.length < 2) return;
    await this.start();
    const samples = Math.floor(bytes.length / 2);
    const buffer = this.ctx.createBuffer(1, samples, this.sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < samples; i += 1) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }
    const sourceNode = this.ctx.createBufferSource();
    sourceNode.buffer = buffer;
    sourceNode.connect(this.ctx.destination);
    const startAt = Math.max(this.nextPlayTime, this.ctx.currentTime + 0.01);
    sourceNode.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;
  }

  async stop() {
    if (!this.ctx || this.ctx.state === "closed") return;
    await this.ctx.close().catch(() => {});
    this.ctx = null;
    this.nextPlayTime = 0;
  }
}

class BufferedEncodedAudioPlayer {
  constructor(mimeType) {
    this.mimeType = mimeType;
    this.chunks = [];
    this.audio = null;
    this.objectUrl = "";
    this.stopped = false;
  }

  async enqueue(bytes) {
    if (!bytes || !bytes.length || this.stopped) return;
    this.chunks.push(bytes.slice());
  }

  async finish() {
    if (this.stopped || !this.chunks.length) return;
    const blob = new Blob(this.chunks, {type: this.mimeType});
    this.chunks = [];
    this.objectUrl = URL.createObjectURL(blob);
    this.audio = new Audio(this.objectUrl);
    await this.audio.play();
  }

  async stop() {
    this.stopped = true;
    this.chunks = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = "";
    }
  }
}

class MediaSourceEncodedAudioPlayer {
  constructor(mimeType) {
    this.mimeType = mimeType;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.audio = null;
    this.objectUrl = "";
    this.queue = [];
    this.sourceOpenPromise = null;
    this.ending = false;
    this.stopped = false;
    this.fallback = new BufferedEncodedAudioPlayer(mimeType);
    this.fallbackOnly = false;
  }

  static isSupported(mimeType) {
    const Source = window.MediaSource || window.ManagedMediaSource;
    return Boolean(Source && typeof Source.isTypeSupported === "function" && Source.isTypeSupported(mimeType));
  }

  async start() {
    if (this.audio) {
      if (this.audio.paused) await this.audio.play().catch(() => {});
      return;
    }
    const Source = window.MediaSource || window.ManagedMediaSource;
    this.mediaSource = new Source();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.audio = new Audio();
    this.audio.src = this.objectUrl;
    this.audio.autoplay = true;
    this.sourceOpenPromise = new Promise((resolve, reject) => {
      const onOpen = () => {
        try {
          this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType);
          this.sourceBuffer.mode = "sequence";
          this.sourceBuffer.addEventListener("updateend", () => this.pump());
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      this.mediaSource.addEventListener("sourceopen", onOpen, {once: true});
    });
    await this.audio.play().catch(() => {});
    await this.sourceOpenPromise;
  }

  async enqueue(bytes) {
    if (!bytes || !bytes.length || this.stopped) return;
    if (this.fallbackOnly) {
      await this.fallback.enqueue(bytes);
      return;
    }
    try {
      await this.start();
    } catch {
      this.fallbackOnly = true;
      await this.fallback.enqueue(bytes);
      return;
    }
    this.queue.push(bytes.slice());
    this.pump();
    if (this.audio && this.audio.paused) await this.audio.play().catch(() => {});
  }

  pump() {
    if (this.stopped || !this.sourceBuffer || this.sourceBuffer.updating) return;
    if (this.queue.length) {
      try {
        this.sourceBuffer.appendBuffer(this.queue.shift());
      } catch (err) {
        this.stopped = true;
        addMessage("tool", `ogg opus MediaSource stream failed: ${err.message || err}`);
      }
      return;
    }
    if (this.ending && this.mediaSource && this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {}
    }
  }

  async finish() {
    if (this.fallbackOnly) {
      await this.fallback.finish();
      return;
    }
    this.ending = true;
    await this.sourceOpenPromise.catch(() => {});
    this.pump();
  }

  async stop() {
    this.stopped = true;
    this.queue = [];
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    await this.fallback.stop();
    if (this.mediaSource && this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {}
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = "";
    }
  }
}

class OggOpusDemuxer {
  constructor() {
    this.buffer = new Uint8Array(0);
    this.packetParts = [];
  }

  push(bytes) {
    if (!bytes || !bytes.length) return [];
    this.buffer = concatUint8(this.buffer, bytes);
    const packets = [];
    let offset = 0;
    while (this.buffer.length - offset >= 27) {
      if (!matchesAscii(this.buffer, offset, "OggS")) {
        const next = indexOfAscii(this.buffer, "OggS", offset + 1);
        if (next < 0) break;
        offset = next;
      }
      if (this.buffer.length - offset < 27) break;
      const segmentCount = this.buffer[offset + 26];
      const headerBytes = 27 + segmentCount;
      if (this.buffer.length - offset < headerBytes) break;
      let pageDataBytes = 0;
      for (let i = 0; i < segmentCount; i += 1) pageDataBytes += this.buffer[offset + 27 + i];
      const pageBytes = headerBytes + pageDataBytes;
      if (this.buffer.length - offset < pageBytes) break;
      let dataOffset = offset + headerBytes;
      for (let i = 0; i < segmentCount; i += 1) {
        const segmentBytes = this.buffer[offset + 27 + i];
        if (segmentBytes) this.packetParts.push(this.buffer.slice(dataOffset, dataOffset + segmentBytes));
        dataOffset += segmentBytes;
        if (segmentBytes < 255) {
          packets.push(concatUint8(...this.packetParts));
          this.packetParts = [];
        }
      }
      offset += pageBytes;
    }
    if (offset > 0) this.buffer = this.buffer.slice(offset);
    return packets;
  }
}

class WebCodecsOggOpusPlayer {
  constructor() {
    this.ctx = null;
    this.nextPlayTime = 0;
    this.decoder = null;
    this.demuxer = new OggOpusDemuxer();
    this.fallback = new BufferedEncodedAudioPlayer("audio/ogg; codecs=opus");
    this.fallbackOnly = !("AudioDecoder" in window) || !("EncodedAudioChunk" in window);
    this.decoderReady = false;
    this.decoderInitPromise = null;
    this.timestampUs = 0;
    this.stopped = false;
  }

  async start() {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.nextPlayTime = Math.max(this.ctx.currentTime + 0.04, this.nextPlayTime || 0);
  }

  async enqueue(bytes) {
    if (!bytes || !bytes.length || this.stopped) return;
    if (this.fallbackOnly) {
      await this.fallback.enqueue(bytes);
      return;
    }
    await this.start();
    await this.fallback.enqueue(bytes);
    for (const packet of this.demuxer.push(bytes)) {
      await this.handlePacket(packet);
    }
  }

  async handlePacket(packet) {
    if (!packet.length) return;
    if (matchesAscii(packet, 0, "OpusHead")) {
      await this.configureDecoder(packet);
      return;
    }
    if (matchesAscii(packet, 0, "OpusTags")) return;
    if (!this.decoderReady) {
      await this.configureDecoder(null);
    }
    if (!this.decoderReady || !this.decoder || this.decoder.state === "closed") return;
    const durationUs = opusPacketDurationUs(packet);
    const timestamp = this.timestampUs;
    this.timestampUs += durationUs;
    this.decoder.decode(new EncodedAudioChunk({
      type: "key",
      timestamp,
      duration: durationUs,
      data: packet,
    }));
  }

  async configureDecoder(opusHead) {
    if (this.decoderReady) return;
    if (this.decoderInitPromise) return this.decoderInitPromise;
    this.decoderInitPromise = this.createDecoder(opusHead).finally(() => {
      this.decoderInitPromise = null;
    });
    return this.decoderInitPromise;
  }

  async createDecoder(opusHead) {
    const channels = opusHead && opusHead.length > 9 ? Math.max(1, opusHead[9]) : 1;
    const configs = [
      opusHead ? {codec: "opus", sampleRate: 48000, numberOfChannels: channels, description: opusHead} : null,
      {codec: "opus", sampleRate: 48000, numberOfChannels: channels},
    ].filter(Boolean);
    for (const config of configs) {
      try {
        const support = typeof AudioDecoder.isConfigSupported === "function"
          ? await AudioDecoder.isConfigSupported(config)
          : {supported: true, config};
        if (!support.supported) continue;
        this.decoder = new AudioDecoder({
          output: audioData => this.enqueueAudioData(audioData),
          error: err => {
            this.fallbackOnly = true;
            addMessage("tool", `ogg opus stream decode failed: ${err.message || err}`);
          },
        });
        this.decoder.configure(support.config || config);
        this.decoderReady = true;
        this.fallback.chunks = [];
        return;
      } catch {
        continue;
      }
    }
    this.fallbackOnly = true;
    addMessage("tool", "当前浏览器不支持 WebCodecs Opus 流式解码，已退回整段播放。");
  }

  enqueueAudioData(audioData) {
    if (this.stopped) {
      audioData.close();
      return;
    }
    try {
      const buffer = audioDataToAudioBuffer(this.ctx, audioData);
      const sourceNode = this.ctx.createBufferSource();
      sourceNode.buffer = buffer;
      sourceNode.connect(this.ctx.destination);
      const startAt = Math.max(this.nextPlayTime, this.ctx.currentTime + 0.01);
      sourceNode.start(startAt);
      this.nextPlayTime = startAt + buffer.duration;
    } finally {
      audioData.close();
    }
  }

  async finish() {
    if (this.fallbackOnly) {
      await this.fallback.finish();
      return;
    }
    if (this.decoder && this.decoder.state !== "closed") {
      await this.decoder.flush().catch(() => {});
    }
  }

  async stop() {
    this.stopped = true;
    if (this.decoder && this.decoder.state !== "closed") {
      this.decoder.close();
    }
    this.decoder = null;
    await this.fallback.stop();
    if (this.ctx && this.ctx.state !== "closed") {
      await this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.nextPlayTime = 0;
  }
}

function concatUint8(...arrays) {
  const length = arrays.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const item of arrays) {
    out.set(item, offset);
    offset += item.length;
  }
  return out;
}

function matchesAscii(bytes, offset, text) {
  if (!bytes || bytes.length - offset < text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function indexOfAscii(bytes, text, start = 0) {
  for (let i = start; i <= bytes.length - text.length; i += 1) {
    if (matchesAscii(bytes, i, text)) return i;
  }
  return -1;
}

function opusPacketDurationUs(packet) {
  if (!packet.length) return 20000;
  const config = packet[0] >> 3;
  const code = packet[0] & 0x03;
  let frameCount = 1;
  if (code === 1 || code === 2) frameCount = 2;
  if (code === 3) frameCount = packet.length > 1 ? Math.max(1, packet[1] & 0x3f) : 1;
  let frameSamples;
  if (config < 12) {
    frameSamples = [480, 960, 1920, 2880][config & 0x03];
  } else if (config < 16) {
    frameSamples = [480, 960][config & 0x01];
  } else {
    frameSamples = [120, 240, 480, 960][config & 0x03];
  }
  return Math.max(2500, Math.round(frameSamples * frameCount * 1000000 / 48000));
}

function audioDataToAudioBuffer(ctx, audioData) {
  const frames = audioData.numberOfFrames;
  const channels = audioData.numberOfChannels;
  const buffer = ctx.createBuffer(channels, frames, audioData.sampleRate);
  const format = audioData.format || "f32-planar";
  const planar = format.endsWith("-planar");
  const sampleFormat = planar ? format.slice(0, -7) : format;
  const ArrayType = sampleFormat === "f32" ? Float32Array
    : sampleFormat === "s16" ? Int16Array
    : sampleFormat === "s32" ? Int32Array
    : Uint8Array;

  if (planar) {
    for (let ch = 0; ch < channels; ch += 1) {
      const samples = new ArrayType(frames);
      audioData.copyTo(samples, {planeIndex: ch});
      buffer.copyToChannel(convertSamplesToFloat(samples, sampleFormat), ch);
    }
    return buffer;
  }

  const samples = new ArrayType(frames * channels);
  audioData.copyTo(samples, {planeIndex: 0});
  for (let ch = 0; ch < channels; ch += 1) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < frames; i += 1) {
      channel[i] = sampleToFloat(samples[i * channels + ch], sampleFormat);
    }
  }
  return buffer;
}

function convertSamplesToFloat(samples, format) {
  if (format === "f32") return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = sampleToFloat(samples[i], format);
  return out;
}

function sampleToFloat(sample, format) {
  if (format === "f32") return sample;
  if (format === "s16") return Math.max(-1, sample / 32768);
  if (format === "s32") return Math.max(-1, sample / 2147483648);
  return (sample - 128) / 128;
}

function createOutputAudioPlayer() {
  if (DEFAULT_OUTPUT_FORMAT === "pcm_s16le") return new PcmStreamPlayer(24000);
  if (DEFAULT_OUTPUT_FORMAT === "ogg_opus" && MediaSourceEncodedAudioPlayer.isSupported("audio/ogg; codecs=opus")) {
    return new MediaSourceEncodedAudioPlayer("audio/ogg; codecs=opus");
  }
  if (DEFAULT_OUTPUT_FORMAT === "ogg_opus") return new WebCodecsOggOpusPlayer();
  return new BufferedEncodedAudioPlayer("audio/ogg; codecs=opus");
}

function enqueueOutputAudio(event) {
  if (!pcmPlayer) pcmPlayer = createOutputAudioPlayer();
  const audio = event.audio || event.delta || "";
  if (!audio) return;
  pcmPlayer.enqueue(base64ToBytes(audio)).catch(err => {
    addMessage("tool", `audio playback failed: ${err.message}`);
    showErrorToast("音频播放失败", err);
  });
}

function handleUpstream(msg) {
  const event = msg.event || {};
  switch (event.type) {
    case "conversation.item.input_audio_transcription.started":
      if (pcmPlayer) pcmPlayer.stop().catch(() => {});
      pcmPlayer = null;
      resetTurnForSpeech();
      break;
    case "conversation.item.input_audio_transcription.delta":
      setQuestion(extractEventText(event));
      break;
    case "conversation.item.input_audio_transcription.completed":
      setQuestion(extractEventText(event));
      setThinking();
      break;
    case "conversation.item.input_audio_transcription.failed":
      setQuestion("语音识别失败");
      setHeroState(recording && !micMuted ? "正在听..." : "已连接", recording && !micMuted ? "listening" : "ok");
      break;
    case "response.output_text.delta":
      appendAnswer(extractEventText(event));
      break;
    case "response.output_text.done":
      finishAnswer(extractEventText(event));
      break;
    case "response.done":
      if (currentTurn && currentTurn.answer) finishAnswer("");
      appendResponseDoneDetails(event);
      break;
    case "response.output_audio.started":
      if (pcmPlayer) pcmPlayer.stop().catch(() => {});
      pcmPlayer = createOutputAudioPlayer();
      break;
    case "response.output_audio.delta":
      enqueueOutputAudio(event);
      break;
    case "response.output_audio.done":
      if (pcmPlayer && typeof pcmPlayer.finish === "function") {
        pcmPlayer.finish().catch(err => {
          addMessage("tool", `audio playback failed: ${err.message}`);
          showErrorToast("音频播放失败", err);
        });
      }
      break;
    case "error":
      addMessage("tool", `upstream error: ${JSON.stringify(event, null, 2)}`);
      showErrorToast("上游返回错误", event.message || JSON.stringify(event, null, 2), {duration: 0, endCallOnClose: true});
      break;
    default:
      break;
  }
}

els.cloneRecordBtn.addEventListener("click", evt => {
  evt.preventDefault();
  startCloneRecording().catch(err => {
    els.cloneRecordBtn.disabled = false;
    els.cloneStopRecordBtn.disabled = true;
    setCloneRecordingStatus("录音失败", "error");
    const message = microphoneErrorMessage(err);
    addMessage("tool", message);
    showErrorToast("复刻录音失败", message);
  });
});

els.cloneStopRecordBtn.addEventListener("click", evt => {
  evt.preventDefault();
  stopCloneRecording().catch(err => {
    setCloneRecordingStatus("录音停止失败", "error");
    addMessage("tool", `voice clone record stop failed: ${err.message}`);
    showErrorToast("复刻录音停止失败", err);
  });
});

els.cloneClearRecordingBtn.addEventListener("click", evt => {
  evt.preventDefault();
  clearCloneRecording();
});

els.trainCloneBtn.addEventListener("click", evt => {
  evt.preventDefault();
  trainCloneVoice().catch(err => {
    setCloneStatus("训练失败", "error");
    addMessage("tool", `voice clone train failed: ${err.message}`);
    showErrorToast("声音复刻训练失败", err);
  });
});

els.importCloneBtn.addEventListener("click", evt => {
  evt.preventDefault();
  try {
    importCloneVoice();
  } catch (err) {
    setCloneStatus("保存失败", "error");
    addMessage("tool", err.message);
    showErrorToast("保存声音复刻音色失败", err);
  }
});

els.queryCloneBtn.addEventListener("click", evt => {
  evt.preventDefault();
  queryCloneVoiceStatus().catch(err => {
    setCloneStatus("查询失败", "error");
    addMessage("tool", `voice clone status failed: ${err.message}`);
    showErrorToast("查询声音复刻状态失败", err);
  });
});

els.cloneCachedVoices.addEventListener("click", evt => {
  const button = evt.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".voice-clone-item");
  const voice = row ? cachedCloneVoices.find(item => item.id === row.dataset.voiceId) : null;
  if (!voice) return;
  const action = button.dataset.action;
  if (action === "select") {
    selectCloneVoice(voice.id);
    return;
  }
  if (action === "delete") {
    removeCloneVoice(voice.id);
    addMessage("tool", `已从浏览器缓存删除声音复刻音色：${voice.id}`);
    return;
  }
  if (action === "query") {
    queryCloneVoiceStatus({id: voice.id, mode: voice.mode}).catch(err => {
      setCloneStatus("查询失败", "error");
      addMessage("tool", `voice clone status failed: ${err.message}`);
      showErrorToast("查询声音复刻状态失败", err);
    });
  }
});

els.heroConnectBtn.addEventListener("click", evt => {
  evt.preventDefault();
  if (els.connectBtn.disabled) return;
  if (!requireApiKey()) return;
  window.clearTimeout(heroConnectTimer);
  els.heroConnectBtn.disabled = true;
  els.heroConnectBtn.classList.add("is-starting");
  els.heroConnectText.textContent = "接通中";
  heroConnectTimer = window.setTimeout(() => {
    els.heroConnectBtn.classList.remove("is-starting");
    els.connectBtn.click();
  }, 640);
});

els.connectBtn.addEventListener("click", async () => {
  if (!requireApiKey()) return;
  try {
    keepCallPageOnDisconnect = false;
    await stopRecording({commit: false, hint: "准备连接，实时收音已停止"}).catch(() => {});
    if (pcmPlayer) pcmPlayer.stop().catch(() => {});
    if (source) source.close();
    source = null;
    sessionId = "";
    autoMicStarted = false;
    micMuted = false;
    stopSilentAudio();
    updateMicUi();
    setConnecting();
    const tools = parseToolsJson();
    const createConfig = currentCreateConfig();
    const toolNames = tools.map(tool => tool.name || (tool.function || {}).name).filter(Boolean).join(",");
    const data = await postJSON("/api/session", {
      api_key: els.apiKey.value.trim(),
      ...createConfig,
      tool_root: currentToolRoot(),
      instructions: els.instructions.value,
      enable_tools: els.enableTools.checked,
      tools,
    }, {name: "session.create", detail: `tools=${tools.length}${toolNames ? ` names=${toolNames}` : ""} websearch=${createConfig.enable_websearch ? createConfig.volc_websearch_type : "off"} music=${createConfig.enable_music ? "on" : "off"} proactive=${createConfig.enable_proactive_speak ? "on" : "off"} location=${createConfig.location ? "on" : "off"}`});
    sessionId = data.session_id;
    lastRuntimeConfigKey = JSON.stringify(currentRuntimeConfig());
    currentLogid = "";
    currentTurn = null;
    lastTurn = null;
    els.recordHint.textContent = "连接中，成功后将自动请求麦克风权限";
    addMessage("tool", `session: ${sessionId}${createConfig.dialog_id ? `\ndialog_id: ${createConfig.dialog_id}` : ""}\ntool_root: ${data.tool_root}`);
    source = new EventSource(`/api/events?session_id=${encodeURIComponent(sessionId)}`);
    source.onmessage = evt => {
      const msg = JSON.parse(evt.data);
      logInboundEvent(msg);
      if (msg.type === "local.connected" && !autoMicStarted) {
        autoMicStarted = true;
        setConnected(true);
        startRecording().catch(err => {
          recording = false;
          micMuted = true;
          clearInputAudioBuffer();
          startInputAudioFramePump();
          updateMicUi();
          els.recordHint.textContent = "麦克风启动失败，客户端将继续每 20ms 发送静音帧";
          setHeroState("麦克风已关", "ok");
          const message = microphoneErrorMessage(err);
          addMessage("tool", `${message}\n客户端将继续每 20ms 发送静音帧保持上行。`);
          showErrorToast("麦克风启动失败", message);
        });
      }
      if (msg.type === "local.session_create") {
        addJsonDetailsMessage("session.create", msg.event || {});
      }
      if (msg.type === "local.session_extension") {
        addJsonDetailsMessage("session.create", {type: "session.create", extension: msg.extension || {}});
      }
      if (msg.type === "local.update_diff") {
        addMessage("tool", `session.update diff:\n${JSON.stringify(msg.diff, null, 2)}`);
      }
      if (msg.type === "upstream.event") handleUpstream(msg);
      if (msg.type === "upstream.event" && (msg.event || {}).type === "session.closed") {
        addMessage("tool", "session.closed ack received");
      }
      if (msg.type === "upstream.event" && (msg.event || {}).type === "session.updated") {
        addMessage("tool", "session.updated ack received");
      }
      if (msg.type === "local.tool_result") {
        appendToolResult(msg);
      }
      if (msg.type === "local.warning") addMessage("tool", `warning: ${msg.message}`);
      if (msg.type === "local.error") {
        stopRecording({commit: false, hint: "连接已断开，实时收音已停止"}).catch(() => {});
        if (pcmPlayer) pcmPlayer.stop().catch(() => {});
        if (source) source.close();
        source = null;
        sessionId = "";
        lastRuntimeConfigKey = "";
        keepCallPageOnDisconnect = false;
        setConnected(false);
        const message = [
          `local error: ${msg.message}`,
          msg.status ? `status: ${msg.status}` : "",
          msg.logid ? `logid: ${msg.logid}` : "",
          msg.body ? `body: ${msg.body}` : "",
        ].filter(Boolean).join("\n");
        addMessage("tool", message);
        showErrorToast("通话创建失败", message, {duration: 0, endCallOnClose: true});
      }
      if (msg.type === "local.closed") {
        stopRecording({commit: false, hint: "连接已断开，实时收音已停止"}).catch(() => {});
        if (pcmPlayer) pcmPlayer.stop().catch(() => {});
        if (source) source.close();
        source = null;
        sessionId = "";
        lastRuntimeConfigKey = "";
        setConnected(false, {keepCallPage: keepCallPageOnDisconnect});
        keepCallPageOnDisconnect = false;
      }
    };
    source.onerror = () => {
      if (!sessionId) return;
      stopRecording({commit: false, hint: "连接失败，实时收音已停止"}).catch(() => {});
      if (pcmPlayer) pcmPlayer.stop().catch(() => {});
      addMessage("tool", "event stream disconnected");
      showErrorToast("事件流断开", "event stream disconnected", {endCallOnClose: true});
      sessionId = "";
      lastRuntimeConfigKey = "";
      keepCallPageOnDisconnect = false;
      setConnected(false);
    };
  } catch (err) {
    await stopRecording({commit: false, hint: "连接失败，实时收音已停止"}).catch(() => {});
    if (pcmPlayer) pcmPlayer.stop().catch(() => {});
    sessionId = "";
    lastRuntimeConfigKey = "";
    keepCallPageOnDisconnect = false;
    setConnected(false);
    addMessage("tool", err.message);
    showErrorToast("通话创建失败", err, {duration: 0, endCallOnClose: true});
  }
});

els.closeBtn.addEventListener("click", async () => {
  if (!sessionId) return;
  rememberQaScroll();
  keepCallPageOnDisconnect = true;
  await stopRecording({commit: false, hint: "正在断开，实时收音已停止"}).catch(() => {});
  els.closeBtn.disabled = true;
  els.callCloseBtn.disabled = true;
  els.recordBtn.disabled = true;
  els.forceCommitBtn.disabled = true;
  setHeroState("正在关闭...", "connecting");
  await postJSON("/api/close", {session_id: sessionId}, {name: "session.close"}).catch(() => {});
  els.recordHint.textContent = "等待 session.closed ack";
});

els.callCloseBtn.addEventListener("click", evt => {
  evt.preventDefault();
  if (sessionId) {
    els.closeBtn.click();
    return;
  }
  rememberQaScroll();
  stopRecording({commit: false}).catch(() => {});
  sessionId = "";
  lastRuntimeConfigKey = "";
  setConnected(false, {keepCallPage: true});
});

els.recordBtn.addEventListener("click", evt => {
  evt.preventDefault();
  toggleMicrophone().catch(err => {
    els.recordHint.textContent = "麦克风切换失败";
    setHeroState("麦克风切换失败", "error");
    const message = microphoneErrorMessage(err);
    addMessage("tool", message);
    showErrorToast("麦克风切换失败", message);
  });
});

els.forceCommitBtn.addEventListener("click", evt => {
  evt.preventDefault();
  forceCommitAudio("强制判停").catch(err => {
    addMessage("tool", `force commit failed: ${err.message}`);
    showErrorToast("强制判停失败", err);
  });
});

els.clearMessagesBtn.addEventListener("click", () => {
  els.messages.textContent = "";
  els.qaSearchInput.value = "";
  applyQaSearch();
  currentTurn = null;
  lastTurn = null;
});

els.qaSearchInput.addEventListener("input", () => {
  applyQaSearch({scrollToFirst: true});
});

els.clearEventsBtn.addEventListener("click", () => {
  eventLines = [];
  audioAppendCount = 0;
  audioAppendBytes = 0;
  responseTextDeltaCount = 0;
  responseTextDeltaChars = 0;
  lastResponseTextEventAt = 0;
  responseAudioDeltaCount = 0;
  responseAudioDeltaBytes = 0;
  lastResponseAudioEventAt = 0;
  els.events.textContent = "";
});

els.errorToastCloseBtn.addEventListener("click", closeErrorToast);
els.errorToast.addEventListener("click", evt => {
  if (evt.target === els.errorToast) closeErrorToast();
});
window.addEventListener("keydown", evt => {
  if (evt.key === "Escape" && !els.errorToast.hidden) closeErrorToast();
});

els.toggleApiKeyBtn.addEventListener("click", () => {
  const visible = els.apiKey.type === "text";
  els.apiKey.type = visible ? "password" : "text";
  els.toggleApiKeyBtn.setAttribute("aria-label", visible ? "显示 API Key" : "隐藏 API Key");
  els.toggleApiKeyBtn.setAttribute("title", visible ? "显示 API Key" : "隐藏 API Key");
  els.toggleApiKeyBtn.classList.toggle("is-visible", !visible);
});

els.generateDialogIdBtn.addEventListener("click", () => {
  setDialogId(generateDialogId());
  els.dialogId.focus();
  els.dialogId.select();
});

els.resetToolsBtn.addEventListener("click", resetToolsJson);
els.resetInstructionsBtn.addEventListener("click", resetInstructions);
els.validateToolsBtn.addEventListener("click", () => {
  try {
    validateToolsJson();
  } catch (err) {
    showErrorToast("FC Tools JSON 校验失败", err);
  }
});
els.formatToolsBtn.addEventListener("click", () => {
  try {
    validateToolsJson({format: true});
    scheduleSessionUpdate();
  } catch (err) {
    showErrorToast("FC Tools JSON 格式化失败", err);
  }
});
els.toolsJson.addEventListener("input", () => {
  setToolsJsonStatus("");
  scheduleSessionUpdate();
});
