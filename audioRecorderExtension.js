/**
 * =============================================================================
 * VOICEFLOW AUDIO RECORDER EXTENSION v10.0
 * =============================================================================
 * MAJOR CHANGES IN v10.0:
 * - Fixed Google Meet audio capture issue
 * - Always mix microphone + tab/system audio for complete transcription
 * - Added browser compatibility detection (Firefox not supported for audio)
 * - Improved audio verification with real signal detection
 * - Better error messages and user guidance
 * - Added audio level monitoring to detect silent streams
 * - Optimized getDisplayMedia constraints for tab audio capture
 * - Added fallback modes when system audio unavailable
 * 
 * ARCHITECTURE:
 * - Mode Visio ON: Captures tab audio (remote participants) + microphone (your voice)
 * - Mode Visio OFF: Captures microphone only
 * - Both streams are mixed via Web Audio API before sending to ElevenLabs
 * 
 * @version 10.0.0
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
      warningColor: '#f59e0b',
      modelId: payload.modelId || 'scribe_v2_realtime'
    };
    
    if (document.getElementById('vf-audio-recorder-widget')) {
      console.log('[AudioRecorder] Already initialized');
      return;
    }
    
    console.log('[AudioRecorder] v10.0 Starting...');
    
    // =========================================================================
    // BROWSER COMPATIBILITY CHECK
    // =========================================================================
    function checkBrowserCompatibility() {
      var ua = navigator.userAgent;
      var result = {
        supported: true,
        audioCapture: true,
        browser: 'unknown',
        warnings: []
      };
      
      if (/Firefox/i.test(ua)) {
        result.browser = 'firefox';
        result.audioCapture = false;
        result.warnings.push('Firefox ne supporte pas la capture audio d\'onglet. Utilisez Chrome ou Edge.');
      } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
        result.browser = 'safari';
        result.audioCapture = false;
        result.warnings.push('Safari ne supporte pas la capture audio d\'onglet. Utilisez Chrome ou Edge.');
      } else if (/Edg/i.test(ua)) {
        result.browser = 'edge';
      } else if (/Chrome/i.test(ua) || /Chromium/i.test(ua)) {
        result.browser = 'chrome';
      } else if (/OPR/i.test(ua) || /Opera/i.test(ua)) {
        result.browser = 'opera';
      }
      
      // Check if on mobile
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
        result.audioCapture = false;
        result.warnings.push('La capture audio système n\'est pas supportée sur mobile.');
      }
      
      // Check if getDisplayMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        result.audioCapture = false;
        result.warnings.push('API getDisplayMedia non disponible dans ce navigateur.');
      }
      
      return result;
    }
    
    var browserCompat = checkBrowserCompatibility();
    console.log('[AudioRecorder] Browser compatibility:', browserCompat);
    
    var state = {
      isRecording: false,
      isPaused: false,
      transcript: '',
      interimTranscript: '',
      audioChunks: [],
      micStream: null,
      tabStream: null,
      mixedStream: null,
      mediaRecorder: null,
      audioContext: null,
      analyser: null,
      micSource: null,
      tabSource: null,
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
      captureSystemAudio: false,
      audioLevelCheckInterval: null,
      lastAudioLevel: 0,
      silentFrameCount: 0
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
    
    function iconWarning(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
    }
    
    function iconCheck(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
    }
    
    function iconHeadphones(color, size) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + color + '" style="display:block;flex-shrink:0;"><path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/></svg>';
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
    css += 'width:380px;max-width:calc(100vw - 40px);';
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
    
    // Browser warning banner
    css += '.vf-ar-browser-warning{';
    css += 'display:flex;align-items:flex-start;gap:10px;';
    css += 'padding:12px 14px;margin:0;';
    css += 'background:linear-gradient(135deg,#fef2f2,#fee2e2);';
    css += 'border-bottom:1px solid #fca5a5;';
    css += 'font-size:11px;font-weight:500;color:#991b1b;';
    css += 'line-height:1.4;';
    css += '}';
    css += '.vf-ar-browser-warning-icon{flex-shrink:0;margin-top:1px;}';
    
    // System audio toggle section
    css += '.vf-ar-mode-section{';
    css += 'padding:14px 16px;background:#f0f9ff;border-bottom:1px solid #e0f2fe;';
    css += 'display:flex;align-items:center;justify-content:space-between;gap:12px;';
    css += '}';
    css += '.vf-ar-mode-section.disabled{opacity:0.5;pointer-events:none;}';
    css += '.vf-ar-mode-label{display:flex;align-items:center;gap:8px;font-size:12px;color:#0369a1;font-weight:500;}';
    css += '.vf-ar-mode-label svg{flex-shrink:0;}';
    css += '.vf-ar-mode-info{flex:1;}';
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
    
    // Reminder banner
    css += '.vf-ar-reminder{';
    css += 'display:flex;align-items:flex-start;gap:10px;';
    css += 'padding:12px 14px;margin:0;';
    css += 'background:linear-gradient(135deg,#fef3c7,#fde68a);';
    css += 'border-bottom:1px solid #f59e0b;';
    css += 'font-size:11px;font-weight:500;color:#92400e;';
    css += 'line-height:1.4;';
    css += '}';
    css += '.vf-ar-reminder-icon{flex-shrink:0;margin-top:1px;}';
    css += '.vf-ar-reminder-text{flex:1;}';
    css += '.vf-ar-reminder-text strong{display:block;margin-bottom:2px;}';
    
    // Audio status indicator
    css += '.vf-ar-audio-status{';
    css += 'display:flex;align-items:center;gap:8px;';
    css += 'padding:10px 14px;';
    css += 'background:#f8fafc;border-bottom:1px solid #e2e8f0;';
    css += 'font-size:11px;color:#64748b;';
    css += '}';
    css += '.vf-ar-audio-status-dot{';
    css += 'width:8px;height:8px;border-radius:50%;';
    css += 'background:#94a3b8;flex-shrink:0;';
    css += '}';
    css += '.vf-ar-audio-status-dot.active{background:#22c55e;animation:vf-blink 1s infinite;}';
    css += '.vf-ar-audio-status-dot.warning{background:#f59e0b;}';
    css += '.vf-ar-audio-status-dot.error{background:#ef4444;}';
    css += '.vf-ar-audio-status-label{flex:1;}';
    css += '.vf-ar-audio-status-level{';
    css += 'width:60px;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;';
    css += '}';
    css += '.vf-ar-audio-status-level-bar{';
    css += 'height:100%;background:linear-gradient(90deg,#22c55e,#84cc16);';
    css += 'border-radius:3px;transition:width 0.1s;width:0%;';
    css += '}';
    
    // Tooltip
    css += '.vf-ar-info-wrapper{position:relative;display:inline-flex;align-items:center;margin-left:4px;}';
    css += '.vf-ar-info-btn{';
    css += 'background:none;border:none;cursor:help;padding:0;';
    css += 'font-size:9px;color:#94a3b8;line-height:1;';
    css += 'width:14px;height:14px;';
    css += 'display:inline-flex;align-items:center;justify-content:center;';
    css += 'border-radius:50%;border:1px solid #cbd5e1;';
    css += 'transition:all 0.2s;font-weight:600;';
    css += '}';
    css += '.vf-ar-info-btn:hover{color:#0369a1;border-color:#0369a1;background:#f0f9ff;}';
    css += '.vf-ar-tooltip{';
    css += 'position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);';
    css += 'width:240px;padding:12px;';
    css += 'background:#1e293b;color:#f1f5f9;';
    css += 'border-radius:10px;font-size:11px;line-height:1.5;';
    css += 'box-shadow:0 10px 25px rgba(0,0,0,0.3);';
    css += 'opacity:0;visibility:hidden;transition:all 0.2s;';
    css += 'z-index:10010;pointer-events:none;';
    css += '}';
    css += '.vf-ar-tooltip::after{';
    css += 'content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);';
    css += 'border:6px solid transparent;border-top-color:#1e293b;';
    css += '}';
    css += '.vf-ar-info-wrapper:hover .vf-ar-tooltip,.vf-ar-tooltip.show{opacity:1;visibility:visible;}';
    css += '.vf-ar-tooltip-title{font-weight:600;margin-bottom:8px;color:#fbbf24;font-size:11px;}';
    css += '.vf-ar-tooltip-section{margin-bottom:8px;}';
    css += '.vf-ar-tooltip-section:last-child{margin-bottom:0;}';
    css += '.vf-ar-tooltip-section-title{font-weight:600;color:#94a3b8;font-size:9px;text-transform:uppercase;margin-bottom:4px;}';
    css += '.vf-ar-tooltip-list{margin:0;padding:0 0 0 14px;font-size:10px;}';
    css += '.vf-ar-tooltip-list li{margin-bottom:3px;}';
    css += '.vf-ar-tooltip-ok{color:#4ade80;}';
    css += '.vf-ar-tooltip-no{color:#f87171;}';
    css += '.vf-ar-tooltip-warn{color:#fbbf24;}';
    css += '.vf-ar-tooltip-tip{';
    css += 'margin-top:10px;padding-top:10px;border-top:1px solid #334155;';
    css += 'font-size:10px;color:#94a3b8;';
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
    css += '.vf-ar-btn-record.recording{background:linear-gradient(135deg,' + config.primaryColor + ',' + config.primaryDark + ');box-shadow:0 4px 16px rgba(240,131,0,0.4);}';
    
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
    
    css += '.vf-ar-toast{';
    css += 'position:fixed;bottom:120px;left:50%;';
    css += 'transform:translateX(-50%) translateY(20px);';
    css += 'padding:12px 20px;border-radius:10px;';
    css += 'font-size:13px;font-weight:600;z-index:10002;';
    css += 'opacity:0;transition:all 0.3s;';
    css += 'box-shadow:0 8px 30px rgba(0,0,0,0.2);';
    css += 'font-family:"Inter",sans-serif;';
    css += 'max-width:320px;text-align:center;';
    css += '}';
    css += '.vf-ar-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}';
    css += '.vf-ar-toast.success{background:' + config.successColor + ';color:#fff;}';
    css += '.vf-ar-toast.error{background:' + config.dangerColor + ';color:#fff;}';
    css += '.vf-ar-toast.info{background:' + config.secondaryColor + ';color:#fff;}';
    css += '.vf-ar-toast.warning{background:' + config.warningColor + ';color:#fff;}';
    
    css += '@keyframes vf-pulse{0%,100%{box-shadow:0 4px 20px rgba(239,68,68,0.4);}50%{box-shadow:0 4px 30px rgba(239,68,68,0.6),0 0 0 8px rgba(239,68,68,0.1);}}';
    css += '@keyframes vf-blink{0%,100%{opacity:1;}50%{opacity:0.4;}}';
    
    css += '@media(max-width:420px){';
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
    html += '<span class="vf-ar-badge">v10</span>';
    html += '</div></div>';
    html += '<button class="vf-ar-close" id="vf-ar-close" title="Fermer">' + iconClose('#FFFFFF', 16) + '</button>';
    html += '</div>';
    
    // Browser warning (shown only for unsupported browsers)
    html += '<div class="vf-ar-browser-warning" id="vf-ar-browser-warning" style="display:none;">';
    html += '<div class="vf-ar-browser-warning-icon">' + iconWarning('#dc2626', 16) + '</div>';
    html += '<div id="vf-ar-browser-warning-text">Navigateur non supporté pour la capture audio.</div>';
    html += '</div>';
    
    // System audio mode toggle with help tooltip
    html += '<div class="vf-ar-mode-section" id="vf-ar-mode-section">';
    html += '<div class="vf-ar-mode-info">';
    html += '<div class="vf-ar-mode-label">';
    html += iconVideo('#0369a1', 16);
    html += '<span>Mode Visio</span>';
    html += '<div class="vf-ar-info-wrapper">';
    html += '<button class="vf-ar-info-btn" type="button" id="vf-ar-info-btn">?</button>';
    html += '<div class="vf-ar-tooltip" id="vf-ar-tooltip">';
    html += '<div class="vf-ar-tooltip-title">💡 Comment ça fonctionne</div>';
    html += '<div class="vf-ar-tooltip-section">';
    html += '<div class="vf-ar-tooltip-section-title">Mode Visio capture :</div>';
    html += '<ul class="vf-ar-tooltip-list">';
    html += '<li class="vf-ar-tooltip-ok">✓ Votre voix (microphone)</li>';
    html += '<li class="vf-ar-tooltip-ok">✓ Voix des participants (audio onglet)</li>';
    html += '</ul>';
    html += '</div>';
    html += '<div class="vf-ar-tooltip-section">';
    html += '<div class="vf-ar-tooltip-section-title">Compatible avec :</div>';
    html += '<ul class="vf-ar-tooltip-list">';
    html += '<li class="vf-ar-tooltip-ok">✓ Google Meet</li>';
    html += '<li class="vf-ar-tooltip-ok">✓ Microsoft Teams (web)</li>';
    html += '<li class="vf-ar-tooltip-ok">✓ Zoom (web)</li>';
    html += '<li class="vf-ar-tooltip-warn">⚠ Zoom/Teams desktop : utilisez partage écran</li>';
    html += '</ul>';
    html += '</div>';
    html += '<div class="vf-ar-tooltip-tip">💡 Pour les apps desktop (Zoom, Teams), partagez l\'écran entier au lieu d\'un onglet pour capturer l\'audio système.</div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="vf-ar-mode-hint">Capture votre voix + participants distants</div>';
    html += '</div>';
    html += '<label class="vf-ar-switch">';
    html += '<input type="checkbox" id="vf-ar-system-toggle">';
    html += '<span class="vf-ar-switch-slider"></span>';
    html += '</label>';
    html += '</div>';
    
    // Reminder banner for system audio mode
    html += '<div class="vf-ar-reminder" id="vf-ar-reminder" style="display:none;">';
    html += '<div class="vf-ar-reminder-icon">' + iconWarning('#92400e', 16) + '</div>';
    html += '<div class="vf-ar-reminder-text">';
    html += '<strong>Important pour Google Meet/Teams web :</strong>';
    html += 'Dans la popup Chrome, sélectionnez l\'onglet de votre visio et cochez "Partager l\'audio de l\'onglet"';
    html += '</div>';
    html += '</div>';
    
    // Audio status indicator (shown during recording)
    html += '<div class="vf-ar-audio-status" id="vf-ar-audio-status" style="display:none;">';
    html += '<div class="vf-ar-audio-status-dot" id="vf-ar-audio-dot"></div>';
    html += '<div class="vf-ar-audio-status-label" id="vf-ar-audio-label">Audio : inactif</div>';
    html += '<div class="vf-ar-audio-status-level">';
    html += '<div class="vf-ar-audio-status-level-bar" id="vf-ar-audio-level"></div>';
    html += '</div>';
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
      systemToggle: document.getElementById('vf-ar-system-toggle'),
      modeSection: document.getElementById('vf-ar-mode-section'),
      reminder: document.getElementById('vf-ar-reminder'),
      infoBtn: document.getElementById('vf-ar-info-btn'),
      tooltip: document.getElementById('vf-ar-tooltip'),
      browserWarning: document.getElementById('vf-ar-browser-warning'),
      browserWarningText: document.getElementById('vf-ar-browser-warning-text'),
      audioStatus: document.getElementById('vf-ar-audio-status'),
      audioDot: document.getElementById('vf-ar-audio-dot'),
      audioLabel: document.getElementById('vf-ar-audio-label'),
      audioLevel: document.getElementById('vf-ar-audio-level')
    };
    
    // Show browser warning if needed
    if (!browserCompat.audioCapture && browserCompat.warnings.length > 0) {
      els.browserWarning.style.display = 'flex';
      els.browserWarningText.textContent = browserCompat.warnings[0];
      els.modeSection.classList.add('disabled');
      els.systemToggle.disabled = true;
    }

    // =========================================================================
    // PANEL POSITIONING
    // =========================================================================
    function positionPanel() {
      var toggleRect = els.toggle.getBoundingClientRect();
      var panelWidth = 380;
      var panelHeight = panel.offsetHeight || 650;
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
          var panelWidth = 380;
          
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
    
    function toast(msg, type, duration) {
      type = type || 'info';
      duration = duration || 3000;
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
      }, duration);
    }
    
    function getTranscriptText() {
      var text = els.transcript.innerText || els.transcript.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }
    
    function hasTranscriptContent() {
      var text = getTranscriptText();
      return text.length > 0;
    }
    
    var isProgrammaticUpdate = false;
    
    function updateDisplay() {
      var content = state.transcript;
      if (state.interimTranscript) {
        content += '<span class="interim">' + state.interimTranscript + '</span>';
      }
      
      if (content) {
        isProgrammaticUpdate = true;
        els.transcript.innerHTML = content;
        els.transcript.scrollTop = els.transcript.scrollHeight;
        isProgrammaticUpdate = false;
      }
    }
    
    function updateAudioStatus(status, level) {
      if (status === 'active') {
        els.audioDot.className = 'vf-ar-audio-status-dot active';
        els.audioLabel.textContent = 'Audio : actif';
      } else if (status === 'warning') {
        els.audioDot.className = 'vf-ar-audio-status-dot warning';
        els.audioLabel.textContent = 'Audio : faible signal';
      } else if (status === 'error') {
        els.audioDot.className = 'vf-ar-audio-status-dot error';
        els.audioLabel.textContent = 'Audio : pas de signal';
      } else {
        els.audioDot.className = 'vf-ar-audio-status-dot';
        els.audioLabel.textContent = 'Audio : inactif';
      }
      
      if (typeof level === 'number') {
        els.audioLevel.style.width = Math.min(100, level) + '%';
      }
    }
    
    function setUI(mode) {
      switch (mode) {
        case 'idle':
          els.toggle.classList.remove('recording');
          els.toggle.innerHTML = iconMic('#FFFFFF', 26);
          els.record.classList.remove('recording');
          els.record.innerHTML = iconMic('#FFFFFF', 28);
          els.record.title = 'Démarrer l\'enregistrement';
          els.pause.disabled = true;
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot';
          els.label.textContent = 'Prêt à enregistrer';
          els.systemToggle.disabled = !browserCompat.audioCapture;
          els.audioStatus.style.display = 'none';
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
          els.record.innerHTML = iconSend('#FFFFFF', 24);
          els.record.title = 'Injecter le transcript';
          els.pause.disabled = false;
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = state.captureSystemAudio ? 'Enregistrement (Visio + Micro)...' : 'Enregistrement (Micro)...';
          els.systemToggle.disabled = true;
          els.audioStatus.style.display = 'flex';
          break;
        case 'paused':
          els.pause.innerHTML = iconPlay('#374151', 22);
          els.dot.className = 'vf-ar-status-dot paused';
          els.label.textContent = 'En pause';
          break;
        case 'resumed':
          els.pause.innerHTML = iconPause('#374151', 22);
          els.dot.className = 'vf-ar-status-dot recording';
          els.label.textContent = state.captureSystemAudio ? 'Enregistrement (Visio + Micro)...' : 'Enregistrement (Micro)...';
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
        var timeout = setTimeout(function() { ws.close(); reject(new Error('Timeout')); }, 15000);
        
        ws.onmessage = function(e) {
          var d = JSON.parse(e.data);
          if (d.message_type === 'session_started') {
            clearTimeout(timeout);
            console.log('[AudioRecorder] WebSocket session started');
            resolve(ws);
          } else if (d.message_type === 'partial_transcript' && d.text) {
            state.interimTranscript = d.text;
            console.log('[AudioRecorder] Partial:', d.text.substring(0, 50) + '...');
            updateDisplay();
          } else if ((d.message_type === 'committed_transcript' || d.message_type === 'committed_transcript_with_timestamps') && d.text && d.text.trim()) {
            state.transcript += d.text + ' ';
            state.interimTranscript = '';
            console.log('[AudioRecorder] Committed:', d.text);
            updateDisplay();
          }
        };
        ws.onerror = function(err) { 
          console.error('[AudioRecorder] WebSocket error:', err);
          clearTimeout(timeout); 
          reject(new Error('WS Error')); 
        };
        ws.onclose = function(e) {
          console.log('[AudioRecorder] WebSocket closed, code:', e.code, 'reason:', e.reason);
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
      } catch (err) {
        console.error('[AudioRecorder] Error sending audio:', err);
      }
    }

    // =========================================================================
    // AUDIO CAPTURE FUNCTIONS
    // =========================================================================
    
    /**
     * Get microphone stream
     */
    function getMicrophoneStream() {
      console.log('[AudioRecorder] Requesting microphone access...');
      return navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      }).then(function(stream) {
        console.log('[AudioRecorder] Microphone access granted');
        return stream;
      });
    }
    
    /**
     * Get tab/screen audio stream using getDisplayMedia
     * This captures the audio from the selected tab/screen
     */
    function getTabAudioStream() {
      console.log('[AudioRecorder] Requesting tab/screen audio...');
      
      // Optimized constraints for tab audio capture
      var displayMediaOptions = {
        video: {
          displaySurface: 'browser',  // Prefer browser tab
          width: { max: 1 },          // Minimal video (we only need audio)
          height: { max: 1 },
          frameRate: { max: 1 }
        },
        audio: {
          // Audio constraints optimized for capture quality
          suppressLocalAudioPlayback: false,  // Keep audio audible locally
          echoCancellation: false,            // No echo cancellation for capture
          noiseSuppression: false,            // No noise suppression for capture
          autoGainControl: false,             // No auto gain for capture
          sampleRate: 48000
        },
        preferCurrentTab: false,              // Don't force current tab
        selfBrowserSurface: 'exclude',        // Exclude the extension's tab
        systemAudio: 'include',               // Include system audio option
        surfaceSwitching: 'include',          // Allow switching source
        monitorTypeSurfaces: 'include'        // Include full screen option
      };
      
      return navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
        .then(function(stream) {
          var audioTracks = stream.getAudioTracks();
          var videoTracks = stream.getVideoTracks();
          
          console.log('[AudioRecorder] Display media obtained:', {
            audioTracks: audioTracks.length,
            videoTracks: videoTracks.length
          });
          
          // Stop video tracks immediately - we don't need them
          videoTracks.forEach(function(track) {
            track.stop();
            console.log('[AudioRecorder] Stopped video track');
          });
          
          if (audioTracks.length === 0) {
            console.warn('[AudioRecorder] No audio track in display media - user may not have checked "Share tab audio"');
            throw new Error('NO_AUDIO_TRACK');
          }
          
          // Log audio track settings for debugging
          var settings = audioTracks[0].getSettings();
          console.log('[AudioRecorder] Audio track settings:', settings);
          
          // Return audio-only stream
          return new MediaStream(audioTracks);
        });
    }
    
    /**
     * Mix microphone and tab audio streams into a single stream
     * This is crucial for capturing both the user's voice AND remote participants
     */
    function createMixedAudioStream(micStream, tabStream, audioContext) {
      console.log('[AudioRecorder] Creating mixed audio stream...');
      
      // Create a destination for the mixed audio
      var mixedDestination = audioContext.createMediaStreamDestination();
      
      // Create gain nodes for volume control (can be adjusted if needed)
      var micGain = audioContext.createGain();
      var tabGain = audioContext.createGain();
      
      // Set initial gains (1.0 = 100%)
      micGain.gain.value = 1.0;
      tabGain.gain.value = 1.0;
      
      // Connect microphone
      var micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(micGain);
      micGain.connect(mixedDestination);
      console.log('[AudioRecorder] Microphone connected to mixer');
      
      // Connect tab audio if available
      if (tabStream && tabStream.getAudioTracks().length > 0) {
        var tabSource = audioContext.createMediaStreamSource(tabStream);
        tabSource.connect(tabGain);
        tabGain.connect(mixedDestination);
        state.tabSource = tabSource;
        console.log('[AudioRecorder] Tab audio connected to mixer');
      } else {
        console.warn('[AudioRecorder] No tab audio to mix');
      }
      
      state.micSource = micSource;
      state.mixedDestination = mixedDestination;
      
      console.log('[AudioRecorder] Mixed stream created with', mixedDestination.stream.getAudioTracks().length, 'audio track(s)');
      
      return mixedDestination.stream;
    }
    
    /**
     * Verify that audio is actually being captured (not just that tracks exist)
     */
    function startAudioLevelMonitoring(audioContext, stream) {
      console.log('[AudioRecorder] Starting audio level monitoring...');
      
      var analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      var source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      var dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      state.audioLevelCheckInterval = setInterval(function() {
        if (!state.isRecording || state.isPaused) return;
        
        analyser.getByteFrequencyData(dataArray);
        var sum = 0;
        for (var i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        var average = sum / dataArray.length;
        state.lastAudioLevel = average;
        
        // Update UI
        var normalizedLevel = Math.min(100, (average / 128) * 100);
        
        if (average > 5) {
          state.silentFrameCount = 0;
          updateAudioStatus('active', normalizedLevel);
        } else if (average > 1) {
          state.silentFrameCount = 0;
          updateAudioStatus('warning', normalizedLevel);
        } else {
          state.silentFrameCount++;
          // Only show error after 30 frames (~3 seconds) of silence
          if (state.silentFrameCount > 30) {
            updateAudioStatus('error', 0);
          } else {
            updateAudioStatus('warning', normalizedLevel);
          }
        }
      }, 100);
      
      return analyser;
    }

    // =========================================================================
    // RECORDING
    // =========================================================================
    function startRecording() {
      if (!config.apiKey) {
        toast('Clé API ElevenLabs manquante', 'error');
        return;
      }
      
      state.isRecording = true;
      state.isPaused = false;
      state.transcript = '';
      state.interimTranscript = '';
      state.audioChunks = [];
      state.captureSystemAudio = els.systemToggle.checked;
      state.silentFrameCount = 0;
      
      setUI('connecting');
      updateDisplay();
      
      console.log('[AudioRecorder] Starting recording, mode:', state.captureSystemAudio ? 'Visio (mic+tab)' : 'Mic only');
      
      // Step 1: Always get microphone first
      var audioSetupPromise = getMicrophoneStream()
        .then(function(micStream) {
          state.micStream = micStream;
          
          // Step 2: If visio mode, also get tab audio
          if (state.captureSystemAudio) {
            return getTabAudioStream()
              .then(function(tabStream) {
                state.tabStream = tabStream;
                return { micStream: micStream, tabStream: tabStream };
              })
              .catch(function(err) {
                console.warn('[AudioRecorder] Tab audio capture failed:', err.message);
                
                if (err.message === 'NO_AUDIO_TRACK') {
                  toast('Audio onglet non partagé - mode micro seul activé', 'warning', 4000);
                } else if (err.name === 'NotAllowedError') {
                  toast('Partage refusé - mode micro seul activé', 'warning', 4000);
                } else {
                  toast('Erreur capture onglet - mode micro seul', 'warning', 4000);
                }
                
                // Continue with mic only
                return { micStream: micStream, tabStream: null };
              });
          } else {
            return { micStream: micStream, tabStream: null };
          }
        });
      
      // Step 3: Get ElevenLabs token and setup audio processing
      Promise.all([audioSetupPromise, getToken()])
        .then(function(results) {
          var streams = results[0];
          var token = results[1];
          var micStream = streams.micStream;
          var tabStream = streams.tabStream;
          
          console.log('[AudioRecorder] Token obtained, setting up audio context...');
          
          // Create audio context
          state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
          var rate = state.audioContext.sampleRate;
          console.log('[AudioRecorder] AudioContext sample rate:', rate);
          
          // Create mixed stream (mic + tab if available)
          var processingStream;
          if (tabStream) {
            processingStream = createMixedAudioStream(micStream, tabStream, state.audioContext);
            console.log('[AudioRecorder] Using mixed stream (mic + tab)');
          } else {
            processingStream = micStream;
            console.log('[AudioRecorder] Using mic only stream');
          }
          
          state.mixedStream = processingStream;
          
          // Setup analyser for visualization
          state.analyser = state.audioContext.createAnalyser();
          state.analyser.fftSize = 64;
          var visualSource = state.audioContext.createMediaStreamSource(processingStream);
          visualSource.connect(state.analyser);
          
          // Start audio level monitoring
          startAudioLevelMonitoring(state.audioContext, processingStream);
          
          return connectWS(token).then(function() {
            console.log('[AudioRecorder] WebSocket connected, setting up audio processing...');
            
            // Setup script processor to send audio to ElevenLabs
            state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);
            
            var processingSource = state.audioContext.createMediaStreamSource(processingStream);
            
            state.scriptProcessor.onaudioprocess = function(e) {
              if (state.isRecording && !state.isPaused) {
                var inputData = new Float32Array(e.inputBuffer.getChannelData(0));
                sendAudio(inputData, rate);
              }
            };
            
            processingSource.connect(state.scriptProcessor);
            state.scriptProcessor.connect(state.audioContext.destination);
            
            // Setup MediaRecorder for file download
            var mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
            state.mediaRecorder = new MediaRecorder(processingStream, { mimeType: mime });
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
            
            // Handle tab stream ending (user stops sharing)
            if (tabStream) {
              tabStream.getAudioTracks().forEach(function(track) {
                track.onended = function() {
                  console.log('[AudioRecorder] Tab audio track ended');
                  toast('Partage audio terminé - micro seul actif', 'info');
                };
                track.onmute = function() {
                  console.log('[AudioRecorder] Tab audio track muted');
                };
              });
            }
            
            // Handle mic stream ending
            micStream.getAudioTracks().forEach(function(track) {
              track.onended = function() {
                console.log('[AudioRecorder] Microphone track ended');
                toast('Microphone déconnecté', 'error');
                stopRecording();
              };
            });
            
            visualize();
            setUI('recording');
            
            // Show appropriate success message
            if (tabStream) {
              toast('Enregistrement démarré (Micro + Audio onglet)', 'success');
            } else if (state.captureSystemAudio) {
              toast('Enregistrement démarré (Micro seul)', 'warning');
            } else {
              toast('Enregistrement démarré', 'success');
            }
          });
        })
        .catch(function(err) {
          console.error('[AudioRecorder] Error starting recording:', err);
          state.isRecording = false;
          setUI('idle');
          cleanup();
          
          if (err.name === 'NotAllowedError') {
            toast('Accès au microphone refusé', 'error');
          } else if (err.message === 'NO_AUDIO_TRACK') {
            toast('Cochez "Partager l\'audio de l\'onglet" dans Chrome', 'error', 5000);
          } else if (err.message && err.message.includes('Token')) {
            toast('Erreur API ElevenLabs - vérifiez votre clé', 'error');
          } else {
            toast(err.message || 'Erreur de démarrage', 'error');
          }
        });
    }
    
    function cleanup() {
      console.log('[AudioRecorder] Cleaning up...');
      
      // Clear audio level monitoring
      if (state.audioLevelCheckInterval) {
        clearInterval(state.audioLevelCheckInterval);
        state.audioLevelCheckInterval = null;
      }
      
      // Close WebSocket
      if (state.websocket) {
        try { 
          state.websocket.close(1000); 
        } catch (e) {
          console.warn('[AudioRecorder] Error closing WebSocket:', e);
        }
        state.websocket = null;
      }
      
      // Disconnect script processor
      if (state.scriptProcessor) {
        try { 
          state.scriptProcessor.disconnect(); 
        } catch (e) {
          console.warn('[AudioRecorder] Error disconnecting script processor:', e);
        }
        state.scriptProcessor = null;
      }
      
      // Stop media recorder
      if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        try { 
          state.mediaRecorder.stop(); 
        } catch (e) {
          console.warn('[AudioRecorder] Error stopping media recorder:', e);
        }
      }
      state.mediaRecorder = null;
      
      // Close audio context
      if (state.audioContext && state.audioContext.state !== 'closed') {
        try { 
          state.audioContext.close(); 
        } catch (e) {
          console.warn('[AudioRecorder] Error closing audio context:', e);
        }
      }
      state.audioContext = null;
      
      // Stop microphone tracks
      if (state.micStream) {
        state.micStream.getTracks().forEach(function(track) {
          track.stop();
        });
        state.micStream = null;
      }
      
      // Stop tab audio tracks
      if (state.tabStream) {
        state.tabStream.getTracks().forEach(function(track) {
          track.stop();
        });
        state.tabStream = null;
      }
      
      // Stop mixed stream tracks
      if (state.mixedStream) {
        state.mixedStream.getTracks().forEach(function(track) {
          track.stop();
        });
        state.mixedStream = null;
      }
      
      // Clear timer
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
      }
      
      // Cancel animation frame
      if (state.animationFrameId) {
        cancelAnimationFrame(state.animationFrameId);
        state.animationFrameId = null;
      }
      
      // Reset sources
      state.micSource = null;
      state.tabSource = null;
      state.mixedDestination = null;
      state.analyser = null;
      
      console.log('[AudioRecorder] Cleanup complete');
    }
    
    function stopRecording() {
      console.log('[AudioRecorder] Stopping recording...');
      state.isRecording = false;
      cleanup();
      
      // Reset visualizer bars
      for (var i = 0; i < els.bars.length; i++) {
        els.bars[i].style.height = '4px';
      }
      
      setUI('idle');
      toast('Enregistrement terminé', 'success');
    }
    
    function injectAndContinue() {
      var txt = getTranscriptText();
      
      if (!txt) {
        toast('Aucun texte à injecter', 'info');
        return;
      }
      
      console.log('[AudioRecorder] Injecting transcript:', txt.substring(0, 100) + '...');
      
      if (window.voiceflow && window.voiceflow.chat && window.voiceflow.chat.interact) {
        window.voiceflow.chat.interact({
          type: 'event',
          payload: {
            event: { name: config.eventName },
            call_transcript: txt,
            duration: els.timer.textContent,
            timestamp: new Date().toISOString(),
            mode: state.captureSystemAudio ? 'visio' : 'mic_only',
            hasTabAudio: state.tabStream !== null
          }
        });
        
        toast('Transcript injecté!', 'success');
        
        // Clear transcript for new sequence
        state.transcript = '';
        state.interimTranscript = '';
        els.transcript.innerHTML = '';
        
        // Check WebSocket is still connected
        if (state.websocket && state.websocket.readyState !== WebSocket.OPEN) {
          console.warn('[AudioRecorder] WebSocket disconnected after inject');
          toast('Connexion perdue - relancez l\'enregistrement', 'error');
          stopRecording();
        } else {
          console.log('[AudioRecorder] Injection successful - continuing recording');
        }
      } else {
        toast('Voiceflow non disponible', 'error');
      }
    }
    
    function togglePause() {
      if (!state.isRecording) return;
      
      state.isPaused = !state.isPaused;
      
      if (state.isPaused) {
        console.log('[AudioRecorder] Pausing...');
        state.pauseStartTime = Date.now();
        if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
          state.mediaRecorder.pause();
        }
        setUI('paused');
      } else {
        console.log('[AudioRecorder] Resuming...');
        state.pausedDuration += Date.now() - state.pauseStartTime;
        if (state.mediaRecorder && state.mediaRecorder.state === 'paused') {
          state.mediaRecorder.resume();
        }
        setUI('resumed');
      }
    }
    
    function visualize() {
      if (!state.analyser) return;
      var data = new Uint8Array(state.analyser.frequencyBinCount);
      
      function draw() {
        if (!state.isRecording) {
          for (var i = 0; i < els.bars.length; i++) {
            els.bars[i].style.height = '4px';
          }
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
    
    els.infoBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      els.tooltip.classList.toggle('show');
    };
    
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.vf-ar-info-wrapper')) {
        els.tooltip.classList.remove('show');
      }
    });
    
    els.systemToggle.onchange = function() {
      els.reminder.style.display = els.systemToggle.checked ? 'flex' : 'none';
    };
    
    els.close.onclick = function(e) {
      e.stopPropagation();
      if (state.isRecording) {
        stopRecording();
      }
      panel.classList.remove('open');
    };
    
    els.record.onclick = function() {
      if (state.isRecording) {
        injectAndContinue();
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
      var txt = getTranscriptText();
      if (!txt) { 
        toast('Aucun texte à copier', 'info'); 
        return; 
      }
      navigator.clipboard.writeText(txt).then(function() { 
        toast('Copié!', 'success'); 
      });
    };
    
    els.clear.onclick = function() {
      state.transcript = '';
      state.interimTranscript = '';
      els.transcript.innerHTML = '';
      toast('Effacé', 'info');
    };
    
    els.transcript.addEventListener('input', function() {
      if (isProgrammaticUpdate) return;
      state.transcript = getTranscriptText();
      state.interimTranscript = '';
    });
    
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        if (state.isRecording) {
          stopRecording();
        }
        panel.classList.remove('open');
      }
    });
    
    window.addEventListener('resize', function() {
      if (panel.classList.contains('open') && !state.isDragging) {
        constrainToViewport();
      }
    });
    
    console.log('[AudioRecorder] v10.0 Ready - Browser:', browserCompat.browser, '- Audio capture supported:', browserCompat.audioCapture);
  }
};

// Exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioRecorderExtension: AudioRecorderExtension };
}
if (typeof window !== 'undefined') {
  window.AudioRecorderExtension = AudioRecorderExtension;
}
