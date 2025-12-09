/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v7.1
 * =============================================================================
 * FIXES:
 * - Icons properly visible (dark on light, white on colored)
 * - Panel starts in viewport at all zoom levels
 * - Smooth drag & drop
 * - Modern border (orange) for visibility
 * - Based on working v5.0 icon pattern
 * 
 * @version 7.1.0
 */
export var AudioRecorderExtension = {
  name: 'AudioRecorder',
  type: 'effect',
  match: function(args) {
    var trace = args.trace;
    return trace.type === 'ext_audioRecorder' || (trace.payload && trace.payload.name === 'ext_audioRecorder');
  },
  effect: function(args) {
    var trace = args.trace;
    var payload = trace.payload || {};
    
    // Configuration
    var config = {
      apiKey: payload.apiKey || '',
      language: payload.language || 'fr',
      eventName: payload.eventName || 'Inject_in_chat',
      primaryColor: '#F08300',
      primaryDark: '#d46f00',
      secondaryColor: '#073A59',
      dangerColor: '#dc2626',
      successColor: '#10b981',
      accentColor: '#3b82f6',
      modelId: payload.modelId || 'scribe_v2_realtime'
    };

    // Prevent duplicates
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Already initialized');
      return;
    }

    console.log('[AudioRecorder] v7.1 Starting...');

    // State
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
      dragOffsetX: 0,
      dragOffsetY: 0
    };

    // =========================================================================
    // SVG ICONS - Direct strings, no escaping issues
    // =========================================================================
    function iconMic(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
    }
    
    function iconStop(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    }
    
    function iconPause(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
    
    function iconPlay(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M8 5v14l11-7z"/></svg>';
    }
    
    function iconDownload(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    }
    
    function iconClose(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    }
    
    function iconSend(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }
    
    function iconCopy(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    }
    
    function iconTrash(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    }
    
    function iconGrip(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg>';
    }
    
    function iconDoc(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
    }

    // =========================================================================
    // STYLES
    // =========================================================================
    var styleEl = document.createElement('style');
    styleEl.id = 'vf-audio-recorder-styles';
    var css = '';
    
    // Font import
    css += '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");';
    
    // Reset
    css += '#vf-audio-recorder-widget,#vf-audio-recorder-widget *,.vf-ar-panel,.vf-ar-panel *{';
    css += 'box-sizing:border-box;margin:0;padding:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;}';
    
    // Widget container
    css += '#vf-audio-recorder-widget{position:fixed;bottom:100px;right:20px;z-index:10000;}';
    
    // Toggle button
    css += '.vf-ar-toggle{width:56px;height:56px;border-radius:16px;';
    css += 'background:linear-gradient(135deg,' + config.primaryColor + ',' + config.primaryDark + ');';
    css += 'border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    css += 'box-shadow:0 4px 20px rgba(240,131,0,0.4);transition:all 0.3s ease;}';
    css += '.vf-ar-toggle:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 6px 25px rgba(240,131,0,0.5);}';
    css += '.vf-ar-toggle.recording{background:linear-gradient(135deg,#ef4444,#dc2626);animation:vf-pulse 2s infinite;}';
    css += '.vf-ar-toggle svg{width:26px;height:26px;}';
    
    // Panel
    css += '.vf-ar-panel{position:fixed;width:360px;max-width:calc(100vw - 40px);';
    css += 'background:#ffffff;border-radius:20px;';
    css += 'border:3px solid ' + config.primaryColor + ';';
    css += 'box-shadow:0 25px 60px -15px rgba(0,0,0,0.3);';
    css += 'overflow:hidden;opacity:0;visibility:hidden;transform:scale(0.95);';
    css += 'transition:opacity 0.25s,visibility 0.25s,transform 0.25s;z-index:10001;}';
    css += '.vf-ar-panel.open{opacity:1;visibility:visible;transform:scale(1);}';
    
    // Header (draggable)
    css += '.vf-ar-header{background:linear-gradient(135deg,' + config.secondaryColor + ',#0a4d6e);';
    css += 'padding:14px 18px;display:flex;justify-content:space-between;align-items:center;';
    css += 'cursor:grab;user-select:none;-webkit-user-select:none;}';
    css += '.vf-ar-header:active{cursor:grabbing;}';
    css += '.vf-ar-header-left{display:flex;align-items:center;gap:10px;}';
    css += '.vf-ar-grip{opacity:0.6;display:flex;align-items:center;transition:opacity 0.2s;}';
    css += '.vf-ar-header:hover .vf-ar-grip{opacity:1;}';
    css += '.vf-ar-title-group{display:flex;align-items:center;gap:10px;}';
    css += '.vf-ar-title{color:#fff;font-weight:600;font-size:15px;}';
    css += '.vf-ar-badge{background:' + config.successColor + ';color:#fff;font-size:9px;padding:4px 8px;border-radius:20px;font-weight:700;text-transform:uppercase;}';
    css += '.vf-ar-close{width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.15);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.2s;}';
    css += '.vf-ar-close:hover{background:rgba(255,255,255,0.25);}';
    
    // Timer
    css += '.vf-ar-timer-section{padding:28px 20px 20px;text-align:center;background:#fff;}';
    css += '.vf-ar-timer-display{display:flex;align-items:center;justify-content:center;gap:14px;}';
    css += '.vf-ar-status-dot{width:14px;height:14px;border-radius:50%;background:#d1d5db;transition:all 0.3s;flex-shrink:0;}';
    css += '.vf-ar-status-dot.recording{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,0.2);animation:vf-blink 1s infinite;}';
    css += '.vf-ar-status-dot.paused{background:' + config.primaryColor + ';box-shadow:0 0 0 4px rgba(240,131,0,0.2);}';
    css += '.vf-ar-status-dot.connecting{background:#3b82f6;animation:vf-blink 0.5s infinite;}';
    css += '.vf-ar-timer{font-size:46px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums;letter-spacing:-2px;}';
    css += '.vf-ar-status-label{font-size:14px;color:#6b7280;margin-top:10px;font-weight:500;}';
    
    // Visualizer
    css += '.vf-ar-visualizer{display:flex;align-items:flex-end;justify-content:center;height:56px;gap:3px;padding:0 24px 16px;background:#fff;}';
    css += '.vf-ar-bar{width:5px;min-height:5px;background:linear-gradient(180deg,' + config.primaryColor + ',' + config.primaryDark + ');border-radius:3px;transition:height 0.05s ease-out;}';
    
    // Controls
    css += '.vf-ar-controls{display:flex;justify-content:center;align-items:center;gap:18px;padding:20px;background:#f8fafc;border-top:1px solid #e5e7eb;}';
    css += '.vf-ar-btn{border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s ease;}';
    
    // Record button (red with white icon)
    css += '.vf-ar-btn-record{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#dc2626);box-shadow:0 6px 20px rgba(239,68,68,0.4);}';
    css += '.vf-ar-btn-record:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(239,68,68,0.5);}';
    css += '.vf-ar-btn-record.recording{background:linear-gradient(135deg,#4b5563,#374151);box-shadow:0 6px 20px rgba(75,85,99,0.4);}';
    css += '.vf-ar-btn-record svg{width:30px;height:30px;}';
    
    // Secondary buttons (light with DARK icons and border)
    css += '.vf-ar-btn-secondary{width:52px;height:52px;border-radius:50%;background:#ffffff;border:2px solid #d1d5db;box-shadow:0 2px 8px rgba(0,0,0,0.08);}';
    css += '.vf-ar-btn-secondary:hover:not(:disabled){background:#f3f4f6;border-color:#9ca3af;transform:scale(1.08);box-shadow:0 4px 12px rgba(0,0,0,0.12);}';
    css += '.vf-ar-btn-secondary:disabled{opacity:0.4;cursor:not-allowed;}';
    css += '.vf-ar-btn-secondary svg{width:24px;height:24px;}';
    
    // Transcript section
    css += '.vf-ar-transcript-section{padding:20px;background:#fff;border-top:1px solid #e5e7eb;}';
    css += '.vf-ar-transcript-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}';
    css += '.vf-ar-transcript-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;}';
    css += '.vf-ar-transcript-actions{display:flex;gap:8px;}';
    css += '.vf-ar-action-btn{display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:10px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;}';
    css += '.vf-ar-btn-copy{background:' + config.secondaryColor + ';color:#fff;}';
    css += '.vf-ar-btn-copy:hover{background:#052e47;transform:translateY(-1px);}';
    css += '.vf-ar-btn-clear{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}';
    css += '.vf-ar-btn-clear:hover{background:#fee2e2;}';
    
    // Transcript area
    css += '.vf-ar-transcript{background:#f9fafb;border-radius:12px;padding:16px;min-height:90px;max-height:140px;overflow-y:auto;color:#111827;font-size:14px;line-height:1.6;border:2px solid #e5e7eb;transition:border-color 0.2s;}';
    css += '.vf-ar-transcript:focus{outline:none;border-color:' + config.primaryColor + ';}';
    css += '.vf-ar-transcript:empty::before{content:"La transcription apparaîtra ici...";color:#9ca3af;font-style:italic;}';
    css += '.vf-ar-transcript .interim{color:#9ca3af;font-style:italic;}';
    
    // Inject button
    css += '.vf-ar-inject{width:100%;margin-top:14px;padding:16px 20px;border-radius:12px;border:none;';
    css += 'background:linear-gradient(135deg,' + config.primaryColor + ',' + config.primaryDark + ');';
    css += 'color:#fff;font-size:15px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;';
    css += 'box-shadow:0 4px 16px rgba(240,131,0,0.35);transition:all 0.3s ease;}';
    css += '.vf-ar-inject:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 24px rgba(240,131,0,0.45);}';
    css += '.vf-ar-inject:disabled{opacity:0.5;cursor:not-allowed;}';
    
    // Toast
    css += '.vf-ar-toast{position:fixed;bottom:120px;left:50%;transform:translateX(-50%) translateY(20px);padding:14px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:10002;opacity:0;transition:all 0.3s;box-shadow:0 10px 40px rgba(0,0,0,0.2);font-family:"Inter",sans-serif;}';
    css += '.vf-ar-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}';
    css += '.vf-ar-toast.success{background:' + config.successColor + ';color:#fff;}';
    css += '.vf-ar-toast.error{background:' + config.dangerColor + ';color:#fff;}';
    css += '.vf-ar-toast.info{background:' + config.secondaryColor + ';color:#fff;}';
    
    // Animations
    css += '@keyframes vf-pulse{0%,100%{box-shadow:0 4px 20px rgba(239,68,68,0.4);}50%{box-shadow:0 4px 30px rgba(239,68,68,0.6),0 0 0 8px rgba(239,68,68,0.1);}}';
    css += '@keyframes vf-blink{0%,100%{opacity:1;}50%{opacity:0.4;}}';
    
    // Responsive
    css += '@media(max-width:480px){.vf-ar-panel{width:calc(100vw - 32px);}.vf-ar-timer{font-size:38px;}.vf-ar-btn-record{width:64px;height:64px;}.vf-ar-btn-secondary{width:46px;height:46px;}}';
    
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // =========================================================================
    // CREATE WIDGET
    // =========================================================================
    var widget = document.createElement('div');
    widget.id = 'vf-audio-recorder-widget';
    widget.innerHTML = '<button class="vf-ar-toggle" id="vf-ar-toggle" title="Enregistreur audio">' + iconMic('#FFFFFF', 26) + '</button>';
    document.body.appendChild(widget);

    // =========================================================================
    // CREATE PANEL
    // =========================================================================
    var panel = document.createElement('div');
    panel.className = 'vf-ar-panel';
    panel.id = 'vf-ar-panel';
    
    // Build visualizer bars
    var barsHtml = '';
    for (var b = 0; b < 32; b++) {
      barsHtml += '<div class="vf-ar-bar"></div>';
    }
    
    // Build panel HTML with CORRECT icon colors:
    // - White icons on colored/dark backgrounds
    // - Dark icons (#374151) on white/light backgrounds
    var html = '';
    html += '<div class="vf-ar-header" id="vf-ar-header">';
    html += '<div class="vf-ar-header-left">';
    html += '<div class="vf-ar-grip">' + iconGrip('rgba(255,255,255,0.7)', 16) + '</div>';
    html += '<div class="vf-ar-title-group">';
    html += '<span class="vf-ar-title">Enregistreur d\'appel</span>';
    html += '<span class="vf-ar-badge">ElevenLabs</span>';
    html += '</div></div>';
    html += '<button class="vf-ar-close" id="vf-ar-close" title="Fermer">' + iconClose('#FFFFFF', 18) + '</button>';
    html += '</div>';
    
    html += '<div class="vf-ar-timer-section">';
    html += '<div class="vf-ar-timer-display">';
    html += '<div class="vf-ar-status-dot" id="vf-ar-dot"></div>';
    html += '<div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>';
    html += '</div>';
    html += '<div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>';
    html += '</div>';
    
    html += '<div class="vf-ar-visualizer" id="vf-ar-visualizer">' + barsHtml + '</div>';
    
    html += '<div class="vf-ar-controls">';
    // DARK icons (#374151) on light buttons
    html += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger" disabled>' + iconDownload('#374151', 24) + '</button>';
    // WHITE icon on red button
    html += '<button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Enregistrer">' + iconMic('#FFFFFF', 30) + '</button>';
    // DARK icon on light button
    html += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>' + iconPause('#374151', 24) + '</button>';
    html += '</div>';
    
    html += '<div class="vf-ar-transcript-section">';
    html += '<div class="vf-ar-transcript-header">';
    html += '<div class="vf-ar-transcript-title">' + iconDoc('#6b7280', 16) + '<span>Transcription</span></div>';
    html += '<div class="vf-ar-transcript-actions">';
    html += '<button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy">' + iconCopy('#FFFFFF', 14) + '<span>Copier</span></button>';
    html += '<button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear">' + iconTrash('#dc2626', 14) + '</button>';
    html += '</div></div>';
    html += '<div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>';
    html += '<button class="vf-ar-inject" id="vf-ar-inject" disabled>' + iconSend('#FFFFFF', 18) + '<span>Injecter dans le chat</span></button>';
    html += '</div>';
    
    panel.innerHTML = html;
    document.body.appendChild(panel);

    // =========================================================================
    // ELEMENT REFERENCES
    // =========================================================================
    var els = {
      toggle: document.getElementById('vf-ar-toggle'),
      panel: panel,
      header: document.getElementById('vf-ar-header'),
      close: document.getElementById('vf-ar-close'),
      timer: document.getElementById('vf-ar-timer'),
      dot: document.getElementById('vf-ar-dot'),
      label: document.getElementById('vf-ar-label'),
      record: document.getElementById('vf-ar-record'),
      pause: document.getElementById('vf-ar-pause'),
      download: document.getElementById('vf-ar-download'),
      bars: panel.querySelectorAll('.vf-ar-bar'),
      transcript: document.getElementById('vf-ar-transcript'),
      copy: document.getElementById('vf-ar-copy'),
      clear: document.getElementById('vf-ar-clear'),
      inject: document.getElementById('vf-ar-inject')
    };

    // =========================================================================
    // PANEL POSITIONING
    // =========================================================================
    function positionPanelInitial() {
      // Position panel to the LEFT of the toggle button, within viewport
      var toggleRect = els.toggle.getBoundingClientRect();
      var panelWidth = 360;
      var panelHeight = 650; // Approximate
      var margin = 20;
      
      // Calculate position
      var left = toggleRect.left - panelWidth - 15;
      var top = toggleRect.top - panelHeight + toggleRect.height + 50;
      
      // Ensure within viewport
      if (left < margin) {
        left = margin;
      }
      if (top < margin) {
        top = margin;
      }
      if (top + panelHeight > window.innerHeight - margin) {
        top = window.innerHeight - panelHeight - margin;
      }
      
      panel.style.left = left + 'px';
      panel.style.top = Math.max(margin, top) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    function constrainToViewport() {
      var rect = panel.getBoundingClientRect();
      var margin = 15;
      var left = rect.left;
      var top = rect.top;
      var changed = false;
      
      if (rect.right > window.innerWidth - margin) {
        left = window.innerWidth - rect.width - margin;
        changed = true;
      }
      if (rect.left < margin) {
        left = margin;
        changed = true;
      }
      if (rect.bottom > window.innerHeight - margin) {
        top = window.innerHeight - rect.height - margin;
        changed = true;
      }
      if (rect.top < margin) {
        top = margin;
        changed = true;
      }
      
      if (changed) {
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
      }
    }

    // =========================================================================
    // SMOOTH DRAG & DROP
    // =========================================================================
    function initDrag() {
      var headerEl = els.header;
      
      function onDragStart(e) {
        if (e.target.closest('.vf-ar-close')) return;
        
        e.preventDefault();
        state.isDragging = true;
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var rect = panel.getBoundingClientRect();
        
        state.dragOffsetX = clientX - rect.left;
        state.dragOffsetY = clientY - rect.top;
        
        // Ensure we're using left/top positioning
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
      }
      
      function onDragMove(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        var newLeft = clientX - state.dragOffsetX;
        var newTop = clientY - state.dragOffsetY;
        
        // Constrain to viewport
        var panelWidth = panel.offsetWidth;
        var panelHeight = panel.offsetHeight;
        var margin = 10;
        
        newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - panelWidth - margin));
        newTop = Math.max(margin, Math.min(newTop, window.innerHeight - panelHeight - margin));
        
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
      }
      
      function onDragEnd() {
        state.isDragging = false;
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        
        // Save position
        var rect = panel.getBoundingClientRect();
        try {
          localStorage.setItem('vf-ar-pos', JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (err) {}
      }
      
      headerEl.addEventListener('mousedown', onDragStart);
      headerEl.addEventListener('touchstart', onDragStart, { passive: false });
    }
    
    function restoreSavedPosition() {
      try {
        var saved = localStorage.getItem('vf-ar-pos');
        if (saved) {
          var pos = JSON.parse(saved);
          if (pos.left >= 0 && pos.top >= 0 && 
              pos.left < window.innerWidth - 100 && 
              pos.top < window.innerHeight - 100) {
            panel.style.left = pos.left + 'px';
            panel.style.top = pos.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            return true;
          }
        }
      } catch (err) {}
      return false;
    }
    
    initDrag();

    // =========================================================================
    // UTILITIES
    // =========================================================================
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    
    function formatTime(sec) {
      var h = Math.floor(sec / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = Math.floor(sec % 60);
      return pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    
    function toast(msg, type) {
      type = type || 'info';
      var existing = document.querySelectorAll('.vf-ar-toast');
      for (var i = 0; i < existing.length; i++) existing[i].remove();
      
      var t = document.createElement('div');
      t.className = 'vf-ar-toast ' + type;
      t.textContent = msg;
      document.body.appendChild(t);
      
      setTimeout(function() { t.classList.add('show'); }, 10);
      setTimeout(function() {
        t.classList.remove('show');
        setTimeout(function() { t.remove(); }, 300);
      }, 2500);
    }
    
    function updateDisplay() {
      if (state.transcript || state.interimTranscript) {
        var content = state.transcript;
        if (state.interimTranscript) {
          content += '<span class="interim">' + state.interimTranscript + '</span>';
        }
        els.transcript.innerHTML = content;
        els.transcript.scrollTop = els.transcript.scrollHeight;
        els.inject.disabled = false;
      } else {
        els.transcript.innerHTML = '';
        els.inject.disabled = true;
      }
    }
    
    function setUI(mode) {
      switch (mode) {
        case 'idle':
          els.toggle.classList.remove('recording');
          els.toggle.innerHTML = iconMic('#FFFFFF', 26);
          els.record.classList.remove('recording');
          els.record.innerHTML = iconMic('#FFFFFF', 30);
          els.pause.disabled = true;
          els.pause.innerHTML = iconPause('#374151', 24);
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
          els.record.innerHTML = iconStop('#FFFFFF', 30);
          els.pause.disabled = false;
          els.pause.innerHTML = iconPause('#374151', 24);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
        case 'paused':
          els.pause.innerHTML = iconPlay('#374151', 24);
          els.dot.className = 'vf-ar-status-dot paused';
          els.label.textContent = 'En pause';
          break;
        case 'resumed':
          els.pause.innerHTML = iconPause('#374151', 24);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = 'Enregistrement en cours...';
          break;
      }
    }

    // =========================================================================
    // ELEVENLABS API
    // =========================================================================
    function getToken() {
      return fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey }
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Token error: ' + res.status);
        return res.json();
      })
      .then(function(data) { return data.token; });
    }
    
    function connectWS(token) {
      return new Promise(function(resolve, reject) {
        var params = 'model_id=' + config.modelId + '&language_code=' + config.language + '&token=' + token + '&audio_format=pcm_16000&commit_strategy=vad&vad_silence_threshold_secs=1.0&vad_threshold=0.3';
        var ws = new WebSocket('wss://api.elevenlabs.io/v1/speech-to-text/realtime?' + params);
        var timeout = setTimeout(function() { ws.close(); reject(new Error('Timeout')); }, 10000);
        
        ws.onmessage = function(e) {
          var d = JSON.parse(e.data);
          if (d.message_type === 'session_started') {
            clearTimeout(timeout);
            resolve(ws);
          } else if (d.message_type === 'partial_transcript' && d.text) {
            state.interimTranscript = d.text;
            updateDisplay();
          } else if ((d.message_type === 'committed_transcript' || d.message_type === 'committed_transcript_with_timestamps') && d.text && d.text.trim()) {
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

    // =========================================================================
    // AUDIO PROCESSING
    // =========================================================================
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
      } catch (err) {}
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
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
      if (state.websocket) try { state.websocket.close(1000); } catch (e) {}
      if (state.scriptProcessor) try { state.scriptProcessor.disconnect(); } catch (e) {}
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') try { state.mediaRecorder.stop(); } catch (e) {}
      if (state.audioContext && state.audioContext.state !== 'closed') try { state.audioContext.close(); } catch (e) {}
      if (state.stream) {
        var tracks = state.stream.getTracks();
        for (var i = 0; i < tracks.length; i++) tracks[i].stop();
      }
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      state.websocket = null;
      state.scriptProcessor = null;
    }
    
    function stopRecording() {
      state.isRecording = false;
      cleanup();
      for (var i = 0; i < els.bars.length; i++) els.bars[i].style.height = '5px';
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
          for (var i = 0; i < els.bars.length; i++) els.bars[i].style.height = '5px';
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

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    els.toggle.onclick = function() {
      var isOpening = !panel.classList.contains('open');
      panel.classList.toggle('open');
      
      if (isOpening) {
        if (!restoreSavedPosition()) {
          positionPanelInitial();
        }
        setTimeout(constrainToViewport, 50);
      }
    };
    
    els.close.onclick = function(e) {
      e.stopPropagation();
      panel.classList.remove('open');
    };
    
    document.addEventListener('click', function(e) {
      if (state.isDragging) return;
      if (!widget.contains(e.target) && !panel.contains(e.target) && panel.classList.contains('open')) {
        panel.classList.remove('open');
      }
    });
    
    els.record.onclick = function() {
      if (state.isRecording) stopRecording();
      else startRecording();
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
      if (panel.classList.contains('open') && !state.isDragging) {
        constrainToViewport();
      }
    });

    console.log('[AudioRecorder] v7.1 Ready');
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension: AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
