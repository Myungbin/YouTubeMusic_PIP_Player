// YouTube Music PIP Player - Popup Script

class PopupController {
  constructor() {
    this.isYouTubeMusic = false;
    this.isInPIP = false;
    this.init();
  }

  async init() {
    await this.checkCurrentTab();
    this.render();
  }

  async checkCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
      this.isYouTubeMusic = tab.url && tab.url.includes('music.youtube.com');

      if (this.isYouTubeMusic) {
        // 현재 PIP 상태 확인
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
          this.isInPIP = response?.isInPIP || false;
        } catch (e) {
          // 컨텐츠 스크립트가 로드되지 않았을 수 있음
          this.isInPIP = false;
        }
      }
    } catch (error) {
      console.error('탭 확인 실패:', error);
    }
  }

  render() {
    const mainContent = document.getElementById('mainContent');

    if (!this.isYouTubeMusic) {
      mainContent.innerHTML = this.getNotYouTubeMusicContent();
      this.setupOpenYTMButton();
    } else {
      mainContent.innerHTML = this.getMainContent();
      this.setupPIPButton();
    }
  }

  getNotYouTubeMusicContent() {
    return `
      <div class="not-youtube-music">
        <svg viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
        <h2>YouTube Music이 필요합니다</h2>
        <p>PIP 모드를 사용하려면 먼저<br>YouTube Music 페이지를 열어주세요.</p>
        <button class="open-ytm-button" id="openYTMBtn">
          YouTube Music 열기
        </button>
      </div>
    `;
  }

  getMainContent() {
    const statusText = this.isInPIP ? 'PIP 모드 활성' : 'PIP 모드 비활성';
    const buttonText = this.isInPIP ? 'PIP 모드 종료' : 'PIP 모드 시작';
    const buttonClass = this.isInPIP ? 'pip-button close' : 'pip-button';
    const buttonIcon = this.isInPIP
      ? '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/></svg>';

    return `
      <div class="status-section">
        <div class="status-row">
          <span class="status-label">현재 상태</span>
          <div class="status-indicator">
            <span class="status-dot ${this.isInPIP ? 'active' : 'inactive'}"></span>
            <span>${statusText}</span>
          </div>
        </div>
      </div>

      <button class="${buttonClass}" id="pipBtn">
        ${buttonIcon}
        ${buttonText}
      </button>

      <div class="info-section">
        <div class="info-title">사용 방법</div>
        <div class="info-item">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span>재생/일시정지, 이전/다음 곡 조작</span>
        </div>
        <div class="info-item">
          <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>셔플 및 반복 모드 전환</span>
        </div>
        <div class="info-item">
          <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
          <span>진행바 클릭으로 원하는 위치로 이동</span>
        </div>
      </div>
    `;
  }

  setupPIPButton() {
    const pipBtn = document.getElementById('pipBtn');
    if (pipBtn) {
      pipBtn.addEventListener('click', async () => {
        await this.togglePIP();
      });
    }
  }

  setupOpenYTMButton() {
    const openBtn = document.getElementById('openYTMBtn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://music.youtube.com' });
        window.close();
      });
    }
  }

  async togglePIP() {
    if (!this.currentTab) return;

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, { action: 'togglePIP' });
      // 잠시 대기 후 상태 업데이트
      setTimeout(async () => {
        await this.checkCurrentTab();
        this.render();
      }, 300);
    } catch (error) {
      console.error('PIP 토글 실패:', error);
      // 페이지 새로고침이 필요할 수 있음
      alert('PIP 모드를 활성화하려면 YouTube Music 페이지를 새로고침해주세요.');
    }
  }
}

// 팝업 초기화
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

