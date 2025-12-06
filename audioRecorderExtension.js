/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v3.1
 * Extension pour enregistrer des appels et transcrire en temps réel
 * =============================================================================
 * 
 * MODES DE TRANSCRIPTION :
 * 1. Web Speech API (par défaut) - Gratuit, fonctionne dans Chrome/Edge
 * 2. ElevenLabs Scribe (optionnel) - Haute qualité, nécessite clé API
 * 
 * ÉVÉNEMENT VOICEFLOW :
 * Envoie l'event "Inject_in_chat" avec le payload contenant call_transcript
 * 
 * @author Voiceflow Extensions
 * @version 3.1.0
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
      language: trace.payload?.language || 'fr-FR',
      eventName: trace.payload?.eventName || 'Inject_in_chat',
      primaryColor: trace.payload?.primaryColor || '#f5a623',
      backgroundColor: trace.payload?.backgroundColor || '#1e2a3a',
      secondaryBg: trace.payload?.secondaryBg || '#2a3a4a',
      textColor: trace.payload?.textColor || '#ffffff',
      position: trace.payload?.position || 'bottom',
      widgetOffset: trace.payload?.widgetOffset || 20,
      useWebSpeech: trace.payload?.useWebSpeech !== false,
    };

    // Éviter les doublons
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      window.__vfAudioRecorderConfig = config;
      return;
    }

    window.__vfAudioRecorderConfig = config;
    console.log('[AudioRecorder] Initialisation avec config:', config);

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
      recognition: null,
      audioContext: null,
      analyser: null,
      microphone: null,
      timerInterval: null,
      recordingStartTime: null,
      pausedDuration: 0,
      pauseStartTime: null,
      animationFrameId: null,
    };

    // =========================================================================
    // STYLES
    // =========================================================================
    const styles = document.createElement('style');
    styles.textContent = `
      /* Widget Container */
      #vf-audio-recorder-widget {
        position: fixed;
        ${config.position === 'top' ? 'top' : 'bottom'}: ${config.widgetOffset}px;
        right: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      /* Toggle Button */
      .vf-ar-toggle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor}, #e8941f);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(245, 166, 35, 0.4);
        transition: all 0.3s ease;
        position: relative;
      }

      .vf-ar-toggle:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 25px rgba(245, 166, 35, 0.5);
      }

      .vf-ar-toggle.recording {
        animation: vf-ar-pulse 1.5s ease-in-out infinite;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.5);
      }

      .vf-ar-toggle svg {
        width: 28px;
        height: 28px;
        fill: white;
      }

      /* Panel */
      .vf-ar-panel {
        position: absolute;
        ${config.position === 'top' ? 'top: 70px' : 'bottom: 70px'};
        right: 0;
        width: 380px;
        background: ${config.backgroundColor};
        border-radius: 20px;
        box-shadow: 0 10px 50px rgba(0, 0, 0, 0.4);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateY(${config.position === 'top' ? '-10px' : '10px'}) scale(0.95);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .vf-ar-panel.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      /* Header */
      .vf-ar-header {
        background: linear-gradient(135deg, ${config.secondaryBg}, ${config.backgroundColor});
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-title {
        display: flex;
        align-items: center;
        gap: 10px;
        color: ${config.textColor};
        font-weight: 600;
        font-size: 15px;
      }

      .vf-ar-title svg {
        width: 20px;
        height: 20px;
        fill: ${config.primaryColor};
      }

      .vf-ar-close {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255,255,255,0.1);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .vf-ar-close:hover {
        background: rgba(255,255,255,0.2);
      }

      .vf-ar-close svg {
        width: 16px;
        height: 16px;
        fill: ${config.textColor};
      }

      /* Timer Section */
      .vf-ar-timer-section {
        padding: 24px 20px;
        text-align: center;
        background: linear-gradient(180deg, rgba(245,166,35,0.05) 0%, transparent 100%);
      }

      .vf-ar-timer {
        font-size: 42px;
        font-weight: 700;
        color: ${config.textColor};
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }

      .vf-ar-status-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #6b7280;
        transition: all 0.3s;
      }

      .vf-ar-status-dot.recording {
        background: #ef4444;
        animation: vf-ar-blink 1s ease-in-out infinite;
      }

      .vf-ar-status-dot.paused {
        background: ${config.primaryColor};
      }

      .vf-ar-status-label {
        font-size: 13px;
        color: rgba(255,255,255,0.6);
        margin-top: 8px;
        font-weight: 500;
      }

      /* Visualizer */
      .vf-ar-visualizer {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 50px;
        gap: 3px;
        padding: 0 20px;
        margin-bottom: 16px;
      }

      .vf-ar-bar {
        width: 8px;
        min-height: 6px;
        background: linear-gradient(180deg, ${config.primaryColor}, #e8941f);
        border-radius: 4px;
        transition: height 0.05s ease;
      }

      /* Controls */
      .vf-ar-controls {
        display: flex;
        justify-content: center;
        gap: 16px;
        padding: 16px 20px;
        border-top: 1px solid rgba(255,255,255,0.1);
        background: rgba(0,0,0,0.2);
      }

      .vf-ar-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        position: relative;
      }

      .vf-ar-btn svg {
        width: 24px;
        height: 24px;
      }

      .vf-ar-btn-record {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
      }

      .vf-ar-btn-record:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.5);
      }

      .vf-ar-btn-record.recording {
        background: linear-gradient(135deg, #6b7280, #4b5563);
      }

      .vf-ar-btn-record svg {
        fill: white;
      }

      .vf-ar-btn-secondary {
        background: ${config.secondaryBg};
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
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
        fill: ${config.textColor};
      }

      /* Transcript Section */
      .vf-ar-transcript-section {
        padding: 16px 20px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .vf-ar-transcript-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        color: rgba(255,255,255,0.8);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .vf-ar-transcript-title svg {
        width: 16px;
        height: 16px;
        fill: ${config.primaryColor};
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
        background: #3b82f6;
        color: white;
      }

      .vf-ar-btn-copy svg {
        fill: white;
      }

      .vf-ar-btn-copy:hover {
        background: #2563eb;
      }

      .vf-ar-btn-clear {
        background: rgba(239, 68, 68, 0.2);
        color: #fca5a5;
      }

      .vf-ar-btn-clear svg {
        fill: #fca5a5;
      }

      .vf-ar-btn-clear:hover {
        background: rgba(239, 68, 68, 0.3);
      }

      .vf-ar-transcript {
        background: rgba(0,0,0,0.3);
        border-radius: 12px;
        padding: 14px;
        min-height: 100px;
        max-height: 180px;
        overflow-y: auto;
        color: ${config.textColor};
        font-size: 14px;
        line-height: 1.6;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .vf-ar-transcript:empty::before {
        content: '🎤 La transcription apparaîtra ici...';
        color: rgba(255,255,255,0.4);
        font-style: italic;
      }

      .vf-ar-transcript .interim {
        color: rgba(255,255,255,0.5);
        font-style: italic;
      }

      .vf-ar-transcript::-webkit-scrollbar {
        width: 6px;
      }

      .vf-ar-transcript::-webkit-scrollbar-track {
        background: transparent;
      }

      .vf-ar-transcript::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: 3px;
      }

      /* Inject Button */
      .vf-ar-inject {
        width: 100%;
        margin-top: 14px;
        padding: 14px 20px;
        border-radius: 12px;
        border: none;
        background: linear-gradient(135deg, ${config.primaryColor}, #e8941f);
        color: white;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(245, 166, 35, 0.3);
      }

      .vf-ar-inject:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(245, 166, 35, 0.4);
      }

      .vf-ar-inject:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .vf-ar-inject svg {
        width: 18px;
        height: 18px;
        fill: white;
      }

      /* Toast */
      .vf-ar-toast {
        position: fixed;
        bottom: 100px;
        right: 20px;
        padding: 14px 20px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10001;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      }

      .vf-ar-toast.show {
        opacity: 1;
        transform: translateX(0);
      }

      .vf-ar-toast.success {
        background: linear-gradient(135deg, #059669, #047857);
        color: white;
      }

      .vf-ar-toast.error {
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        color: white;
      }

      .vf-ar-toast.info {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
      }

      /* Animations */
      @keyframes vf-ar-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.7), 0 0 0 10px rgba(239, 68, 68, 0.1); }
      }

      @keyframes vf-ar-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      /* Responsive */
      @media (max-width: 420px) {
        .vf-ar-panel {
          width: calc(100vw - 40px);
          right: -10px;
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
        <svg viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      </button>

      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            <svg viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            Enregistreur d'appel
          </div>
          <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
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
            <svg viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </button>
          <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Démarrer l'enregistrement">
            <svg viewBox="0 0 24 24" id="vf-ar-rec-icon">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </button>
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
            <svg viewBox="0 0 24 24" id="vf-ar-pause-icon">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>
        </div>

        <div class="vf-ar-transcript-section">
          <div class="vf-ar-transcript-header">
            <div class="vf-ar-transcript-title">
              <svg viewBox="0 0 24 24">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              Transcription
            </div>
            <div class="vf-ar-transcript-actions">
              <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy" title="Copier">
                <svg viewBox="0 0 24 24">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                Copier
              </button>
              <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">
                <svg viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
                Effacer
              </button>
            </div>
          </div>
          <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
          <button class="vf-ar-inject" id="vf-ar-inject" disabled>
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
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
      recIcon: $('vf-ar-rec-icon'),
      pause: $('vf-ar-pause'),
      pauseIcon: $('vf-ar-pause-icon'),
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
      console.log('[AudioRecorder] 🖥️ updateDisplay() appelée');
      
      const final = state.transcript;
      const interim = state.interimTranscript;
      
      console.log('[AudioRecorder] 🖥️ État transcription:', {
        finalLength: final ? final.length : 0,
        interimLength: interim ? interim.length : 0,
        finalPreview: final ? final.substring(0, 50) : '(vide)',
        interimPreview: interim ? interim.substring(0, 50) : '(vide)'
      });
      
      if (final || interim) {
        els.transcript.innerHTML = final + (interim ? `<span class="interim"> ${interim}</span>` : '');
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
        console.log('[AudioRecorder] ✅ Affichage mis à jour');
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      }
    }

    function setUI(mode) {
      const { toggle, record, recIcon, pause, pauseIcon, dot, label, download } = els;
      
      if (mode === 'idle') {
        toggle.classList.remove('recording');
        record.classList.remove('recording');
        recIcon.innerHTML = '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>';
        pause.disabled = true;
        pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        dot.classList.remove('recording', 'paused');
        label.textContent = 'Prêt à enregistrer';
        if (state.audioChunks.length) download.disabled = false;
      } else if (mode === 'recording') {
        toggle.classList.add('recording');
        record.classList.add('recording');
        recIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
        pause.disabled = false;
        dot.classList.add('recording');
        dot.classList.remove('paused');
        label.textContent = 'Enregistrement en cours...';
      } else if (mode === 'paused') {
        pauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        dot.classList.remove('recording');
        dot.classList.add('paused');
        label.textContent = 'En pause';
      } else if (mode === 'resumed') {
        pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        dot.classList.add('recording');
        dot.classList.remove('paused');
        label.textContent = 'Enregistrement en cours...';
      }
    }

    // =========================================================================
    // WEB SPEECH API
    // =========================================================================
    
    function initWebSpeech() {
      console.log('[AudioRecorder] 🔧 Initialisation Web Speech API...');
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('[AudioRecorder] ❌ Web Speech API NON SUPPORTÉE');
        toast('⚠️ Navigateur non supporté (utilisez Chrome)', 'error');
        return null;
      }
      
      console.log('[AudioRecorder] ✅ Web Speech API disponible');

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = config.language;
      recognition.maxAlternatives = 1;
      
      console.log('[AudioRecorder] 📋 Langue:', config.language);

      recognition.onstart = () => {
        console.log('[AudioRecorder] 🎤 Reconnaissance DÉMARRÉE - en écoute...');
      };

      recognition.onaudiostart = () => {
        console.log('[AudioRecorder] 🔊 Audio capturé');
      };

      recognition.onspeechstart = () => {
        console.log('[AudioRecorder] 🗣️ PAROLE DÉTECTÉE!');
      };

      recognition.onresult = (event) => {
        console.log('[AudioRecorder] 📝 === RÉSULTAT REÇU ===');
        
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          
          if (result.isFinal) {
            final += text + ' ';
            console.log('[AudioRecorder] ✅ FINAL:', text);
          } else {
            interim += text;
            console.log('[AudioRecorder] ⏳ Interim:', text);
          }
        }
        
        if (final) {
          state.transcript += final;
          console.log('[AudioRecorder] 📄 Total:', state.transcript.length, 'caractères');
        }
        state.interimTranscript = interim;
        updateDisplay();
      };

      recognition.onerror = (event) => {
        console.error('[AudioRecorder] ❌ Erreur:', event.error);
        
        if (event.error === 'no-speech') {
          console.log('[AudioRecorder] ⚠️ Silence détecté - normal');
        } else if (event.error === 'network') {
          toast('⚠️ Erreur réseau', 'error');
        } else if (event.error === 'not-allowed') {
          toast('⚠️ Micro non autorisé', 'error');
        } else if (event.error !== 'aborted') {
          console.log('[AudioRecorder] ⚠️ Erreur:', event.error);
        }
      };

      recognition.onend = () => {
        console.log('[AudioRecorder] 🔚 Session terminée');
        console.log('[AudioRecorder] 🔚 isRecording:', state.isRecording, 'isPaused:', state.isPaused);
        
        // IMPORTANT: Redémarrer seulement si on enregistre
        if (state.isRecording && !state.isPaused) {
          console.log('[AudioRecorder] 🔄 Redémarrage automatique...');
          setTimeout(() => {
            if (state.isRecording && !state.isPaused && state.recognition) {
              try {
                state.recognition.start();
                console.log('[AudioRecorder] ✅ Redémarré');
              } catch (e) {
                console.log('[AudioRecorder] ⚠️ Déjà en cours');
              }
            }
          }, 300);
        }
      };

      return recognition;
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
    
    async function startRecording() {
      console.log('[AudioRecorder] 🚀 === DÉMARRAGE ===');
      
      // ⚠️ IMPORTANT: Définir isRecording AVANT tout
      state.isRecording = true;
      state.isPaused = false;
      
      try {
        toast('Initialisation...', 'info');
        
        console.log('[AudioRecorder] 📹 Demande micro...');
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('[AudioRecorder] ✅ Micro obtenu');

        // Audio Context
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;
        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);
        console.log('[AudioRecorder] ✅ AudioContext OK');

        // MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });
        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };
        state.mediaRecorder.start(500);
        console.log('[AudioRecorder] ✅ MediaRecorder OK');

        // Web Speech API
        if (config.useWebSpeech) {
          state.recognition = initWebSpeech();
          if (state.recognition) {
            try {
              // Petit délai pour s'assurer que tout est prêt
              setTimeout(() => {
                if (state.isRecording) {
                  state.recognition.start();
                  console.log('[AudioRecorder] ✅ Web Speech démarré');
                }
              }, 200);
            } catch (e) {
              console.error('[AudioRecorder] ❌ Erreur démarrage:', e);
            }
          }
        }

        // Timer
        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        state.timerInterval = setInterval(() => {
          if (!state.isPaused && state.isRecording) {
            const elapsed = Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000);
            els.timer.textContent = formatTime(elapsed);
          }
        }, 100);

        // Visualisation
        visualize();

        setUI('recording');
        toast('🎙️ Enregistrement démarré', 'success');

      } catch (err) {
        console.error('[AudioRecorder] ❌ Erreur:', err);
        state.isRecording = false;
        
        if (err.name === 'NotAllowedError') {
          toast('⚠️ Accès au micro refusé', 'error');
        } else if (err.name === 'NotFoundError') {
          toast('⚠️ Aucun micro détecté', 'error');
        } else {
          toast('Erreur: ' + err.message, 'error');
        }
      }
    }

    function stopRecording() {
      console.log('[AudioRecorder] ⏹️ Arrêt...');
      
      state.isRecording = false;
      state.isPaused = false;

      if (state.recognition) {
        try { state.recognition.stop(); } catch(e) {}
        state.recognition = null;
      }

      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }

      if (state.audioContext && state.audioContext.state !== 'closed') {
        state.audioContext.close().catch(() => {});
      }

      if (state.stream) {
        state.stream.getTracks().forEach(t => t.stop());
      }

      if (state.timerInterval) {
        clearInterval(state.timerInterval);
      }

      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
      }

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
        if (state.recognition) try { state.recognition.stop(); } catch(e) {}
        setUI('paused');
        toast('⏸️ En pause', 'info');
      } else {
        if (state.pauseStartTime) {
          state.pausedDuration += Date.now() - state.pauseStartTime;
        }
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        if (state.recognition) {
          setTimeout(() => {
            try { state.recognition.start(); } catch(e) {}
          }, 100);
        }
        setUI('resumed');
        toast('▶️ Reprise', 'info');
      }
    }

    function visualize() {
      if (!state.analyser || !state.isRecording) return;
      
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      let logCounter = 0;
      
      function draw() {
        if (!state.isRecording) {
          els.bars.forEach(b => b.style.height = '6px');
          return;
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          
          // Log niveau audio
          logCounter++;
          if (logCounter % 120 === 0) {
            const max = Math.max(...data);
            console.log('[AudioRecorder] 📊 Niveau audio max:', max, max > 10 ? '✅' : '⚠️ Pas de son');
          }
          
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
        state.transcript = '';
        state.interimTranscript = '';
        state.audioChunks = [];
        updateDisplay();
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
      toast('📥 Audio téléchargé', 'success');
    });

    els.copy.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte à copier', 'error');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        toast('📋 Copié!', 'success');
      }).catch(() => {
        toast('Erreur de copie', 'error');
      });
    });

    els.clear.addEventListener('click', () => {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('🗑️ Effacé', 'info');
    });

    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte à injecter', 'error');
        return;
      }

      const eventName = config.eventName;
      const payload = {
        type: 'event',
        payload: {
          event: { name: eventName },
          call_transcript: text.trim(),
          duration: els.timer.textContent,
          timestamp: new Date().toISOString()
        }
      };

      console.log('[AudioRecorder] 📤 Injection:', payload);

      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact(payload);
        toast('✅ Injecté dans le chat!', 'success');
        
        // Clear après injection
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      } else {
        toast('⚠️ Chat Voiceflow non trouvé', 'error');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        els.record.click();
      }
    });

    console.log('[AudioRecorder] ✅ Extension initialisée');
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
