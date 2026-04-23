const MUSIC_HOME_URL = "https://music.youtube.com/";
const MUSIC_MATCH_PATTERN = "https://music.youtube.com/*";
const TOGGLE_PIP_ACTION = "togglePIP";

function isMusicTab(tab) {
  return Boolean(tab?.url && tab.url.startsWith(MUSIC_HOME_URL));
}

async function sendToggleMessage(tabId, source) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: TOGGLE_PIP_ACTION,
      source,
    });
  } catch (error) {
    console.error("PIP 토글 메시지 전송 실패:", error);
  }
}

async function getTargetMusicTab() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (isMusicTab(activeTab)) {
    return activeTab;
  }

  const [existingMusicTab] = await chrome.tabs.query({
    url: [MUSIC_MATCH_PATTERN],
  });

  if (existingMusicTab?.id) {
    await chrome.windows.update(existingMusicTab.windowId, { focused: true });
    return chrome.tabs.update(existingMusicTab.id, { active: true });
  }

  return chrome.tabs.create({ url: MUSIC_HOME_URL });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("YouTube Music PIP Player가 설치되었습니다.");
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pip") {
    return;
  }

  const tab = await getTargetMusicTab();
  if (!tab?.id || !isMusicTab(tab) || tab.status !== "complete") {
    return;
  }

  await sendToggleMessage(tab.id, "command");
});
