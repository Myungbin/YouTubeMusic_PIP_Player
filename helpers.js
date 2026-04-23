(function bootstrapSharedHelpers(root, factory) {
  const api = factory();

  root.YouTubeMusicPIPShared = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  const ERROR_MESSAGES = {
    "player-not-ready": "YouTube Music 플레이어를 아직 찾지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.",
    "page-reload-required": "현재 탭에 확장 스크립트가 연결되지 않았습니다. YouTube Music 탭을 새로고침해 주세요.",
    "user-gesture-required": "브라우저가 이번 요청을 사용자 제스처로 인정하지 않았습니다. 페이지 안 PIP 버튼을 한 번 눌러 주세요.",
    "pip-not-supported": "이 브라우저에서는 Document Picture-in-Picture를 사용할 수 없습니다. video PIP 폴백을 시도해 주세요.",
    "video-pip-not-supported": "현재 환경에서는 video Picture-in-Picture를 사용할 수 없습니다.",
    "pip-open-failed": "PIP 창을 열지 못했습니다. 재생이 시작된 상태인지 확인해 주세요.",
    unknown: "상태를 확인하는 중 문제가 발생했습니다.",
  };

  function clamp(value, min, max) {
    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      return min;
    }

    return Math.min(max, Math.max(min, numericValue));
  }

  function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  function normalizeArtworkUrl(url) {
    if (!url) {
      return "";
    }

    return url
      .replace(/=w\d+-h\d+(-[a-z0-9-]+)?/gi, "=w226-h226")
      .replace(/w\d+-h\d+/gi, "w226-h226");
  }

  function getVolumeIconMarkup(volume, muted) {
    if (muted || volume === 0) {
      return '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    }

    if (volume < 0.5) {
      return '<path d="M7 9v6h4l5 5V4l-5 5H7z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    }

    return '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
  }

  function getModeLabel(pipMode) {
    switch (pipMode) {
      case "document":
        return "Document PiP 활성";
      case "video":
        return "Video PiP 폴백 활성";
      default:
        return "PIP 비활성";
    }
  }

  function getModeDescription(pipMode) {
    switch (pipMode) {
      case "document":
        return "커스텀 컨트롤이 포함된 Document PiP 창이 열려 있습니다.";
      case "video":
        return "브라우저 기본 video PiP 폴백이 활성화되어 있습니다.";
      default:
        return "PIP 창이 열려 있지 않습니다.";
    }
  }

  function getToggleButtonText(pipMode) {
    return pipMode === "off" ? "PIP 모드 시작" : "PIP 모드 종료";
  }

  function getErrorMessage(lastError) {
    if (!lastError) {
      return "";
    }

    if (typeof lastError === "string") {
      return ERROR_MESSAGES[lastError] || lastError;
    }

    return (
      ERROR_MESSAGES[lastError.code] ||
      lastError.message ||
      ERROR_MESSAGES.unknown
    );
  }

  function serializeError(error, fallbackCode) {
    if (!error) {
      return { code: fallbackCode || "unknown" };
    }

    return {
      code: error.code || fallbackCode || "unknown",
      message: error.message || "",
    };
  }

  function createStatusSnapshot(partialStatus) {
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
  }

  return {
    clamp,
    createStatusSnapshot,
    formatTime,
    getErrorMessage,
    getModeDescription,
    getModeLabel,
    getToggleButtonText,
    getVolumeIconMarkup,
    normalizeArtworkUrl,
    serializeError,
  };
});
