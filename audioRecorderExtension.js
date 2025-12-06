/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v3.2
 * Extension pour enregistrer des appels et transcrire en temps réel
 * =============================================================================
 * 
 * TRANSCRIPTION : Web Speech API (Chrome/Edge)
 * 
 * @author Voiceflow Extensions
 * @version 3.2.0
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
      return;
    }

    console.log('[AudioRecorder] Initialisation...');

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
      #vf-audio-recorder-widget {
        position: fixed;
        ${config.position === 'top' ? 'top' : 'bottom'}: ${config.widgetOffset}px;
        right: 20px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
        fill: white;
      }

      /* Panel à GAUCHE du bouton */
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
        fill: ${config.primaryColor};
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
      }

      .vf-ar-close:hover {
        background: rgba(255,255,255,0.2);
      }

      .vf-ar-close svg {
        width: 14px;
        height: 14px;
        fill: ${config.textColor};
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
      }

      .vf-ar-status-dot.recording {
        background: #ef4444;
        animation: vf-ar-blink 1s ease-in-out infinite;
      }

      .vf-ar-status-dot.paused {
        background: ${config.primaryColor};
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
        fill: white;
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
        fill: ${config.textColor};
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
        fill: ${config.primaryColor};
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
        content: '🎤 La transcription apparaîtra ici...';
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
        fill: white;
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
    // HTML avec SVG inline corrects
    // =========================================================================
    const widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = `
      <button class="vf-ar-toggle" id="vf-ar-toggle" title="Enregistreur audio">
        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
      </button>

      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            Enregistreur d'appel
          </div>
          <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
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
          <!-- Télécharger -->
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger l'audio" disabled>
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
          </button>
          
          <!-- Enregistrer/Stop -->
          <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Démarrer">
            <svg viewBox="0 0 24 24" id="vf-ar-rec-icon"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          </button>
          
          <!-- Pause -->
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
            <svg viewBox="0 0 24 24" id="vf-ar-pause-icon"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
        </div>

        <div class="vf-ar-transcript-section">
          <div class="vf-ar-transcript-header">
            <div class="vf-ar-transcript-title">
              <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
              Transcription
            </div>
            <div class="vf-ar-transcript-actions">
              <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy" title="Copier">
                <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                Copier
              </button>
              <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                Effacer
              </button>
            </div>
          </div>
          <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
          <button class="vf-ar-inject" id="vf-ar-inject" disabled>
            <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
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
      const final = state.transcript;
      const interim = state.interimTranscript;
      
      if (final || interim) {
        els.transcript.innerHTML = final + (interim ? `<span class="interim">${interim}</span>` : '');
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
        console.log('[AudioRecorder] 📝 Affichage mis à jour:', (final + interim).substring(0, 50));
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
    // WEB SPEECH API - VERSION CORRIGÉE
    // =========================================================================
    
    function createRecognition() {
      console.log('[AudioRecorder] 🔧 Création Web Speech API...');
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        console.error('[AudioRecorder] ❌ Web Speech API non supportée!');
        console.error('[AudioRecorder] ❌ Utilisez Chrome ou Edge');
        toast('⚠️ Utilisez Chrome ou Edge pour la transcription', 'error');
        return null;
      }
      
      console.log('[AudioRecorder] ✅ SpeechRecognition disponible');

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = config.language;
      recognition.maxAlternatives = 1;
      
      console.log('[AudioRecorder] 📋 Config:', {
        lang: recognition.lang,
        continuous: recognition.continuous,
        interimResults: recognition.interimResults
      });

      recognition.onstart = function() {
        console.log('[AudioRecorder] 🎤🎤🎤 RECONNAISSANCE ACTIVE 🎤🎤🎤');
      };

      recognition.onaudiostart = function() {
        console.log('[AudioRecorder] 🔊 Capture audio active');
      };

      recognition.onsoundstart = function() {
        console.log('[AudioRecorder] 🔉 Son détecté');
      };

      recognition.onspeechstart = function() {
        console.log('[AudioRecorder] 🗣️ PAROLE DÉTECTÉE!');
      };

      recognition.onresult = function(event) {
        console.log('[AudioRecorder] 📝📝📝 RÉSULTAT REÇU 📝📝📝');
        console.log('[AudioRecorder] Nombre de résultats:', event.results.length);
        
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          const conf = result[0].confidence;
          
          if (result.isFinal) {
            final += text + ' ';
            console.log('[AudioRecorder] ✅ FINAL:', text, '(conf:', Math.round(conf * 100) + '%)');
          } else {
            interim += text;
            console.log('[AudioRecorder] ⏳ Interim:', text);
          }
        }
        
        if (final) {
          state.transcript += final;
        }
        state.interimTranscript = interim;
        updateDisplay();
      };

      recognition.onerror = function(event) {
        console.error('[AudioRecorder] ❌ ERREUR:', event.error);
        
        switch(event.error) {
          case 'no-speech':
            console.log('[AudioRecorder] (Silence - normal)');
            break;
          case 'audio-capture':
            console.error('[AudioRecorder] Problème micro!');
            toast('⚠️ Problème de microphone', 'error');
            break;
          case 'not-allowed':
            console.error('[AudioRecorder] Permission refusée!');
            toast('⚠️ Permission micro refusée', 'error');
            break;
          case 'network':
            console.error('[AudioRecorder] Erreur réseau!');
            toast('⚠️ Erreur réseau - vérifiez connexion', 'error');
            break;
          case 'aborted':
            console.log('[AudioRecorder] (Interrompu)');
            break;
          default:
            console.error('[AudioRecorder] Erreur:', event.error);
        }
      };

      recognition.onend = function() {
        console.log('[AudioRecorder] 🔚 Session terminée');
        console.log('[AudioRecorder] État:', { isRecording: state.isRecording, isPaused: state.isPaused });
        
        if (state.isRecording && !state.isPaused) {
          console.log('[AudioRecorder] 🔄 Redémarrage...');
          try {
            recognition.start();
            console.log('[AudioRecorder] ✅ Redémarré');
          } catch (e) {
            console.log('[AudioRecorder] ⚠️ Déjà en cours ou erreur:', e.message);
          }
        }
      };

      recognition.onspeechend = function() {
        console.log('[AudioRecorder] 🔇 Fin de parole');
      };

      return recognition;
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
    
    async function startRecording() {
      console.log('[AudioRecorder] 🚀🚀🚀 DÉMARRAGE 🚀🚀🚀');
      
      // IMPORTANT: Définir l'état AVANT tout
      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      
      try {
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
        console.log('[AudioRecorder] ✅ Micro OK');

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

        // Web Speech API - DÉMARRAGE IMMÉDIAT
        if (config.useWebSpeech) {
          console.log('[AudioRecorder] 🎤 Initialisation Web Speech...');
          state.recognition = createRecognition();
          
          if (state.recognition) {
            console.log('[AudioRecorder] 🎤 Démarrage IMMÉDIAT de la reconnaissance...');
            try {
              state.recognition.start();
              console.log('[AudioRecorder] ✅ recognition.start() appelé');
            } catch (e) {
              console.error('[AudioRecorder] ❌ Erreur start():', e);
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
          toast('⚠️ Accès micro refusé', 'error');
        } else if (err.name === 'NotFoundError') {
          toast('⚠️ Aucun micro trouvé', 'error');
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
      toast('⏹️ Terminé', 'success');
    }

    function togglePause() {
      if (!state.isRecording) return;
      
      state.isPaused = !state.isPaused;
      
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.pause();
        if (state.recognition) try { state.recognition.stop(); } catch(e) {}
        setUI('paused');
        toast('⏸️ Pause', 'info');
      } else {
        if (state.pauseStartTime) {
          state.pausedDuration += Date.now() - state.pauseStartTime;
        }
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        if (state.recognition) {
          try { state.recognition.start(); } catch(e) {}
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
          
          logCounter++;
          if (logCounter % 120 === 0) {
            const max = Math.max(...data);
            console.log('[AudioRecorder] 📊 Audio max:', max);
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

    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte', 'error');
        return;
      }

      const payload = {
        type: 'event',
        payload: {
          event: { name: config.eventName },
          call_transcript: text.trim(),
          duration: els.timer.textContent,
          timestamp: new Date().toISOString()
        }
      };

      console.log('[AudioRecorder] 📤 Injection:', payload);

      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact(payload);
        toast('✅ Injecté!', 'success');
        
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      } else {
        toast('⚠️ Chat non trouvé', 'error');
      }
    });

    // Raccourcis clavier
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
    });

    console.log('[AudioRecorder] ✅ Extension prête');
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
