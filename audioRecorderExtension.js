/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v3.0
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
 * @version 3.0.0
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
      widgetOffset: trace.payload?.widgetOffset || 80,
      useWebSpeech: trace.payload?.useWebSpeech !== false, // true par défaut
    };

    // Éviter les doublons si l'extension est déjà initialisée
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      window.__vfAudioRecorderConfig = config;
      return;
    }

    // Stocker la config globalement
    window.__vfAudioRecorderConfig = config;

    console.log('[AudioRecorder] Initialisation avec config:', {
      language: config.language,
      eventName: config.eventName,
      useWebSpeech: config.useWebSpeech,
      hasApiKey: !!config.apiKey
    });

    // =========================================================================
    // VARIABLES D'ÉTAT
    // =========================================================================
    let state = {
      isRecording: false,
      isPaused: false,
      mediaRecorder: null,
      audioContext: null,
      analyser: null,
      microphone: null,
      recognition: null, // Web Speech API
      audioChunks: [],
      transcript: '',
      interimTranscript: '',
      recordingStartTime: null,
      pausedDuration: 0,
      pauseStartTime: null,
      timerInterval: null,
      animationFrameId: null,
      stream: null,
    };

    // =========================================================================
    // STYLES CSS
    // =========================================================================
    const styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    styles.textContent = `
      /* ===== Container principal ===== */
      #vf-audio-recorder-widget {
        position: fixed;
        ${config.position === 'bottom' ? `bottom: ${config.widgetOffset}px;` : `top: ${config.widgetOffset}px;`}
        right: 20px;
        z-index: 10000;
        font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif;
      }

      /* ===== Bouton flottant principal ===== */
      .vf-ar-toggle-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}dd);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .vf-ar-toggle-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 25px rgba(0,0,0,0.35);
      }

      .vf-ar-toggle-btn svg {
        width: 24px;
        height: 24px;
        fill: ${config.backgroundColor};
        transition: all 0.3s ease;
      }

      .vf-ar-toggle-btn.recording {
        animation: vf-ar-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }

      .vf-ar-toggle-btn.recording svg {
        fill: white;
      }

      .vf-ar-rec-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 16px;
        height: 16px;
        background: #ef4444;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        border: 2px solid ${config.backgroundColor};
      }

      .vf-ar-toggle-btn.recording .vf-ar-rec-badge {
        display: flex;
        animation: vf-ar-badge-pulse 1s infinite;
      }

      .vf-ar-rec-badge::after {
        content: '';
        width: 6px;
        height: 6px;
        background: white;
        border-radius: 50%;
      }

      @keyframes vf-ar-pulse {
        0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }
        50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.7), 0 0 0 8px rgba(239, 68, 68, 0.1); }
      }

      @keyframes vf-ar-badge-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }

      /* ===== Panel étendu ===== */
      .vf-ar-panel {
        position: absolute;
        bottom: 70px;
        right: 0;
        width: 340px;
        background: ${config.backgroundColor};
        border-radius: 16px;
        box-shadow: 0 15px 50px rgba(0,0,0,0.4);
        overflow: hidden;
        transform: scale(0.9) translateY(10px);
        opacity: 0;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid rgba(255,255,255,0.08);
      }

      .vf-ar-panel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      /* ===== Header ===== */
      .vf-ar-header {
        padding: 16px 18px;
        background: ${config.secondaryBg};
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .vf-ar-title {
        color: ${config.textColor};
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .vf-ar-title-icon {
        width: 20px;
        height: 20px;
        fill: ${config.primaryColor};
      }

      .vf-ar-close-btn {
        background: rgba(255,255,255,0.06);
        border: none;
        cursor: pointer;
        padding: 6px;
        display: flex;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .vf-ar-close-btn:hover {
        background: rgba(255,255,255,0.12);
      }

      .vf-ar-close-btn svg {
        width: 14px;
        height: 14px;
        fill: ${config.textColor}77;
      }

      /* ===== Corps ===== */
      .vf-ar-body {
        padding: 18px;
      }

      /* ===== Timer ===== */
      .vf-ar-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .vf-ar-timer {
        font-size: 32px;
        font-weight: 700;
        color: ${config.textColor};
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.5px;
      }

      .vf-ar-status-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #4b5563;
        transition: all 0.3s;
      }

      .vf-ar-status-dot.recording {
        background: #ef4444;
        animation: vf-ar-blink 1s infinite;
      }

      .vf-ar-status-dot.paused {
        background: ${config.primaryColor};
      }

      @keyframes vf-ar-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }

      .vf-ar-status-label {
        text-align: center;
        font-size: 11px;
        color: ${config.textColor}66;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 14px;
      }

      /* ===== Visualiseur audio ===== */
      .vf-ar-visualizer {
        height: 60px;
        background: rgba(0,0,0,0.2);
        border-radius: 10px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 0 10px;
        overflow: hidden;
      }

      .vf-ar-bar {
        width: 4px;
        min-height: 4px;
        height: 12%;
        background: linear-gradient(to top, ${config.primaryColor}, ${config.primaryColor}88);
        border-radius: 2px;
        transition: height 0.05s ease-out;
      }

      /* ===== Contrôles ===== */
      .vf-ar-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        margin-bottom: 18px;
      }

      .vf-ar-btn {
        width: 46px;
        height: 46px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        position: relative;
      }

      .vf-ar-btn svg {
        width: 20px;
        height: 20px;
      }

      .vf-ar-btn.primary {
        width: 64px;
        height: 64px;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}cc);
        box-shadow: 0 4px 15px ${config.primaryColor}40;
      }

      .vf-ar-btn.primary svg {
        width: 28px;
        height: 28px;
        fill: ${config.backgroundColor};
      }

      .vf-ar-btn.primary:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px ${config.primaryColor}55;
      }

      .vf-ar-btn.primary.recording {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
      }

      .vf-ar-btn.secondary {
        background: rgba(255,255,255,0.08);
      }

      .vf-ar-btn.secondary svg {
        fill: ${config.textColor}bb;
      }

      .vf-ar-btn.secondary:hover {
        background: rgba(255,255,255,0.15);
      }

      .vf-ar-btn.secondary:hover svg {
        fill: ${config.textColor};
      }

      .vf-ar-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
        transform: none !important;
      }

      /* ===== Transcription ===== */
      .vf-ar-transcript-section {
        border-top: 1px solid rgba(255,255,255,0.06);
        padding-top: 16px;
      }

      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .vf-ar-transcript-title {
        color: ${config.textColor}77;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .vf-ar-transcript-actions {
        display: flex;
        gap: 4px;
      }

      .vf-ar-action-btn {
        background: rgba(255,255,255,0.06);
        border: none;
        border-radius: 5px;
        padding: 5px 10px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: ${config.textColor}99;
        transition: all 0.2s;
      }

      .vf-ar-action-btn:hover {
        background: rgba(255,255,255,0.12);
        color: ${config.textColor};
      }

      .vf-ar-action-btn svg {
        width: 12px;
        height: 12px;
        fill: currentColor;
      }

      .vf-ar-action-btn.success {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }

      .vf-ar-transcript-box {
        background: rgba(0,0,0,0.2);
        border-radius: 8px;
        padding: 12px;
        min-height: 80px;
        max-height: 140px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.5;
        color: ${config.textColor};
        border: 1px solid transparent;
        transition: all 0.2s;
        outline: none;
      }

      .vf-ar-transcript-box:focus {
        border-color: ${config.primaryColor}44;
      }

      .vf-ar-transcript-box:empty::before {
        content: 'La transcription apparaîtra ici...';
        color: ${config.textColor}33;
        font-style: italic;
      }

      .vf-ar-transcript-box .interim {
        color: ${config.primaryColor};
        opacity: 0.7;
      }

      /* ===== Bouton Injecter ===== */
      .vf-ar-inject-btn {
        width: 100%;
        margin-top: 12px;
        padding: 12px;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}cc);
        border: none;
        border-radius: 8px;
        color: ${config.backgroundColor};
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
        box-shadow: 0 3px 12px ${config.primaryColor}30;
      }

      .vf-ar-inject-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 5px 20px ${config.primaryColor}40;
      }

      .vf-ar-inject-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      .vf-ar-inject-btn svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      /* ===== Toast ===== */
      .vf-ar-toast {
        position: fixed;
        bottom: ${config.widgetOffset + 75}px;
        right: 20px;
        background: ${config.secondaryBg};
        color: ${config.textColor};
        padding: 12px 18px;
        border-radius: 8px;
        box-shadow: 0 6px 25px rgba(0,0,0,0.35);
        font-size: 13px;
        z-index: 10001;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 8px;
        border-left: 3px solid ${config.primaryColor};
      }

      .vf-ar-toast.show {
        transform: translateX(0);
        opacity: 1;
      }

      .vf-ar-toast.error { border-left-color: #ef4444; }
      .vf-ar-toast.success { border-left-color: #22c55e; }

      /* ===== Scrollbar ===== */
      .vf-ar-transcript-box::-webkit-scrollbar { width: 5px; }
      .vf-ar-transcript-box::-webkit-scrollbar-track { background: transparent; }
      .vf-ar-transcript-box::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

      /* ===== Mobile ===== */
      @media (max-width: 400px) {
        .vf-ar-panel { width: calc(100vw - 40px); }
      }
    `;
    document.head.appendChild(styles);

    // =========================================================================
    // CRÉATION DU HTML
    // =========================================================================
    const widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = `
      <button class="vf-ar-toggle-btn" id="vf-ar-toggle" title="Enregistreur d'appel">
        <svg viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <span class="vf-ar-rec-badge"></span>
      </button>

      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            <svg class="vf-ar-title-icon" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            Enregistreur d'appel
          </div>
          <button class="vf-ar-close-btn" id="vf-ar-close">
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div class="vf-ar-body">
          <div class="vf-ar-status">
            <div class="vf-ar-status-dot" id="vf-ar-dot"></div>
            <div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>
          </div>
          <div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>

          <div class="vf-ar-visualizer" id="vf-ar-visualizer">
            ${Array(32).fill('<div class="vf-ar-bar"></div>').join('')}
          </div>

          <div class="vf-ar-controls">
            <button class="vf-ar-btn secondary" id="vf-ar-download" title="Télécharger" disabled>
              <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </button>
            <button class="vf-ar-btn primary" id="vf-ar-record" title="Enregistrer">
              <svg viewBox="0 0 24 24" id="vf-ar-rec-icon">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <button class="vf-ar-btn secondary" id="vf-ar-pause" title="Pause" disabled>
              <svg viewBox="0 0 24 24" id="vf-ar-pause-icon">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            </button>
          </div>

          <div class="vf-ar-transcript-section">
            <div class="vf-ar-transcript-header">
              <span class="vf-ar-transcript-title">📝 Transcription</span>
              <div class="vf-ar-transcript-actions">
                <button class="vf-ar-action-btn" id="vf-ar-copy">
                  <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                  Copier
                </button>
                <button class="vf-ar-action-btn" id="vf-ar-clear">
                  <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  Effacer
                </button>
              </div>
            </div>
            <div class="vf-ar-transcript-box" id="vf-ar-transcript" contenteditable="true"></div>
            <button class="vf-ar-inject-btn" id="vf-ar-inject" disabled>
              <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              Injecter dans le chat
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    // =========================================================================
    // RÉFÉRENCES DOM
    // =========================================================================
    const $ = (id) => document.getElementById(id);
    const els = {
      toggle: $('vf-ar-toggle'),
      panel: $('vf-ar-panel'),
      close: $('vf-ar-close'),
      timer: $('vf-ar-timer'),
      dot: $('vf-ar-dot'),
      label: $('vf-ar-label'),
      visualizer: $('vf-ar-visualizer'),
      bars: document.querySelectorAll('#vf-ar-visualizer .vf-ar-bar'),
      record: $('vf-ar-record'),
      recIcon: $('vf-ar-rec-icon'),
      pause: $('vf-ar-pause'),
      pauseIcon: $('vf-ar-pause-icon'),
      download: $('vf-ar-download'),
      transcript: $('vf-ar-transcript'),
      copy: $('vf-ar-copy'),
      clear: $('vf-ar-clear'),
      inject: $('vf-ar-inject'),
    };

    // =========================================================================
    // FONCTIONS UTILITAIRES
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
        final: final ? final.substring(0, 50) + (final.length > 50 ? '...' : '') : '(vide)',
        finalLength: final ? final.length : 0,
        interim: interim ? interim.substring(0, 50) + (interim.length > 50 ? '...' : '') : '(vide)',
        interimLength: interim ? interim.length : 0
      });
      
      if (!els.transcript) {
        console.error('[AudioRecorder] ❌ Élément transcript introuvable!');
        return;
      }
      
      if (final || interim) {
        els.transcript.innerHTML = final + (interim ? `<span class="interim"> ${interim}</span>` : '');
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
        console.log('[AudioRecorder] ✅ Affichage mis à jour avec du texte');
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
        console.log('[AudioRecorder] ⚠️ Aucun texte à afficher');
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
        label.textContent = 'Enregistrement...';
      } else if (mode === 'paused') {
        pauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        dot.classList.remove('recording');
        dot.classList.add('paused');
        label.textContent = 'En pause';
      } else if (mode === 'resumed') {
        pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        dot.classList.add('recording');
        dot.classList.remove('paused');
        label.textContent = 'Enregistrement...';
      }
    }

    // =========================================================================
    // WEB SPEECH API
    // =========================================================================
    
    function initWebSpeech() {
      console.log('[AudioRecorder] 🔧 Initialisation Web Speech API...');
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('[AudioRecorder] ❌ Web Speech API NON SUPPORTÉE dans ce navigateur');
        console.log('[AudioRecorder] Navigateur:', navigator.userAgent);
        toast('⚠️ Web Speech API non supportée', 'error');
        return null;
      }
      
      console.log('[AudioRecorder] ✅ Web Speech API disponible');
      console.log('[AudioRecorder] 📋 Langue configurée:', config.language);

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = config.language;
      recognition.maxAlternatives = 1;
      
      console.log('[AudioRecorder] 📋 Configuration reconnaissance:', {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang,
        maxAlternatives: recognition.maxAlternatives
      });

      recognition.onstart = () => {
        console.log('[AudioRecorder] 🎤 Reconnaissance vocale DÉMARRÉE');
        console.log('[AudioRecorder] 🎤 En attente de parole...');
      };

      recognition.onaudiostart = () => {
        console.log('[AudioRecorder] 🔊 Audio capturé - microphone actif');
      };

      recognition.onsoundstart = () => {
        console.log('[AudioRecorder] 🔉 Son détecté');
      };

      recognition.onspeechstart = () => {
        console.log('[AudioRecorder] 🗣️ PAROLE DÉTECTÉE - transcription en cours...');
      };

      recognition.onspeechend = () => {
        console.log('[AudioRecorder] 🔇 Fin de parole détectée');
      };

      recognition.onsoundend = () => {
        console.log('[AudioRecorder] 🔈 Fin du son');
      };

      recognition.onaudioend = () => {
        console.log('[AudioRecorder] 🎤 Capture audio terminée');
      };

      recognition.onresult = (event) => {
        console.log('[AudioRecorder] 📝 RÉSULTAT REÇU!');
        console.log('[AudioRecorder] 📝 Nombre de résultats:', event.results.length);
        console.log('[AudioRecorder] 📝 Index du résultat:', event.resultIndex);
        
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          const confidence = result[0].confidence;
          
          console.log(`[AudioRecorder] 📝 Résultat[${i}]:`, {
            transcript: transcript,
            isFinal: result.isFinal,
            confidence: confidence ? (confidence * 100).toFixed(1) + '%' : 'N/A'
          });
          
          if (result.isFinal) {
            final += transcript + ' ';
            console.log('[AudioRecorder] ✅ Texte FINAL ajouté:', transcript);
          } else {
            interim += transcript;
            console.log('[AudioRecorder] ⏳ Texte INTERIM:', transcript);
          }
        }
        
        if (final) {
          state.transcript += final;
          console.log('[AudioRecorder] 📄 Transcription totale:', state.transcript);
        }
        state.interimTranscript = interim;
        
        console.log('[AudioRecorder] 🔄 Mise à jour affichage...');
        updateDisplay();
      };

      recognition.onerror = (event) => {
        console.error('[AudioRecorder] ❌ ERREUR reconnaissance:', event.error);
        console.error('[AudioRecorder] ❌ Message:', event.message || 'Pas de message');
        
        switch(event.error) {
          case 'not-allowed':
            console.error('[AudioRecorder] ❌ Permission micro refusée par l\'utilisateur');
            toast('⚠️ Accès au micro refusé', 'error');
            break;
          case 'no-speech':
            console.log('[AudioRecorder] ⚠️ Aucune parole détectée (normal si silence)');
            break;
          case 'audio-capture':
            console.error('[AudioRecorder] ❌ Problème de capture audio - vérifier le microphone');
            toast('⚠️ Problème de capture audio', 'error');
            break;
          case 'network':
            console.error('[AudioRecorder] ❌ Erreur réseau - connexion requise pour la transcription');
            toast('⚠️ Erreur réseau', 'error');
            break;
          case 'aborted':
            console.log('[AudioRecorder] ⚠️ Reconnaissance interrompue');
            break;
          case 'language-not-supported':
            console.error('[AudioRecorder] ❌ Langue non supportée:', config.language);
            toast('⚠️ Langue non supportée', 'error');
            break;
          case 'service-not-allowed':
            console.error('[AudioRecorder] ❌ Service non autorisé - HTTPS requis');
            toast('⚠️ HTTPS requis pour la transcription', 'error');
            break;
          default:
            console.error('[AudioRecorder] ❌ Erreur inconnue:', event.error);
            toast('Erreur: ' + event.error, 'error');
        }
      };

      recognition.onend = () => {
        console.log('[AudioRecorder] 🔚 Session de reconnaissance TERMINÉE');
        console.log('[AudioRecorder] 🔚 État actuel:', {
          isRecording: state.isRecording,
          isPaused: state.isPaused
        });
        
        // Redémarrer si toujours en enregistrement
        if (state.isRecording && !state.isPaused) {
          console.log('[AudioRecorder] 🔄 Redémarrage automatique de la reconnaissance...');
          try {
            setTimeout(() => {
              if (state.isRecording && !state.isPaused) {
                recognition.start();
                console.log('[AudioRecorder] ✅ Reconnaissance redémarrée');
              }
            }, 100);
          } catch (e) {
            console.error('[AudioRecorder] ❌ Erreur redémarrage:', e);
          }
        } else {
          console.log('[AudioRecorder] ⏹️ Pas de redémarrage (enregistrement arrêté ou en pause)');
        }
      };

      recognition.onnomatch = () => {
        console.log('[AudioRecorder] ⚠️ Aucune correspondance trouvée pour le son détecté');
      };

      console.log('[AudioRecorder] ✅ Tous les handlers configurés');
      return recognition;
    }

    // =========================================================================
    // ENREGISTREMENT
    // =========================================================================
    
    async function startRecording() {
      console.log('[AudioRecorder] 🚀 === DÉMARRAGE ENREGISTREMENT ===');
      
      try {
        toast('Initialisation...', 'info');
        
        console.log('[AudioRecorder] 📹 Demande accès microphone...');
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('[AudioRecorder] ✅ Microphone obtenu');
        console.log('[AudioRecorder] 📹 Tracks audio:', state.stream.getAudioTracks().map(t => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })));

        // Audio Context pour visualisation
        console.log('[AudioRecorder] 🔊 Création AudioContext...');
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;
        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);
        console.log('[AudioRecorder] ✅ AudioContext créé, état:', state.audioContext.state);

        // MediaRecorder pour sauvegarde
        console.log('[AudioRecorder] 💾 Création MediaRecorder...');
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm';
        console.log('[AudioRecorder] 💾 MimeType:', mimeType);
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });
        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            state.audioChunks.push(e.data);
            console.log('[AudioRecorder] 💾 Chunk audio reçu:', e.data.size, 'bytes');
          }
        };
        state.mediaRecorder.start(500);
        console.log('[AudioRecorder] ✅ MediaRecorder démarré');

        // Web Speech API
        console.log('[AudioRecorder] 🎤 Configuration Web Speech API...');
        console.log('[AudioRecorder] 🎤 useWebSpeech:', config.useWebSpeech);
        
        if (config.useWebSpeech) {
          state.recognition = initWebSpeech();
          console.log('[AudioRecorder] 🎤 Recognition object:', state.recognition ? 'CRÉÉ' : 'NULL');
          
          if (state.recognition) {
            try {
              console.log('[AudioRecorder] 🎤 Démarrage de la reconnaissance...');
              state.recognition.start();
              console.log('[AudioRecorder] ✅ Web Speech API démarrée avec succès');
            } catch (e) {
              console.error('[AudioRecorder] ❌ Erreur démarrage reconnaissance:', e);
              console.error('[AudioRecorder] ❌ Stack:', e.stack);
            }
          } else {
            console.error('[AudioRecorder] ❌ Recognition est null - Web Speech non disponible');
          }
        } else {
          console.log('[AudioRecorder] ⚠️ Web Speech désactivé dans la config');
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

        state.isRecording = true;
        setUI('recording');
        toast('🎙️ Enregistrement démarré', 'success');

      } catch (err) {
        console.error('[AudioRecorder] Erreur:', err);
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

      els.bars.forEach(b => b.style.height = '12%');
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
        if (state.recognition) try { state.recognition.start(); } catch(e) {}
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
          els.bars.forEach(b => b.style.height = '12%');
          return;
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          
          // Log niveau audio toutes les 2 secondes (environ 120 frames)
          logCounter++;
          if (logCounter % 120 === 0) {
            const avgLevel = data.reduce((a, b) => a + b, 0) / data.length;
            const maxLevel = Math.max(...data);
            console.log('[AudioRecorder] 📊 Niveau audio:', {
              moyenne: avgLevel.toFixed(1),
              max: maxLevel,
              actif: maxLevel > 10 ? '✅ Son détecté' : '⚠️ Pas de son'
            });
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
        state.audioChunks = [];
        state.transcript = '';
        state.interimTranscript = '';
        updateDisplay();
        els.timer.textContent = '00:00:00';
        els.download.disabled = true;
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
      a.download = `enregistrement_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      toast('📥 Audio téléchargé', 'success');
    });

    els.copy.addEventListener('click', () => {
      const text = els.transcript.innerText.trim();
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        els.copy.classList.add('success');
        els.copy.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copié !';
        setTimeout(() => {
          els.copy.classList.remove('success');
          els.copy.innerHTML = '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> Copier';
        }, 2000);
        toast('📋 Copié !', 'success');
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
    // INJECTION DANS VOICEFLOW - EVENT TRIGGER
    // =========================================================================
    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText.trim();
      if (!text) {
        toast('Aucun texte à injecter', 'error');
        return;
      }

      const currentConfig = window.__vfAudioRecorderConfig || config;
      const eventName = currentConfig.eventName || 'Inject_in_chat';

      // Envoyer l'EVENT Voiceflow (pas un simple complete)
      if (window.voiceflow && window.voiceflow.chat) {
        window.voiceflow.chat.interact({
          type: 'event',
          payload: {
            event: {
              name: eventName
            },
            // Données additionnelles
            call_transcript: text,
            duration: els.timer.textContent,
            timestamp: new Date().toISOString()
          }
        });

        toast('✉️ Envoyé au chat !', 'success');
        els.panel.classList.remove('open');
        
        console.log('[AudioRecorder] Event envoyé:', eventName, { transcript: text });
      } else {
        toast('Erreur: Voiceflow non disponible', 'error');
      }
    });

    els.transcript.addEventListener('input', () => {
      els.inject.disabled = !els.transcript.innerText.trim();
    });

    // Raccourcis clavier
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        els.record.click();
      }
      if (e.key === 'Escape' && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
    });

    console.log('[AudioRecorder] ✅ Extension initialisée');
    toast('🎙️ Enregistreur prêt', 'success');
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
