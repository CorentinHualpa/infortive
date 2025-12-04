/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v2.0
 * Extension pour enregistrer des appels et transcrire en temps réel via ElevenLabs
 * =============================================================================
 * 
 * Fonctionnalités :
 * - Enregistrement audio via le microphone
 * - Transcription en temps réel via ElevenLabs Scribe v2 Realtime
 * - Pause/Reprise de l'enregistrement
 * - Indicateur de niveau audio
 * - Téléchargement de l'audio enregistré
 * - Édition de la transcription
 * - Copie dans le presse-papier
 * - Injection dans le chat Voiceflow
 * 
 * Thème : Infortive (bleu marine + orange)
 * 
 * @author Voiceflow Extensions
 * @version 2.0.0
 */

const AudioRecorderExtension = {
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
      primaryColor: trace.payload?.primaryColor || '#f5a623',
      backgroundColor: trace.payload?.backgroundColor || '#1e2a3a',
      secondaryBg: trace.payload?.secondaryBg || '#2a3a4a',
      textColor: trace.payload?.textColor || '#ffffff',
      position: trace.payload?.position || 'bottom',
      widgetOffset: trace.payload?.widgetOffset || 80,
    };

    // Vérification de la clé API
    if (!config.apiKey) {
      console.error('[AudioRecorder] ⚠️ Clé API ElevenLabs manquante dans le payload');
      return;
    }

    // Éviter les doublons si l'extension est déjà initialisée
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé, mise à jour de la config');
      // Mettre à jour la clé API si nécessaire
      window.__vfAudioRecorderConfig = config;
      return;
    }

    // Stocker la config globalement
    window.__vfAudioRecorderConfig = config;

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
      websocket: null,
      audioChunks: [],
      transcript: '',
      partialTranscript: '',
      recordingStartTime: null,
      pausedDuration: 0,
      pauseStartTime: null,
      timerInterval: null,
      animationFrameId: null,
      stream: null,
      scriptProcessor: null,
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
        font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
      }

      /* ===== Bouton flottant principal ===== */
      .vf-ar-toggle-btn {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}dd);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 0 ${config.primaryColor}44;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: visible;
      }

      .vf-ar-toggle-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 25px rgba(0,0,0,0.4), 0 0 0 4px ${config.primaryColor}22;
      }

      .vf-ar-toggle-btn svg {
        width: 26px;
        height: 26px;
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

      /* Badge d'enregistrement */
      .vf-ar-rec-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 20px;
        height: 20px;
        background: #ef4444;
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        animation: vf-ar-badge-pulse 1s infinite;
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.5);
      }

      .vf-ar-toggle-btn.recording .vf-ar-rec-badge {
        display: flex;
      }

      .vf-ar-rec-badge::after {
        content: '';
        width: 8px;
        height: 8px;
        background: white;
        border-radius: 50%;
      }

      @keyframes vf-ar-pulse {
        0%, 100% { 
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4), 0 0 0 0 rgba(239, 68, 68, 0.4);
        }
        50% { 
          box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6), 0 0 0 12px rgba(239, 68, 68, 0);
        }
      }

      @keyframes vf-ar-badge-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }

      /* ===== Panel étendu ===== */
      .vf-ar-panel {
        position: absolute;
        bottom: 75px;
        right: 0;
        width: 340px;
        background: ${config.backgroundColor};
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
        overflow: hidden;
        transform: scale(0.9) translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .vf-ar-panel.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      /* ===== Header ===== */
      .vf-ar-header {
        padding: 18px 20px;
        background: linear-gradient(180deg, ${config.secondaryBg}, ${config.backgroundColor});
        border-bottom: 1px solid rgba(255,255,255,0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .vf-ar-title {
        color: ${config.textColor};
        font-size: 15px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .vf-ar-title-icon {
        width: 22px;
        height: 22px;
        fill: ${config.primaryColor};
      }

      .vf-ar-close-btn {
        background: rgba(255,255,255,0.08);
        border: none;
        cursor: pointer;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        transition: all 0.2s;
      }

      .vf-ar-close-btn:hover {
        background: rgba(255,255,255,0.15);
        transform: rotate(90deg);
      }

      .vf-ar-close-btn svg {
        width: 14px;
        height: 14px;
        fill: ${config.textColor}88;
      }

      /* ===== Corps ===== */
      .vf-ar-body {
        padding: 20px;
      }

      /* ===== Timer et statut ===== */
      .vf-ar-status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        margin-bottom: 20px;
      }

      .vf-ar-timer {
        font-size: 36px;
        font-weight: 700;
        color: ${config.textColor};
        font-variant-numeric: tabular-nums;
        letter-spacing: -1px;
      }

      .vf-ar-status-indicator {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #4b5563;
        transition: all 0.3s;
        box-shadow: 0 0 0 0 transparent;
      }

      .vf-ar-status-indicator.recording {
        background: #ef4444;
        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
        animation: vf-ar-status-blink 1.2s ease-in-out infinite;
      }

      .vf-ar-status-indicator.paused {
        background: ${config.primaryColor};
        box-shadow: 0 0 0 4px ${config.primaryColor}33;
      }

      @keyframes vf-ar-status-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .vf-ar-status-text {
        font-size: 12px;
        color: ${config.textColor}66;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: 500;
      }

      /* ===== Visualiseur audio ===== */
      .vf-ar-visualizer {
        height: 70px;
        background: rgba(0,0,0,0.25);
        border-radius: 12px;
        margin-bottom: 20px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 0 12px;
      }

      .vf-ar-bar {
        width: 5px;
        min-height: 6px;
        height: 15%;
        background: linear-gradient(to top, ${config.primaryColor}, ${config.primaryColor}66);
        border-radius: 3px;
        transition: height 0.08s ease-out;
      }

      .vf-ar-visualizer.active .vf-ar-bar {
        animation: vf-ar-bar-idle 1.5s ease-in-out infinite;
      }

      @keyframes vf-ar-bar-idle {
        0%, 100% { height: 15%; }
        50% { height: 25%; }
      }

      /* ===== Contrôles ===== */
      .vf-ar-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-bottom: 20px;
      }

      .vf-ar-control-btn {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }

      .vf-ar-control-btn svg {
        width: 22px;
        height: 22px;
        transition: all 0.2s;
      }

      .vf-ar-control-btn.primary {
        width: 72px;
        height: 72px;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}bb);
        box-shadow: 0 6px 20px ${config.primaryColor}40;
      }

      .vf-ar-control-btn.primary svg {
        width: 32px;
        height: 32px;
        fill: ${config.backgroundColor};
      }

      .vf-ar-control-btn.primary:hover {
        transform: scale(1.08);
        box-shadow: 0 8px 30px ${config.primaryColor}50;
      }

      .vf-ar-control-btn.primary:active {
        transform: scale(0.95);
      }

      .vf-ar-control-btn.primary.recording {
        background: linear-gradient(135deg, #ef4444, #dc2626);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
      }

      .vf-ar-control-btn.secondary {
        background: rgba(255,255,255,0.08);
        backdrop-filter: blur(10px);
      }

      .vf-ar-control-btn.secondary svg {
        fill: ${config.textColor}cc;
      }

      .vf-ar-control-btn.secondary:hover {
        background: rgba(255,255,255,0.15);
        transform: scale(1.05);
      }

      .vf-ar-control-btn.secondary:hover svg {
        fill: ${config.textColor};
      }

      .vf-ar-control-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
        transform: none !important;
      }

      .vf-ar-control-btn:disabled:hover {
        background: rgba(255,255,255,0.08);
      }

      /* Tooltip */
      .vf-ar-control-btn::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: -30px;
        left: 50%;
        transform: translateX(-50%) translateY(5px);
        background: ${config.secondaryBg};
        color: ${config.textColor};
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }

      .vf-ar-control-btn:hover::after {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      /* ===== Section transcription ===== */
      .vf-ar-transcript-section {
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 18px;
      }

      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }

      .vf-ar-transcript-title {
        color: ${config.textColor}88;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .vf-ar-transcript-actions {
        display: flex;
        gap: 6px;
      }

      .vf-ar-action-btn {
        background: rgba(255,255,255,0.08);
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 500;
        color: ${config.textColor}aa;
        transition: all 0.2s;
      }

      .vf-ar-action-btn:hover {
        background: rgba(255,255,255,0.15);
        color: ${config.textColor};
      }

      .vf-ar-action-btn svg {
        width: 13px;
        height: 13px;
        fill: currentColor;
      }

      .vf-ar-action-btn.success {
        background: rgba(34, 197, 94, 0.2);
        color: #22c55e;
      }

      /* Zone de texte */
      .vf-ar-transcript-box {
        background: rgba(0,0,0,0.25);
        border-radius: 10px;
        padding: 14px;
        min-height: 90px;
        max-height: 160px;
        overflow-y: auto;
        font-size: 13px;
        line-height: 1.6;
        color: ${config.textColor};
        border: 1px solid transparent;
        transition: all 0.2s;
        outline: none;
      }

      .vf-ar-transcript-box:focus {
        border-color: ${config.primaryColor}55;
        box-shadow: 0 0 0 3px ${config.primaryColor}15;
      }

      .vf-ar-transcript-box:empty::before {
        content: 'La transcription apparaîtra ici...';
        color: ${config.textColor}33;
        font-style: italic;
      }

      .vf-ar-transcript-box .partial {
        color: ${config.primaryColor};
        opacity: 0.7;
      }

      /* ===== Bouton d'injection ===== */
      .vf-ar-inject-btn {
        width: 100%;
        margin-top: 14px;
        padding: 14px;
        background: linear-gradient(135deg, ${config.primaryColor}, ${config.primaryColor}cc);
        border: none;
        border-radius: 10px;
        color: ${config.backgroundColor};
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        transition: all 0.2s;
        box-shadow: 0 4px 15px ${config.primaryColor}30;
      }

      .vf-ar-inject-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 25px ${config.primaryColor}40;
      }

      .vf-ar-inject-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .vf-ar-inject-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }

      .vf-ar-inject-btn svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      /* ===== Toast notifications ===== */
      .vf-ar-toast {
        position: fixed;
        bottom: ${config.widgetOffset + 80}px;
        right: 20px;
        background: ${config.secondaryBg};
        color: ${config.textColor};
        padding: 14px 22px;
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        font-size: 13px;
        font-weight: 500;
        z-index: 10002;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        gap: 10px;
        border-left: 4px solid ${config.primaryColor};
      }

      .vf-ar-toast.show {
        transform: translateX(0);
        opacity: 1;
      }

      .vf-ar-toast.error {
        border-left-color: #ef4444;
      }

      .vf-ar-toast.success {
        border-left-color: #22c55e;
      }

      /* ===== Scrollbar ===== */
      .vf-ar-transcript-box::-webkit-scrollbar {
        width: 6px;
      }

      .vf-ar-transcript-box::-webkit-scrollbar-track {
        background: rgba(255,255,255,0.03);
        border-radius: 3px;
      }

      .vf-ar-transcript-box::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 3px;
      }

      .vf-ar-transcript-box::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.25);
      }

      /* ===== Responsive ===== */
      @media (max-width: 400px) {
        .vf-ar-panel {
          width: calc(100vw - 40px);
          right: 0;
        }
      }
    `;
    document.head.appendChild(styles);

    // =========================================================================
    // CRÉATION DU HTML
    // =========================================================================
    const widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = `
      <!-- Bouton toggle principal -->
      <button class="vf-ar-toggle-btn" id="vf-ar-toggle" title="Enregistreur d'appel">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <span class="vf-ar-rec-badge"></span>
      </button>

      <!-- Panel étendu -->
      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            <svg class="vf-ar-title-icon" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            Enregistreur d'appel
          </div>
          <button class="vf-ar-close-btn" id="vf-ar-close" title="Fermer">
            <svg viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div class="vf-ar-body">
          <!-- Timer et statut -->
          <div class="vf-ar-status">
            <div class="vf-ar-status-indicator" id="vf-ar-status-indicator"></div>
            <div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>
          </div>
          <div class="vf-ar-status-text" id="vf-ar-status-text" style="text-align: center; margin-bottom: 16px;">Prêt à enregistrer</div>

          <!-- Visualiseur audio -->
          <div class="vf-ar-visualizer" id="vf-ar-visualizer">
            ${Array(28).fill('<div class="vf-ar-bar"></div>').join('')}
          </div>

          <!-- Contrôles -->
          <div class="vf-ar-controls">
            <button class="vf-ar-control-btn secondary" id="vf-ar-download" data-tooltip="Télécharger" disabled>
              <svg viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </button>
            
            <button class="vf-ar-control-btn primary" id="vf-ar-record" data-tooltip="Enregistrer">
              <svg viewBox="0 0 24 24" id="vf-ar-record-icon">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            
            <button class="vf-ar-control-btn secondary" id="vf-ar-pause" data-tooltip="Pause" disabled>
              <svg viewBox="0 0 24 24" id="vf-ar-pause-icon">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            </button>
          </div>

          <!-- Section transcription -->
          <div class="vf-ar-transcript-section">
            <div class="vf-ar-transcript-header">
              <span class="vf-ar-transcript-title">📝 Transcription</span>
              <div class="vf-ar-transcript-actions">
                <button class="vf-ar-action-btn" id="vf-ar-copy" title="Copier">
                  <svg viewBox="0 0 24 24">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                  </svg>
                  Copier
                </button>
                <button class="vf-ar-action-btn" id="vf-ar-clear" title="Effacer">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  Effacer
                </button>
              </div>
            </div>
            <div class="vf-ar-transcript-box" id="vf-ar-transcript" contenteditable="true"></div>
            
            <button class="vf-ar-inject-btn" id="vf-ar-inject" disabled>
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
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
    const elements = {
      toggleBtn: document.getElementById('vf-ar-toggle'),
      panel: document.getElementById('vf-ar-panel'),
      closeBtn: document.getElementById('vf-ar-close'),
      timerDisplay: document.getElementById('vf-ar-timer'),
      statusIndicator: document.getElementById('vf-ar-status-indicator'),
      statusText: document.getElementById('vf-ar-status-text'),
      visualizer: document.getElementById('vf-ar-visualizer'),
      bars: document.querySelectorAll('#vf-ar-visualizer .vf-ar-bar'),
      recordBtn: document.getElementById('vf-ar-record'),
      recordIcon: document.getElementById('vf-ar-record-icon'),
      pauseBtn: document.getElementById('vf-ar-pause'),
      pauseIcon: document.getElementById('vf-ar-pause-icon'),
      downloadBtn: document.getElementById('vf-ar-download'),
      transcriptBox: document.getElementById('vf-ar-transcript'),
      copyBtn: document.getElementById('vf-ar-copy'),
      clearBtn: document.getElementById('vf-ar-clear'),
      injectBtn: document.getElementById('vf-ar-inject'),
    };

    // =========================================================================
    // FONCTIONS UTILITAIRES
    // =========================================================================
    
    function formatTime(totalSeconds) {
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = Math.floor(totalSeconds % 60);
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    function showToast(message, type = 'info') {
      // Supprimer les toasts existants
      document.querySelectorAll('.vf-ar-toast').forEach(t => t.remove());
      
      const toast = document.createElement('div');
      toast.className = `vf-ar-toast ${type}`;
      toast.innerHTML = message;
      document.body.appendChild(toast);
      
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });
      
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
      }, 2500);
    }

    function updateTranscriptDisplay() {
      const committed = state.transcript;
      const partial = state.partialTranscript;
      
      if (committed || partial) {
        elements.transcriptBox.innerHTML = committed + (partial ? `<span class="partial"> ${partial}</span>` : '');
        elements.transcriptBox.scrollTop = elements.transcriptBox.scrollHeight;
        elements.injectBtn.disabled = false;
      } else {
        elements.transcriptBox.innerHTML = '';
        elements.injectBtn.disabled = true;
      }
    }

    function updateUI(status) {
      const { toggleBtn, recordBtn, recordIcon, pauseBtn, pauseIcon, statusIndicator, statusText, visualizer, downloadBtn } = elements;
      
      switch(status) {
        case 'idle':
          toggleBtn.classList.remove('recording');
          recordBtn.classList.remove('recording');
          recordBtn.setAttribute('data-tooltip', 'Enregistrer');
          recordIcon.innerHTML = `
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          `;
          pauseBtn.disabled = true;
          pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
          statusIndicator.classList.remove('recording', 'paused');
          statusText.textContent = 'Prêt à enregistrer';
          visualizer.classList.remove('active');
          if (state.audioChunks.length > 0) {
            downloadBtn.disabled = false;
          }
          break;
          
        case 'recording':
          toggleBtn.classList.add('recording');
          recordBtn.classList.add('recording');
          recordBtn.setAttribute('data-tooltip', 'Arrêter');
          recordIcon.innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
          pauseBtn.disabled = false;
          statusIndicator.classList.add('recording');
          statusIndicator.classList.remove('paused');
          statusText.textContent = 'Enregistrement en cours...';
          visualizer.classList.add('active');
          break;
          
        case 'paused':
          pauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
          pauseBtn.setAttribute('data-tooltip', 'Reprendre');
          statusIndicator.classList.remove('recording');
          statusIndicator.classList.add('paused');
          statusText.textContent = 'En pause';
          break;
          
        case 'resumed':
          pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
          pauseBtn.setAttribute('data-tooltip', 'Pause');
          statusIndicator.classList.add('recording');
          statusIndicator.classList.remove('paused');
          statusText.textContent = 'Enregistrement en cours...';
          break;
      }
    }

    // =========================================================================
    // WEBSOCKET ELEVENLABS
    // =========================================================================
    
    async function connectWebSocket() {
      return new Promise((resolve, reject) => {
        const currentConfig = window.__vfAudioRecorderConfig || config;
        
        // URL WebSocket avec paramètres
        const params = new URLSearchParams({
          model_id: 'scribe_v2_realtime',
          language_code: currentConfig.language,
          sample_rate: '16000',
          encoding: 'pcm_s16le'
        });
        
        const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params.toString()}`;
        
        console.log('[AudioRecorder] Connexion WebSocket...');
        
        state.websocket = new WebSocket(wsUrl, [], {
          headers: {
            'xi-api-key': currentConfig.apiKey
          }
        });

        // Comme les headers ne fonctionnent pas en JS client, on utilise l'auth dans le premier message
        state.websocket.onopen = () => {
          console.log('[AudioRecorder] WebSocket connecté, envoi auth...');
          // Envoyer l'authentification
          state.websocket.send(JSON.stringify({
            type: 'config',
            xi_api_key: currentConfig.apiKey,
            language_code: currentConfig.language,
            sample_rate: 16000,
            encoding: 'pcm_s16le'
          }));
          resolve();
        };
        
        state.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[AudioRecorder] Message reçu:', data.message_type || data.type);
            
            switch(data.message_type || data.type) {
              case 'session_started':
                console.log('[AudioRecorder] Session démarrée:', data.session_id);
                break;
                
              case 'partial_transcript':
                state.partialTranscript = data.text || '';
                updateTranscriptDisplay();
                break;
                
              case 'committed_transcript':
              case 'final_transcript':
              case 'committed_transcript_with_timestamps':
                if (data.text && data.text.trim()) {
                  state.transcript += (state.transcript ? ' ' : '') + data.text.trim();
                  state.partialTranscript = '';
                  updateTranscriptDisplay();
                }
                break;
                
              case 'error':
                console.error('[AudioRecorder] Erreur API:', data);
                showToast('Erreur: ' + (data.message || data.error || 'Erreur inconnue'), 'error');
                break;
            }
          } catch (e) {
            console.error('[AudioRecorder] Erreur parsing:', e);
          }
        };
        
        state.websocket.onerror = (error) => {
          console.error('[AudioRecorder] Erreur WebSocket:', error);
          showToast('Erreur de connexion', 'error');
          reject(error);
        };
        
        state.websocket.onclose = (event) => {
          console.log('[AudioRecorder] WebSocket fermé:', event.code, event.reason);
        };
        
        // Timeout de connexion
        setTimeout(() => {
          if (state.websocket && state.websocket.readyState !== WebSocket.OPEN) {
            reject(new Error('Timeout de connexion'));
          }
        }, 10000);
      });
    }

    function sendAudioChunk(audioData) {
      if (state.websocket && state.websocket.readyState === WebSocket.OPEN && !state.isPaused) {
        // Convertir Int16Array en base64
        const uint8Array = new Uint8Array(audioData.buffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64Audio = btoa(binary);
        
        state.websocket.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: base64Audio
        }));
      }
    }

    // =========================================================================
    // GESTION AUDIO
    // =========================================================================
    
    async function startRecording() {
      try {
        showToast('Initialisation du micro...', 'info');
        
        // Demander l'accès au micro
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Connecter au WebSocket ElevenLabs
        try {
          await connectWebSocket();
        } catch (wsError) {
          console.error('[AudioRecorder] Erreur WebSocket:', wsError);
          // Continuer sans transcription temps réel
          showToast('Mode sans transcription temps réel', 'error');
        }

        // Configuration AudioContext
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
        
        // Analyser pour la visualisation
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;
        
        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);

        // ScriptProcessor pour capturer l'audio
        state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
        state.microphone.connect(state.scriptProcessor);
        state.scriptProcessor.connect(state.audioContext.destination);
        
        state.scriptProcessor.onaudioprocess = (e) => {
          if (state.isRecording && !state.isPaused) {
            const inputData = e.inputBuffer.getChannelData(0);
            // Convertir en Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const s = Math.max(-1, Math.min(1, inputData[i]));
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            sendAudioChunk(pcmData);
          }
        };

        // MediaRecorder pour l'enregistrement local
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm';
          
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });
        
        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            state.audioChunks.push(e.data);
          }
        };

        state.mediaRecorder.start(500);

        // Démarrer le timer
        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        
        state.timerInterval = setInterval(() => {
          if (!state.isPaused && state.isRecording) {
            const elapsed = Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000);
            elements.timerDisplay.textContent = formatTime(elapsed);
          }
        }, 100);

        // Démarrer la visualisation
        visualizeAudio();

        // Mettre à jour l'état
        state.isRecording = true;
        updateUI('recording');
        
        showToast('🎙️ Enregistrement démarré', 'success');
        
      } catch (error) {
        console.error('[AudioRecorder] Erreur démarrage:', error);
        
        if (error.name === 'NotAllowedError') {
          showToast('⚠️ Accès au micro refusé', 'error');
        } else if (error.name === 'NotFoundError') {
          showToast('⚠️ Aucun micro détecté', 'error');
        } else {
          showToast('⚠️ ' + error.message, 'error');
        }
      }
    }

    function stopRecording() {
      state.isRecording = false;
      state.isPaused = false;
      
      // Arrêter le MediaRecorder
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
      }
      
      // Commit final et fermer WebSocket
      if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        try {
          state.websocket.send(JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: '',
            commit: true
          }));
        } catch (e) {
          console.log('[AudioRecorder] Erreur commit final:', e);
        }
        
        setTimeout(() => {
          if (state.websocket) {
            state.websocket.close();
            state.websocket = null;
          }
        }, 500);
      }
      
      // Arrêter le script processor
      if (state.scriptProcessor) {
        state.scriptProcessor.disconnect();
        state.scriptProcessor = null;
      }
      
      // Arrêter l'audio context
      if (state.audioContext && state.audioContext.state !== 'closed') {
        state.audioContext.close().catch(console.error);
        state.audioContext = null;
      }
      
      // Arrêter le flux média
      if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
      }
      
      // Arrêter le timer
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
      }
      
      // Arrêter la visualisation
      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
      }
      
      // Réinitialiser les barres
      elements.bars.forEach(bar => bar.style.height = '15%');
      
      // Mettre à jour l'UI
      updateUI('idle');
      
      showToast('⏹️ Enregistrement terminé', 'success');
    }

    function togglePause() {
      if (!state.isRecording) return;
      
      state.isPaused = !state.isPaused;
      
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
          state.mediaRecorder.pause();
        }
        updateUI('paused');
        showToast('⏸️ En pause', 'info');
      } else {
        if (state.pauseStartTime) {
          state.pausedDuration += Date.now() - state.pauseStartTime;
        }
        if (state.mediaRecorder && state.mediaRecorder.state === 'paused') {
          state.mediaRecorder.resume();
        }
        updateUI('resumed');
        showToast('▶️ Reprise', 'info');
      }
    }

    function visualizeAudio() {
      if (!state.analyser || !state.isRecording) return;
      
      const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
      
      function draw() {
        if (!state.isRecording) {
          elements.bars.forEach(bar => bar.style.height = '15%');
          return;
        }
        
        state.animationFrameId = requestAnimationFrame(draw);
        
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(dataArray);
          
          elements.bars.forEach((bar, index) => {
            const value = dataArray[index] || 0;
            const height = Math.max(8, (value / 255) * 100);
            bar.style.height = `${height}%`;
          });
        }
      }
      
      draw();
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    
    // Toggle panel
    elements.toggleBtn.addEventListener('click', () => {
      elements.panel.classList.toggle('open');
    });
    
    elements.closeBtn.addEventListener('click', () => {
      elements.panel.classList.remove('open');
    });
    
    // Fermer le panel en cliquant à l'extérieur
    document.addEventListener('click', (e) => {
      if (!widget.contains(e.target) && elements.panel.classList.contains('open')) {
        elements.panel.classList.remove('open');
      }
    });
    
    // Record button
    elements.recordBtn.addEventListener('click', () => {
      if (state.isRecording) {
        stopRecording();
      } else {
        state.audioChunks = []; // Reset chunks
        state.transcript = '';
        state.partialTranscript = '';
        updateTranscriptDisplay();
        elements.timerDisplay.textContent = '00:00:00';
        elements.downloadBtn.disabled = true;
        startRecording();
      }
    });
    
    // Pause button
    elements.pauseBtn.addEventListener('click', togglePause);
    
    // Download button
    elements.downloadBtn.addEventListener('click', () => {
      if (state.audioChunks.length === 0) {
        showToast('Aucun audio à télécharger', 'error');
        return;
      }
      
      const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().slice(0,19).replace(/[:-]/g, '').replace('T', '_');
      a.download = `enregistrement_${timestamp}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast('📥 Audio téléchargé', 'success');
    });
    
    // Copy button
    elements.copyBtn.addEventListener('click', () => {
      const text = elements.transcriptBox.innerText.trim();
      if (!text) {
        showToast('Aucun texte à copier', 'error');
        return;
      }
      
      navigator.clipboard.writeText(text).then(() => {
        elements.copyBtn.classList.add('success');
        elements.copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Copié !
        `;
        
        setTimeout(() => {
          elements.copyBtn.classList.remove('success');
          elements.copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copier
          `;
        }, 2000);
        
        showToast('📋 Copié dans le presse-papier', 'success');
      }).catch(() => {
        showToast('Erreur de copie', 'error');
      });
    });
    
    // Clear button
    elements.clearBtn.addEventListener('click', () => {
      state.transcript = '';
      state.partialTranscript = '';
      elements.transcriptBox.innerHTML = '';
      elements.injectBtn.disabled = true;
      showToast('🗑️ Transcription effacée', 'info');
    });
    
    // Inject button
    elements.injectBtn.addEventListener('click', () => {
      const text = elements.transcriptBox.innerText.trim();
      if (!text) {
        showToast('Aucun texte à injecter', 'error');
        return;
      }
      
      // Envoyer à Voiceflow
      if (window.voiceflow && window.voiceflow.chat) {
        window.voiceflow.chat.interact({
          type: 'complete',
          payload: {
            call_transcript: text,
            action: 'transcript_injected',
            timestamp: new Date().toISOString()
          }
        });
        
        showToast('✉️ Transcription envoyée au chat', 'success');
        elements.panel.classList.remove('open');
      } else {
        showToast('Erreur: Voiceflow non disponible', 'error');
      }
    });
    
    // Mise à jour du bouton inject quand on édite
    elements.transcriptBox.addEventListener('input', () => {
      elements.injectBtn.disabled = !elements.transcriptBox.innerText.trim();
    });

    // Raccourcis clavier
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + R pour toggle enregistrement
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        elements.recordBtn.click();
      }
      // Escape pour fermer le panel
      if (e.key === 'Escape' && elements.panel.classList.contains('open')) {
        elements.panel.classList.remove('open');
      }
    });

    console.log('[AudioRecorder] ✅ Extension initialisée avec succès');
    showToast('🎙️ Enregistreur prêt', 'success');
  }
};

// Export pour utilisation en module ES6
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension };
}

// Export pour utilisation globale
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
