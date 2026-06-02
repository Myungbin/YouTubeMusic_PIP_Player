const popupShared = globalThis.YouTubeMusicPIPShared || {};
const createStatusSnapshot =
  popupShared.createStatusSnapshot ||
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
const getErrorMessage =
  popupShared.getErrorMessage || function fallbackGetErrorMessage() {
    return "";
  };
const getModeDescription =
  popupShared.getModeDescription || function fallbackGetModeDescription() {
    return "";
  };
const getModeLabel =
  popupShared.getModeLabel || function fallbackGetModeLabel() {
    return "PIP 꺼짐";
  };
const getToggleButtonText =
  popupShared.getToggleButtonText || function fallbackGetToggleButtonText() {
    return "PIP 시작";
  };

const MUSIC_HOME_URL = "https://music.youtube.com/";
const OPEN_ICON_PATH =
  "M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z";
const CLOSE_ICON_PATH =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

class PopupController {
  constructor() {
    this.currentTab = null;
    this.state = createStatusSnapshot();
    this.statusPoll = null;
    this.isBusy = false;
    this.elements = {
      capabilityRow: document.getElementById("capabilityRow"),
      documentSupport: document.getElementById("documentSupport"),
      errorBanner: document.getElementById("errorBanner"),
      footerNote: document.getElementById("footerNote"),
      openButton: document.getElementById("openButton"),
      pipButton: document.getElementById("pipButton"),
      pipButtonIcon: document.getElementById("pipButtonIcon"),
      pipButtonText: document.getElementById("pipButtonText"),
      quickStatus: document.getElementById("quickStatus"),
      statusCard: document.getElementById("statusCard"),
      statusDot: document.getElementById("statusDot"),
      statusSubtext: document.getElementById("statusSubtext"),
      statusText: document.getElementById("statusText"),
      videoSupport: document.getElementById("videoSupport"),
    };
  }

  async init() {
    this.bindEvents();
    await this.refreshStatus();

    this.statusPoll = window.setInterval(() => {
      void this.refreshStatus();
    }, 1000);

    window.addEventListener(
      "unload",
      () => {
        if (this.statusPoll) {
          window.clearInterval(this.statusPoll);
          this.statusPoll = null;
        }
      },
      { once: true },
    );
  }

  bindEvents() {
    this.elements.openButton.addEventListener("click", () => {
      chrome.tabs.create({ url: MUSIC_HOME_URL });
      window.close();
    });

    this.elements.pipButton.addEventListener("click", () => {
      void this.togglePip();
    });
  }

  isYouTubeMusicTab(tab) {
    return Boolean(tab?.url && tab.url.startsWith(MUSIC_HOME_URL));
  }

  async refreshStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab || null;

      if (!this.isYouTubeMusicTab(tab)) {
        this.state = createStatusSnapshot();
        this.render();
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "getStatus",
      });

      this.state = createStatusSnapshot(response);
    } catch (error) {
      this.state = createStatusSnapshot({
        lastError: {
          code: "page-reload-required",
          message: error?.message || "",
        },
      });
    }

    this.render();
  }

  async togglePip() {
    if (!this.currentTab?.id || this.isBusy) {
      return;
    }

    this.setBusy(true);

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: "togglePIP",
        source: "popup",
      });

      this.state = createStatusSnapshot(response);
    } catch (error) {
      this.state = createStatusSnapshot({
        lastError: {
          code: "page-reload-required",
          message: error?.message || "",
        },
      });
    }

    this.setBusy(false);
    await this.refreshStatus();
  }

  setBusy(isBusy) {
    this.isBusy = isBusy;
    this.elements.pipButton.disabled = isBusy;
  }

  setCapabilityState(element, isSupported) {
    element.classList.toggle("supported", isSupported);
    element.classList.toggle("unsupported", !isSupported);
  }

  render() {
    const isMusicTab = this.isYouTubeMusicTab(this.currentTab);
    const errorMessage = isMusicTab ? getErrorMessage(this.state.lastError) : "";
    const isActive = this.state.pipMode !== "off";
    const isReady = isMusicTab && this.state.isReady;
    const iconPath = isActive ? CLOSE_ICON_PATH : OPEN_ICON_PATH;
    let statusTone = "waiting";

    if (!isMusicTab) {
      statusTone = "external";
    } else if (errorMessage) {
      statusTone = "error";
    } else if (isActive) {
      statusTone = "active";
    } else if (isReady) {
      statusTone = "ready";
    }

    this.elements.pipButton.classList.toggle("hidden", !isMusicTab);
    this.elements.openButton.classList.toggle("hidden", isMusicTab);
    this.elements.pipButton.classList.toggle("close", isActive);
    this.elements.pipButton.disabled =
      this.isBusy || (isMusicTab && !this.state.isReady && this.state.pipMode === "off");
    this.elements.pipButtonIcon.innerHTML = `<path d="${iconPath}"></path>`;
    this.elements.pipButtonText.textContent = this.isBusy
      ? "처리 중"
      : getToggleButtonText(this.state.pipMode);

    this.elements.statusCard.dataset.state = statusTone;
    this.elements.quickStatus.dataset.state = statusTone;
    this.elements.capabilityRow.classList.toggle(
      "hidden",
      !isMusicTab || Boolean(errorMessage),
    );
    this.setCapabilityState(this.elements.documentSupport, this.state.canUseDocumentPip);
    this.setCapabilityState(this.elements.videoSupport, this.state.canUseVideoPip);

    this.elements.errorBanner.classList.toggle("hidden", !errorMessage);
    this.elements.errorBanner.textContent = errorMessage;

    this.elements.statusDot.classList.toggle("active", isMusicTab && isActive);
    this.elements.statusDot.classList.toggle("ready", isReady && !isActive);
    this.elements.statusDot.classList.toggle("error", Boolean(errorMessage));
    this.elements.statusDot.classList.toggle(
      "inactive",
      !isMusicTab || (!isActive && !isReady && !errorMessage),
    );

    if (!isMusicTab) {
      this.elements.statusText.textContent = "YouTube Music 탭이 아닙니다";
      this.elements.statusSubtext.textContent =
        "음악 탭을 열면 바로 PIP를 시작할 수 있습니다.";
      this.elements.footerNote.textContent = "확장 프로그램이 현재 탭을 기준으로 동작합니다.";
      return;
    }

    this.elements.statusText.textContent = getModeLabel(this.state.pipMode);
    this.elements.footerNote.textContent = this.state.canUseDocumentPip
      ? "Document PiP 우선, 필요하면 Video PiP로 전환합니다."
      : "현재 브라우저에서는 Video PiP로 전환합니다.";

    if (errorMessage) {
      this.elements.statusSubtext.textContent = errorMessage;
      return;
    }

    if (!this.state.isReady) {
      this.elements.statusSubtext.textContent =
        "플레이어를 찾는 중입니다. 곡이 보이면 버튼이 활성화됩니다.";
      return;
    }

    if (this.state.pipMode === "off") {
      this.elements.statusSubtext.textContent = this.state.canUseDocumentPip
        ? "준비되었습니다. PIP 창을 열어 컨트롤을 분리할 수 있습니다."
        : "준비되었습니다. 브라우저 기본 Video PiP로 실행합니다.";
      return;
    }

    this.elements.statusSubtext.textContent = getModeDescription(this.state.pipMode);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const popup = new PopupController();
  void popup.init();
});
