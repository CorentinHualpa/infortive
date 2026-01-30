// UploadToN8nWithLoader-dev.js – v8.1
// © Corentin – Version avec chat actif + détection message user ROBUSTE
// v8.1 : Détection via MutationObserver sur les messages user
//        Fermeture garantie via remove() du DOM
//        Variables webhook dans objet "variables"
//
export const UploadToN8nWithLoaderDev = {
  name: 'UploadToN8nWithLoaderDev',
  type: 'response',
  match(context) {
    try {
      const t = context?.trace || {};
      const type = t.type || '';
      const pname = t.payload?.name || '';
      const isMe = s => /(^ext_)?UploadToN8nWithLoaderDev$/i.test(s || '');
      return isMe(type) || (type === 'extension' && isMe(pname)) || (/^ext_/i.test(type) && isMe(pname));
    } catch (e) {
      console.error('[UploadToN8nWithLoaderDev.match] error:', e);
      return false;
    }
  },
  
  render({ trace, element }) {
    if (!element) {
      console.error('[UploadToN8nWithLoaderDev] Élément parent introuvable');
      return;
    }
    
    console.log('[UploadToN8nWithLoaderDev] v8.1 - Initializing...');
    
    // ---------- STATE ----------
    let isComponentActive = true;
    let timedTimer = null;
    let allCleanupFns = [];
    
    // ---------- HELPERS SHADOW DOM ----------
    const findAllShadowRoots = () => {
      const roots = [];
      const walk = (node) => {
        if (node.shadowRoot) {
          roots.push(node.shadowRoot);
          walk(node.shadowRoot);
        }
        node.querySelectorAll('*').forEach(child => {
          if (child.shadowRoot) {
            roots.push(child.shadowRoot);
            walk(child.shadowRoot);
          }
        });
      };
      walk(document);
      return roots;
    };
    
    const findInShadowDOM = (selector) => {
      let el = document.querySelector(selector);
      if (el) return el;
      for (const root of findAllShadowRoots()) {
        el = root.querySelector(selector);
        if (el) return el;
      }
      return null;
    };
    
    // ---------- CLEANUP CENTRAL ----------
    const cleanup = () => {
      console.log('[UploadToN8nWithLoaderDev] Cleanup called');
      isComponentActive = false;
      
      if (timedTimer) {
        clearInterval(timedTimer);
        timedTimer = null;
      }
      
      allCleanupFns.forEach(fn => {
        try { fn(); } catch(e) { console.warn('Cleanup error:', e); }
      });
      allCleanupFns = [];
    };
    
    // ---------- FERMETURE GARANTIE ----------
    const forceClose = () => {
      console.log('[UploadToN8nWithLoaderDev] Force close');
      cleanup();
      
      // Méthode 1: display none
      if (root) root.style.display = 'none';
      
      // Méthode 2: remove du DOM
      try {
        if (root && root.parentNode) {
          root.parentNode.removeChild(root);
        }
      } catch(e) {}
      
      // Méthode 3: vider le contenu
      try {
        if (root) root.innerHTML = '';
      } catch(e) {}
    };
    
    // ---------- ENVOI INTERACT ----------
    const sendInteract = (payload) => {
      console.log('[UploadToN8nWithLoaderDev] Sending interact:', payload);
      try {
        window?.voiceflow?.chat?.interact?.({
          type: 'complete',
          payload: payload
        });
      } catch(e) {
        console.error('[UploadToN8nWithLoaderDev] Interact error:', e);
      }
    };
    
    // ---------- DETECTION MESSAGE USER VIA MUTATION OBSERVER ----------
    const setupUserMessageDetection = () => {
      console.log('[UploadToN8nWithLoaderDev] Setting up user message detection...');
      
      const selectors = [
        '.vfrc-chat--dialog',
        '[class*="Dialog"]', 
        '[class*="dialog"]',
        '.vfrc-chat',
        '[class*="Messages"]',
        '[class*="messages"]',
        '[class*="chat"]'
      ];
      
      let messageContainer = null;
      
      for (const selector of selectors) {
        messageContainer = findInShadowDOM(selector);
        if (messageContainer) {
          console.log('[UploadToN8nWithLoaderDev] Found message container with:', selector);
          break;
        }
      }
      
      if (!messageContainer) {
        console.warn('[UploadToN8nWithLoaderDev] No message container found');
        return null;
      }
      
      const observer = new MutationObserver((mutations) => {
        if (!isComponentActive) return;
        
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.classList?.contains('upl')) continue;
            if (node.querySelector?.('.upl')) continue;
            
            // Détecter message USER
            const isUserMessage = 
              node.classList?.contains('vfrc-user-response') ||
              node.classList?.contains('vfrc-message--user') ||
              node.querySelector?.('[class*="user"]') ||
              node.querySelector?.('[class*="User"]') ||
              (node.className && /user/i.test(node.className));
            
            if (isUserMessage) {
              console.log('[UploadToN8nWithLoaderDev] User message detected!', node);
              
              const textEl = node.querySelector?.('[class*="text"]') || 
                            node.querySelector?.('p') || 
                            node;
              const userText = textEl?.textContent?.trim() || '';
              
              console.log('[UploadToN8nWithLoaderDev] User text:', userText);
              
              forceClose();
              sendInteract({
                webhookSuccess: false,
                buttonPath: 'write',
                userMessage: userText
              });
              return;
            }
            
            // Détecter réponse assistant
            const isAssistantResponse = 
              node.classList?.contains('vfrc-system-response') ||
              node.classList?.contains('vfrc-assistant') ||
              node.classList?.contains('vfrc-message--assistant') ||
              node.querySelector?.('[class*="assistant"]') ||
              node.querySelector?.('[class*="system"]');
            
            if (isAssistantResponse && !node.querySelector?.('.upl')) {
              console.log('[UploadToN8nWithLoaderDev] Assistant response detected, closing...');
              forceClose();
              return;
            }
          }
        }
      });
      
      observer.observe(messageContainer, { 
        childList: true, 
        subtree: true 
      });
      
      console.log('[UploadToN8nWithLoaderDev] MutationObserver active');
      
      return () => observer.disconnect();
    };
    
    const cleanupDetection = setupUserMessageDetection();
    if (cleanupDetection) allCleanupFns.push(cleanupDetection);
    
    // ---------- CONFIG ----------
    const p = trace?.payload || {};
    const title         = p.title || '';
    const subtitle      = p.subtitle || '';
    const description   = p.description || 'Déposez vos fichiers ici';
    const accept        = p.accept || '.pdf,.docx';
    const maxFileSizeMB = p.maxFileSizeMB || 25;
    const maxFiles      = p.maxFiles || 10;
    
    const variables = p.variables || {};
    
    const colors = {
      text: '#111827',
      textLight: '#9CA3AF',
      border: '#E5E7EB',
      bg: '#FAFAFA',
      white: '#FFFFFF',
      accent: '#111827',
      success: '#10B981',
      error: '#EF4444',
      warning: '#F59E0B',
    };
    
    const webhook          = p.webhook || {};
    const webhookUrl       = webhook.url;
    const webhookMethod    = (webhook.method || 'POST').toUpperCase();
    const webhookHeaders   = webhook.headers || {};
    const webhookTimeoutMs = Number.isFinite(webhook.timeoutMs) ? webhook.timeoutMs : 60000;
    const webhookRetries   = Number.isFinite(webhook.retries) ? webhook.retries : 1;
    const fileFieldName    = webhook.fileFieldName || 'files';
    const extra            = webhook.extra || {};
    
    let requiredFiles;
    let isSimpleMode = false;
    
    if (p.minFiles !== undefined && p.minFiles !== null) {
      requiredFiles = Math.max(1, Math.min(Number(p.minFiles) || 1, maxFiles));
      isSimpleMode = true;
    } else {
      requiredFiles = 1;
      isSimpleMode = true;
    }
    
    const awaitResponse      = p.awaitResponse !== false;
    const polling            = p.polling || {};
    const pollingEnabled     = !!polling.enabled;
    const pollingIntervalMs  = Number.isFinite(polling.intervalMs) ? polling.intervalMs : 2000;
    const pollingMaxAttempts = Number.isFinite(polling.maxAttempts) ? polling.maxAttempts : 120;
    const pollingHeaders     = polling.headers || {};
    
    const sendButtonText = p.sendButtonText || 'Envoyer';
    
    const vfContext = {
      conversation_id: p.conversation_id || null,
      user_id: p.user_id || null,
      locale: p.locale || null,
    };
    
    const loaderCfg = p.loader || {};
    const loaderMode = (loaderCfg.mode || 'auto').toLowerCase();
    const minLoadingTimeMs = Number(loaderCfg.minLoadingTimeMs) > 0 ? Number(loaderCfg.minLoadingTimeMs) : 0;
    const autoCloseDelayMs = Number(loaderCfg.autoCloseDelayMs) > 0 ? Number(loaderCfg.autoCloseDelayMs) : 800;
    
    const defaultAutoSteps = [
      { progress: 0 },
      { progress: 30 },
      { progress: 60 },
      { progress: 85 },
      { progress: 100 }
    ];
    
    const timedPhases = Array.isArray(loaderCfg.phases) ? loaderCfg.phases : [];
    const totalSeconds = Number(loaderCfg.totalSeconds) > 0 ? Number(loaderCfg.totalSeconds) : 120;
    const stepMap = loaderCfg.stepMap || {};
    
    if (!webhookUrl) {
      const div = document.createElement('div');
      div.innerHTML = `<div style="padding:16px;font-size:13px;color:${colors.error}">
        Configuration manquante : webhook.url
      </div>`;
      element.appendChild(div);
      return;
    }
    
    const hasTitle = title && title.trim() !== '';
    const hasSubtitle = subtitle && subtitle.trim() !== '';
    const showHeader = hasTitle || hasSubtitle;
    
    let hintText = '';
    if (p.hint === false || p.hint === '') {
      hintText = '';
    } else if (typeof p.hint === 'string' && p.hint.trim() !== '') {
      hintText = p.hint;
    } else {
      hintText = requiredFiles === 1 
        ? `1 à ${maxFiles} fichiers` 
        : `${requiredFiles} à ${maxFiles} fichiers`;
    }
    
    const showHint = hintText && hintText.trim() !== '';
    
    const styles = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
      @keyframes slideIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      
      .upl {
        width: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        font-size: 14px;
        color: ${colors.text};
        animation: fadeIn 0.2s ease;
      }
      .upl * { box-sizing: border-box; }
      .upl-card {
        background: ${colors.white};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        overflow: hidden;
      }
      .upl-header { padding: 20px 20px 0; }
      .upl-title { font-size: 15px; font-weight: 600; color: ${colors.text}; margin: 0 0 2px; letter-spacing: -0.2px; }
      .upl-subtitle { font-size: 13px; color: ${colors.textLight}; font-weight: 400; }
      .upl-body { padding: 20px; }
      .upl-body.no-header { padding-top: 20px; }
      .upl-zone {
        background: ${colors.bg};
        border-radius: 6px;
        padding: 32px 20px;
        text-align: center;
        cursor: pointer;
        transition: background 0.15s ease;
        position: relative;
      }
      .upl-zone::before {
        content: '';
        position: absolute;
        inset: 8px;
        border: 1px dashed ${colors.border};
        border-radius: 4px;
        pointer-events: none;
        transition: border-color 0.15s ease;
      }
      .upl-zone:hover { background: #F3F4F6; }
      .upl-zone:hover::before { border-color: ${colors.textLight}; }
      .upl-zone.drag { background: #F3F4F6; }
      .upl-zone.drag::before { border-color: ${colors.text}; }
      .upl-zone-icon { width: 32px; height: 32px; margin: 0 auto 10px; color: ${colors.textLight}; transition: color 0.15s ease; }
      .upl-zone:hover .upl-zone-icon { color: ${colors.text}; }
      .upl-zone-text { font-size: 13px; color: ${colors.textLight}; font-weight: 400; line-height: 1.5; }
      .upl-zone-hint { font-size: 11px; color: ${colors.textLight}; margin-top: 6px; opacity: 0.7; }
      .upl-list { margin-top: 16px; display: none; }
      .upl-list.show { display: block; }
      .upl-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        background: ${colors.bg};
        border-radius: 6px;
        margin-bottom: 6px;
        animation: slideIn 0.15s ease;
      }
      .upl-item:last-child { margin-bottom: 0; }
      .upl-item-icon { width: 16px; height: 16px; color: ${colors.textLight}; margin-right: 10px; flex-shrink: 0; }
      .upl-item-info { flex: 1; min-width: 0; }
      .upl-item-name { font-size: 13px; font-weight: 500; color: ${colors.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .upl-item-size { font-size: 11px; color: ${colors.textLight}; margin-top: 1px; }
      .upl-item-del {
        width: 24px; height: 24px; border: none; background: none;
        color: ${colors.textLight}; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        border-radius: 4px; margin-left: 8px; transition: all 0.1s ease;
      }
      .upl-item-del:hover { background: rgba(239, 68, 68, 0.1); color: ${colors.error}; }
      .upl-meta {
        display: flex; align-items: center; justify-content: space-between;
        margin-top: 12px; padding-top: 12px; border-top: 1px solid ${colors.border};
      }
      .upl-count { font-size: 12px; color: ${colors.textLight}; }
      .upl-count.ok { color: ${colors.success}; }
      .upl-actions { display: flex; gap: 8px; }
      .upl-btn {
        padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500;
        cursor: pointer; transition: all 0.1s ease; border: 1px solid transparent;
      }
      .upl-btn-primary { background: ${colors.text}; color: ${colors.white}; border-color: ${colors.text}; }
      .upl-btn-primary:hover:not(:disabled) { background: #374151; border-color: #374151; }
      .upl-btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }
      .upl-msg { margin-top: 12px; padding: 10px 12px; border-radius: 6px; font-size: 12px; display: none; animation: fadeIn 0.15s ease; }
      .upl-msg.show { display: block; }
      .upl-msg.err { background: rgba(239, 68, 68, 0.08); color: ${colors.error}; }
      .upl-msg.ok { background: rgba(16, 185, 129, 0.08); color: ${colors.success}; }
      .upl-msg.warn { background: rgba(245, 158, 11, 0.08); color: ${colors.warning}; }
      .upl-msg.load { background: ${colors.bg}; color: ${colors.textLight}; }
      .upl-loader { display: none; padding: 32px 24px; animation: fadeIn 0.25s ease; }
      .upl-loader.show { display: block; }
      .upl-loader.hide { animation: fadeOut 0.2s ease; }
      .upl-loader-container { display: flex; align-items: center; gap: 16px; }
      .upl-loader-bar { flex: 1; height: 8px; background: ${colors.border}; border-radius: 4px; overflow: hidden; position: relative; }
      .upl-loader-fill {
        height: 100%; width: 0%; background: ${colors.text}; border-radius: 4px;
        transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative;
      }
      .upl-loader-fill::after {
        content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
        background-size: 200% 100%; animation: shimmer 2s infinite;
      }
      .upl-loader-pct { font-size: 15px; font-weight: 600; color: ${colors.text}; font-variant-numeric: tabular-nums; min-width: 48px; text-align: right; }
      .upl-loader.complete .upl-loader-fill { background: ${colors.success}; }
      .upl-loader.complete .upl-loader-fill::after { animation: none; }
      .upl-loader.complete .upl-loader-pct { color: ${colors.success}; }
      .upl-overlay { display: none; position: absolute; inset: 0; background: transparent; z-index: 10; border-radius: 8px; pointer-events: all; }
      .upl-overlay.show { display: block; }
    `;
    
    const icons = {
      upload: `<svg class="upl-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/></svg>`,
      file: `<svg class="upl-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
      x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    };
    
    // ---------- UI ----------
    const root = document.createElement('div');
    root.className = 'upl';
    root.style.position = 'relative';
    root.dataset.uploadExtension = 'true';
    
    const styleTag = document.createElement('style');
    styleTag.textContent = styles;
    root.appendChild(styleTag);
    
    let headerHTML = '';
    if (showHeader) {
      headerHTML = `<div class="upl-header">`;
      if (hasTitle) headerHTML += `<div class="upl-title">${title}</div>`;
      if (hasSubtitle) headerHTML += `<div class="upl-subtitle">${subtitle}</div>`;
      headerHTML += `</div>`;
    }
    
    const hintHTML = showHint ? `<div class="upl-zone-hint">${hintText}</div>` : '';
    const bodyClass = showHeader ? 'upl-body' : 'upl-body no-header';
    
    root.innerHTML += `
      <div class="upl-overlay"></div>
      <div class="upl-card">
        ${headerHTML}
        <div class="${bodyClass}">
          <div class="upl-zone">
            ${icons.upload}
            <div class="upl-zone-text">${description}</div>
            ${hintHTML}
            <input type="file" accept="${accept}" multiple style="display:none" />
          </div>
          <div class="upl-list"></div>
          <div class="upl-meta" style="display:none">
            <div class="upl-count"></div>
            <div class="upl-actions">
              <button class="upl-btn upl-btn-primary send-btn" disabled>${sendButtonText}</button>
            </div>
          </div>
          <div class="upl-msg"></div>
        </div>
        <div class="upl-loader">
          <div class="upl-loader-container">
            <div class="upl-loader-bar">
              <div class="upl-loader-fill"></div>
            </div>
            <div class="upl-loader-pct">0%</div>
          </div>
        </div>
      </div>
    `;
    element.appendChild(root);
    
    const uploadZone = root.querySelector('.upl-zone');
    const fileInput = root.querySelector('input[type="file"]');
    const filesList = root.querySelector('.upl-list');
    const metaDiv = root.querySelector('.upl-meta');
    const countDiv = root.querySelector('.upl-count');
    const sendBtn = root.querySelector('.send-btn');
    const msgDiv = root.querySelector('.upl-msg');
    const loader = root.querySelector('.upl-loader');
    const loaderPct = root.querySelector('.upl-loader-pct');
    const loaderFill = root.querySelector('.upl-loader-fill');
    const overlay = root.querySelector('.upl-overlay');
    const bodyDiv = root.querySelector('.upl-body');
    
    let selectedFiles = [];
    
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' o';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
      return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    }
    
    function showMsg(text, type = 'load') {
      msgDiv.textContent = text;
      msgDiv.className = `upl-msg show ${type}`;
    }
    
    function hideMsg() {
      msgDiv.className = 'upl-msg';
    }
    
    function updateList() {
      filesList.innerHTML = '';
      hideMsg();
      
      if (!selectedFiles.length) {
        filesList.classList.remove('show');
        metaDiv.style.display = 'none';
        sendBtn.disabled = true;
        return;
      }
      
      filesList.classList.add('show');
      metaDiv.style.display = 'flex';
      
      const total = selectedFiles.reduce((s, f) => s + f.size, 0);
      const enough = selectedFiles.length >= requiredFiles;
      
      countDiv.className = `upl-count${enough ? ' ok' : ''}`;
      countDiv.textContent = `${selectedFiles.length} fichier${selectedFiles.length > 1 ? 's' : ''} · ${formatSize(total)}`;
      
      selectedFiles.forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'upl-item';
        item.innerHTML = `
          ${icons.file}
          <div class="upl-item-info">
            <div class="upl-item-name">${file.name}</div>
            <div class="upl-item-size">${formatSize(file.size)}</div>
          </div>
          <button class="upl-item-del" data-i="${i}">${icons.x}</button>
        `;
        filesList.appendChild(item);
      });
      
      root.querySelectorAll('.upl-item-del').forEach(btn => {
        btn.onclick = () => {
          selectedFiles.splice(parseInt(btn.dataset.i), 1);
          updateList();
        };
      });
      
      sendBtn.disabled = !enough;
      
      if (selectedFiles.length > 0 && !enough) {
        const m = requiredFiles - selectedFiles.length;
        showMsg(`${m} fichier${m > 1 ? 's' : ''} manquant${m > 1 ? 's' : ''}`, 'warn');
      }
    }
    
    function addFiles(files) {
      const ok = [], errs = [];
      for (const f of files) {
        if (selectedFiles.length + ok.length >= maxFiles) {
          errs.push('Limite atteinte');
          break;
        }
        if (maxFileSizeMB && f.size > maxFileSizeMB * 1024 * 1024) {
          errs.push(`${f.name} trop volumineux`);
          continue;
        }
        if (selectedFiles.some(x => x.name === f.name && x.size === f.size)) {
          continue;
        }
        ok.push(f);
      }
      if (ok.length) {
        selectedFiles.push(...ok);
        updateList();
      }
      if (errs.length) showMsg(errs.join(' · '), 'err');
    }
    
    uploadZone.onclick = () => fileInput.click();
    uploadZone.ondragover = e => { e.preventDefault(); uploadZone.classList.add('drag'); };
    uploadZone.ondragleave = () => uploadZone.classList.remove('drag');
    uploadZone.ondrop = e => {
      e.preventDefault();
      uploadZone.classList.remove('drag');
      addFiles(Array.from(e.dataTransfer?.files || []));
    };
    fileInput.onchange = () => {
      addFiles(Array.from(fileInput.files || []));
      fileInput.value = '';
    };
    
    sendBtn.onclick = async () => {
      if (!selectedFiles.length || selectedFiles.length < requiredFiles) return;
      
      console.log('[UploadToN8nWithLoaderDev] Starting upload...');
      
      root.style.pointerEvents = 'none';
      overlay.classList.add('show');
      sendBtn.disabled = true;
      
      const startTime = Date.now();
      const ui = showLoaderUI();
      
      if (loaderMode === 'auto') ui.auto(defaultAutoSteps);
      else if (loaderMode === 'timed') ui.timed(buildPlan());
      else { ui.set(5); }
      
      try {
        const resp = await post({
          url: webhookUrl, method: webhookMethod, headers: webhookHeaders,
          timeoutMs: webhookTimeoutMs, retries: webhookRetries,
          files: selectedFiles, fileFieldName, extra, vfContext, variables
        });
        
        console.log('[UploadToN8nWithLoaderDev] Upload response:', resp);
        
        let data = resp?.data ?? null;
        
        if (awaitResponse && pollingEnabled) {
          const jobId = data?.jobId;
          const statusUrl = data?.statusUrl || p?.polling?.statusUrl;
          if (statusUrl || jobId) {
            data = await poll({
              statusUrl: statusUrl || `${webhookUrl.split('/webhook')[0]}/rest/jobs/${jobId}`,
              headers: pollingHeaders, intervalMs: pollingIntervalMs,
              maxAttempts: pollingMaxAttempts,
              onTick: st => {
                if (loaderMode === 'external') {
                  const pct = Number.isFinite(st?.percent) ? clamp(st.percent, 0, 100) : undefined;
                  const key = st?.phase;
                  const map = key && stepMap[key] ? stepMap[key] : null;
                  if (pct != null) ui.set(pct);
                  else if (map?.progress != null) ui.set(map.progress);
                }
              }
            });
          }
        }
        
        const elapsed = Date.now() - startTime;
        const remain = minLoadingTimeMs - elapsed;
        if (remain > 0) {
          ui.to(98, Math.min(remain, 1500));
          await new Promise(r => setTimeout(r, remain));
        }
        
        ui.done(data);
        
      } catch (err) {
        console.error('[UploadToN8nWithLoaderDev] Upload error:', err);
        forceClose();
        sendInteract({ 
          webhookSuccess: false, 
          error: String(err?.message || err), 
          buttonPath: 'error' 
        });
      }
    };
    
    function showLoaderUI() {
      loader.classList.add('show');
      bodyDiv.style.display = 'none';
      
      let cur = 0;
      let locked = false;
      
      const paint = () => {
        loaderFill.style.width = `${cur}%`;
        loaderPct.textContent = `${Math.round(cur)}%`;
      };
      paint();
      
      const clear = () => { 
        if (timedTimer) { 
          clearInterval(timedTimer); 
          timedTimer = null; 
        } 
      };
      
      return {
        auto(steps) {
          let i = 0;
          const go = () => {
            if (i >= steps.length || locked) return;
            const s = steps[i];
            this.to(s.progress, 1800, () => { i++; go(); });
          };
          go();
        },
        
        timed(plan) {
          let idx = 0;
          const next = () => {
            if (idx >= plan.length || locked) return;
            const p = plan[idx++];
            const t0 = Date.now(), t1 = t0 + p.durationMs;
            clear();
            timedTimer = setInterval(() => {
              if (locked) { clear(); return; }
              const now = Date.now();
              const r = clamp((now - t0) / p.durationMs, 0, 1);
              const newVal = p.progressStart + (p.progressEnd - p.progressStart) * r;
              if (newVal > cur) { cur = newVal; paint(); }
              if (now >= t1) { clear(); cur = Math.max(cur, p.progressEnd); paint(); next(); }
            }, 80);
          };
          next();
        },
        
        set(p) { if (!locked && p > cur) { cur = clamp(p, 0, 100); paint(); } },
        
        to(target, ms = 1200, cb) {
          const targetClamped = clamp(target, 0, 100);
          if (targetClamped <= cur) { if (cb) cb(); return; }
          const s = cur, e = targetClamped, t0 = performance.now();
          const step = t => {
            if (locked) { if (cb) cb(); return; }
            const k = clamp((t - t0) / ms, 0, 1);
            const newVal = s + (e - s) * k;
            if (newVal > cur) { cur = newVal; paint(); }
            if (k < 1) requestAnimationFrame(step);
            else if (cb) cb();
          };
          requestAnimationFrame(step);
        },
        
        done(data) {
          console.log('[UploadToN8nWithLoaderDev] Done, closing...');
          locked = true;
          clear();
          
          this.to(100, 400, () => {
            loader.classList.add('complete');
            setTimeout(() => {
              forceClose();
              sendInteract({
                webhookSuccess: true,
                webhookResponse: data,
                files: selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
                buttonPath: 'success'
              });
            }, autoCloseDelayMs);
          });
        }
      };
    }
    
    function buildPlan() {
      const haveSeconds = timedPhases.every(ph => Number(ph.seconds) > 0);
      let total = haveSeconds ? timedPhases.reduce((s, ph) => s + Number(ph.seconds), 0) : totalSeconds;
      const weightsSum = timedPhases.reduce((s, ph) => s + (Number(ph.weight) || 0), 0) || timedPhases.length;
      const alloc = timedPhases.map((ph) => {
        const sec = haveSeconds ? Number(ph.seconds) : (Number(ph.weight) || 1) / weightsSum * total;
        return { key: ph.key, seconds: sec };
      });
      const startP = 5, endP = 98;
      const totalMs = alloc.reduce((s, a) => s + a.seconds * 1000, 0);
      let acc = 0, last = startP;
      const plan = alloc.map((a, i) => {
        const pStart = i === 0 ? startP : last;
        const pEnd = i === alloc.length - 1 ? endP : startP + (endP - startP) * ((acc + a.seconds * 1000) / totalMs);
        acc += a.seconds * 1000;
        last = pEnd;
        return { durationMs: Math.max(500, a.seconds * 1000), progressStart: pStart, progressEnd: pEnd };
      });
      if (!plan.length) {
        return defaultAutoSteps.map((s, i, arr) => ({
          durationMs: i === 0 ? 1000 : 1500,
          progressStart: i ? arr[i - 1].progress : 0, progressEnd: s.progress
        }));
      }
      return plan;
    }
    
    async function post({ url, method, headers, timeoutMs, retries, files, fileFieldName, extra, vfContext, variables }) {
      let err;
      for (let i = 0; i <= retries; i++) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs);
          const fd = new FormData();
          files.forEach(f => fd.append(fileFieldName, f, f.name));
          
          Object.entries(extra).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
          Object.entries(variables).forEach(([k, v]) => {
            fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
          });
          
          if (vfContext.conversation_id) fd.append('conversation_id', vfContext.conversation_id);
          if (vfContext.user_id) fd.append('user_id', vfContext.user_id);
          if (vfContext.locale) fd.append('locale', vfContext.locale);
          
          const h = { ...headers };
          delete h['Content-Type'];
          const r = await fetch(url, { method, headers: h, body: fd, signal: ctrl.signal });
          clearTimeout(to);
          if (!r.ok) throw new Error(`Erreur ${r.status}`);
          return { ok: true, data: await r.json().catch(() => null) };
        } catch (e) {
          err = e;
          if (i < retries) await new Promise(r => setTimeout(r, 900));
        }
      }
      throw err || new Error('Échec');
    }
    
    async function poll({ statusUrl, headers, intervalMs, maxAttempts, onTick }) {
      for (let i = 1; i <= maxAttempts; i++) {
        const r = await fetch(statusUrl, { headers });
        if (!r.ok) throw new Error(`Polling ${r.status}`);
        const j = await r.json().catch(() => ({}));
        if (j?.status === 'error') throw new Error(j?.error || 'Erreur');
        if (typeof onTick === 'function') onTick({ percent: j?.percent, phase: j?.phase, message: j?.message });
        if (j?.status === 'done') return j?.data ?? j;
        await new Promise(r => setTimeout(r, intervalMs));
      }
      throw new Error('Timeout');
    }
    
    return cleanup;
  }
};
try { window.UploadToN8nWithLoaderDev = UploadToN8nWithLoaderDev; } catch {}
