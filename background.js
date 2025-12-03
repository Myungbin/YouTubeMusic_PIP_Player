// YouTube Music PIP Player - Background Service Worker

// 확장 프로그램 설치 시 실행
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Music PIP Player가 설치되었습니다.');
});

// 아이콘 클릭 시 실행 (팝업이 없을 때 사용)
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && tab.url.includes('music.youtube.com')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'togglePIP' });
    } catch (error) {
      console.error('메시지 전송 실패:', error);
    }
  } else {
    // YouTube Music이 아닌 경우 새 탭에서 열기
    chrome.tabs.create({ url: 'https://music.youtube.com' });
  }
});

// 키보드 단축키 처리 (추후 추가 가능)
chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === 'toggle-pip') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('music.youtube.com')) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'togglePIP' });
      } catch (error) {
        console.error('PIP 토글 실패:', error);
      }
    }
  }
});

