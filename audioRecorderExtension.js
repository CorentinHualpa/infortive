/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v8.3
 * =============================================================================
 * NEW IN v8.3:
 * - Ultra minimal "?" indicator (12px circle)
 * - Cleaner tooltip, more compact
 * - Fixed layout issues
 * 
 * @version 8.3.0
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
      console.log('[AudioRecorder] Already initialized');
      return;
    }
    
    console.log('[AudioRecorder] v8.0 Starting...');
    
    var state = {
      isRecording: false,
      isPaused: false,
      transcript: '',
      interimTranscript: '',
      audioChunks: [],
      stream: null,
      systemStream: null,
      mixedStream: null,
      mediaRecorder: null,
      audioContext: null,
      analyser: null,
      microphone: null,
      systemSource: null,
      mixedDestination: null,
      scriptProcessor: null,
      websocket: null,
      timerInterval: null,
      recordingStartTime: null,
      pausedDuration: 0,
      pauseStartTime: null,
      animationFrameId: null,
      isDragging: false,
      dragOffsetX: 0,
      dragOffsetY: 0,
      captureSystemAudio: false // New: toggle for system audio capture
    };

    // =========================================================================
    // SVG ICONS
    // =========================================================================
    function iconMic(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>';
    }
    
    function iconStop(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    }
    
    function iconPause(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
    
    function iconPlay(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M8 5v14l11-7z"/></svg>';
    }
    
    function iconDownload(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    }
    
    function iconClose(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    }
    
    function iconSend(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }
    
    function iconCopy(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    }
    
    function iconTrash(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    }
    
    function iconGrip(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/></svg>';
    }
    
    function iconDoc(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
    }
    
    function iconVideo(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
    }

    // =========================================================================
    // STYLES
    // =========================================================================
    var styleEl = document.createElement('style');
    styleEl.id = 'vf-audio-recorder-styles';
    var css = '';
    
    css += '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");';
    
    css += '#vf-audio-recorder-widget,#vf-audio-recorder-widget *,.vf-ar-panel,.vf-ar-panel *{';
    css += 'box-sizing:border-box;margin:0;padding:0;font-family:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;';
    css += '}';
    
    css += '#vf-audio-recorder-widget svg,.vf-ar-panel svg{';
    css += 'display:block;flex-shrink:0;pointer-events:none;';
    css += '}';
    
    css += '#vf-audio-recorder-widget{position:fixed;bottom:100px;right:20px;z-index:10000;}';
    
    css += '.vf-ar-toggle{';
    css += 'width:56px;height:56px;border-radius:16px;';
    css += 'background:linear-gradient(135deg,' + config.primaryColor + ',' + config.primaryDark + ');';
    css += 'border:none;cursor:pointer;';
    css += 'display:flex;align-items:center;justify-content:center;';
    css += 'box-shadow:0 4px 20px rgba(240,131,0,0.4);';
    css += 'transition:all 0.3s ease;';
    css += '}';
    css += '.vf-ar-toggle:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 6px 25px rgba(240,131,0,0.5);}';
    css += '.vf-ar-toggle.recording{background:linear-gradient(135deg,#ef4444,#dc2626);animation:vf-pulse 2s infinite;}';
    
    css += '.vf-ar-panel{';
    css += 'position:fixed;';
    css += 'width:360px;max-width:calc(100vw - 40px);';
    css += 'background:#ffffff;border-radius:16px;';
    css += 'border:2px solid ' + config.primaryColor + ';';
    css += 'box-shadow:0 20px 50px -10px rgba(0,0,0,0.25);';
    css += 'overflow:visible;opacity:0;visibility:hidden;transform:scale(0.95);';
    css += 'transition:opacity 0.25s,visibility 0.25s,transform 0.25s;';
    css += 'z-index:10001;';
    css += '}';
    css += '.vf-ar-panel.open{opacity:1;visibility:visible;transform:scale(1);}';
    
    css += '.vf-ar-header{';
    css += 'background:linear-gradient(135deg,' + config.secondaryColor + ',#0a4d6e);';
    css += 'padding:12px 16px;';
    css += 'display:flex;justify-content:space-between;align-items:center;';
    css += 'cursor:grab;user-select:none;-webkit-user-select:none;';
    css += 'border-radius:14px 14px 0 0;overflow:hidden;';
    css += '}';
    css += '.vf-ar-header:active{cursor:grabbing;}';
    css += '.vf-ar-header-left{display:flex;align-items:center;gap:8px;}';
    css += '.vf-ar-grip{opacity:0.6;display:flex;align-items:center;transition:opacity 0.2s;}';
    css += '.vf-ar-header:hover .vf-ar-grip{opacity:1;}';
    css += '.vf-ar-title-group{display:flex;align-items:center;gap:8px;}';
    css += '.vf-ar-title{color:#fff;font-weight:600;font-size:14px;}';
    css += '.vf-ar-badge{background:' + config.successColor + ';color:#fff;font-size:8px;padding:3px 6px;border-radius:10px;font-weight:700;text-transform:uppercase;}';
    
    css += '.vf-ar-close{';
    css += 'width:32px;height:32px;border-radius:8px;';
    css += 'background:rgba(255,255,255,0.15);border:none;cursor:pointer;';
    css += 'display:flex;align-items:center;justify-content:center;';
    css += 'transition:background 0.2s;';
    css += '}';
    css += '.vf-ar-close:hover{background:rgba(255,255,255,0.25);}';
    
    // System audio toggle section
    css += '.vf-ar-mode-section{';
    css += 'padding:12px 16px;background:#f0f9ff;border-bottom:1px solid #e0f2fe;';
    css += 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
    css += '}';
    css += '.vf-ar-mode-label{display:flex;align-items:center;gap:8px;font-size:12px;color:#0369a1;font-weight:500;}';
    css += '.vf-ar-mode-label svg{flex-shrink:0;}';
    css += '.vf-ar-mode-hint{font-size:10px;color:#0284c7;margin-top:2px;}';
    
    // Toggle switch
    css += '.vf-ar-switch{position:relative;width:44px;height:24px;flex-shrink:0;}';
    css += '.vf-ar-switch input{opacity:0;width:0;height:0;}';
    css += '.vf-ar-switch-slider{';
    css += 'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;';
    css += 'background-color:#cbd5e1;border-radius:24px;transition:0.3s;';
    css += '}';
    css += '.vf-ar-switch-slider:before{';
    css += 'position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;';
    css += 'background-color:white;border-radius:50%;transition:0.3s;';
    css += 'box-shadow:0 2px 4px rgba(0,0,0,0.2);';
    css += '}';
    css += '.vf-ar-switch input:checked + .vf-ar-switch-slider{background-color:' + config.successColor + ';}';
    css += '.vf-ar-switch input:checked + .vf-ar-switch-slider:before{transform:translateX(20px);}';
    css += '.vf-ar-switch input:disabled + .vf-ar-switch-slider{opacity:0.5;cursor:not-allowed;}';
    
    // Tiny ? info indicator
    css += '.vf-ar-info-wrapper{position:relative;display:inline-flex;align-items:center;margin-left:2px;}';
    css += '.vf-ar-info-btn{';
    css += 'background:none;border:none;cursor:help;padding:0;';
    css += 'font-size:9px;color:#94a3b8;line-height:1;';
    css += 'width:12px;height:12px;';
    css += 'display:inline-flex;align-items:center;justify-content:center;';
    css += 'border-radius:50%;border:1px solid #cbd5e1;';
    css += 'transition:all 0.2s;font-weight:600;';
    css += '}';
    css += '.vf-ar-info-btn:hover{color:#0369a1;border-color:#0369a1;background:#f0f9ff;}';
    css += '.vf-ar-tooltip{';
    css += 'position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);';
    css += 'width:200px;padding:10px;';
    css += 'background:#1e293b;color:#f1f5f9;';
    css += 'border-radius:8px;font-size:10px;line-height:1.4;';
    css += 'box-shadow:0 10px 25px rgba(0,0,0,0.25);';
    css += 'opacity:0;visibility:hidden;transition:all 0.2s;';
    css += 'z-index:10010;pointer-events:none;';
    css += '}';
    css += '.vf-ar-tooltip::after{';
    css += 'content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);';
    css += 'border:5px solid transparent;border-top-color:#1e293b;';
    css += '}';
    css += '.vf-ar-info-wrapper:hover .vf-ar-tooltip,.vf-ar-tooltip.show{opacity:1;visibility:visible;}';
    css += '.vf-ar-tooltip-title{font-weight:600;margin-bottom:6px;color:#fbbf24;font-size:10px;}';
    css += '.vf-ar-tooltip-list{margin:0;padding:0 0 0 10px;font-size:9px;}';
    css += '.vf-ar-tooltip-list li{margin-bottom:2px;}';
    css += '.vf-ar-tooltip-ok{color:#4ade80;}';
    css += '.vf-ar-tooltip-no{color:#f87171;}';
    css += '.vf-ar-tooltip-tip{';
    css += 'margin-top:6px;padding-top:6px;border-top:1px solid #334155;';
    css += 'font-size:9px;color:#94a3b8;';
    css += '}';
    
    css += '.vf-ar-timer-section{padding:24px 16px 16px;text-align:center;background:#fff;}';
    css += '.vf-ar-timer-display{display:flex;align-items:center;justify-content:center;gap:12px;}';
    css += '.vf-ar-status-dot{width:12px;height:12px;border-radius:50%;background:#d1d5db;transition:all 0.3s;flex-shrink:0;}';
    css += '.vf-ar-status-dot.recording{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,0.2);animation:vf-blink 1s infinite;}';
    css += '.vf-ar-status-dot.paused{background:' + config.primaryColor + ';box-shadow:0 0 0 4px rgba(240,131,0,0.2);}';
    css += '.vf-ar-status-dot.connecting{background:#3b82f6;animation:vf-blink 0.5s infinite;}';
    css += '.vf-ar-timer{font-size:42px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums;letter-spacing:-2px;}';
    css += '.vf-ar-status-label{font-size:13px;color:#6b7280;margin-top:8px;font-weight:500;}';
    
    css += '.vf-ar-visualizer{display:flex;align-items:flex-end;justify-content:center;height:50px;gap:2px;padding:0 16px 12px;background:#fff;}';
    css += '.vf-ar-bar{width:4px;min-height:4px;background:linear-gradient(180deg,' + config.primaryColor + ',' + config.primaryDark + ');border-radius:2px;transition:height 0.05s ease-out;}';
    
    css += '.vf-ar-controls{';
    css += 'display:flex;justify-content:center;align-items:center;';
    css += 'gap:16px;padding:16px;background:#f8fafc;border-top:1px solid #e5e7eb;';
    css += '}';
    
    css += '.vf-ar-btn{';
    css += 'border:none;cursor:pointer;';
    css += 'display:flex;align-items:center;justify-content:center;';
    css += 'transition:all 0.2s ease;';
    css += 'flex-shrink:0;';
    css += '}';
    
    css += '.vf-ar-btn-record{';
    css += 'width:64px;height:64px;border-radius:50%;';
    css += 'background:linear-gradient(135deg,#ef4444,#dc2626);';
    css += 'box-shadow:0 4px 16px rgba(239,68,68,0.4);';
    css += '}';
    css += '.vf-ar-btn-record:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(239,68,68,0.5);}';
    css += '.vf-ar-btn-record.recording{background:linear-gradient(135deg,#4b5563,#374151);box-shadow:0 4px 16px rgba(75,85,99,0.4);}';
    
    css += '.vf-ar-btn-secondary{';
    css += 'width:48px;height:48px;border-radius:50%;';
    css += 'background:#ffffff;';
    css += 'border:2px solid #d1d5db;';
    css += 'box-shadow:0 2px 6px rgba(0,0,0,0.08);';
    css += '}';
    css += '.vf-ar-btn-secondary:hover:not(:disabled){background:#f3f4f6;border-color:#9ca3af;transform:scale(1.06);}';
    css += '.vf-ar-btn-secondary:disabled{opacity:0.4;cursor:not-allowed;}';
    
    css += '.vf-ar-transcript-section{padding:16px;background:#fff;border-top:1px solid #e5e7eb;overflow:visible;border-radius:0 0 14px 14px;}';
    
    css += '.vf-ar-transcript-header{';
    css += 'display:flex;align-items:center;justify-content:space-between;';
    css += 'margin-bottom:12px;gap:6px;';
    css += '}';
    css += '.vf-ar-transcript-title{display:flex;align-items:center;gap:4px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.03em;flex-shrink:1;min-width:0;}';
    css += '.vf-ar-transcript-title span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
    
    css += '.vf-ar-transcript-actions{display:flex;gap:6px;flex-shrink:0;}';
    
    css += '.vf-ar-action-btn{';
    css += 'display:flex;align-items:center;justify-content:center;gap:4px;';
    css += 'padding:6px 10px;border-radius:6px;border:none;';
    css += 'font-size:11px;font-weight:600;cursor:pointer;';
    css += 'transition:all 0.2s;white-space:nowrap;';
    css += '}';
    css += '.vf-ar-btn-copy{background:' + config.secondaryColor + ';color:#fff;}';
    css += '.vf-ar-btn-copy:hover{background:#052e47;}';
    css += '.vf-ar-btn-clear{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:6px 8px;min-width:32px;}';
    css += '.vf-ar-btn-clear:hover{background:#fee2e2;}';
    
    css += '.vf-ar-transcript{';
    css += 'background:#f9fafb;border-radius:10px;padding:12px;';
    css += 'min-height:80px;max-height:120px;overflow-y:auto;';
    css += 'color:#111827;font-size:13px;line-height:1.6;';
    css += 'border:2px solid #e5e7eb;transition:border-color 0.2s;';
    css += '}';
    css += '.vf-ar-transcript:focus{outline:none;border-color:' + config.primaryColor + ';}';
    css += '.vf-ar-transcript:empty::before{content:"La transcription apparaîtra ici...";color:#9ca3af;font-style:italic;}';
    css += '.vf-ar-transcript .interim{color:#9ca3af;font-style:italic;}';
    
    css += '.vf-ar-inject{';
    css += 'width:100%;margin-top:12px;padding:14px 16px;';
    css += 'border-radius:10px;border:none;';
    css += 'background:linear-gradient(135deg,' + config.primaryColor + ',' + config.primaryDark + ');';
    css += 'color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
    css += 'display:flex;align-items:center;justify-content:center;gap:8px;';
    css += 'box-shadow:0 4px 14px rgba(240,131,0,0.35);';
    css += 'transition:all 0.3s ease;';
    css += '}';
    css += '.vf-ar-inject:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(240,131,0,0.45);}';
    css += '.vf-ar-inject:disabled{opacity:0.5;cursor:not-allowed;}';
    
    css += '.vf-ar-toast{';
    css += 'position:fixed;bottom:120px;left:50%;';
    css += 'transform:translateX(-50%) translateY(20px);';
    css += 'padding:12px 20px;border-radius:10px;';
    css += 'font-size:13px;font-weight:600;z-index:10002;';
    css += 'opacity:0;transition:all 0.3s;';
    css += 'box-shadow:0 8px 30px rgba(0,0,0,0.2);';
    css += 'font-family:"Inter",sans-serif;';
    css += '}';
    css += '.vf-ar-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}';
    css += '.vf-ar-toast.success{background:' + config.successColor + ';color:#fff;}';
    css += '.vf-ar-toast.error{background:' + config.dangerColor + ';color:#fff;}';
    css += '.vf-ar-toast.info{background:' + config.secondaryColor + ';color:#fff;}';
    
    css += '@keyframes vf-pulse{0%,100%{box-shadow:0 4px 20px rgba(239,68,68,0.4);}50%{box-shadow:0 4px 30px rgba(239,68,68,0.6),0 0 0 8px rgba(239,68,68,0.1);}}';
    css += '@keyframes vf-blink{0%,100%{opacity:1;}50%{opacity:0.4;}}';
    
    css += '@media(max-width:400px){';
    css += '.vf-ar-panel{width:calc(100vw - 24px);}';
    css += '.vf-ar-timer{font-size:36px;}';
    css += '.vf-ar-btn-record{width:56px;height:56px;}';
    css += '.vf-ar-btn-secondary{width:42px;height:42px;}';
    css += '}';
    
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
    
    var barsHtml = '';
    for (var b = 0; b < 28; b++) {
      barsHtml += '<div class="vf-ar-bar"></div>';
    }
    
    var html = '';
    
    // Header
    html += '<div class="vf-ar-header" id="vf-ar-header">';
    html += '<div class="vf-ar-header-left">';
    html += '<div class="vf-ar-grip">' + iconGrip('rgba(255,255,255,0.7)', 14) + '</div>';
    html += '<div class="vf-ar-title-group">';
    html += '<span class="vf-ar-title">Enregistreur</span>';
    html += '<span class="vf-ar-badge">ElevenLabs</span>';
    html += '</div></div>';
    html += '<button class="vf-ar-close" id="vf-ar-close" title="Fermer">' + iconClose('#FFFFFF', 16) + '</button>';
    html += '</div>';
    
    // System audio mode toggle with help tooltip
    html += '<div class="vf-ar-mode-section">';
    html += '<div class="vf-ar-mode-info">';
    html += '<div class="vf-ar-mode-label">';
    html += iconVideo('#0369a1', 16);
    html += '<span>Mode Appel Visio</span>';
    html += '<div class="vf-ar-info-wrapper">';
    html += '<button class="vf-ar-info-btn" type="button" id="vf-ar-info-btn">?</button>';
    html += '<div class="vf-ar-tooltip" id="vf-ar-tooltip">';
    html += '<div class="vf-ar-tooltip-title">⚠️ Compatibilité</div>';
    html += '<ul class="vf-ar-tooltip-list">';
    html += '<li class="vf-ar-tooltip-ok">✓ Google Meet</li>';
    html += '<li class="vf-ar-tooltip-ok">✓ Zoom web (zoom.us/wc/)</li>';
    html += '<li class="vf-ar-tooltip-ok">✓ Teams web</li>';
    html += '<li class="vf-ar-tooltip-no">✗ Apps desktop (Zoom, Teams...)</li>';
    html += '</ul>';
    html += '<div class="vf-ar-tooltip-tip">💡 Utilisez la version navigateur</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="vf-ar-mode-hint">Capture aussi le son de l\'interlocuteur</div>';
    html += '</div>';
    html += '<label class="vf-ar-switch">';
    html += '<input type="checkbox" id="vf-ar-system-toggle">';
    html += '<span class="vf-ar-switch-slider"></span>';
    html += '</label>';
    html += '</div>';
    
    // Timer
    html += '<div class="vf-ar-timer-section">';
    html += '<div class="vf-ar-timer-display">';
    html += '<div class="vf-ar-status-dot" id="vf-ar-dot"></div>';
    html += '<div class="vf-ar-timer" id="vf-ar-timer">00:00:00</div>';
    html += '</div>';
    html += '<div class="vf-ar-status-label" id="vf-ar-label">Prêt à enregistrer</div>';
    html += '</div>';
    
    // Visualizer
    html += '<div class="vf-ar-visualizer" id="vf-ar-visualizer">' + barsHtml + '</div>';
    
    // Controls
    html += '<div class="vf-ar-controls">';
    html += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-download" title="Télécharger" disabled>' + iconDownload('#374151', 22) + '</button>';
    html += '<button class="vf-ar-btn vf-ar-btn-record" id="vf-ar-record" title="Enregistrer">' + iconMic('#FFFFFF', 28) + '</button>';
    html += '<button class="vf-ar-btn vf-ar-btn-secondary" id="vf-ar-pause" title="Pause" disabled>' + iconPause('#374151', 22) + '</button>';
    html += '</div>';
    
    // Transcript section
    html += '<div class="vf-ar-transcript-section">';
    html += '<div class="vf-ar-transcript-header">';
    html += '<div class="vf-ar-transcript-title">' + iconDoc('#9ca3af', 12) + '<span>Transcript</span></div>';
    html += '<div class="vf-ar-transcript-actions">';
    html += '<button class="vf-ar-action-btn vf-ar-btn-copy" id="vf-ar-copy">' + iconCopy('#FFFFFF', 12) + '<span>Copier</span></button>';
    html += '<button class="vf-ar-action-btn vf-ar-btn-clear" id="vf-ar-clear" title="Effacer">' + iconTrash('#dc2626', 12) + '</button>';
    html += '</div></div>';
    html += '<div class="vf-ar-transcript" id="vf-ar-transcript" contenteditable="true"></div>';
    html += '<button class="vf-ar-inject" id="vf-ar-inject" disabled>' + iconSend('#FFFFFF', 16) + '<span>Injecter dans l\'agent</span></button>';
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
      inject: document.getElementById('vf-ar-inject'),
      systemToggle: document.getElementById('vf-ar-system-toggle'),
      infoBtn: document.getElementById('vf-ar-info-btn'),
      tooltip: document.getElementById('vf-ar-tooltip')
    };

    // =========================================================================
    // PANEL POSITIONING
    // =========================================================================
    function positionPanel() {
      var toggleRect = els.toggle.getBoundingClientRect();
      var panelWidth = 360;
      var panelHeight = panel.offsetHeight || 600;
      var margin = 25;
      
      var left = toggleRect.left - panelWidth - 20;
      var top = window.innerHeight - panelHeight - margin;
      
      if (left < margin) {
        left = Math.min(margin, window.innerWidth - panelWidth - margin);
      }
      
      if (left + panelWidth > window.innerWidth - margin) {
        left = window.innerWidth - panelWidth - margin;
      }
      
      if (top < margin) {
        top = margin;
      }
      
      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
      top = Math.max(margin, Math.min(top, window.innerHeight - panelHeight - margin));
      
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    
    function constrainToViewport() {
      var rect = panel.getBoundingClientRect();
      var margin = 20;
      var left = rect.left;
      var top = rect.top;
      var changed = false;
      
      if (rect.right > window.innerWidth - margin) {
        left = window.innerWidth - rect.width - margin;
        changed = true;
      }
      if (left < margin) {
        left = margin;
        changed = true;
      }
      if (rect.bottom > window.innerHeight - margin) {
        top = window.innerHeight - rect.height - margin;
        changed = true;
      }
      if (top < margin) {
        top = margin;
        changed = true;
      }
      
      if (changed) {
        panel.style.left = Math.max(margin, left) + 'px';
        panel.style.top = Math.max(margin, top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    }

    // =========================================================================
    // DRAG & DROP
    // =========================================================================
    function initDrag() {
      var headerEl = els.header;
      
      function onStart(e) {
        if (e.target.closest('.vf-ar-close')) return;
        
        e.preventDefault();
        state.isDragging = true;
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var rect = panel.getBoundingClientRect();
        
        state.dragOffsetX = clientX - rect.left;
        state.dragOffsetY = clientY - rect.top;
        
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
      }
      
      function onMove(e) {
        if (!state.isDragging) return;
        e.preventDefault();
        
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        var newLeft = clientX - state.dragOffsetX;
        var newTop = clientY - state.dragOffsetY;
        
        var panelWidth = panel.offsetWidth;
        var panelHeight = panel.offsetHeight;
        var margin = 10;
        
        newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth - panelWidth - margin));
        newTop = Math.max(margin, Math.min(newTop, window.innerHeight - panelHeight - margin));
        
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
      }
      
      function onEnd() {
        state.isDragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        
        var rect = panel.getBoundingClientRect();
        try {
          localStorage.setItem('vf-ar-pos', JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (err) {}
      }
      
      headerEl.addEventListener('mousedown', onStart);
      headerEl.addEventListener('touchstart', onStart, { passive: false });
    }
    
    function restoreSavedPosition() {
      try {
        var saved = localStorage.getItem('vf-ar-pos');
        if (saved) {
          var pos = JSON.parse(saved);
          var panelWidth = 360;
          
          if (pos.left >= 0 && pos.top >= 0 && 
              pos.left < window.innerWidth - panelWidth && 
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
    
    // FIX: Check actual DOM content for transcript, not just state
    function getTranscriptText() {
      var text = els.transcript.innerText || els.transcript.textContent || '';
      // Remove interim text styling artifacts
      return text.replace(/\s+/g, ' ').trim();
    }
    
    function hasTranscriptContent() {
      var text = getTranscriptText();
      return text.length > 0;
    }
    
    // FIX: Updated updateDisplay to properly sync inject button state
    function updateDisplay() {
      if (state.transcript || state.interimTranscript) {
        var content = state.transcript;
        if (state.interimTranscript) {
          content += '<span class="interim">' + state.interimTranscript + '</span>';
        }
        els.transcript.innerHTML = content;
        els.transcript.scrollTop = els.transcript.scrollHeight;
      }
      // Always update inject button based on actual conditions
      updateInjectButton();
    }
    
    // FIX: Dedicated function to update inject button state
    // Button is ONLY disabled when there's no text - user can inject anytime
    function updateInjectButton() {
      var hasContent = hasTranscriptContent();
      els.inject.disabled = !hasContent;
    }
    
    function setUI(mode) {
      switch (mode) {
        case 'idle':
          els.toggle.classList.remove('recording');
          els.toggle.innerHTML = iconMic('#FFFFFF', 26);
          els.record.classList.remove('recording');
          els.record.innerHTML = iconMic('#FFFFFF', 28);
          els.pause.disabled = true;
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot';
          els.label.textContent = 'Prêt à enregistrer';
          els.systemToggle.disabled = false;
          if (state.audioChunks.length) els.download.disabled = false;
          break;
        case 'connecting':
          els.dot.className = 'vf-ar-status-dot connecting';
          els.label.textContent = state.captureSystemAudio ? 'Sélectionnez l\'onglet à capturer...' : 'Connexion...';
          els.systemToggle.disabled = true;
          break;
        case 'recording':
          els.toggle.classList.add('recording');
          els.record.classList.add('recording');
          els.record.innerHTML = iconStop('#FFFFFF', 28);
          els.pause.disabled = false;
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = state.captureSystemAudio ? 'Enregistrement (Visio)...' : 'Enregistrement...';
          els.systemToggle.disabled = true;
          break;
        case 'paused':
          els.pause.innerHTML = iconPlay('#374151', 22);
          els.dot.className = 'vf-ar-status-dot paused';
          els.label.textContent = 'En pause';
          break;
        case 'resumed':
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = state.captureSystemAudio ? 'Enregistrement (Visio)...' : 'Enregistrement...';
          break;
      }
      // FIX: Always update inject button after UI state change
      updateInjectButton();
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
        var timeout = setTimeout(function() { ws.close(); reject(new Error('Timeout')); }, 15000);
        
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
    // SYSTEM AUDIO CAPTURE (NEW)
    // =========================================================================
    function getSystemAudioStream() {
      return navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser' // Prefer browser tab
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false // Don't mute the tab
        },
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include'
      }).then(function(stream) {
        // Check if audio track is present
        var audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          // Stop video track since we don't need it
          stream.getVideoTracks().forEach(function(track) { track.stop(); });
          throw new Error('NO_AUDIO');
        }
        
        // Stop video track - we only need audio
        stream.getVideoTracks().forEach(function(track) { track.stop(); });
        
        // Return audio-only stream
        return new MediaStream(audioTracks);
      });
    }
    
    function getMicrophoneStream() {
      return navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    }
    
    // Mix microphone and system audio into one stream
    function mixAudioStreams(micStream, systemStream, audioContext) {
      var destination = audioContext.createMediaStreamDestination();
      
      // Create gain nodes for volume control
      var micGain = audioContext.createGain();
      var systemGain = audioContext.createGain();
      
      // Set gains (can be adjusted)
      micGain.gain.value = 1.0;
      systemGain.gain.value = 1.0;
      
      // Connect microphone
      var micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(micGain);
      micGain.connect(destination);
      
      // Connect system audio
      var systemSource = audioContext.createMediaStreamSource(systemStream);
      systemSource.connect(systemGain);
      systemGain.connect(destination);
      
      state.systemSource = systemSource;
      state.mixedDestination = destination;
      
      return destination.stream;
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
      state.captureSystemAudio = els.systemToggle.checked;
      
      setUI('connecting');
      updateDisplay();
      
      var audioSetupPromise;
      
      if (state.captureSystemAudio) {
        // Mode visio: capture mic + system audio
        audioSetupPromise = Promise.all([
          getMicrophoneStream(),
          getSystemAudioStream().catch(function(err) {
            console.warn('[AudioRecorder] System audio not available:', err.message);
            if (err.message === 'NO_AUDIO') {
              toast('Cochez "Partager l\'audio" dans la popup Chrome', 'error');
            }
            return null;
          })
        ]).then(function(streams) {
          var micStream = streams[0];
          var systemStream = streams[1];
          
          state.stream = micStream;
          state.systemStream = systemStream;
          
          return { micStream: micStream, systemStream: systemStream };
        });
      } else {
        // Mode standard: mic only
        audioSetupPromise = getMicrophoneStream().then(function(stream) {
          state.stream = stream;
          return { micStream: stream, systemStream: null };
        });
      }
      
      getToken()
        .then(function(token) {
          return audioSetupPromise.then(function(streams) {
            var micStream = streams.micStream;
            var systemStream = streams.systemStream;
            
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            var rate = state.audioContext.sampleRate;
            
            // Determine which stream to use for processing
            var processingStream;
            if (systemStream) {
              // Mix both streams
              processingStream = mixAudioStreams(micStream, systemStream, state.audioContext);
              toast('Mode visio activé', 'success');
            } else {
              processingStream = micStream;
              if (state.captureSystemAudio) {
                toast('Mode micro uniquement', 'info');
              }
            }
            
            // Setup analyser for visualization
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 64;
            state.microphone = state.audioContext.createMediaStreamSource(processingStream);
            state.microphone.connect(state.analyser);
            
            return connectWS(token).then(function() {
              // Setup audio processing for ElevenLabs
              state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
              state.scriptProcessor.onaudioprocess = function(e) {
                if (state.isRecording && !state.isPaused) {
                  sendAudio(new Float32Array(e.inputBuffer.getChannelData(0)), rate);
                }
              };
              state.microphone.connect(state.scriptProcessor);
              state.scriptProcessor.connect(state.audioContext.destination);
              
              // Setup MediaRecorder for file download
              var recordingStream = processingStream;
              var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
              state.mediaRecorder = new MediaRecorder(recordingStream, { mimeType: mime });
              state.mediaRecorder.ondataavailable = function(e) {
                if (e.data.size) state.audioChunks.push(e.data);
              };
              state.mediaRecorder.start(500);
              
              // Setup timer
              state.recordingStartTime = Date.now();
              state.pausedDuration = 0;
              state.timerInterval = setInterval(function() {
                if (state.isRecording && !state.isPaused) {
                  els.timer.textContent = formatTime(Math.floor((Date.now() - state.recordingStartTime - state.pausedDuration) / 1000));
                }
              }, 100);
              
              // Handle system stream ending (user stops sharing)
              if (systemStream) {
                systemStream.getAudioTracks()[0].onended = function() {
                  console.log('[AudioRecorder] System audio track ended');
                  toast('Partage audio terminé', 'info');
                  // Continue with mic only
                };
              }
              
              visualize();
              setUI('recording');
              if (!state.captureSystemAudio || !systemStream) {
                toast('Enregistrement démarré', 'success');
              }
            });
          });
        })
        .catch(function(err) {
          console.error('[AudioRecorder] Error:', err);
          state.isRecording = false;
          setUI('idle');
          cleanup();
          
          if (err.name === 'NotAllowedError') {
            toast('Accès micro/partage refusé', 'error');
          } else if (err.message === 'NO_AUDIO') {
            toast('Cochez "Partager l\'audio" dans Chrome', 'error');
          } else {
            toast(err.message || 'Erreur', 'error');
          }
        });
    }
    
    function cleanup() {
      if (state.websocket) try { state.websocket.close(1000); } catch (e) {}
      if (state.scriptProcessor) try { state.scriptProcessor.disconnect(); } catch (e) {}
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') try { state.mediaRecorder.stop(); } catch (e) {}
      if (state.audioContext && state.audioContext.state !== 'closed') try { state.audioContext.close(); } catch (e) {}
      
      // Stop all tracks
      if (state.stream) {
        var tracks = state.stream.getTracks();
        for (var i = 0; i < tracks.length; i++) tracks[i].stop();
      }
      if (state.systemStream) {
        var systemTracks = state.systemStream.getTracks();
        for (var j = 0; j < systemTracks.length; j++) systemTracks[j].stop();
      }
      
      if (state.timerInterval) clearInterval(state.timerInterval);
      if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
      
      state.websocket = null;
      state.scriptProcessor = null;
      state.systemStream = null;
      state.systemSource = null;
      state.mixedDestination = null;
    }
    
    function stopRecording() {
      state.isRecording = false;
      cleanup();
      for (var i = 0; i < els.bars.length; i++) els.bars[i].style.height = '4px';
      setUI('idle');
      // FIX: Delay to ensure final transcript is processed
      setTimeout(function() {
        updateInjectButton();
      }, 100);
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
          for (var i = 0; i < els.bars.length; i++) els.bars[i].style.height = '4px';
          return;
        }
        state.animationFrameId = requestAnimationFrame(draw);
        if (!state.isPaused) {
          state.analyser.getByteFrequencyData(data);
          for (var i = 0; i < els.bars.length; i++) {
            els.bars[i].style.height = Math.max(4, (data[i] || 0) / 255 * 100) + '%';
          }
        }
      }
      draw();
    }

    // =========================================================================
    // EVENT LISTENERS
    // =========================================================================
    els.toggle.onclick = function() {
      if (!panel.classList.contains('open')) {
        panel.classList.add('open');
        if (!restoreSavedPosition()) {
          positionPanel();
        }
        setTimeout(constrainToViewport, 100);
      }
    };
    
    // Info tooltip toggle for touch devices
    els.infoBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      els.tooltip.classList.toggle('show');
    };
    
    // Close tooltip when clicking elsewhere
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.vf-ar-info-wrapper')) {
        els.tooltip.classList.remove('show');
      }
    });
    
    els.close.onclick = function(e) {
      e.stopPropagation();
      panel.classList.remove('open');
    };
    
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
      var txt = getTranscriptText();
      if (!txt) { toast('Aucun texte', 'error'); return; }
      navigator.clipboard.writeText(txt).then(function() { toast('Copié!', 'success'); });
    };
    
    els.clear.onclick = function() {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      updateInjectButton();
      toast('Effacé', 'info');
    };
    
    // FIX: Listen to transcript edits to update inject button
    els.transcript.addEventListener('input', function() {
      // Sync state with DOM when user edits
      state.transcript = getTranscriptText();
      updateInjectButton();
    });
    
    els.inject.onclick = function() {
      var txt = getTranscriptText();
      if (!txt) { toast('Aucun texte', 'error'); return; }
      
      if (window.voiceflow && window.voiceflow.chat && window.voiceflow.chat.interact) {
        window.voiceflow.chat.interact({
          type: 'event',
          payload: {
            event: { name: config.eventName },
            call_transcript: txt,
            duration: els.timer.textContent,
            timestamp: new Date().toISOString(),
            mode: state.captureSystemAudio ? 'visio' : 'mic_only'
          }
        });
        toast('Injecté!', 'success');
        
        // Clear transcript for new sequence but KEEP recording running
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        updateInjectButton();
        
        // Recording continues - no stopRecording() call
        // Next injection will only send new text since this point
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
    
    console.log('[AudioRecorder] v8.3 Ready');
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension: AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
