/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v6.0 — Draggable + Light Theme
 * =============================================================================
 * 
 * NOUVEAUTÉS v6.0:
 * - Widget déplaçable (drag & drop par le header)
 * - Thème 100% clair harmonisé avec Voiceflow
 * - Layout beaucoup plus aéré
 * - Position sauvegardée en localStorage
 * - Design épuré et professionnel
 * 
 * @version 6.0.0
 */
export const AudioRecorderExtension = {
  name: 'AudioRecorder',
  type: 'effect',
  match: ({ trace }) =>
    trace.type === 'ext_audioRecorder' || trace.payload?.name === 'ext_audioRecorder',
  effect: ({ trace }) => {
    // =========================================================================
    // CONFIGURATION
    // =========================================================================
    const config = {
      apiKey: trace.payload?.apiKey || '',
      language: trace.payload?.language || 'fr',
      eventName: trace.payload?.eventName || 'Inject_in_chat',
      
      // Couleurs Infortive
      primaryColor: trace.payload?.primaryColor || '#F08300',
      primaryDark: trace.payload?.primaryDark || '#d46f00',
      secondaryColor: trace.payload?.secondaryColor || '#073A59',
      
      // Thème clair
      white: '#ffffff',
      gray50: '#f9fafb',
      gray100: '#f3f4f6',
      gray200: '#e5e7eb',
      gray300: '#d1d5db',
      gray400: '#9ca3af',
      gray500: '#6b7280',
      gray600: '#4b5563',
      gray700: '#374151',
      gray800: '#1f2937',
      gray900: '#111827',
      
      // ElevenLabs
      modelId: trace.payload?.modelId || 'scribe_v2_realtime',
      sampleRate: 16000,
    };

    // Éviter les doublons
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      return;
    }

    if (!config.apiKey) {
      console.error('[AudioRecorder] ❌ Clé API ElevenLabs manquante!');
    }

    console.log('[AudioRecorder] 🚀 Initialisation v6.0 — Draggable + Light Theme');

    // =========================================================================
    // STATE
    // =========================================================================
    const state = {
      isRecording: false,
      isPaused: false,
      transcript: '',
      interimTranscript: '',
      audioChunks: [],
      stream: null,
      mediaRecorder: null,
      audioContext: null,
      analyser: null,
      microphone: null,
      scriptProcessor: null,
      websocket: null,
      timerInterval: null,
      recordingStartTime: null,
      pausedDuration: 0,
      pauseStartTime: null,
      animationFrameId: null,
      sessionId: null,
      sttToken: null,
      // Drag state
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
    };

    // =========================================================================
    // SVG ICONS
    // =========================================================================
    const ICONS = {
      microphone: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>`,
      stop: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>`,
      pause: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>`,
      play: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M8 5v14l11-7z"/>
        </svg>`,
      download: (color = '#6b7280', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>`,
      close: (color = '#6b7280', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>`,
      send: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>`,
      copy: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>`,
      trash: (color = '#ef4444', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>`,
      document: (color = '#6b7280', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>`,
      drag: (color = '#9ca3af', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>`,
    };

    // =========================================================================
    // STYLES
    // =========================================================================
    const styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    styles.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
      
      #vf-audio-recorder-widget,
      #vf-audio-recorder-widget * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        line-height: 1.5;
      }
      
      /* ==========================================
         Widget Container (toggle button)
         ========================================== */
      #vf-audio-recorder-widget {
        position: fixed;
        bottom: 100px;
        right: 24px;
        z-index: 10000;
      }
      
      .vf-ar-toggle {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor} 0%, ${config.primaryDark} 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 12px rgba(240, 131, 0, 0.25);
        transition: all 0.2s ease;
      }
      
      .vf-ar-toggle:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 16px rgba(240, 131, 0, 0.35);
      }
      
      .vf-ar-toggle.recording {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        animation: vf-ar-pulse 2s ease-in-out infinite;
      }
      
      .vf-ar-toggle svg {
        width: 22px;
        height: 22px;
      }
      
      /* ==========================================
         Panel — Draggable + Light Theme
         ========================================== */
      .vf-ar-panel {
        position: fixed;
        width: 380px;
        max-width: calc(100vw - 40px);
        background: ${config.white};
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: scale(0.95);
        transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
        z-index: 10001;
      }
      
      .vf-ar-panel.open {
        opacity: 1;
        visibility: visible;
        transform: scale(1);
      }
      
      /* ==========================================
         Header — Draggable handle
         ========================================== */
      .vf-ar-header {
        background: ${config.gray50};
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid ${config.gray200};
        cursor: grab;
        user-select: none;
      }
      
      .vf-ar-header:active {
        cursor: grabbing;
      }
      
      .vf-ar-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .vf-ar-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.5;
        transition: opacity 0.2s;
      }
      
      .vf-ar-header:hover .vf-ar-drag-handle {
        opacity: 0.8;
      }
      
      .vf-ar-title {
        display: flex;
        align-items: center;
        gap: 10px;
        color: ${config.primaryColor};
        font-weight: 700;
        font-size: 15px;
      }
      
      .vf-ar-title svg {
        width: 20px;
        height: 20px;
      }
      
      .vf-ar-badge {
        background: #10b981;
        color: white;
        font-size: 9px;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      
      .vf-ar-close {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: transparent;
        border: 1px solid ${config.gray200};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .vf-ar-close:hover {
        background: ${config.gray100};
        border-color: ${config.gray300};
      }
      
      .vf-ar-close svg {
        width: 16px;
        height: 16px;
      }
      
      /* ==========================================
         Timer Section — SPACIEUX
         ========================================== */
      .vf-ar-timer-section {
        padding: 32px 24px 24px;
        text-align: center;
        background: ${config.white};
      }
      
      .vf-ar-timer {
        font-size: 48px;
        font-weight: 700;
        color: ${config.gray800};
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        letter-spacing: -2px;
      }
      
      .vf-ar-status-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${config.gray300};
        transition: all 0.3s;
        flex-shrink: 0;
      }
      
      .vf-ar-status-dot.recording {
        background: #ef4444;
        animation: vf-ar-blink 1s ease-in-out infinite;
      }
      
      .vf-ar-status-dot.paused {
        background: ${config.primaryColor};
      }
      
      .vf-ar-status-dot.connecting {
        background: #3b82f6;
        animation: vf-ar-blink 0.5s ease-in-out infinite;
      }
      
      .vf-ar-status-label {
        font-size: 14px;
        color: ${config.gray500};
        margin-top: 12px;
        font-weight: 500;
      }
      
      /* ==========================================
         Visualizer
         ========================================== */
      .vf-ar-visualizer {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 60px;
        gap: 4px;
        padding: 0 32px;
        margin-bottom: 16px;
        background: ${config.white};
      }
      
      .vf-ar-bar {
        width: 6px;
        min-height: 6px;
        background: linear-gradient(180deg, ${config.primaryColor} 0%, ${config.primaryDark} 100%);
        border-radius: 3px;
        transition: height 0.05s ease-out;
      }
      
      /* ==========================================
         Controls — Plus espacés
         ========================================== */
      .vf-ar-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 24px;
        padding: 24px;
        background: ${config.gray50};
        border-top: 1px solid ${config.gray200};
      }
      
      .vf-ar-btn {
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }
      
      .vf-ar-btn-record {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.3);
      }
      
      .vf-ar-btn-record:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
      }
      
      .vf-ar-btn-record.recording {
        background: linear-gradient(135deg, ${config.gray600} 0%, ${config.gray700} 100%);
        box-shadow: 0 4px 16px rgba(75, 85, 99, 0.3);
      }
      
      .vf-ar-btn-record svg {
        width: 30px;
        height: 30px;
      }
      
      .vf-ar-btn-secondary {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: ${config.white};
        border: 1px solid ${config.gray200};
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }
      
      .vf-ar-btn-secondary:hover:not(:disabled) {
        background: ${config.gray50};
        border-color: ${config.gray300};
        transform: scale(1.05);
      }
      
      .vf-ar-btn-secondary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      
      .vf-ar-btn-secondary svg {
        width: 22px;
        height: 22px;
      }
      
      /* ==========================================
         Transcript Section — AÉRÉ
         ========================================== */
      .vf-ar-transcript-section {
        padding: 24px;
        background: ${config.white};
        border-top: 1px solid ${config.gray200};
      }
      
      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        gap: 12px;
      }
      
      .vf-ar-transcript-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: ${config.gray500};
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .vf-ar-transcript-title svg {
        width: 16px;
        height: 16px;
      }
      
      .vf-ar-transcript-actions {
        display: flex;
        gap: 8px;
      }
      
      .vf-ar-action-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .vf-ar-action-btn svg {
        width: 14px;
        height: 14px;
      }
      
      .vf-ar-btn-copy {
        background: ${config.secondaryColor};
        color: white;
      }
      
      .vf-ar-btn-copy:hover {
        background: #052e47;
      }
      
      .vf-ar-btn-clear {
        background: #fef2f2;
        color: #ef4444;
        border: 1px solid #fecaca;
      }
      
      .vf-ar-btn-clear:hover {
        background: #fee2e2;
      }
      
      /* Zone de transcription */
      .vf-ar-transcript {
        background: ${config.gray50};
        border-radius: 12px;
        padding: 16px 18px;
        min-height: 100px;
        max-height: 160px;
        overflow-y: auto;
        color: ${config.gray800};
        font-size: 14px;
        line-height: 1.7;
        border: 1px solid ${config.gray200};
      }
      
      .vf-ar-transcript:empty::before {
        content: 'La transcription apparaîtra ici...';
        color: ${config.gray400};
        font-style: italic;
      }
      
      .vf-ar-transcript .interim {
        color: ${config.gray400};
        font-style: italic;
      }
      
      .vf-ar-transcript::-webkit-scrollbar {
        width: 6px;
      }
      
      .vf-ar-transcript::-webkit-scrollbar-thumb {
        background: ${config.primaryColor};
        border-radius: 3px;
      }
      
      /* ==========================================
         Bouton Injecter
         ========================================== */
      .vf-ar-inject {
        width: 100%;
        margin-top: 16px;
        padding: 16px 24px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(135deg, ${config.primaryColor} 0%, ${config.primaryDark} 100%);
        color: white;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.2s ease;
        box-shadow: 0 2px 12px rgba(240, 131, 0, 0.25);
      }
      
      .vf-ar-inject:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(240, 131, 0, 0.35);
      }
      
      .vf-ar-inject:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      .vf-ar-inject svg {
        width: 18px;
        height: 18px;
      }
      
      /* ==========================================
         Toast
         ========================================== */
      .vf-ar-toast {
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 12px 24px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10002;
        opacity: 0;
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      
      .vf-ar-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      
      .vf-ar-toast.success { background: #10b981; color: white; }
      .vf-ar-toast.error { background: #ef4444; color: white; }
      .vf-ar-toast.info { background: ${config.secondaryColor}; color: white; }
      
      /* ==========================================
         Animations
         ========================================== */
      @keyframes vf-ar-pulse {
        0%, 100% { box-shadow: 0 2px 12px rgba(239, 68, 68, 0.3); }
        50% { box-shadow: 0 2px 20px rgba(239, 68, 68, 0.5), 0 0 0 6px rgba(239, 68, 68, 0.1); }
      }
      
      @keyframes vf-ar-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      
      /* ==========================================
         Responsive
         ========================================== */
      @media (max-width: 480px) {
        .vf-ar-panel {
          width: calc(100vw - 32px);
          left: 16px !important;
          right: 16px !important;
        }
        
        .vf-ar-timer {
          font-size: 40px;
        }
        
        .vf-ar-btn-record {
          width: 64px;
          height: 64px;
        }
        
        .vf-ar-btn-secondary {
          width: 48px;
          height: 48px;
        }
        
        .vf-ar-controls {
          gap: 18px;
        }
      }
    `;
    document.head.appendChild(styles);

    // =========================================================================
    // HTML
    // =========================================================================
    const widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = `
      <button class="vf-ar-toggle" id="vf-ar-toggle" title="Enregistreur audio">
        ${ICONS.microphone('#FFFFFF', 22)}
      </button>
    `;
    document.body.appendChild(widget);

    // Panel séparé (pour le drag)
    const panel = document.createElement('div');
    panel.className = 'vf-ar-panel';
    panel.id = 'vf-ar-panel';
    
    // Restaurer la position sauvegardée
    const savedPos = localStorage.getItem('vf-ar-panel-position');
    if (savedPos) {
      const pos = JSON.parse(savedPos);
      panel.style.top = pos.top + 'px';
      panel.style.left = pos.left + 'px';
    } else {
      panel.style.bottom = '170px';
      panel.style.right = '24px';
    }
    
    panel.innerHTML = `
      <div class="vf-ar-header" id="vf-ar-header">
        <div class="vf-ar-header-left">
          <div class="vf-ar-drag-handle" title="Déplacer">
            ${ICONS.drag(config.gray400, 20)}
          </div>
          <div class="vf-ar-title">
            ${ICONS.microphone(config.primaryColor, 20)}
            <span>Enregistreur d'appel</span>
            <span class="vf-ar-badge">ElevenLabs</span>
          </div>
        </div>
        <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
          ${ICONS.close(config.gray500, 16)}
        </button>
      </div>
      
      <div class="vf-ar-timer-section">
        <div class="vf-ar-timer">
          <div class="vf-ar-status-dot" id="vf-ar-dot"></div>
          <span id="vf-ar-timer">00:00:00</span>
        </div>
        <div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>
      </div>
      
      <div class="vf-ar-visualizer" id="vf-ar-visualizer">
        ${Array(32).fill('<div class="vf-ar-bar"></div>').join('')}
      </div>
      
      <div class="vf-ar-controls">
        <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger" disabled>
          ${ICONS.download(config.gray500, 22)}
        </button>
        
        <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Enregistrer">
          ${ICONS.microphone('#FFFFFF', 30)}
        </button>
        
        <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
          ${ICONS.pause(config.gray500, 22)}
        </button>
      </div>
      
      <div class="vf-ar-transcript-section">
        <div class="vf-ar-transcript-header">
          <div class="vf-ar-transcript-title">
            ${ICONS.document(config.gray500, 16)}
            <span>Transcription</span>
          </div>
          <div class="vf-ar-transcript-actions">
            <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy" title="Copier">
              ${ICONS.copy('#FFFFFF', 14)}
              <span>Copier</span>
            </button>
            <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">
              ${ICONS.trash('#ef4444', 14)}
            </button>
          </div>
        </div>
        <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
        <button class="vf-ar-inject" id="vf-ar-inject" disabled>
          ${ICONS.send('#FFFFFF', 18)}
          <span>Injecter dans le chat</span>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // =========================================================================
    // REFERENCES
    // =========================================================================
    const $ = id => document.getElementById(id);
    const els = {
      toggle: $('vf-ar-toggle'),
      panel: panel,
      header: $('vf-ar-header'),
      close: $('vf-ar-close'),
      timer: $('vf-ar-timer'),
      dot: $('vf-ar-dot'),
      label: $('vf-ar-label'),
      record: $('vf-ar-record'),
      pause: $('vf-ar-pause'),
      download: $('vf-ar-download'),
      bars: document.querySelectorAll('.vf-ar-bar'),
      transcript: $('vf-ar-transcript'),
      copy: $('vf-ar-copy'),
      clear: $('vf-ar-clear'),
      inject: $('vf-ar-inject'),
    };

    // =========================================================================
    // DRAG & DROP
    // =========================================================================
    function initDrag() {
      const header = els.header;
      
      header.addEventListener('mousedown', startDrag);
      header.addEventListener('touchstart', startDrag, { passive: false });
      
      function startDrag(e) {
        // Ignorer si c'est le bouton close
        if (e.target.closest('.vf-ar-close')) return;
        
        e.preventDefault();
        state.isDragging = true;
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        const rect = panel.getBoundingClientRect();
        state.dragOffset.x = clientX - rect.left;
        state.dragOffset.y = clientY - rect.top;
        
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', stopDrag);
      }
      
      function drag(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        let newLeft = clientX - state.dragOffset.x;
        let newTop = clientY - state.dragOffset.y;
        
        // Limiter aux bords de l'écran
        const panelRect = panel.getBoundingClientRect();
        const maxLeft = window.innerWidth - panelRect.width;
        const maxTop = window.innerHeight - panelRect.height;
        
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));
        
        // Supprimer right/bottom et utiliser left/top
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
      }
      
      function stopDrag() {
        if (!state.isDragging) return;
        state.isDragging = false;
        
        // Sauvegarder la position
        const rect = panel.getBoundingClientRect();
        localStorage.setItem('vf-ar-panel-position', JSON.stringify({
          top: rect.top,
          left: rect.left
        }));
        
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', drag);
        document.removeEventListener('touchend', stopDrag);
      }
    }
    
    initDrag();

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function formatTime(sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    function toast(msg, type = 'info') {
      document.querySelectorAll('.vf-ar-toast').forEach(t => t.remove());
      const t = document.createElement('div');
      t.className = `vf-ar-toast ${type}`;
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 2500);
    }

    function updateDisplay() {
      const final = state.transcript;
      const interim = state.interimTranscript;
      
      if (final || interim) {
        els.transcript.innerHTML = final + (interim ? `<span class="interim">${interim}</span>` : '');
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      }
    }

    function setUI(mode) {
      const { toggle, record, pause, dot, label, download } = els;
      
      switch(mode) {
        case 'idle':
          toggle.classList.remove('recording');
          toggle.innerHTML = ICONS.microphone('#FFFFFF', 22);
          record.classList.remove('recording');
          record.innerHTML = ICONS.microphone('#FFFFFF', 30);
          pause.disabled = true;
          pause.innerHTML = ICONS.pause(config.gray500, 22);
          dot.classList.remove('recording', 'paused', 'connecting');
          label.textContent = 'Prêt à enregistrer';
          if (state.audioChunks.length) download.disabled = false;
          break;
          
        case 'connecting':
          dot.classList.add('connecting');
          dot.classList.remove('recording', 'paused');
          label.textContent = 'Connexion...';
          break;
          
        case 'recording':
          toggle.classList.add('recording');
          record.classList.add('recording');
          record.innerHTML = ICONS.stop('#FFFFFF', 30);
          pause.disabled = false;
          pause.innerHTML = ICONS.pause(config.gray700, 22);
          dot.classList.add('recording');
          dot.classList.remove('paused', 'connecting');
          label.textContent = 'Enregistrement en cours...';
          break;
          
        case 'paused':
          pause.innerHTML = ICONS.play(config.gray700, 22);
          dot.classList.remove('recording', 'connecting');
          dot.classList.add('paused');
          label.textContent = 'En pause';
          break;
          
        case 'resumed':
          pause.innerHTML = ICONS.pause(config.gray700, 22);
          dot.classList.add('recording');
          dot.classList.remove('paused', 'connecting');
          label.textContent = 'Enregistrement en cours...';
          break;
      }
    }

    // =========================================================================
    // ELEVENLABS API
    // =========================================================================
    async function getElevenLabsToken() {
      const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey }
      });
      if (!response.ok) throw new Error(`Token error: ${response.status}`);
      const data = await response.json();
      return data.token;
    }

    function connectElevenLabsWebSocket(token) {
      return new Promise((resolve, reject) => {
        const wsParams = new URLSearchParams({
          model_id: config.modelId,
          language_code: config.language,
          token: token,
          audio_format: 'pcm_16000',
          commit_strategy: 'vad',
          vad_silence_threshold_secs: '1.0',
          vad_threshold: '0.3',
          include_timestamps: 'false'
        });
        
        const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${wsParams.toString()}`);
        const timeout = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          switch(data.message_type) {
            case 'session_started':
              clearTimeout(timeout);
              state.sessionId = data.session_id;
              resolve(ws);
              break;
            case 'partial_transcript':
              if (data.text) { state.interimTranscript = data.text; updateDisplay(); }
              break;
            case 'committed_transcript':
            case 'committed_transcript_with_timestamps':
              if (data.text?.trim()) { state.transcript += data.text + ' '; state.interimTranscript = ''; updateDisplay(); }
              break;
          }
        };
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket error')); };
        ws.onclose = (e) => { clearTimeout(timeout); if (state.isRecording && e.code !== 1000) toast('Connexion perdue', 'error'); };
        state.websocket = ws;
      });
    }

    // =========================================================================
    // AUDIO PROCESSING
    // =========================================================================
    function float32ToPCM16(f32) {
      const pcm = new Int16Array(f32.length);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return pcm;
    }

    function resampleTo16kHz(data, rate) {
      if (rate === 16000) return data;
      const ratio = rate / 16000;
      const len = Math.round(data.length / ratio);
      const result = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const idx = i * ratio;
        const floor = Math.floor(idx);
        const ceil = Math.min(floor + 1, data.length - 1);
        result[i] = data[floor] * (1 - (idx - floor)) + data[ceil] * (idx - floor);
      }
      return result;
    }

    function arrayBufferToBase64(buf) {
      const arr = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < arr.length; i += 8192) {
        bin += String.fromCharCode.apply(null, arr.subarray(i, i + 8192));
      }
      return btoa(bin);
    }

    function sendAudioChunk(data, rate) {
      if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN || state.isPaused) return;
      const processed = rate !== 16000 ? resampleTo16kHz(data, rate) : data;
      const pcm = float32ToPCM16(processed);
      try {
        state.websocket.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: arrayBufferToBase64(pcm.buffer),
          sample_rate: 16000
        }));
      } catch (e) {}
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
    async function startRecording() {
      if (!config.apiKey) { toast('Clé API manquante', 'error'); return; }

      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      setUI('connecting');
      updateDisplay();

      try {
        const token = await getElevenLabsToken();
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const rate = state.audioContext.sampleRate;
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);

        await connectElevenLabsWebSocket(token);

        state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
        state.scriptProcessor.onaudioprocess = (e) => {
          if (!state.isRecording || state.isPaused) return;
          sendAudioChunk(new Float32Array(e.inputBuffer.getChannelData(0)), rate);
        };
        state.microphone.connect(state.scriptProcessor);
        state.scriptProcessor.connect(state.audioContext.destination);

        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType: mime });
        state.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) state.audioChunks.push(e.data); };
        state.mediaRecorder.start(500);

        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        state.timerInterval = setInterval(() => {
          if (!state.isPaused && state.isRecording) {
            els.timer.textContent = formatTime(Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000));
          }
        }, 100);

        visualize();
        setUI('recording');
        toast('Enregistrement démarré', 'success');
      } catch (err) {
        state.isRecording = false;
        setUI('idle');
        cleanupResources();
        toast(err.name === 'NotAllowedError' ? 'Accès micro refusé' : err.message, 'error');
      }
    }

    function cleanupResources() {
      if (state.websocket) try { state.websocket.close(1000); } catch(e) {}
      if (state.scriptProcessor) try { state.scriptProcessor.disconnect(); } catch(e) {}
      if (state.mediaRecorder?.state !== 'inactive') try { state.mediaRecorder.stop(); } catch(e) {}
      if (state.audioContext?.state !== 'closed') try { state.audioContext.close(); } catch(e) {}
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      state.websocket = state.scriptProcessor = null;
    }

    function stopRecording() {
      state.isRecording = false;
      state.isPaused = false;
      cleanupResources();
      els.bars.forEach(b => b.style.height = '6px');
      setUI('idle');
      toast('Enregistrement terminé', 'success');
    }

    function togglePause() {
      if (!state.isRecording) return;
      state.isPaused = !state.isPaused;
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.pause();
        setUI('paused');
        toast('Pause', 'info');
      } else {
        if (state.pauseStartTime) state.pausedDuration += Date.now() - state.pauseStartTime;
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        setUI('resumed');
        toast('Reprise', 'info');
      }
    }

    function visualize() {
      if (!state.analyser || !state.isRecording) return;
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      function draw() {
        if (!state.isRecording) { els.bars.forEach(b => b.style.height = '6px'); return; }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          els.bars.forEach((bar, i) => bar.style.height = `${Math.max(6, (data[i] || 0) / 255 * 100)}%`);
        }
      }
      draw();
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    els.toggle.addEventListener('click', () => panel.classList.toggle('open'));
    els.close.addEventListener('click', () => panel.classList.remove('open'));
    
    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && !panel.contains(e.target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });

    els.record.addEventListener('click', () => state.isRecording ? stopRecording() : startRecording());
    els.pause.addEventListener('click', togglePause);

    els.download.addEventListener('click', () => {
      if (!state.audioChunks.length) return;
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `enregistrement-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`;
      a.click();
      toast('Téléchargé', 'success');
    });

    els.copy.addEventListener('click', () => {
      const text = els.transcript.innerText;
      if (!text?.trim()) { toast('Aucun texte', 'error'); return; }
      navigator.clipboard.writeText(text).then(() => toast('Copié!', 'success'));
    });

    els.clear.addEventListener('click', () => {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('Effacé', 'info');
    });

    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText;
      if (!text?.trim()) { toast('Aucun texte', 'error'); return; }

      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact({
          type: 'event',
          payload: {
            event: { name: config.eventName },
            call_transcript: text.trim(),
            duration: els.timer.textContent,
            timestamp: new Date().toISOString()
          }
        });
        toast('Injecté!', 'success');
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      } else {
        toast('Voiceflow non trouvé', 'error');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) panel.classList.remove('open');
    });

    console.log('[AudioRecorder] ✅ v6.0 Draggable + Light Theme prêt');
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { AudioRecorderExtension };
if (typeof window !== 'undefined') window.AudioRecorderExtension = AudioRecorderExtension;
