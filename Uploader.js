// Uploader.js – v11.0
// © Corentin – Full session isolation + debug logs
//
export const Uploader = {
  name: 'Uploader',
  type: 'response',
  match(context) {
    try {
      const t = context?.trace || {};
      const type = t.type || '';
      const pname = t.payload?.name || '';
      const isMe = s => /(^ext_)?Uploader(Dev)?$/i.test(s || '');
      return isMe(type) || (type === 'extension' && isMe(pname)) || (/^ext_/i.test(type) && isMe(pname));
    } catch (e) {
      console.error('[UPL] match error:', e);
      return false;
    }
  },
  
  render({ trace, element }) {
    if (!element) {
      console.error('[UPL] Élément parent introuvable');
      return;
    }
    
    const ID = Math.random().toString(36).slice(2, 8);
    const log = (...args) => console.log(`[UPL:${ID}]`, ...args);
    const warn = (...args) => console.warn(`[UPL:${ID}]`, ...args);
    const err = (...args) => console.error(`[UPL:${ID}]`, ...args);
    
    log('v11.0 - render() appelé');
    log('element:', element);
    log('element.isConnected:', element.isConnected);
    log('trace payload keys:', Object.keys(trace?.payload || {}));
    
    // ═══════════════════════════════════════════════════════════
    // STEP 1 : Tuer TOUTES les anciennes instances
    // ═══════════════════════════════════════════════════════════
    
    // 1a. Via le callback global
    if (window.__uplCleanup) {
      log('Cleanup ancienne instance via window.__uplCleanup');
      try { window.__uplCleanup(); } catch(e) { err('cleanup error:', e); }
      window.__uplCleanup = null;
    }
    
    // 1b. Via le DOM (document principal)
    const killOld = (container) => {
      const oldNodes = container.querySelectorAll('[data-upl]');
      oldNodes.forEach(n => {
        log('Kill ancien noeud DOM:', n.dataset.uplId, 'dans', container === document ? 'document' : 'shadowRoot');
        n.style.pointerEvents = 'none';
        n.style.display = 'none';
        try { n.remove(); } catch(e) {}
      });
    };
    
    killOld(document);
    
    // 1c. Via les shadow roots
    document.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) killOld(el.shadowRoot);
    });
    
    // ═══════════════════════════════════════════════════════════
    // STEP 2 : State de cette instance
    // ═══════════════════════════════════════════════════════════
    
    let alive = true;
    let uploading = false;
    let timedTimer = null;
    let observerCleanup = null;
    let selectedFiles = []; // { meta, buffer }
    
    const die = (reason) => {
      if (!alive) return;
      log('die() -', reason);
      alive = false;
      if (observerCleanup) { observerCleanup(); observerCleanup = null; }
      if (timedTimer) { clearInterval(timedTimer); timedTimer = null; }
      if (window.__uplCleanup === cleanup) window.__uplCleanup = null;
      root.style.display = 'none';
      root.style.pointerEvents = 'none';
    };
    
    const cleanup = () => die('cleanup() appelé');
    
    // Enregistrer pour que la prochaine instance puisse nous tuer
    window.__uplCleanup = cleanup;
    
    // ═══════════════════════════════════════════════════════════
    // STEP 3 : Config
    // ═══════════════════════════════════════════════════════════
    
    const p = trace?.payload || {};
    const title         = p.title || '';
    const subtitle      = p.subtitle || '';
    const description   = p.description || 'Déposez vos fichiers ici';
    const accept        = p.accept || '.pdf,.docx';
    const maxFileSizeMB = p.maxFileSizeMB || 25;
    const maxFiles      = p.maxFiles || 10;
    const variables     = p.variables || {};
    
    const colors = {
      text: '#111827', textLight: '#9CA3AF', border: '#E5E7EB',
      bg: '#FAFAFA', white: '#FFFFFF', success: '#10B981',
      error: '#EF4444', warning: '#F59E0B',
    };
    
    const webhook          = p.webhook || {};
    const webhookUrl       = webhook.url;
    const webhookMethod    = (webhook.method || 'POST').toUpperCase();
    const webhookHeaders   = webhook.headers || {};
    const webhookTimeoutMs = Number.isFinite(webhook.timeoutMs) ? webhook.timeoutMs : 60000;
    const webhookRetries   = Number.isFinite(webhook.retries) ? webhook.retries : 1;
    const fileFieldName    = webhook.fileFieldName || 'files';
    const extra            = webhook.extra || {};
    const requiredFiles    = Math.max(1, Math.min(Number(p.minFiles) || 1, maxFiles));
    
    const awaitResponse      = p.awaitResponse !== false;
    const polling            = p.polling || {};
    const pollingEnabled     = !!polling.enabled;
    const pollingIntervalMs  = Number.isFinite(polling.intervalMs) ? polling.intervalMs : 2000;
    const pollingMaxAttempts = Number.isFinite(polling.maxAttempts) ? polling.maxAttempts : 120;
    const pollingHeaders     = polling.headers || {};
    const sendButtonText     = p.sendButtonText || 'Envoyer';
    
    const vfContext = {
      conversation_id: p.conversation_id || null,
      user_id: p.user_id || null,
      locale: p.locale || null,
    };
    
    log('Config:', { webhookUrl, maxFiles, requiredFiles, accept, conversation_id: vfContext.conversation_id });
    
    const loaderCfg = p.loader || {};
    const loaderMode = (loaderCfg.mode || 'auto').toLowerCase();
    const minLoadingTimeMs = Number(loaderCfg.minLoadingTimeMs) > 0 ? Number(loaderCfg.minLoadingTimeMs) : 0;
    const autoCloseDelayMs = Number(loaderCfg.autoCloseDelayMs) > 0 ? Number(loaderCfg.autoCloseDelayMs) : 800;
    const defaultAutoSteps = [{ progress: 0 }, { progress: 30 }, { progress: 60 }, { progress: 85 }, { progress: 100 }];
    const timedPhases = Array.isArray(loaderCfg.phases) ? loaderCfg.phases : [];
    const totalSeconds = Number(loaderCfg.totalSeconds) > 0 ? Number(loaderCfg.totalSeconds) : 120;
    
    if (!webhookUrl) {
      element.innerHTML = `<div style="padding:16px;color:${colors.error}">Config manquante: webhook.url</div>`;
      return;
    }
    
    const hasTitle = title?.trim();
    const hasSubtitle = subtitle?.trim();
    const showHeader = hasTitle || hasSubtitle;
    
    let hintText = '';
    if (p.hint === false || p.hint === '') hintText = '';
    else if (typeof p.hint === 'string' && p.hint.trim()) hintText = p.hint;
    else hintText = `${requiredFiles} à ${maxFiles} fichiers`;
    
    // ═══════════════════════════════════════════════════════════
    // STEP 4 : DOM
    // ═══════════════════════════════════════════════════════════
    
    const styles = `
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      .upl{width:100%;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;font-size:14px;color:${colors.text};animation:fadeIn .2s ease}
      .upl *{box-sizing:border-box}
      .upl-card{background:${colors.white};border:1px solid ${colors.border};border-radius:8px;overflow:hidden}
      .upl-header{padding:20px 20px 0}
      .upl-title{font-size:15px;font-weight:600;margin:0 0 2px}
      .upl-subtitle{font-size:13px;color:${colors.textLight}}
      .upl-body{padding:20px}
      .upl-zone{background:${colors.bg};border-radius:6px;padding:32px 20px;text-align:center;cursor:pointer;position:relative;transition:background .15s}
      .upl-zone::before{content:'';position:absolute;inset:8px;border:1px dashed ${colors.border};border-radius:4px;pointer-events:none}
      .upl-zone:hover{background:#F3F4F6}
      .upl-zone.drag{background:#F3F4F6}
      .upl-zone-icon{width:32px;height:32px;margin:0 auto 10px;color:${colors.textLight}}
      .upl-zone-text{font-size:13px;color:${colors.textLight};line-height:1.5}
      .upl-zone-hint{font-size:11px;color:${colors.textLight};margin-top:6px;opacity:.7}
      .upl-list{margin-top:16px;display:none}
      .upl-list.show{display:block}
      .upl-item{display:flex;align-items:center;padding:10px 12px;background:${colors.bg};border-radius:6px;margin-bottom:6px}
      .upl-item-icon{width:16px;height:16px;color:${colors.textLight};margin-right:10px}
      .upl-item-info{flex:1;min-width:0}
      .upl-item-name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .upl-item-size{font-size:11px;color:${colors.textLight};margin-top:1px}
      .upl-item-del{width:24px;height:24px;border:none;background:none;color:${colors.textLight};cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:4px;margin-left:8px}
      .upl-item-del:hover{background:rgba(239,68,68,.1);color:${colors.error}}
      .upl-meta{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid ${colors.border}}
      .upl-count{font-size:12px;color:${colors.textLight}}
      .upl-count.ok{color:${colors.success}}
      .upl-btn{padding:8px 16px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid transparent}
      .upl-btn-primary{background:${colors.text};color:${colors.white}}
      .upl-btn-primary:hover:not(:disabled){background:#374151}
      .upl-btn-primary:disabled{opacity:.3;cursor:not-allowed}
      .upl-msg{margin-top:12px;padding:10px 12px;border-radius:6px;font-size:12px;display:none}
      .upl-msg.show{display:block}
      .upl-msg.err{background:rgba(239,68,68,.08);color:${colors.error}}
      .upl-msg.warn{background:rgba(245,158,11,.08);color:${colors.warning}}
      .upl-loader{display:none;padding:32px 24px}
      .upl-loader.show{display:block}
      .upl-loader-container{display:flex;align-items:center;gap:16px}
      .upl-loader-bar{flex:1;height:8px;background:${colors.border};border-radius:4px;overflow:hidden}
      .upl-loader-fill{height:100%;width:0%;background:${colors.text};border-radius:4px;transition:width .4s;position:relative}
      .upl-loader-fill::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.3) 50%,transparent 100%);background-size:200% 100%;animation:shimmer 2s infinite}
      .upl-loader-pct{font-size:15px;font-weight:600;min-width:48px;text-align:right}
      .upl-loader.complete .upl-loader-fill{background:${colors.success}}
      .upl-loader.complete .upl-loader-pct{color:${colors.success}}
      .upl-overlay{display:none;position:absolute;inset:0;z-index:10}
      .upl-overlay.show{display:block}
    `;
    
    const icons = {
      upload: `<svg class="upl-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/></svg>`,
      file: `<svg class="upl-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
      x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    };
    
    const root = document.createElement('div');
    root.className = 'upl';
    root.style.position = 'relative';
    root.dataset.upl = 'true';
    root.dataset.uplId = ID;
    
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
    
    log('DOM monté, root.isConnected:', root.isConnected);
    
    const $ = sel => root.querySelector(sel);
    const uploadZone = $('.upl-zone');
    const fileInput  = $('input[type="file"]');
    const filesList  = $('.upl-list');
    const metaDiv    = $('.upl-meta');
    const countDiv   = $('.upl-count');
    const sendBtn    = $('.send-btn');
    const msgDiv     = $('.upl-msg');
    const loader     = $('.upl-loader');
    const loaderPct  = $('.upl-loader-pct');
    const loaderFill = $('.upl-loader-fill');
    const overlay    = $('.upl-overlay');
    const bodyDiv    = $('.upl-body');
    
    log('Elements found:', {
      uploadZone: !!uploadZone, fileInput: !!fileInput, sendBtn: !!sendBtn
    });
    
    // ═══════════════════════════════════════════════════════════
    // STEP 5 : Helpers
    // ═══════════════════════════════════════════════════════════
    
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const formatSize = (bytes) => bytes < 1024 ? bytes + ' o' : bytes < 1024*1024 ? (bytes/1024).toFixed(1) + ' Ko' : (bytes/(1024*1024)).toFixed(1) + ' Mo';
    const showMsg = (text, type = 'warn') => { msgDiv.textContent = text; msgDiv.className = `upl-msg show ${type}`; };
    const hideMsg = () => { msgDiv.className = 'upl-msg'; };
    
    const readFileToBuffer = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          log(`Fichier lu en mémoire: ${file.name} (${file.size} bytes)`);
          resolve({
            meta: { name: file.name, size: file.size, type: file.type },
            buffer: reader.result
          });
        };
        reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}`));
        reader.readAsArrayBuffer(file);
      });
    };
    
    // ═══════════════════════════════════════════════════════════
    // STEP 6 : File management
    // ═══════════════════════════════════════════════════════════
    
    const updateList = () => {
      if (!alive) { warn('updateList() appelé sur instance morte'); return; }
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
      
      const total = selectedFiles.reduce((s, f) => s + f.meta.size, 0);
      const enough = selectedFiles.length >= requiredFiles;
      
      countDiv.className = `upl-count${enough ? ' ok' : ''}`;
      countDiv.textContent = `${selectedFiles.length} fichier${selectedFiles.length > 1 ? 's' : ''} · ${formatSize(total)}`;
      
      selectedFiles.forEach((file, i) => {
        const item = document.createElement('div');
        item.className = 'upl-item';
        item.innerHTML = `${icons.file}<div class="upl-item-info"><div class="upl-item-name">${file.meta.name}</div><div class="upl-item-size">${formatSize(file.meta.size)}</div></div><button class="upl-item-del" data-i="${i}">${icons.x}</button>`;
        filesList.appendChild(item);
      });
      
      root.querySelectorAll('.upl-item-del').forEach(btn => {
        btn.onclick = () => {
          if (!alive) return;
          selectedFiles.splice(parseInt(btn.dataset.i), 1);
          updateList();
        };
      });
      
      sendBtn.disabled = !enough;
      
      if (selectedFiles.length > 0 && !enough) {
        showMsg(`${requiredFiles - selectedFiles.length} fichier(s) manquant(s)`, 'warn');
      }
      
      log(`Liste mise à jour: ${selectedFiles.length} fichiers, enough=${enough}`);
    };
    
    const addFiles = async (files) => {
      if (!alive) { warn('addFiles() appelé sur instance morte, ignoré'); return; }
      log(`addFiles() - ${files.length} fichier(s) à ajouter`);
      
      const errs = [];
      for (const f of files) {
        log(`  Processing: ${f.name} (${f.size} bytes, type=${f.type})`);
        if (selectedFiles.length >= maxFiles) { errs.push('Limite atteinte'); break; }
        if (maxFileSizeMB && f.size > maxFileSizeMB * 1024 * 1024) { errs.push(`${f.name} trop gros`); continue; }
        if (selectedFiles.some(x => x.meta.name === f.name && x.meta.size === f.size)) {
          log(`  Doublon ignoré: ${f.name}`);
          continue;
        }
        try {
          const buffered = await readFileToBuffer(f);
          if (!alive) { warn('Instance morte pendant readFileToBuffer, abandon'); return; }
          selectedFiles.push(buffered);
          log(`  Ajouté: ${f.name}`);
        } catch (e) {
          err(`  Erreur lecture: ${f.name}`, e);
          errs.push(e.message);
        }
      }
      updateList();
      if (errs.length) showMsg(errs.join(' · '), 'err');
    };
    
    // ═══════════════════════════════════════════════════════════
    // STEP 7 : Event handlers
    // ═══════════════════════════════════════════════════════════
    
    uploadZone.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!alive) { warn('click sur zone morte'); return; }
      log('Zone cliquée → ouverture sélecteur fichier');
      fileInput.click();
    });
    
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (alive) uploadZone.classList.add('drag');
    });
    
    uploadZone.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      uploadZone.classList.remove('drag');
    });
    
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.remove('drag');
      if (!alive) { warn('drop sur instance morte'); return; }
      const files = Array.from(e.dataTransfer?.files || []);
      log(`Drop: ${files.length} fichier(s)`);
      addFiles(files);
    });
    
    fileInput.addEventListener('change', () => {
      if (!alive) { warn('change sur input mort'); return; }
      const files = Array.from(fileInput.files || []);
      log(`Input change: ${files.length} fichier(s)`);
      addFiles(files);
      fileInput.value = '';
    });
    
    // ═══════════════════════════════════════════════════════════
    // STEP 8 : Auto-unlock (ferme l'UI si l'user tape un message)
    // ═══════════════════════════════════════════════════════════
    
    const setupAutoUnlock = () => {
      const findChat = () => {
        for (const sel of ['#voiceflow-chat-container', '#voiceflow-chat']) {
          const el = document.querySelector(sel);
          if (el?.shadowRoot) return el;
        }
        for (const el of document.querySelectorAll('*')) {
          if (el.shadowRoot?.querySelector('[class*="vfrc"]')) return el;
        }
        return null;
      };
      
      const container = findChat();
      if (!container?.shadowRoot) {
        log('Pas de shadowRoot → auto-unlock désactivé');
        return null;
      }
      
      const sr = container.shadowRoot;
      let dialogEl = null;
      for (const sel of ['.vfrc-chat--dialog', '[class*="Dialog"]', '[class*="dialog"]', '.vfrc-chat', '[class*="Messages"]']) {
        dialogEl = sr.querySelector(sel);
        if (dialogEl) break;
      }
      
      if (!dialogEl) {
        log('Pas de dialog → auto-unlock désactivé');
        return null;
      }
      
      log('Auto-unlock: observer configuré sur', dialogEl.className || dialogEl.tagName);
      
      let ready = false;
      
      const observer = new MutationObserver((mutations) => {
        if (!alive || uploading || !ready) return;
        
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType !== 1) continue;
            if (root.contains(node)) continue;
            if (node.dataset?.upl) continue;
            
            const isUser = node.classList?.contains('vfrc-user-response') ||
                           node.classList?.contains('vfrc-message--user');
            
            if (isUser) {
              log('Message user détecté dans le chat → die()');
              die('user message detected');
              return;
            }
          }
        }
      });
      
      observer.observe(dialogEl, { childList: true, subtree: true });
      
      // Délai avant activation pour ignorer les mutations d'init
      setTimeout(() => {
        if (alive) {
          ready = true;
          log('Auto-unlock: ready');
        }
      }, 2500);
      
      return () => { observer.disconnect(); log('Auto-unlock: observer déconnecté'); };
    };
    
    setTimeout(() => {
      if (alive && !uploading) {
        observerCleanup = setupAutoUnlock();
      }
    }, 300);
    
    // ═══════════════════════════════════════════════════════════
    // STEP 9 : Upload
    // ═══════════════════════════════════════════════════════════
    
    sendBtn.addEventListener('click', async () => {
      if (selectedFiles.length < requiredFiles) { warn('Pas assez de fichiers'); return; }
      if (!alive) { warn('send sur instance morte'); return; }
      if (uploading) { warn('Upload déjà en cours'); return; }
      
      log(`Début upload: ${selectedFiles.length} fichier(s)`);
      uploading = true;
      
      // Couper l'auto-unlock pendant l'upload
      if (observerCleanup) { observerCleanup(); observerCleanup = null; }
      
      root.style.pointerEvents = 'none';
      overlay.classList.add('show');
      sendBtn.disabled = true;
      
      const startTime = Date.now();
      const ui = showLoaderUI();
      
      if (loaderMode === 'timed') ui.timed(buildPlan());
      else ui.auto(defaultAutoSteps);
      
      try {
        const resp = await postFiles({
          url: webhookUrl, method: webhookMethod, headers: webhookHeaders,
          timeoutMs: webhookTimeoutMs, retries: webhookRetries,
          files: selectedFiles, fileFieldName, extra, vfContext, variables
        });
        
        log('Réponse webhook:', resp);
        
        let data = resp?.data ?? null;
        
        if (awaitResponse && pollingEnabled) {
          const jobId = data?.jobId;
          const statusUrl = data?.statusUrl || polling?.statusUrl;
          if (statusUrl || jobId) {
            log('Début polling...');
            data = await doPoll({
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
        
      } catch (error) {
        err('Upload échoué:', error);
        uploading = false;
        loader.classList.remove('show');
        bodyDiv.style.display = '';
        showMsg(String(error?.message || error), 'err');
        sendBtn.disabled = false;
        root.style.pointerEvents = '';
        overlay.classList.remove('show');
        
        window?.voiceflow?.chat?.interact?.({
          type: 'complete',
          payload: { webhookSuccess: false, error: String(error?.message || error), buttonPath: 'error' }
        });
      }
    });
    
    // ═══════════════════════════════════════════════════════════
    // STEP 10 : Loader UI
    // ═══════════════════════════════════════════════════════════
    
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
            const pp = plan[idx++], t0 = Date.now(), t1 = t0 + pp.durationMs;
            clear();
            timedTimer = setInterval(() => {
              if (locked) { clear(); return; }
              const r = clamp((Date.now() - t0) / pp.durationMs, 0, 1);
              const nv = pp.progressStart + (pp.progressEnd - pp.progressStart) * r;
              if (nv > cur) { cur = nv; paint(); }
              if (Date.now() >= t1) { clear(); cur = Math.max(cur, pp.progressEnd); paint(); next(); }
            }, 80);
          };
          next();
        },
        set(val) { if (!locked && val > cur) { cur = clamp(val, 0, 100); paint(); } },
        to(target, ms = 1200, cb) {
          const t = clamp(target, 0, 100);
          if (t <= cur) { cb?.(); return; }
          const s = cur, t0 = performance.now();
          const step = now => {
            if (locked) { cb?.(); return; }
            const k = clamp((now - t0) / ms, 0, 1), nv = s + (t - s) * k;
            if (nv > cur) { cur = nv; paint(); }
            if (k < 1) requestAnimationFrame(step); else cb?.();
          };
          requestAnimationFrame(step);
        },
        done(data) {
          log('Upload terminé, fermeture...');
          locked = true; clear();
          this.to(100, 400, () => {
            loader.classList.add('complete');
            setTimeout(() => {
              uploading = false;
              die('upload complete');
              
              window?.voiceflow?.chat?.interact?.({
                type: 'complete',
                payload: {
                  webhookSuccess: true,
                  webhookResponse: data,
                  files: selectedFiles.map(f => ({ name: f.meta.name, size: f.meta.size, type: f.meta.type })),
                  buttonPath: 'success'
                }
              });
            }, autoCloseDelayMs);
          });
        }
      };
    }
    
    function buildPlan() {
      const haveSeconds = timedPhases.every(ph => Number(ph.seconds) > 0);
      const tot = haveSeconds ? timedPhases.reduce((s, ph) => s + Number(ph.seconds), 0) : totalSeconds;
      const alloc = timedPhases.map(ph => ({ seconds: haveSeconds ? Number(ph.seconds) : tot / timedPhases.length }));
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
    
    // ═══════════════════════════════════════════════════════════
    // STEP 11 : Network
    // ═══════════════════════════════════════════════════════════
    
    async function postFiles({ url, method, headers, timeoutMs, retries, files, fileFieldName, extra, vfContext, variables }) {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          log(`POST attempt ${attempt + 1}/${retries + 1}`);
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs);
          const fd = new FormData();
          
          files.forEach(f => {
            const blob = new File([f.buffer], f.meta.name, { type: f.meta.type });
            fd.append(fileFieldName, blob, f.meta.name);
            log(`  FormData: ${f.meta.name} (${f.meta.size} bytes)`);
          });
          
          Object.entries(extra).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
          Object.entries(variables).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
          if (vfContext.conversation_id) fd.append('conversation_id', vfContext.conversation_id);
          if (vfContext.user_id) fd.append('user_id', vfContext.user_id);
          
          const h = { ...headers }; delete h['Content-Type'];
          const r = await fetch(url, { method, headers: h, body: fd, signal: ctrl.signal });
          clearTimeout(timer);
          
          log(`Response status: ${r.status}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          
          const data = await r.json().catch(() => null);
          log('Response data:', data);
          return { ok: true, data };
        } catch (e) {
          lastErr = e;
          err(`Attempt ${attempt + 1} failed:`, e.message);
          if (attempt < retries) await new Promise(r => setTimeout(r, 900));
        }
      }
      throw lastErr || new Error('Failed');
    }
    
    async function doPoll({ statusUrl, headers, intervalMs, maxAttempts, onTick }) {
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
    
    // ═══════════════════════════════════════════════════════════
    // STEP 12 : Return cleanup pour Voiceflow
    // ═══════════════════════════════════════════════════════════
    
    log('Extension prête ✓');
    
    return () => {
      log('Voiceflow a appelé le cleanup callback');
      die('voiceflow cleanup callback');
    };
  }
};
try { window.Uploader = Uploader; } catch {}
