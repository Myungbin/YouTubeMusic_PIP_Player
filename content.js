const contentShared = globalThis.YouTubeMusicPIPShared || {};
const clamp = contentShared.clamp || ((value) => value);
const createStatusSnapshot =
  contentShared.createStatusSnapshot ||
  function fallbackCreateStatusSnapshot(partialStatus) {
    return Object.assign(
      {
        pipMode: "off",
        lastError: null,
        isReady: false,
        canUseDocumentPip: false,
        canUseVideoPip: false,
      },
      partialStatus || {},
    );
  };
const formatTime =
  contentShared.formatTime || function fallbackFormatTime() {
    return "0:00";
  };
const getVolumeIconMarkup =
  contentShared.getVolumeIconMarkup ||
  function fallbackGetVolumeIconMarkup() {
    return "";
  };
const normalizeArtworkUrl =
  contentShared.normalizeArtworkUrl || function fallbackNormalizeArtworkUrl(url) {
    return url || "";
  };
const serializeError =
  contentShared.serializeError || function fallbackSerializeError(error, code) {
    return { code, message: error?.message || "" };
  };

const PAGE_BUTTON_CLASS = "ytm-pip-button";
const PIP_OPEN_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>';
const PLAY_ICON_PATH = '<path d="M8 5v14l11-7z"></path>';
const PAUSE_ICON_PATH = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path>';
const ACTIVE_CONTROL_CLASS_NAMES = [
  "style-default-active",
  "active",
];

// Shared with page-bridge.js, which drives the player API in the main world.
const PLAYER_COMMAND_EVENT = "ytm-pip:player-command";
const PLAYER_STATE_EVENT = "ytm-pip:player-state";

const SELECTORS = {
  albumArt: "img.image",
  artist: ".byline",
  next: ".next-button",
  playPause: "#play-pause-button",
  playerBar: "ytmusic-player-bar",
  previous: ".previous-button",
  queueArtist: ".byline",
  // Alternate song/video versions of a queue item are rendered but hidden.
  queueCounterpart: "#counterpart-renderer",
  queueDuration: ".duration",
  queueItem: "ytmusic-player-queue ytmusic-player-queue-item",
  queuePlayButton: "ytmusic-play-button-renderer",
  queueThumbnail: "img",
  queueTitle: ".song-title",
  repeat: ".repeat",
  rightControls: ".right-controls-buttons",
  shuffle: ".shuffle",
  title: ".title",
  video: "video",
};

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.05;
// One mouse wheel notch; smaller trackpad deltas are accumulated up to this.
const WHEEL_STEP_DELTA = 100;
const WHEEL_LINE_HEIGHT = 33;

// Keyed by event.code so shortcuts keep working with a Korean keyboard layout.
const PIP_SHORTCUTS = {
  ArrowDown: ["changeVolume", -VOLUME_STEP],
  ArrowLeft: ["seekBy", -SEEK_STEP_SECONDS],
  ArrowRight: ["seekBy", SEEK_STEP_SECONDS],
  ArrowUp: ["changeVolume", VOLUME_STEP],
  KeyM: ["toggleMute"],
  KeyN: ["nextTrack"],
  KeyP: ["previousTrack"],
  Space: ["togglePlayPause"],
};

class PlayerPageAdapter {
  constructor() {
    this.playerVolumeState = null;
    this.onPlayerStateChange = null;

    window.addEventListener(PLAYER_STATE_EVENT, (event) => {
      try {
        this.playerVolumeState = JSON.parse(event.detail);
      } catch {
        return;
      }

      this.onPlayerStateChange?.();
    });
  }

  sendPlayerCommand(type, value) {
    window.dispatchEvent(
      new CustomEvent(PLAYER_COMMAND_EVENT, {
        detail: JSON.stringify({ type, value }),
      }),
    );
  }

  requestPlayerState() {
    this.sendPlayerCommand("requestState");
  }

  getPlayerBar() {
    return document.querySelector(SELECTORS.playerBar);
  }

  getVideo() {
    return document.querySelector(SELECTORS.video);
  }

  queryPlayer(selector) {
    const playerBar = this.getPlayerBar();
    return playerBar ? playerBar.querySelector(selector) : null;
  }

  getRightControls() {
    return this.queryPlayer(SELECTORS.rightControls);
  }

  readText(selector, fallbackText) {
    const text = this.queryPlayer(selector)?.textContent?.trim();
    return text || fallbackText;
  }

  getTrackSnapshot() {
    const albumArt = this.queryPlayer(SELECTORS.albumArt);

    return {
      albumArtUrl: normalizeArtworkUrl(albumArt?.src || ""),
      artist: this.readText(SELECTORS.artist, "아티스트 정보 없음"),
      title: this.readText(SELECTORS.title, "재생 중인 곡 없음"),
    };
  }

  readToggleState(button) {
    if (!button) {
      return false;
    }

    const ariaPressed = button.getAttribute("aria-pressed");
    if (ariaPressed === "true") {
      return true;
    }

    if (ariaPressed === "false") {
      return false;
    }

    return (
      button.hasAttribute("active") ||
      button.hasAttribute("selected") ||
      ACTIVE_CONTROL_CLASS_NAMES.some((className) =>
        button.classList.contains(className),
      )
    );
  }

  getPlaybackSnapshot() {
    const video = this.getVideo();
    const duration = Number.isFinite(video?.duration) ? video.duration : 0;
    const currentTime = Number.isFinite(video?.currentTime) ? video.currentTime : 0;
    const percent = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
    // video.volume includes loudness normalization, so prefer the player's own
    // volume, which matches YouTube Music's volume slider.
    const volumeState = this.playerVolumeState || {
      muted: Boolean(video?.muted),
      volume: Number.isFinite(video?.volume) ? video.volume : 1,
    };

    return {
      canSeek: duration > 0,
      currentTime,
      duration,
      isPlaying: Boolean(video && !video.paused),
      isReady: Boolean(this.getPlayerBar() && video),
      muted: volumeState.muted,
      percent,
      repeatActive: this.readToggleState(this.queryPlayer(SELECTORS.repeat)),
      shuffleActive: this.readToggleState(this.queryPlayer(SELECTORS.shuffle)),
      volume: volumeState.volume,
    };
  }

  getQueueItems() {
    return Array.from(document.querySelectorAll(SELECTORS.queueItem)).filter(
      (item) => !item.closest(SELECTORS.queueCounterpart),
    );
  }

  readQueueItem(item) {
    const readText = (selector) =>
      item.querySelector(selector)?.textContent?.trim() || "";
    // Thumbnails that haven't lazy-loaded yet use a data: placeholder, so
    // prefer the URL page-bridge.js copies from the item's data.
    const thumbnailUrl =
      item.dataset.ytmPipThumbnail ||
      item.querySelector(SELECTORS.queueThumbnail)?.src ||
      "";

    return {
      artist: readText(SELECTORS.queueArtist),
      duration: readText(SELECTORS.queueDuration),
      thumbnailUrl: thumbnailUrl.startsWith("http") ? thumbnailUrl : "",
      title: readText(SELECTORS.queueTitle),
    };
  }

  getQueueSnapshot(includeItems) {
    if (includeItems) {
      // Handled synchronously by page-bridge.js before the items are read.
      this.sendPlayerCommand("annotateQueue");
    }

    const items = this.getQueueItems();
    const currentIndex = items.findIndex((item) => item.hasAttribute("selected"));
    const nextItem = currentIndex >= 0 ? items[currentIndex + 1] : null;

    return {
      currentIndex,
      items: includeItems ? items.map((item) => this.readQueueItem(item)) : [],
      nextTrack: nextItem ? this.readQueueItem(nextItem) : null,
    };
  }

  playQueueItem(index) {
    const item = this.getQueueItems()[index];
    if (!item) {
      return false;
    }

    (item.querySelector(SELECTORS.queuePlayButton) || item).click();
    return true;
  }

  ensurePipButton(onClick) {
    const controls = this.getRightControls();
    if (!controls) {
      return null;
    }

    let button = controls.querySelector(`.${PAGE_BUTTON_CLASS}`);

    if (!button) {
      button = document.createElement("button");
      button.className = PAGE_BUTTON_CLASS;
      button.type = "button";
      button.title = "Picture-in-Picture 모드 시작";
      button.setAttribute("aria-label", "Picture-in-Picture 모드 시작");
      button.setAttribute("aria-pressed", "false");
      button.innerHTML = PIP_OPEN_ICON;
      button.addEventListener("click", onClick);
    }

    if (button.parentElement !== controls) {
      controls.insertBefore(button, controls.firstChild);
    }

    return button;
  }

  updatePipButtonState(pipMode) {
    const button = document.querySelector(`.${PAGE_BUTTON_CLASS}`);
    if (!button) {
      return;
    }

    const isActive = pipMode !== "off";
    const label = isActive
      ? "Picture-in-Picture 모드 종료"
      : "Picture-in-Picture 모드 시작";

    button.classList.toggle("active", isActive);
    button.title = label;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(isActive));
  }

  click(selector) {
    const button = this.queryPlayer(selector);
    if (!button) {
      return false;
    }

    button.click();
    return true;
  }

  togglePlayPause() {
    return this.click(SELECTORS.playPause);
  }

  previousTrack() {
    return this.click(SELECTORS.previous);
  }

  nextTrack() {
    return this.click(SELECTORS.next);
  }

  toggleShuffle() {
    return this.click(SELECTORS.shuffle);
  }

  toggleRepeat() {
    return this.click(SELECTORS.repeat);
  }

  seekTo(percent) {
    const video = this.getVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return false;
    }

    video.currentTime = clamp(percent, 0, 1) * video.duration;
    return true;
  }

  seekBy(seconds) {
    const video = this.getVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return false;
    }

    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);
    return true;
  }

  changeVolume(delta) {
    if (!this.getVideo()) {
      return false;
    }

    this.sendPlayerCommand("changeVolume", delta);
    return true;
  }

  setVolume(value) {
    if (!this.getVideo()) {
      return false;
    }

    this.sendPlayerCommand("setVolume", clamp(value, 0, 1));
    return true;
  }

  toggleMute() {
    if (!this.getVideo()) {
      return false;
    }

    this.sendPlayerCommand("toggleMute");
    return true;
  }
}

class PipView {
  constructor() {
    this.pipWindow = null;
    this.onAction = null;
    this.onClose = null;
    this.boundResizeHandler = null;
    this.queueOpen = false;
    this.queueSignature = "";
    this.wheelDelta = 0;
  }

  isOpen() {
    return Boolean(this.pipWindow && !this.pipWindow.closed);
  }

  isQueueOpen() {
    return this.isOpen() && this.queueOpen;
  }

  async open(onAction, onClose) {
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      disallowReturnToOpener: true,
      width: 480,
      height: 320,
      preferInitialWindowPlacement: true,
    });

    this.attach(pipWindow, onAction, onClose);
    return pipWindow;
  }

  attach(pipWindow, onAction, onClose) {
    this.pipWindow = pipWindow;
    this.onAction = onAction;
    this.onClose = onClose;
    this.queueOpen = false;
    this.queueSignature = "";
    this.wheelDelta = 0;

    const pipDocument = pipWindow.document;
    pipDocument.head.innerHTML = "";
    pipDocument.body.innerHTML = "";
    pipDocument.title = "YouTube Music PIP";

    const styleElement = pipDocument.createElement("style");
    styleElement.textContent = this.getStyles();
    pipDocument.head.appendChild(styleElement);
    pipDocument.body.innerHTML = this.getMarkup();

    this.bindEvents(pipDocument);
    this.boundResizeHandler = () => this.updateLayout();
    pipWindow.addEventListener("resize", this.boundResizeHandler);
    this.updateLayout();

    pipWindow.addEventListener(
      "pagehide",
      () => {
        if (this.boundResizeHandler) {
          pipWindow.removeEventListener("resize", this.boundResizeHandler);
          this.boundResizeHandler = null;
        }

        this.pipWindow = null;

        if (this.onClose) {
          this.onClose();
        }
      },
      { once: true },
    );
  }

  bindEvents(pipDocument) {
    pipDocument.getElementById("playPauseBtn").addEventListener("click", () => {
      this.onAction?.("togglePlayPause");
    });

    pipDocument.getElementById("prevBtn").addEventListener("click", () => {
      this.onAction?.("previousTrack");
    });

    pipDocument.getElementById("nextBtn").addEventListener("click", () => {
      this.onAction?.("nextTrack");
    });

    pipDocument.getElementById("shuffleBtn").addEventListener("click", () => {
      this.onAction?.("toggleShuffle");
    });

    pipDocument.getElementById("repeatBtn").addEventListener("click", () => {
      this.onAction?.("toggleRepeat");
    });

    pipDocument.getElementById("closeBtn").addEventListener("click", () => {
      this.onAction?.("close");
    });

    pipDocument
      .getElementById("progressContainer")
      .addEventListener("click", (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const percent = (event.clientX - rect.left) / rect.width;
        this.onAction?.("seek", percent);
      });

    pipDocument.getElementById("volumeSlider").addEventListener("input", (event) => {
      this.onAction?.("setVolume", Number(event.target.value) / 100);
    });

    pipDocument.getElementById("volumeBtn").addEventListener("click", () => {
      this.onAction?.("toggleMute");
    });

    pipDocument.getElementById("queueBtn").addEventListener("click", () => {
      this.setQueueOpen(!this.queueOpen);
    });

    pipDocument.getElementById("queueCloseBtn").addEventListener("click", () => {
      this.setQueueOpen(false);
    });

    pipDocument.getElementById("queueList").addEventListener("click", (event) => {
      const row = event.target.closest(".queue-item");
      if (row) {
        this.onAction?.("playQueueItem", Number(row.dataset.index));
      }
    });

    pipDocument.addEventListener("keydown", (event) => this.handleKeydown(event));
    // Buttons activate on Space keyup, which would toggle playback twice.
    pipDocument.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
      }
    });
    pipDocument.addEventListener("wheel", (event) => this.handleWheel(event), {
      passive: false,
    });
  }

  handleKeydown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.code === "KeyQ") {
      event.preventDefault();
      this.setQueueOpen(!this.queueOpen);
      return;
    }

    if (event.code === "Escape" && this.queueOpen) {
      event.preventDefault();
      this.setQueueOpen(false);
      return;
    }

    const shortcut = PIP_SHORTCUTS[event.code];
    if (!shortcut) {
      return;
    }

    // Also stops the focused volume slider from handling arrow keys itself.
    event.preventDefault();
    this.onAction?.(...shortcut);
  }

  handleWheel(event) {
    // Let the queue list scroll normally.
    if (event.target.closest(".queue-panel")) {
      return;
    }

    event.preventDefault();

    const deltaY =
      event.deltaMode === 1 ? event.deltaY * WHEEL_LINE_HEIGHT : event.deltaY;
    if (deltaY === 0) {
      return;
    }

    if (Math.abs(deltaY) >= WHEEL_STEP_DELTA) {
      this.wheelDelta = 0;
      this.onAction?.("changeVolume", -Math.sign(deltaY) * VOLUME_STEP);
      return;
    }

    if (Math.sign(deltaY) !== Math.sign(this.wheelDelta)) {
      this.wheelDelta = 0;
    }

    this.wheelDelta += deltaY;
    if (Math.abs(this.wheelDelta) >= WHEEL_STEP_DELTA) {
      this.onAction?.("changeVolume", -Math.sign(this.wheelDelta) * VOLUME_STEP);
      this.wheelDelta = 0;
    }
  }

  setQueueOpen(open) {
    if (!this.isOpen() || this.queueOpen === open) {
      return;
    }

    this.queueOpen = open;
    this.queueSignature = "";

    const pipDocument = this.pipWindow.document;
    pipDocument.getElementById("queuePanel").hidden = !open;
    pipDocument.getElementById("queueBtn").classList.toggle("active", open);
    pipDocument.getElementById("queueBtn").setAttribute("aria-expanded", String(open));

    // The closed view skips reading the full queue, so ask for a fresh render.
    this.onAction?.("refresh");
  }

  renderNextTrack(pipDocument, nextTrack) {
    const nextTrackRow = pipDocument.getElementById("nextTrack");
    const nextTrackText = pipDocument.getElementById("nextTrackText");

    nextTrackRow.hidden = !nextTrack;
    if (!nextTrack) {
      return;
    }

    const label = nextTrack.artist
      ? `${nextTrack.title} · ${nextTrack.artist}`
      : nextTrack.title;
    nextTrackText.textContent = label;
    nextTrackRow.title = `다음 곡: ${label}`;
  }

  renderQueue(pipDocument, queue) {
    const signature = JSON.stringify([queue.currentIndex, queue.items]);
    if (signature === this.queueSignature) {
      return;
    }

    const isFirstRender = this.queueSignature === "";
    this.queueSignature = signature;

    const list = pipDocument.getElementById("queueList");
    const previousScrollTop = list.scrollTop;
    pipDocument.getElementById("queueEmpty").hidden = queue.items.length > 0;

    list.replaceChildren(
      ...queue.items.map((item, index) =>
        this.createQueueRow(pipDocument, item, index, index === queue.currentIndex),
      ),
    );

    const currentRow = list.querySelector(".queue-item.current");
    if (isFirstRender && currentRow) {
      currentRow.scrollIntoView({ block: "center" });
    } else {
      list.scrollTop = previousScrollTop;
    }
  }

  createQueueRow(pipDocument, item, index, isCurrent) {
    const row = pipDocument.createElement("button");
    row.className = isCurrent ? "queue-item current" : "queue-item";
    row.type = "button";
    row.dataset.index = String(index);
    row.title = item.artist ? `${item.title} · ${item.artist}` : item.title;
    if (isCurrent) {
      row.setAttribute("aria-current", "true");
    }

    const thumbnail = pipDocument.createElement("img");
    thumbnail.className = "queue-thumb";
    thumbnail.alt = "";
    if (item.thumbnailUrl) {
      thumbnail.src = item.thumbnailUrl;
    }

    const info = pipDocument.createElement("span");
    info.className = "queue-info";

    const title = pipDocument.createElement("span");
    title.className = "queue-title";
    title.textContent = item.title;

    const artist = pipDocument.createElement("span");
    artist.className = "queue-artist";
    artist.textContent = item.artist;

    const duration = pipDocument.createElement("span");
    duration.className = "queue-duration";
    duration.textContent = item.duration;

    info.append(title, artist);
    row.append(thumbnail, info, duration);
    return row;
  }

  updateLayout() {
    if (!this.isOpen()) {
      return;
    }

    const width = this.pipWindow.innerWidth;
    const height = this.pipWindow.innerHeight;
    let layout = "full";

    if (width <= 360 || height <= 220) {
      layout = "micro";
    } else if (width <= 460 || height <= 300) {
      layout = "compact";
    }

    this.pipWindow.document.body.dataset.layout = layout;
  }

  render(snapshot) {
    if (!this.isOpen()) {
      return;
    }

    const pipDocument = this.pipWindow.document;
    const albumArt = pipDocument.getElementById("albumArt");
    const artist = pipDocument.getElementById("trackArtist");
    const background = pipDocument.getElementById("bgLayer");
    const currentTime = pipDocument.getElementById("currentTime");
    const playIcon = pipDocument.getElementById("playIcon");
    const progressBar = pipDocument.getElementById("progressBar");
    const repeatButton = pipDocument.getElementById("repeatBtn");
    const shuffleButton = pipDocument.getElementById("shuffleBtn");
    const title = pipDocument.getElementById("trackTitle");
    const totalTime = pipDocument.getElementById("totalTime");
    const volumeControl = pipDocument.getElementById("volumeControl");
    const volumeIcon = pipDocument.getElementById("volumeIcon");
    const volumeSlider = pipDocument.getElementById("volumeSlider");

    if (snapshot.albumArtUrl) {
      albumArt.classList.remove("empty");
      albumArt.src = snapshot.albumArtUrl;
      background.style.backgroundImage = `url(${snapshot.albumArtUrl})`;
    } else {
      albumArt.classList.add("empty");
      albumArt.removeAttribute("src");
      background.style.backgroundImage = "none";
    }

    title.textContent = snapshot.title;
    title.title = snapshot.title;
    artist.textContent = snapshot.artist;
    artist.title = snapshot.artist;
    playIcon.innerHTML = snapshot.isPlaying ? PAUSE_ICON_PATH : PLAY_ICON_PATH;
    progressBar.style.width = `${Math.round(snapshot.percent * 100)}%`;
    currentTime.textContent = formatTime(snapshot.currentTime);
    totalTime.textContent = formatTime(snapshot.duration);
    shuffleButton.classList.toggle("active", snapshot.shuffleActive);
    repeatButton.classList.toggle("active", snapshot.repeatActive);
    volumeSlider.value = String(Math.round(snapshot.volume * 100));
    volumeControl.style.setProperty(
      "--volume-progress",
      `${Math.round(snapshot.volume * 100)}%`,
    );
    volumeIcon.innerHTML = getVolumeIconMarkup(snapshot.volume, snapshot.muted);

    if (snapshot.queue) {
      this.renderNextTrack(pipDocument, snapshot.queue.nextTrack);

      if (this.queueOpen) {
        this.renderQueue(pipDocument, snapshot.queue);
      }
    }
  }

  close() {
    if (!this.isOpen()) {
      this.pipWindow = null;
      return;
    }

    this.pipWindow.close();
    this.pipWindow = null;
  }

  getMarkup() {
    return `
      <div class="bg-layer" id="bgLayer"></div>
      <div class="bg-overlay"></div>
      <div class="pip-shell">
        <div class="top-actions">
          <button
            class="top-btn queue-btn"
            id="queueBtn"
            type="button"
            aria-label="재생목록"
            aria-controls="queuePanel"
            aria-expanded="false"
            title="재생목록 (Q)"
          >
            <svg viewBox="0 0 24 24">
              <path d="M3 10h11v2H3v-2zm0-4h11v2H3V6zm0 8h7v2H3v-2zm13-1v8l6-4-6-4z"></path>
            </svg>
          </button>
          <button class="top-btn close-btn" id="closeBtn" type="button" aria-label="PIP 닫기" title="PIP 닫기">
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
            </svg>
          </button>
        </div>

        <section class="queue-panel" id="queuePanel" aria-label="재생목록" hidden>
          <div class="queue-header">
            <span class="queue-heading">재생목록</span>
            <button class="top-btn" id="queueCloseBtn" type="button" aria-label="재생목록 닫기" title="재생목록 닫기 (Esc)">
              <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
              </svg>
            </button>
          </div>
          <div class="queue-list" id="queueList"></div>
          <div class="queue-empty" id="queueEmpty" hidden>재생목록이 비어 있습니다</div>
        </section>

        <div class="content">
          <div class="album-section">
            <img class="album-art" id="albumArt" alt="앨범 아트" />
            <div class="track-info">
              <div class="track-title" id="trackTitle">재생 중인 곡 없음</div>
              <div class="track-artist" id="trackArtist">아티스트 정보 없음</div>
              <div class="next-track" id="nextTrack" hidden>
                <span class="next-track-label">다음 곡</span>
                <span class="next-track-text" id="nextTrackText"></span>
              </div>
            </div>
          </div>

          <div class="progress-section">
            <div class="progress-bar-container" id="progressContainer" title="클릭해서 이동 · 5초 이동 (←/→)">
              <div class="progress-track">
                <div class="progress-bar" id="progressBar"></div>
              </div>
            </div>
            <div class="time-row">
              <div class="time-text">
                <span id="currentTime">0:00</span>
                <span>/</span>
                <span id="totalTime">0:00</span>
              </div>
              <div class="volume-control" id="volumeControl" aria-label="볼륨 조절">
                <button class="volume-btn" id="volumeBtn" type="button" aria-label="음소거 전환" title="음소거 (M) · 볼륨 (↑/↓, 휠)">
                  <svg id="volumeIcon" viewBox="0 0 24 24"></svg>
                </button>
                <div class="volume-slider-wrap">
                  <input
                    class="volume-slider"
                    id="volumeSlider"
                    type="range"
                    min="0"
                    max="100"
                    value="100"
                    aria-label="볼륨"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="controls">
            <button class="control-btn small shuffle-btn" id="shuffleBtn" type="button" aria-label="셔플">
              <svg viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"></path>
              </svg>
            </button>
            <button class="control-btn" id="prevBtn" type="button" aria-label="이전 곡" title="이전 곡 (P)">
              <svg viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"></path>
              </svg>
            </button>
            <button class="control-btn play-pause" id="playPauseBtn" type="button" aria-label="재생 또는 일시정지" title="재생/일시정지 (Space)">
              <svg id="playIcon" viewBox="0 0 24 24"></svg>
            </button>
            <button class="control-btn" id="nextBtn" type="button" aria-label="다음 곡" title="다음 곡 (N)">
              <svg viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"></path>
              </svg>
            </button>
            <button class="control-btn small repeat-btn" id="repeatBtn" type="button" aria-label="반복">
              <svg viewBox="0 0 24 24">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  getStyles() {
    return `
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        height: 100vh;
        color: #f8fafc;
        font-family: "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif;
        background: #020617;
        overflow: hidden;
        --volume-progress: 100%;
        --motion-duration: 160ms;
        --motion-easing: ease-out;
      }

      button,
      input {
        font: inherit;
      }

      .bg-layer {
        position: fixed;
        inset: -24px;
        background-size: cover;
        background-position: center;
        filter: blur(34px) saturate(1.3);
        opacity: 0.58;
        transform: scale(1.08);
        transition:
          opacity var(--motion-duration) var(--motion-easing),
          transform var(--motion-duration) var(--motion-easing);
      }

      .bg-overlay {
        position: fixed;
        inset: 0;
        background: linear-gradient(180deg, rgba(7, 8, 12, 0.18), rgba(7, 8, 12, 0.92));
      }

      .pip-shell {
        position: relative;
        height: 100%;
      }

      .content {
        position: relative;
        z-index: 1;
        height: 100%;
        padding: 16px;
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto auto;
        gap: 12px;
        transition:
          gap var(--motion-duration) var(--motion-easing),
          padding var(--motion-duration) var(--motion-easing);
      }

      .top-actions {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 2;
        display: flex;
        gap: 6px;
      }

      .top-btn {
        width: 28px;
        height: 28px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 999px;
        color: rgba(248, 250, 252, 0.76);
        background: rgba(15, 23, 42, 0.48);
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease,
          height var(--motion-duration) var(--motion-easing),
          width var(--motion-duration) var(--motion-easing);
      }

      .top-btn:hover,
      .top-btn.active {
        background: rgba(15, 23, 42, 0.68);
        color: #fff;
      }

      .top-btn:focus-visible,
      .queue-item:focus-visible {
        outline: 2px solid rgba(249, 115, 22, 0.92);
        outline-offset: 2px;
      }

      .top-btn svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
      }

      .queue-btn svg {
        width: 16px;
        height: 16px;
      }

      .queue-panel {
        position: absolute;
        inset: 0;
        z-index: 3;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        background: rgba(2, 6, 23, 0.82);
        backdrop-filter: blur(18px);
      }

      .queue-panel[hidden] {
        display: none;
      }

      .queue-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 10px 6px 14px;
      }

      .queue-heading {
        font-size: 13px;
        font-weight: 700;
      }

      .queue-list {
        min-height: 0;
        overflow-y: auto;
        padding: 0 6px 8px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.24) transparent;
      }

      .queue-empty {
        padding: 24px 14px;
        font-size: 12px;
        text-align: center;
        color: rgba(248, 250, 252, 0.6);
      }

      .queue-item {
        width: 100%;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 6px 8px;
        border: 0;
        border-radius: 8px;
        color: inherit;
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .queue-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .queue-item.current {
        background: rgba(255, 255, 255, 0.14);
      }

      .queue-thumb {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        object-fit: cover;
        background: rgba(255, 255, 255, 0.08);
      }

      .queue-thumb:not([src]) {
        visibility: hidden;
      }

      .queue-info {
        min-width: 0;
        display: grid;
        gap: 2px;
      }

      .queue-title,
      .queue-artist,
      .next-track {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .queue-title {
        font-size: 12px;
        font-weight: 600;
      }

      .queue-item.current .queue-title {
        color: #fff;
      }

      .queue-artist,
      .queue-duration {
        font-size: 11px;
        color: rgba(248, 250, 252, 0.6);
      }

      .queue-duration {
        font-variant-numeric: tabular-nums;
      }

      .next-track {
        margin-top: 2px;
        font-size: 11px;
        color: rgba(248, 250, 252, 0.56);
      }

      .next-track[hidden] {
        display: none;
      }

      .next-track-label {
        margin-right: 6px;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 600;
        color: rgba(248, 250, 252, 0.78);
        background: rgba(255, 255, 255, 0.12);
      }

      .album-section {
        min-height: 0;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 14px;
        transition:
          gap var(--motion-duration) var(--motion-easing),
          min-height var(--motion-duration) var(--motion-easing);
      }

      .album-art {
        width: clamp(64px, min(22vw, 22vh), 92px);
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        border-radius: 14px;
        object-fit: cover;
        background: linear-gradient(135deg, #1e293b, #0f172a);
        box-shadow: 0 18px 40px rgba(2, 6, 23, 0.4);
        transition:
          border-radius var(--motion-duration) var(--motion-easing),
          box-shadow var(--motion-duration) var(--motion-easing),
          width var(--motion-duration) var(--motion-easing);
      }

      .album-art.empty {
        background:
          linear-gradient(135deg, rgba(255, 23, 68, 0.42), rgba(47, 52, 61, 0.92)),
          #2f343d;
      }

      .track-info {
        min-width: 0;
        display: grid;
        gap: 6px;
        align-content: center;
        transition: gap var(--motion-duration) var(--motion-easing);
      }

      .track-title,
      .track-artist {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .track-title {
        font-size: 16px;
        font-weight: 700;
        transition: font-size var(--motion-duration) var(--motion-easing);
      }

      .track-artist {
        font-size: 13px;
        color: rgba(248, 250, 252, 0.72);
        transition:
          color var(--motion-duration) var(--motion-easing),
          font-size var(--motion-duration) var(--motion-easing);
      }

      .progress-section {
        display: grid;
        gap: 8px;
        transition:
          gap var(--motion-duration) var(--motion-easing),
          opacity var(--motion-duration) var(--motion-easing);
      }

      .progress-bar-container {
        height: 18px;
        display: flex;
        align-items: center;
        cursor: pointer;
        max-width: 100%;
        opacity: 1;
        overflow: hidden;
        transition:
          height var(--motion-duration) var(--motion-easing),
          max-width var(--motion-duration) var(--motion-easing),
          opacity var(--motion-duration) var(--motion-easing);
      }

      .progress-track {
        width: 100%;
        height: 5px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        transition: height 0.12s ease;
      }

      .progress-bar-container:hover .progress-track {
        height: 7px;
      }

      .progress-bar {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: rgba(255, 255, 255, 0.92);
        transition: width 0.15s linear;
      }

      .progress-bar-container:hover .progress-bar {
        background: #fff;
      }

      .time-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-width: 0;
        transition:
          gap var(--motion-duration) var(--motion-easing),
          min-height var(--motion-duration) var(--motion-easing);
      }

      .time-text {
        display: inline-flex;
        gap: 4px;
        max-width: 86px;
        overflow: hidden;
        font-size: 11px;
        color: rgba(248, 250, 252, 0.68);
        font-variant-numeric: tabular-nums;
        opacity: 1;
        transition:
          max-width var(--motion-duration) var(--motion-easing),
          opacity var(--motion-duration) var(--motion-easing);
      }

      .volume-control {
        display: inline-grid;
        grid-template-columns: 26px 88px;
        align-items: center;
        column-gap: 8px;
        min-width: 0;
        min-height: 36px;
        padding: 0;
        transition:
          column-gap var(--motion-duration) var(--motion-easing),
          min-height var(--motion-duration) var(--motion-easing);
      }

      .volume-slider-wrap {
        height: 26px;
        width: 88px;
        display: grid;
        align-items: center;
        transition:
          height var(--motion-duration) var(--motion-easing),
          width 0.18s ease,
          opacity 0.18s ease,
          margin 0.18s ease;
      }

      .volume-slider {
        width: 100%;
        height: 4px;
        margin: 0;
        display: block;
        border-radius: 999px;
        outline: none;
        appearance: none;
        background:
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.92) 0%,
            rgba(255, 255, 255, 0.92) var(--volume-progress),
            rgba(255, 255, 255, 0.18) var(--volume-progress),
            rgba(255, 255, 255, 0.18) 100%
          );
      }

      .volume-slider::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 999px;
        background: transparent;
      }

      .volume-slider::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        margin-top: -4px;
        border: 0;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 2px 10px rgba(2, 6, 23, 0.32);
      }

      .volume-slider::-moz-range-track {
        height: 4px;
        border: 0;
        border-radius: 999px;
        background: transparent;
      }

      .volume-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border: 0;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 2px 10px rgba(2, 6, 23, 0.32);
      }

      .volume-btn {
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 999px;
        color: rgba(248, 250, 252, 0.82);
        background: transparent;
        cursor: pointer;
        transition:
          color 0.15s ease,
          height var(--motion-duration) var(--motion-easing),
          width var(--motion-duration) var(--motion-easing);
      }

      .volume-btn:hover {
        color: #fff;
      }

      .volume-btn svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 0;
        transition:
          gap var(--motion-duration) var(--motion-easing),
          min-height var(--motion-duration) var(--motion-easing);
      }

      .control-btn {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        border: 0;
        border-radius: 999px;
        color: rgba(248, 250, 252, 0.88);
        background: transparent;
        cursor: pointer;
        box-shadow: none;
        opacity: 1;
        overflow: hidden;
        transition:
          color 0.15s ease,
          height var(--motion-duration) var(--motion-easing),
          margin var(--motion-duration) var(--motion-easing),
          opacity var(--motion-duration) var(--motion-easing),
          transform 0.1s ease,
          width var(--motion-duration) var(--motion-easing);
      }

      .control-btn svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      .control-btn.play-pause {
        width: 54px;
        height: 54px;
        background: transparent;
        color: #fff;
      }

      .control-btn.small {
        width: 36px;
        height: 36px;
        border-color: transparent;
        background: transparent;
        box-shadow: none;
        color: rgba(248, 250, 252, 0.68);
      }

      .control-btn.small.active {
        color: #fff;
        border-color: transparent;
        background: transparent;
      }

      .control-btn:hover {
        color: #fff;
      }

      .control-btn:active {
        transform: scale(0.93);
      }

      .control-btn:focus-visible {
        outline: 2px solid rgba(249, 115, 22, 0.92);
        outline-offset: 2px;
      }

      body[data-layout="compact"] .content {
        padding: 12px;
        gap: 8px;
      }

      body[data-layout="compact"] .album-section {
        gap: 10px;
        overflow: hidden;
      }

      body[data-layout="compact"] .album-art {
        width: clamp(56px, 16vw, 72px);
      }

      body[data-layout="compact"] .track-title {
        font-size: 14px;
      }

      body[data-layout="compact"] .track-artist {
        font-size: 12px;
      }

      body[data-layout="compact"] .controls {
        justify-content: center;
        gap: 6px;
      }

      body[data-layout="compact"] .control-btn {
        width: 38px;
        height: 38px;
      }

      body[data-layout="compact"] .control-btn.play-pause {
        width: 46px;
        height: 46px;
      }

      body[data-layout="compact"] .control-btn.small {
        width: 34px;
        height: 34px;
      }

      body[data-layout="micro"] .content {
        padding: 8px 12px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
      }

      body[data-layout="micro"] .top-actions {
        top: 6px;
        right: 6px;
      }

      body[data-layout="micro"] .close-btn {
        width: 24px;
        height: 24px;
      }

      /* No room for these in the single-row layout; Q still opens the queue. */
      body[data-layout="micro"] .queue-btn,
      body[data-layout="micro"] .next-track {
        display: none;
      }

      body[data-layout="micro"] .album-section {
        flex: 1;
        min-width: 0;
        min-height: 0;
        gap: 8px;
        overflow: hidden;
      }

      body[data-layout="micro"] .album-art {
        width: 36px;
        border-radius: 8px;
      }

      body[data-layout="micro"] .track-info {
        gap: 0;
      }

      body[data-layout="micro"] .track-title {
        font-size: 12px;
      }

      body[data-layout="micro"] .track-artist {
        display: none;
      }

      body[data-layout="micro"] .progress-section {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        order: 3;
        margin: 0;
        min-height: 0;
      }

      body[data-layout="micro"] .progress-bar-container,
      body[data-layout="micro"] .time-text {
        max-width: 0;
        opacity: 0;
        pointer-events: none;
      }

      body[data-layout="micro"] .progress-bar-container {
        height: 0;
      }

      body[data-layout="micro"] .time-row {
        align-items: center;
        min-height: 0;
        margin: 0;
      }

      body[data-layout="micro"] .volume-control {
        grid-template-columns: 30px;
        min-height: 30px;
        padding: 0;
        gap: 0;
      }

      body[data-layout="micro"] .volume-slider-wrap {
        width: 0;
        height: 0;
        opacity: 0;
        pointer-events: none;
      }

      body[data-layout="micro"] .volume-btn {
        width: 30px;
        height: 30px;
      }

      body[data-layout="micro"] .controls {
        flex: 0 0 auto;
        order: 2;
        justify-content: flex-start;
        gap: 2px;
        min-height: 0;
      }

      body[data-layout="micro"] .control-btn.small {
        width: 0;
        height: 0;
        border-width: 0;
        margin: 0 -2px;
        opacity: 0;
        pointer-events: none;
      }

      body[data-layout="micro"] .control-btn {
        width: 34px;
        height: 34px;
      }

      body[data-layout="micro"] .control-btn.play-pause {
        width: 40px;
        height: 40px;
      }
    `;
  }
}

class StateSync {
  constructor(pageAdapter, callbacks) {
    this.callbacks = callbacks;
    this.pageAdapter = pageAdapter;
    this.playerBar = null;
    this.rootObserver = null;
    this.safetyInterval = null;
    this.syncQueued = false;
    this.trackObserver = null;
    this.video = null;
    this.boundRootMutationHandler = this.handleRootMutations.bind(this);
    this.boundTrackMutationHandler = this.handleTrackMutations.bind(this);
    this.boundVideoEventHandler = this.handleVideoEvent.bind(this);
  }

  start() {
    this.observeRoot();
    this.refreshBindings();
    this.scheduleSync();
  }

  observeRoot() {
    if (this.rootObserver || !document.body) {
      return;
    }

    this.rootObserver = new MutationObserver(this.boundRootMutationHandler);
    this.rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  refreshBindings() {
    const nextPlayerBar = this.pageAdapter.getPlayerBar();
    if (nextPlayerBar !== this.playerBar) {
      this.playerBar = nextPlayerBar;
      this.observeTrackInfo();
      this.callbacks.onEnsureUi?.();
    }

    const nextVideo = this.pageAdapter.getVideo();
    if (nextVideo !== this.video) {
      this.unbindVideo();
      this.video = nextVideo;
      this.bindVideo();
    }
  }

  observeTrackInfo() {
    if (this.trackObserver) {
      this.trackObserver.disconnect();
      this.trackObserver = null;
    }

    if (!this.playerBar) {
      return;
    }

    this.trackObserver = new MutationObserver(this.boundTrackMutationHandler);
    this.trackObserver.observe(this.playerBar, {
      attributeFilter: ["active", "aria-pressed", "class", "src"],
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  bindVideo() {
    if (!this.video) {
      return;
    }

    [
      "durationchange",
      "emptied",
      "ended",
      "enterpictureinpicture",
      "leavepictureinpicture",
      "loadedmetadata",
      "pause",
      "play",
      "timeupdate",
      "volumechange",
    ].forEach((eventName) => {
      this.video.addEventListener(eventName, this.boundVideoEventHandler);
    });
  }

  unbindVideo() {
    if (!this.video) {
      return;
    }

    [
      "durationchange",
      "emptied",
      "ended",
      "enterpictureinpicture",
      "leavepictureinpicture",
      "loadedmetadata",
      "pause",
      "play",
      "timeupdate",
      "volumechange",
    ].forEach((eventName) => {
      this.video.removeEventListener(eventName, this.boundVideoEventHandler);
    });
  }

  handleRootMutations() {
    this.refreshBindings();
    this.scheduleSync();
  }

  handleTrackMutations() {
    this.scheduleSync();
  }

  handleVideoEvent() {
    this.scheduleSync();
  }

  scheduleSync() {
    if (this.syncQueued) {
      return;
    }

    this.syncQueued = true;

    const runSync = () => {
      this.syncQueued = false;
      this.callbacks.onSync?.();
    };

    // requestAnimationFrame doesn't fire while the Music tab is in the
    // background, which is the usual case while the PIP window is in use.
    if (document.hidden) {
      setTimeout(runSync, 16);
    } else {
      requestAnimationFrame(runSync);
    }
  }

  setSafetySyncEnabled(enabled) {
    if (enabled && !this.safetyInterval) {
      this.safetyInterval = window.setInterval(() => {
        this.callbacks.onSync?.();
      }, 4000);
      return;
    }

    if (!enabled && this.safetyInterval) {
      window.clearInterval(this.safetyInterval);
      this.safetyInterval = null;
    }
  }
}

class YouTubeMusicPIPApp {
  constructor() {
    this.pageAdapter = new PlayerPageAdapter();
    this.pipView = new PipView();
    this.state = createStatusSnapshot();
    this.stateSync = new StateSync(this.pageAdapter, {
      onEnsureUi: () => this.ensurePageButton(),
      onSync: () => this.syncState({ preserveError: true }),
    });
    this.pageAdapter.onPlayerStateChange = () => this.stateSync.scheduleSync();
  }

  start() {
    this.setupMessageListener();
    this.pageAdapter.requestPlayerState();
    this.stateSync.start();
    this.ensurePageButton();
    this.syncState({ preserveError: true });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message?.action) {
        return false;
      }

      if (message.action === "getStatus") {
        sendResponse(this.getStatus());
        return false;
      }

      if (message.action === "togglePIP") {
        this.togglePip({ source: message.source || "message" })
          .then((status) => {
            sendResponse(status);
          })
          .catch((error) => {
            sendResponse(
              this.setError(
                serializeError(error, "pip-open-failed"),
                { preserveSync: false },
              ),
            );
          });
        return true;
      }

      return false;
    });
  }

  ensurePageButton() {
    this.pageAdapter.ensurePipButton(() => {
      void this.togglePip({ source: "page-button" });
    });
    this.pageAdapter.updatePipButtonState(this.state.pipMode);
  }

  canUseDocumentPip() {
    return "documentPictureInPicture" in window;
  }

  canUseVideoPip() {
    return Boolean(document.pictureInPictureEnabled);
  }

  createSnapshot() {
    return Object.assign(
      {
        canUseDocumentPip: this.canUseDocumentPip(),
        canUseVideoPip: this.canUseVideoPip(),
        pipMode: this.state.pipMode,
        // Reading the queue DOM is only worth it while the PIP window shows it.
        queue: this.pipView.isOpen()
          ? this.pageAdapter.getQueueSnapshot(this.pipView.isQueueOpen())
          : null,
      },
      this.pageAdapter.getTrackSnapshot(),
      this.pageAdapter.getPlaybackSnapshot(),
    );
  }

  getActualPipMode() {
    if (this.pipView.isOpen()) {
      return "document";
    }

    if (document.pictureInPictureElement) {
      return "video";
    }

    return "off";
  }

  syncState(options) {
    const settings = Object.assign({ preserveError: true }, options || {});
    this.state.pipMode = this.getActualPipMode();

    const snapshot = this.createSnapshot();
    this.state.isReady = snapshot.isReady;
    this.state.canUseDocumentPip = snapshot.canUseDocumentPip;
    this.state.canUseVideoPip = snapshot.canUseVideoPip;

    if (
      this.state.lastError?.code === "player-not-ready" &&
      snapshot.isReady
    ) {
      this.state.lastError = null;
    }

    if (!settings.preserveError && this.state.pipMode !== "off") {
      this.state.lastError = null;
    }

    this.pageAdapter.updatePipButtonState(this.state.pipMode);
    this.pipView.render(snapshot);
    this.stateSync.setSafetySyncEnabled(this.state.pipMode !== "off");
  }

  getStatus() {
    this.syncState({ preserveError: true });
    return createStatusSnapshot(this.state);
  }

  setError(errorLike, options) {
    this.state.lastError = errorLike;

    const settings = Object.assign({ preserveSync: true }, options || {});
    if (settings.preserveSync) {
      this.syncState({ preserveError: true });
    }

    return this.getStatus();
  }

  clearError() {
    this.state.lastError = null;
  }

  normalizeOpenError(error, fallbackCode) {
    if (!error) {
      return { code: fallbackCode || "pip-open-failed" };
    }

    if (error.name === "NotAllowedError") {
      return { code: "user-gesture-required", message: error.message || "" };
    }

    if (error.name === "NotSupportedError") {
      return { code: "pip-not-supported", message: error.message || "" };
    }

    return serializeError(error, fallbackCode || "pip-open-failed");
  }

  handleDocumentPipClosed() {
    this.syncState({ preserveError: true });
  }

  handlePipAction(action, payload) {
    switch (action) {
      case "togglePlayPause":
        this.pageAdapter.togglePlayPause();
        break;
      case "previousTrack":
        this.pageAdapter.previousTrack();
        break;
      case "nextTrack":
        this.pageAdapter.nextTrack();
        break;
      case "toggleShuffle":
        this.pageAdapter.toggleShuffle();
        break;
      case "toggleRepeat":
        this.pageAdapter.toggleRepeat();
        break;
      case "seek":
        this.pageAdapter.seekTo(payload);
        break;
      case "seekBy":
        this.pageAdapter.seekBy(payload);
        break;
      case "changeVolume":
        this.pageAdapter.changeVolume(payload);
        break;
      case "playQueueItem":
        this.pageAdapter.playQueueItem(payload);
        break;
      case "refresh":
        this.stateSync.scheduleSync();
        break;
      case "setVolume":
        this.pageAdapter.setVolume(payload);
        break;
      case "toggleMute":
        this.pageAdapter.toggleMute();
        break;
      case "close":
        void this.closeActivePip();
        break;
      default:
        break;
    }
  }

  async openDocumentPip() {
    await this.pipView.open(
      (action, payload) => this.handlePipAction(action, payload),
      () => this.handleDocumentPipClosed(),
    );
  }

  async openVideoPip() {
    const video = this.pageAdapter.getVideo();
    if (!video) {
      throw { code: "player-not-ready" };
    }

    if (document.pictureInPictureElement && document.pictureInPictureElement !== video) {
      await document.exitPictureInPicture();
    }

    if (!document.pictureInPictureElement) {
      await video.requestPictureInPicture();
    }
  }

  async openPip() {
    this.clearError();

    const snapshot = this.createSnapshot();
    if (!snapshot.isReady) {
      return this.setError({ code: "player-not-ready" });
    }

    this.pageAdapter.requestPlayerState();

    if (this.canUseDocumentPip()) {
      try {
        await this.openDocumentPip();
        this.syncState({ preserveError: false });
        return this.getStatus();
      } catch (error) {
        const normalizedError = this.normalizeOpenError(error, "pip-open-failed");
        if (!this.canUseVideoPip()) {
          return this.setError(normalizedError);
        }
      }
    }

    if (!this.canUseVideoPip()) {
      return this.setError({ code: "video-pip-not-supported" });
    }

    try {
      await this.openVideoPip();
      this.syncState({ preserveError: false });
      return this.getStatus();
    } catch (error) {
      return this.setError(this.normalizeOpenError(error, "pip-open-failed"));
    }
  }

  async closeActivePip() {
    try {
      if (this.pipView.isOpen()) {
        this.pipView.close();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      return this.setError(this.normalizeOpenError(error, "pip-open-failed"));
    }

    this.clearError();
    this.syncState({ preserveError: false });
    return this.getStatus();
  }

  async togglePip() {
    if (this.getActualPipMode() === "off") {
      return this.openPip();
    }

    return this.closeActivePip();
  }
}

const app = new YouTubeMusicPIPApp();
app.start();
