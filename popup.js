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
    return "PIP 비활성";
  };
const getToggleButtonText =
  popupShared.getToggleButtonText || function fallbackGetToggleButtonText() {
    return "PIP 모드 시작";
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
      errorBanner: document.getElementById("errorBanner"),
      openButton: document.getElementById("openButton"),
      pipButton: document.getElementById("pipButton"),
      pipButtonIcon: document.getElementById("pipButtonIcon"),
      pipButtonText: document.getElementById("pipButtonText"),
      statusDot: document.getElementById("statusDot"),
      statusSubtext: document.getElementById("statusSubtext"),
      statusText: document.getElementById("statusText"),
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

  render() {
    const isMusicTab = this.isYouTubeMusicTab(this.currentTab);
    const errorMessage = isMusicTab ? getErrorMessage(this.state.lastError) : "";
    const isActive = this.state.pipMode !== "off";
    const iconPath = isActive ? CLOSE_ICON_PATH : OPEN_ICON_PATH;

    this.elements.pipButton.classList.toggle("hidden", !isMusicTab);
    this.elements.openButton.classList.toggle("hidden", isMusicTab);
    this.elements.pipButton.classList.toggle("close", isActive);
    this.elements.pipButton.disabled =
      this.isBusy || (isMusicTab && !this.state.isReady && this.state.pipMode === "off");
    this.elements.pipButtonIcon.innerHTML = `<path d="${iconPath}"></path>`;
    this.elements.pipButtonText.textContent = getToggleButtonText(this.state.pipMode);

    this.elements.errorBanner.classList.toggle("hidden", !errorMessage);
    this.elements.errorBanner.textContent = errorMessage;

    this.elements.statusDot.classList.toggle("active", isMusicTab && isActive);
    this.elements.statusDot.classList.toggle("inactive", !isMusicTab || !isActive);

    if (!isMusicTab) {
      this.elements.statusText.textContent = "YouTube Music 탭이 아닙니다";
      this.elements.statusSubtext.textContent =
        "PIP를 사용하려면 YouTube Music 탭을 열어 주세요.";
      return;
    }

    this.elements.statusText.textContent = getModeLabel(this.state.pipMode);

    if (errorMessage) {
      this.elements.statusSubtext.textContent = errorMessage;
      return;
    }

    if (!this.state.isReady) {
      this.elements.statusSubtext.textContent =
        "플레이어가 준비되는 중입니다. 곡 재생 화면이 보이면 다시 시도해 주세요.";
      return;
    }

    if (this.state.pipMode === "off") {
      this.elements.statusSubtext.textContent = this.state.canUseDocumentPip
        ? "Document PiP를 사용할 수 있습니다."
        : "이 환경에서는 video PiP 폴백을 사용합니다.";
      return;
    }

    this.elements.statusSubtext.textContent = getModeDescription(this.state.pipMode);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const popup = new PopupController();
  void popup.init();
});
