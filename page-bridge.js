// Runs in the page's main world so it can reach the YouTube Music player API.
// Writing video.volume directly bypasses the player's own volume state and
// loudness normalization, which makes the volume drop unexpectedly.
(() => {
  const COMMAND_EVENT = "ytm-pip:player-command";
  const STATE_EVENT = "ytm-pip:player-state";
  const VOLUME_SLIDER_SELECTORS = [
    "ytmusic-player-bar #volume-slider",
    "ytmusic-player-bar #expand-volume-slider",
  ];

  const QUEUE_ITEM_SELECTOR = "ytmusic-player-queue ytmusic-player-queue-item";
  const QUEUE_THUMBNAIL_WIDTH = 72;

  function getPlayer() {
    const player = document.getElementById("movie_player");
    return player && typeof player.setVolume === "function" ? player : null;
  }

  function syncVolumeSliders(volume) {
    VOLUME_SLIDER_SELECTORS.forEach((selector) => {
      const slider = document.querySelector(selector);
      if (slider) {
        slider.value = volume;
      }
    });
  }

  function emitState() {
    const player = getPlayer();
    if (!player) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(STATE_EVENT, {
        detail: JSON.stringify({
          currentTime: Number(player.getCurrentTime()) || 0,
          duration: Number(player.getDuration()) || 0,
          muted: Boolean(player.isMuted()),
          volume: Number(player.getVolume()) / 100,
        }),
      }),
    );
  }

  // Tracks that play back to back share one media timeline, so video.currentTime
  // keeps counting from the previous track. The player API reports the time
  // within the current track.
  function seekToSeconds(player, seconds) {
    const duration = Number(player.getDuration());
    if (!Number.isFinite(seconds) || !(duration > 0)) {
      return;
    }

    player.seekTo(Math.min(Math.max(seconds, 0), duration), true);
  }

  function seekToPercent(percent) {
    const player = getPlayer();
    if (player && Number.isFinite(percent)) {
      seekToSeconds(player, percent * Number(player.getDuration()));
    }
  }

  function seekBy(seconds) {
    const player = getPlayer();
    if (player && Number.isFinite(seconds)) {
      seekToSeconds(player, Number(player.getCurrentTime()) + seconds);
    }
  }

  function applyVolume(player, value, shouldUnmute) {
    const volume = Math.round(Math.min(Math.max(value, 0), 1) * 100);
    player.setVolume(volume);
    syncVolumeSliders(volume);

    if (shouldUnmute && volume > 0 && player.isMuted()) {
      player.unMute();
    }
  }

  function setVolume(value) {
    const player = getPlayer();
    if (!player || !Number.isFinite(value)) {
      return;
    }

    applyVolume(player, value, true);
  }

  // Relative changes read the player's current volume here so rapid key
  // repeats and wheel steps never work from a stale value.
  function changeVolume(delta) {
    const player = getPlayer();
    if (!player || !Number.isFinite(delta)) {
      return;
    }

    applyVolume(player, Number(player.getVolume()) / 100 + delta, delta > 0);
  }

  function toggleMute() {
    const player = getPlayer();
    if (!player) {
      return;
    }

    if (player.isMuted()) {
      player.unMute();
    } else {
      player.mute();
    }
  }

  // Queue thumbnails lazy-load only while the queue is on screen, so their
  // URLs are copied from the item's Polymer data into an attribute that the
  // content script can read from its isolated world.
  function annotateQueueThumbnails() {
    document.querySelectorAll(QUEUE_ITEM_SELECTOR).forEach((item) => {
      const thumbnails = (item.data || item.__data?.data)?.thumbnail?.thumbnails;
      if (!Array.isArray(thumbnails) || thumbnails.length === 0) {
        return;
      }

      const thumbnail =
        thumbnails.find((candidate) => candidate.width >= QUEUE_THUMBNAIL_WIDTH) ||
        thumbnails[thumbnails.length - 1];
      if (thumbnail?.url && item.dataset.ytmPipThumbnail !== thumbnail.url) {
        item.dataset.ytmPipThumbnail = thumbnail.url;
      }
    });
  }

  window.addEventListener(COMMAND_EVENT, (event) => {
    let command;
    try {
      command = JSON.parse(event.detail);
    } catch {
      return;
    }

    // Not a volume command, and emitting state here would schedule another
    // sync that annotates again.
    if (command?.type === "annotateQueue") {
      annotateQueueThumbnails();
      return;
    }

    switch (command?.type) {
      case "setVolume":
        setVolume(command.value);
        break;
      case "changeVolume":
        changeVolume(command.value);
        break;
      case "toggleMute":
        toggleMute();
        break;
      case "seekToPercent":
        seekToPercent(command.value);
        break;
      case "seekBy":
        seekBy(command.value);
        break;
      default:
        break;
    }

    emitState();
  });

  // Media events don't bubble, so listen in the capture phase. That also runs
  // before the content script's own listeners on the video element, so its
  // sync already sees the fresh state.
  ["durationchange", "emptied", "loadedmetadata", "seeked", "timeupdate", "volumechange"].forEach(
    (eventName) => {
      document.addEventListener(eventName, emitState, true);
    },
  );
})();
