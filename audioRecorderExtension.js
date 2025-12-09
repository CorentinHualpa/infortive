/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v6.1 — Ultra Modern + Fixed Icons
 * =============================================================================
 * 
 * FIXES v6.1:
 * - Fixed invisible SVG icons (now proper colors on light background)
 * - Fixed drag functionality 
 * - Added visible card shadow and border
 * - Ultra modern glassmorphism style
 * - Better visual hierarchy
 * 
 * @version 6.1.0
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
      primaryColor: '#F08300',
      primaryDark: '#d46f00',
      primaryLight: '#fff3e0',
      secondaryColor: '#073A59',
      dangerColor: '#dc2626',
      successColor: '#10b981',
      
      // ElevenLabs
      modelId: trace.payload?.modelId || 'scribe_v2_realtime',
    };

    // Éviter les doublons
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      return;
    }

    if (!config.apiKey) {
      console.error('[AudioRecorder] ❌ Clé API ElevenLabs manquante!');
    }

    console.log('[AudioRecorder] 🚀 Initialisation v6.1');

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
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
    };

    // =========================================================================
    // SVG ICONS - Couleurs adaptées au fond clair
    // =========================================================================
    const ICONS = {
      microphone: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
      stop: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
      pause: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
      play: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M8 5v14l11-7z"/></svg>`,
      download: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
      close: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
      send: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
      copy: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
      trash: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
      grip: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${color}"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
    };

    // =========================================================================
    // STYLES - Ultra Modern
    // =========================================================================
    const styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    styles.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      
      #vf-audio-recorder-widget,
      #vf-audio-recorder-widget *,
      .vf-ar-panel,
      .vf-ar-panel * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }
      
      /* ==========================================
         Toggle Button
         ========================================== */
      #vf-audio-recorder-widget {
        position: fixed;
        bottom: 100px;
        right: 24px;
        z-index: 10000;
      }
      
      .vf-ar-toggle {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryDark});
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(240, 131, 0, 0.4);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .vf-ar-toggle:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 8px 30px rgba(240, 131, 0, 0.5);
      }
      
      .vf-ar-toggle.recording {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        animation: vf-pulse 2s infinite;
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
      }
      
      .vf-ar-toggle svg {
        width: 26px;
        height: 26px;
      }
      
      /* ==========================================
         Panel - Glassmorphism Modern
         ========================================== */
      .vf-ar-panel {
        position: fixed;
        bottom: 180px;
        right: 24px;
        width: 400px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 24px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow: 
          0 25px 50px -12px rgba(0, 0, 0, 0.15),
          0 0 0 1px rgba(255, 255, 255, 0.5) inset;
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateY(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 10001;
      }
      
      .vf-ar-panel.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }
      
      /* ==========================================
         Header - Draggable
         ========================================== */
      .vf-ar-header {
        background: linear-gradient(135deg, ${config.secondaryColor}, #0a4a6e);
        padding: 18px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
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
      
      .vf-ar-grip {
        opacity: 0.5;
        transition: opacity 0.2s;
      }
      
      .vf-ar-header:hover .vf-ar-grip {
        opacity: 0.8;
      }
      
      .vf-ar-grip svg {
        width: 16px;
        height: 16px;
      }
      
      .vf-ar-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .vf-ar-title-icon svg {
        width: 22px;
        height: 22px;
      }
      
      .vf-ar-title {
        color: #ffffff;
        font-weight: 600;
        font-size: 15px;
        letter-spacing: -0.01em;
      }
      
      .vf-ar-badge {
        background: ${config.successColor};
        color: white;
        font-size: 10px;
        padding: 4px 10px;
        border-radius: 20px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }
      
      .vf-ar-close {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .vf-ar-close:hover {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.05);
      }
      
      .vf-ar-close svg {
        width: 18px;
        height: 18px;
      }
      
      /* ==========================================
         Timer Section
         ========================================== */
      .vf-ar-timer-section {
        padding: 36px 24px 28px;
        text-align: center;
        background: #ffffff;
      }
      
      .vf-ar-timer-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }
      
      .vf-ar-status-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #d1d5db;
        transition: all 0.3s;
        flex-shrink: 0;
      }
      
      .vf-ar-status-dot.recording {
        background: #ef4444;
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
        animation: vf-blink 1s infinite;
      }
      
      .vf-ar-status-dot.paused {
        background: ${config.primaryColor};
        box-shadow: 0 0 0 4px rgba(240, 131, 0, 0.2);
      }
      
      .vf-ar-status-dot.connecting {
        background: #3b82f6;
        animation: vf-blink 0.5s infinite;
      }
      
      .vf-ar-timer {
        font-size: 52px;
        font-weight: 700;
        color: #111827;
        font-variant-numeric: tabular-nums;
        letter-spacing: -3px;
        line-height: 1;
      }
      
      .vf-ar-status-label {
        font-size: 14px;
        color: #6b7280;
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
        height: 64px;
        gap: 4px;
        padding: 0 32px 20px;
        background: #ffffff;
      }
      
      .vf-ar-bar {
        width: 6px;
        min-height: 6px;
        background: linear-gradient(180deg, ${config.primaryColor}, ${config.primaryDark});
        border-radius: 3px;
        transition: height 0.05s ease-out;
      }
      
      /* ==========================================
         Controls
         ========================================== */
      .vf-ar-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 20px;
        padding: 24px;
        background: #f9fafb;
        border-top: 1px solid #f3f4f6;
      }
      
      .vf-ar-btn {
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* Bouton Record */
      .vf-ar-btn-record {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 8px 24px rgba(239, 68, 68, 0.35);
      }
      
      .vf-ar-btn-record:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 32px rgba(239, 68, 68, 0.45);
      }
      
      .vf-ar-btn-record:active {
        transform: scale(0.98);
      }
      
      .vf-ar-btn-record.recording {
        background: linear-gradient(135deg, #4b5563, #374151);
        box-shadow: 0 8px 24px rgba(75, 85, 99, 0.35);
      }
      
      .vf-ar-btn-record svg {
        width: 32px;
        height: 32px;
      }
      
      /* Boutons secondaires */
      .vf-ar-btn-secondary {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: #ffffff;
        border: 2px solid #e5e7eb;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      }
      
      .vf-ar-btn-secondary:hover:not(:disabled) {
        background: #f9fafb;
        border-color: #d1d5db;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }
      
      .vf-ar-btn-secondary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      
      .vf-ar-btn-secondary svg {
        width: 24px;
        height: 24px;
      }
      
      /* ==========================================
         Transcript Section
         ========================================== */
      .vf-ar-transcript-section {
        padding: 24px;
        background: #ffffff;
        border-top: 1px solid #f3f4f6;
      }
      
      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      
      .vf-ar-transcript-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
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
        padding: 10px 16px;
        border-radius: 10px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .vf-ar-action-btn svg {
        width: 16px;
        height: 16px;
      }
      
      .vf-ar-btn-copy {
        background: ${config.secondaryColor};
        color: white;
      }
      
      .vf-ar-btn-copy:hover {
        background: #052e47;
        transform: translateY(-1px);
      }
      
      .vf-ar-btn-clear {
        background: #fef2f2;
        color: #dc2626;
        border: 1px solid #fecaca;
      }
      
      .vf-ar-btn-clear:hover {
        background: #fee2e2;
      }
      
      .vf-ar-btn-clear svg {
        width: 16px;
        height: 16px;
      }
      
      /* Transcript Area */
      .vf-ar-transcript {
        background: #f9fafb;
        border-radius: 16px;
        padding: 18px 20px;
        min-height: 100px;
        max-height: 150px;
        overflow-y: auto;
        color: #111827;
        font-size: 15px;
        line-height: 1.7;
        border: 2px solid #f3f4f6;
        transition: border-color 0.2s;
      }
      
      .vf-ar-transcript:focus {
        outline: none;
        border-color: ${config.primaryColor};
      }
      
      .vf-ar-transcript:empty::before {
        content: 'La transcription apparaîtra ici...';
        color: #9ca3af;
        font-style: italic;
      }
      
      .vf-ar-transcript .interim {
        color: #9ca3af;
        font-style: italic;
      }
      
      .vf-ar-transcript::-webkit-scrollbar {
        width: 6px;
      }
      
      .vf-ar-transcript::-webkit-scrollbar-thumb {
        background: ${config.primaryColor};
        border-radius: 3px;
      }
      
      /* Inject Button */
      .vf-ar-inject {
        width: 100%;
        margin-top: 16px;
        padding: 18px 24px;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryDark});
        color: white;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(240, 131, 0, 0.3);
      }
      
      .vf-ar-inject:hover:not(:disabled) {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(240, 131, 0, 0.4);
      }
      
      .vf-ar-inject:active:not(:disabled) {
        transform: translateY(-1px);
      }
      
      .vf-ar-inject:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }
      
      .vf-ar-inject svg {
        width: 20px;
        height: 20px;
      }
      
      /* ==========================================
         Toast
         ========================================== */
      .vf-ar-toast {
        position: fixed;
        bottom: 120px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 14px 28px;
        border-radius: 14px;
        font-size: 14px;
        font-weight: 600;
        z-index: 10002;
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
        font-family: 'Inter', sans-serif;
      }
      
      .vf-ar-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      
      .vf-ar-toast.success { background: ${config.successColor}; color: white; }
      .vf-ar-toast.error { background: ${config.dangerColor}; color: white; }
      .vf-ar-toast.info { background: ${config.secondaryColor}; color: white; }
      
      /* ==========================================
         Animations
         ========================================== */
      @keyframes vf-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6), 0 0 0 8px rgba(239, 68, 68, 0.1); }
      }
      
      @keyframes vf-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      
      /* ==========================================
         Responsive
         ========================================== */
      @media (max-width: 480px) {
        .vf-ar-panel {
          width: calc(100vw - 32px);
          right: 16px;
          left: 16px;
          bottom: 160px;
        }
        
        .vf-ar-timer {
          font-size: 42px;
        }
        
        .vf-ar-btn-record {
          width: 70px;
          height: 70px;
        }
        
        .vf-ar-btn-secondary {
          width: 50px;
          height: 50px;
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
        ${ICONS.microphone('#FFFFFF')}
      </button>
    `;
    document.body.appendChild(widget);

    // Panel séparé
    const panel = document.createElement('div');
    panel.className = 'vf-ar-panel';
    panel.id = 'vf-ar-panel';
    
    // Restaurer position sauvegardée
    const savedPos = localStorage.getItem('vf-ar-position');
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        panel.style.top = pos.top + 'px';
        panel.style.left = pos.left + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      } catch(e) {}
    }
    
    panel.innerHTML = `
      <div class="vf-ar-header" id="vf-ar-header">
        <div class="vf-ar-header-left">
          <div class="vf-ar-grip">
            ${ICONS.grip('#ffffff')}
          </div>
          <div class="vf-ar-title-group">
            <div class="vf-ar-title-icon">
              ${ICONS.microphone('#ffffff')}
            </div>
            <span class="vf-ar-title">Enregistreur d'appel</span>
            <span class="vf-ar-badge">ElevenLabs</span>
          </div>
        </div>
        <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
          ${ICONS.close('#ffffff')}
        </button>
      </div>
      
      <div class="vf-ar-timer-section">
        <div class="vf-ar-timer-display">
          <div class="vf-ar-status-dot" id="vf-ar-dot"></div>
          <div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>
        </div>
        <div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>
      </div>
      
      <div class="vf-ar-visualizer" id="vf-ar-visualizer">
        ${Array(32).fill('<div class="vf-ar-bar"></div>').join('')}
      </div>
      
      <div class="vf-ar-controls">
        <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger" disabled>
          ${ICONS.download('#6b7280')}
        </button>
        
        <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Enregistrer">
          ${ICONS.microphone('#ffffff')}
        </button>
        
        <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
          ${ICONS.pause('#6b7280')}
        </button>
      </div>
      
      <div class="vf-ar-transcript-section">
        <div class="vf-ar-transcript-header">
          <div class="vf-ar-transcript-title">
            ${ICONS.microphone('#6b7280')}
            <span>Transcription</span>
          </div>
          <div class="vf-ar-transcript-actions">
            <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy">
              ${ICONS.copy('#ffffff')}
              <span>Copier</span>
            </button>
            <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear">
              ${ICONS.trash('#dc2626')}
            </button>
          </div>
        </div>
        <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
        <button class="vf-ar-inject" id="vf-ar-inject" disabled>
          ${ICONS.send('#ffffff')}
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
      panel,
      header: $('vf-ar-header'),
      close: $('vf-ar-close'),
      timer: $('vf-ar-timer'),
      dot: $('vf-ar-dot'),
      label: $('vf-ar-label'),
      record: $('vf-ar-record'),
      pause: $('vf-ar-pause'),
      download: $('vf-ar-download'),
      bars: panel.querySelectorAll('.vf-ar-bar'),
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
      
      function onMouseDown(e) {
        if (e.target.closest('.vf-ar-close')) return;
        e.preventDefault();
        state.isDragging = true;
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const rect = panel.getBoundingClientRect();
        
        state.dragOffset = {
          x: clientX - rect.left,
          y: clientY - rect.top
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchmove', onMouseMove, { passive: false });
        document.addEventListener('touchend', onMouseUp);
      }
      
      function onMouseMove(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        let left = clientX - state.dragOffset.x;
        let top = clientY - state.dragOffset.y;
        
        // Limites écran
        const rect = panel.getBoundingClientRect();
        left = Math.max(0, Math.min(left, window.innerWidth - rect.width));
        top = Math.max(0, Math.min(top, window.innerHeight - rect.height));
        
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      
      function onMouseUp() {
        if (!state.isDragging) return;
        state.isDragging = false;
        
        // Sauvegarder position
        const rect = panel.getBoundingClientRect();
        localStorage.setItem('vf-ar-position', JSON.stringify({ top: rect.top, left: rect.left }));
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('touchmove', onMouseMove);
        document.removeEventListener('touchend', onMouseUp);
      }
      
      header.addEventListener('mousedown', onMouseDown);
      header.addEventListener('touchstart', onMouseDown, { passive: false });
    }
    
    initDrag();

    // =========================================================================
    // UTILITIES
    // =========================================================================
    const formatTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    };

    const toast = (msg, type = 'info') => {
      document.querySelectorAll('.vf-ar-toast').forEach(t => t.remove());
      const t = document.createElement('div');
      t.className = `vf-ar-toast ${type}`;
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
    };

    const updateDisplay = () => {
      if (state.transcript || state.interimTranscript) {
        els.transcript.innerHTML = state.transcript + (state.interimTranscript ? `<span class="interim">${state.interimTranscript}</span>` : '');
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      }
    };

    const setUI = (mode) => {
      switch(mode) {
        case 'idle':
          els.toggle.classList.remove('recording');
          els.toggle.innerHTML = ICONS.microphone('#ffffff');
          els.record.classList.remove('recording');
          els.record.innerHTML = ICONS.microphone('#ffffff');
          els.pause.disabled = true;
          els.pause.innerHTML = ICONS.pause('#6b7280');
          els.dot.className = 'vf-ar-status-dot';
          els.label.textContent = 'Prêt à enregistrer';
          if (state.audioChunks.length) els.download.disabled = false;
          break;
        case 'connecting':
          els.dot.className = 'vf-ar-status-dot connecting';
          els.label.textContent = 'Connexion...';
          break;
        case 'recording':
          els.toggle.classList.add('recording');
          els.record.classList.add('recording');
          els.record.innerHTML = ICONS.stop('#ffffff');
          els.pause.disabled = false;
          els.pause.innerHTML = ICONS.pause('#374151');
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
        case 'paused':
          els.pause.innerHTML = ICONS.play('#374151');
          els.dot.className = 'vf-ar-status-dot paused';
          els.label.textContent = 'En pause';
          break;
        case 'resumed':
          els.pause.innerHTML = ICONS.pause('#374151');
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
      }
    };

    // =========================================================================
    // ELEVENLABS API
    // =========================================================================
    const getToken = async () => {
      const res = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey }
      });
      if (!res.ok) throw new Error(`Token error: ${res.status}`);
      return (await res.json()).token;
    };

    const connectWS = (token) => new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        model_id: config.modelId,
        language_code: config.language,
        token,
        audio_format: 'pcm_16000',
        commit_strategy: 'vad',
        vad_silence_threshold_secs: '1.0',
        vad_threshold: '0.3'
      });
      
      const ws = new WebSocket(`wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('Timeout')); }, 10000);

      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        if (d.message_type === 'session_started') { clearTimeout(timeout); resolve(ws); }
        else if (d.message_type === 'partial_transcript' && d.text) { state.interimTranscript = d.text; updateDisplay(); }
        else if ((d.message_type === 'committed_transcript' || d.message_type === 'committed_transcript_with_timestamps') && d.text?.trim()) {
          state.transcript += d.text + ' ';
          state.interimTranscript = '';
          updateDisplay();
        }
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS Error')); };
      ws.onclose = (e) => { if (state.isRecording && e.code !== 1000) toast('Connexion perdue', 'error'); };
      state.websocket = ws;
    });

    // =========================================================================
    // AUDIO
    // =========================================================================
    const float32ToPCM16 = (f) => {
      const p = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) p[i] = Math.max(-1, Math.min(1, f[i])) * (f[i] < 0 ? 0x8000 : 0x7FFF);
      return p;
    };

    const resample = (d, r) => {
      if (r === 16000) return d;
      const ratio = r / 16000, len = Math.round(d.length / ratio), out = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const idx = i * ratio, fl = Math.floor(idx);
        out[i] = d[fl] * (1 - (idx - fl)) + (d[Math.min(fl + 1, d.length - 1)] || 0) * (idx - fl);
      }
      return out;
    };

    const toBase64 = (buf) => {
      const arr = new Uint8Array(buf);
      let str = '';
      for (let i = 0; i < arr.length; i += 8192) str += String.fromCharCode.apply(null, arr.subarray(i, i + 8192));
      return btoa(str);
    };

    const sendAudio = (data, rate) => {
      if (!state.websocket || state.websocket.readyState !== 1 || state.isPaused) return;
      try {
        state.websocket.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: toBase64(float32ToPCM16(rate !== 16000 ? resample(data, rate) : data).buffer),
          sample_rate: 16000
        }));
      } catch(e) {}
    };

    // =========================================================================
    // RECORDING
    // =========================================================================
    const startRecording = async () => {
      if (!config.apiKey) { toast('Clé API manquante', 'error'); return; }
      
      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      setUI('connecting');
      updateDisplay();

      try {
        const token = await getToken();
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const rate = state.audioContext.sampleRate;
        
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);

        await connectWS(token);

        state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
        state.scriptProcessor.onaudioprocess = (e) => {
          if (state.isRecording && !state.isPaused) sendAudio(new Float32Array(e.inputBuffer.getChannelData(0)), rate);
        };
        state.microphone.connect(state.scriptProcessor);
        state.scriptProcessor.connect(state.audioContext.destination);

        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType: mime });
        state.mediaRecorder.ondataavailable = (e) => { if (e.data.size) state.audioChunks.push(e.data); };
        state.mediaRecorder.start(500);

        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        state.timerInterval = setInterval(() => {
          if (state.isRecording && !state.isPaused) {
            els.timer.textContent = formatTime(Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000));
          }
        }, 100);

        visualize();
        setUI('recording');
        toast('Enregistrement démarré', 'success');
      } catch (err) {
        state.isRecording = false;
        setUI('idle');
        cleanup();
        toast(err.name === 'NotAllowedError' ? 'Accès micro refusé' : err.message, 'error');
      }
    };

    const cleanup = () => {
      if (state.websocket) try { state.websocket.close(1000); } catch(e) {}
      if (state.scriptProcessor) try { state.scriptProcessor.disconnect(); } catch(e) {}
      if (state.mediaRecorder?.state !== 'inactive') try { state.mediaRecorder.stop(); } catch(e) {}
      if (state.audioContext?.state !== 'closed') try { state.audioContext.close(); } catch(e) {}
      if (state.stream) state.stream.getTracks().forEach(t => t.stop());
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      state.websocket = state.scriptProcessor = null;
    };

    const stopRecording = () => {
      state.isRecording = false;
      cleanup();
      els.bars.forEach(b => b.style.height = '6px');
      setUI('idle');
      toast('Enregistrement terminé', 'success');
    };

    const togglePause = () => {
      if (!state.isRecording) return;
      state.isPaused = !state.isPaused;
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.pause();
        setUI('paused');
      } else {
        state.pausedDuration += Date.now() - state.pauseStartTime;
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        setUI('resumed');
      }
    };

    const visualize = () => {
      if (!state.analyser) return;
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      const draw = () => {
        if (!state.isRecording) { els.bars.forEach(b => b.style.height = '6px'); return; }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          els.bars.forEach((b, i) => b.style.height = `${Math.max(6, (data[i] || 0) / 255 * 100)}%`);
        }
      };
      draw();
    };

    // =========================================================================
    // EVENTS
    // =========================================================================
    els.toggle.onclick = () => panel.classList.toggle('open');
    els.close.onclick = () => panel.classList.remove('open');
    
    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && !panel.contains(e.target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });

    els.record.onclick = () => state.isRecording ? stopRecording() : startRecording();
    els.pause.onclick = togglePause;

    els.download.onclick = () => {
      if (!state.audioChunks.length) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(state.audioChunks, { type: 'audio/webm' }));
      a.download = `recording-${Date.now()}.webm`;
      a.click();
      toast('Téléchargé', 'success');
    };

    els.copy.onclick = () => {
      const txt = els.transcript.innerText?.trim();
      if (!txt) { toast('Aucun texte', 'error'); return; }
      navigator.clipboard.writeText(txt).then(() => toast('Copié!', 'success'));
    };

    els.clear.onclick = () => {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('Effacé', 'info');
    };

    els.inject.onclick = () => {
      const txt = els.transcript.innerText?.trim();
      if (!txt) { toast('Aucun texte', 'error'); return; }
      
      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact({
          type: 'event',
          payload: {
            event: { name: config.eventName },
            call_transcript: txt,
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
    };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('open')) panel.classList.remove('open');
    });

    console.log('[AudioRecorder] ✅ v6.1 Ready');
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { AudioRecorderExtension };
if (typeof window !== 'undefined') window.AudioRecorderExtension = AudioRecorderExtension;
