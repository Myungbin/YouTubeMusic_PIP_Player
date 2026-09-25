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
          muted: Boolean(player.isMuted()),
          volume: Number(player.getVolume()) / 100,
        }),
      }),
    );
  }

  function setVolume(value) {
    const player = getPlayer();
    if (!player || !Number.isFinite(value)) {
      return;
    }

    const volume = Math.round(Math.min(Math.max(value, 0), 1) * 100);
    player.setVolume(volume);
    syncVolumeSliders(volume);

    if (volume > 0 && player.isMuted()) {
      player.unMute();
    }
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

  window.addEventListener(COMMAND_EVENT, (event) => {
    let command;
    try {
      command = JSON.parse(event.detail);
    } catch {
      return;
    }

    switch (command?.type) {
      case "setVolume":
        setVolume(command.value);
        break;
      case "toggleMute":
        toggleMute();
        break;
      default:
        break;
    }

    emitState();
  });

  // volumechange doesn't bubble, so listen in the capture phase.
  document.addEventListener("volumechange", emitState, true);
})();
