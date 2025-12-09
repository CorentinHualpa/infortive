/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v6.3 — No Template Literals
 * =============================================================================
 * @version 6.3.0
 */
export const AudioRecorderExtension = {
  name: 'AudioRecorder',
  type: 'effect',
  match: function(args) {
    var trace = args.trace;
    return trace.type === 'ext_audioRecorder' || (trace.payload && trace.payload.name === 'ext_audioRecorder');
  },
  effect: function(args) {
    var trace = args.trace;
    var payload = trace.payload || {};
    
    var config = {
      apiKey: payload.apiKey || '',
      language: payload.language || 'fr',
      eventName: payload.eventName || 'Inject_in_chat',
      primaryColor: '#F08300',
      primaryDark: '#d46f00',
      secondaryColor: '#073A59',
      dangerColor: '#dc2626',
      successColor: '#10b981',
      modelId: payload.modelId || 'scribe_v2_realtime'
    };

    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Widget déjà initialisé');
      return;
    }

    console.log('[AudioRecorder] Initialisation v6.3');

    var state = {
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
      dragOffset: { x: 0, y: 0 }
    };

    // SVG ICONS
    var ICONS = {
      micWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
      micDark: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#6b7280"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
      stopWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#ffffff"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
      pauseDark: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#374151"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
      playDark: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#374151"><path d="M8 5v14l11-7z"/></svg>',
      downloadDark: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#374151"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>',
      closeWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#ffffff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
      sendWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#ffffff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
      copyWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#ffffff"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
      trashRed: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#dc2626"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
      gripWhite: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>'
    };

    // STYLES - Built with string concatenation
    var styles = document.createElement('style');
    styles.id = 'vf-audio-recorder-styles';
    
    var css = '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");';
    
    css += '#vf-audio-recorder-widget, #vf-audio-recorder-widget *, .vf-ar-panel, .vf-ar-panel * {';
    css += 'box-sizing: border-box; margin: 0; padding: 0;';
    css += 'font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;';
    css += '}';
    
    css += '#vf-audio-recorder-widget {';
    css += 'position: fixed; bottom: 100px; right: 24px; z-index: 10000;';
    css += '}';
    
    css += '.vf-ar-toggle {';
    css += 'width: 56px; height: 56px; border-radius: 16px;';
    css += 'background: linear-gradient(135deg, ' + config.primaryColor + ', ' + config.primaryDark + ');';
    css += 'border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;';
    css += 'box-shadow: 0 4px 20px rgba(240, 131, 0, 0.4);';
    css += 'transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
    css += '}';
    
    css += '.vf-ar-toggle:hover {';
    css += 'transform: translateY(-3px) scale(1.02);';
    css += 'box-shadow: 0 8px 30px rgba(240, 131, 0, 0.5);';
    css += '}';
    
    css += '.vf-ar-toggle.recording {';
    css += 'background: linear-gradient(135deg, #ef4444, #dc2626);';
    css += 'animation: vf-pulse 2s infinite;';
    css += '}';
    
    css += '.vf-ar-panel {';
    css += 'position: fixed; bottom: 180px; right: 24px; width: 360px;';
    css += 'max-width: calc(100vw - 48px);';
    css += 'background: rgba(255, 255, 255, 0.98);';
    css += 'backdrop-filter: blur(20px); border-radius: 20px;';
    css += 'border: 1px solid rgba(0, 0, 0, 0.1);';
    css += 'box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.2);';
    css += 'overflow: hidden; opacity: 0; visibility: hidden;';
    css += 'transform: translateY(20px) scale(0.95);';
    css += 'transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
    css += 'z-index: 10001;';
    css += '}';
    
    css += '.vf-ar-panel.open {';
    css += 'opacity: 1; visibility: visible; transform: translateY(0) scale(1);';
    css += '}';
    
    css += '.vf-ar-header {';
    css += 'background: linear-gradient(135deg, ' + config.secondaryColor + ', #0a4a6e);';
    css += 'padding: 16px 18px; display: flex; justify-content: space-between;';
    css += 'align-items: center; cursor: grab; user-select: none;';
    css += '}';
    
    css += '.vf-ar-header:active { cursor: grabbing; }';
    
    css += '.vf-ar-header-left { display: flex; align-items: center; gap: 10px; }';
    
    css += '.vf-ar-grip { opacity: 0.6; transition: opacity 0.2s; }';
    css += '.vf-ar-header:hover .vf-ar-grip { opacity: 1; }';
    
    css += '.vf-ar-title-group { display: flex; align-items: center; gap: 10px; }';
    
    css += '.vf-ar-title { color: #ffffff; font-weight: 600; font-size: 14px; }';
    
    css += '.vf-ar-badge {';
    css += 'background: ' + config.successColor + '; color: white;';
    css += 'font-size: 9px; padding: 3px 8px; border-radius: 20px;';
    css += 'font-weight: 600; text-transform: uppercase;';
    css += '}';
    
    css += '.vf-ar-close {';
    css += 'width: 32px; height: 32px; border-radius: 8px;';
    css += 'background: rgba(255, 255, 255, 0.15); border: none;';
    css += 'cursor: pointer; display: flex; align-items: center;';
    css += 'justify-content: center; transition: all 0.2s;';
    css += '}';
    
    css += '.vf-ar-close:hover { background: rgba(255, 255, 255, 0.25); }';
    
    css += '.vf-ar-timer-section {';
    css += 'padding: 28px 20px 24px; text-align: center; background: #ffffff;';
    css += '}';
    
    css += '.vf-ar-timer-display {';
    css += 'display: flex; align-items: center; justify-content: center; gap: 14px;';
    css += '}';
    
    css += '.vf-ar-status-dot {';
    css += 'width: 12px; height: 12px; border-radius: 50%;';
    css += 'background: #d1d5db; transition: all 0.3s;';
    css += '}';
    
    css += '.vf-ar-status-dot.recording {';
    css += 'background: #ef4444;';
    css += 'box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);';
    css += 'animation: vf-blink 1s infinite;';
    css += '}';
    
    css += '.vf-ar-status-dot.paused {';
    css += 'background: ' + config.primaryColor + ';';
    css += 'box-shadow: 0 0 0 4px rgba(240, 131, 0, 0.2);';
    css += '}';
    
    css += '.vf-ar-status-dot.connecting {';
    css += 'background: #3b82f6; animation: vf-blink 0.5s infinite;';
    css += '}';
    
    css += '.vf-ar-timer {';
    css += 'font-size: 44px; font-weight: 700; color: #111827;';
    css += 'font-variant-numeric: tabular-nums; letter-spacing: -2px;';
    css += '}';
    
    css += '.vf-ar-status-label {';
    css += 'font-size: 13px; color: #6b7280; margin-top: 10px; font-weight: 500;';
    css += '}';
    
    css += '.vf-ar-visualizer {';
    css += 'display: flex; align-items: flex-end; justify-content: center;';
    css += 'height: 56px; gap: 3px; padding: 0 24px 16px; background: #ffffff;';
    css += '}';
    
    css += '.vf-ar-bar {';
    css += 'width: 5px; min-height: 5px;';
    css += 'background: linear-gradient(180deg, ' + config.primaryColor + ', ' + config.primaryDark + ');';
    css += 'border-radius: 3px; transition: height 0.05s ease-out;';
    css += '}';
    
    css += '.vf-ar-controls {';
    css += 'display: flex; justify-content: center; align-items: center;';
    css += 'gap: 16px; padding: 20px; background: #f9fafb;';
    css += 'border-top: 1px solid #f3f4f6;';
    css += '}';
    
    css += '.vf-ar-btn {';
    css += 'border: none; cursor: pointer; display: flex;';
    css += 'align-items: center; justify-content: center;';
    css += 'transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);';
    css += '}';
    
    css += '.vf-ar-btn-record {';
    css += 'width: 72px; height: 72px; border-radius: 50%;';
    css += 'background: linear-gradient(135deg, #ef4444, #dc2626);';
    css += 'box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35);';
    css += '}';
    
    css += '.vf-ar-btn-record:hover {';
    css += 'transform: scale(1.08);';
    css += 'box-shadow: 0 10px 28px rgba(239, 68, 68, 0.45);';
    css += '}';
    
    css += '.vf-ar-btn-record.recording {';
    css += 'background: linear-gradient(135deg, #4b5563, #374151);';
    css += 'box-shadow: 0 6px 20px rgba(75, 85, 99, 0.35);';
    css += '}';
    
    css += '.vf-ar-btn-secondary {';
    css += 'width: 52px; height: 52px; border-radius: 14px;';
    css += 'background: #ffffff; border: 2px solid #e5e7eb;';
    css += 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);';
    css += '}';
    
    css += '.vf-ar-btn-secondary:hover:not(:disabled) {';
    css += 'background: #f9fafb; border-color: #d1d5db;';
    css += 'transform: translateY(-2px);';
    css += '}';
    
    css += '.vf-ar-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }';
    
    css += '.vf-ar-transcript-section {';
    css += 'padding: 20px; background: #ffffff;';
    css += 'border-top: 1px solid #f3f4f6;';
    css += '}';
    
    css += '.vf-ar-transcript-header {';
    css += 'display: flex; align-items: center;';
    css += 'justify-content: space-between; margin-bottom: 14px;';
    css += '}';
    
    css += '.vf-ar-transcript-title {';
    css += 'display: flex; align-items: center; gap: 8px;';
    css += 'font-size: 11px; font-weight: 600; color: #6b7280;';
    css += 'text-transform: uppercase; letter-spacing: 0.05em;';
    css += '}';
    
    css += '.vf-ar-transcript-actions { display: flex; gap: 8px; }';
    
    css += '.vf-ar-action-btn {';
    css += 'display: flex; align-items: center; gap: 6px;';
    css += 'padding: 8px 14px; border-radius: 8px; border: none;';
    css += 'font-size: 12px; font-weight: 600; cursor: pointer;';
    css += 'transition: all 0.2s;';
    css += '}';
    
    css += '.vf-ar-btn-copy {';
    css += 'background: ' + config.secondaryColor + '; color: white;';
    css += '}';
    
    css += '.vf-ar-btn-copy:hover { background: #052e47; }';
    
    css += '.vf-ar-btn-clear {';
    css += 'background: #fef2f2; color: #dc2626;';
    css += 'border: 1px solid #fecaca;';
    css += '}';
    
    css += '.vf-ar-btn-clear:hover { background: #fee2e2; }';
    
    css += '.vf-ar-transcript {';
    css += 'background: #f9fafb; border-radius: 12px; padding: 16px;';
    css += 'min-height: 90px; max-height: 140px; overflow-y: auto;';
    css += 'color: #111827; font-size: 14px; line-height: 1.6;';
    css += 'border: 2px solid #f3f4f6; transition: border-color 0.2s;';
    css += '}';
    
    css += '.vf-ar-transcript:focus {';
    css += 'outline: none; border-color: ' + config.primaryColor + ';';
    css += '}';
    
    css += '.vf-ar-transcript:empty::before {';
    css += 'content: "La transcription apparaîtra ici...";';
    css += 'color: #9ca3af; font-style: italic;';
    css += '}';
    
    css += '.vf-ar-transcript .interim { color: #9ca3af; font-style: italic; }';
    
    css += '.vf-ar-inject {';
    css += 'width: 100%; margin-top: 14px; padding: 16px 20px;';
    css += 'border-radius: 12px; border: none;';
    css += 'background: linear-gradient(135deg, ' + config.primaryColor + ', ' + config.primaryDark + ');';
    css += 'color: white; font-size: 14px; font-weight: 600;';
    css += 'cursor: pointer; display: flex; align-items: center;';
    css += 'justify-content: center; gap: 10px; transition: all 0.3s;';
    css += 'box-shadow: 0 4px 14px rgba(240, 131, 0, 0.3);';
    css += '}';
    
    css += '.vf-ar-inject:hover:not(:disabled) {';
    css += 'transform: translateY(-2px);';
    css += 'box-shadow: 0 6px 20px rgba(240, 131, 0, 0.4);';
    css += '}';
    
    css += '.vf-ar-inject:disabled { opacity: 0.5; cursor: not-allowed; }';
    
    css += '.vf-ar-toast {';
    css += 'position: fixed; bottom: 120px; left: 50%;';
    css += 'transform: translateX(-50%) translateY(20px);';
    css += 'padding: 12px 24px; border-radius: 12px;';
    css += 'font-size: 13px; font-weight: 600; z-index: 10002;';
    css += 'opacity: 0; transition: all 0.3s;';
    css += 'box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);';
    css += 'font-family: "Inter", sans-serif;';
    css += '}';
    
    css += '.vf-ar-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }';
    css += '.vf-ar-toast.success { background: ' + config.successColor + '; color: white; }';
    css += '.vf-ar-toast.error { background: ' + config.dangerColor + '; color: white; }';
    css += '.vf-ar-toast.info { background: ' + config.secondaryColor + '; color: white; }';
    
    css += '@keyframes vf-pulse {';
    css += '0%, 100% { box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4); }';
    css += '50% { box-shadow: 0 4px 30px rgba(239, 68, 68, 0.6), 0 0 0 8px rgba(239, 68, 68, 0.1); }';
    css += '}';
    
    css += '@keyframes vf-blink {';
    css += '0%, 100% { opacity: 1; }';
    css += '50% { opacity: 0.4; }';
    css += '}';
    
    css += '@media (max-width: 480px) {';
    css += '.vf-ar-panel { width: calc(100vw - 32px); right: 16px; left: 16px; }';
    css += '.vf-ar-timer { font-size: 36px; }';
    css += '.vf-ar-btn-record { width: 64px; height: 64px; }';
    css += '.vf-ar-btn-secondary { width: 46px; height: 46px; }';
    css += '}';
    
    styles.textContent = css;
    document.head.appendChild(styles);

    // HTML - Widget
    var widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = '<button class="vf-ar-toggle" id="vf-ar-toggle" title="Enregistreur audio">' + ICONS.micWhite + '</button>';
    document.body.appendChild(widget);

    // HTML - Panel
    var panel = document.createElement('div');
    panel.className = 'vf-ar-panel';
    panel.id = 'vf-ar-panel';
    
    var savedPos = localStorage.getItem('vf-ar-position');
    if (savedPos) {
      try {
        var pos = JSON.parse(savedPos);
        if (pos.top >= 0 && pos.left >= 0 && pos.top < window.innerHeight - 100 && pos.left < window.innerWidth - 100) {
          panel.style.top = pos.top + 'px';
          panel.style.left = pos.left + 'px';
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }
      } catch(e) {}
    }
    
    // Build visualizer bars
    var barsHTML = '';
    for (var i = 0; i < 32; i++) {
      barsHTML += '<div class="vf-ar-bar"></div>';
    }
    
    var panelHTML = '';
    panelHTML += '<div class="vf-ar-header" id="vf-ar-header">';
    panelHTML += '<div class="vf-ar-header-left">';
    panelHTML += '<div class="vf-ar-grip">' + ICONS.gripWhite + '</div>';
    panelHTML += '<div class="vf-ar-title-group">';
    panelHTML += '<span class="vf-ar-title">Enregistreur d\'appel</span>';
    panelHTML += '<span class="vf-ar-badge">ElevenLabs</span>';
    panelHTML += '</div></div>';
    panelHTML += '<button class="vf-ar-close" id="vf-ar-close" title="Fermer">' + ICONS.closeWhite + '</button>';
    panelHTML += '</div>';
    panelHTML += '<div class="vf-ar-timer-section">';
    panelHTML += '<div class="vf-ar-timer-display">';
    panelHTML += '<div class="vf-ar-status-dot" id="vf-ar-dot"></div>';
    panelHTML += '<div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>';
    panelHTML += '</div>';
    panelHTML += '<div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>';
    panelHTML += '</div>';
    panelHTML += '<div class="vf-ar-visualizer" id="vf-ar-visualizer">' + barsHTML + '</div>';
    panelHTML += '<div class="vf-ar-controls">';
    panelHTML += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger" disabled>' + ICONS.downloadDark + '</button>';
    panelHTML += '<button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Enregistrer">' + ICONS.micWhite + '</button>';
    panelHTML += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>' + ICONS.pauseDark + '</button>';
    panelHTML += '</div>';
    panelHTML += '<div class="vf-ar-transcript-section">';
    panelHTML += '<div class="vf-ar-transcript-header">';
    panelHTML += '<div class="vf-ar-transcript-title">' + ICONS.micDark + '<span>Transcription</span></div>';
    panelHTML += '<div class="vf-ar-transcript-actions">';
    panelHTML += '<button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy">' + ICONS.copyWhite + '<span>Copier</span></button>';
    panelHTML += '<button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear">' + ICONS.trashRed + '</button>';
    panelHTML += '</div></div>';
    panelHTML += '<div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>';
    panelHTML += '<button class="vf-ar-inject" id="vf-ar-inject" disabled>' + ICONS.sendWhite + '<span>Injecter dans le chat</span></button>';
    panelHTML += '</div>';
    
    panel.innerHTML = panelHTML;
    document.body.appendChild(panel);

    // REFERENCES
    function getEl(id) { return document.getElementById(id); }
    var els = {
      toggle: getEl('vf-ar-toggle'),
      panel: panel,
      header: getEl('vf-ar-header'),
      close: getEl('vf-ar-close'),
      timer: getEl('vf-ar-timer'),
      dot: getEl('vf-ar-dot'),
      label: getEl('vf-ar-label'),
      record: getEl('vf-ar-record'),
      pause: getEl('vf-ar-pause'),
      download: getEl('vf-ar-download'),
      bars: panel.querySelectorAll('.vf-ar-bar'),
      transcript: getEl('vf-ar-transcript'),
      copy: getEl('vf-ar-copy'),
      clear: getEl('vf-ar-clear'),
      inject: getEl('vf-ar-inject')
    };

    // POSITION HELPER
    function ensureInViewport() {
      var rect = panel.getBoundingClientRect();
      var margin = 20;
      var newLeft = rect.left;
      var newTop = rect.top;
      var needsAdjust = false;
      
      if (rect.right > window.innerWidth - margin) { newLeft = window.innerWidth - rect.width - margin; needsAdjust = true; }
      if (rect.left < margin) { newLeft = margin; needsAdjust = true; }
      if (rect.bottom > window.innerHeight - margin) { newTop = window.innerHeight - rect.height - margin; needsAdjust = true; }
      if (rect.top < margin) { newTop = margin; needsAdjust = true; }
      
      if (needsAdjust) {
        panel.style.left = Math.max(margin, newLeft) + 'px';
        panel.style.top = Math.max(margin, newTop) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    }

    // DRAG & DROP
    function initDrag() {
      var header = els.header;
      
      function onMouseDown(e) {
        if (e.target.closest('.vf-ar-close')) return;
        e.preventDefault();
        state.isDragging = true;
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var rect = panel.getBoundingClientRect();
        
        state.dragOffset = { x: clientX - rect.left, y: clientY - rect.top };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchmove', onMouseMove, { passive: false });
        document.addEventListener('touchend', onMouseUp);
      }
      
      function onMouseMove(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        var left = clientX - state.dragOffset.x;
        var top = clientY - state.dragOffset.y;
        
        var rect = panel.getBoundingClientRect();
        var margin = 10;
        left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));
        top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));
        
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      
      function onMouseUp() {
        if (!state.isDragging) return;
        state.isDragging = false;
        
        var rect = panel.getBoundingClientRect();
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

    // UTILITIES
    function formatTime(sec) {
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = Math.floor(sec % 60);
      return pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    
    function pad(n) {
      return n < 10 ? '0' + n : '' + n;
    }

    function toast(msg, type) {
      type = type || 'info';
      var existing = document.querySelectorAll('.vf-ar-toast');
      for (var i = 0; i < existing.length; i++) {
        existing[i].remove();
      }
      var t = document.createElement('div');
      t.className = 'vf-ar-toast ' + type;
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(function() { t.classList.add('show'); });
      setTimeout(function() { 
        t.classList.remove('show'); 
        setTimeout(function() { t.remove(); }, 300); 
      }, 2500);
    }

    function updateDisplay() {
      if (state.transcript || state.interimTranscript) {
        var html = state.transcript;
        if (state.interimTranscript) {
          html += '<span class="interim">' + state.interimTranscript + '</span>';
        }
        els.transcript.innerHTML = html;
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      }
    }

    function setUI(mode) {
      switch(mode) {
        case 'idle':
          els.toggle.classList.remove('recording');
          els.toggle.innerHTML = ICONS.micWhite;
          els.record.classList.remove('recording');
          els.record.innerHTML = ICONS.micWhite;
          els.pause.disabled = true;
          els.pause.innerHTML = ICONS.pauseDark;
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
          els.record.innerHTML = ICONS.stopWhite;
          els.pause.disabled = false;
          els.pause.innerHTML = ICONS.pauseDark;
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
        case 'paused':
          els.pause.innerHTML = ICONS.playDark;
          els.dot.className = 'vf-ar-status-dot paused';
          els.label.textContent = 'En pause';
          break;
        case 'resumed':
          els.pause.innerHTML = ICONS.pauseDark;
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
      }
    }

    // ELEVENLABS API
    function getToken() {
      return fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey }
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Token error: ' + res.status);
        return res.json();
      })
      .then(function(data) {
        return data.token;
      });
    }

    function connectWS(token) {
      return new Promise(function(resolve, reject) {
        var params = new URLSearchParams({
          model_id: config.modelId,
          language_code: config.language,
          token: token,
          audio_format: 'pcm_16000',
          commit_strategy: 'vad',
          vad_silence_threshold_secs: '1.0',
          vad_threshold: '0.3'
        });
        
        var ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?' + params.toString());
        var timeout = setTimeout(function() { ws.close(); reject(new Error('Timeout')); }, 10000);

        ws.onmessage = function(e) {
          var d = JSON.parse(e.data);
          if (d.message_type === 'session_started') { 
            clearTimeout(timeout); 
            resolve(ws); 
          }
          else if (d.message_type === 'partial_transcript' && d.text) { 
            state.interimTranscript = d.text; 
            updateDisplay(); 
          }
          else if ((d.message_type === 'committed_transcript' || d.message_type === 'committed_transcript_with_timestamps') && d.text && d.text.trim()) {
            state.transcript += d.text + ' ';
            state.interimTranscript = '';
            updateDisplay();
          }
        };
        ws.onerror = function() { clearTimeout(timeout); reject(new Error('WS Error')); };
        ws.onclose = function(e) { 
          if (state.isRecording && e.code !== 1000) toast('Connexion perdue', 'error'); 
        };
        state.websocket = ws;
      });
    }

    // AUDIO PROCESSING
    function float32ToPCM16(f) {
      var p = new Int16Array(f.length);
      for (var i = 0; i < f.length; i++) {
        var val = Math.max(-1, Math.min(1, f[i]));
        p[i] = val * (val < 0 ? 0x8000 : 0x7FFF);
      }
      return p;
    }

    function resample(d, r) {
      if (r === 16000) return d;
      var ratio = r / 16000;
      var len = Math.round(d.length / ratio);
      var out = new Float32Array(len);
      for (var i = 0; i < len; i++) {
        var idx = i * ratio;
        var fl = Math.floor(idx);
        var frac = idx - fl;
        out[i] = d[fl] * (1 - frac) + (d[Math.min(fl + 1, d.length - 1)] || 0) * frac;
      }
      return out;
    }

    function toBase64(buf) {
      var arr = new Uint8Array(buf);
      var str = '';
      for (var i = 0; i < arr.length; i += 8192) {
        str += String.fromCharCode.apply(null, arr.subarray(i, i + 8192));
      }
      return btoa(str);
    }

    function sendAudio(data, rate) {
      if (!state.websocket || state.websocket.readyState !== 1 || state.isPaused) return;
      try {
        var processed = rate !== 16000 ? resample(data, rate) : data;
        var pcm = float32ToPCM16(processed);
        state.websocket.send(JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: toBase64(pcm.buffer),
          sample_rate: 16000
        }));
      } catch(e) {}
    }

    // RECORDING
    function startRecording() {
      if (!config.apiKey) { 
        toast('Clé API manquante', 'error'); 
        return; 
      }
      
      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      setUI('connecting');
      updateDisplay();

      getToken()
        .then(function(token) {
          return navigator.mediaDevices.getUserMedia({ 
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } 
          })
          .then(function(stream) {
            state.stream = stream;
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            var rate = state.audioContext.sampleRate;
            
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 64;
            state.microphone = state.audioContext.createMediaStreamSource(stream);
            state.microphone.connect(state.analyser);

            return connectWS(token).then(function() {
              state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
              state.scriptProcessor.onaudioprocess = function(e) {
                if (state.isRecording && !state.isPaused) {
                  sendAudio(new Float32Array(e.inputBuffer.getChannelData(0)), rate);
                }
              };
              state.microphone.connect(state.scriptProcessor);
              state.scriptProcessor.connect(state.audioContext.destination);

              var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
              state.mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
              state.mediaRecorder.ondataavailable = function(e) { 
                if (e.data.size) state.audioChunks.push(e.data); 
              };
              state.mediaRecorder.start(500);

              state.recordingStartTime = Date.now();
              state.pausedDuration = 0;
              state.timerInterval = setInterval(function() {
                if (state.isRecording && !state.isPaused) {
                  els.timer.textContent = formatTime(Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000));
                }
              }, 100);

              visualize();
              setUI('recording');
              toast('Enregistrement démarré', 'success');
            });
          });
        })
        .catch(function(err) {
          state.isRecording = false;
          setUI('idle');
          cleanup();
          toast(err.name === 'NotAllowedError' ? 'Accès micro refusé' : err.message, 'error');
        });
    }

    function cleanup() {
      if (state.websocket) try { state.websocket.close(1000); } catch(e) {}
      if (state.scriptProcessor) try { state.scriptProcessor.disconnect(); } catch(e) {}
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') try { state.mediaRecorder.stop(); } catch(e) {}
      if (state.audioContext && state.audioContext.state !== 'closed') try { state.audioContext.close(); } catch(e) {}
      if (state.stream) {
        var tracks = state.stream.getTracks();
        for (var i = 0; i < tracks.length; i++) {
          tracks[i].stop();
        }
      }
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      state.websocket = null;
      state.scriptProcessor = null;
    }

    function stopRecording() {
      state.isRecording = false;
      cleanup();
      for (var i = 0; i < els.bars.length; i++) {
        els.bars[i].style.height = '5px';
      }
      setUI('idle');
      toast('Enregistrement terminé', 'success');
    }

    function togglePause() {
      if (!state.isRecording) return;
      state.isPaused = !state.isPaused;
      if (state.isPaused) {
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder && state.mediaRecorder.state === 'recording') state.mediaRecorder.pause();
        setUI('paused');
      } else {
        state.pausedDuration += Date.now() - state.pauseStartTime;
        if (state.mediaRecorder && state.mediaRecorder.state === 'paused') state.mediaRecorder.resume();
        setUI('resumed');
      }
    }

    function visualize() {
      if (!state.analyser) return;
      var data = new Uint8Array(state.analyser.frequencyBinCount);
      function draw() {
        if (!state.isRecording) { 
          for (var i = 0; i < els.bars.length; i++) {
            els.bars[i].style.height = '5px';
          }
          return; 
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          for (var i = 0; i < els.bars.length; i++) {
            els.bars[i].style.height = Math.max(5, (data[i] || 0) / 255 * 100) + '%';
          }
        }
      }
      draw();
    }

    // EVENTS
    els.toggle.onclick = function() {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) setTimeout(ensureInViewport, 50);
    };
    
    els.close.onclick = function() { panel.classList.remove('open'); };
    
    document.addEventListener('click', function(e) {
      if (!widget.contains(e.target) && !panel.contains(e.target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });

    els.record.onclick = function() { 
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };
    
    els.pause.onclick = togglePause;

    els.download.onclick = function() {
      if (!state.audioChunks.length) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(state.audioChunks, { type: 'audio/webm' }));
      a.download = 'recording-' + Date.now() + '.webm';
      a.click();
      toast('Téléchargé', 'success');
    };

    els.copy.onclick = function() {
      var txt = els.transcript.innerText ? els.transcript.innerText.trim() : '';
      if (!txt) { toast('Aucun texte', 'error'); return; }
      navigator.clipboard.writeText(txt).then(function() { toast('Copié!', 'success'); });
    };

    els.clear.onclick = function() {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      els.inject.disabled = true;
      toast('Effacé', 'info');
    };

    els.inject.onclick = function() {
      var txt = els.transcript.innerText ? els.transcript.innerText.trim() : '';
      if (!txt) { toast('Aucun texte', 'error'); return; }
      
      if (window.voiceflow && window.voiceflow.chat && window.voiceflow.chat.interact) {
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

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) panel.classList.remove('open');
    });
    
    window.addEventListener('resize', function() {
      if (panel.classList.contains('open')) ensureInViewport();
    });

    console.log('[AudioRecorder] v6.3 Ready');
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension: AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
