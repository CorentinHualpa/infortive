// UploadToN8nWithLoader-dev.js – v8.2
// © Corentin – Interception AGRESSIVE des messages user
// v8.2 : Intercepte les events au niveau le plus bas (capture phase)
//        Empêche l'envoi natif à Voiceflow
//        Fermeture garantie
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
      console.error('[UploadExt] match error:', e);
      return false;
    }
  },
  
  render({ trace, element }) {
    if (!element) {
      console.error('[UploadExt] No element');
      return;
    }
    
    console.log('[UploadExt] v8.2 - Init');
    
    // ══════════════════════════════════════════════════════════════
    // STATE
    // ══════════════════════════════════════════════════════════════
    let isActive = true;
    let timedTimer = null;
    const cleanupFns = [];
    
    // ══════════════════════════════════════════════════════════════
    // SHADOW DOM HELPERS
    // ══════════════════════════════════════════════════════════════
    const getAllShadowRoots = () => {
      const roots = [];
      const walk = (node) => {
        if (node.shadowRoot) {
          roots.push(node.shadowRoot);
          node.shadowRoot.querySelectorAll('*').forEach(walk);
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('*').forEach(child => {
            if (child.shadowRoot) {
              roots.push(child.shadowRoot);
              walk(child.shadowRoot);
            }
          });
        }
      };
      walk(document);
      return roots;
    };
    
    const findInShadow = (selector) => {
      let el = document.querySelector(selector);
      if (el) return el;
      for (const root of getAllShadowRoots()) {
        el = root.querySelector(selector);
        if (el) return el;
      }
      return null;
    };
    
    // ══════════════════════════════════════════════════════════════
    // CLEANUP
    // ══════════════════════════════════════════════════════════════
    const cleanup = () => {
      console.log('[UploadExt] Cleanup');
      isActive = false;
      if (timedTimer) { clearInterval(timedTimer); timedTimer = null; }
      cleanupFns.forEach(fn => { try { fn(); } catch(e) {} });
      cleanupFns.length = 0;
    };
    
    const forceClose = () => {
      console.log('[UploadExt] Force close');
      cleanup();
      try { root.style.display = 'none'; } catch(e) {}
      try { root.style.visibility = 'hidden'; } catch(e) {}
      try { root.style.height = '0'; } catch(e) {}
      try { root.style.overflow = 'hidden'; } catch(e) {}
      try { if (root.parentNode) root.parentNode.removeChild(root); } catch(e) {}
    };
    
    const sendInteract = (payload) => {
      console.log('[UploadExt] Interact:', payload);
      try {
        window?.voiceflow?.chat?.interact?.({ type: 'complete', payload });
      } catch(e) {
        console.error('[UploadExt] Interact error:', e);
      }
    };
    
    // ══════════════════════════════════════════════════════════════
    // INTERCEPTION DES MESSAGES USER
    // ══════════════════════════════════════════════════════════════
    const setupInputInterception = () => {
      console.log('[UploadExt] Setting up input interception...');
      
      // Chercher les éléments dans shadow DOM
      const textareaSelectors = [
        'textarea.vfrc-chat-input',
        'textarea[id^="vf-chat-input"]',
        'textarea[class*="chat"]',
        'textarea[class*="input"]',
        'textarea',
        'input[type="text"][class*="chat"]'
      ];
      
      const buttonSelectors = [
        '#vfrc-send-message',
        'button.vfrc-chat-input__send',
        'button[type="submit"]',
        'button[class*="send"]',
        'button[aria-label*="send"]',
        'button[aria-label*="Send"]'
      ];
      
      const formSelectors = [
        'form.vfrc-chat-input',
        'form[class*="chat"]',
        'form[class*="input"]',
        'form'
      ];
      
      let textarea = null;
      let sendBtn = null;
      let form = null;
      
      // Trouver le textarea
      for (const sel of textareaSelectors) {
        textarea = findInShadow(sel);
        if (textarea) {
          console.log('[UploadExt] Found textarea:', sel);
          break;
        }
      }
      
      // Trouver le bouton send
      for (const sel of buttonSelectors) {
        sendBtn = findInShadow(sel);
        if (sendBtn) {
          console.log('[UploadExt] Found send button:', sel);
          break;
        }
      }
      
      // Trouver le form
      for (const sel of formSelectors) {
        form = findInShadow(sel);
        if (form) {
          console.log('[UploadExt] Found form:', sel);
          break;
        }
      }
      
      if (!textarea) {
        console.warn('[UploadExt] No textarea found!');
      }
      
      // ─────────────────────────────────────────────────────────────
      // HANDLER PRINCIPAL
      // ─────────────────────────────────────────────────────────────
      const handleUserInput = (e) => {
        if (!isActive) return;
        if (!textarea) return;
        
        const text = textarea.value?.trim();
        if (!text) return;
        
        console.log('[UploadExt] Intercepted user input:', text);
        
        // BLOQUER L'ÉVÉNEMENT NATIF
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Vider le textarea
        textarea.value = '';
        
        // Trigger input event pour que Voiceflow update son state
        try {
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } catch(err) {}
        
        // Fermer et envoyer
        forceClose();
        sendInteract({
          webhookSuccess: false,
          buttonPath: 'write',
          userMessage: text
        });
        
        return false;
      };
      
      // ─────────────────────────────────────────────────────────────
      // ATTACHER LES LISTENERS (capture phase = true)
      // ─────────────────────────────────────────────────────────────
      
      // Sur le form
      if (form) {
        const onSubmit = (e) => {
          if (!isActive) return;
          console.log('[UploadExt] Form submit intercepted');
          handleUserInput(e);
        };
        form.addEventListener('submit', onSubmit, true);
        cleanupFns.push(() => form.removeEventListener('submit', onSubmit, true));
      }
      
      // Sur le bouton send
      if (sendBtn) {
        const onClick = (e) => {
          if (!isActive) return;
          console.log('[UploadExt] Send button click intercepted');
          handleUserInput(e);
        };
        sendBtn.addEventListener('click', onClick, true);
        sendBtn.addEventListener('mousedown', onClick, true);
        sendBtn.addEventListener('pointerdown', onClick, true);
        cleanupFns.push(() => {
          sendBtn.removeEventListener('click', onClick, true);
          sendBtn.removeEventListener('mousedown', onClick, true);
          sendBtn.removeEventListener('pointerdown', onClick, true);
        });
      }
      
      // Sur le textarea (Enter key)
      if (textarea) {
        const onKeydown = (e) => {
          if (!isActive) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            console.log('[UploadExt] Enter key intercepted');
            handleUserInput(e);
          }
        };
        textarea.addEventListener('keydown', onKeydown, true);
        textarea.addEventListener('keypress', onKeydown, true);
        cleanupFns.push(() => {
          textarea.removeEventListener('keydown', onKeydown, true);
          textarea.removeEventListener('keypress', onKeydown, true);
        });
      }
      
      // ─────────────────────────────────────────────────────────────
      // GLOBAL LISTENER (backup)
      // Intercepte au niveau document/window
      // ─────────────────────────────────────────────────────────────
      const globalKeyHandler = (e) => {
        if (!isActive) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          // Vérifier si le focus est sur notre textarea
          const activeEl = document.activeElement;
          const shadowActive = activeEl?.shadowRoot?.activeElement;
          
          if (activeEl?.tagName === 'TEXTAREA' || shadowActive?.tagName === 'TEXTAREA') {
            const ta = shadowActive || activeEl;
            const text = ta.value?.trim();
            if (text && ta !== fileInput) {
              console.log('[UploadExt] Global Enter intercepted');
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              
              ta.value = '';
              
              forceClose();
              sendInteract({
                webhookSuccess: false,
                buttonPath: 'write',
                userMessage: text
              });
            }
          }
        }
      };
      
      document.addEventListener('keydown', globalKeyHandler, true);
      window.addEventListener('keydown', globalKeyHandler, true);
      cleanupFns.push(() => {
        document.removeEventListener('keydown', globalKeyHandler, true);
        window.removeEventListener('keydown', globalKeyHandler, true);
      });
      
      console.log('[UploadExt] Input interception ready');
    };
    
    // Setup interception après un court délai (laisser le DOM se stabiliser)
    setTimeout(setupInputInterception, 100);
    
    // ══════════════════════════════════════════════════════════════
    // CONFIG
    // ══════════════════════════════════════════════════════════════
    const p = trace?.payload || {};
    const title         = p.title || '';
    const subtitle      = p.subtitle || '';
    const description   = p.description || 'Déposez vos fichiers ici';
    const accept        = p.accept || '.pdf,.docx';
    const maxFileSizeMB = p.maxFileSizeMB || 25;
    const maxFiles      = p.maxFiles || 10;
    const variables     = p.variables || {};
    
    const colors = {
      text: '#111827',
      textLight: '#9CA3AF',
      border: '#E5E7EB',
      bg: '#FAFAFA',
      white: '#FFFFFF',
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
    
    const requiredFiles = Math.max(1, Math.min(Number(p.minFiles) || 1, maxFiles));
    
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
      { progress: 0 }, { progress: 30 }, { progress: 60 }, { progress: 85 }, { progress: 100 }
    ];
    
    const timedPhases = Array.isArray(loaderCfg.phases) ? loaderCfg.phases : [];
    const totalSeconds = Number(loaderCfg.totalSeconds) > 0 ? Number(loaderCfg.totalSeconds) : 120;
    const stepMap = loaderCfg.stepMap || {};
    
    if (!webhookUrl) {
      element.innerHTML = `<div style="padding:16px;color:${colors.error}">Config manquante: webhook.url</div>`;
      return;
    }
    
    // ══════════════════════════════════════════════════════════════
    // UI
    // ══════════════════════════════════════════════════════════════
    const hasTitle = title?.trim();
    const hasSubtitle = subtitle?.trim();
    const showHeader = hasTitle || hasSubtitle;
    
    let hintText = '';
    if (p.hint === false || p.hint === '') hintText = '';
    else if (typeof p.hint === 'string' && p.hint.trim()) hintText = p.hint;
    else hintText = `${requiredFiles} à ${maxFiles} fichiers`;
    
    const styles = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      .upl { width: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; font-size: 14px; color: ${colors.text}; animation: fadeIn 0.2s ease; }
      .upl * { box-sizing: border-box; }
      .upl-card { background: ${colors.white}; border: 1px solid ${colors.border}; border-radius: 8px; overflow: hidden; }
      .upl-header { padding: 20px 20px 0; }
      .upl-title { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
      .upl-subtitle { font-size: 13px; color: ${colors.textLight}; }
      .upl-body { padding: 20px; }
      .upl-zone { background: ${colors.bg}; border-radius: 6px; padding: 32px 20px; text-align: center; cursor: pointer; position: relative; transition: background 0.15s; }
      .upl-zone::before { content: ''; position: absolute; inset: 8px; border: 1px dashed ${colors.border}; border-radius: 4px; pointer-events: none; }
      .upl-zone:hover { background: #F3F4F6; }
      .upl-zone.drag { background: #F3F4F6; }
      .upl-zone-icon { width: 32px; height: 32px; margin: 0 auto 10px; color: ${colors.textLight}; }
      .upl-zone-text { font-size: 13px; color: ${colors.textLight}; line-height: 1.5; }
      .upl-zone-hint { font-size: 11px; color: ${colors.textLight}; margin-top: 6px; opacity: 0.7; }
      .upl-list { margin-top: 16px; display: none; }
      .upl-list.show { display: block; }
      .upl-item { display: flex; align-items: center; padding: 10px 12px; background: ${colors.bg}; border-radius: 6px; margin-bottom: 6px; }
      .upl-item-icon { width: 16px; height: 16px; color: ${colors.textLight}; margin-right: 10px; }
      .upl-item-info { flex: 1; min-width: 0; }
      .upl-item-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .upl-item-size { font-size: 11px; color: ${colors.textLight}; margin-top: 1px; }
      .upl-item-del { width: 24px; height: 24px; border: none; background: none; color: ${colors.textLight}; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 4px; margin-left: 8px; }
      .upl-item-del:hover { background: rgba(239,68,68,0.1); color: ${colors.error}; }
      .upl-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${colors.border}; }
      .upl-count { font-size: 12px; color: ${colors.textLight}; }
      .upl-count.ok { color: ${colors.success}; }
      .upl-btn { padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
      .upl-btn-primary { background: ${colors.text}; color: ${colors.white}; }
      .upl-btn-primary:hover:not(:disabled) { background: #374151; }
      .upl-btn-primary:disabled { opacity: 0.3; cursor: not-allowed; }
      .upl-msg { margin-top: 12px; padding: 10px 12px; border-radius: 6px; font-size: 12px; display: none; }
      .upl-msg.show { display: block; }
      .upl-msg.err { background: rgba(239,68,68,0.08); color: ${colors.error}; }
      .upl-msg.warn { background: rgba(245,158,11,0.08); color: ${colors.warning}; }
      .upl-loader { display: none; padding: 32px 24px; }
      .upl-loader.show { display: block; }
      .upl-loader-container { display: flex; align-items: center; gap: 16px; }
      .upl-loader-bar { flex: 1; height: 8px; background: ${colors.border}; border-radius: 4px; overflow: hidden; }
      .upl-loader-fill { height: 100%; width: 0%; background: ${colors.text}; border-radius: 4px; transition: width 0.4s; position: relative; }
      .upl-loader-fill::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%); background-size: 200% 100%; animation: shimmer 2s infinite; }
      .upl-loader-pct { font-size: 15px; font-weight: 600; min-width: 48px; text-align: right; }
      .upl-loader.complete .upl-loader-fill { background: ${colors.success}; }
      .upl-loader.complete .upl-loader-pct { color: ${colors.success}; }
      .upl-overlay { display: none; position: absolute; inset: 0; z-index: 10; }
      .upl-overlay.show { display: block; }
    `;
    
    const icons = {
      upload: `<svg class="upl-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/></svg>`,
      file: `<svg class="upl-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
      x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    };
    
    const root = document.createElement('div');
    root.className = 'upl';
    root.style.position = 'relative';
    root.dataset.uploadExtension = 'true';
    
    root.innerHTML = `
      <style>${styles}</style>
      <div class="upl-overlay"></div>
      <div class="upl-card">
        ${showHeader ? `<div class="upl-header">${hasTitle ? `<div class="upl-title">${title}</div>` : ''}${hasSubtitle ? `<div class="upl-subtitle">${subtitle}</div>` : ''}</div>` : ''}
        <div class="upl-body">
          <div class="upl-zone">
            ${icons.upload}
            <div class="upl-zone-text">${description}</div>
            ${hintText ? `<div class="upl-zone-hint">${hintText}</div>` : ''}
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
            <div class="upl-loader-bar"><div class="upl-loader-fill"></div></div>
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
    const formatSize = (bytes) => bytes < 1024 ? bytes + ' o' : bytes < 1024*1024 ? (bytes/1024).toFixed(1) + ' Ko' : (bytes/(1024*1024)).toFixed(1) + ' Mo';
    
    const showMsg = (text, type = 'warn') => { msgDiv.textContent = text; msgDiv.className = `upl-msg show ${type}`; };
    const hideMsg = () => { msgDiv.className = 'upl-msg'; };
    
    const updateList = () => {
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
        item.innerHTML = `${icons.file}<div class="upl-item-info"><div class="upl-item-name">${file.name}</div><div class="upl-item-size">${formatSize(file.size)}</div></div><button class="upl-item-del" data-i="${i}">${icons.x}</button>`;
        filesList.appendChild(item);
      });
      
      root.querySelectorAll('.upl-item-del').forEach(btn => {
        btn.onclick = () => { selectedFiles.splice(parseInt(btn.dataset.i), 1); updateList(); };
      });
      
      sendBtn.disabled = !enough;
      
      if (selectedFiles.length > 0 && !enough) {
        showMsg(`${requiredFiles - selectedFiles.length} fichier(s) manquant(s)`, 'warn');
      }
    };
    
    const addFiles = (files) => {
      const ok = [], errs = [];
      for (const f of files) {
        if (selectedFiles.length + ok.length >= maxFiles) { errs.push('Limite'); break; }
        if (maxFileSizeMB && f.size > maxFileSizeMB * 1024 * 1024) { errs.push(`${f.name} trop gros`); continue; }
        if (selectedFiles.some(x => x.name === f.name && x.size === f.size)) continue;
        ok.push(f);
      }
      if (ok.length) { selectedFiles.push(...ok); updateList(); }
      if (errs.length) showMsg(errs.join(' · '), 'err');
    };
    
    uploadZone.onclick = () => fileInput.click();
    uploadZone.ondragover = e => { e.preventDefault(); uploadZone.classList.add('drag'); };
    uploadZone.ondragleave = () => uploadZone.classList.remove('drag');
    uploadZone.ondrop = e => { e.preventDefault(); uploadZone.classList.remove('drag'); addFiles(Array.from(e.dataTransfer?.files || [])); };
    fileInput.onchange = () => { addFiles(Array.from(fileInput.files || [])); fileInput.value = ''; };
    
    sendBtn.onclick = async () => {
      if (selectedFiles.length < requiredFiles) return;
      
      console.log('[UploadExt] Starting upload...');
      
      root.style.pointerEvents = 'none';
      overlay.classList.add('show');
      sendBtn.disabled = true;
      
      const startTime = Date.now();
      const ui = showLoaderUI();
      
      if (loaderMode === 'timed') ui.timed(buildPlan());
      else ui.auto(defaultAutoSteps);
      
      try {
        const resp = await post({
          url: webhookUrl, method: webhookMethod, headers: webhookHeaders,
          timeoutMs: webhookTimeoutMs, retries: webhookRetries,
          files: selectedFiles, fileFieldName, extra, vfContext, variables
        });
        
        console.log('[UploadExt] Response:', resp);
        
        let data = resp?.data ?? null;
        
        if (awaitResponse && pollingEnabled) {
          const jobId = data?.jobId;
          const statusUrl = data?.statusUrl || polling?.statusUrl;
          if (statusUrl || jobId) {
            data = await poll({
              statusUrl: statusUrl || `${webhookUrl.split('/webhook')[0]}/rest/jobs/${jobId}`,
              headers: pollingHeaders, intervalMs: pollingIntervalMs, maxAttempts: pollingMaxAttempts,
              onTick: st => {
                if (loaderMode === 'external' && Number.isFinite(st?.percent)) ui.set(st.percent);
              }
            });
          }
        }
        
        const elapsed = Date.now() - startTime;
        if (minLoadingTimeMs - elapsed > 0) {
          ui.to(98, Math.min(minLoadingTimeMs - elapsed, 1500));
          await new Promise(r => setTimeout(r, minLoadingTimeMs - elapsed));
        }
        
        ui.done(data);
        
      } catch (err) {
        console.error('[UploadExt] Error:', err);
        forceClose();
        sendInteract({ webhookSuccess: false, error: String(err?.message || err), buttonPath: 'error' });
      }
    };
    
    function showLoaderUI() {
      loader.classList.add('show');
      bodyDiv.style.display = 'none';
      let cur = 0, locked = false;
      
      const paint = () => { loaderFill.style.width = `${cur}%`; loaderPct.textContent = `${Math.round(cur)}%`; };
      const clear = () => { if (timedTimer) { clearInterval(timedTimer); timedTimer = null; } };
      
      return {
        auto(steps) {
          let i = 0;
          const go = () => { if (i >= steps.length || locked) return; this.to(steps[i].progress, 1800, () => { i++; go(); }); };
          go();
        },
        timed(plan) {
          let idx = 0;
          const next = () => {
            if (idx >= plan.length || locked) return;
            const p = plan[idx++], t0 = Date.now(), t1 = t0 + p.durationMs;
            clear();
            timedTimer = setInterval(() => {
              if (locked) { clear(); return; }
              const r = clamp((Date.now() - t0) / p.durationMs, 0, 1);
              const nv = p.progressStart + (p.progressEnd - p.progressStart) * r;
              if (nv > cur) { cur = nv; paint(); }
              if (Date.now() >= t1) { clear(); cur = Math.max(cur, p.progressEnd); paint(); next(); }
            }, 80);
          };
          next();
        },
        set(p) { if (!locked && p > cur) { cur = clamp(p, 0, 100); paint(); } },
        to(target, ms = 1200, cb) {
          const t = clamp(target, 0, 100);
          if (t <= cur) { cb?.(); return; }
          const s = cur, t0 = performance.now();
          const step = now => {
            if (locked) { cb?.(); return; }
            const k = clamp((now - t0) / ms, 0, 1), nv = s + (t - s) * k;
            if (nv > cur) { cur = nv; paint(); }
            if (k < 1) requestAnimationFrame(step);
            else cb?.();
          };
          requestAnimationFrame(step);
        },
        done(data) {
          console.log('[UploadExt] Done');
          locked = true; clear();
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
      const total = haveSeconds ? timedPhases.reduce((s, ph) => s + Number(ph.seconds), 0) : totalSeconds;
      const alloc = timedPhases.map(ph => ({ seconds: haveSeconds ? Number(ph.seconds) : total / timedPhases.length }));
      const startP = 5, endP = 98;
      const totalMs = alloc.reduce((s, a) => s + a.seconds * 1000, 0);
      let acc = 0, last = startP;
      return alloc.map((a, i) => {
        const pStart = i === 0 ? startP : last;
        const pEnd = i === alloc.length - 1 ? endP : startP + (endP - startP) * ((acc + a.seconds * 1000) / totalMs);
        acc += a.seconds * 1000;
        last = pEnd;
        return { durationMs: Math.max(500, a.seconds * 1000), progressStart: pStart, progressEnd: pEnd };
      });
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
          Object.entries(variables).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
          if (vfContext.conversation_id) fd.append('conversation_id', vfContext.conversation_id);
          if (vfContext.user_id) fd.append('user_id', vfContext.user_id);
          const h = { ...headers }; delete h['Content-Type'];
          const r = await fetch(url, { method, headers: h, body: fd, signal: ctrl.signal });
          clearTimeout(to);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return { ok: true, data: await r.json().catch(() => null) };
        } catch (e) { err = e; if (i < retries) await new Promise(r => setTimeout(r, 900)); }
      }
      throw err || new Error('Failed');
    }
    
    async function poll({ statusUrl, headers, intervalMs, maxAttempts, onTick }) {
      for (let i = 1; i <= maxAttempts; i++) {
        const r = await fetch(statusUrl, { headers });
        if (!r.ok) throw new Error(`Poll ${r.status}`);
        const j = await r.json().catch(() => ({}));
        if (j?.status === 'error') throw new Error(j?.error || 'Error');
        onTick?.({ percent: j?.percent, phase: j?.phase });
        if (j?.status === 'done') return j?.data ?? j;
        await new Promise(r => setTimeout(r, intervalMs));
      }
      throw new Error('Timeout');
    }
    
    return cleanup;
  }
};
try { window.UploadToN8nWithLoaderDev = UploadToN8nWithLoaderDev; } catch {}
