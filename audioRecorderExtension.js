/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v4.4
 * Extension pour enregistrer des appels et transcrire en temps réel avec ElevenLabs
 * =============================================================================
 * 
 * TRANSCRIPTION : ElevenLabs Speech-to-Text Realtime API (WebSocket)
 * AUTHENTIFICATION : Single-use token (15 min validity)
 * 
 * CHANGELOG v4.4:
 * - Replaced SVG icons with Unicode emojis for better cross-browser compatibility
 * - Main buttons now use: 🎙️ ⏹️ ⏸️ ▶️ ⬇️
 * - Fixed event payload structure for Voiceflow
 * 
 * @author Voiceflow Extensions
 * @version 4.4.0
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
      primaryColor: trace.payload?.primaryColor || '#f5a623',
      backgroundColor: trace.payload?.backgroundColor || '#1e2a3a',
      secondaryBg: trace.payload?.secondaryBg || '#2a3a4a',
      textColor: trace.payload?.textColor || '#ffffff',
      position: trace.payload?.position || 'bottom',
      widgetOffset: trace.payload?.widgetOffset || 20,
      // ElevenLabs specific
      modelId: trace.payload?.modelId || 'scribe_v2_realtime',
      sampleRate: 16000,
    };

    // Validation de la clé API
    if (!config.apiKey) {
      console.error('[AudioRecorder] ❌ Clé API ElevenLabs manquante!');
    } else {
      console.log('[AudioRecorder] ✅ Clé API présente');
    }

    // Éviter les doublons
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      return;
    }

    console.log('[AudioRecorder] 🚀 Initialisation avec ElevenLabs STT...');
    console.log('[AudioRecorder] 📋 Config:', { 
      language: config.language, 
      modelId: config.modelId,
      hasApiKey: !!config.apiKey 
    });

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
    };

    // =========================================================================
    // SVG ICONS - With explicit fill colors for maximum compatibility
    // =========================================================================
    const ICONS = {
      // Icônes blanches pour les boutons
      microphone: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
      stop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
      pause: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
      play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M8 5v14l11-7z"/></svg>`,
      download: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
      close: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
      send: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
      // Icônes colorées pour le header et les labels
      microphoneOrange: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${config.primaryColor}"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`,
      documentOrange: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${config.primaryColor}"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
      copy: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
      trash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#fca5a5"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    };

    // =========================================================================
    // STYLES
    // =========================================================================
    const styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    styles.textContent = `
      #vf-audio-recorder-widget {
        position: fixed;
        ${config.position === 'top' ? 'top' : 'bottom'}: ${config.widgetOffset}px;
        right: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #vf-audio-recorder-widget * {
        box-sizing: border-box;
      }

      .vf-ar-toggle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor}, #e8941f);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(245, 166, 35, 0.4);
        transition: all 0.3s ease;
        padding: 0;
      }

      .vf-ar-toggle:hover {
        transform: scale(1.1);
      }

      .vf-ar-toggle.recording {
        animation: vf-ar-pulse 1.5s ease-in-out infinite;
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }

      .vf-ar-toggle svg {
        width: 26px;
        height: 26px;
        display: block;
      }

      .vf-ar-toggle .vf-ar-icon {
        font-size: 26px;
      }

      .vf-ar-panel {
        position: absolute;
        ${config.position === 'top' ? 'top: 0' : 'bottom: 0'};
        right: 70px;
        width: 360px;
        background: ${config.backgroundColor};
        border-radius: 16px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateX(20px) scale(0.95);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .vf-ar-panel.open {
        opacity: 1;
        visibility: visible;
        transform: translateX(0) scale(1);
      }

      .vf-ar-header {
        background: ${config.secondaryBg};
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-title {
        display: flex;
        align-items: center;
        gap: 8px;
        color: ${config.textColor};
        font-weight: 600;
        font-size: 14px;
      }

      .vf-ar-title svg {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        display: block;
      }

      .vf-ar-badge {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }

      .vf-ar-close {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(255,255,255,0.1);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        padding: 0;
      }

      .vf-ar-close:hover {
        background: rgba(255,255,255,0.2);
      }

      .vf-ar-close svg {
        width: 14px;
        height: 14px;
        display: block;
      }

      .vf-ar-timer-section {
        padding: 20px 16px;
        text-align: center;
      }

      .vf-ar-timer {
        font-size: 36px;
        font-weight: 700;
        color: ${config.textColor};
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }

      .vf-ar-status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #6b7280;
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
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        margin-top: 6px;
      }

      .vf-ar-visualizer {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 50px;
        gap: 3px;
        padding: 0 16px;
        margin-bottom: 12px;
      }

      .vf-ar-bar {
        width: 8px;
        min-height: 6px;
        background: linear-gradient(180deg, ${config.primaryColor}, #e8941f);
        border-radius: 4px;
        transition: height 0.05s ease;
      }

      .vf-ar-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        background: rgba(0,0,0,0.2);
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-btn {
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        padding: 0;
      }

      .vf-ar-btn-record {
        width: 60px;
        height: 60px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
      }

      .vf-ar-btn-record:hover {
        transform: scale(1.1);
      }

      .vf-ar-btn-record.recording {
        background: linear-gradient(135deg, #6b7280, #4b5563);
      }

      .vf-ar-btn-record svg {
        width: 28px;
        height: 28px;
        display: block;
      }

      .vf-ar-icon {
        font-size: 24px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .vf-ar-btn-record .vf-ar-icon {
        font-size: 28px;
      }

      .vf-ar-btn-secondary {
        width: 48px;
        height: 48px;
        background: ${config.secondaryBg};
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }

      .vf-ar-btn-secondary:hover:not(:disabled) {
        background: #3a4a5a;
        transform: scale(1.05);
      }

      .vf-ar-btn-secondary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .vf-ar-btn-secondary svg {
        width: 22px;
        height: 22px;
        display: block;
      }

      .vf-ar-transcript-section {
        padding: 14px 16px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .vf-ar-transcript-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: rgba(255,255,255,0.7);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .vf-ar-transcript-title svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        display: block;
      }

      .vf-ar-transcript-actions {
        display: flex;
        gap: 6px;
      }

      .vf-ar-action-btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 6px 10px;
        border-radius: 6px;
        border: none;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }

      .vf-ar-action-btn svg {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        display: block;
      }

      .vf-ar-btn-copy {
        background: #3b82f6;
        color: white;
      }

      .vf-ar-btn-copy:hover {
        background: #2563eb;
      }

      .vf-ar-btn-clear {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }

      .vf-ar-btn-clear:hover {
        background: rgba(239, 68, 68, 0.3);
      }

      .vf-ar-transcript {
        background: rgba(0,0,0,0.3);
        border-radius: 10px;
        padding: 12px;
        min-height: 80px;
        max-height: 140px;
        overflow-y: auto;
        color: ${config.textColor};
        font-size: 13px;
        line-height: 1.5;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-transcript:empty::before {
        content: '🎤 La transcription ElevenLabs apparaîtra ici...';
        color: rgba(255,255,255,0.4);
        font-style: italic;
      }

      .vf-ar-transcript .interim {
        color: rgba(255,255,255,0.5);
        font-style: italic;
      }

      .vf-ar-transcript::-webkit-scrollbar {
        width: 5px;
      }

      .vf-ar-transcript::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: 3px;
      }

      .vf-ar-inject {
        width: 100%;
        margin-top: 12px;
        padding: 12px 16px;
        border-radius: 10px;
        border: none;
        background: linear-gradient(135deg, ${config.primaryColor}, #e8941f);
        color: white;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.3s ease;
        box-shadow: 0 4px 12px rgba(245, 166, 35, 0.3);
      }

      .vf-ar-inject:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(245, 166, 35, 0.4);
      }

      .vf-ar-inject:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .vf-ar-inject svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        display: block;
      }

      .vf-ar-toast {
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        padding: 12px 20px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        opacity: 0;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      }

      .vf-ar-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .vf-ar-toast.success { background: #059669; color: white; }
      .vf-ar-toast.error { background: #dc2626; color: white; }
      .vf-ar-toast.info { background: #3b82f6; color: white; }

      @keyframes vf-ar-pulse {
        0%, 100% { box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 4px 25px rgba(239, 68, 68, 0.7), 0 0 0 8px rgba(239, 68, 68, 0.1); }
      }

      @keyframes vf-ar-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      @media (max-width: 500px) {
        .vf-ar-panel {
          width: 300px;
          right: 65px;
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
        <span class="vf-ar-icon">🎙️</span>
      </button>

      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            ${ICONS.microphoneOrange}
            Enregistreur d'appel
            <span class="vf-ar-badge">ElevenLabs</span>
          </div>
          <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
            <span style="font-size: 16px; font-weight: bold;">✕</span>
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
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger l'audio" disabled>
            <span class="vf-ar-icon">⬇️</span>
          </button>
          
          <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Démarrer l'enregistrement">
            <span class="vf-ar-icon">🎙️</span>
          </button>
          
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
            <span class="vf-ar-icon">⏸️</span>
          </button>
        </div>

        <div class="vf-ar-transcript-section">
          <div class="vf-ar-transcript-header">
            <div class="vf-ar-transcript-title">
              ${ICONS.documentOrange}
              Transcription
            </div>
            <div class="vf-ar-transcript-actions">
              <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy" title="Copier">
                ${ICONS.copy}
                Copier
              </button>
              <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">
                ${ICONS.trash}
                Effacer
              </button>
            </div>
          </div>
          <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
          <button class="vf-ar-inject" id="vf-ar-inject" disabled>
            ${ICONS.send}
            Injecter dans le chat
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    // =========================================================================
    // REFERENCES
    // =========================================================================
    const $ = id => document.getElementById(id);
    const els = {
      toggle: $('vf-ar-toggle'),
      panel: $('vf-ar-panel'),
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
      
      // Get the icon spans
      const recordIcon = record.querySelector('.vf-ar-icon');
      const pauseIcon = pause.querySelector('.vf-ar-icon');
      
      switch(mode) {
        case 'idle':
          toggle.classList.remove('recording');
          record.classList.remove('recording');
          if (recordIcon) recordIcon.textContent = '🎙️';
          pause.disabled = true;
          if (pauseIcon) pauseIcon.textContent = '⏸️';
          dot.classList.remove('recording', 'paused', 'connecting');
          label.textContent = 'Prêt à enregistrer';
          if (state.audioChunks.length) download.disabled = false;
          break;

        case 'connecting':
          dot.classList.add('connecting');
          dot.classList.remove('recording', 'paused');
          label.textContent = 'Connexion à ElevenLabs...';
          break;

        case 'recording':
          toggle.classList.add('recording');
          record.classList.add('recording');
          if (recordIcon) recordIcon.textContent = '⏹️';
          pause.disabled = false;
          dot.classList.add('recording');
          dot.classList.remove('paused', 'connecting');
          label.textContent = 'Enregistrement + Transcription...';
          break;

        case 'paused':
          if (pauseIcon) pauseIcon.textContent = '▶️';
          dot.classList.remove('recording', 'connecting');
          dot.classList.add('paused');
          label.textContent = 'En pause';
          break;

        case 'resumed':
          if (pauseIcon) pauseIcon.textContent = '⏸️';
          dot.classList.add('recording');
          dot.classList.remove('paused', 'connecting');
          label.textContent = 'Enregistrement + Transcription...';
          break;
      }
    }

    // =========================================================================
    // ELEVENLABS API - GET SINGLE USE TOKEN
    // =========================================================================

    async function getElevenLabsToken() {
      console.log('[AudioRecorder] 🔑 Demande de token ElevenLabs...');
      
      const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: {
          'xi-api-key': config.apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AudioRecorder] ❌ Erreur token:', response.status, errorText);
        throw new Error(`Erreur token: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[AudioRecorder] ✅ Token obtenu:', data.token?.substring(0, 20) + '...');
      return data.token;
    }

    // =========================================================================
    // ELEVENLABS WEBSOCKET - SPEECH TO TEXT
    // =========================================================================
    
    function connectElevenLabsWebSocket(token) {
      return new Promise((resolve, reject) => {
        console.log('[AudioRecorder] 🔌 Connexion WebSocket ElevenLabs...');
        
        // Construire l'URL WebSocket avec le token
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

        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${wsParams.toString()}`;
        console.log('[AudioRecorder] 🔗 URL WebSocket (token masqué)');

        const ws = new WebSocket(wsUrl);

        // Timeout de connexion
        const connectionTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.error('[AudioRecorder] ❌ Timeout connexion WebSocket');
            ws.close();
            reject(new Error('Timeout de connexion (10s)'));
          }
        }, 10000);

        ws.onopen = () => {
          console.log('[AudioRecorder] ✅ WebSocket ouvert, attente session...');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            switch(data.message_type) {
              case 'session_started':
                clearTimeout(connectionTimeout);
                state.sessionId = data.session_id;
                console.log('[AudioRecorder] ✅ Session ElevenLabs démarrée:', data.session_id);
                console.log('[AudioRecorder] 📋 Config serveur:', data.config);
                resolve(ws);
                break;

              case 'partial_transcript':
                if (data.text) {
                  console.log('[AudioRecorder] 📝 Partiel:', data.text);
                  state.interimTranscript = data.text;
                  updateDisplay();
                }
                break;

              case 'committed_transcript':
                if (data.text && data.text.trim()) {
                  console.log('[AudioRecorder] ✅ Final:', data.text);
                  state.transcript += data.text + ' ';
                  state.interimTranscript = '';
                  updateDisplay();
                }
                break;

              case 'committed_transcript_with_timestamps':
                if (data.text && data.text.trim()) {
                  console.log('[AudioRecorder] ✅ Final (timestamps):', data.text);
                  state.transcript += data.text + ' ';
                  state.interimTranscript = '';
                  updateDisplay();
                }
                break;

              default:
                // Gérer les erreurs
                if (data.message_type?.includes('error') || data.error) {
                  console.error('[AudioRecorder] ❌ Erreur ElevenLabs:', data);
                  toast('Erreur: ' + (data.message || data.error || 'Erreur inconnue'), 'error');
                } else {
                  console.log('[AudioRecorder] 📨 Message:', data.message_type, data);
                }
            }
          } catch (e) {
            console.error('[AudioRecorder] ❌ Erreur parsing:', e, event.data);
          }
        };

        ws.onerror = (error) => {
          console.error('[AudioRecorder] ❌ Erreur WebSocket:', error);
          clearTimeout(connectionTimeout);
          reject(new Error('Erreur WebSocket'));
        };

        ws.onclose = (event) => {
          console.log('[AudioRecorder] 🔌 WebSocket fermé:', event.code, event.reason);
          clearTimeout(connectionTimeout);
          
          if (state.isRecording && event.code !== 1000) {
            toast('Connexion ElevenLabs perdue', 'error');
          }
        };

        state.websocket = ws;
      });
    }

    // =========================================================================
    // AUDIO PROCESSING - PCM 16-bit 16kHz
    // =========================================================================

    function float32ToPCM16(float32Array) {
      const pcm16 = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return pcm16;
    }

    function resampleTo16kHz(audioData, originalSampleRate) {
      if (originalSampleRate === 16000) {
        return audioData;
      }

      const ratio = originalSampleRate / 16000;
      const newLength = Math.round(audioData.length / ratio);
      const result = new Float32Array(newLength);

      for (let i = 0; i < newLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
        const t = srcIndex - srcIndexFloor;
        result[i] = audioData[srcIndexFloor] * (1 - t) + audioData[srcIndexCeil] * t;
      }

      return result;
    }

    function arrayBufferToBase64(buffer) {
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    }

    function sendAudioChunk(audioData, sampleRate) {
      if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (state.isPaused) {
        return;
      }

      // Resampler si nécessaire
      let processedAudio = audioData;
      if (sampleRate !== 16000) {
        processedAudio = resampleTo16kHz(audioData, sampleRate);
      }

      // Convertir en PCM 16-bit
      const pcm16 = float32ToPCM16(processedAudio);
      
      // Convertir en base64
      const base64Audio = arrayBufferToBase64(pcm16.buffer);

      // Envoyer à ElevenLabs
      const message = {
        message_type: 'input_audio_chunk',
        audio_base_64: base64Audio,
        sample_rate: 16000
      };

      try {
        state.websocket.send(JSON.stringify(message));
      } catch (e) {
        console.error('[AudioRecorder] ❌ Erreur envoi audio:', e);
      }
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
    
    async function startRecording() {
      console.log('[AudioRecorder] 🚀 DÉMARRAGE...');
      
      // Vérifier la clé API
      if (!config.apiKey) {
        toast('❌ Clé API ElevenLabs manquante!', 'error');
        return;
      }

      // Réinitialiser l'état
      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      
      setUI('connecting');
      updateDisplay();

      try {
        // 1. Obtenir un token single-use
        console.log('[AudioRecorder] 🔑 Obtention du token...');
        const token = await getElevenLabsToken();
        state.sttToken = token;

        // 2. Demander l'accès au microphone
        console.log('[AudioRecorder] 🎤 Demande accès micro...');
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: 16000 },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('[AudioRecorder] ✅ Micro OK');

        // 3. Configurer l'AudioContext
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const actualSampleRate = state.audioContext.sampleRate;
        console.log('[AudioRecorder] 🎵 Sample rate navigateur:', actualSampleRate);

        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;

        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);

        // 4. Connecter au WebSocket ElevenLabs
        console.log('[AudioRecorder] 🔌 Connexion ElevenLabs...');
        await connectElevenLabsWebSocket(token);
        console.log('[AudioRecorder] ✅ ElevenLabs connecté!');

        // 5. Créer un ScriptProcessor pour capturer l'audio
        const bufferSize = 4096;
        state.scriptProcessor = state.audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        state.scriptProcessor.onaudioprocess = (event) => {
          if (!state.isRecording || state.isPaused) return;

          const inputData = event.inputBuffer.getChannelData(0);
          const audioData = new Float32Array(inputData);

          // Envoyer à ElevenLabs
          sendAudioChunk(audioData, actualSampleRate);
        };

        state.microphone.connect(state.scriptProcessor);
        state.scriptProcessor.connect(state.audioContext.destination);
        console.log('[AudioRecorder] ✅ Audio pipeline OK');

        // 6. Configurer MediaRecorder pour sauvegarder l'audio
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });
        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };
        state.mediaRecorder.start(500);
        console.log('[AudioRecorder] ✅ MediaRecorder OK');

        // 7. Démarrer le timer
        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        state.timerInterval = setInterval(() => {
          if (!state.isPaused && state.isRecording) {
            const elapsed = Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000);
            els.timer.textContent = formatTime(elapsed);
          }
        }, 100);

        // 8. Démarrer la visualisation
        visualize();
        
        setUI('recording');
        toast('🎙️ Enregistrement + Transcription actifs', 'success');

      } catch (err) {
        console.error('[AudioRecorder] ❌ Erreur:', err);
        state.isRecording = false;
        setUI('idle');
        
        // Nettoyer les ressources partiellement initialisées
        cleanupResources();
        
        if (err.name === 'NotAllowedError') {
          toast('⚠️ Accès micro refusé', 'error');
        } else if (err.name === 'NotFoundError') {
          toast('⚠️ Aucun micro trouvé', 'error');
        } else if (err.message.includes('token') || err.message.includes('401') || err.message.includes('403')) {
          toast('⚠️ Clé API ElevenLabs invalide', 'error');
        } else if (err.message.includes('CORS') || err.message.includes('Failed to fetch')) {
          toast('⚠️ Erreur réseau - voir console', 'error');
          console.error('[AudioRecorder] 💡 Si erreur CORS, utilisez un proxy ou Voiceflow Function');
        } else {
          toast('Erreur: ' + err.message, 'error');
        }
      }
    }

    function cleanupResources() {
      // Fermer WebSocket
      if (state.websocket) {
        try { 
          state.websocket.close(1000, 'Cleanup'); 
        } catch(e) {}
        state.websocket = null;
      }

      // Arrêter le ScriptProcessor
      if (state.scriptProcessor) {
        try {
          state.scriptProcessor.disconnect();
        } catch(e) {}
        state.scriptProcessor = null;
      }

      // Arrêter MediaRecorder
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        try {
          state.mediaRecorder.stop();
        } catch(e) {}
      }

      // Fermer AudioContext
      if (state.audioContext && state.audioContext.state !== 'closed') {
        try {
          state.audioContext.close();
        } catch(e) {}
      }

      // Arrêter le stream
      if (state.stream) {
        state.stream.getTracks().forEach(t => t.stop());
      }

      // Arrêter le timer
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
      }

      // Arrêter la visualisation
      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
      }
    }

    function stopRecording() {
      console.log('[AudioRecorder] ⏹️ Arrêt...');
      
      state.isRecording = false;
      state.isPaused = false;

      cleanupResources();

      // Réinitialiser les barres
      els.bars.forEach(b => b.style.height = '6px');

      setUI('idle');
      toast('⏹️ Enregistrement terminé', 'success');
    }

    function togglePause() {
      if (!state.isRecording) return;
      
      state.isPaused = !state.isPaused;
      
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.pause();
        setUI('paused');
        toast('⏸️ Pause', 'info');
      } else {
        if (state.pauseStartTime) {
          state.pausedDuration += Date.now() - state.pauseStartTime;
        }
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        setUI('resumed');
        toast('▶️ Reprise', 'info');
      }
    }

    function visualize() {
      if (!state.analyser || !state.isRecording) return;
      
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      
      function draw() {
        if (!state.isRecording) {
          els.bars.forEach(b => b.style.height = '6px');
          return;
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          els.bars.forEach((bar, i) => {
            const v = data[i] || 0;
            bar.style.height = `${Math.max(6, (v / 255) * 100)}%`;
          });
        }
      }
      draw();
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    
    els.toggle.addEventListener('click', () => els.panel.classList.toggle('open'));
    els.close.addEventListener('click', () => els.panel.classList.remove('open'));
    
    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
    });

    els.record.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    els.pause.addEventListener('click', togglePause);

    els.download.addEventListener('click', () => {
      if (!state.audioChunks.length) return;
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enregistrement-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      toast('📥 Téléchargé', 'success');
    });

    els.copy.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte', 'error');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        toast('📋 Copié!', 'success');
      });
    });

    els.clear.addEventListener('click', () => {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('🗑️ Effacé', 'info');
    });

    // =========================================================================
    // INJECTION DANS VOICEFLOW - Configuration de l'event
    // Structure conforme à la documentation Voiceflow Events
    // =========================================================================
    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte', 'error');
        return;
      }

      // Payload pour Voiceflow - Structure CORRECTE selon la doc
      // https://docs.voiceflow.com/docs/using-events
      const interactPayload = {
        type: 'event',  // ✅ Toujours 'event' pour déclencher un Event Trigger
        payload: {
          event: {
            name: config.eventName  // Le nom de l'event défini dans Event CMS (ex: "Inject_in_chat")
          },
          // Données additionnelles accessibles via last_event.payload
          call_transcript: text.trim(),
          duration: els.timer.textContent,
          timestamp: new Date().toISOString()
        }
      };

      console.log('[AudioRecorder] 📤 Injection dans Voiceflow:', interactPayload);
      console.log('[AudioRecorder] 📨 Event name:', config.eventName);

      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact(interactPayload);
        toast('✅ Injecté dans le chat!', 'success');
        
        // Réinitialiser après injection
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      } else {
        console.error('[AudioRecorder] ❌ window.voiceflow.chat.interact non disponible');
        toast('⚠️ Chat Voiceflow non trouvé', 'error');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
    });

    console.log('[AudioRecorder] ✅ Extension ElevenLabs v4.4 prête');
    console.log('[AudioRecorder] 📋 Modèle:', config.modelId);
    console.log('[AudioRecorder] 🌍 Langue:', config.language);
    console.log('[AudioRecorder] 📨 Event:', config.eventName);
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension };
}

if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
