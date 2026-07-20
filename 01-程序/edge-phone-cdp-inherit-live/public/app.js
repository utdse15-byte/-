'use strict';

(() => {
  const Geometry = window.EdgePhoneGeometry;
  if (!Geometry) throw new Error('geometry.js 未加载');

  const $ = (id) => document.getElementById(id);
  const elements = {
    stage: $('stage'),
    canvas: $('screenCanvas'),
    image: $('screenImage'),
    imageBuffer: $('screenImageBuffer'),
    tapMarker: $('tapMarker'),
    calibrationLocalMarker: $('calibrationLocalMarker'),
    calibrationTargetMarker: $('calibrationTargetMarker'),
    calibrationRemoteMarker: $('calibrationRemoteMarker'),
    calibrationGuide: $('calibrationGuide'),
    calibrationGuideText: $('calibrationGuideText'),
    cancelCalibrationButton: $('cancelCalibrationButton'),
    emptyState: $('emptyState'),
    emptyTitle: $('emptyTitle'),
    emptyReconnectButton: $('emptyReconnectButton'),
    emptyDetail: $('emptyDetail'),
    toast: $('toast'),
    roleBadge: $('roleBadge'),
    frameBadge: $('frameBadge'),
    compatibilityBadge: $('compatibilityBadge'),
    addressInput: $('addressInput'),
    backButton: $('backButton'),
    forwardButton: $('forwardButton'),
    displayLabel: $('displayLabel'),
    displayButton: $('displayButton'),
    keyboardPanel: $('keyboardPanel'),
    textInput: $('textInput'),
    liveTextSyncToggle: $('liveTextSyncToggle'),
    pullTextButton: $('pullTextButton'),
    tabsList: $('tabsList'),
    navigationHistoryList: $('navigationHistoryList'),
    historySection: $('historySection'),
    tabsModeButton: $('tabsModeButton'),
    browserHistoryModeButton: $('browserHistoryModeButton'),
    tabsModePane: $('tabsModePane'),
    browserHistoryPane: $('browserHistoryPane'),
    browserHistorySearchInput: $('browserHistorySearchInput'),
    browserHistoryRefreshButton: $('browserHistoryRefreshButton'),
    browserHistoryStatus: $('browserHistoryStatus'),
    browserHistoryList: $('browserHistoryList'),
    browserHistoryMoreButton: $('browserHistoryMoreButton'),
    tabCount: $('tabCount'),
    uploadHint: $('uploadHint'),
    phoneFiles: $('phoneFiles'),
    computerSourceButton: $('computerSourceButton'),
    phoneSourceButton: $('phoneSourceButton'),
    computerFilePane: $('computerFilePane'),
    phoneFilePane: $('phoneFilePane'),
    computerRootsButton: $('computerRootsButton'),
    computerParentButton: $('computerParentButton'),
    computerRefreshButton: $('computerRefreshButton'),
    computerClearSelectionButton: $('computerClearSelectionButton'),
    computerSortSelect: $('computerSortSelect'),
    computerPath: $('computerPath'),
    computerFileList: $('computerFileList'),
    computerSelectFolderButton: $('computerSelectFolderButton'),
    computerSelection: $('computerSelection'),
    fileList: $('fileList'),
    uploadProgress: $('uploadProgress'),
    uploadStatus: $('uploadStatus'),
    startUploadButton: $('startUploadButton'),
    cancelUploadButton: $('cancelUploadButton'),
    dialogMessage: $('dialogMessage'),
    dialogPromptInput: $('dialogPromptInput'),
    diagnosticsText: $('diagnosticsText'),
    logsText: $('logsText'),
    tokenInput: $('tokenInput'),
    tokenError: $('tokenError'),
    rendererSelect: $('rendererSelect'),
    inputModeSelect: $('inputModeSelect'),
    mobileZoomSelect: $('mobileZoomSelect'),
    gestureModeSelect: $('gestureModeSelect'),
    streamPresetSelect: $('streamPresetSelect'),
    followDesktopTabsToggle: $('followDesktopTabsToggle'),
    desktopTabFollowStatus: $('desktopTabFollowStatus'),
    manualCompatibilitySelect: $('manualCompatibilitySelect'),
    manualCompatibilityStatus: $('manualCompatibilityStatus'),
    compatibilityAuditText: $('compatibilityAuditText'),
    refreshCompatibilityAuditButton: $('refreshCompatibilityAuditButton'),
    strictNativeTouchButton: $('strictNativeTouchButton'),
    desktopWidthRange: $('desktopWidthRange'),
    desktopWidthValue: $('desktopWidthValue'),
    qualityRange: $('qualityRange'),
    qualityValue: $('qualityValue'),
    calibrationProfileLabel: $('calibrationProfileLabel'),
    copyCalibrationProfileButton: $('copyCalibrationProfileButton'),
    calibrationStepSelect: $('calibrationStepSelect'),
    offsetXDirection: $('offsetXDirection'),
    offsetYDirection: $('offsetYDirection'),
    quickCalibrationButton: $('quickCalibrationButton'),
    calibrationTestButton: $('calibrationTestButton'),
    resetCalibrationButton: $('resetCalibrationButton'),
    resetAllCalibrationButton: $('resetAllCalibrationButton'),
    autoCalibrationButton: $('autoCalibrationButton'),
    fullscreenButton: $('fullscreenButton'),
    offsetXRange: $('offsetXRange'),
    offsetYRange: $('offsetYRange'),
    scaleXRange: $('scaleXRange'),
    scaleYRange: $('scaleYRange'),
    offsetXValue: $('offsetXValue'),
    offsetYValue: $('offsetYValue'),
    scaleXValue: $('scaleXValue'),
    scaleYValue: $('scaleYValue'),
    fullscreenDock: $('fullscreenDock'),
    fullscreenDockHandle: $('fullscreenDockHandle'),
    fullscreenDockPanel: $('fullscreenDockPanel'),
    fullscreenCalibrationPanel: $('fullscreenCalibrationPanel'),
    fsBackButton: $('fsBackButton'),
    fsForwardButton: $('fsForwardButton'),
    fsReloadButton: $('fsReloadButton'),
    fsTabsButton: $('fsTabsButton'),
    fsKeyboardButton: $('fsKeyboardButton'),
    fsUploadButton: $('fsUploadButton'),
    fsStrictInputButton: $('fsStrictInputButton'),
    fsCalibrationButton: $('fsCalibrationButton'),
    fsSettingsButton: $('fsSettingsButton'),
    fsExitButton: $('fsExitButton'),
    fsCalibrationProfileLabel: $('fsCalibrationProfileLabel'),
    fsOffsetXValue: $('fsOffsetXValue'),
    fsOffsetYValue: $('fsOffsetYValue'),
    fsCalibrationTestButton: $('fsCalibrationTestButton'),
    fsCalibrationStepSelect: $('fsCalibrationStepSelect'),
    fsCalibrationCopyButton: $('fsCalibrationCopyButton'),
    fsCalibrationResetButton: $('fsCalibrationResetButton'),
    fsCalibrationCloseButton: $('fsCalibrationCloseButton'),
    claimControlButton: $('claimControlButton')
  };

  function storageGet(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function readJsonStorage(key, fallback) {
    try {
      const value = JSON.parse(storageGet(key, ''));
      return value && typeof value === 'object' ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function createClientId() {
    try {
      if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    } catch {}
    try {
      const bytes = new Uint8Array(16);
      globalThis.crypto?.getRandomValues?.(bytes);
      if (bytes.some((value) => value !== 0)) {
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    } catch {}
    return `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const CALIBRATION_STORAGE_KEY = 'edgePhoneCalibrationProfilesV67';
  const CALIBRATION_PROFILE_LEGACY_KEY = 'edgePhoneCalibrationProfilesV66';
  const CALIBRATION_LEGACY_KEY = 'edgePhoneCalibrationV65';
  const CALIBRATION_PROFILE_KEYS = [
    'windowed-portrait', 'windowed-landscape', 'fullscreen-portrait', 'fullscreen-landscape'
  ];

  function physicalOrientation(width = 0, height = 0) {
    // Do not infer phone orientation from #stage. In windowed mode the Android
    // keyboard or browser chrome can temporarily make the stage wider than it
    // is tall, even though the phone is still physically in portrait. The
    // Screen Orientation API and screen dimensions remain stable across those
    // layout-only changes; viewport dimensions are only the final fallback.
    const type = String(globalThis.screen?.orientation?.type || '').toLowerCase();
    if (type.startsWith('landscape')) return 'landscape';
    if (type.startsWith('portrait')) return 'portrait';

    const screenWidth = Number(globalThis.screen?.width) || 0;
    const screenHeight = Number(globalThis.screen?.height) || 0;
    if (screenWidth > 0 && screenHeight > 0 && screenWidth !== screenHeight) {
      return screenWidth > screenHeight ? 'landscape' : 'portrait';
    }

    const fallbackWidth = Number(width) || Number(globalThis.visualViewport?.width) || Number(globalThis.innerWidth) || 0;
    const fallbackHeight = Number(height) || Number(globalThis.visualViewport?.height) || Number(globalThis.innerHeight) || 0;
    return fallbackWidth > fallbackHeight ? 'landscape' : 'portrait';
  }

  function calibrationProfileKeyFor(fullscreen, width, height) {
    return `${fullscreen ? 'fullscreen' : 'windowed'}-${physicalOrientation(width, height)}`;
  }

  function calibrationProfileLabelFor(key) {
    const fullscreen = String(key).startsWith('fullscreen-');
    const landscape = String(key).endsWith('-landscape');
    return `${fullscreen ? '全屏' : '普通模式'} · ${landscape ? '横屏' : '竖屏'}`;
  }

  function counterpartCalibrationProfileKey(key) {
    const value = String(key || 'windowed-portrait');
    return value.startsWith('fullscreen-')
      ? value.replace(/^fullscreen-/, 'windowed-')
      : value.replace(/^windowed-/, 'fullscreen-');
  }

  const legacyCalibration = Geometry.normalizeCalibration(readJsonStorage(CALIBRATION_LEGACY_KEY, {}));
  const storedCalibrationProfilesV67 = readJsonStorage(CALIBRATION_STORAGE_KEY, {});
  const storedCalibrationProfilesV66 = readJsonStorage(CALIBRATION_PROFILE_LEGACY_KEY, {});
  const storedCalibrationProfiles = CALIBRATION_PROFILE_KEYS.some((key) => storedCalibrationProfilesV67[key])
    ? storedCalibrationProfilesV67
    : storedCalibrationProfilesV66;
  const calibrationProfiles = {};
  const hasStoredCalibrationProfiles = CALIBRATION_PROFILE_KEYS.some((key) => storedCalibrationProfiles[key]);
  for (const key of CALIBRATION_PROFILE_KEYS) {
    calibrationProfiles[key] = Geometry.normalizeCalibration(
      hasStoredCalibrationProfiles ? (storedCalibrationProfiles[key] || {}) : legacyCalibration
    );
  }
  if (!hasStoredCalibrationProfiles) storageSet(CALIBRATION_STORAGE_KEY, JSON.stringify(calibrationProfiles));
  const initialCalibrationProfileKey = calibrationProfileKeyFor(false, window.innerWidth, window.innerHeight);
  const initialCalibration = Geometry.normalizeCalibration(calibrationProfiles[initialCalibrationProfileKey]);
  const storedRenderer = storageGet('edgePhoneRendererV6', 'auto');
  const storedInputMode = ['devtools', 'nativeTouch'].includes(storageGet('edgePhoneInputModeV64', 'nativeTouch'))
    ? storageGet('edgePhoneInputModeV64', 'nativeTouch')
    : 'nativeTouch';
  const storedGestureMode = ['smart', 'direct'].includes(storageGet('edgePhoneGestureModeV64', 'direct'))
    ? storageGet('edgePhoneGestureModeV64', 'direct')
    : 'direct';
  const storedQuality = clamp(Number(storageGet('edgePhoneQualityV6', '72')) || 72, 35, 92);
  const storedMobile = storageGet('edgePhoneMobileV61', 'true') !== 'false';
  const storedDesktopWidth = clamp(Number(storageGet('edgePhoneDesktopWidthV61', '1280')) || 1280, 800, 2560);
  // 页面缩放：把仿真视口按比例缩小，同屏显示即等比放大内容（与
  // Edge 的 Ctrl+ 缩放同效）。手机与桌面两种显示模式的普通仿真页面都
  // 生效；严格人工模式保持真实桌面窗口（其缩放由 Edge 自身按站点记忆）。
  const storedMobileZoom = [90, 100, 110, 125, 150].includes(Number(storageGet('edgePhoneMobileZoomV68', '100')))
    ? Number(storageGet('edgePhoneMobileZoomV68', '100'))
    : 100;
  const storedLiveTextSync = storageGet('edgePhoneLiveTextSyncV68', 'false') === 'true';
  const storedStreamPreset = ['auto', 'economy', 'realtime', 'balanced', 'clear'].includes(storageGet('edgePhoneStreamPresetV64', 'auto'))
    ? storageGet('edgePhoneStreamPresetV64', 'auto')
    : 'auto';
  // v6.7 uses Windows UI Automation for foreground Edge-tab following. This
  // avoids periodic page-script probing; if UIA cannot identify a unique tab,
  // the controller conservatively keeps the current phone target.
  const storedFollowDesktopTabs = storageGet('edgePhoneFollowDesktopTabsV67', 'true') === 'true';
  const storedManualCompatibilityMode = ['auto', 'always', 'off'].includes(storageGet('edgePhoneManualCompatibilityV67', 'auto'))
    ? storageGet('edgePhoneManualCompatibilityV67', 'auto')
    : 'auto';
  const storedComputerSort = ['modified-desc', 'modified-asc', 'name-asc', 'name-desc', 'size-desc', 'size-asc'].includes(storageGet('edgePhoneComputerSortV64', 'modified-desc'))
    ? storageGet('edgePhoneComputerSortV64', 'modified-desc')
    : 'modified-desc';

  const state = {
    token: '',
    clientId: storageGet('edgePhoneClientIdV6', '') || createClientId(),
    ws: null,
    connected: false,
    role: 'unknown',
    reconnectAttempt: 0,
    reconnectTimer: null,
    reconnectDueAt: 0,
    connectionGeneration: 0,
    connectionStartedAt: 0,
    preferencesAppliedForConnection: false,
    manualDisconnect: false,
    requestCounter: 0,
    pendingRequests: new Map(),
    pageState: {
      url: '', title: '', canGoBack: false, canGoForward: false,
      history: { currentIndex: -1, startIndex: 0, total: 0, entries: [] }
    },
    tabs: [],
    activeTabId: null,
    tabsSheetMode: 'tabs',
    browserHistory: {
      query: '', offset: 0, items: [], hasMore: false, loading: false,
      profileDirectory: '', databaseUpdatedAt: 0, source: '', debounceTimer: null,
      requestSerial: 0, lastLoadedAt: 0
    },
    viewport: {
      width: 412,
      height: 732,
      dpr: 2,
      mobile: storedMobile,
      quality: storedQuality,
      desktopWidth: storedDesktopWidth,
      streamPreset: storedStreamPreset,
      effectiveStreamPreset: storedStreamPreset === 'auto' ? 'realtime' : storedStreamPreset,
      revision: 0
    },
    capabilities: {
      maxUploadBytes: 512 * 1024 * 1024,
      maxUploadFiles: 64,
      uploadAckBytes: 1024 * 1024,
      fileUpload: false,
      computerFilePicker: true,
      maxComputerFiles: 256,
      desktopWidth: storedDesktopWidth,
      streamPresets: ['auto', 'economy', 'realtime', 'balanced', 'clear'],
      followDesktopTabs: storedFollowDesktopTabs,
      manualCompatibility: { configuredMode: 'auto', mode: storedManualCompatibilityMode, active: false, domains: ['chatgpt.com', 'chat.openai.com', 'auth.openai.com', 'claude.ai', 'claude.com'], nativeTouchEnabled: false }
    },
    rendererPreference: ['auto', 'image', 'canvas'].includes(storedRenderer) ? storedRenderer : 'auto',
    rendererActive: 'none',
    canvasFailures: 0,
    imageFailures: 0,
    inputMode: ['devtools', 'nativeTouch'].includes(storedInputMode) ? storedInputMode : 'nativeTouch',
    mobileZoom: storedMobileZoom,
    // 实时同步：本地文本框 → 远程网页输入框的纯写入镜像。liveSyncBase 是
    // "远程输入框里由本机同步进去的文本"（差量基准）；liveSyncBaseValid
    // 表示"远程光标仍停在基准末尾"这一不变式是否还成立（点画面/换页/
    // 发送失败都会打破它，需重新取回）；liveSyncWholeField 表示基准就是
    // 远程输入框的全部内容（取回后成立），只有此时才允许 全选+整段替换。
    liveTextSync: storedLiveTextSync,
    liveSyncBase: '',
    liveSyncBaseValid: true,
    liveSyncWholeField: false,
    gestureMode: storedGestureMode,
    followDesktopTabs: storedFollowDesktopTabs,
    desktopTabFollow: { enabled: storedFollowDesktopTabs, strategy: 'uia', uia: { available: false, running: false, reason: 'loading' } },
    manualCompatibilityMode: storedManualCompatibilityMode,
    manualCompatibility: {
      configuredMode: 'auto', mode: storedManualCompatibilityMode, active: false, domain: '', reason: 'loading',
      domains: ['chatgpt.com', 'chat.openai.com', 'auth.openai.com', 'claude.ai', 'claude.com'], inputProfile: 'touch-emulation', nativeTouchEnabled: false, audit: null
    },
    gestureCounter: 0,
    calibrationProfiles,
    calibrationProfileKey: initialCalibrationProfileKey,
    calibration: initialCalibration,
    calibrationStep: clamp(Number(storageGet('edgePhoneCalibrationStepV66', '0.25')) || 0.25, 0.1, 1),
    calibrationTestMode: false,
    calibrationTestRequest: 0,
    lastCalibrationProbeLocal: null,
    calibrationProbeTimer: null,
    currentGeometry: null,
    currentFrame: null,
    queuedFrame: null,
    rendering: false,
    imageUrls: ['', ''],
    activeImageIndex: -1,
    backCanvas: null,
    lastDisplayedTimestamp: 0,
    lastDisplayedTargetId: null,
    lastDecodeWarningAt: 0,
    lastRenderedSequence: 0,
    lastServerSequence: 0,
    expectedFrameEpoch: 0,
    displayedFrameEpoch: 0,
    frameTransitionReason: '',
    frameTransitionAt: 0,
    lastFrameReceivedAt: 0,
    lastFrameRenderedAt: 0,
    lastFrameSource: 'none',
    lastStreamFrameRenderedAt: 0,
    lastStreamFrameSequence: 0,
    firstConnectAt: 0,
    fallbackPromise: null,
    lastFallbackAt: 0,
    fallbackFailures: 0,
    demandTimer: null,
    demandSequence: 0,
    gesture: null,
    pendingMove: null,
    moveAnimationFrame: 0,
    pendingWheel: null,
    wheelAnimationFrame: 0,
    deferredViewport: false,
    viewportTimer: null,
    pendingViewportForce: false,
    lastSentViewport: null,
    lastStageRenderWidth: 0,
    lastStageRenderHeight: 0,
    stableHeightViewportTimer: null,
    lastStableHeightViewportSyncAt: 0,
    roleControls: [],
    pendingChooser: null,
    uploadCloseTimer: null,
    uploadDismissPromise: null,
    uploadSource: 'computer',
    computerBrowser: {
      roots: [], currentPath: '', parentPath: null, entries: [], selected: new Map(),
      loading: false, truncated: false, sort: storedComputerSort
    },
    uploading: false,
    uploadAbort: false,
    calibrationWizard: null,
    fullscreenDockOpen: false,
    fullscreenCalibrationOpen: false,
    fullscreenDockTimer: null,
    fullscreenDockDrag: null,
    fullscreenDockY: clamp(Number(storageGet('edgePhoneFullscreenDockYV66', '50')) || 50, 22, 78),
    latestStatus: null,
    pingMs: null,
    lastStatusReadAt: 0,
    toastTimer: null,
    frameMonitor: null,
    visibilityFrameTimer: null,
    requestedViewportRevision: 0,
    displayedViewportRevision: 0,
    viewportRevisionCounter: 0,
    viewportSyncPending: false,
    viewportSyncWatchdogTimer: null,
    viewportSyncReason: '',
    evictedByPeer: false,
    viewportSettleGeneration: 0,
    viewportSettleTimer: null,
    viewportFallbackTimer: null,
    resizeSettling: false
  };
  storageSet('edgePhoneClientIdV6', state.clientId);

  // 实时同步基准失效入口。实现于控件接线处；这里先占位，供更早定义的
  // 消息处理与手势代码在运行期调用（页面切换、点击画面等都要打破基准）。
  let invalidateLiveSyncBase = () => {};

  const query = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const linkToken = hashParams.get('token') || query.get('token') || '';
  state.token = linkToken || storageGet('edgePhoneTokenV6', '');
  if (linkToken) storageSet('edgePhoneTokenV6', linkToken);
  if (query.has('token') || hashParams.has('token')) {
    query.delete('token');
    hashParams.delete('token');
    const querySuffix = query.toString();
    const hashSuffix = hashParams.toString();
    history.replaceState(null, '', `${location.pathname}${querySuffix ? `?${querySuffix}` : ''}${hashSuffix ? `#${hashSuffix}` : ''}`);
  }

  function setOverlay(id, open) {
    const overlay = $(id);
    if (!overlay) return;
    overlay.hidden = !open;
  }

  function closeAllOverlays(except = '') {
    document.querySelectorAll('.overlay').forEach((overlay) => {
      if (overlay.id === except || overlay.hidden) return;
      if (overlay.id === 'uploadOverlay') {
        dismissUploadOverlay({ notifyServer: true, silent: true }).catch(() => {});
      } else {
        overlay.hidden = true;
      }
    });
  }

  function showToast(message, level = 'info', duration = 2800) {
    elements.toast.textContent = String(message || '');
    elements.toast.className = `show ${level}`;
    clearTimeout(state.toastTimer);
    if (duration > 0) {
      state.toastTimer = setTimeout(() => {
        elements.toast.className = '';
      }, duration);
    }
  }

  function showEmpty(title, detail, spinning = true) {
    elements.emptyTitle.textContent = title;
    elements.emptyDetail.textContent = detail || '';
    const spinner = elements.emptyState.querySelector('.spinner');
    spinner.hidden = !spinning;
    // 重连按钮只在"被另一页面挤下线"的停驻状态显示（由该分支单独打开）。
    if (elements.emptyReconnectButton) elements.emptyReconnectButton.hidden = true;
    elements.emptyState.hidden = false;
  }

  function hideEmpty() {
    elements.emptyState.hidden = true;
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatAge(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '未知';
    if (milliseconds < 1000) return `${Math.round(milliseconds)} ms`;
    if (milliseconds < 60000) return `${(milliseconds / 1000).toFixed(1)} 秒`;
    return `${Math.floor(milliseconds / 60000)} 分 ${Math.round((milliseconds % 60000) / 1000)} 秒`;
  }

  function wsIsOpen() {
    return state.ws && state.ws.readyState === WebSocket.OPEN;
  }

  function wsIsActive() {
    return Boolean(state.ws && (
      state.ws.readyState === WebSocket.CONNECTING ||
      state.ws.readyState === WebSocket.OPEN
    ));
  }

  function send(payload) {
    if (!wsIsOpen()) return false;
    try {
      state.ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function request(type, payload = {}, timeout = 12000) {
    if (!wsIsOpen()) return Promise.reject(new Error('手机控制连接未建立'));
    const requestId = `${Date.now().toString(36)}-${(++state.requestCounter).toString(36)}`;
    const message = { ...payload, type, requestId };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pendingRequests.delete(requestId);
        reject(new Error(`${type} 请求超时`));
      }, timeout);
      state.pendingRequests.set(requestId, { resolve, reject, timer, type });
      try {
        state.ws.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timer);
        state.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }

  function rejectAllRequests(reason) {
    for (const pending of state.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    state.pendingRequests.clear();
  }

  function socketUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 令牌通过 Sec-WebSocket-Protocol 子协议传递，不再放进 URL，避免出现在
    // 访问日志、浏览器历史或 Referer 里。clientId 仍在查询串（非机密）。
    return `${protocol}//${location.host}/control?clientId=${encodeURIComponent(state.clientId)}`;
  }

  function tokenToBase64Url(token) {
    // 把令牌编成 base64url，使其成为合法的 WebSocket 子协议名（仅 A-Za-z0-9-_）。
    const utf8 = new TextEncoder().encode(String(token || ''));
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function socketProtocols() {
    // 第一个是非机密应答子协议（服务端回选它），第二个携带 base64url 令牌。
    return ['epc.v1', `epc.token.${tokenToBase64Url(state.token)}`];
  }

  function connect(force = false) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.reconnectDueAt = 0;
    // 被同机另一个控制页挤下线（4001）后，一切自动路径（重连定时器、切回
    // 前台、网络恢复）都不得再连——否则两个页面会互相顶掉对方，每秒断连
    // 一次。只有用户显式点"重新连接"（force）才解除停驻。
    if (state.evictedByPeer && !force) return;
    if (force) state.evictedByPeer = false;
    if (!state.token) {
      setOverlay('tokenOverlay', true);
      elements.tokenInput.focus();
      return;
    }
    if (!force && wsIsActive()) return;

    state.manualDisconnect = false;
    state.preferencesAppliedForConnection = false;
    const generation = ++state.connectionGeneration;
    const previous = state.ws;
    if (previous) {
      try {
        previous.onopen = null;
        previous.onmessage = null;
        previous.onerror = null;
        previous.onclose = null;
        previous.close();
      } catch {}
      // 旧连接的 onclose 已被摘除，不会再替在途请求收尾；这里立即拒绝,
      // 避免它们各自等满超时（上传确认最长 60 秒）才报错。
      rejectAllRequests('连接已重建');
    }

    if (!state.currentFrame) {
      showEmpty('正在连接 Windows Edge', '正在建立手机控制通道。', true);
    } else {
      hideEmpty();
      showToast('控制通道正在重连，上一帧继续保留。', 'warn', 1800);
    }
    elements.roleBadge.textContent = '连接中';
    elements.roleBadge.className = '';
    const ws = new WebSocket(socketUrl(), socketProtocols());
    ws.binaryType = 'arraybuffer';
    state.ws = ws;
    state.connectionStartedAt = Date.now();

    const isCurrent = () => ws === state.ws && generation === state.connectionGeneration;
    let opened = false;

    ws.onopen = () => {
      if (!isCurrent()) return;
      opened = true;
      state.connected = true;
      state.firstConnectAt = Date.now();
      // 服务端的 epoch/sequence 计数在控制器重启后会从头开始。这里必须
      // 重置单调递增的排序门槛，否则重启后的所有帧都会因"过旧"被丢弃，
      // 画面永久停在重启前的一帧。保留 currentFrame 本身（旧画面继续显示）。
      state.expectedFrameEpoch = 0;
      state.displayedFrameEpoch = 0;
      state.lastRenderedSequence = 0;
      state.lastServerSequence = 0;
      state.lastStreamFrameSequence = 0;
      state.lastDisplayedTimestamp = 0;
      state.lastDisplayedTargetId = null;
      state.frameTransitionReason = '';
      state.frameTransitionAt = 0;
      // 旧连接排队待渲染的帧一律作废（其元数据带着重启前的大编号）。
      state.queuedFrame = null;
      state.reconnectAttempt = 0;
      state.reconnectDueAt = 0;
      setOverlay('tokenOverlay', false);
      showToast('已连接电脑控制器', 'ok', 1600);
      // （重）连接后远程页面/输入框状态未知：作废实时同步基准，要求重新取回，
      // 绝不拿断线前的旧基准去算差量。首连时基准本就为空，静默处理。
      invalidateLiveSyncBase('已重新连接，实时同步已暂停：点"取回网页文本"重新对齐。');
      scheduleViewport(true, true);
      request('reloadState').catch(() => {});
      scheduleNoFrameFallback(2200, '首次连接');
      updateRoleUi();
    };

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      if (typeof event.data === 'string') handleTextMessage(event.data);
      else handleBinaryMessage(event.data).catch((error) => {
        console.error(error);
        state.fallbackFailures += 1;
        reportFrameProblem(`packet:${error.message}`);
        showToast(`画面数据解析失败：${error.message}`, 'warn', 3200);
        fetchFrameFallback(true, '二进制帧解析失败').catch(() => {});
      });
    };

    ws.onerror = () => {
      if (!isCurrent()) return;
      elements.tokenError.textContent = '连接失败。请确认 IP、端口、防火墙和访问令牌。';
    };

    ws.onclose = (event) => {
      if (!isCurrent()) return;
      state.ws = null;
      cancelActiveGesture();
      state.connected = false;
      state.role = 'unknown';
      if (state.calibrationWizard) cancelAutoCalibration({ silent: true, removeRemote: false });
      rejectAllRequests('控制连接已断开');
      updateRoleUi();
      elements.roleBadge.textContent = '已断开';
      // 4001 = 同一手机（相同 clientId）的另一个页面实例挤掉了本连接。
      // 绝不能自动重连：两个实例会以约 1 秒周期互相顶掉对方，表现为
      // "一直断开又连接"。本页面停下来，把选择权交给用户。
      if (event?.code === 4001) {
        state.evictedByPeer = true;
        showEmpty('控制页已在其他页面打开', '同一手机同时只保留一个控制页。请关闭另一个页面（或旧的浏览器标签/应用），再点下方"重新连接"。', false);
        if (elements.emptyReconnectButton) elements.emptyReconnectButton.hidden = false;
        showToast('检测到本机打开了第二个控制页，当前页面已停止自动重连。', 'warn', 0);
        return;
      }
      // 4003 = 电脑上轮换了访问令牌，本连接被撤销。旧令牌已失效，自动重连
      // 只会反复被拒——清掉本地令牌并停驻，等用户拿新链接/新令牌重新进入。
      if (event?.code === 4003) {
        state.evictedByPeer = true;
        state.token = '';
        storageSet('edgePhoneTokenV6', '');
        showEmpty('访问令牌已轮换', '电脑上生成了新的访问令牌，本页面的旧令牌已失效。请在电脑控制器窗口查看新链接/二维码重新打开，或点"重新连接"后输入新令牌。', false);
        if (elements.emptyReconnectButton) elements.emptyReconnectButton.hidden = false;
        showToast('访问令牌已在电脑上轮换，当前页面已停止自动重连。', 'warn', 0);
        return;
      }
      if (state.currentFrame) {
        showToast(navigator.onLine ? '控制连接断开，正在自动重连；当前画面已保留。' : '手机当前离线；当前画面已保留。', 'warn', 0);
      } else {
        showEmpty('手机与电脑连接断开', navigator.onLine ? '正在自动重连。' : '手机当前离线。', true);
      }
      if (!state.manualDisconnect) {
        // 本次连接从未成功打开（例如令牌已被轮换、握手 401）时必须先校验
        // 令牌，否则会带着失效令牌无限重连，永远不再弹出令牌输入框。
        if (!opened || !state.firstConnectAt || Date.now() - state.firstConnectAt < 2500) {
          verifyStoredToken().then((valid) => { if (valid) scheduleReconnect(); });
        } else {
          scheduleReconnect();
        }
      }
    };
  }

  function scheduleReconnect() {
    if (state.reconnectTimer || wsIsActive() || !state.token || !navigator.onLine) return;
    const delay = Math.min(10000, 700 * (2 ** Math.min(state.reconnectAttempt++, 4)));
    state.reconnectDueAt = Date.now() + delay;
    const timer = setTimeout(() => {
      if (state.reconnectTimer !== timer) return;
      state.reconnectTimer = null;
      state.reconnectDueAt = 0;
      connect(false);
    }, delay);
    state.reconnectTimer = timer;
  }

  async function verifyStoredToken() {
    if (!state.token) return false;
    try {
      const response = await fetch('/api/status', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${state.token}` }
      });
      if (response.status !== 401) return true;
      elements.tokenError.textContent = '访问令牌不正确或电脑端令牌已更换。';
      setOverlay('tokenOverlay', true);
      elements.tokenInput.value = '';
      return false;
    } catch {
      return true;
    }
  }

  function reconnectNow() {
    state.manualDisconnect = false;
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.reconnectDueAt = 0;
    connect(true);
  }

  function transitionReasonLabel(reason) {
    const labels = {
      'new-client': '同步当前标签页',
      'target-connect': '连接标签页',
      'target-switch': '切换标签页',
      'target-reattach': '恢复标签页',
      'viewport': '调整页面布局',
      'navigation': '页面跳转',
      'frame-navigated': '页面跳转',
      'new-tab': '打开新标签页',
      'desktop-tab-follow': '跟随电脑标签页'
    };
    return labels[String(reason || '')] || '更新网页画面';
  }

  function beginFrameTransition(epoch, reason = 'update', targetId = null) {
    const value = Number(epoch) || 0;
    if (!value || value < state.expectedFrameEpoch) return;
    if (value > state.expectedFrameEpoch) {
      cancelActiveGesture();
      state.expectedFrameEpoch = value;
      state.frameTransitionAt = Date.now();
      state.lastDisplayedTimestamp = 0;
      state.lastDisplayedTargetId = targetId || null;
    }
    state.frameTransitionReason = reason || state.frameTransitionReason || 'update';
    if (targetId) state.activeTabId = targetId;
    updateFrameBadge();
  }

  function completeFrameTransition(epoch) {
    const value = Number(epoch) || 0;
    if (value > 0) state.displayedFrameEpoch = Math.max(state.displayedFrameEpoch, value);
    if (!state.expectedFrameEpoch) state.expectedFrameEpoch = state.displayedFrameEpoch;
    if (state.displayedFrameEpoch >= state.expectedFrameEpoch) {
      state.frameTransitionReason = '';
      state.frameTransitionAt = 0;
    }
  }

  function compatibilityAuditView(audit) {
    if (!audit) return '未读取；仅点击按钮时读取一次。';
    return JSON.stringify({
      checkedAt: audit.checkedAt ? new Date(audit.checkedAt).toLocaleString() : null,
      url: audit.url || '',
      userAgent: audit.userAgent || '',
      platform: audit.platform || '',
      userAgentData: audit.userAgentData || null,
      webdriver: Boolean(audit.webdriver),
      maxTouchPoints: Number(audit.maxTouchPoints) || 0,
      pointer: audit.pointer || null,
      viewport: {
        innerWidth: Number(audit.innerWidth) || 0,
        innerHeight: Number(audit.innerHeight) || 0,
        outerWidth: Number(audit.outerWidth) || 0,
        outerHeight: Number(audit.outerHeight) || 0,
        devicePixelRatio: Number(audit.devicePixelRatio) || 1
      },
      screen: audit.screen || null,
      note: audit.note || ''
    }, null, 2);
  }

  function strictNativeTouchActive() {
    return Boolean(state.manualCompatibility?.active && state.manualCompatibility?.nativeTouchEnabled);
  }

  function effectiveInputMode() {
    if (!state.manualCompatibility?.active) return state.inputMode;
    // 严格模式默认桌面鼠标；用户显式开启"临时原生触摸"后，尊重输入模式
    // 选择器（原生触摸 / dev 仿真）——部分站点移动布局的按钮只吃完整的
    // "触摸→手势→点击"管线，dev 仿真是实测可靠的点击通道。
    if (!strictNativeTouchActive()) return 'mouse';
    return state.inputMode === 'devtools' ? 'devtools' : 'nativeTouch';
  }

  function effectiveGestureMode() {
    if (!state.manualCompatibility?.active) return state.gestureMode === 'direct' ? 'direct' : 'smart';
    return strictNativeTouchActive() ? 'direct' : 'smart';
  }

  function updateManualCompatibilityUi() {
    const compatibility = state.manualCompatibility || {};
    const active = Boolean(compatibility.active);
    const nativeTouch = Boolean(active && compatibility.nativeTouchEnabled);
    document.body.classList.toggle('manual-compatibility-active', active);
    document.body.classList.toggle('strict-native-touch-active', nativeTouch);
    if (elements.compatibilityBadge) {
      elements.compatibilityBadge.hidden = !active;
      const inputLabel = nativeTouch ? '临时触摸' : '鼠标';
      elements.compatibilityBadge.textContent = compatibility.domain
        ? `严格人工 · ${inputLabel} · ${compatibility.domain}`
        : `严格人工 · ${inputLabel}`;
    }
    if (elements.manualCompatibilitySelect) {
      elements.manualCompatibilitySelect.value = state.manualCompatibilityMode;
      elements.manualCompatibilitySelect.disabled = state.role !== 'controller';
    }
    if (elements.manualCompatibilityStatus) {
      elements.manualCompatibilityStatus.className = `compatibility-status${active ? ' active' : ''}`;
      if (active) {
        const inputText = nativeTouch
          ? '当前临时使用原生触摸；网页可能观察到触摸能力。'
          : '当前使用桌面鼠标、滚轮和键盘事件。';
        const auditText = compatibility.audit?.checkedAt
          ? `最近一次按需环境检查：${new Date(compatibility.audit.checkedAt).toLocaleString()}。`
          : '尚未执行网页环境检查；只有点“按需读取当前环境”才会执行一次。';
        const follow = compatibility.desktopTabFollow || {};
        const followText = follow.enabled
          ? (follow.strategy === 'uia' ? '标签跟随使用 Windows UI Automation，不轮询网页脚本。' : `标签跟随策略：${follow.strategy || '未知'}。`)
          : '标签页自动跟随已关闭。';
        elements.manualCompatibilityStatus.textContent =
          `严格人工模式已启用：保持原 Windows Edge、固定代理和真实桌面身份。${inputText}${auditText}${followText}`;
      } else if (state.manualCompatibilityMode === 'off') {
        elements.manualCompatibilityStatus.textContent = '严格人工模式已关闭：当前使用通用手机触摸/设备仿真。';
      } else {
        const domains = Array.isArray(compatibility.domains) ? compatibility.domains.join('、') : 'ChatGPT / Claude 域名';
        elements.manualCompatibilityStatus.textContent = `等待匹配 ${domains}；其他网页继续使用通用触摸模式。`;
      }
    }
    if (elements.compatibilityAuditText) {
      elements.compatibilityAuditText.textContent = compatibilityAuditView(compatibility.audit);
    }
    if (elements.displayButton) elements.displayButton.disabled = active || state.role !== 'controller';
    if (elements.displayLabel) elements.displayLabel.textContent = active ? (nativeTouch ? '触摸' : '严格') : (state.viewport.mobile ? '手机' : '桌面');
    if (elements.gestureModeSelect) {
      elements.gestureModeSelect.disabled = active;
      elements.gestureModeSelect.title = active ? '严格人工模式通过独立按钮在鼠标/滚轮与临时原生触摸之间切换' : '';
    }
    if (elements.inputModeSelect) {
      // 严格模式下开启"临时原生触摸"后允许在 原生触摸/dev 仿真 之间选择。
      elements.inputModeSelect.disabled = active && !nativeTouch;
      elements.inputModeSelect.title = active
        ? (nativeTouch ? '临时原生触摸已开启：可选原生触摸或 dev 仿真通道' : '严格人工模式默认桌面鼠标；开启临时原生触摸后可选注入通道')
        : '';
    }
    if (elements.strictNativeTouchButton) {
      elements.strictNativeTouchButton.hidden = !active;
      elements.strictNativeTouchButton.disabled = !active || state.role !== 'controller';
      elements.strictNativeTouchButton.textContent = nativeTouch ? '恢复桌面鼠标/滚轮' : '临时切换为原生触摸';
      elements.strictNativeTouchButton.classList.toggle('active', nativeTouch);
    }
    if (elements.fsStrictInputButton) {
      elements.fsStrictInputButton.hidden = !active;
      elements.fsStrictInputButton.disabled = !active || state.role !== 'controller';
      const icon = elements.fsStrictInputButton.querySelector('span');
      const label = elements.fsStrictInputButton.querySelector('small');
      if (icon) icon.textContent = nativeTouch ? '☝' : '🖱';
      if (label) label.textContent = nativeTouch ? '触摸' : '鼠标';
      elements.fsStrictInputButton.classList.toggle('active', nativeTouch);
    }
    if (elements.desktopWidthRange) elements.desktopWidthRange.disabled = active || state.role !== 'controller';
  }

  function updateDesktopTabFollowUi() {
    const follow = state.desktopTabFollow || state.capabilities.desktopTabFollow || {};
    if (elements.followDesktopTabsToggle) elements.followDesktopTabsToggle.checked = Boolean(state.followDesktopTabs);
    if (!elements.desktopTabFollowStatus) return;
    if (!state.followDesktopTabs) {
      elements.desktopTabFollowStatus.textContent = '已关闭：手机只在你从“标签”面板主动选择时切换。';
      return;
    }
    const strategy = follow.strategy || 'uia';
    if (strategy === 'uia') {
      const uia = follow.uia || {};
      if (uia.available && uia.running) {
        elements.desktopTabFollowStatus.textContent = uia.edgeForeground
          ? 'Windows UI Automation 正在跟随 Edge 前台标签；不会为此周期性执行网页脚本。'
          : 'Windows UI Automation 正常；电脑当前未聚焦 Edge，手机保持当前标签。';
      } else {
        const reason = uia.reason || '等待启动';
        elements.desktopTabFollowStatus.textContent = `Windows UI Automation 暂不可用（${reason}）；为避免网页轮询，手机保持当前标签，可手动选择。`;
      }
      return;
    }
    if (strategy === 'manual') {
      elements.desktopTabFollowStatus.textContent = '手动策略：不会自动识别电脑标签页。';
      return;
    }
    elements.desktopTabFollowStatus.textContent = '当前使用网页焦点兼容回退；严格人工模式默认不会启用此回退。';
  }

  function updateDedicatedWindowUi(payload = {}) {
    const enabled = Boolean(payload.enabled);
    state.dedicatedWindow = { enabled, windowId: payload.windowId || null };
    const toggle = $('dedicatedWindowToggle');
    const status = $('dedicatedWindowStatus');
    const closeButton = $('closeDedicatedWindowButton');
    if (toggle) toggle.checked = enabled;
    if (closeButton) closeButton.disabled = !enabled;
    if (status) {
      status.textContent = enabled
        ? (payload.windowId
          ? `已启用：手机操作发生在专用窄窗口（${payload.width || 560}×${payload.height || 960}），电脑主窗口不受影响。`
          : '已启用：将在需要时创建专用窄窗口。')
        : '未启用。开启后手机操作发生在独立窄窗口，不改动电脑主窗口。';
    }
  }

  function ingestDesktopTabFollow(value) {
    if (!value || typeof value !== 'object') return;
    const payload = value.status && typeof value.status === 'object' ? value.status : value;
    state.desktopTabFollow = { ...(state.desktopTabFollow || {}), ...payload };
    if (typeof value.enabled === 'boolean') state.followDesktopTabs = value.enabled;
    else if (typeof payload.enabled === 'boolean') state.followDesktopTabs = payload.enabled;
    updateDesktopTabFollowUi();
    updateManualCompatibilityUi();
  }

  function syncAdvancedControls() {
    const serverDefaultWidth = clamp(Number(state.capabilities.desktopWidth) || storedDesktopWidth, 800, 2560);
    state.viewport.desktopWidth = clamp(Number(state.viewport.desktopWidth) || serverDefaultWidth, 800, 2560);
    const supported = Array.isArray(state.capabilities.streamPresets) && state.capabilities.streamPresets.length
      ? state.capabilities.streamPresets
      : ['auto', 'economy', 'realtime', 'balanced', 'clear'];
    if (!supported.includes(state.viewport.streamPreset)) state.viewport.streamPreset = supported.includes(storedStreamPreset) ? storedStreamPreset : supported[0];
    if (elements.desktopWidthRange) {
      elements.desktopWidthRange.value = String(state.viewport.desktopWidth);
      elements.desktopWidthValue.textContent = `${state.viewport.desktopWidth} px`;
    }
    if (elements.streamPresetSelect) {
      [...elements.streamPresetSelect.options].forEach((option) => { option.hidden = !supported.includes(option.value); });
      elements.streamPresetSelect.value = state.viewport.streamPreset;
    }
    updateDesktopTabFollowUi();
    updateManualCompatibilityUi();
  }

  function reportFrameProblem(reason) {
    send({
      type: 'frameProblem',
      reason: String(reason || 'unknown').slice(0, 100),
      failures: state.fallbackFailures,
      expectedEpoch: state.expectedFrameEpoch,
      displayedEpoch: state.displayedFrameEpoch
    });
  }

  function ingestManualCompatibility(value) {
    if (!value || typeof value !== 'object') return;
    const previousActive = Boolean(state.manualCompatibility?.active);
    state.manualCompatibility = { ...state.manualCompatibility, ...value };
    if (value.audit && typeof value.audit === 'object') {
      state.manualCompatibility.audit = { ...(state.manualCompatibility.audit || {}), ...value.audit };
    }
    const active = Boolean(state.manualCompatibility.active);
    if (active && !state.manualCompatibility.nativeTouchEnabled && state.gesture?.mode === 'direct') cancelActiveGesture();
    if (active !== previousActive) {
      showToast(active
        ? '已进入严格人工模式：原 Windows Edge＋固定代理＋桌面鼠标/滚轮。'
        : '已退出严格人工模式，恢复通用手机触摸模式。', 'info', 3400);
      // 退出严格模式时强制重发一次视口：把手机真实的舞台尺寸与手机/桌面
      // 偏好重新告知服务端（严格模式期间手机可能旋转过、服务端存的宽高
      // 已过期），让服务端以正确参数重建仿真，避免切换后页面尺寸异常。
      if (!active) scheduleViewport(true, true, 'manual-mode-exit');
    }
    updateManualCompatibilityUi();
  }

  async function toggleStrictNativeTouch() {
    if (!state.manualCompatibility?.active) {
      showToast('当前网页没有启用严格人工模式。', 'warn', 2200);
      return;
    }
    if (state.role !== 'controller') {
      showToast('请先接管控制权。', 'warn', 2200);
      return;
    }
    const next = !strictNativeTouchActive();
    cancelActiveGesture();
    try {
      const result = await request('strictNativeTouch', { enabled: next }, 20000);
      ingestManualCompatibility(result);
      showToast(next
        ? '已临时启用原生触摸；适合地图、Canvas、滑块和拖拽。'
        : '已恢复桌面鼠标、滚轮和键盘输入。', 'info', 3600);
    } catch (error) {
      showToast(`切换输入方式失败：${error.message}`, 'error', 4200);
    }
  }

  function applyControllerPreferences() {
    if (!state.connected || state.role !== 'controller' || state.preferencesAppliedForConnection) return;
    state.preferencesAppliedForConnection = true;
    request('manualCompatibility', { mode: state.manualCompatibilityMode }, 25000).then((result) => {
      ingestManualCompatibility(result);
      scheduleViewport(true, true);
      return Promise.all([
        request('streamPreset', { preset: state.viewport.streamPreset }, 20000),
        request('followDesktopTabs', { enabled: state.followDesktopTabs }, 20000)
      ]);
    }).catch((error) => {
      state.preferencesAppliedForConnection = false;
      showToast(`恢复控制偏好失败：${error.message}`, 'warn', 3000);
    });
  }

  function handleTextMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch { return; }

    if (message.type === 'reply') {
      const pending = state.pendingRequests.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      state.pendingRequests.delete(message.requestId);
      if (message.ok) pending.resolve(message.result || {});
      else pending.reject(new Error(message.error || `${pending.type} 失败`));
      return;
    }

    switch (message.type) {
      case 'hello':
        if (message.limits) {
          state.capabilities = { ...state.capabilities, ...message.limits };
          if (message.limits.desktopTabFollow) ingestDesktopTabFollow(message.limits.desktopTabFollow);
          if (message.limits.manualCompatibility) ingestManualCompatibility(message.limits.manualCompatibility);
          $('clipboardBridgeButton').hidden = !message.limits.clipboardBridge;
          $('fsClipboardButton').hidden = !message.limits.clipboardBridge;
          $('rotateTokenButton').hidden = !message.limits.tokenRotatable;
          $('tokenRotateHint').hidden = !message.limits.tokenRotatable;
          if (message.limits.dedicatedWindow) updateDedicatedWindowUi(message.limits.dedicatedWindow);
        }
        syncAdvancedControls();
        break;
      case 'role':
        state.role = message.role || 'viewer';
        if (state.role !== 'controller') {
          state.preferencesAppliedForConnection = false;
          // 只读手机发出的 viewport 不会被应用；若挂起标志已被本机的发送
          // 置位，这里立即解除，避免持续丢帧到看门狗超时。
          if (state.viewportSyncPending) {
            state.viewportSyncPending = false;
            state.viewportSyncReason = '';
            clearTimeout(state.viewportSyncWatchdogTimer);
            state.viewportSyncWatchdogTimer = null;
          }
        }
        updateRoleUi();
        applyControllerPreferences();
        break;
      case 'status':
        state.latestStatus = { level: message.level, message: message.message, at: Date.now() };
        showToast(message.message, message.level || 'info', message.level === 'error' ? 5000 : 2600);
        if (/无法连接 Edge|调试连接断开|Edge 已退出|远程调试端口|Edge 当前未运行|Edge 暂时不可用|自动恢复/.test(message.message || '') && !state.currentFrame) {
          showEmpty('等待 Edge 调试连接', message.message, true);
        }
        break;
      case 'pageState':
        if (state.calibrationWizard?.targetId && message.targetId && state.calibrationWizard.targetId !== message.targetId) {
          cancelAutoCalibration({ silent: true, removeRemote: false }).then(() => {
            showToast('标签页已切换，自动校准已取消。', 'warn', 3000);
          });
        }
        // 换页/换标签后远程输入框已不是原来那个：实时同步基准作废。
        if ((message.url && state.pageState.url && message.url !== state.pageState.url) ||
            (message.targetId && state.pageState.targetId && message.targetId !== state.pageState.targetId)) {
          invalidateLiveSyncBase('页面已切换，实时同步已暂停：点"取回网页文本"重新对齐。');
        }
        state.pageState = { ...state.pageState, ...message };
        if (message.manualCompatibility) ingestManualCompatibility(message.manualCompatibility);
        if (message.desktopTabFollow) ingestDesktopTabFollow(message.desktopTabFollow);
        if (typeof message.followDesktopTabs === 'boolean') {
          state.followDesktopTabs = message.followDesktopTabs;
          storageSet('edgePhoneFollowDesktopTabsV67', String(state.followDesktopTabs));
        }
        if (message.targetId) {
          if (state.pendingChooser?.targetId && state.pendingChooser.targetId !== message.targetId) {
            clearUploadCloseTimer();
            state.uploadAbort = Boolean(state.uploading);
            state.pendingChooser = null;
            resetComputerBrowser();
            setOverlay('uploadOverlay', false);
          }
          state.activeTabId = message.targetId;
        }
        updatePageState();
        renderNavigationHistory(state.pageState.history);
        break;
      case 'tabs':
        state.tabs = Array.isArray(message.tabs) ? message.tabs : [];
        state.activeTabId = message.activeId || null;
        if (typeof message.followDesktopTabs === 'boolean') {
          state.followDesktopTabs = message.followDesktopTabs;
          storageSet('edgePhoneFollowDesktopTabsV67', String(state.followDesktopTabs));
        }
        renderTabs(state.tabs, state.activeTabId);
        break;
      case 'viewport': {
        const incoming = { ...message };
        // 严格人工模式期间服务端广播的 mobile:false 只是"当前显示桌面环境"
        // 的状态，不是用户的手机/桌面偏好。绝不能合入本地视口或写进
        // localStorage，否则退出严格模式后手机会以桌面布局渲染手机宽度的
        // 页面（尺寸异常），且重启后依旧。
        if (state.manualCompatibility.active) delete incoming.mobile;
        state.viewport = { ...state.viewport, ...incoming };
        const revision = Math.max(0, Number(message.revision) || 0);
        state.viewportRevisionCounter = Math.max(state.viewportRevisionCounter, revision);
        if (revision > state.requestedViewportRevision) state.requestedViewportRevision = revision;
        if (!state.manualCompatibility.active) storageSet('edgePhoneMobileV61', String(Boolean(state.viewport.mobile)));
        storageSet('edgePhoneDesktopWidthV61', String(state.viewport.desktopWidth || storedDesktopWidth));
        if (state.viewport.streamPreset) storageSet('edgePhoneStreamPresetV64', state.viewport.streamPreset);
        elements.displayLabel.textContent = state.manualCompatibility.active ? (strictNativeTouchActive() ? '触摸' : '严格') : (state.viewport.mobile ? '手机' : '桌面');
        elements.qualityRange.value = String(state.viewport.quality || storedQuality);
        elements.qualityValue.textContent = String(state.viewport.quality || storedQuality);
        syncAdvancedControls();
        break;
      }
      case 'capabilities':
        state.capabilities = { ...state.capabilities, ...message };
        if (message.manualCompatibility) ingestManualCompatibility(message.manualCompatibility);
        if (message.desktopTabFollow) ingestDesktopTabFollow(message.desktopTabFollow);
        if (typeof message.followDesktopTabs === 'boolean' && !state.preferencesAppliedForConnection) {
          // 手机本地偏好仍优先；服务端值用于首次展示与其他手机同步。
          state.capabilities.followDesktopTabs = message.followDesktopTabs;
        }
        syncAdvancedControls();
        break;
      case 'desktopTabFollow':
        ingestDesktopTabFollow(message);
        storageSet('edgePhoneFollowDesktopTabsV67', String(state.followDesktopTabs));
        syncAdvancedControls();
        break;
      case 'dedicatedWindow':
        updateDedicatedWindowUi(message);
        break;
      case 'desktopTabFollowStatus':
        ingestDesktopTabFollow({ strategy: message.strategy, uia: message.status, enabled: state.followDesktopTabs });
        break;
      case 'manualCompatibility':
        ingestManualCompatibility(message);
        break;
      case 'frameEpoch':
        beginFrameTransition(message.epoch, message.reason, message.targetId);
        break;
      case 'fileChooser':
        handleFileChooser(message);
        break;
      case 'uploadComplete': {
        const chooserId = message.chooserId || null;
        if (state.pendingChooser && chooserId && state.pendingChooser.id !== chooserId) break;
        state.pendingChooser = null;
        elements.uploadStatus.textContent = `网页已接收 ${message.count || 0} 个文件。`;
        showToast('文件已交给网页上传框', 'ok', 3000);
        closeUploadOverlaySoon(chooserId, 700);
        break;
      }
      case 'uploadCancelled': {
        const chooserId = message.chooserId || null;
        if (state.pendingChooser && chooserId && state.pendingChooser.id !== chooserId) break;
        // 上传进行中被服务端取消（选择框失效/其他端取消）时要立刻停止分块
        // 发送，而不是等发满一个确认窗口后才报"上传失败"。
        state.uploadAbort = Boolean(state.uploading);
        state.pendingChooser = null;
        elements.uploadStatus.textContent = '已取消。';
        clearUploadCloseTimer();
        setOverlay('uploadOverlay', false);
        break;
      }
      case 'dialog':
        elements.dialogMessage.textContent = message.message || '网页弹窗';
        elements.dialogPromptInput.value = message.defaultPrompt || '';
        elements.dialogPromptInput.hidden = message.dialogType !== 'prompt';
        setOverlay('dialogOverlay', true);
        if (message.dialogType === 'prompt') elements.dialogPromptInput.focus();
        break;
      case 'frameStats':
        state.lastServerSequence = Math.max(state.lastServerSequence, Number(message.sequence) || 0);
        if (Number(message.epoch) > state.expectedFrameEpoch) beginFrameTransition(message.epoch, message.source || 'stream', message.targetId);
        updateFrameBadge();
        break;
      default:
        break;
    }
  }

  async function handleBinaryMessage(data) {
    const arrayBuffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    if (arrayBuffer.byteLength < 9) throw new Error('画面数据过短');
    const bytes = new Uint8Array(arrayBuffer);
    const magic = new TextDecoder('ascii').decode(bytes.subarray(0, 4));
    if (magic !== 'EPC6') throw new Error(`未知画面协议：${magic}`);
    const view = new DataView(arrayBuffer);
    const headerLength = view.getUint32(4, true);
    if (headerLength <= 0 || headerLength > 1024 * 1024 || 8 + headerLength >= arrayBuffer.byteLength) {
      throw new Error('画面元数据长度无效');
    }
    const metadataText = new TextDecoder().decode(bytes.subarray(8, 8 + headerLength));
    const metadata = JSON.parse(metadataText);
    const blob = new Blob([arrayBuffer.slice(8 + headerLength)], { type: metadata.contentType === 'image/png' ? 'image/png' : 'image/jpeg' });
    enqueueFrame(blob, metadata, 'websocket');
  }

  function acknowledgeDiscardedFrame(metadata = {}, reason = 'discarded') {
    send({
      type: 'frameAck',
      sequence: Number(metadata.sequence) || 0,
      renderMs: 0,
      renderer: `discard:${String(reason).slice(0, 14)}`,
      source: String(metadata.source || 'unknown'),
      imageWidth: 0,
      imageHeight: 0,
      epoch: Number(metadata.epoch) || 0
    });
  }

  function enqueueFrame(blob, metadata = {}, transport = 'unknown') {
    const sequence = Number(metadata.sequence) || 0;
    const epoch = Number(metadata.epoch) || 0;
    const targetId = metadata.targetId || null;
    const timestamp = Number(metadata.timestamp) || 0;
    const source = String(metadata.source || transport || 'unknown');
    const isStreamFrame = source.startsWith('screencast');
    const snapshotBaseSequence = Number(metadata.snapshotBaseSequence) || 0;
    const viewportRevision = Math.max(0, Number(metadata.viewportRevision) || 0);

    // While a remote viewport update is in flight, keep the last correctly
    // fitted frame visible but never accept a late frame from the old size.
    if (state.viewportSyncPending && state.requestedViewportRevision > 0 && viewportRevision > 0 &&
        viewportRevision < state.requestedViewportRevision) {
      acknowledgeDiscardedFrame(metadata, 'old-viewport');
      return;
    }
    if (epoch && epoch < state.expectedFrameEpoch) { acknowledgeDiscardedFrame(metadata, 'old-epoch'); return; }
    // 防止较早开始、较晚返回的截图覆盖更新的连续帧，造成两个画面来回闪。
    if (!isStreamFrame && snapshotBaseSequence && state.lastStreamFrameSequence > snapshotBaseSequence &&
        epoch === state.displayedFrameEpoch && (!targetId || !state.lastDisplayedTargetId || targetId === state.lastDisplayedTargetId)) { acknowledgeDiscardedFrame(metadata, 'old-snapshot'); return; }
    if (targetId && state.activeTabId && targetId !== state.activeTabId && epoch <= state.expectedFrameEpoch) { acknowledgeDiscardedFrame(metadata, 'old-target'); return; }
    if (sequence && sequence <= state.lastRenderedSequence && epoch <= state.displayedFrameEpoch) { acknowledgeDiscardedFrame(metadata, 'old-sequence'); return; }
    if (
      timestamp &&
      state.lastDisplayedTimestamp &&
      epoch === state.displayedFrameEpoch &&
      (!targetId || !state.lastDisplayedTargetId || targetId === state.lastDisplayedTargetId) &&
      timestamp < state.lastDisplayedTimestamp - 0.08
    ) { acknowledgeDiscardedFrame(metadata, 'old-time'); return; }

    const queuedSequence = Number(state.queuedFrame?.metadata?.sequence) || 0;
    const queuedEpoch = Number(state.queuedFrame?.metadata?.epoch) || 0;
    if (state.queuedFrame) {
      if (epoch && queuedEpoch && epoch < queuedEpoch) { acknowledgeDiscardedFrame(metadata, 'queued-epoch'); return; }
      if (epoch === queuedEpoch && sequence && queuedSequence && sequence <= queuedSequence) { acknowledgeDiscardedFrame(metadata, 'queued-seq'); return; }
    }

    if (state.queuedFrame?.metadata?.transport === 'websocket') {
      acknowledgeDiscardedFrame(state.queuedFrame.metadata, 'replaced');
    }
    if (epoch > state.expectedFrameEpoch) beginFrameTransition(epoch, metadata.source || transport, targetId);
    state.lastFrameReceivedAt = Date.now();
    state.lastServerSequence = Math.max(state.lastServerSequence, sequence);
    // 帧打上连接代号：重连后旧连接的帧仍可显示，但不得把 epoch/序号门槛
    // 抬回重启前的水平（否则新服务端的小编号帧会再次被全部丢弃）。
    state.queuedFrame = { blob, metadata: { ...metadata, transport, connectionGeneration: state.connectionGeneration }, receivedAt: performance.now() };
    if (!state.rendering) processFrameQueue();
  }

  // 以新的布局/渲染器重画当前帧。已有排队帧（必然比 currentFrame 新）时
  // 不覆盖它——直接渲染排队帧同样能达到重画目的；覆盖会让那帧永远得不到
  // frameAck，服务端要等满 700ms 超时才继续发帧，并误判为网络拥塞。
  function requeueCurrentFrame() {
    if (!state.currentFrame) return;
    if (!state.queuedFrame) state.queuedFrame = state.currentFrame;
    if (!state.rendering) processFrameQueue();
  }

  async function processFrameQueue() {
    if (state.rendering) return;
    state.rendering = true;
    try {
      while (state.queuedFrame) {
        const frame = state.queuedFrame;
        state.queuedFrame = null;
        await renderFrame(frame);
      }
    } finally {
      state.rendering = false;
    }
  }

  function resolvedRenderer() {
    if (state.rendererPreference === 'canvas') return state.canvasFailures < 3 ? 'canvas' : 'image';
    if (state.rendererPreference === 'image') return state.imageFailures < 3 ? 'image' : 'canvas';
    if (state.rendererActive === 'canvas' && state.canvasFailures < 3) return 'canvas';
    if (state.rendererActive === 'image' && state.imageFailures < 3) return 'image';
    return state.canvasFailures < 3 ? 'canvas' : 'image';
  }

  function canvasContext() {
    return elements.canvas.getContext('2d', { alpha: false });
  }

  function sizeCanvas() {
    const rect = elements.stage.getBoundingClientRect();
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    const resized = elements.canvas.width !== width || elements.canvas.height !== height;
    if (resized) {
      elements.canvas.width = width;
      elements.canvas.height = height;
    }
    return { width: rect.width, height: rect.height, pixelWidth: width, pixelHeight: height, dpr, resized };
  }

  function ensureBackCanvas(width, height) {
    if (!state.backCanvas) state.backCanvas = document.createElement('canvas');
    if (state.backCanvas.width !== width || state.backCanvas.height !== height) {
      state.backCanvas.width = width;
      state.backCanvas.height = height;
    }
    return state.backCanvas;
  }

  function withTimeout(promise, milliseconds, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}超时`)), milliseconds);
      Promise.resolve(promise).then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async function decodeBitmap(blob) {
    if (typeof createImageBitmap !== 'function') throw new Error('浏览器不支持 ImageBitmap');
    return withTimeout(createImageBitmap(blob), 6500, '画面解码');
  }

  function imageLayer(index) {
    return index === 0 ? elements.image : elements.imageBuffer;
  }

  function revokeLayerUrl(index, expectedUrl = '') {
    const current = state.imageUrls[index] || '';
    if (!current || (expectedUrl && current !== expectedUrl)) return;
    state.imageUrls[index] = '';
    try { URL.revokeObjectURL(current); } catch {}
    const layer = imageLayer(index);
    if (layer && layer.src === current) layer.removeAttribute('src');
  }

  function hideImageLayers(revoke = false) {
    for (let index = 0; index < 2; index += 1) {
      const layer = imageLayer(index);
      layer.style.visibility = 'hidden';
      layer.style.zIndex = '1';
      if (revoke && state.imageUrls[index]) {
        const url = state.imageUrls[index];
        setTimeout(() => revokeLayerUrl(index, url), 350);
      }
    }
    state.activeImageIndex = -1;
  }

  function loadImageLayer(layer, blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      let settled = false;
      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        layer.onload = null;
        layer.onerror = null;
        if (error) {
          try { URL.revokeObjectURL(url); } catch {}
          reject(error);
        } else {
          resolve({ url, width: layer.naturalWidth, height: layer.naturalHeight });
        }
      };
      const timer = setTimeout(() => finish(new Error('兼容图像解码超时')), 7000);
      layer.onload = () => finish();
      layer.onerror = () => finish(new Error('兼容图像解码失败'));
      layer.src = url;
      if (typeof layer.decode === 'function') layer.decode().then(() => finish()).catch(() => {});
    });
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function computeGeometry(imageWidth, imageHeight, metadata) {
    const rect = elements.stage.getBoundingClientRect();
    return Geometry.computeFrameGeometry({
      containerWidth: Math.max(1, rect.width),
      containerHeight: Math.max(1, rect.height),
      imageWidth,
      imageHeight,
      localDevicePixelRatio: window.devicePixelRatio || 1,
      remoteWidth: state.viewport.width,
      remoteHeight: state.viewport.height,
      metadata
    });
  }

  async function renderFrame(frame) {
    const renderStartedAt = performance.now();
    const preferred = resolvedRenderer();
    const candidates = preferred === 'image' ? ['image', 'canvas'] : ['canvas', 'image'];
    let lastError = null;

    for (const candidate of candidates) {
      try {
        if (candidate === 'image') await renderWithImage(frame);
        else await renderWithCanvas(frame);

        state.currentFrame = frame;
        const renderedViewportRevision = Math.max(0, Number(frame.metadata.viewportRevision) || 0);
        state.displayedViewportRevision = Math.max(state.displayedViewportRevision, renderedViewportRevision);
        if (state.viewportSyncPending && renderedViewportRevision >= state.requestedViewportRevision) {
          state.viewportSyncPending = false;
          state.viewportSyncReason = '';
          clearTimeout(state.viewportSyncWatchdogTimer);
          state.viewportSyncWatchdogTimer = null;
        }
        // 旧连接的帧（重连前排队/渲染中/被 requeue 的）只负责显示,不参与
        // 排序门槛：否则它会把 epoch/序号抬回重启前的水平,重新冻结画面。
        const sameGeneration = !frame.metadata.connectionGeneration ||
          frame.metadata.connectionGeneration === state.connectionGeneration;
        if (sameGeneration) {
          completeFrameTransition(Number(frame.metadata.epoch) || 0);
          if (frame.metadata.targetId) state.activeTabId = frame.metadata.targetId;
          state.lastRenderedSequence = Math.max(state.lastRenderedSequence, Number(frame.metadata.sequence) || 0);
          if (String(frame.metadata.source || frame.metadata.transport || '').startsWith('screencast')) {
            state.lastStreamFrameSequence = Math.max(state.lastStreamFrameSequence, Number(frame.metadata.sequence) || 0);
          }
          const timestamp = Number(frame.metadata.timestamp) || 0;
          if (timestamp) state.lastDisplayedTimestamp = Math.max(state.lastDisplayedTimestamp, timestamp);
          state.lastDisplayedTargetId = frame.metadata.targetId || state.lastDisplayedTargetId;
        }
        state.lastFrameRenderedAt = Date.now();
        state.lastFrameSource = frame.metadata.source || frame.metadata.transport || 'unknown';
        if (String(state.lastFrameSource).startsWith('screencast')) {
          state.lastStreamFrameRenderedAt = Date.now();
        }
        state.fallbackFailures = 0;
        if (candidate === 'image') state.imageFailures = Math.max(0, state.imageFailures - 1);
        else state.canvasFailures = Math.max(0, state.canvasFailures - 1);
        hideEmpty();
        updateFrameBadge();
        updateDiagnosticsText(false);
        send({
          type: 'frameAck',
          sequence: Number(frame.metadata.sequence) || 0,
          renderMs: Math.round((performance.now() - renderStartedAt) * 10) / 10,
          renderer: state.rendererActive,
          source: state.lastFrameSource,
          imageWidth: Math.round(state.currentGeometry?.imageWidth || 0),
          imageHeight: Math.round(state.currentGeometry?.imageHeight || 0),
          epoch: Number(frame.metadata.epoch) || 0
        });
        if (candidate !== preferred) {
          showToast(candidate === 'image' ? 'Canvas 异常，已无缝切换兼容图像层' : '图像层异常，已无缝切换 Canvas', 'warn', 2600);
        }
        return;
      } catch (error) {
        lastError = error;
        console.error(error);
        if (candidate === 'image') state.imageFailures += 1;
        else state.canvasFailures += 1;
      }
    }

    state.fallbackFailures += 1;
    reportFrameProblem(`decode:${lastError?.message || 'unknown'}`);
    if (!state.currentFrame) {
      showEmpty('画面解码失败', `两种渲染方式均失败：${lastError?.message || '未知错误'}。正在从独立截图通道恢复。`, true);
    } else if (Date.now() - state.lastDecodeWarningAt > 3500) {
      state.lastDecodeWarningAt = Date.now();
      showToast('新画面解码失败，已保留上一帧并自动恢复，不会再闪成黑屏。', 'warn', 3000);
    }
    fetchFrameFallback(true, '渲染失败').catch(() => {});
  }

  async function renderWithCanvas(frame) {
    const bitmap = await decodeBitmap(frame.blob);
    try {
      const sizing = sizeCanvas();
      const geometry = computeGeometry(bitmap.width, bitmap.height, frame.metadata);
      const backCanvas = ensureBackCanvas(sizing.pixelWidth, sizing.pixelHeight);
      const backContext = backCanvas.getContext('2d', { alpha: false });
      const context = canvasContext();
      if (!backContext || !context || context.isContextLost?.()) throw new Error('Canvas 上下文不可用');

      backContext.setTransform(1, 0, 0, 1, 0, 0);
      backContext.fillStyle = '#000';
      backContext.fillRect(0, 0, sizing.pixelWidth, sizing.pixelHeight);
      backContext.setTransform(sizing.dpr, 0, 0, sizing.dpr, 0, 0);
      backContext.imageSmoothingEnabled = true;
      backContext.drawImage(bitmap, geometry.drawX, geometry.drawY, geometry.drawWidth, geometry.drawHeight);

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(backCanvas, 0, 0);
      state.currentGeometry = geometry;
      state.rendererActive = 'canvas';
      elements.canvas.style.visibility = 'visible';
      hideImageLayers(true);
    } finally {
      bitmap.close?.();
    }
  }

  async function renderWithImage(frame) {
    const previousIndex = state.activeImageIndex;
    const nextIndex = previousIndex === 0 ? 1 : 0;
    const layer = imageLayer(nextIndex);
    const staleUrl = state.imageUrls[nextIndex];
    if (staleUrl) revokeLayerUrl(nextIndex, staleUrl);
    layer.style.visibility = 'hidden';
    layer.style.zIndex = '2';

    const decoded = await loadImageLayer(layer, frame.blob);
    const geometry = computeGeometry(decoded.width, decoded.height, frame.metadata);
    layer.style.left = `${geometry.drawX}px`;
    layer.style.top = `${geometry.drawY}px`;
    layer.style.width = `${geometry.drawWidth}px`;
    layer.style.height = `${geometry.drawHeight}px`;
    state.imageUrls[nextIndex] = decoded.url;

    await nextPaint();
    layer.style.visibility = 'visible';
    if (previousIndex >= 0) {
      const previousLayer = imageLayer(previousIndex);
      const previousUrl = state.imageUrls[previousIndex];
      previousLayer.style.visibility = 'hidden';
      previousLayer.style.zIndex = '1';
      if (previousUrl) setTimeout(() => revokeLayerUrl(previousIndex, previousUrl), 350);
    }
    elements.canvas.style.visibility = 'hidden';
    state.activeImageIndex = nextIndex;
    state.currentGeometry = geometry;
    state.rendererActive = 'image';
  }

  function decodeBase64UrlJson(value) {
    if (!value) return {};
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  async function fetchFrameFallback(fresh = true, reason = 'fallback') {
    if (!state.token) throw new Error('缺少访问令牌');
    if (state.fallbackPromise) return state.fallbackPromise;
    const now = Date.now();
    if (!fresh && now - state.lastFallbackAt < 900) return false;
    if (fresh && now - state.lastFallbackAt < 350) return false;
    state.lastFallbackAt = now;

    state.fallbackPromise = (async () => {
      const url = `/api/frame.jpg?fresh=${fresh ? '1' : '0'}&t=${Date.now()}`;
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${state.token}` }
      });
      if (!response.ok) {
        let detail = `${response.status}`;
        try { detail = (await response.json()).error || detail; } catch {}
        throw new Error(`截图通道失败：${detail}`);
      }
      const metadata = decodeBase64UrlJson(response.headers.get('X-EPC-Metadata'));
      const blob = await response.blob();
      enqueueFrame(blob, { ...metadata, source: metadata.source || `http:${reason}` }, 'http');
      return true;
    })().catch((error) => {
      state.fallbackFailures += 1;
      reportFrameProblem(`snapshot:${error.message}`);
      if (!state.currentFrame) showEmpty('暂时没有 Edge 画面', error.message, false);
      throw error;
    }).finally(() => {
      state.fallbackPromise = null;
    });

    return state.fallbackPromise;
  }

  function scheduleNoFrameFallback(delay, reason) {
    const startedAt = Date.now();
    setTimeout(() => {
      if (!state.connected || state.lastFrameRenderedAt >= startedAt) return;
      fetchFrameFallback(true, reason).catch(() => {});
    }, delay);
  }

  function markVisualDemand(reason, delay = 900) {
    state.demandSequence = state.lastRenderedSequence;
    clearTimeout(state.demandTimer);
    state.demandTimer = setTimeout(() => {
      if (!state.connected || document.hidden) return;
      if (state.lastRenderedSequence > state.demandSequence) return;
      fetchFrameFallback(true, `demand:${reason}`).catch(() => {});
    }, delay);
  }

  async function recoverFrame(restartStream = false) {
    showToast(restartStream ? '正在重启画面通道…' : '正在获取最新截图…', 'info', 1800);
    try {
      if (restartStream) await request('recoverFrame', {}, 20000);
      await fetchFrameFallback(true, restartStream ? 'restart' : 'manual');
    } catch (error) {
      showToast(error.message, 'error', 4500);
    }
  }

  // fetchFrameFallback 在帧入队后即返回，渲染是异步的。校准等需要"确实
  // 有画面"的入口在恢复后要短暂等待渲染完成，否则恢复成功也会误报无画面。
  async function waitForRenderedFrame(timeoutMs = 1500) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (state.currentFrame && state.currentGeometry) return true;
      await sleep(50);
    }
    return Boolean(state.currentFrame && state.currentGeometry);
  }

  function updateFrameBadge() {
    if (state.resizeSettling || state.viewportSyncPending) {
      elements.frameBadge.textContent = '尺寸同步中 · 保留旧画面';
      return;
    }
    if (state.expectedFrameEpoch > state.displayedFrameEpoch) {
      const retained = state.lastFrameRenderedAt ? ' · 保留旧画面' : '';
      elements.frameBadge.textContent = `${transitionReasonLabel(state.frameTransitionReason)}${retained}`;
      return;
    }
    if (!state.lastFrameRenderedAt) {
      elements.frameBadge.textContent = '无画面';
      return;
    }
    const age = Date.now() - state.lastFrameRenderedAt;
    const mode = state.rendererActive === 'image' ? '兼容' : 'Canvas';
    const streamed = String(state.lastFrameSource || '').startsWith('screencast');
    const source = streamed && age > 5000 && state.lastServerSequence <= state.lastRenderedSequence
      ? '画面静止'
      : streamed ? '连续帧' : '截图';
    elements.frameBadge.textContent = `${source} · ${mode} · ${formatAge(age)}`;
  }

  function updatePageState() {
    const url = state.pageState.url || '';
    if (document.activeElement !== elements.addressInput) elements.addressInput.value = url;
    elements.backButton.disabled = state.role !== 'controller' || !state.pageState.canGoBack;
    elements.forwardButton.disabled = state.role !== 'controller' || !state.pageState.canGoForward;
    elements.fsBackButton.disabled = elements.backButton.disabled;
    elements.fsForwardButton.disabled = elements.forwardButton.disabled;
    document.title = state.pageState.title ? `${state.pageState.title} · Edge 控制` : 'Edge 手机控制器';
  }

  function updateRoleUi() {
    const isController = state.role === 'controller';
    const isViewer = state.role === 'viewer';
    elements.roleBadge.className = isController ? 'controller' : isViewer ? 'viewer' : '';
    elements.roleBadge.textContent = isController ? '正在控制' : isViewer ? '只读 · 点此接管' : state.connected ? '等待控制权' : '已断开';
    elements.claimControlButton.disabled = isController || !state.connected;
    elements.claimControlButton.textContent = isController ? '本机正在控制' : '接管控制';
    for (const control of state.roleControls) control.disabled = !isController;
    updatePageState();
    if (state.tabs.length) {
      renderTabs(state.tabs, state.activeTabId);
    }
    if (state.browserHistory.items.length) renderBrowserHistory();
    updateManualCompatibilityUi();
  }

  async function claimControl() {
    try {
      await request('claimControl');
      showToast('已接管控制权', 'ok', 1800);
    } catch (error) {
      showToast(error.message, 'error', 3500);
    }
  }

  function scheduleViewport(immediate = false, force = false, reason = 'layout') {
    clearTimeout(state.viewportTimer);
    state.pendingViewportForce = state.pendingViewportForce || Boolean(force);
    if (state.gesture) {
      state.deferredViewport = true;
      return;
    }
    state.viewportTimer = setTimeout(() => {
      const forceNow = state.pendingViewportForce;
      state.pendingViewportForce = false;
      sendViewport(forceNow, reason);
    }, immediate ? 20 : 260);
  }

  function localViewportInputIsActive() {
    const active = document.activeElement;
    return elements.keyboardPanel.classList.contains('open') || Boolean(
      active && active !== document.body && active.matches?.('input, textarea, select')
    );
  }

  function stageSize() {
    const rect = elements.stage.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      rawWidth: rect.width,
      rawHeight: rect.height
    };
  }

  function scheduleStableHeightViewportSync() {
    clearTimeout(state.stableHeightViewportTimer);
    state.stableHeightViewportTimer = null;
    if (!state.viewport.mobile || document.fullscreenElement || state.gesture || localViewportInputIsActive() || state.resizeSettling) return;
    const previous = state.lastSentViewport;
    if (!previous) return;
    const current = stageSize();
    const widthDelta = Math.abs(current.width - previous.stageWidth);
    const heightDelta = Math.abs(current.height - previous.stageHeight);
    const threshold = Math.max(120, previous.stageHeight * 0.16);
    if (widthDelta >= 2 || heightDelta < threshold) return;

    state.stableHeightViewportTimer = setTimeout(() => {
      state.stableHeightViewportTimer = null;
      if (!wsIsOpen() || !state.viewport.mobile || document.fullscreenElement || state.gesture || localViewportInputIsActive()) return;
      const latestSize = stageSize();
      const latest = state.lastSentViewport;
      if (!latest || Math.abs(latestSize.width - latest.stageWidth) >= 2) return;
      const currentThreshold = Math.max(120, latest.stageHeight * 0.16);
      if (Math.abs(latestSize.height - latest.stageHeight) < currentThreshold) return;
      if (Date.now() - state.lastStableHeightViewportSyncAt < 2200) return;
      state.lastStableHeightViewportSyncAt = Date.now();
      settleViewport('stable-height-sync', { fallback: false });
    }, 950);
  }

  // viewport 消息没有应答：如果服务端当时恰好无法应用（Edge 正在重启），
  // 同步标志会永远挂起——所有旧修订号的帧被丢弃、触摸被拒绝。看门狗在超时
  // 后解除挂起，仅在本机是控制者时重发一次视口。
  function armViewportSyncWatchdog() {
    clearTimeout(state.viewportSyncWatchdogTimer);
    state.viewportSyncWatchdogTimer = setTimeout(() => {
      state.viewportSyncWatchdogTimer = null;
      if (!state.viewportSyncPending) return;
      // 只读手机的 viewport 会被服务端拒绝：绝不能重发（修订号会越追越远、
      // 每次都触发一条错误提示），只解除挂起、继续显示控制手机的画面。
      if (state.role !== 'controller') {
        state.viewportSyncPending = false;
        state.viewportSyncReason = '';
        return;
      }
      // 手势进行中或旋转尺寸未稳定时不强行重发（会取消手势/发出过渡尺寸），
      // 推迟到下个周期再试。
      if (state.gesture || state.resizeSettling) {
        armViewportSyncWatchdog();
        return;
      }
      state.viewportSyncPending = false;
      if (wsIsOpen()) sendViewport(true, 'viewport-retry');
    }, 4000);
  }

  function sendViewport(force = false, reason = 'viewport') {
    if (!wsIsOpen()) return false;
    const size = stageSize();
    if (size.rawWidth < 100 || size.rawHeight < 100) return false;
    const mobile = Boolean(state.viewport.mobile);
    const desktopWidth = clamp(Number(state.viewport.desktopWidth) || storedDesktopWidth, 800, 2560);
    // 页面缩放：仿真视口按比例缩小，同屏显示即等比放大内容。手机模式除
    // 手机屏幕尺寸，桌面模式除"桌面网页宽度"，两种显示模式同一套倍率。
    const zoom = clamp((Number(state.mobileZoom) || 100) / 100, 0.9, 1.5);
    const width = mobile
      ? Math.max(240, Math.round(size.width / zoom))
      : clamp(Math.round(desktopWidth / zoom), 480, 2560);
    const height = mobile
      ? Math.max(320, Math.round(size.height / zoom))
      : clamp(Math.round(width * size.rawHeight / Math.max(1, size.rawWidth)), 480, 2560);
    const next = {
      width,
      height,
      dpr: mobile
        ? clamp(window.devicePixelRatio || 1, 1, 2.5)
        : clamp(window.devicePixelRatio || 1, 1, 1.5),
      mobile,
      desktopWidth,
      stageWidth: size.width,
      stageHeight: size.height
    };

    const previous = state.lastSentViewport;
    const widthChanged = !previous || Math.abs(next.width - previous.width) >= 2;
    const heightChanged = !previous || Math.abs(next.height - previous.height) >= 2;
    const modeChanged = !previous || next.mobile !== previous.mobile || next.desktopWidth !== previous.desktopWidth;
    const dprChanged = !previous || Math.abs(next.dpr - previous.dpr) > 0.05;

    // Ordinary Android browser-bar animation remains a local fit. A stable
    // fullscreen/orientation/manual sync calls this function with force=true.
    if (!force && previous && !widthChanged && !modeChanged && !dprChanged) return false;

    const revision = Math.max(
      state.viewportRevisionCounter,
      state.requestedViewportRevision,
      Number(state.viewport.revision) || 0,
      Number(previous?.revision) || 0
    ) + 1;
    state.viewportRevisionCounter = revision;
    state.requestedViewportRevision = revision;
    state.viewportSyncPending = true;
    state.viewportSyncReason = reason;
    armViewportSyncWatchdog();
    state.lastSentViewport = { ...next, revision };
    state.viewport = { ...state.viewport, ...next, revision };
    send({ type: 'viewport', ...next, revision, force: Boolean(force), reason });
    updateFrameBadge();
    return true;
  }

  function clearViewportSettleTimers() {
    state.viewportSettleGeneration += 1;
    clearTimeout(state.viewportSettleTimer);
    clearTimeout(state.viewportFallbackTimer);
    state.viewportSettleTimer = null;
    state.viewportFallbackTimer = null;
  }

  function settleViewport(reason = 'manual-size-sync', options = {}) {
    const { fallback = true } = options;
    clearViewportSettleTimers();
    if (state.calibrationWizard) {
      cancelAutoCalibration({ silent: true }).catch(() => {});
      showToast('画面尺寸发生变化，已取消本次校准；尺寸稳定后请重新开始。', 'warn', 3200);
    }
    if (state.calibrationTestMode) stopCalibrationTest({ silent: true }).catch(() => {});
    const generation = state.viewportSettleGeneration;
    state.resizeSettling = true;
    state.viewportSyncReason = reason;
    cancelActiveGesture();
    let previous = null;
    let stableSamples = 0;
    const startedAt = performance.now();

    const sample = () => {
      if (generation !== state.viewportSettleGeneration) return;
      const current = stageSize();
      if (previous && Math.abs(current.width - previous.width) <= 1 && Math.abs(current.height - previous.height) <= 1) {
        stableSamples += 1;
      } else {
        stableSamples = 0;
      }
      previous = current;
      const elapsed = performance.now() - startedAt;
      if (stableSamples >= 3 || elapsed >= 1450) {
        state.resizeSettling = false;
        sendViewport(true, reason);
        if (!state.gesture) requeueCurrentFrame();
        markVisualDemand(reason, 1350);
        if (fallback) {
          state.viewportFallbackTimer = setTimeout(() => {
            if (generation !== state.viewportSettleGeneration) return;
            const latest = stageSize();
            const sent = state.lastSentViewport;
            if (!sent || Math.abs(latest.width - sent.stageWidth) > 2 || Math.abs(latest.height - sent.stageHeight) > 2) {
              settleViewport(`${reason}-fallback`, { fallback: false });
            }
          }, 900);
        }
        return;
      }
      state.viewportSettleTimer = setTimeout(sample, 80);
    };
    requestAnimationFrame(sample);
  }

  function currentCalibrationProfileKey() {
    // Orientation is physical-device orientation, not the current remote-stage
    // aspect ratio. This prevents opening the soft keyboard from silently
    // switching a portrait calibration into the landscape profile.
    return calibrationProfileKeyFor(Boolean(document.fullscreenElement), window.innerWidth, window.innerHeight);
  }

  function persistCalibrationProfiles() {
    for (const key of CALIBRATION_PROFILE_KEYS) {
      state.calibrationProfiles[key] = Geometry.normalizeCalibration(state.calibrationProfiles[key] || {});
    }
    storageSet(CALIBRATION_STORAGE_KEY, JSON.stringify(state.calibrationProfiles));
  }

  function saveCurrentCalibrationProfile() {
    state.calibration = Geometry.normalizeCalibration(state.calibration);
    state.calibrationProfiles[state.calibrationProfileKey] = { ...state.calibration };
    persistCalibrationProfiles();
  }

  function ensureCalibrationProfileCurrent(reason = 'layout', options = {}) {
    const nextKey = currentCalibrationProfileKey();
    if (state.calibrationProfileKey === nextKey) {
      updateCalibrationUi();
      return false;
    }
    saveCurrentCalibrationProfile();
    state.calibrationProfileKey = nextKey;
    state.calibration = Geometry.normalizeCalibration(state.calibrationProfiles[nextKey] || {});
    cancelActiveGesture();
    if (state.calibrationTestMode) stopCalibrationTest({ silent: true }).catch(() => {});
    if (!options.silent) {
      showToast(`已切换触摸配置：${calibrationProfileLabelFor(nextKey)}`, 'info', 1900);
    }
    updateCalibrationUi();
    return true;
  }

  function copyCalibrationProfile(fromKey, toKey) {
    if (!CALIBRATION_PROFILE_KEYS.includes(fromKey) || !CALIBRATION_PROFILE_KEYS.includes(toKey)) return false;
    if (fromKey === state.calibrationProfileKey) saveCurrentCalibrationProfile();
    state.calibrationProfiles[toKey] = Geometry.normalizeCalibration(state.calibrationProfiles[fromKey] || {});
    if (toKey === state.calibrationProfileKey) state.calibration = { ...state.calibrationProfiles[toKey] };
    persistCalibrationProfiles();
    updateCalibrationUi();
    return true;
  }

  function resetCurrentCalibration() {
    state.calibration = Geometry.identityCalibration();
    saveCurrentCalibrationProfile();
    updateCalibrationUi();
  }

  function resetAllCalibrations() {
    for (const key of CALIBRATION_PROFILE_KEYS) state.calibrationProfiles[key] = Geometry.identityCalibration();
    state.calibration = { ...state.calibrationProfiles[state.calibrationProfileKey] };
    persistCalibrationProfiles();
    updateCalibrationUi();
  }

  function calibrationDirection(value, negative, positive) {
    const amount = Number(value) || 0;
    if (Math.abs(amount) < 0.0005) return '不偏';
    return `${amount < 0 ? negative : positive} ${(Math.abs(amount) * 100).toFixed(1)}%`;
  }

  function applyCalibrationNudge(deltaX, deltaY) {
    const step = clamp(Number(state.calibrationStep) || 0.25, 0.1, 1) / 100;
    state.calibration = Geometry.normalizeCalibration({
      ...state.calibration,
      offsetX: Number(state.calibration.offsetX || 0) + Number(deltaX || 0) * step,
      offsetY: Number(state.calibration.offsetY || 0) + Number(deltaY || 0) * step
    });
    saveCurrentCalibrationProfile();
    updateCalibrationUi();
    markVisualDemand('calibration-nudge', 450);
    if (state.calibrationTestMode && state.lastCalibrationProbeLocal) {
      clearTimeout(state.calibrationProbeTimer);
      state.calibrationProbeTimer = setTimeout(() => {
        refreshCalibrationProbe().catch(() => {});
      }, 120);
    }
  }

  function calibrationSnapshot() {
    return Geometry.normalizeCalibration(state.calibration);
  }

  function localPointFromEvent(event) {
    const rect = elements.stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function coordinateContextFromGeometry(geometry) {
    if (!geometry) return {};
    return {
      pageScaleFactor: Number(geometry.pageScaleFactor) || 1,
      deviceWidth: Number(geometry.deviceWidth) || state.viewport.width,
      deviceHeight: Number(geometry.deviceHeight) || state.viewport.height,
      contentDipWidth: Number(geometry.contentDipWidth) || Number(geometry.deviceWidth) || state.viewport.width,
      contentDipHeight: Number(geometry.contentDipHeight) ||
        Math.max(1, (Number(geometry.deviceHeight) || state.viewport.height) - (Number(geometry.offsetTop) || 0)),
      imageWidth: Number(geometry.imageWidth) || 0,
      imageHeight: Number(geometry.imageHeight) || 0,
      offsetTop: Number(geometry.offsetTop) || 0,
      cssVisualViewport: geometry.cssVisualViewport ? { ...geometry.cssVisualViewport } : {},
      cssLayoutViewport: geometry.cssLayoutViewport ? { ...geometry.cssLayoutViewport } : {},
      nativeScaleX: Number(geometry.nativeScaleX) || 0,
      nativeScaleY: Number(geometry.nativeScaleY) || 0,
      frameSequence: Number(geometry.sequence) || 0,
      frameEpoch: Number(geometry.epoch) || state.displayedFrameEpoch || 0,
      viewportRevision: Math.max(0, Number(geometry.viewportRevision) || 0),
      metricsViewportRevision: Math.max(0, Number(geometry.metricsViewportRevision) || 0),
      targetId: geometry.targetId || state.lastDisplayedTargetId || state.activeTabId || ''
    };
  }

  function mappedPoint(event, gesture = state.gesture) {
    if (!gesture?.geometry) return { x: 0, y: 0, inside: false };
    const local = localPointFromEvent(event);
    return {
      ...Geometry.mapLocalPoint(local.x, local.y, gesture.geometry, gesture.calibration),
      localX: local.x,
      localY: local.y,
      context: gesture.coordinateContext || coordinateContextFromGeometry(gesture.geometry),
      gestureId: gesture.id || null
    };
  }

  function showTapMarker(localX, localY) {
    elements.tapMarker.style.left = `${localX}px`;
    elements.tapMarker.style.top = `${localY}px`;
    elements.tapMarker.classList.remove('show');
    void elements.tapMarker.offsetWidth;
    elements.tapMarker.classList.add('show');
  }

  function localPointForFrameNormalized(u, v, geometry = state.currentGeometry) {
    const point = Geometry.frameNormalizedToLocal(u, v, geometry);
    return point?.valid ? point : null;
  }

  function showCalibrationOverlayMarker(element, u, v, geometry = state.currentGeometry) {
    const point = localPointForFrameNormalized(u, v, geometry);
    if (!element || !point) return false;
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
    element.hidden = false;
    return true;
  }

  function hideCalibrationOverlayMarkers() {
    if (elements.calibrationTargetMarker) elements.calibrationTargetMarker.hidden = true;
    if (elements.calibrationRemoteMarker) elements.calibrationRemoteMarker.hidden = true;
  }

  function updateCalibrationGuide() {
    const wizard = state.calibrationWizard;
    if (!wizard && !state.calibrationTestMode) {
      elements.calibrationGuide.hidden = true;
      return;
    }
    elements.calibrationGuide.hidden = false;
    if (state.calibrationTestMode && !wizard) {
      elements.calibrationGuideText.textContent = '点击远程网页任意位置：蓝色十字是手指位置，红色十字是 Edge 实际收到的位置。';
      return;
    }
    const marker = wizard?.marker;
    const total = Number(marker?.total || wizard?.total) || (wizard?.mode === 'offset' ? 3 : 5);
    if (!marker || wizard?.busy) {
      const next = Math.min((wizard?.samples?.length || 0) + 1, total);
      elements.calibrationGuideText.textContent = `正在准备第 ${next}/${total} 个校准点，请稍候…`;
      return;
    }
    const label = wizard.mode === 'offset' ? '快速偏移校准' : '实验边缘校准';
    elements.calibrationGuideText.textContent = `${label}：请准确点击编号 ${marker.index + 1} 的红色十字中心（${marker.index + 1}/${total}）`;
  }

  function calibrationTargets(mode = 'offset') {
    return mode === 'precision'
      ? [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84], [0.5, 0.5]]
      : [[0.5, 0.28], [0.28, 0.68], [0.72, 0.68]];
  }

  async function prepareCalibrationMarker(index) {
    const wizard = state.calibrationWizard;
    if (!wizard) return;
    wizard.busy = true;
    wizard.marker = null;
    if (elements.calibrationTargetMarker) elements.calibrationTargetMarker.hidden = true;
    updateCalibrationGuide();

    const geometry = wizard.markerGeometry;
    if (!geometry) throw new Error('校准开始时没有锁定画面几何，请等待画面稳定后重试。');
    if (geometry.targetId && state.activeTabId && geometry.targetId !== state.activeTabId) {
      throw new Error('校准画面已切换到另一个标签页，请重新开始。');
    }
    const points = calibrationTargets(wizard.mode);
    const safeIndex = clamp(Number(index) || 0, 0, points.length - 1);
    const [u, v] = points[safeIndex];
    const marker = {
      index: safeIndex,
      total: points.length,
      u,
      v,
      mode: wizard.mode,
      localOnly: true,
      targetId: wizard.targetId || geometry.targetId || state.activeTabId || '',
      viewportRevision: Math.max(0, Number(geometry.viewportRevision) || 0),
      frameEpoch: Math.max(0, Number(geometry.epoch) || Number(wizard.frameEpoch) || 0),
      frameSequence: Math.max(0, Number(geometry.sequence) || 0)
    };
    if (!showCalibrationOverlayMarker(elements.calibrationTargetMarker, u, v, geometry)) {
      throw new Error('无法把校准点绘制到手机画面，请先恢复画面后重试。');
    }
    wizard.marker = marker;
    wizard.total = points.length;
    wizard.busy = false;
    updateCalibrationGuide();
  }

  async function removeRemoteCalibrationVisual(type = 'calibrationMarker') {
    // v6.7 calibration lives entirely in the controller page. It never injects
    // DOM nodes or evaluates calibration scripts in ChatGPT, Claude, or any
    // other target page.
    if (type === 'calibrationProbe') {
      if (elements.calibrationRemoteMarker) elements.calibrationRemoteMarker.hidden = true;
    } else if (elements.calibrationTargetMarker) {
      elements.calibrationTargetMarker.hidden = true;
    }
  }

  async function cancelAutoCalibration(options = {}) {
    const { silent = false } = options;
    const wizard = state.calibrationWizard;
    state.calibrationWizard = null;
    if (wizard?.timeoutTimer) clearTimeout(wizard.timeoutTimer);
    // v6.7 起校准标记只存在于本页（无远端 DOM），取消时必须无条件隐藏；
    // 旧的 removeRemote 开关会让断线/切标签路径把红色目标十字永久留在
    // 画面上，重连后用户点它就变成一次真实点击。
    await removeRemoteCalibrationVisual('calibrationMarker');
    updateCalibrationGuide();
    if (!silent) showToast('已取消自动校准', 'warn', 1800);
  }

  async function stopCalibrationTest(options = {}) {
    const { silent = false, removeRemote = true } = options;
    state.calibrationTestMode = false;
    state.calibrationTestRequest += 1;
    clearTimeout(state.calibrationProbeTimer);
    state.calibrationProbeTimer = null;
    state.lastCalibrationProbeLocal = null;
    elements.calibrationLocalMarker.hidden = true;
    if (elements.calibrationRemoteMarker) elements.calibrationRemoteMarker.hidden = true;
    if (removeRemote) await removeRemoteCalibrationVisual('calibrationProbe');
    updateCalibrationGuide();
    updateCalibrationUi();
    if (!silent) showToast('已退出点击测试模式', 'info', 1700);
  }

  async function finishAutoCalibration() {
    const wizard = state.calibrationWizard;
    if (!wizard) return;
    let result;
    try {
      result = wizard.mode === 'offset'
        ? Geometry.fitOffsetCalibration(wizard.samples, wizard.baseCalibration)
        : Geometry.fitCalibration(wizard.samples);
      state.calibration = result.calibration;
      saveCurrentCalibrationProfile();
      updateCalibrationUi();
    } catch (error) {
      await cancelAutoCalibration({ silent: true });
      showToast(`自动校准失败：${error.message}`, 'error', 5000);
      return;
    }
    await cancelAutoCalibration({ silent: true });
    const detail = `左右 ${(result.calibration.offsetX * 100).toFixed(2)}%，上下 ${(result.calibration.offsetY * 100).toFixed(2)}%`;
    if (wizard.mode === 'offset') {
      const warning = result.rms > 0.018 ? '，三个点差异较大；建议直接用方向键微调' : '';
      showToast(`三点快速校准完成：${detail}${warning}`, result.rms > 0.018 ? 'warn' : 'ok', 5200);
      return;
    }
    const ignored = Number.isInteger(result.outlierIndex) ? `，已忽略第 ${result.outlierIndex + 1} 个明显误触` : '';
    const edgeDetail = `；左右边缘范围 ${(result.calibration.scaleX * 100).toFixed(2)}%，上下边缘范围 ${(result.calibration.scaleY * 100).toFixed(2)}%${ignored}`;
    showToast(`五点边缘校准完成：${detail}${edgeDetail}`, result.rms > 0.025 ? 'warn' : 'ok', 6500);
  }

  async function recordCalibrationTap(event) {
    const wizard = state.calibrationWizard;
    if (!wizard) return;
    event.preventDefault();
    if (wizard.busy || !wizard.marker) {
      showToast('校准标记仍在刷新，请看到红色十字后再点。', 'warn', 1800);
      return;
    }
    const calibrationGeometry = wizard.markerGeometry;
    if (!calibrationGeometry) {
      showToast('当前校准点缺少画面几何信息，请重试。', 'error', 2600);
      return;
    }
    const local = localPointFromEvent(event);
    const mapped = Geometry.mapLocalPoint(local.x, local.y, calibrationGeometry, Geometry.identityCalibration());
    if (!mapped.inside) {
      showToast('请点在远程网页画面里的红色十字上。', 'warn', 2200);
      return;
    }
    showTapMarker(local.x, local.y);
    const targetInFrame = wizard.marker.localOnly
      ? { valid: true, u: Number(wizard.marker.u), v: Number(wizard.marker.v) }
      : Geometry.cssPointToFrameNormalized(
        Number(wizard.marker.cssX),
        Number(wizard.marker.cssY),
        calibrationGeometry
      );
    wizard.samples.push({
      rawU: mapped.rawU,
      rawV: mapped.rawV,
      targetU: targetInFrame.valid ? targetInFrame.u : Number(wizard.marker.u),
      targetV: targetInFrame.valid ? targetInFrame.v : Number(wizard.marker.v)
    });
    if (elements.calibrationTargetMarker) elements.calibrationTargetMarker.hidden = true;
    const nextIndex = wizard.samples.length;
    if (nextIndex >= wizard.marker.total) {
      await finishAutoCalibration();
      return;
    }
    try {
      await prepareCalibrationMarker(nextIndex);
    } catch (error) {
      await cancelAutoCalibration({ silent: true });
      showToast(`自动校准中断：${error.message}`, 'error', 5000);
    }
  }

  async function startAutoCalibration(mode = 'offset') {
    const normalizedMode = mode === 'precision' ? 'precision' : 'offset';
    if (state.resizeSettling || state.viewportSyncPending) {
      showToast('画面尺寸仍在同步，请看到新画面后再开始校准。', 'warn', 2800);
      return;
    }
    if (state.role !== 'controller') {
      showToast('请先接管控制权。', 'warn', 2600);
      return;
    }
    if (state.calibrationWizard) return;
    if (state.calibrationTestMode) await stopCalibrationTest({ silent: true });
    ensureCalibrationProfileCurrent('auto-calibration', { silent: true });
    if (!state.currentFrame || !state.currentGeometry) {
      await recoverFrame(false);
      if (!(await waitForRenderedFrame())) {
        showToast('当前没有画面，无法开始自动校准。', 'error', 3500);
        return;
      }
    }
    closeAllOverlays();
    closeFullscreenDock(true);
    cancelActiveGesture();
    const wizard = {
      mode: normalizedMode,
      baseCalibration: calibrationSnapshot(),
      samples: [],
      marker: null,
      markerGeometry: {
        ...state.currentGeometry,
        cssVisualViewport: { ...(state.currentGeometry.cssVisualViewport || {}) },
        cssLayoutViewport: { ...(state.currentGeometry.cssLayoutViewport || {}) }
      },
      total: normalizedMode === 'offset' ? 3 : 5,
      viewportRevision: Math.max(0, Number(state.currentGeometry.viewportRevision) || 0),
      frameEpoch: Math.max(0, Number(state.currentGeometry.epoch) || state.displayedFrameEpoch || 0),
      targetId: state.activeTabId,
      busy: true,
      timeoutTimer: null
    };
    state.calibrationWizard = wizard;
    wizard.timeoutTimer = setTimeout(() => {
      if (state.calibrationWizard === wizard) {
        cancelAutoCalibration({ silent: true }).then(() => showToast('自动校准已超时，请重新开始。', 'warn', 3500));
      }
    }, 180000);
    updateCalibrationGuide();
    try {
      await prepareCalibrationMarker(0);
    } catch (error) {
      await cancelAutoCalibration({ silent: true });
      showToast(`无法开始自动校准：${error.message}`, 'error', 5000);
    }
  }

  async function startCalibrationTest() {
    if (state.role !== 'controller') {
      showToast('请先接管控制权。', 'warn', 2400);
      return;
    }
    if (!state.currentGeometry || !state.currentFrame) {
      await recoverFrame(false);
      if (!(await waitForRenderedFrame())) {
        showToast('当前没有画面，无法开始点击测试。', 'error', 3200);
        return;
      }
    }
    if (state.calibrationWizard) await cancelAutoCalibration({ silent: true });
    ensureCalibrationProfileCurrent('calibration-test', { silent: true });
    closeAllOverlays();
    closeFullscreenDock(true);
    cancelActiveGesture();
    state.calibrationTestMode = true;
    state.lastCalibrationProbeLocal = null;
    elements.calibrationLocalMarker.hidden = true;
    if (elements.calibrationRemoteMarker) elements.calibrationRemoteMarker.hidden = true;
    updateCalibrationGuide();
    updateCalibrationUi();
    showToast('测试模式：点网页任意位置，蓝色是手指，红色是 Edge 命中点。', 'info', 3600);
  }

  async function sendCalibrationProbeAtLocal(local, options = {}) {
    if (!state.calibrationTestMode || !state.currentGeometry) return;
    const geometry = {
      ...state.currentGeometry,
      cssVisualViewport: { ...(state.currentGeometry.cssVisualViewport || {}) },
      cssLayoutViewport: { ...(state.currentGeometry.cssLayoutViewport || {}) }
    };
    const point = Geometry.mapLocalPoint(local.x, local.y, geometry, calibrationSnapshot());
    if (!point.inside) {
      if (!options.silent) showToast('请点在实际网页画面内。', 'warn', 1800);
      return;
    }
    state.lastCalibrationProbeLocal = { x: local.x, y: local.y };
    elements.calibrationLocalMarker.style.left = `${local.x}px`;
    elements.calibrationLocalMarker.style.top = `${local.y}px`;
    elements.calibrationLocalMarker.hidden = false;
    state.calibrationTestRequest += 1;
    showCalibrationOverlayMarker(elements.calibrationRemoteMarker, point.u, point.v, geometry);
    if (!options.silent) {
      showToast('蓝色十字是手指；红色十字是当前校准后会发送给 Edge 的位置。正在查询该点下的真实元素…', 'info', 3200);
      // 远端探针：本地十字只能证明"手机侧算的位置"，证明不了服务端换算后
      // 点在哪个元素上。探针一次性只读地回报目标元素链与视口状态。
      try {
        const report = await request('tapProbe', {
          x: point.x,
          y: point.y,
          u: point.u,
          v: point.v,
          context: coordinateContextFromGeometry(geometry)
        }, 9000);
        renderTapProbeReport(report);
      } catch (error) {
        showToast(`远端元素探针失败：${error.message}`, 'warn', 3200);
      }
    }
  }

  function renderTapProbeReport(report) {
    const probe = report?.probe;
    if (!probe) return;
    const target = probe.chain?.[0];
    const outsideX = report.point.x >= (Number(probe.innerWidth) || Infinity) || report.point.x < 0;
    const outsideY = report.point.y >= (Number(probe.innerHeight) || Infinity) || report.point.y < 0;
    const summary = target
      ? `目标: ${target.tag}${target.id ? `#${target.id}` : ''}${target.aria ? `〔${target.aria}〕` : ''}` +
        `${target.disabled ? ' [已禁用]' : ''}${target.pointerEvents === 'none' ? ' [pointer-events:none]' : ''} · ` +
        `矩形 ${target.rect.width}×${target.rect.height}@(${target.rect.left},${target.rect.top})`
      : (outsideX || outsideY
        ? `目标: 点(${report.point.x},${report.point.y}) 落在页面视口(${probe.innerWidth}×${probe.innerHeight})之外——服务端换算基准偏大`
        : '目标: 该点下没有元素');
    const env = `点(${report.point.x},${report.point.y}) · 页面焦点:${probe.hasFocus ? '有' : '无'} · ` +
      `视口 ${probe.innerWidth}×${probe.innerHeight} vv缩放:${probe.visualViewport?.scale ?? '?'} · 触点:${probe.maxTouchPoints}`;
    if (elements.calibrationGuideText) elements.calibrationGuideText.textContent = `${summary} · ${env}`;
    // 完整元素链输出到控制台，便于截图/复制给其他协作者分析。
    console.log('[tapProbe]', JSON.stringify(report, null, 2));
    showToast(summary, target && !target.disabled && target.pointerEvents !== 'none' ? 'ok' : 'warn', 6000);
  }

  async function refreshCalibrationProbe() {
    const local = state.lastCalibrationProbeLocal;
    if (!state.calibrationTestMode || !local) return;
    try {
      await sendCalibrationProbeAtLocal(local, { silent: true });
    } catch (error) {
      showToast(`测试刷新失败：${error.message}`, 'warn', 2600);
    }
  }

  async function recordCalibrationProbe(event) {
    if (!state.calibrationTestMode) return;
    event.preventDefault();
    const local = localPointFromEvent(event);
    try {
      await sendCalibrationProbeAtLocal(local);
    } catch (error) {
      showToast(`测试失败：${error.message}`, 'error', 3500);
    }
  }

  function sendTouch(eventType, point) {
    if (state.role !== 'controller' || !point) return;
    const gesture = state.gesture;
    if (gesture) gesture.eventSequence = (gesture.eventSequence || 0) + 1;
    send({
      type: 'touch',
      event: eventType,
      x: point.x,
      y: point.y,
      u: point.u,
      v: point.v,
      inputMode: effectiveInputMode(),
      context: point.context || gesture?.coordinateContext || coordinateContextFromGeometry(gesture?.geometry || state.currentGeometry),
      gestureId: point.gestureId || gesture?.id || null,
      eventSequence: gesture?.eventSequence || 0
    });
  }

  function sendTap(point) {
    if (state.role !== 'controller' || !point?.inside) return;
    send({
      type: 'tap',
      x: point.x,
      y: point.y,
      u: point.u,
      v: point.v,
      inputMode: effectiveInputMode(),
      context: point.context || coordinateContextFromGeometry(state.currentGeometry)
    });
  }

  function flushPendingMove() {
    state.moveAnimationFrame = 0;
    if (!state.pendingMove || !state.gesture || state.gesture.mode !== 'direct') return;
    const point = state.pendingMove;
    state.pendingMove = null;
    sendTouch('move', point);
  }

  function flushPendingWheel() {
    state.wheelAnimationFrame = 0;
    const wheel = state.pendingWheel;
    state.pendingWheel = null;
    if (!wheel || state.role !== 'controller') return;
    const deltaX = clamp(wheel.deltaX, -900, 900);
    const deltaY = clamp(wheel.deltaY, -900, 900);
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;
    send({
      type: 'wheel',
      x: wheel.x,
      y: wheel.y,
      u: wheel.u,
      v: wheel.v,
      deltaX,
      deltaY,
      deltaU: wheel.deltaU,
      deltaV: wheel.deltaV,
      clearSelection: Boolean(wheel.clearSelection),
      context: wheel.context || coordinateContextFromGeometry(state.currentGeometry)
    });
    markVisualDemand('smart-scroll', 420);
  }

  function queueSmartScroll(point, previousPoint, clearSelection = false) {
    if (!point || !previousPoint) return;
    const gain = 1.08;
    const deltaX = (previousPoint.x - point.x) * gain;
    const deltaY = (previousPoint.y - point.y) * gain;
    const deltaU = (previousPoint.u - point.u) * gain;
    const deltaV = (previousPoint.v - point.v) * gain;
    if (!state.pendingWheel) {
      state.pendingWheel = {
        x: point.x, y: point.y, u: point.u, v: point.v,
        deltaX, deltaY, deltaU, deltaV,
        clearSelection: Boolean(clearSelection),
        context: point.context || coordinateContextFromGeometry(state.currentGeometry)
      };
    } else {
      state.pendingWheel.x = point.x;
      state.pendingWheel.y = point.y;
      state.pendingWheel.u = point.u;
      state.pendingWheel.v = point.v;
      state.pendingWheel.deltaX += deltaX;
      state.pendingWheel.deltaY += deltaY;
      state.pendingWheel.deltaU += deltaU;
      state.pendingWheel.deltaV += deltaV;
      state.pendingWheel.clearSelection = state.pendingWheel.clearSelection || Boolean(clearSelection);
      state.pendingWheel.context = point.context || state.pendingWheel.context;
    }
    if (!state.wheelAnimationFrame) state.wheelAnimationFrame = requestAnimationFrame(flushPendingWheel);
  }

  function smartMoveThreshold() {
    return clamp(Math.min(innerWidth, innerHeight) * 0.018, 8, 14);
  }

  function startGesture(event) {
    if (document.querySelector('.overlay:not([hidden])')) {
      event.preventDefault();
      return;
    }
    const geometryRevision = Math.max(0, Number(state.currentGeometry?.viewportRevision) || 0);
    if (state.resizeSettling || state.viewportSyncPending ||
        (state.requestedViewportRevision > 0 && geometryRevision > 0 && geometryRevision < state.requestedViewportRevision)) {
      event.preventDefault();
      showToast('画面尺寸正在同步，请看到新画面后再触摸。', 'warn', 1700);
      return;
    }
    if (state.expectedFrameEpoch > state.displayedFrameEpoch) {
      event.preventDefault();
      showToast('正在同步新页面画面，请稍后再触摸。', 'warn', 1500);
      return;
    }
    if (event.target.closest('button, input, textarea, select')) return;
    if (state.calibrationWizard) {
      recordCalibrationTap(event).catch((error) => showToast(error.message, 'error', 3500));
      return;
    }
    if (state.calibrationTestMode) {
      recordCalibrationProbe(event).catch((error) => showToast(error.message, 'error', 3500));
      return;
    }
    if (state.role !== 'controller') {
      if (state.role === 'viewer') showToast('当前为只读模式，点左上角“只读”即可接管。', 'warn', 2600);
      return;
    }
    if (!state.currentGeometry || !state.currentFrame) {
      recoverFrame(false);
      return;
    }
    if (state.gesture || !event.isPrimary) return;

    const gesture = {
      id: `gesture-${Date.now().toString(36)}-${(++state.gestureCounter).toString(36)}`,
      eventSequence: 0,
      pointerId: event.pointerId,
      geometry: {
        ...state.currentGeometry,
        cssVisualViewport: { ...(state.currentGeometry.cssVisualViewport || {}) },
        cssLayoutViewport: { ...(state.currentGeometry.cssLayoutViewport || {}) }
      },
      calibration: calibrationSnapshot(),
      startedAt: performance.now(),
      mode: effectiveGestureMode(),
      phase: effectiveGestureMode() === 'direct' ? 'direct' : 'pending',
      startPoint: null,
      lastPoint: null,
      lastScrollPoint: null,
      coordinateContext: null
    };
    gesture.coordinateContext = coordinateContextFromGeometry(gesture.geometry);
    state.gesture = gesture;
    const point = mappedPoint(event, gesture);
    if (!point.inside) {
      state.gesture = null;
      return;
    }
    event.preventDefault();
    try { elements.stage.setPointerCapture(event.pointerId); } catch {}
    gesture.startPoint = point;
    gesture.lastPoint = point;

    // 智能模式在判断出“轻点”或“滚动”之前，不向 Edge 发送按下事件。
    // 这样滑动不会先被网页解释成长按或文字选择。
    if (gesture.mode === 'direct') {
      showTapMarker(point.localX, point.localY);
      sendTouch('start', point);
    }
  }

  function moveGesture(event) {
    const gesture = state.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    const latestEvent = coalesced.length ? coalesced[coalesced.length - 1] : event;
    const point = mappedPoint(latestEvent, gesture);
    gesture.lastPoint = point;

    if (gesture.mode === 'direct') {
      state.pendingMove = point;
      if (!state.moveAnimationFrame) state.moveAnimationFrame = requestAnimationFrame(flushPendingMove);
      return;
    }

    const localDx = point.localX - gesture.startPoint.localX;
    const localDy = point.localY - gesture.startPoint.localY;
    const distance = Math.hypot(localDx, localDy);
    const threshold = smartMoveThreshold();
    if (gesture.phase === 'pending' && distance >= threshold) {
      gesture.phase = 'scroll';
      gesture.lastScrollPoint = gesture.startPoint;
      gesture.clearSelectionPending = effectiveGestureMode() === 'smart' && !state.manualCompatibility?.active;
    }
    if (gesture.phase === 'scroll') {
      queueSmartScroll(point, gesture.lastScrollPoint || gesture.startPoint, gesture.clearSelectionPending);
      gesture.clearSelectionPending = false;
      gesture.lastScrollPoint = point;
    }
  }

  function finishGesture(event, kind = 'end') {
    const gesture = state.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    if (state.moveAnimationFrame) {
      cancelAnimationFrame(state.moveAnimationFrame);
      state.moveAnimationFrame = 0;
    }
    const pendingDirectMove = gesture.mode === 'direct' ? state.pendingMove : null;
    state.pendingMove = null;
    if (pendingDirectMove) sendTouch('move', pendingDirectMove);
    const point = mappedPoint(event, gesture);
    gesture.lastPoint = point;

    if (gesture.mode === 'smart' && gesture.phase === 'pending') {
      const finishDistance = Math.hypot(
        point.localX - gesture.startPoint.localX,
        point.localY - gesture.startPoint.localY
      );
      if (finishDistance >= smartMoveThreshold()) {
        gesture.phase = 'scroll';
        gesture.lastScrollPoint = gesture.startPoint;
        gesture.clearSelectionPending = effectiveGestureMode() === 'smart' && !state.manualCompatibility?.active;
      }
    }

    if (gesture.mode === 'direct') {
      sendTouch(kind, point);
      markVisualDemand(`touch-${kind}`, 650);
      // 位移很小的直接触摸就是一次"点击"：可能点了远程输入框内部、别的
      // 输入框或按钮，远程光标不再停在同步基准末尾——宣告基准失效。
      if (kind === 'end' && gesture.startPoint) {
        const tapDistance = Math.hypot(
          point.localX - gesture.startPoint.localX,
          point.localY - gesture.startPoint.localY
        );
        if (tapDistance < smartMoveThreshold()) {
          invalidateLiveSyncBase('点击了网页画面，远程光标位置已变化：实时同步已暂停，点"取回网页文本"重新对齐。');
        }
      }
    } else if (gesture.phase === 'scroll') {
      queueSmartScroll(point, gesture.lastScrollPoint || gesture.startPoint, gesture.clearSelectionPending);
      gesture.clearSelectionPending = false;
      flushPendingWheel();
      markVisualDemand('smart-scroll-end', 650);
    } else if (kind === 'end' && point.inside) {
      showTapMarker(point.localX, point.localY);
      sendTap(point);
      markVisualDemand('smart-tap', 500);
      invalidateLiveSyncBase('点击了网页画面，远程光标位置已变化：实时同步已暂停，点"取回网页文本"重新对齐。');
    }

    state.gesture = null;
    try { elements.stage.releasePointerCapture(event.pointerId); } catch {}
    if (state.deferredViewport) {
      state.deferredViewport = false;
      scheduleViewport(false);
    }
  }

  function cancelActiveGesture() {
    const gesture = state.gesture;
    if (!gesture) return;
    if (gesture.mode === 'direct') sendTouch('cancel', gesture.lastPoint || { x: 0, y: 0 });
    state.gesture = null;
    state.pendingMove = null;
    state.pendingWheel = null;
    if (state.moveAnimationFrame) cancelAnimationFrame(state.moveAnimationFrame);
    if (state.wheelAnimationFrame) cancelAnimationFrame(state.wheelAnimationFrame);
    state.moveAnimationFrame = 0;
    state.wheelAnimationFrame = 0;
    // 手势期间被推迟的视口同步不能只依赖 finishGesture 来补发；手势被取消
    // （切后台、导航切换等）时同样要补发，否则 Edge 视口会一直不匹配。
    if (state.deferredViewport) {
      state.deferredViewport = false;
      if (!state.resizeSettling) scheduleViewport(false);
    }
  }

  function navigateAddress(value) {
    if (state.role !== 'controller') return;
    invalidateLiveSyncBase('已跳转网址，实时同步已暂停：点"取回网页文本"重新对齐。');
    request('navigate', { url: value }).catch((error) => showToast(error.message, 'error', 3500));
    elements.addressInput.blur();
    markVisualDemand('navigate', 1200);
  }

  function renderNavigationHistory(history = state.pageState.history) {
    if (!elements.navigationHistoryList || !elements.historySection) return;
    const entries = Array.isArray(history?.entries) ? history.entries : [];
    elements.navigationHistoryList.replaceChildren();
    elements.historySection.hidden = entries.length === 0;
    if (!entries.length) return;
    const currentIndex = Number(history.currentIndex);
    for (const entry of [...entries].reverse()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `history-entry${entry.current ? ' current' : ''}`;
      button.disabled = state.role !== 'controller' || Boolean(entry.current);
      const relation = entry.current
        ? '当前页面'
        : Number(entry.index) < currentIndex
          ? `后退 ${currentIndex - Number(entry.index)} 步`
          : `前进 ${Number(entry.index) - currentIndex} 步`;
      const title = document.createElement('strong');
      title.textContent = entry.title || entry.url || '(无标题)';
      const meta = document.createElement('small');
      meta.textContent = `${relation} · ${entry.url || ''}`;
      button.append(title, meta);
      button.addEventListener('click', async () => {
        try {
          await request('navigateHistoryEntry', { entryId: entry.id }, 20000);
          setOverlay('tabsOverlay', false);
          markVisualDemand('history-entry', 800);
        } catch (error) {
          showToast(error.message, 'error', 3500);
        }
      });
      elements.navigationHistoryList.append(button);
    }
  }

  function setTabsSheetMode(mode = 'tabs') {
    const next = mode === 'history' ? 'history' : 'tabs';
    state.tabsSheetMode = next;
    const historyMode = next === 'history';
    elements.tabsModeButton?.classList.toggle('active', !historyMode);
    elements.tabsModeButton?.setAttribute('aria-selected', String(!historyMode));
    elements.browserHistoryModeButton?.classList.toggle('active', historyMode);
    elements.browserHistoryModeButton?.setAttribute('aria-selected', String(historyMode));
    if (elements.tabsModePane) elements.tabsModePane.hidden = historyMode;
    if (elements.browserHistoryPane) elements.browserHistoryPane.hidden = !historyMode;
    if (historyMode && !state.browserHistory.loading &&
        (!state.browserHistory.items.length || Date.now() - state.browserHistory.lastLoadedAt > 5000)) {
      loadBrowserHistory({ reset: true }).catch((error) => showToast(error.message, 'error', 4200));
    }
  }

  function historyDayKey(milliseconds) {
    const date = new Date(Number(milliseconds) || 0);
    if (!Number.isFinite(date.getTime())) return '未知日期';
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((startToday - startDate) / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days > 1 && days < 7) return `${days} 天前 · ${date.toLocaleDateString('zh-CN', { weekday: 'long' })}`;
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  }

  function historyTimeLabel(milliseconds) {
    const date = new Date(Number(milliseconds) || 0);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function renderBrowserHistory() {
    const view = state.browserHistory;
    if (!elements.browserHistoryList) return;
    elements.browserHistoryList.replaceChildren();
    if (view.loading && !view.items.length) {
      const loading = document.createElement('div');
      loading.className = 'browser-history-empty';
      loading.textContent = '正在读取 Edge 浏览历史…';
      elements.browserHistoryList.append(loading);
    } else if (!view.items.length) {
      const empty = document.createElement('div');
      empty.className = 'browser-history-empty';
      empty.textContent = view.query ? '没有找到匹配的历史记录。' : '当前 Edge 配置中没有可显示的浏览历史。';
      elements.browserHistoryList.append(empty);
    } else {
      let lastGroup = '';
      for (const item of view.items) {
        const group = historyDayKey(item.visitTimeMs);
        if (group !== lastGroup) {
          const heading = document.createElement('div');
          heading.className = 'browser-history-group-title';
          heading.textContent = group;
          elements.browserHistoryList.append(heading);
          lastGroup = group;
        }
        const row = document.createElement('div');
        row.className = 'browser-history-row';

        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'browser-history-open';
        open.disabled = state.role !== 'controller';
        // 默认在新标签页打开：原地导航会覆盖当前页面（例如把正在使用的
        // ChatGPT 对话页换掉），代价太高；想替换当前页的用右侧小按钮。
        open.title = '在新的 Edge 标签页打开（保留当前页面）';
        const title = document.createElement('strong');
        title.textContent = item.title || item.url || '(无标题)';
        const url = document.createElement('small');
        url.textContent = item.url || '';
        open.append(title, url);
        open.addEventListener('click', async () => {
          try {
            await request('newTab', { url: item.url }, 20000);
            setOverlay('tabsOverlay', false);
            markVisualDemand('global-history-new-tab', 850);
          } catch (error) {
            showToast(error.message, 'error', 3500);
          }
        });

        const time = document.createElement('span');
        time.className = 'browser-history-time';
        time.textContent = historyTimeLabel(item.visitTimeMs);

        const hereTab = document.createElement('button');
        hereTab.type = 'button';
        hereTab.className = 'browser-history-newtab';
        hereTab.textContent = '此页';
        hereTab.title = '在当前 Edge 标签页打开（替换当前页面）';
        hereTab.disabled = state.role !== 'controller';
        hereTab.addEventListener('click', async () => {
          try {
            await request('navigate', { url: item.url }, 20000);
            setOverlay('tabsOverlay', false);
            markVisualDemand('global-history-current-tab', 1000);
          } catch (error) {
            showToast(error.message, 'error', 3500);
          }
        });
        row.append(open, time, hereTab);
        elements.browserHistoryList.append(row);
      }
    }

    const updated = view.databaseUpdatedAt
      ? ` · 数据库更新于 ${new Date(view.databaseUpdatedAt).toLocaleString('zh-CN')}`
      : '';
    const profile = view.profileDirectory ? `配置：${view.profileDirectory}` : '当前 Edge 配置';
    elements.browserHistoryStatus.textContent = view.loading
      ? `正在读取… ${profile}`
      : `${profile} · 已载入 ${view.items.length} 条${view.query ? ` · 搜索“${view.query}”` : ''}${updated}`;
    elements.browserHistoryMoreButton.hidden = !view.hasMore;
    elements.browserHistoryMoreButton.disabled = view.loading;
    elements.browserHistoryMoreButton.textContent = view.loading ? '正在加载…' : '加载更早记录';
  }

  async function loadBrowserHistory({ reset = true } = {}) {
    if (state.browserHistory.loading && !reset) return;
    const view = state.browserHistory;
    const serial = ++view.requestSerial;
    const queryText = String(elements.browserHistorySearchInput?.value ?? view.query ?? '').trim();
    if (reset) {
      view.query = queryText;
      view.offset = 0;
      view.items = [];
      view.hasMore = false;
    }
    view.loading = true;
    renderBrowserHistory();
    try {
      const result = await request('browserHistory', {
        query: view.query,
        offset: reset ? 0 : view.offset,
        limit: 80
      }, 30000);
      if (serial !== view.requestSerial) return;
      const incoming = Array.isArray(result.items) ? result.items : [];
      const existing = reset ? [] : view.items;
      const seen = new Set(existing.map((item) => `${item.visitId || ''}:${item.visitTimeMs || ''}:${item.url || ''}`));
      const merged = [...existing];
      for (const item of incoming) {
        const key = `${item.visitId || ''}:${item.visitTimeMs || ''}:${item.url || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
      view.items = merged;
      view.offset = Number(result.nextOffset) || (reset ? incoming.length : view.offset + incoming.length);
      view.hasMore = Boolean(result.hasMore);
      view.profileDirectory = String(result.profileDirectory || '');
      view.databaseUpdatedAt = Number(result.databaseUpdatedAt) || 0;
      view.source = String(result.source || '');
      view.lastLoadedAt = Date.now();
    } finally {
      if (serial === view.requestSerial) {
        view.loading = false;
        renderBrowserHistory();
      }
    }
  }

  function scheduleBrowserHistorySearch() {
    clearTimeout(state.browserHistory.debounceTimer);
    state.browserHistory.debounceTimer = setTimeout(() => {
      loadBrowserHistory({ reset: true }).catch((error) => {
        state.browserHistory.loading = false;
        renderBrowserHistory();
        showToast(`读取浏览历史失败：${error.message}`, 'error', 4500);
      });
    }, 280);
  }

  function renderTabs(tabs, activeId) {
    elements.tabCount.textContent = String(tabs.length || '▣');
    renderNavigationHistory(state.pageState.history);
    elements.tabsList.replaceChildren();
    if (!tabs.length) {
      const empty = document.createElement('p');
      empty.textContent = '没有找到可控制的网页标签页。';
      elements.tabsList.append(empty);
      return;
    }
    for (const tab of tabs) {
      const card = document.createElement('div');
      card.className = 'tab-card';
      const select = document.createElement('button');
      select.type = 'button';
      select.className = `tab-select${tab.id === activeId ? ' active' : ''}`;
      select.disabled = !tab.controllable || state.role !== 'controller';
      const title = document.createElement('strong');
      title.textContent = tab.title || '(无标题)';
      const url = document.createElement('small');
      url.textContent = tab.url || '';
      select.append(title, url);
      select.addEventListener('click', async () => {
        try {
          // 切换目标标签是同步发生的，而新目标的 pageState 要稍后才到——先
          // 同步作废基准，防止这期间一次防抖差量落进新标签页的输入框。
          invalidateLiveSyncBase('已切换标签页，实时同步已暂停：点"取回网页文本"重新对齐。');
          await request('selectTarget', { targetId: tab.id }, 20000);
          setOverlay('tabsOverlay', false);
          markVisualDemand('switch-tab', 500);
        } catch (error) {
          showToast(error.message, 'error', 3500);
        }
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'tab-close';
      close.textContent = '×';
      close.title = '关闭标签页';
      close.disabled = state.role !== 'controller';
      close.addEventListener('click', async () => {
        try {
          // 关闭标签会自动切到另一个标签：同步作废基准，避免差量落进它。
          invalidateLiveSyncBase('已关闭标签页，实时同步已暂停：点"取回网页文本"重新对齐。');
          await request('closeTab', { targetId: tab.id }, 20000);
          await request('tabs');
        } catch (error) {
          showToast(error.message, 'error', 3500);
        }
      });
      card.append(select, close);
      elements.tabsList.append(card);
    }
  }

  function clearUploadCloseTimer() {
    clearTimeout(state.uploadCloseTimer);
    state.uploadCloseTimer = null;
  }

  function closeUploadOverlaySoon(chooserId, delay = 700) {
    clearUploadCloseTimer();
    state.uploadCloseTimer = setTimeout(() => {
      state.uploadCloseTimer = null;
      // 旧事务的延迟关闭不能把刚打开的新上传面板关掉。
      if (state.pendingChooser && chooserId && state.pendingChooser.id !== chooserId) return;
      setOverlay('uploadOverlay', false);
    }, delay);
  }

  async function dismissUploadOverlay({ notifyServer = true, silent = false } = {}) {
    if (state.uploadDismissPromise) return state.uploadDismissPromise;
    if (state.uploading) {
      state.uploadAbort = true;
      if (!silent) showToast('正在停止文件操作…', 'warn', 1800);
      return false;
    }
    clearUploadCloseTimer();
    cancelActiveGesture();
    const chooserId = state.pendingChooser?.id || null;
    setOverlay('uploadOverlay', false);
    state.pendingChooser = null;
    resetComputerBrowser();
    if (!notifyServer || !chooserId || !wsIsOpen()) return true;
    state.uploadDismissPromise = request('cancelUpload', { chooserId }, 12000)
      .catch((error) => {
        if (!silent) showToast(`取消网页文件选择失败：${error.message}`, 'warn', 3200);
      })
      .finally(() => { state.uploadDismissPromise = null; });
    await state.uploadDismissPromise;
    return true;
  }

  function resetComputerBrowser() {
    state.computerBrowser = {
      roots: [],
      currentPath: '',
      parentPath: null,
      entries: [],
      selected: new Map(),
      loading: false,
      truncated: false,
      sort: state.computerBrowser?.sort || storedComputerSort
    };
    elements.computerFileList.replaceChildren();
    elements.computerPath.textContent = '正在读取电脑文件位置…';
    elements.computerParentButton.disabled = true;
    elements.computerSelectFolderButton.hidden = true;
    elements.computerSelection.textContent = '尚未选择电脑文件。';
  }

  function uploadChooserDescription() {
    if (!state.pendingChooser) return '先在远程网页中点击“选择文件”或“上传”。';
    if (state.pendingChooser.directory) return '网页正在等待一个文件夹。可在手机上浏览 Windows 文件夹并选择当前文件夹。';
    const count = state.pendingChooser.multiple ? '多个文件' : '一个文件';
    const accept = state.pendingChooser.accept ? `；网页建议类型：${state.pendingChooser.accept}` : '';
    return `网页正在等待${count}${accept}。电脑文件会直接交给 Edge，不经过手机传输。`;
  }

  function updateUploadSourceUi() {
    const computer = state.uploadSource === 'computer';
    elements.computerSourceButton.classList.toggle('active', computer);
    elements.phoneSourceButton.classList.toggle('active', !computer);
    elements.computerSourceButton.setAttribute('aria-selected', String(computer));
    elements.phoneSourceButton.setAttribute('aria-selected', String(!computer));
    elements.computerFilePane.hidden = !computer;
    elements.phoneFilePane.hidden = computer;
    elements.uploadProgress.hidden = computer;
    elements.startUploadButton.textContent = computer
      ? (state.pendingChooser?.directory ? '使用此电脑文件夹' : '使用已选电脑文件')
      : '开始上传手机文件';
    if (computer) renderComputerSelection();
    else renderSelectedFiles();
  }

  async function setUploadSource(source) {
    const requested = source === 'phone' ? 'phone' : 'computer';
    state.uploadSource = requested === 'computer' && state.capabilities.computerFilePicker === false ? 'phone' : requested;
    updateUploadSourceUi();
    if (state.uploadSource === 'computer' && !state.computerBrowser.roots.length && !state.computerBrowser.loading) {
      await loadComputerRoots();
    }
  }

  function computerEntryDetail(entry) {
    if (entry.kind === 'directory') return entry.path;
    const modified = entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : '';
    return `${formatBytes(entry.size || 0)}${modified ? ` · ${modified}` : ''}`;
  }

  function renderComputerBrowser() {
    const browser = state.computerBrowser;
    if (elements.computerSortSelect) {
      elements.computerSortSelect.value = browser.sort || storedComputerSort;
      elements.computerSortSelect.disabled = browser.loading || !browser.currentPath || state.role !== 'controller';
    }
    elements.computerFileList.replaceChildren();
    elements.computerParentButton.disabled = browser.loading || !browser.parentPath || state.role !== 'controller';
    elements.computerRefreshButton.disabled = browser.loading || state.role !== 'controller';
    elements.computerClearSelectionButton.disabled = browser.loading || browser.selected.size === 0 || state.role !== 'controller';
    elements.computerRootsButton.disabled = browser.loading || state.role !== 'controller';
    elements.computerPath.textContent = browser.loading
      ? '正在读取电脑文件…'
      : (browser.currentPath || '电脑常用位置与磁盘');

    const rows = browser.currentPath
      ? browser.entries
      : browser.roots.map((root) => ({ ...root, name: root.label, kind: 'directory', isRoot: true }));

    if (browser.loading) {
      const loading = document.createElement('div');
      loading.className = 'computer-empty';
      loading.textContent = '正在读取…';
      elements.computerFileList.append(loading);
    } else if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'computer-empty';
      empty.textContent = browser.currentPath ? '这个文件夹为空，或没有可读取的项目。' : '没有找到可浏览的电脑位置。';
      elements.computerFileList.append(empty);
    } else {
      for (const entry of rows) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'computer-entry';
        row.title = entry.path;
        const selected = browser.selected.has(entry.path);
        row.classList.toggle('selected', selected);

        const icon = document.createElement('span');
        icon.className = 'entry-icon';
        icon.textContent = entry.kind === 'directory' ? '📁' : '📄';
        const main = document.createElement('span');
        main.className = 'entry-main';
        const name = document.createElement('span');
        name.className = 'entry-name';
        name.textContent = entry.name || entry.label || entry.path;
        const detail = document.createElement('span');
        detail.className = 'entry-detail';
        detail.textContent = entry.isRoot ? entry.path : computerEntryDetail(entry);
        main.append(name, detail);
        const action = document.createElement('span');
        action.className = 'entry-check';
        action.textContent = entry.kind === 'directory' ? '›' : (selected ? '✓' : '');
        row.append(icon, main, action);

        row.addEventListener('click', () => {
          if (entry.kind === 'directory') {
            browseComputerDirectory(entry.path).catch((error) => showToast(error.message, 'error', 4200));
          } else {
            toggleComputerSelection(entry);
          }
        });
        elements.computerFileList.append(row);
      }
    }

    elements.computerSelectFolderButton.hidden = !state.pendingChooser?.directory || !browser.currentPath;
    elements.computerSelectFolderButton.disabled = browser.loading || !browser.currentPath || state.role !== 'controller';
    if (browser.truncated) {
      const notice = document.createElement('div');
      notice.className = 'computer-empty';
      notice.textContent = '这个文件夹项目过多，只显示前一部分。请进入更具体的子文件夹。';
      elements.computerFileList.append(notice);
    }
    renderComputerSelection();
  }

  function renderComputerSelection() {
    const browser = state.computerBrowser;
    const selected = [...browser.selected.values()];
    if (!selected.length) {
      elements.computerSelection.textContent = state.pendingChooser?.directory
        ? '尚未选择文件夹。进入目标文件夹后点“选择当前文件夹”。'
        : '尚未选择电脑文件。点文件即可选中。';
      if (state.uploadSource === 'computer') elements.startUploadButton.disabled = true;
      return;
    }
    const total = selected.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
    elements.computerSelection.replaceChildren();
    const summary = document.createElement('strong');
    summary.textContent = state.pendingChooser?.directory
      ? `已选文件夹：${selected[0].path}`
      : `已选 ${selected.length} 个电脑文件，共 ${formatBytes(total)}`;
    elements.computerSelection.append(summary);
    if (!state.pendingChooser?.directory) {
      for (const item of selected.slice(0, 8)) {
        const line = document.createElement('div');
        line.textContent = item.path;
        elements.computerSelection.append(line);
      }
      if (selected.length > 8) {
        const more = document.createElement('div');
        more.textContent = `另有 ${selected.length - 8} 个文件…`;
        elements.computerSelection.append(more);
      }
    }
    if (state.uploadSource === 'computer') elements.startUploadButton.disabled = state.uploading || state.role !== 'controller';
  }

  function toggleComputerSelection(entry) {
    if (!entry || entry.kind !== 'file' || state.pendingChooser?.directory) return;
    const selected = state.computerBrowser.selected;
    if (selected.has(entry.path)) {
      selected.delete(entry.path);
    } else {
      if (!state.pendingChooser?.multiple) selected.clear();
      const max = Number(state.capabilities.maxComputerFiles) || 256;
      if (selected.size >= max) {
        showToast(`一次最多选择 ${max} 个电脑文件`, 'warn', 3200);
        return;
      }
      selected.set(entry.path, entry);
    }
    renderComputerBrowser();
  }

  function selectCurrentComputerFolder() {
    const browser = state.computerBrowser;
    if (!browser.currentPath || !state.pendingChooser?.directory) return;
    browser.selected.clear();
    browser.selected.set(browser.currentPath, {
      path: browser.currentPath,
      name: browser.currentPath.split(/[\\/]/).filter(Boolean).at(-1) || browser.currentPath,
      kind: 'directory',
      size: 0
    });
    renderComputerBrowser();
  }

  async function loadComputerRoots() {
    if (!state.pendingChooser) throw new Error('网页文件上传框已经失效。');
    const browser = state.computerBrowser;
    browser.loading = true;
    browser.currentPath = '';
    browser.parentPath = null;
    browser.entries = [];
    renderComputerBrowser();
    try {
      const result = await request('computerRoots', { chooserId: state.pendingChooser.id }, 20000);
      browser.roots = Array.isArray(result.roots) ? result.roots : [];
      browser.currentPath = '';
      browser.parentPath = null;
      browser.truncated = false;
    } finally {
      browser.loading = false;
      renderComputerBrowser();
    }
  }

  async function browseComputerDirectory(path) {
    if (!state.pendingChooser) throw new Error('网页文件上传框已经失效。');
    const browser = state.computerBrowser;
    browser.loading = true;
    renderComputerBrowser();
    try {
      const result = await request('computerList', {
        chooserId: state.pendingChooser.id,
        path,
        sort: browser.sort || storedComputerSort
      }, 30000);
      browser.currentPath = result.path || path;
      browser.parentPath = result.parentPath || null;
      browser.entries = Array.isArray(result.entries) ? result.entries : [];
      browser.truncated = Boolean(result.truncated);
      browser.sort = result.sort || browser.sort || storedComputerSort;
      storageSet('edgePhoneComputerSortV64', browser.sort);
    } finally {
      browser.loading = false;
      renderComputerBrowser();
    }
  }

  async function commitComputerSelection() {
    if (state.uploading) return;
    const paths = [...state.computerBrowser.selected.keys()];
    if (!paths.length) return;
    state.uploading = true;
    elements.startUploadButton.disabled = true;
    elements.uploadStatus.textContent = '正在把电脑文件交给 Edge 网页上传框…';
    try {
      const result = await request('computerCommit', {
        chooserId: state.pendingChooser?.id || null,
        paths
      }, 120000);
      elements.uploadStatus.textContent = `完成：网页已接收 ${result.count || paths.length} 个电脑文件。`;
      showToast('电脑文件已交给远程网页', 'ok', 3000);
      const completedChooserId = state.pendingChooser?.id || null;
      state.pendingChooser = null;
      closeUploadOverlaySoon(completedChooserId, 700);
      markVisualDemand('computer-upload', 850);
    } catch (error) {
      elements.uploadStatus.textContent = error.message;
      showToast(`选择电脑文件失败：${error.message}`, 'error', 5000);
    } finally {
      state.uploading = false;
      renderComputerSelection();
    }
  }

  function handleFileChooser(message) {
    const incomingId = message.id || null;
    if (!incomingId) return;
    cancelActiveGesture();
    clearUploadCloseTimer();

    // 同一次 chooser 的重复事件只更新说明，不清空已浏览路径或已勾选文件。
    if (state.pendingChooser?.id === incomingId) {
      state.pendingChooser = {
        ...state.pendingChooser,
        targetId: message.targetId || state.pendingChooser.targetId || state.activeTabId || null,
        multiple: Boolean(message.multiple),
        directory: Boolean(message.directory),
        accept: message.accept || ''
      };
      elements.uploadHint.textContent = uploadChooserDescription();
      setOverlay('uploadOverlay', true);
      return;
    }

    state.pendingChooser = {
      id: incomingId,
      targetId: message.targetId || state.activeTabId || null,
      multiple: Boolean(message.multiple),
      directory: Boolean(message.directory),
      accept: message.accept || ''
    };
    resetComputerBrowser();
    elements.phoneFiles.value = '';
    elements.phoneFiles.multiple = state.pendingChooser.multiple || state.pendingChooser.directory;
    if (state.pendingChooser.accept) elements.phoneFiles.setAttribute('accept', state.pendingChooser.accept);
    else elements.phoneFiles.removeAttribute('accept');
    if (state.pendingChooser.directory) elements.phoneFiles.setAttribute('webkitdirectory', '');
    else elements.phoneFiles.removeAttribute('webkitdirectory');
    elements.uploadHint.textContent = uploadChooserDescription();
    elements.fileList.textContent = '尚未选择手机文件。';
    elements.uploadStatus.textContent = '';
    elements.uploadProgress.value = 0;
    state.uploadSource = state.capabilities.computerFilePicker === false ? 'phone' : 'computer';
    updateUploadSourceUi();
    setOverlay('uploadOverlay', true);
    if (state.uploadSource === 'computer') {
      loadComputerRoots().catch((error) => {
        if (state.pendingChooser?.id !== incomingId) return;
        elements.uploadStatus.textContent = error.message;
        showToast(`读取电脑文件失败：${error.message}`, 'error', 4500);
      });
    }
  }

  function renderSelectedFiles() {
    const files = [...elements.phoneFiles.files];
    elements.fileList.replaceChildren();
    if (!files.length) {
      elements.fileList.textContent = '尚未选择手机文件。';
      if (state.uploadSource === 'phone') elements.startUploadButton.disabled = true;
      return;
    }
    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.textContent = `${file.webkitRelativePath || file.name} · ${formatBytes(file.size)}`;
      elements.fileList.append(item);
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > state.capabilities.maxUploadFiles || total > state.capabilities.maxUploadBytes) {
      elements.uploadStatus.textContent = `超出限制：最多 ${state.capabilities.maxUploadFiles} 个文件、总计 ${formatBytes(state.capabilities.maxUploadBytes)}。`;
      if (state.uploadSource === 'phone') elements.startUploadButton.disabled = true;
    } else {
      elements.uploadStatus.textContent = `${files.length} 个手机文件，共 ${formatBytes(total)}。`;
      if (state.uploadSource === 'phone') elements.startUploadButton.disabled = state.uploading;
    }
  }

  async function waitForSocketBuffer(limit = 4 * 1024 * 1024) {
    while (wsIsOpen() && state.ws.bufferedAmount > limit) {
      if (state.uploadAbort) throw new Error('上传已取消');
      await sleep(20);
    }
    if (!wsIsOpen()) throw new Error('上传期间控制连接已断开');
  }

  async function uploadSelectedFiles() {
    if (state.uploading) return;
    const files = [...elements.phoneFiles.files];
    if (!files.length) return;
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > state.capabilities.maxUploadFiles) {
      showToast(`一次最多上传 ${state.capabilities.maxUploadFiles} 个文件`, 'error', 4000);
      return;
    }
    if (totalBytes > state.capabilities.maxUploadBytes) {
      showToast(`总大小不能超过 ${formatBytes(state.capabilities.maxUploadBytes)}`, 'error', 4000);
      return;
    }

    state.uploading = true;
    state.uploadAbort = false;
    elements.startUploadButton.disabled = true;
    elements.uploadProgress.hidden = false;
    elements.uploadProgress.max = totalBytes || 1;
    elements.uploadProgress.value = 0;
    elements.uploadStatus.textContent = '正在建立手机文件传输会话…';
    // 记住本次上传对应的选择框：失败清理时只取消它，不得取消服务端当时
    // 恰好挂着的更新选择框（否则用户的重试会被上一次失败的收尾误杀）。
    const uploadChooserId = state.pendingChooser?.id || null;
    let sentBytes = 0;

    try {
      await request('uploadBegin', {
        chooserId: state.pendingChooser?.id || null,
        files: files.map((file) => ({
          name: file.webkitRelativePath || file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        }))
      }, 20000);

      const chunkSize = 256 * 1024;
      const ackEveryBytes = clamp(Number(state.capabilities.uploadAckBytes) || 1024 * 1024, chunkSize, 8 * 1024 * 1024);
      for (let index = 0; index < files.length; index += 1) {
        if (state.uploadAbort) throw new Error('上传已取消');
        const file = files[index];
        elements.uploadStatus.textContent = `正在传输 ${index + 1}/${files.length}：${file.name}`;
        await request('uploadFileBegin', { index }, 20000);
        let unacknowledgedBytes = 0;
        let fileSentBytes = 0;
        for (let offset = 0; offset < file.size; offset += chunkSize) {
          if (state.uploadAbort) throw new Error('上传已取消');
          await waitForSocketBuffer();
          const chunk = await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer();
          state.ws.send(chunk);
          sentBytes += chunk.byteLength;
          fileSentBytes += chunk.byteLength;
          unacknowledgedBytes += chunk.byteLength;
          elements.uploadProgress.value = sentBytes;
          if (unacknowledgedBytes >= ackEveryBytes || fileSentBytes === file.size) {
            const ack = await request('uploadChunkAck', {
              index,
              expectedBytes: fileSentBytes
            }, 60000);
            if (Number(ack.currentBytes) !== fileSentBytes) {
              throw new Error(`电脑端分块确认不一致：${ack.currentBytes} / ${fileSentBytes}`);
            }
            unacknowledgedBytes = 0;
          }
        }
        await request('uploadFileEnd', { index }, 60000);
      }

      elements.uploadStatus.textContent = '手机文件已到达电脑，正在交给网页上传框…';
      const result = await request('uploadCommit', {}, 120000);
      elements.uploadStatus.textContent = `完成：网页已接收 ${result.count || files.length} 个文件。`;
      showToast('手机文件已交给远程网页', 'ok', 3000);
      const completedChooserId = state.pendingChooser?.id || null;
      state.pendingChooser = null;
      closeUploadOverlaySoon(completedChooserId, 700);
      markVisualDemand('upload', 900);
    } catch (error) {
      elements.uploadStatus.textContent = error.message;
      showToast(`上传失败：${error.message}`, 'error', 5000);
      try { await request('cancelUpload', { chooserId: uploadChooserId }, 12000); } catch {}
    } finally {
      state.uploading = false;
      state.uploadAbort = false;
      elements.startUploadButton.disabled = elements.phoneFiles.files.length === 0;
      elements.cancelUploadButton.textContent = '取消';
    }
  }

  function persistCalibration() {
    state.calibration = Geometry.normalizeCalibration({
      offsetX: Number(elements.offsetXRange.value) / 100,
      offsetY: Number(elements.offsetYRange.value) / 100,
      scaleX: Number(elements.scaleXRange.value) / 100,
      scaleY: Number(elements.scaleYRange.value) / 100
    });
    saveCurrentCalibrationProfile();
    updateCalibrationUi();
  }

  function updateCalibrationUi() {
    const calibration = Geometry.normalizeCalibration(state.calibration);
    const profileLabel = calibrationProfileLabelFor(state.calibrationProfileKey);
    const counterpartKey = counterpartCalibrationProfileKey(state.calibrationProfileKey);
    const isFullscreenProfile = state.calibrationProfileKey.startsWith('fullscreen-');
    elements.offsetXRange.value = String(calibration.offsetX * 100);
    elements.offsetYRange.value = String(calibration.offsetY * 100);
    elements.scaleXRange.value = String(calibration.scaleX * 100);
    elements.scaleYRange.value = String(calibration.scaleY * 100);
    elements.offsetXValue.textContent = `${(calibration.offsetX * 100).toFixed(1)}%`;
    elements.offsetYValue.textContent = `${(calibration.offsetY * 100).toFixed(1)}%`;
    elements.scaleXValue.textContent = `${(calibration.scaleX * 100).toFixed(1)}%`;
    elements.scaleYValue.textContent = `${(calibration.scaleY * 100).toFixed(1)}%`;
    elements.offsetXDirection.textContent = calibrationDirection(calibration.offsetX, '命中向左', '命中向右');
    elements.offsetYDirection.textContent = calibrationDirection(calibration.offsetY, '命中向上', '命中向下');
    elements.calibrationProfileLabel.textContent = profileLabel;
    elements.copyCalibrationProfileButton.textContent = isFullscreenProfile ? '复制到普通模式' : '复制到全屏';
    elements.copyCalibrationProfileButton.dataset.targetProfile = counterpartKey;
    elements.calibrationStepSelect.value = String(state.calibrationStep);
    elements.calibrationTestButton.textContent = state.calibrationTestMode ? '退出点击测试' : '点击测试模式';
    $('calibrationCenterButton').textContent = state.calibrationTestMode ? '退出' : '测试';

    elements.fsCalibrationProfileLabel.textContent = profileLabel;
    elements.fsOffsetXValue.textContent = `${(calibration.offsetX * 100).toFixed(1)}%`;
    elements.fsOffsetYValue.textContent = `${(calibration.offsetY * 100).toFixed(1)}%`;
    elements.fsCalibrationStepSelect.value = String(state.calibrationStep);
    elements.fsCalibrationTestButton.textContent = state.calibrationTestMode ? '退出' : '测试';
    elements.fsCalibrationCopyButton.textContent = isFullscreenProfile ? '从普通模式复制' : '从全屏复制';
  }

  async function apiJson(pathname) {
    const response = await fetch(pathname, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${state.token}` }
    });
    if (!response.ok) throw new Error(`${pathname} 返回 ${response.status}`);
    return response.json();
  }

  function localDiagnostics() {
    return {
      time: new Date().toISOString(),
      location: location.host,
      online: navigator.onLine,
      pageVisibility: document.visibilityState,
      userAgent: navigator.userAgent,
      websocket: state.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][state.ws.readyState] : 'NONE',
      websocketBufferedBytes: state.ws?.bufferedAmount || 0,
      role: state.role,
      pingMs: state.pingMs,
      rendererPreference: state.rendererPreference,
      rendererActive: state.rendererActive,
      rendererFailures: { image: state.imageFailures, canvas: state.canvasFailures },
      inputMode: state.inputMode,
      gestureMode: state.gestureMode,
      followDesktopTabs: state.followDesktopTabs,
      calibration: {
        profileKey: state.calibrationProfileKey,
        profileLabel: calibrationProfileLabelFor(state.calibrationProfileKey),
        current: state.calibration,
        profiles: state.calibrationProfiles,
        stepPercent: state.calibrationStep,
        testMode: state.calibrationTestMode
      },
      stage: (() => {
        const rect = elements.stage.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height), dpr: window.devicePixelRatio || 1 };
      })(),
      viewport: state.viewport,
      streamPreset: {
        requested: state.viewport.streamPreset,
        effective: state.viewport.effectiveStreamPreset
      },
      frame: {
        lastRenderedSequence: state.lastRenderedSequence,
        lastServerSequence: state.lastServerSequence,
        expectedEpoch: state.expectedFrameEpoch,
        displayedEpoch: state.displayedFrameEpoch,
        lastRenderedAgeMs: state.lastFrameRenderedAt ? Date.now() - state.lastFrameRenderedAt : null,
        lastReceivedAgeMs: state.lastFrameReceivedAt ? Date.now() - state.lastFrameReceivedAt : null,
        source: state.lastFrameSource,
        geometry: state.currentGeometry ? Geometry.geometrySummary(state.currentGeometry) : null
      }
    };
  }

  async function updateDiagnosticsText(fetchServer = true) {
    let serverStatus = null;
    if (fetchServer && state.token) {
      try {
        serverStatus = await apiJson('/api/status');
        state.lastStatusReadAt = Date.now();
      } catch (error) {
        serverStatus = { error: error.message };
      }
    }
    const content = { phone: localDiagnostics(), server: serverStatus };
    elements.diagnosticsText.textContent = JSON.stringify(content, null, 2);
    return content;
  }

  async function updateLogs() {
    elements.logsText.textContent = '正在读取…';
    try {
      const result = await apiJson('/api/logs');
      const logs = (result.logs || []).slice(-80);
      elements.logsText.textContent = logs.map((entry) => {
        const details = entry.details === undefined ? '' : ` ${JSON.stringify(entry.details)}`;
        return `${entry.time} ${String(entry.level).toUpperCase()} ${entry.message}${details}`;
      }).join('\n') || '没有日志。';
    } catch (error) {
      elements.logsText.textContent = error.message;
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  function updateFullscreenDockPosition() {
    const y = clamp(Number(state.fullscreenDockY) || 50, 22, 78);
    state.fullscreenDockY = y;
    elements.fullscreenDock.style.top = `${y}%`;
  }

  function clearFullscreenDockTimer() {
    clearTimeout(state.fullscreenDockTimer);
    state.fullscreenDockTimer = null;
  }

  function scheduleFullscreenDockCollapse() {
    clearFullscreenDockTimer();
    if (!document.fullscreenElement || state.fullscreenCalibrationOpen || elements.keyboardPanel.classList.contains('open')) return;
    state.fullscreenDockTimer = setTimeout(() => closeFullscreenDock(false), 6000);
  }

  function openFullscreenDock() {
    if (!document.fullscreenElement) return;
    state.fullscreenDockOpen = true;
    state.fullscreenCalibrationOpen = false;
    elements.fullscreenDockPanel.hidden = false;
    elements.fullscreenCalibrationPanel.hidden = true;
    elements.fullscreenDockHandle.setAttribute('aria-expanded', 'true');
    scheduleFullscreenDockCollapse();
  }

  function closeFullscreenDock(force = false) {
    clearFullscreenDockTimer();
    state.fullscreenDockOpen = false;
    if (force) state.fullscreenCalibrationOpen = false;
    elements.fullscreenDockPanel.hidden = true;
    if (force || !state.fullscreenCalibrationOpen) elements.fullscreenCalibrationPanel.hidden = true;
    elements.fullscreenDockHandle.setAttribute('aria-expanded', 'false');
  }

  function toggleFullscreenDock() {
    if (state.fullscreenDockOpen || state.fullscreenCalibrationOpen) closeFullscreenDock(true);
    else openFullscreenDock();
  }

  function openFullscreenCalibrationPanel() {
    if (!document.fullscreenElement) return;
    ensureCalibrationProfileCurrent('fullscreen-calibration', { silent: true });
    clearFullscreenDockTimer();
    state.fullscreenDockOpen = false;
    state.fullscreenCalibrationOpen = true;
    elements.fullscreenDockPanel.hidden = true;
    elements.fullscreenCalibrationPanel.hidden = false;
    elements.fullscreenDockHandle.setAttribute('aria-expanded', 'true');
    updateCalibrationUi();
  }

  function closeFullscreenCalibrationPanel() {
    state.fullscreenCalibrationOpen = false;
    elements.fullscreenCalibrationPanel.hidden = true;
    elements.fullscreenDockHandle.setAttribute('aria-expanded', 'false');
  }

  function bindFullscreenDockDrag() {
    updateFullscreenDockPosition();
    const handle = elements.fullscreenDockHandle;
    handle.addEventListener('pointerdown', (event) => {
      if (!document.fullscreenElement) return;
      event.preventDefault();
      clearFullscreenDockTimer();
      state.fullscreenDockDrag = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startPercent: state.fullscreenDockY,
        moved: false
      };
      try { handle.setPointerCapture(event.pointerId); } catch {}
    }, { passive: false });
    handle.addEventListener('pointermove', (event) => {
      const drag = state.fullscreenDockDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const delta = event.clientY - drag.startY;
      if (Math.abs(delta) > 5) drag.moved = true;
      state.fullscreenDockY = clamp(drag.startPercent + delta / Math.max(1, window.innerHeight) * 100, 22, 78);
      updateFullscreenDockPosition();
    }, { passive: false });
    const finish = (event) => {
      const drag = state.fullscreenDockDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      state.fullscreenDockDrag = null;
      try { handle.releasePointerCapture(event.pointerId); } catch {}
      if (drag.moved) {
        storageSet('edgePhoneFullscreenDockYV66', String(state.fullscreenDockY));
        scheduleFullscreenDockCollapse();
      } else {
        toggleFullscreenDock();
      }
    };
    handle.addEventListener('pointerup', finish, { passive: false });
    handle.addEventListener('pointercancel', (event) => {
      const drag = state.fullscreenDockDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      state.fullscreenDockDrag = null;
      try { handle.releasePointerCapture(event.pointerId); } catch {}
      // A system gesture or browser interruption must not be treated as a tap;
      // otherwise the dock can unexpectedly open while the user is swiping.
      scheduleFullscreenDockCollapse();
    }, { passive: false });
  }

  function updateFullscreenButton() {
    const button = $('fullscreenButton');
    if (!button) return;
    button.textContent = document.fullscreenElement ? '退出沉浸全屏' : '进入沉浸全屏';
    button.disabled = typeof document.documentElement.requestFullscreen !== 'function';
  }

  function forceViewportSync(reason = 'manual-size-sync') {
    settleViewport(reason, { fallback: true });
  }

  function applyFullscreenLayout() {
    const active = Boolean(document.fullscreenElement);
    document.body.classList.toggle('immersive-fullscreen', active);
    if (active) {
      elements.keyboardPanel.classList.remove('open');
      updateFullscreenDockPosition();
      closeFullscreenDock(true);
    } else {
      closeFullscreenDock(true);
      elements.keyboardPanel.classList.remove('open');
    }
    updateFullscreenButton();
    // Normal and fullscreen modes intentionally have independent calibration
    // profiles. Switch the profile as soon as the mode changes, then wait for
    // Android's fullscreen animation to settle before changing Edge viewport.
    requestAnimationFrame(() => {
      ensureCalibrationProfileCurrent(active ? 'fullscreen-enter' : 'fullscreen-exit');
      settleViewport(active ? 'fullscreen-enter' : 'fullscreen-exit');
    });
  }

  async function toggleFullscreen() {
    try {
      setOverlay('settingsOverlay', false);
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (typeof document.documentElement.requestFullscreen === 'function') {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => document.documentElement.requestFullscreen());
        showToast('已进入沉浸全屏；点右侧“⋮”可使用后退、标签、输入、上传、校准和退出。', 'info', 4200);
      } else {
        throw new Error('当前 Android 浏览器不支持网页全屏 API');
      }
    } catch (error) {
      showToast(`全屏切换失败：${error.message}`, 'warn', 3500);
    }
  }

  function bindControls() {
    state.roleControls = [
      $('goButton'), elements.addressInput, $('reloadButton'), $('keyboardButton'), $('uploadButton'), $('displayButton'),
      $('newTabButton'), $('newTabInput'), $('sendTextButton'), elements.textInput, $('selectAllButton'), $('pasteButton'),
      elements.liveTextSyncToggle, elements.pullTextButton,
      elements.computerSourceButton, elements.phoneSourceButton, elements.computerRootsButton, elements.computerParentButton,
      elements.computerRefreshButton, elements.computerClearSelectionButton, elements.computerSortSelect,
      elements.computerSelectFolderButton, elements.phoneFiles, elements.startUploadButton,
      elements.streamPresetSelect, elements.mobileZoomSelect, elements.followDesktopTabsToggle, elements.manualCompatibilitySelect, elements.strictNativeTouchButton, elements.refreshCompatibilityAuditButton, elements.desktopWidthRange,
      elements.fsReloadButton, elements.fsTabsButton, elements.fsKeyboardButton, elements.fsUploadButton, elements.fsStrictInputButton,
      elements.fsCalibrationButton, elements.fsCalibrationTestButton,
      // 浏览历史现为控制者专属（与电脑文件/剪贴板同边界），只读端禁用入口。
      elements.browserHistoryModeButton, elements.browserHistorySearchInput,
      elements.browserHistoryRefreshButton, elements.browserHistoryMoreButton,
      ...document.querySelectorAll('[data-key]')
    ];

    $('addressForm').addEventListener('submit', (event) => {
      event.preventDefault();
      navigateAddress(elements.addressInput.value);
    });
    // 后退/前进/刷新会换页或重置输入框，但同 URL 的刷新、SPA 内的前进后退
    // 不会改变 pageState 的 url/targetId（那条异步失效路径漏判）——这里同步
    // 作废实时同步基准，避免刷新后差量落到被重置的输入框上。
    elements.backButton.addEventListener('click', () => {
      invalidateLiveSyncBase('页面已后退，实时同步已暂停：点"取回网页文本"重新对齐。');
      request('back').catch((error) => showToast(error.message, 'error'));
      markVisualDemand('back', 900);
    });
    elements.forwardButton.addEventListener('click', () => {
      invalidateLiveSyncBase('页面已前进，实时同步已暂停：点"取回网页文本"重新对齐。');
      request('forward').catch((error) => showToast(error.message, 'error'));
      markVisualDemand('forward', 900);
    });
    $('reloadButton').addEventListener('click', (event) => {
      invalidateLiveSyncBase('页面已刷新，实时同步已暂停：点"取回网页文本"重新对齐。');
      request('reload', { ignoreCache: event.shiftKey }).catch((error) => showToast(error.message, 'error'));
      markVisualDemand('reload', 1200);
    });

    $('keyboardButton').addEventListener('click', () => {
      elements.keyboardPanel.classList.toggle('open');
      scheduleViewport(false);
      if (elements.keyboardPanel.classList.contains('open')) setTimeout(() => elements.textInput.focus(), 80);
    });
    // ===== 实时同步：本地文本框 → 远程网页输入框（纯写入，零页面信号）====
    // 差量按字素簇（Intl.Segmenter）计算：退格在编辑器里按"一个可见字符"
    // 删除，用 UTF-16 单元计数会把 emoji 多删。常见的末尾追加/末尾删除走
    // 快路径（不做整段分簇）。小改动发 退格×N + insertText；大改动或删除
    // 跨越换行（contenteditable 的退格在段落边界是"合并段落"而非删一个
    // \n 字素）时，仅在基准等于远程全文（取回过）时用 全选+整段替换，
    // 否则宣告基准失效要求重新取回——绝不冒险盲删。
    const graphemeSegmenter = typeof Intl !== 'undefined' && Intl.Segmenter
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;
    const toGraphemes = (text) => graphemeSegmenter
      ? Array.from(graphemeSegmenter.segment(text), (part) => part.segment)
      : Array.from(text);
    const liveEditLock = () => state.liveTextSync && state.role === 'controller';
    let liveSyncQueue = Promise.resolve();
    let liveSyncTimer = null;
    // 每次基准失效都自增：在途的差量任务据此在每个远程写入之间自查，一旦
    // 代变了就停手，绝不把删除/插入落到已经移动的光标上。
    let liveSyncGeneration = 0;
    invalidateLiveSyncBase = (toastMessage) => {
      if (!state.liveTextSync) return;
      state.liveSyncWholeField = false;
      if (!state.liveSyncBaseValid) return;
      // 任何"远程光标/焦点/内容可能已改变"的事件都要真正暂停同步：置基准
      // 无效并自增代（打断在途写入）。两边都空时也照样置无效——否则点了
      // 别的（可能有内容的）输入框后，下一次插入会落到错误的地方；只是此时
      // 无可损失，就静默处理不打扰。有内容才提示需要重新取回。
      const hadContent = Boolean(state.liveSyncBase || elements.textInput.value);
      state.liveSyncBaseValid = false;
      liveSyncGeneration += 1;
      clearTimeout(liveSyncTimer);
      if (hadContent) showToast(toastMessage || '页面焦点可能已变化，实时同步已暂停：点"取回网页文本"重新对齐后继续。', 'warn', 3400);
    };
    const liveSyncDiff = (base, next) => {
      // 快路径：纯末尾追加 / 纯末尾删除（覆盖绝大多数打字场景，避免每次
      // 击键对 2 万字整段分簇）。字素边界安全：追加以完整字素输入；删除
      // 只统计被删尾段的字素数。
      if (next.startsWith(base)) return { deletions: 0, insertion: next.slice(base.length), removed: '' };
      if (base.startsWith(next)) {
        const removed = base.slice(next.length);
        return { deletions: toGraphemes(removed).length, insertion: '', removed };
      }
      const baseG = toGraphemes(base);
      const nextG = toGraphemes(next);
      let prefix = 0;
      const max = Math.min(baseG.length, nextG.length);
      while (prefix < max && baseG[prefix] === nextG[prefix]) prefix += 1;
      const removed = baseG.slice(prefix).join('');
      return { deletions: baseG.length - prefix, insertion: nextG.slice(prefix).join(''), removed };
    };
    const flushLiveSync = () => {
      clearTimeout(liveSyncTimer);
      liveSyncTimer = null;
      if (!liveEditLock() || !wsIsOpen()) return liveSyncQueue;
      liveSyncQueue = liveSyncQueue.then(async () => {
        if (!liveEditLock() || !wsIsOpen() || !state.liveSyncBaseValid) return;
        const gen = liveSyncGeneration;
        const base = state.liveSyncBase;
        const next = elements.textInput.value;
        if (next === base) return;
        const { deletions, insertion, removed } = liveSyncDiff(base, next);
        const removedCrossesLine = removed.includes('\n');
        // 每个远程写入之间重新自查：一旦有失效事件（点画面、切页/标签、
        // 断线、失败）改了代或作废了基准，立刻停手——绝不把删除/插入落到
        // 已经移动的光标上，也不把基准推进到不可信的状态。
        const stillOk = () => gen === liveSyncGeneration && state.liveSyncBaseValid && liveEditLock() && wsIsOpen();
        try {
          if (deletions > 40 || (deletions > 0 && removedCrossesLine)) {
            if (!state.liveSyncWholeField) {
              // 基准不是远程全文（未取回就开同步且远程可能有既有内容）：
              // 全选替换会吞掉看不见的既有文本，宁可停下要求重新取回。
              invalidateLiveSyncBase('这次改动较大，需要先点"取回网页文本"对齐后再同步，避免误删网页里的其他内容。');
              return;
            }
            // 破坏性整段替换前，先只读取回校验远程全文仍等于基准：防桌面端
            // 或页面脚本在同一输入框改动后，被 selectAll 连带整段覆盖。
            const check = await request('pullEditableText', {}, 15000);
            if (!stillOk()) return;
            if (!check?.ok || check.truncated || String(check.text || '') !== base) {
              invalidateLiveSyncBase('网页内容已在别处变化，实时同步已暂停：点"取回网页文本"重新对齐。');
              return;
            }
            await request('selectAll');
            if (!stillOk()) return;
            if (next) await request('text', { text: next });
            else await request('key', { key: 'Backspace' });
          } else {
            if (deletions > 0) {
              await request('key', { key: 'Backspace', count: deletions });
              if (!stillOk()) return;
            }
            if (insertion) await request('text', { text: insertion });
          }
          if (!stillOk()) return;
          state.liveSyncBase = next;
          markVisualDemand('live-sync', 500);
        } catch (error) {
          // 失败时远程可能已应用了一部分（超时≠未执行），基准不再可信：
          // 立即失效并要求重新取回，绝不带着脏基准重试（会复合误删）。
          invalidateLiveSyncBase(`实时同步中断（${error.message}），已暂停：点"取回网页文本"重新对齐。`);
        }
      });
      return liveSyncQueue;
    };
    const scheduleLiveSync = () => {
      if (!liveEditLock()) return;
      clearTimeout(liveSyncTimer);
      liveSyncTimer = setTimeout(flushLiveSync, 90);
    };
    elements.textInput.addEventListener('input', (event) => {
      if (event.isComposing) return;
      scheduleLiveSync();
    });
    elements.textInput.addEventListener('compositionend', scheduleLiveSync);
    const applyLiveSyncUi = () => {
      document.body.classList.toggle('live-sync-on', Boolean(state.liveTextSync));
      elements.liveTextSyncToggle.checked = Boolean(state.liveTextSync);
    };
    elements.liveTextSyncToggle.addEventListener('change', () => {
      state.liveTextSync = elements.liveTextSyncToggle.checked;
      storageSet('edgePhoneLiveTextSyncV68', String(state.liveTextSync));
      applyLiveSyncUi();
      if (state.liveTextSync) {
        state.liveSyncBase = '';
        state.liveSyncBaseValid = true;
        state.liveSyncWholeField = false;
        showToast('实时同步已开启：先点网页输入框，再点"取回网页文本"接管已有内容；本地编辑会即时镜像过去。', 'info', 4200);
        scheduleLiveSync();
      } else {
        state.liveSyncBase = '';
        state.liveSyncBaseValid = true;
        state.liveSyncWholeField = false;
      }
    });
    applyLiveSyncUi();
    elements.pullTextButton.addEventListener('click', () => {
      // 与差量写入同一队列串行：绝不让取回的 全选/→ 和一次在途差量交错
      // （交错时 退格 会命中全选选区、清空整个输入框）。
      clearTimeout(liveSyncTimer);
      liveSyncTimer = null;
      liveSyncQueue = liveSyncQueue.then(async () => {
        try {
          const result = await request('pullEditableText', {}, 15000);
          if (!result?.ok) {
            showToast('网页当前没有聚焦的输入框：先在网页里点一下要编辑的输入框，再点取回。', 'warn', 3600);
            return;
          }
          if (result.truncated) {
            // 基准若是截断文本而远程还有看不见的尾部，之后的每次差量都会
            // 盲改那段尾部——拒绝武装，绝不接管超长内容。
            showToast(`网页文本超过 20000 字（共 ${result.length} 字），实时同步不接管超长内容，请直接在网页里编辑。`, 'warn', 4500);
            return;
          }
          // 把远程光标固定到文本末尾，作为后续差量同步的基准。
          await request('selectAll');
          await request('key', { key: 'ArrowRight' });
          const text = String(result.text || '');
          elements.textInput.value = text;
          state.liveSyncBase = text;
          state.liveSyncBaseValid = true;
          state.liveSyncWholeField = true;
          elements.textInput.focus();
          showToast(`已取回 ${result.length} 个字符，编辑将实时同步。`, 'ok', 2600);
        } catch (error) {
          showToast(error.message, 'error', 3500);
        }
      });
    });
    $('hideKeyboardButton').addEventListener('click', () => {
      flushLiveSync();
      elements.keyboardPanel.classList.remove('open');
      elements.textInput.blur();
      scheduleViewport(false);
    });
    const sendKeyboardText = async ({ keepFocus }) => {
      if (liveEditLock()) {
        // 实时同步模式：文本已经镜像在远程输入框里，"发送"= 补齐最后的
        // 差量后按一次回车提交，然后两边都从空白重新开始。
        if (!elements.textInput.value && !state.liveSyncBase) return; // 空内容不发裸回车
        if (!state.liveSyncBaseValid) {
          showToast('同步基准已失效：请先点"取回网页文本"重新对齐，再发送。', 'warn', 3200);
          return;
        }
        try {
          await flushLiveSync();
          // 补差量失败会使基准失效（内部已提示）；此时中止发送，本地文本
          // 原样保留——绝不清掉用户唯一的完整副本再提交陈旧内容。
          if (!state.liveSyncBaseValid || state.liveSyncBase !== elements.textInput.value) {
            showToast('实时同步未完成，已取消发送（文字仍在本地输入框里）。', 'warn', 3200);
            return;
          }
          // 提交期间冻结同步（置基准无效 + 自增代 + 清防抖定时器）：防止用户
          // 在发送瞬间继续打字，让那次差量与下面的回车/取回在网线上交错。
          state.liveSyncBaseValid = false;
          liveSyncGeneration += 1;
          clearTimeout(liveSyncTimer);
          await request('key', { key: 'Enter' });
          // 回车对聊天框是"提交并清空"，对多行文本域只是"插入换行"——无法
          // 预判。发送后重新取回一次让本地与基准对齐到真实内容：聊天框会
          // 变空、文本域会留着刚才的文字（用户看得见、不会误以为已发走而
          // 丢稿）。取不回就保守失效，不擅自清空本地。
          const after = await request('pullEditableText', {}, 15000).catch(() => null);
          if (after?.ok && !after.truncated) {
            await request('selectAll');
            await request('key', { key: 'ArrowRight' });
            const text = String(after.text || '');
            elements.textInput.value = text;
            state.liveSyncBase = text;
            state.liveSyncBaseValid = true;
            state.liveSyncWholeField = true;
          } else {
            state.liveSyncBaseValid = false;
            state.liveSyncWholeField = false;
          }
          if (keepFocus) elements.textInput.focus();
          markVisualDemand('text', 500);
        } catch (error) {
          showToast(error.message, 'error', 3500);
        }
        return;
      }
      const text = elements.textInput.value;
      if (!text) return;
      try {
        await request('text', { text });
        elements.textInput.value = '';
        // 点"发送"按钮时不再强制拉回焦点：focus() 会把手机系统输入法
        // 重新弹出来。用回车发送（焦点本就在输入框里）时保持焦点，
        // 方便连续输入。
        if (keepFocus) elements.textInput.focus();
        markVisualDemand('text', 500);
      } catch (error) {
        showToast(error.message, 'error', 3500);
      }
    };
    $('sendTextButton').addEventListener('click', () => sendKeyboardText({ keepFocus: false }));
    elements.textInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendKeyboardText({ keepFocus: true });
      }
    });
    // 退格/方向键支持按住连发（先 380ms 再每 70ms），且 pointerdown 上
    // preventDefault 阻止按钮抢焦点——焦点留在本地文本框里，手机输入法
    // 不会因为按退格而收起。其余按键保持单击语义。
    const repeatableKeys = new Set(['Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
    // 实时同步下的统一拦截：这些操作会移动远程光标/选区、破坏差量基准。
    const blockedByLiveSync = (hint) => {
      if (!liveEditLock()) return false;
      showToast(`实时同步开启中：${hint}`, 'info', 2800);
      return true;
    };
    document.querySelectorAll('[data-key]').forEach((button) => {
      const key = button.dataset.key;
      const sendOnce = () => {
        if (repeatableKeys.has(key) && blockedByLiveSync('请直接在下方文本框里编辑，改动会自动同步到网页。')) return;
        request('key', { key }).catch((error) => showToast(error.message, 'error'));
        markVisualDemand(`key-${key}`, 500);
        // 回车会提交表单（远程输入框随之清空）、Tab 会移走远程焦点：
        // 实时同步的差量基准就此作废，要求重新取回后再继续。
        if ((key === 'Enter' || key === 'Tab') && liveEditLock()) {
          invalidateLiveSyncBase('按下回车/Tab 后远程输入框状态已变化，实时同步已暂停：点"取回网页文本"重新对齐。');
        }
      };
      if (!repeatableKeys.has(key)) {
        button.addEventListener('click', sendOnce);
        return;
      }
      let holdTimer = null;
      let repeatTimer = null;
      let lastPointerActivityAt = 0;
      const stopRepeat = () => {
        // 抬手时间也要盖章：长按超过抑制窗口后浏览器仍会补发一个 click，
        // 只按 pointerdown 计时会让那次 click 多发一个按键。
        lastPointerActivityAt = Date.now();
        clearTimeout(holdTimer);
        holdTimer = null;
        clearTimeout(repeatTimer);
        repeatTimer = null;
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        stopRepeat();
        lastPointerActivityAt = Date.now();
        sendOnce();
        if (liveEditLock()) return; // 锁定时只提示一次，不启动连发
        // 连发用带抖动的节奏（58-88ms），不是精确等间隔的机器时序。
        const repeatTick = () => {
          sendOnce();
          repeatTimer = setTimeout(repeatTick, 58 + Math.floor(Math.random() * 31));
        };
        holdTimer = setTimeout(() => { repeatTick(); }, 380);
      });
      button.addEventListener('pointerup', stopRepeat);
      button.addEventListener('pointercancel', stopRepeat);
      button.addEventListener('pointerleave', stopRepeat);
      button.addEventListener('contextmenu', (event) => event.preventDefault());
      // pointerdown 已经发过一次；部分浏览器 preventDefault 后仍派发 click，
      // 忽略它避免双发。指针派生的 click 带 detail>=1，键盘/无障碍激活的
      // click 带 detail===0——后者始终放行（不受抑制窗口影响，也不会被一次
      // 触摸的时间戳误伤），前者在抑制窗口内忽略。
      button.addEventListener('click', (event) => {
        if (event.detail !== 0 && Date.now() - lastPointerActivityAt < 800) return;
        sendOnce();
      });
    });
    $('selectAllButton').addEventListener('click', () => {
      if (blockedByLiveSync('全选会破坏同步基准，请在下方文本框里编辑。')) return;
      request('selectAll').catch((error) => showToast(error.message, 'error'));
    });
    $('pasteButton').addEventListener('click', async () => {
      if (blockedByLiveSync('请把内容粘贴到下方文本框，会自动同步到网页。')) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text) throw new Error('剪贴板为空');
        await request('text', { text });
        markVisualDemand('paste', 500);
      } catch (error) {
        showToast(`读取剪贴板失败：${error.message}`, 'warn', 3500);
      }
    });

    // 电脑剪贴板桥：读取与写入都只在用户点击的那一刻发生一次（CLIP-001）。
    // 明文 HTTP 下 navigator.clipboard 可能不可用，因此“复制到手机”提供
    // 选中文本 + execCommand 兜底，最差情况下用户也能长按文本框手动复制。
    $('clipboardBridgeButton').addEventListener('click', () => {
      setOverlay('clipboardOverlay', true);
    });
    $('clipboardReadButton').addEventListener('click', async () => {
      const status = $('clipboardStatus');
      status.textContent = '正在读取电脑剪贴板…';
      try {
        const result = await request('clipboardGet', {}, 15000);
        $('clipboardText').value = result.text || '';
        status.textContent = result.chars
          ? `已读取 ${result.chars} 个字符。可长按选择复制，或点“复制到手机”。`
          : '电脑剪贴板当前为空。';
      } catch (error) {
        status.textContent = `读取失败：${error.message}`;
      }
    });
    $('clipboardCopyButton').addEventListener('click', async () => {
      const textarea = $('clipboardText');
      const value = textarea.value;
      if (!value) {
        showToast('没有可复制的内容，先点“从电脑读取”。', 'warn', 2500);
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          textarea.focus();
          textarea.select();
          if (!document.execCommand('copy')) throw new Error('浏览器不允许写入剪贴板');
        }
        showToast('已复制到手机剪贴板。', 'info', 2000);
      } catch (error) {
        textarea.focus();
        textarea.select();
        showToast(`自动复制失败（${error.message}）。文本已选中，请长按后选择“复制”。`, 'warn', 4200);
      }
    });
    $('clipboardWriteButton').addEventListener('click', async () => {
      const status = $('clipboardStatus');
      const value = $('clipboardText').value;
      if (!value) {
        showToast('文本框为空，先粘贴要发送的内容。', 'warn', 2500);
        return;
      }
      // 服务端 WebSocket 单条消息有字节上限；多字节文本（中文/表情）按
      // 字节预检，超限时给出明确提示而不是让连接被底层直接断开。
      const encodedBytes = new TextEncoder().encode(value).length;
      if (encodedBytes > 6 * 1024 * 1024) {
        showToast('文本过大（超过 6 MB），请分段发送。', 'error', 4000);
        status.textContent = '文本过大，未发送。';
        return;
      }
      status.textContent = '正在写入电脑剪贴板…';
      try {
        const result = await request('clipboardSet', { text: value }, 15000);
        status.textContent = `已写入电脑剪贴板（${result.chars} 个字符），可在电脑上直接粘贴。`;
      } catch (error) {
        status.textContent = `写入失败：${error.message}`;
      }
    });

    $('displayButton').addEventListener('click', () => {
      if (state.manualCompatibility.active) {
        showToast('严格人工模式保持真实桌面 Edge 环境，不切换手机设备仿真。', 'info', 3000);
        return;
      }
      state.viewport.mobile = !state.viewport.mobile;
      storageSet('edgePhoneMobileV61', String(state.viewport.mobile));
      elements.displayLabel.textContent = state.viewport.mobile ? '手机' : '桌面';
      scheduleViewport(true);
      markVisualDemand('display-mode', 900);
      showToast(state.viewport.mobile ? '已切换为手机网页布局' : `已切换为 ${state.viewport.desktopWidth}px 桌面网页布局`, 'info', 1800);
    });

    $('tabsButton').addEventListener('click', () => {
      setTabsSheetMode('tabs');
      setOverlay('tabsOverlay', true);
      Promise.all([request('tabs'), request('reloadState')]).catch((error) => showToast(error.message, 'error'));
    });
    elements.tabsModeButton.addEventListener('click', () => {
      setTabsSheetMode('tabs');
      Promise.all([request('tabs'), request('reloadState')]).catch((error) => showToast(error.message, 'error'));
    });
    elements.browserHistoryModeButton.addEventListener('click', () => setTabsSheetMode('history'));
    elements.browserHistorySearchInput.addEventListener('input', scheduleBrowserHistorySearch);
    elements.browserHistorySearchInput.addEventListener('search', scheduleBrowserHistorySearch);
    elements.browserHistoryRefreshButton.addEventListener('click', () => {
      loadBrowserHistory({ reset: true }).catch((error) => showToast(`读取浏览历史失败：${error.message}`, 'error', 4500));
    });
    elements.browserHistoryMoreButton.addEventListener('click', () => {
      loadBrowserHistory({ reset: false }).catch((error) => showToast(`加载历史失败：${error.message}`, 'error', 4500));
    });
    $('newTabButton').addEventListener('click', async () => {
      try {
        await request('newTab', { url: $('newTabInput').value || 'about:blank' }, 20000);
        $('newTabInput').value = '';
        setOverlay('tabsOverlay', false);
        markVisualDemand('new-tab', 700);
      } catch (error) {
        showToast(error.message, 'error', 3500);
      }
    });
    $('newTabInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('newTabButton').click();
    });

    $('uploadButton').addEventListener('click', async () => {
      if (state.pendingChooser) {
        setOverlay('uploadOverlay', true);
        updateUploadSourceUi();
        if (state.uploadSource === 'computer' && !state.computerBrowser.roots.length) {
          loadComputerRoots().catch((error) => showToast(error.message, 'error', 4200));
        }
        return;
      }
      try {
        const result = await request('requestUpload');
        if (result?.armed) {
          const remainingSeconds = Math.max(1, Math.round(((Number(result.expiresAt) || Date.now()) - Date.now()) / 1000));
          showToast(`已按需准备文件上传：请在 ${remainingSeconds} 秒内点击网页里的上传/选择文件按钮。`, 'info', 6200);
        }
      } catch (error) {
        showToast(error.message, 'warn', 4200);
      }
    });
    elements.computerSourceButton.addEventListener('click', () => {
      setUploadSource('computer').catch((error) => showToast(error.message, 'error', 4200));
    });
    elements.phoneSourceButton.addEventListener('click', () => {
      setUploadSource('phone').catch((error) => showToast(error.message, 'error', 4200));
    });
    elements.computerRootsButton.addEventListener('click', () => {
      loadComputerRoots().catch((error) => showToast(error.message, 'error', 4200));
    });
    elements.computerParentButton.addEventListener('click', () => {
      if (state.computerBrowser.parentPath) {
        browseComputerDirectory(state.computerBrowser.parentPath).catch((error) => showToast(error.message, 'error', 4200));
      }
    });
    elements.computerRefreshButton.addEventListener('click', () => {
      const path = state.computerBrowser.currentPath;
      const task = path ? browseComputerDirectory(path) : loadComputerRoots();
      task.catch((error) => showToast(error.message, 'error', 4200));
    });
    elements.computerSortSelect.addEventListener('change', () => {
      const allowed = ['modified-desc', 'modified-asc', 'name-asc', 'name-desc', 'size-desc', 'size-asc'];
      state.computerBrowser.sort = allowed.includes(elements.computerSortSelect.value)
        ? elements.computerSortSelect.value
        : 'modified-desc';
      storageSet('edgePhoneComputerSortV64', state.computerBrowser.sort);
      if (state.computerBrowser.currentPath) {
        browseComputerDirectory(state.computerBrowser.currentPath).catch((error) => showToast(error.message, 'error', 4200));
      }
    });
    elements.computerClearSelectionButton.addEventListener('click', () => {
      state.computerBrowser.selected.clear();
      renderComputerBrowser();
    });
    elements.computerSelectFolderButton.addEventListener('click', selectCurrentComputerFolder);
    elements.phoneFiles.addEventListener('change', renderSelectedFiles);
    elements.startUploadButton.addEventListener('click', () => {
      if (state.uploadSource === 'computer') commitComputerSelection();
      else uploadSelectedFiles();
    });
    elements.cancelUploadButton.addEventListener('click', async () => {
      if (state.uploading && state.uploadSource === 'phone') {
        state.uploadAbort = true;
        elements.cancelUploadButton.textContent = '正在取消…';
        elements.uploadStatus.textContent = '正在停止上传…';
        return;
      }
      if (state.uploading) return;
      await dismissUploadOverlay({ notifyServer: true });
    });

    $('dialogCancelButton').addEventListener('click', () => {
      request('dialog', { accept: false }).catch(() => {});
      setOverlay('dialogOverlay', false);
    });
    $('dialogAcceptButton').addEventListener('click', () => {
      request('dialog', { accept: true, promptText: elements.dialogPromptInput.value }).catch((error) => showToast(error.message, 'error'));
      setOverlay('dialogOverlay', false);
    });

    $('settingsButton').addEventListener('click', () => {
      setOverlay('settingsOverlay', true);
      updateDiagnosticsText(true);
      // v6.7: opening settings must not execute JavaScript in ChatGPT/Claude.
      // Environment inspection only runs after the explicit audit button below.
    });
    $('emptyDiagnosticsButton').addEventListener('click', () => {
      setOverlay('settingsOverlay', true);
      updateDiagnosticsText(true);
    });
    $('emptyRecoverButton').addEventListener('click', () => recoverFrame(true));
    elements.emptyReconnectButton.addEventListener('click', () => {
      elements.emptyReconnectButton.hidden = true;
      reconnectNow();
    });
    $('snapshotButton').addEventListener('click', () => recoverFrame(false));
    $('restartStreamButton').addEventListener('click', () => recoverFrame(true));
    $('syncViewportButton').addEventListener('click', () => {
      setOverlay('settingsOverlay', false);
      forceViewportSync('manual-size-sync');
      showToast('正在重新匹配手机可用高度与 Edge 页面尺寸…', 'info', 2200);
    });
    $('reconnectButton').addEventListener('click', reconnectNow);
    elements.roleBadge.addEventListener('click', () => {
      if (state.role === 'viewer') claimControl();
    });
    elements.claimControlButton.addEventListener('click', claimControl);

    [elements.offsetXRange, elements.offsetYRange, elements.scaleXRange, elements.scaleYRange].forEach((range) => {
      range.addEventListener('input', persistCalibration);
    });
    const setCalibrationStep = (value) => {
      state.calibrationStep = clamp(Number(value) || 0.25, 0.1, 1);
      storageSet('edgePhoneCalibrationStepV66', String(state.calibrationStep));
      updateCalibrationUi();
    };
    elements.calibrationStepSelect.addEventListener('change', () => setCalibrationStep(elements.calibrationStepSelect.value));
    elements.fsCalibrationStepSelect.addEventListener('change', () => setCalibrationStep(elements.fsCalibrationStepSelect.value));
    document.querySelectorAll('[data-calibration-nudge]').forEach((button) => {
      button.addEventListener('click', () => {
        const [x, y] = String(button.dataset.calibrationNudge || '0,0').split(',').map(Number);
        applyCalibrationNudge(x, y);
      });
    });
    elements.copyCalibrationProfileButton.addEventListener('click', () => {
      const targetKey = counterpartCalibrationProfileKey(state.calibrationProfileKey);
      copyCalibrationProfile(state.calibrationProfileKey, targetKey);
      showToast(`已复制到 ${calibrationProfileLabelFor(targetKey)}`, 'ok', 2200);
    });
    elements.resetCalibrationButton.addEventListener('click', () => {
      resetCurrentCalibration();
      showToast(`已重置 ${calibrationProfileLabelFor(state.calibrationProfileKey)}`, 'ok', 2000);
    });
    elements.resetAllCalibrationButton.addEventListener('click', () => {
      resetAllCalibrations();
      showToast('普通/全屏、横屏/竖屏四套校准都已重置', 'ok', 2600);
    });
    const toggleCalibrationTest = () => {
      if (state.calibrationTestMode) stopCalibrationTest();
      else startCalibrationTest();
    };
    elements.calibrationTestButton.addEventListener('click', toggleCalibrationTest);
    $('calibrationCenterButton').addEventListener('click', toggleCalibrationTest);
    elements.quickCalibrationButton.addEventListener('click', () => startAutoCalibration('offset'));
    elements.autoCalibrationButton.addEventListener('click', () => startAutoCalibration('precision'));
    elements.cancelCalibrationButton.addEventListener('click', () => {
      if (state.calibrationTestMode) stopCalibrationTest();
      else cancelAutoCalibration();
    });
    elements.fullscreenButton.addEventListener('click', toggleFullscreen);

    bindFullscreenDockDrag();
    elements.fsBackButton.addEventListener('click', () => { elements.backButton.click(); scheduleFullscreenDockCollapse(); });
    elements.fsForwardButton.addEventListener('click', () => { elements.forwardButton.click(); scheduleFullscreenDockCollapse(); });
    elements.fsReloadButton.addEventListener('click', () => { $('reloadButton').click(); scheduleFullscreenDockCollapse(); });
    elements.fsTabsButton.addEventListener('click', () => { $('tabsButton').click(); closeFullscreenDock(true); });
    elements.fsKeyboardButton.addEventListener('click', () => { $('keyboardButton').click(); closeFullscreenDock(true); });
    $('fsClipboardButton').addEventListener('click', () => { setOverlay('clipboardOverlay', true); closeFullscreenDock(true); });
    elements.fsUploadButton.addEventListener('click', () => { $('uploadButton').click(); closeFullscreenDock(true); });
    elements.fsStrictInputButton.addEventListener('click', () => { toggleStrictNativeTouch().finally(() => scheduleFullscreenDockCollapse()); });
    elements.fsCalibrationButton.addEventListener('click', openFullscreenCalibrationPanel);
    elements.fsSettingsButton.addEventListener('click', () => { $('settingsButton').click(); closeFullscreenDock(true); });
    elements.fsExitButton.addEventListener('click', toggleFullscreen);
    elements.fsCalibrationCloseButton.addEventListener('click', closeFullscreenCalibrationPanel);
    elements.fsCalibrationResetButton.addEventListener('click', () => {
      resetCurrentCalibration();
      showToast(`已重置 ${calibrationProfileLabelFor(state.calibrationProfileKey)}`, 'ok', 2000);
    });
    elements.fsCalibrationCopyButton.addEventListener('click', () => {
      const sourceKey = counterpartCalibrationProfileKey(state.calibrationProfileKey);
      copyCalibrationProfile(sourceKey, state.calibrationProfileKey);
      showToast(`已从 ${calibrationProfileLabelFor(sourceKey)} 复制`, 'ok', 2200);
    });
    elements.fsCalibrationTestButton.addEventListener('click', toggleCalibrationTest);
    updateFullscreenButton();

    elements.rendererSelect.value = state.rendererPreference;
    elements.rendererSelect.addEventListener('change', () => {
      state.rendererPreference = elements.rendererSelect.value;
      storageSet('edgePhoneRendererV6', state.rendererPreference);
      state.canvasFailures = 0;
      state.imageFailures = 0;
      state.rendererActive = 'none';
      requeueCurrentFrame();
    });
    elements.gestureModeSelect.value = state.gestureMode;
    elements.gestureModeSelect.addEventListener('change', () => {
      cancelActiveGesture();
      state.gestureMode = elements.gestureModeSelect.value === 'direct' ? 'direct' : 'smart';
      storageSet('edgePhoneGestureModeV64', state.gestureMode);
      showToast(state.gestureMode === 'direct'
        ? '直接模式：原生拖动、滑块、地图、画布和网页惯性滚动更自然。'
        : '智能模式：轻点与滚轮滚动分离，可避免网页长按。', 'info', 3600);
    });
    elements.inputModeSelect.value = state.inputMode;
    elements.inputModeSelect.addEventListener('change', () => {
      state.inputMode = elements.inputModeSelect.value;
      storageSet('edgePhoneInputModeV64', state.inputMode);
    });
    elements.manualCompatibilitySelect.value = state.manualCompatibilityMode;
    elements.manualCompatibilitySelect.addEventListener('change', async () => {
      const previous = state.manualCompatibilityMode;
      const mode = ['auto', 'always', 'off'].includes(elements.manualCompatibilitySelect.value)
        ? elements.manualCompatibilitySelect.value
        : 'auto';
      state.manualCompatibilityMode = mode;
      storageSet('edgePhoneManualCompatibilityV67', mode);
      try {
        const result = await request('manualCompatibility', { mode }, 30000);
        ingestManualCompatibility(result);
        scheduleViewport(true, true, 'manual-compatibility-setting');
      } catch (error) {
        state.manualCompatibilityMode = previous;
        storageSet('edgePhoneManualCompatibilityV67', previous);
        elements.manualCompatibilitySelect.value = previous;
        showToast(error.message, 'error', 4200);
      }
    });
    elements.strictNativeTouchButton.addEventListener('click', toggleStrictNativeTouch);

    elements.refreshCompatibilityAuditButton.addEventListener('click', async () => {
      try {
        const result = await request('manualCompatibilityAudit', { force: true }, 20000);
        if (result?.compatibility) ingestManualCompatibility(result.compatibility);
        else if (result?.audit) ingestManualCompatibility({ audit: result.audit });
        showToast('已刷新当前网页环境检查', 'ok', 1800);
      } catch (error) {
        showToast(error.message, 'error', 3500);
      }
    });
    syncAdvancedControls();
    elements.mobileZoomSelect.value = String(state.mobileZoom);
    elements.mobileZoomSelect.addEventListener('change', () => {
      const zoom = [90, 100, 110, 125, 150].includes(Number(elements.mobileZoomSelect.value))
        ? Number(elements.mobileZoomSelect.value)
        : 100;
      state.mobileZoom = zoom;
      storageSet('edgePhoneMobileZoomV68', String(zoom));
      if (state.manualCompatibility?.active) {
        showToast('严格人工模式使用真实桌面窗口，缩放设置将在普通网页生效。', 'info', 2600);
        return;
      }
      scheduleViewport(true, true, 'page-zoom');
      showToast(`页面缩放已设为 ${zoom}%`, 'ok', 1800);
    });
    elements.streamPresetSelect.addEventListener('change', async () => {
      const preset = ['auto', 'economy', 'realtime', 'balanced', 'clear'].includes(elements.streamPresetSelect.value)
        ? elements.streamPresetSelect.value
        : 'auto';
      state.viewport.streamPreset = preset;
      storageSet('edgePhoneStreamPresetV64', preset);
      try {
        await request('streamPreset', { preset }, 20000);
        state.preferencesAppliedForConnection = true;
        markVisualDemand('stream-preset', 900);
      } catch (error) {
        state.preferencesAppliedForConnection = false;
        showToast(error.message, 'error', 3500);
      }
    });
    if (elements.followDesktopTabsToggle) {
      elements.followDesktopTabsToggle.checked = state.followDesktopTabs;
      elements.followDesktopTabsToggle.addEventListener('change', async () => {
        state.followDesktopTabs = Boolean(elements.followDesktopTabsToggle.checked);
        storageSet('edgePhoneFollowDesktopTabsV67', String(state.followDesktopTabs));
        try {
          const result = await request('followDesktopTabs', { enabled: state.followDesktopTabs }, 20000);
          if (result && typeof result === 'object') ingestDesktopTabFollow(result);
          showToast(state.followDesktopTabs
            ? '已开启：电脑切换标签页时，手机会自动跟随并同步该标签的浏览历史。'
            : '已关闭电脑标签页自动跟随。', 'info', 3200);
        } catch (error) {
          state.followDesktopTabs = !state.followDesktopTabs;
          elements.followDesktopTabsToggle.checked = state.followDesktopTabs;
          storageSet('edgePhoneFollowDesktopTabsV67', String(state.followDesktopTabs));
          showToast(error.message, 'error', 3500);
        }
      });
    }

    $('dedicatedWindowToggle').addEventListener('change', async () => {
      const enabled = Boolean($('dedicatedWindowToggle').checked);
      try {
        const result = await request('dedicatedWindow', { enabled }, 25000);
        if (result?.dedicatedWindow) updateDedicatedWindowUi(result.dedicatedWindow);
        showToast(enabled
          ? '已切换到手机专用窗口；电脑主窗口不受影响。'
          : '已退出专用窗口模式（窗口保留，可手动关闭）。', 'info', 3200);
      } catch (error) {
        $('dedicatedWindowToggle').checked = !enabled;
        showToast(error.message, 'error', 3500);
      }
    });
    $('closeDedicatedWindowButton').addEventListener('click', async () => {
      if (!globalThis.confirm?.('关闭专用窗口会一并关闭其中所有标签页，确定吗？')) return;
      try {
        const result = await request('dedicatedWindow', { enabled: false, close: true }, 25000);
        if (result?.dedicatedWindow) updateDedicatedWindowUi(result.dedicatedWindow);
        showToast('专用窗口及其中标签已关闭。', 'info', 2600);
      } catch (error) {
        showToast(error.message, 'error', 3500);
      }
    });

    elements.desktopWidthRange.addEventListener('input', () => {
      state.viewport.desktopWidth = clamp(Number(elements.desktopWidthRange.value) || storedDesktopWidth, 800, 2560);
      elements.desktopWidthValue.textContent = `${state.viewport.desktopWidth} px`;
    });
    elements.desktopWidthRange.addEventListener('change', () => {
      storageSet('edgePhoneDesktopWidthV61', String(state.viewport.desktopWidth));
      if (!state.viewport.mobile) {
        scheduleViewport(true);
        markVisualDemand('desktop-width', 900);
      }
    });

    elements.qualityRange.value = String(storedQuality);
    elements.qualityValue.textContent = String(storedQuality);
    elements.qualityRange.addEventListener('input', () => {
      elements.qualityValue.textContent = elements.qualityRange.value;
    });
    elements.qualityRange.addEventListener('change', async () => {
      const quality = Number(elements.qualityRange.value);
      storageSet('edgePhoneQualityV6', String(quality));
      state.viewport.quality = quality;
      state.viewport.streamPreset = 'balanced';
      elements.streamPresetSelect.value = 'balanced';
      storageSet('edgePhoneStreamPresetV64', 'balanced');
      try { await request('frameQuality', { quality }, 20000); } catch (error) { showToast(error.message, 'error'); }
    });

    $('refreshDiagnosticsButton').addEventListener('click', () => updateDiagnosticsText(true));
    $('copyDiagnosticsButton').addEventListener('click', async () => {
      const content = await updateDiagnosticsText(true);
      try {
        await copyText(JSON.stringify(content, null, 2));
        showToast('诊断信息已复制', 'ok', 1800);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    $('refreshLogsButton').addEventListener('click', updateLogs);
    $('clearTokenButton').addEventListener('click', () => {
      storageRemove('edgePhoneTokenV6');
      state.token = '';
      state.manualDisconnect = true;
      try { state.ws?.close(); } catch {}
      closeAllOverlays('tokenOverlay');
      setOverlay('tokenOverlay', true);
      elements.tokenInput.value = '';
      elements.tokenInput.focus();
    });

    $('rotateTokenButton').addEventListener('click', async () => {
      if (!globalThis.confirm?.('轮换后旧令牌立即失效，其他设备需用新链接重新连接。确定吗？')) return;
      try {
        const result = await request('rotateToken', {}, 20000);
        const newToken = String(result?.token || '');
        if (!newToken) throw new Error('未收到新令牌');
        state.token = newToken;
        storageSet('edgePhoneTokenV6', newToken);
        showToast('令牌已轮换，正在用新令牌重连。', 'ok', 2600);
        connect(true);
      } catch (error) {
        showToast(`轮换令牌失败：${error.message}`, 'error', 4000);
      }
    });

    $('saveTokenButton').addEventListener('click', () => {
      const token = elements.tokenInput.value.trim();
      if (!token) {
        elements.tokenError.textContent = '请输入令牌。';
        return;
      }
      state.token = token;
      storageSet('edgePhoneTokenV6', token);
      elements.tokenError.textContent = '';
      connect(true);
    });
    elements.tokenInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') $('saveTokenButton').click();
    });

    document.querySelectorAll('[data-close]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.close === 'uploadOverlay') {
          dismissUploadOverlay({ notifyServer: true }).catch(() => {});
          return;
        }
        setOverlay(button.dataset.close, false);
      });
    });
    document.querySelectorAll('.overlay').forEach((overlay) => {
      overlay.addEventListener('pointerdown', (event) => {
        if (event.target !== overlay || overlay.id === 'tokenOverlay') return;
        if (overlay.id === 'uploadOverlay') {
          dismissUploadOverlay({ notifyServer: true, silent: true }).catch(() => {});
          return;
        }
        if (!state.uploading) overlay.hidden = true;
      });
    });
  }

  function bindStageInput() {
    elements.stage.addEventListener('pointerdown', startGesture, { passive: false });
    elements.stage.addEventListener('pointermove', moveGesture, { passive: false });
    elements.stage.addEventListener('pointerup', (event) => finishGesture(event, 'end'), { passive: false });
    elements.stage.addEventListener('pointercancel', (event) => finishGesture(event, 'cancel'), { passive: false });
    elements.stage.addEventListener('lostpointercapture', (event) => {
      if (state.gesture?.pointerId === event.pointerId) finishGesture(event, 'cancel');
    });
    elements.stage.addEventListener('contextmenu', (event) => event.preventDefault());
    elements.stage.addEventListener('wheel', (event) => {
      if (state.role !== 'controller' || !state.currentGeometry) return;
      event.preventDefault();
      const local = localPointFromEvent(event);
      const point = Geometry.mapLocalPoint(local.x, local.y, state.currentGeometry, state.calibration);
      send({
        type: 'wheel', x: point.x, y: point.y, u: point.u, v: point.v,
        deltaX: event.deltaX, deltaY: event.deltaY,
        deltaU: event.deltaX / Math.max(1, state.currentGeometry.drawWidth),
        deltaV: event.deltaY / Math.max(1, state.currentGeometry.drawHeight),
        context: coordinateContextFromGeometry(state.currentGeometry)
      });
      markVisualDemand('wheel', 500);
    }, { passive: false });

    elements.canvas.addEventListener('contextlost', (event) => {
      event.preventDefault();
      state.canvasFailures += 3;
      showToast('Canvas 上下文丢失，已切换兼容渲染', 'warn', 3000);
      // 不能走 enqueueFrame：当前帧的序号必然 <= lastRenderedSequence，会被
      // 去重门槛直接丢弃，画面停留在丢失前的空白。requeueCurrentFrame 绕过
      // 去重，用图片渲染器立即重画。
      requeueCurrentFrame();
    });
  }

  function bindLifecycle() {
    let resizeTimer = null;
    const handleStageResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const rect = elements.stage.getBoundingClientRect();
        const width = Math.round(rect.width * 10) / 10;
        const height = Math.round(rect.height * 10) / 10;
        const changed = Math.abs(width - state.lastStageRenderWidth) >= 1 || Math.abs(height - state.lastStageRenderHeight) >= 1;
        if (!changed) return;
        state.lastStageRenderWidth = width;
        state.lastStageRenderHeight = height;
        ensureCalibrationProfileCurrent('stage-resize', { silent: true });
        if (state.calibrationWizard) {
          cancelAutoCalibration({ silent: true }).catch(() => {});
          showToast('校准期间画面大小发生变化，已取消本次校准。', 'warn', 2800);
        }
        if (!state.resizeSettling && !document.fullscreenElement) {
          scheduleViewport(false, false, 'stage-resize');
          scheduleStableHeightViewportSync();
        }
        if (!state.gesture) requeueCurrentFrame();
      }, 90);
    };
    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(handleStageResize);
      resizeObserver.observe(elements.stage);
    } else {
      window.addEventListener('resize', handleStageResize, { passive: true });
      window.addEventListener('orientationchange', handleStageResize, { passive: true });
    }
    window.visualViewport?.addEventListener('resize', handleStageResize, { passive: true });
    // 输入法避让：部分安卓浏览器不支持 interactive-widget=resizes-content，
    // 系统输入法会直接盖在页面底部——输入面板（含退格键）被完全挡住。
    // 用 visualViewport 算出被遮挡的高度写进 --ime-inset，让 #app 缩短、
    // 全屏模式的输入面板上移，始终浮在输入法上方。支持 resizes-content
    // 的浏览器里该值恒为 0。
    // 只监听 resize（visualViewport 的 scroll 监听是历史红线：滚动期间逐帧
    // 连发会造成尺寸同步风暴）。innerHeight - vv.height 即输入法高度；#app
    // 缩短后布局全部落回可见区，浏览器会自行把视口滚回原位，无需 offsetTop。
    // 捏合缩放（iOS Safari 无视 user-scalable=no、安卓无障碍强制缩放）也会
    // 让 vv.height 变小——那不是输入法，scale 偏离 1 时一律视为无遮挡。
    let appliedImeInset = -1;
    const updateImeInset = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const pinchZoomed = Number.isFinite(vv.scale) && Math.abs(vv.scale - 1) > 0.02;
      const inset = pinchZoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height));
      const applied = inset > 60 ? inset : 0;
      if (applied === appliedImeInset) return; // 键盘/地址栏动画期间不重复写样式
      appliedImeInset = applied;
      document.documentElement.style.setProperty('--ime-inset', `${applied}px`);
    };
    window.visualViewport?.addEventListener('resize', updateImeInset, { passive: true });
    updateImeInset();
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        ensureCalibrationProfileCurrent('orientation-change');
        settleViewport('orientation-change');
      }, 80);
    }, { passive: true });
    document.addEventListener('fullscreenchange', applyFullscreenLayout);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelActiveGesture();
        return;
      }
      clearTimeout(state.visibilityFrameTimer);
      state.visibilityFrameTimer = setTimeout(() => {
        if (!state.lastFrameRenderedAt || Date.now() - state.lastFrameRenderedAt > 2500) {
          fetchFrameFallback(true, 'visibility-resume').catch(() => {});
        }
      }, 250);
      if (!wsIsActive()) connect(false);
    });
    window.addEventListener('pageshow', (event) => {
      if (event.persisted || !state.currentFrame) fetchFrameFallback(true, 'pageshow').catch(() => {});
    });
    window.addEventListener('online', () => {
      showToast('手机网络已恢复，正在重连', 'ok', 1800);
      if (!wsIsActive()) connect(false);
    });
    window.addEventListener('offline', () => showToast('手机网络已断开', 'warn', 0));
    window.addEventListener('beforeunload', () => {
      state.manualDisconnect = true;
      clearTimeout(state.stableHeightViewportTimer);
      try { state.ws?.close(); } catch {}
      for (let index = 0; index < state.imageUrls.length; index += 1) revokeLayerUrl(index);
    });

    state.frameMonitor = setInterval(async () => {
      updateFrameBadge();
      if (!state.connected || document.hidden) return;
      if (!state.lastFrameRenderedAt && Date.now() - state.firstConnectAt > 2200) {
        fetchFrameFallback(true, 'monitor-first-frame').catch(() => {});
      } else if (state.lastServerSequence > state.lastRenderedSequence + 2 && Date.now() - state.lastFrameReceivedAt > 1300) {
        fetchFrameFallback(false, 'monitor-frame-gap').catch(() => {});
      }
      if (wsIsOpen()) {
        const started = performance.now();
        try {
          await request('ping', {}, 4000);
          state.pingMs = Math.round(performance.now() - started);
        } catch {
          state.pingMs = null;
        }
      }
    }, 5000);
  }

  function initialize() {
    elements.displayLabel.textContent = state.viewport.mobile ? '手机' : '桌面';
    updateCalibrationUi();
    bindControls();
    bindStageInput();
    bindLifecycle();
    updateRoleUi();

    if (!state.token) {
      setOverlay('tokenOverlay', true);
      elements.tokenInput.focus();
    } else {
      connect();
    }
  }

  initialize();
})();
