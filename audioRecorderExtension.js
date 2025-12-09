/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v5.0
 * Extension pour enregistrer des appels et transcrire en temps réel avec ElevenLabs
 * =============================================================================
 * 
 * TRANSCRIPTION : ElevenLabs Speech-to-Text Realtime API (WebSocket)
 * AUTHENTIFICATION : Single-use token (15 min validity)
 * 
 * CHANGELOG v5.0:
 * - Fixed emoji icons replaced by proper SVG icons (WordPress emoji conversion issue)
 * - All button icons are now SVG with explicit sizing
 * - Improved panel positioning (won't overflow screen)
 * - More modern, softer color palette
 * - Better responsive design
 * - Fixed transcript actions buttons overflow
 * - Cleaner, more professional appearance
 * 
 * @author Voiceflow Extensions
 * @version 5.0.0
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
      // Couleurs plus douces et modernes
      primaryColor: trace.payload?.primaryColor || '#f59e0b',
      backgroundColor: trace.payload?.backgroundColor || '#0f172a',
      secondaryBg: trace.payload?.secondaryBg || '#1e293b',
      textColor: trace.payload?.textColor || '#f8fafc',
      accentColor: trace.payload?.accentColor || '#3b82f6',
      position: trace.payload?.position || 'bottom',
      widgetOffset: trace.payload?.widgetOffset || 100,
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
    // SVG ICONS - Toutes les icônes en SVG pour éviter la conversion WordPress
    // =========================================================================
    const ICONS = {
      // Icône microphone (pour le toggle button et record)
      microphone: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>`,
      
      // Icône stop (carré arrondi)
      stop: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <rect x="6" y="6" width="12" height="12" rx="2"/>
        </svg>`,
      
      // Icône pause
      pause: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>`,
      
      // Icône play
      play: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M8 5v14l11-7z"/>
        </svg>`,
      
      // Icône download
      download: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>`,
      
      // Icône close (X)
      close: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>`,
      
      // Icône send
      send: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>`,
      
      // Icône copy
      copy: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
        </svg>`,
      
      // Icône trash
      trash: (color = '#f87171', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>`,
      
      // Icône document/transcript
      document: (color = '#FFFFFF', size = 24) => `
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">
          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>`,
    };

    // =========================================================================
    // STYLES - Design moderne et épuré
    // =========================================================================
    const styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    styles.textContent = `
      /* Reset pour éviter les conflits avec le site hôte */
      #vf-audio-recorder-widget,
      #vf-audio-recorder-widget * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.4;
      }
      
      #vf-audio-recorder-widget {
        position: fixed;
        ${config.position === 'top' ? 'top' : 'bottom'}: ${config.widgetOffset}px;
        right: 20px;
        z-index: 10000;
      }
      
      /* Bouton toggle principal */
      .vf-ar-toggle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${config.primaryColor} 0%, #d97706 100%);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(245, 158, 11, 0.35);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .vf-ar-toggle:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 25px rgba(245, 158, 11, 0.45);
      }
      
      .vf-ar-toggle.recording {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        animation: vf-ar-pulse 2s ease-in-out infinite;
        box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
      }
      
      .vf-ar-toggle svg {
        width: 26px;
        height: 26px;
        flex-shrink: 0;
      }
      
      /* Panel principal */
      .vf-ar-panel {
        position: absolute;
        ${config.position === 'top' ? 'top: 0' : 'bottom: 0'};
        right: 70px;
        width: 320px;
        max-width: calc(100vw - 100px);
        background: ${config.backgroundColor};
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
        overflow: hidden;
        opacity: 0;
        visibility: hidden;
        transform: translateX(10px) scale(0.96);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      .vf-ar-panel.open {
        opacity: 1;
        visibility: visible;
        transform: translateX(0) scale(1);
      }
      
      /* Header */
      .vf-ar-header {
        background: ${config.secondaryBg};
        padding: 14px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .vf-ar-title {
        display: flex;
        align-items: center;
        gap: 10px;
        color: ${config.textColor};
        font-weight: 600;
        font-size: 14px;
      }
      
      .vf-ar-title svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      
      .vf-ar-badge {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        font-size: 9px;
        padding: 3px 7px;
        border-radius: 4px;
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      
      .vf-ar-close {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      .vf-ar-close:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      
      .vf-ar-close svg {
        width: 16px;
        height: 16px;
      }
      
      /* Timer section */
      .vf-ar-timer-section {
        padding: 24px 16px 16px;
        text-align: center;
      }
      
      .vf-ar-timer {
        font-size: 40px;
        font-weight: 700;
        color: ${config.textColor};
        font-variant-numeric: tabular-nums;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        letter-spacing: -1px;
      }
      
      .vf-ar-status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #475569;
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
        background: ${config.accentColor};
        animation: vf-ar-blink 0.5s ease-in-out infinite;
      }
      
      .vf-ar-status-label {
        font-size: 12px;
        color: #64748b;
        margin-top: 8px;
        font-weight: 500;
      }
      
      /* Visualizer */
      .vf-ar-visualizer {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        height: 48px;
        gap: 3px;
        padding: 0 20px;
        margin-bottom: 8px;
      }
      
      .vf-ar-bar {
        width: 6px;
        min-height: 4px;
        background: linear-gradient(180deg, ${config.primaryColor} 0%, #d97706 100%);
        border-radius: 3px;
        transition: height 0.05s ease-out;
      }
      
      /* Controls */
      .vf-ar-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: rgba(0, 0, 0, 0.15);
      }
      
      .vf-ar-btn {
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        flex-shrink: 0;
      }
      
      .vf-ar-btn-record {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);
      }
      
      .vf-ar-btn-record:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(239, 68, 68, 0.45);
      }
      
      .vf-ar-btn-record.recording {
        background: linear-gradient(135deg, #64748b 0%, #475569 100%);
        box-shadow: 0 4px 15px rgba(100, 116, 139, 0.3);
      }
      
      .vf-ar-btn-record svg {
        width: 28px;
        height: 28px;
      }
      
      .vf-ar-btn-secondary {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${config.secondaryBg};
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      
      .vf-ar-btn-secondary:hover:not(:disabled) {
        background: #334155;
        transform: scale(1.05);
      }
      
      .vf-ar-btn-secondary:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      
      .vf-ar-btn-secondary svg {
        width: 22px;
        height: 22px;
      }
      
      /* Transcript section */
      .vf-ar-transcript-section {
        padding: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .vf-ar-transcript-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }
      
      .vf-ar-transcript-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      
      .vf-ar-transcript-title svg {
        width: 14px;
        height: 14px;
      }
      
      .vf-ar-transcript-actions {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      
      .vf-ar-action-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 10px;
        border-radius: 6px;
        border: none;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      
      .vf-ar-action-btn svg {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }
      
      .vf-ar-btn-copy {
        background: ${config.accentColor};
        color: white;
      }
      
      .vf-ar-btn-copy:hover {
        background: #2563eb;
      }
      
      .vf-ar-btn-clear {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      
      .vf-ar-btn-clear:hover {
        background: rgba(239, 68, 68, 0.25);
      }
      
      /* Transcript area */
      .vf-ar-transcript {
        background: rgba(0, 0, 0, 0.25);
        border-radius: 10px;
        padding: 12px;
        min-height: 70px;
        max-height: 120px;
        overflow-y: auto;
        color: ${config.textColor};
        font-size: 13px;
        line-height: 1.6;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      
      .vf-ar-transcript:empty::before {
        content: 'La transcription apparaîtra ici...';
        color: #64748b;
        font-style: italic;
        font-size: 12px;
      }
      
      .vf-ar-transcript .interim {
        color: #94a3b8;
        font-style: italic;
      }
      
      .vf-ar-transcript::-webkit-scrollbar {
        width: 4px;
      }
      
      .vf-ar-transcript::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
      }
      
      /* Inject button */
      .vf-ar-inject {
        width: 100%;
        margin-top: 12px;
        padding: 12px 16px;
        border-radius: 10px;
        border: none;
        background: linear-gradient(135deg, ${config.primaryColor} 0%, #d97706 100%);
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
      }
      
      .vf-ar-inject:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(245, 158, 11, 0.35);
      }
      
      .vf-ar-inject:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }
      
      .vf-ar-inject svg {
        width: 16px;
        height: 16px;
      }
      
      /* Toast notifications */
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
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .vf-ar-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      
      .vf-ar-toast.success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
      }
      
      .vf-ar-toast.error {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
      }
      
      .vf-ar-toast.info {
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        color: white;
      }
      
      /* Animations */
      @keyframes vf-ar-pulse {
        0%, 100% {
          box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
        }
        50% {
          box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6), 0 0 0 8px rgba(239, 68, 68, 0.1);
        }
      }
      
      @keyframes vf-ar-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      
      /* Responsive */
      @media (max-width: 480px) {
        .vf-ar-panel {
          width: 280px;
          right: 65px;
        }
        
        .vf-ar-timer {
          font-size: 32px;
        }
        
        .vf-ar-btn-record {
          width: 56px;
          height: 56px;
        }
        
        .vf-ar-btn-record svg {
          width: 24px;
          height: 24px;
        }
        
        .vf-ar-btn-secondary {
          width: 42px;
          height: 42px;
        }
        
        .vf-ar-btn-secondary svg {
          width: 18px;
          height: 18px;
        }
        
        .vf-ar-transcript-header {
          flex-wrap: wrap;
        }
      }
    `;
    document.head.appendChild(styles);

    // =========================================================================
    // HTML - Construction du widget avec SVG
    // =========================================================================
    const widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = `
      <button class="vf-ar-toggle" id="vf-ar-toggle" title="Enregistreur audio">
        ${ICONS.microphone('#FFFFFF', 26)}
      </button>
      
      <div class="vf-ar-panel" id="vf-ar-panel">
        <div class="vf-ar-header">
          <div class="vf-ar-title">
            ${ICONS.microphone(config.primaryColor, 20)}
            <span>Enregistreur d'appel</span>
            <span class="vf-ar-badge">ElevenLabs</span>
          </div>
          <button class="vf-ar-close" id="vf-ar-close" title="Fermer">
            ${ICONS.close('#94a3b8', 16)}
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
          ${Array(28).fill('<div class="vf-ar-bar"></div>').join('')}
        </div>
        
        <div class="vf-ar-controls">
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger l'audio" disabled>
            ${ICONS.download('#FFFFFF', 22)}
          </button>
          
          <button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Démarrer l'enregistrement">
            ${ICONS.microphone('#FFFFFF', 28)}
          </button>
          
          <button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>
            ${ICONS.pause('#FFFFFF', 22)}
          </button>
        </div>
        
        <div class="vf-ar-transcript-section">
          <div class="vf-ar-transcript-header">
            <div class="vf-ar-transcript-title">
              ${ICONS.document('#94a3b8', 14)}
              <span>Transcription</span>
            </div>
            <div class="vf-ar-transcript-actions">
              <button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy" title="Copier">
                ${ICONS.copy('#FFFFFF', 12)}
                <span>Copier</span>
              </button>
              <button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">
                ${ICONS.trash('#f87171', 12)}
              </button>
            </div>
          </div>
          <div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>
          <button class="vf-ar-inject" id="vf-ar-inject" disabled>
            ${ICONS.send('#FFFFFF', 16)}
            <span>Injecter dans le chat</span>
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
      
      switch(mode) {
        case 'idle':
          toggle.classList.remove('recording');
          toggle.innerHTML = ICONS.microphone('#FFFFFF', 26);
          record.classList.remove('recording');
          record.innerHTML = ICONS.microphone('#FFFFFF', 28);
          pause.disabled = true;
          pause.innerHTML = ICONS.pause('#FFFFFF', 22);
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
          toggle.innerHTML = ICONS.microphone('#FFFFFF', 26);
          record.classList.add('recording');
          record.innerHTML = ICONS.stop('#FFFFFF', 28);
          pause.disabled = false;
          dot.classList.add('recording');
          dot.classList.remove('paused', 'connecting');
          label.textContent = 'Enregistrement + Transcription...';
          break;
          
        case 'paused':
          pause.innerHTML = ICONS.play('#FFFFFF', 22);
          dot.classList.remove('recording', 'connecting');
          dot.classList.add('paused');
          label.textContent = 'En pause';
          break;
          
        case 'resumed':
          pause.innerHTML = ICONS.pause('#FFFFFF', 22);
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
              case 'committed_transcript_with_timestamps':
                if (data.text && data.text.trim()) {
                  console.log('[AudioRecorder] ✅ Final:', data.text);
                  state.transcript += data.text + ' ';
                  state.interimTranscript = '';
                  updateDisplay();
                }
                break;
                
              default:
                if (data.message_type?.includes('error') || data.error) {
                  console.error('[AudioRecorder] ❌ Erreur ElevenLabs:', data);
                  toast('Erreur: ' + (data.message || data.error || 'Erreur inconnue'), 'error');
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

      let processedAudio = audioData;
      if (sampleRate !== 16000) {
        processedAudio = resampleTo16kHz(audioData, sampleRate);
      }

      const pcm16 = float32ToPCM16(processedAudio);
      const base64Audio = arrayBufferToBase64(pcm16.buffer);

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
      
      if (!config.apiKey) {
        toast('Clé API ElevenLabs manquante!', 'error');
        return;
      }

      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      
      setUI('connecting');
      updateDisplay();

      try {
        console.log('[AudioRecorder] 🔑 Obtention du token...');
        const token = await getElevenLabsToken();
        state.sttToken = token;

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

        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const actualSampleRate = state.audioContext.sampleRate;
        console.log('[AudioRecorder] 🎵 Sample rate navigateur:', actualSampleRate);

        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;

        state.microphone = state.audioContext.createMediaStreamSource(state.stream);
        state.microphone.connect(state.analyser);

        console.log('[AudioRecorder] 🔌 Connexion ElevenLabs...');
        await connectElevenLabsWebSocket(token);
        console.log('[AudioRecorder] ✅ ElevenLabs connecté!');

        const bufferSize = 4096;
        state.scriptProcessor = state.audioContext.createScriptProcessor(bufferSize, 1, 1);
        
        state.scriptProcessor.onaudioprocess = (event) => {
          if (!state.isRecording || state.isPaused) return;
          const inputData = event.inputBuffer.getChannelData(0);
          const audioData = new Float32Array(inputData);
          sendAudioChunk(audioData, actualSampleRate);
        };

        state.microphone.connect(state.scriptProcessor);
        state.scriptProcessor.connect(state.audioContext.destination);
        console.log('[AudioRecorder] ✅ Audio pipeline OK');

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm';
        state.mediaRecorder = new MediaRecorder(state.stream, { mimeType });
        state.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) state.audioChunks.push(e.data);
        };
        state.mediaRecorder.start(500);
        console.log('[AudioRecorder] ✅ MediaRecorder OK');

        state.recordingStartTime = Date.now();
        state.pausedDuration = 0;
        state.timerInterval = setInterval(() => {
          if (!state.isPaused && state.isRecording) {
            const elapsed = Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000);
            els.timer.textContent = formatTime(elapsed);
          }
        }, 100);

        visualize();
        
        setUI('recording');
        toast('Enregistrement + Transcription actifs', 'success');

      } catch (err) {
        console.error('[AudioRecorder] ❌ Erreur:', err);
        state.isRecording = false;
        setUI('idle');
        cleanupResources();
        
        if (err.name === 'NotAllowedError') {
          toast('Accès micro refusé', 'error');
        } else if (err.name === 'NotFoundError') {
          toast('Aucun micro trouvé', 'error');
        } else if (err.message.includes('token') || err.message.includes('401') || err.message.includes('403')) {
          toast('Clé API ElevenLabs invalide', 'error');
        } else {
          toast('Erreur: ' + err.message, 'error');
        }
      }
    }

    function cleanupResources() {
      if (state.websocket) {
        try { state.websocket.close(1000, 'Cleanup'); } catch(e) {}
        state.websocket = null;
      }

      if (state.scriptProcessor) {
        try { state.scriptProcessor.disconnect(); } catch(e) {}
        state.scriptProcessor = null;
      }

      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        try { state.mediaRecorder.stop(); } catch(e) {}
      }

      if (state.audioContext && state.audioContext.state !== 'closed') {
        try { state.audioContext.close(); } catch(e) {}
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
    }

    function stopRecording() {
      console.log('[AudioRecorder] ⏹️ Arrêt...');
      
      state.isRecording = false;
      state.isPaused = false;
      cleanupResources();

      els.bars.forEach(b => b.style.height = '4px');
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
        if (state.pauseStartTime) {
          state.pausedDuration += Date.now() - state.pauseStartTime;
        }
        if (state.mediaRecorder?.state === 'paused') state.mediaRecorder.resume();
        setUI('resumed');
        toast('Reprise', 'info');
      }
    }

    function visualize() {
      if (!state.analyser || !state.isRecording) return;
      
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      
      function draw() {
        if (!state.isRecording) {
          els.bars.forEach(b => b.style.height = '4px');
          return;
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          els.bars.forEach((bar, i) => {
            const v = data[i] || 0;
            bar.style.height = `${Math.max(4, (v / 255) * 100)}%`;
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
      toast('Téléchargé', 'success');
    });

    els.copy.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte', 'error');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        toast('Copié!', 'success');
      });
    });

    els.clear.addEventListener('click', () => {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('Effacé', 'info');
    });

    // =========================================================================
    // INJECTION DANS VOICEFLOW
    // =========================================================================
    els.inject.addEventListener('click', () => {
      const text = els.transcript.innerText || els.transcript.textContent;
      if (!text.trim()) {
        toast('Aucun texte', 'error');
        return;
      }

      const interactPayload = {
        type: 'event',
        payload: {
          event: {
            name: config.eventName
          },
          call_transcript: text.trim(),
          duration: els.timer.textContent,
          timestamp: new Date().toISOString()
        }
      };

      console.log('[AudioRecorder] 📤 Injection dans Voiceflow:', interactPayload);

      if (window.voiceflow?.chat?.interact) {
        window.voiceflow.chat.interact(interactPayload);
        toast('Injecté dans le chat!', 'success');
        
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      } else {
        console.error('[AudioRecorder] ❌ window.voiceflow.chat.interact non disponible');
        toast('Chat Voiceflow non trouvé', 'error');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.panel.classList.contains('open')) {
        els.panel.classList.remove('open');
      }
    });

    console.log('[AudioRecorder] ✅ Extension ElevenLabs v5.0 prête');
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
