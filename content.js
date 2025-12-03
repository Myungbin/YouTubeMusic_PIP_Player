// YouTube Music PIP Player - Content Script
// Document Picture-in-Picture API를 사용하여 풍부한 UI 제공

class YouTubeMusicPIP {
  constructor() {
    this.pipWindow = null;
    this.isInPIP = false;
    this.updateInterval = null;
    this.init();
  }

  init() {
    // 페이지 로드 완료 후 버튼 추가
    this.waitForElement('ytmusic-player-bar').then(() => {
      this.addPIPButton();
      this.setupMessageListener();
    });
  }

  // 요소가 로드될 때까지 대기
  waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found`));
      }, timeout);
    });
  }

  // PIP 버튼 추가
  addPIPButton() {
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (!playerBar) return;

    // 이미 버튼이 있으면 추가하지 않음
    if (document.querySelector('.ytm-pip-button')) return;

    const rightControls = playerBar.querySelector('.right-controls-buttons');
    if (!rightControls) return;

    const pipButton = document.createElement('button');
    pipButton.className = 'ytm-pip-button';
    pipButton.title = 'Picture-in-Picture 모드';
    pipButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
      </svg>
    `;

    pipButton.addEventListener('click', () => this.togglePIP());
    rightControls.insertBefore(pipButton, rightControls.firstChild);
  }

  // 메시지 리스너 설정 (팝업에서 명령 수신)
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'togglePIP') {
        this.togglePIP();
        sendResponse({ success: true });
      } else if (message.action === 'getStatus') {
        sendResponse({ isInPIP: this.isInPIP });
      }
      return true;
    });
  }

  // PIP 토글
  async togglePIP() {
    if (this.isInPIP) {
      this.closePIP();
    } else {
      await this.openPIP();
    }
  }

  // PIP 창 열기
  async openPIP() {
    try {
      // Document Picture-in-Picture API 사용
      if ('documentPictureInPicture' in window) {
        this.pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 400,
          height: 250
        });

        this.setupPIPWindow();
        this.isInPIP = true;
        this.startUpdateLoop();

        // PIP 창 닫힘 감지
        this.pipWindow.addEventListener('pagehide', () => {
          this.isInPIP = false;
          this.stopUpdateLoop();
        });
      } else {
        // 폴백: 비디오 PIP 사용
        await this.fallbackVideoPIP();
      }
    } catch (error) {
      console.error('PIP 모드 활성화 실패:', error);
      // 폴백 시도
      await this.fallbackVideoPIP();
    }
  }

  // PIP 창 설정
  setupPIPWindow() {
    const pipDoc = this.pipWindow.document;

    // 스타일 추가
    const style = pipDoc.createElement('style');
    style.textContent = this.getPIPStyles();
    pipDoc.head.appendChild(style);

    // 폰트 추가
    const fontLink = pipDoc.createElement('link');
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap';
    fontLink.rel = 'stylesheet';
    pipDoc.head.appendChild(fontLink);

    // 컨텐츠 생성
    pipDoc.body.innerHTML = this.getPIPContent();

    // 이벤트 리스너 설정
    this.setupPIPEventListeners(pipDoc);

    // 초기 상태 업데이트
    this.updatePIPContent();
  }

  // PIP 스타일
  getPIPStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
        background: #0a0a0a;
        color: #fff;
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        user-select: none;
        position: relative;
      }

      /* 배경 이미지 레이어 */
      .bg-layer {
        position: absolute;
        top: -20px;
        left: -20px;
        right: -20px;
        bottom: -20px;
        background-size: cover;
        background-position: center;
        filter: blur(30px) saturate(1.5);
        transform: scale(1.1);
        transition: background-image 0.8s ease-in-out;
        z-index: 0;
      }

      /* 배경 오버레이 (가독성을 위한 어두운 레이어) */
      .bg-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          180deg,
          rgba(0, 0, 0, 0.4) 0%,
          rgba(0, 0, 0, 0.6) 50%,
          rgba(0, 0, 0, 0.75) 100%
        );
        z-index: 1;
      }

      .pip-container {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 16px;
      }

      .album-section {
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 1;
        min-height: 0;
      }

      .album-art {
        width: 90px;
        height: 90px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        flex-shrink: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 2px solid rgba(255, 255, 255, 0.1);
      }

      .track-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .track-title {
        font-size: 15px;
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        letter-spacing: -0.3px;
      }

      .track-artist {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .progress-section {
        margin: 12px 0;
      }

      .progress-bar-container {
        height: 4px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        overflow: hidden;
        cursor: pointer;
        transition: height 0.2s ease;
        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
      }

      .progress-bar-container:hover {
        height: 6px;
        background: rgba(255, 255, 255, 0.25);
      }

      .progress-bar {
        height: 100%;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 3px;
        width: 0%;
        transition: width 0.1s linear;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
      }

      .time-display {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 6px;
        font-variant-numeric: tabular-nums;
      }

      .time-left {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* 볼륨 컨트롤 */
      .volume-control {
        display: flex;
        align-items: center;
        gap: 6px;
        position: relative;
      }

      .volume-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        border-radius: 4px;
      }

      .volume-btn:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
      }

      .volume-btn svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .volume-slider-wrap {
        display: flex;
        align-items: center;
        width: 0;
        overflow: hidden;
        transition: width 0.3s ease;
      }

      .volume-control:hover .volume-slider-wrap {
        width: 70px;
      }

      .volume-slider {
        width: 60px;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        margin-left: 4px;
      }

      .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        transition: transform 0.15s ease;
      }

      .volume-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }

      .volume-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: #fff;
        border-radius: 50%;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      }

      .controls-section {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding-top: 8px;
      }

      .control-btn {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        color: #fff;
      }

      .control-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.2);
        transform: scale(1.08);
      }

      .control-btn:active {
        transform: scale(0.95);
      }

      .control-btn svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
      }

      .control-btn.play-pause {
        width: 56px;
        height: 56px;
        background: rgba(255, 255, 255, 0.25);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      }

      .control-btn.play-pause:hover {
        background: rgba(255, 255, 255, 0.35);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.4);
        transform: scale(1.1);
      }

      .control-btn.play-pause svg {
        width: 26px;
        height: 26px;
      }

      .control-btn.small {
        width: 36px;
        height: 36px;
      }

      .control-btn.small svg {
        width: 16px;
        height: 16px;
      }

      /* 셔플/반복은 서로 다른 색으로 구분 */
      .control-btn.small.shuffle-btn,
      .control-btn.small.repeat-btn {
        opacity: 0.8;
      }

      .control-btn.small.shuffle-btn.active {
        opacity: 1;
        color: #4ade80;
        background: rgba(74, 222, 128, 0.18);
        border-color: rgba(74, 222, 128, 0.45);
        box-shadow: 0 0 12px rgba(74, 222, 128, 0.6);
      }

      .control-btn.small.repeat-btn.active {
        opacity: 1;
        color: #facc15;
        background: rgba(250, 204, 21, 0.18);
        border-color: rgba(250, 204, 21, 0.45);
        box-shadow: 0 0 12px rgba(250, 204, 21, 0.6);
      }

      .close-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        opacity: 0;
        z-index: 10;
      }

      body:hover .close-btn {
        opacity: 1;
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
        color: #fff;
      }

      .close-btn svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
      }

      /* ------------ 반응형 레이아웃 (창이 작아질 때) ------------ */

      /* 기본 컴팩트 모드 (세로가 조금 줄어든 경우) */
      @media (max-height: 260px) {
        .pip-container {
          padding: 10px 12px;
        }

        .album-section {
          gap: 10px;
        }

        .album-art {
          width: 70px;
          height: 70px;
        }

        .track-title {
          font-size: 13px;
        }

        .track-artist {
          font-size: 11px;
        }

        .progress-section {
          margin: 8px 0;
        }

        .controls-section {
          gap: 6px;
          padding-top: 4px;
        }

        .control-btn {
          width: 38px;
          height: 38px;
        }

        .control-btn.play-pause {
          width: 46px;
          height: 46px;
        }

        .control-btn.small {
          width: 32px;
          height: 32px;
        }

        .control-btn svg {
          width: 16px;
          height: 16px;
        }

        .control-btn.play-pause svg {
          width: 22px;
          height: 22px;
        }

        .time-display {
          font-size: 10px;
        }
      }

      /* 아주 작게 줄어든 초소형 모드 (PIP 창 높이가 매우 낮을 때)
         → 유튜브뮤직 상단 미니 플레이어처럼 가로 한 줄 레이아웃 */
      @media (max-height: 180px) {
        .pip-container {
          padding: 4px 10px;
          flex-direction: row;
          align-items: center;
          gap: 8px;
        }

        .album-section {
          align-items: center;
          flex: 1;
          order: 2;
          gap: 6px;
        }

        .album-art {
          width: 32px;
          height: 32px;
          border-radius: 6px;
        }

        .track-title {
          font-size: 12px;
          max-width: 100%;
        }

        .track-artist {
          font-size: 10px;
        }

        .track-info {
          gap: 2px;
        }

        .progress-section {
          display: none; /* 진행바는 초소형에서는 숨김 */
        }

        .time-display {
          display: none;
        }

        .controls-section {
          padding-top: 0;
          gap: 6px;
          order: 1;
          flex-shrink: 0;
        }

        /* 보조 버튼(셔플/반복)은 숨기고 핵심 컨트롤만 남김 */
        .control-btn.small.shuffle-btn,
        .control-btn.small.repeat-btn {
          display: none;
        }

        .control-btn {
          width: 32px;
          height: 32px;
        }

        .control-btn.play-pause {
          width: 36px;
          height: 36px;
        }

        .control-btn svg {
          width: 16px;
          height: 16px;
        }

        .control-btn.play-pause svg {
          width: 20px;
          height: 20px;
        }

        .volume-control {
          display: none; /* 초소형에서는 볼륨도 숨김 */
        }
      }

      /* 폭이 좁을 때는 시간/볼륨 영역을 더 컴팩트하게 */
      @media (max-width: 360px) {
        .time-display {
          gap: 6px;
        }

        .time-left span:nth-child(2) {
          display: none; /* 슬래시(/) 제거 */
        }

        .volume-slider-wrap {
          width: 0;
        }

        .volume-control:hover .volume-slider-wrap {
          width: 60px;
        }
      }
    `;
  }

  // PIP 컨텐츠 HTML
  getPIPContent() {
    return `
      <!-- 배경 레이어 -->
      <div class="bg-layer" id="bgLayer"></div>
      <div class="bg-overlay"></div>

      <div class="pip-container">
        <button class="close-btn" id="closeBtn">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>

        <div class="album-section">
          <img class="album-art" id="albumArt" src="" alt="Album Art">
          <div class="track-info">
            <div class="track-title" id="trackTitle">재생 중인 곡 없음</div>
            <div class="track-artist" id="trackArtist">아티스트</div>
          </div>
        </div>

        <div class="progress-section">
          <div class="progress-bar-container" id="progressContainer">
            <div class="progress-bar" id="progressBar"></div>
          </div>
          <div class="time-display">
            <div class="time-left">
              <span id="currentTime">0:00</span>
              <span>/</span>
              <span id="totalTime">0:00</span>
            </div>
            <div class="volume-control">
              <div class="volume-slider-wrap">
                <input type="range" class="volume-slider" id="volumeSlider" min="0" max="100" value="100">
              </div>
              <button class="volume-btn" id="volumeBtn" title="볼륨">
                <svg viewBox="0 0 24 24" id="volumeIcon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="controls-section">
          <button class="control-btn small shuffle-btn" id="shuffleBtn" title="셔플">
            <svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
          </button>
          <button class="control-btn" id="prevBtn" title="이전 곡">
            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>
          <button class="control-btn play-pause" id="playPauseBtn" title="재생/일시정지">
            <svg viewBox="0 0 24 24" id="playIcon"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="control-btn" id="nextBtn" title="다음 곡">
            <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="control-btn small repeat-btn" id="repeatBtn" title="반복">
            <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  // PIP 이벤트 리스너 설정
  setupPIPEventListeners(pipDoc) {
    // 재생/일시정지
    pipDoc.getElementById('playPauseBtn').addEventListener('click', () => {
      this.togglePlayPause();
    });

    // 이전 곡
    pipDoc.getElementById('prevBtn').addEventListener('click', () => {
      this.previousTrack();
    });

    // 다음 곡
    pipDoc.getElementById('nextBtn').addEventListener('click', () => {
      this.nextTrack();
    });

    // 셔플
    pipDoc.getElementById('shuffleBtn').addEventListener('click', () => {
      this.toggleShuffle();
    });

    // 반복
    pipDoc.getElementById('repeatBtn').addEventListener('click', () => {
      this.toggleRepeat();
    });

    // 닫기
    pipDoc.getElementById('closeBtn').addEventListener('click', () => {
      this.closePIP();
    });

    // 진행바 클릭
    pipDoc.getElementById('progressContainer').addEventListener('click', (e) => {
      this.seekTo(e);
    });

    // 볼륨 슬라이더
    pipDoc.getElementById('volumeSlider').addEventListener('input', (e) => {
      this.setVolume(e.target.value / 100);
    });

    // 볼륨 버튼 (음소거 토글)
    pipDoc.getElementById('volumeBtn').addEventListener('click', () => {
      this.toggleMute();
    });
  }

  // 재생/일시정지 토글
  togglePlayPause() {
    const playButton = document.querySelector('ytmusic-player-bar #play-pause-button');
    if (playButton) {
      playButton.click();
    }
  }

  // 이전 곡
  previousTrack() {
    const prevButton = document.querySelector('ytmusic-player-bar .previous-button');
    if (prevButton) {
      prevButton.click();
    }
  }

  // 다음 곡
  nextTrack() {
    const nextButton = document.querySelector('ytmusic-player-bar .next-button');
    if (nextButton) {
      nextButton.click();
    }
  }

  // 셔플 토글
  toggleShuffle() {
    const shuffleButton = document.querySelector('ytmusic-player-bar [aria-label*="shuffle"], ytmusic-player-bar .shuffle');
    if (shuffleButton) {
      shuffleButton.click();
    }
  }

  // 반복 토글
  toggleRepeat() {
    const repeatButton = document.querySelector('ytmusic-player-bar [aria-label*="repeat"], ytmusic-player-bar .repeat');
    if (repeatButton) {
      repeatButton.click();
    }
  }

  // 진행바 위치로 이동
  seekTo(e) {
    const progressContainer = e.currentTarget;
    const rect = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;

    const video = document.querySelector('video');
    if (video && video.duration) {
      video.currentTime = percent * video.duration;
    }
  }

  // 볼륨 설정
  setVolume(value) {
    const video = document.querySelector('video');
    if (video) {
      video.volume = Math.max(0, Math.min(1, value));
      if (value > 0) {
        video.muted = false;
      }
    }
  }

  // 음소거 토글
  toggleMute() {
    const video = document.querySelector('video');
    if (video) {
      video.muted = !video.muted;
    }
  }

  // 볼륨 아이콘 가져오기
  getVolumeIcon(volume, muted) {
    if (muted || volume === 0) {
      // 음소거
      return '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (volume < 0.5) {
      // 볼륨 낮음
      return '<path d="M7 9v6h4l5 5V4l-5 5H7z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>';
    } else {
      // 볼륨 높음
      return '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  // 업데이트 루프 시작
  startUpdateLoop() {
    this.updatePIPContent();
    this.updateInterval = setInterval(() => {
      this.updatePIPContent();
    }, 500);
  }

  // 업데이트 루프 중지
  stopUpdateLoop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // PIP 컨텐츠 업데이트
  updatePIPContent() {
    if (!this.pipWindow || !this.isInPIP) return;

    const pipDoc = this.pipWindow.document;

    // 앨범 아트
    const albumArt = document.querySelector('ytmusic-player-bar img.image');
    const pipAlbumArt = pipDoc.getElementById('albumArt');
    const bgLayer = pipDoc.getElementById('bgLayer');
    if (albumArt && pipAlbumArt) {
      const imgSrc = albumArt.src.replace('w60-h60', 'w226-h226');
      if (pipAlbumArt.src !== imgSrc) {
        pipAlbumArt.src = imgSrc;
        // 배경도 함께 업데이트
        if (bgLayer) {
          bgLayer.style.backgroundImage = `url(${imgSrc})`;
        }
      }
    }

    // 곡 제목
    const title = document.querySelector('ytmusic-player-bar .title');
    const pipTitle = pipDoc.getElementById('trackTitle');
    if (title && pipTitle) {
      pipTitle.textContent = title.textContent || '재생 중인 곡 없음';
      pipTitle.title = title.textContent || '';
    }

    // 아티스트
    const artist = document.querySelector('ytmusic-player-bar .byline');
    const pipArtist = pipDoc.getElementById('trackArtist');
    if (artist && pipArtist) {
      pipArtist.textContent = artist.textContent || '아티스트';
      pipArtist.title = artist.textContent || '';
    }

    // 재생 상태
    const video = document.querySelector('video');
    const playIcon = pipDoc.getElementById('playIcon');
    if (video && playIcon) {
      if (video.paused) {
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      } else {
        playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      }
    }

    // 진행바
    const progressBar = pipDoc.getElementById('progressBar');
    const currentTimeEl = pipDoc.getElementById('currentTime');
    const totalTimeEl = pipDoc.getElementById('totalTime');
    if (video && progressBar) {
      const percent = (video.currentTime / video.duration) * 100 || 0;
      progressBar.style.width = `${percent}%`;

      if (currentTimeEl) {
        currentTimeEl.textContent = this.formatTime(video.currentTime);
      }
      if (totalTimeEl) {
        totalTimeEl.textContent = this.formatTime(video.duration);
      }
    }

    // 셔플 상태
    const shuffleBtn = pipDoc.getElementById('shuffleBtn');
    const shuffleButton = document.querySelector('ytmusic-player-bar [aria-label*="shuffle"]');
    if (shuffleBtn && shuffleButton) {
      const isShuffleOn = shuffleButton.getAttribute('aria-pressed') === 'true';
      shuffleBtn.classList.toggle('active', isShuffleOn);
    }

    // 반복 상태
    const repeatBtn = pipDoc.getElementById('repeatBtn');
    const repeatButton = document.querySelector('ytmusic-player-bar [aria-label*="repeat"]');
    if (repeatBtn && repeatButton) {
      const repeatMode = repeatButton.getAttribute('aria-label') || '';
      const isRepeatOn = !repeatMode.toLowerCase().includes('off');
      repeatBtn.classList.toggle('active', isRepeatOn);
    }

    // 볼륨 상태
    const volumeSlider = pipDoc.getElementById('volumeSlider');
    const volumeIcon = pipDoc.getElementById('volumeIcon');
    if (video && volumeSlider && volumeIcon) {
      const currentVolume = video.muted ? 0 : video.volume;
      volumeSlider.value = currentVolume * 100;
      volumeIcon.innerHTML = this.getVolumeIcon(video.volume, video.muted);
    }
  }

  // 시간 포맷
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // PIP 닫기
  closePIP() {
    if (this.pipWindow) {
      this.pipWindow.close();
      this.pipWindow = null;
    }
    this.isInPIP = false;
    this.stopUpdateLoop();
  }

  // 폴백: 비디오 PIP 사용
  async fallbackVideoPIP() {
    const video = document.querySelector('video');
    if (video) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (error) {
        console.error('비디오 PIP 실패:', error);
        alert('PIP 모드를 활성화할 수 없습니다. 먼저 영상을 재생해주세요.');
      }
    }
  }
}

// 확장 프로그램 초기화
const ytMusicPIP = new YouTubeMusicPIP();

