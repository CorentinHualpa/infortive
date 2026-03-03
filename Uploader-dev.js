// Uploader.js – v11.2-debug
// © Corentin – SPA fix + extensive debug logging
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
      const result = isMe(type) || (type === 'extension' && isMe(pname)) || (/^ext_/i.test(type) && isMe(pname));
      console.log(`[UploadExt] match() appelé — type="${type}" pname="${pname}" → ${result}`);
      return result;
    } catch (e) {
      console.error('[UploadExt] match error:', e);
      return false;
    }
  },

  render({ trace, element }) {
    console.group('[UploadExt] ══════════ RENDER START ══════════');
    console.log('[UploadExt] Version: 11.2-debug');
    console.log('[UploadExt] element:', element);
    console.log('[UploadExt] trace:', trace);
    console.log('[UploadExt] payload:', trace?.payload);

    if (!element) {
      console.error('[UploadExt] ❌ Élément parent introuvable — ABORT');
      console.groupEnd();
      return;
    }

    // ── Force cleanup de toute instance précédente ──────────────────────
    if (window.__uploaderInstance) {
      console.warn('[UploadExt] ⚠️ Instance précédente détectée → cleanup');
      try { window.__uploaderInstance(); } catch(e) { console.error('[UploadExt] cleanup error:', e); }
      window.__uploaderInstance = null;
    } else {
      console.log('[UploadExt] Pas d\'instance précédente');
    }

    // ── Helper shadow root ──────────────────────────────────────────────
    const findChatContainer = () => {
      const el = document.getElementById('vf-chat') ||
                 document.getElementById('voiceflow-chat');
      if (el?.shadowRoot) return el;
      const allWithShadow = document.querySelectorAll('*');
      for (const e of allWithShadow) {
        if (e.shadowRoot?.querySelector('[class*="vfrc"]')) return e;
      }
      return null;
    };

    // ── Blocage chat ────────────────────────────────────────────────────
    let _eventBlockers = [];
    let _blockStyle = null;

    const getChatSR = () => {
      const el = document.getElementById('vf-chat') ||
                 document.getElementById('voiceflow-chat') ||
                 document.querySelector('[id*="vf-chat"]');
      const sr = el?.shadowRoot || null;
      console.log('[UploadExt] getChatSR() → el:', el, '| shadowRoot:', sr ? '✅ trouvé' : '❌ null');
      return sr;
    };

    const blockChatInput = () => {
      console.log('[UploadExt] blockChatInput() appelé');
      const sr = getChatSR();
      if (!sr) {
        console.warn('[UploadExt] ⚠️ blockChatInput: shadowRoot null → retry 200ms');
        setTimeout(blockChatInput, 200);
        return;
      }
      if (_eventBlockers.length) {
        console.log('[UploadExt] blockChatInput: déjà bloqué, skip');
        return;
      }

      const footer   = sr.querySelector('.vfrc-footer');
      const textarea = sr.querySelector('textarea');
      const sendBtn  = sr.querySelector('#vfrc-send-message') ||
                       sr.querySelector('button[type="submit"]') ||
                       sr.querySelector('.vfrc-chat-input__send');

      console.log('[UploadExt] Elements trouvés pour blocage — footer:', !!footer, '| textarea:', !!textarea, '| sendBtn:', !!sendBtn);

      const blockEvent = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
      };
      const eventsToBlock = [
        'click','mousedown','mouseup','mousemove',
        'touchstart','touchend','touchmove',
        'keydown','keyup','keypress','input',
        'focus','blur','submit'
      ];
      [footer, textarea, sendBtn].filter(Boolean).forEach(el => {
        eventsToBlock.forEach(type => {
          el.addEventListener(type, blockEvent, true);
          _eventBlockers.push({ el, type, fn: blockEvent });
        });
      });
      if (textarea) textarea.blur();

      if (!_blockStyle) {
        _blockStyle = document.createElement('style');
        _blockStyle.id = 'upl-block-visual';
        _blockStyle.textContent = `
          .vfrc-footer {
            opacity: 0.45 !important;
            filter: grayscale(0.4) !important;
            cursor: not-allowed !important;
          }
          textarea.vfrc-chat-input::placeholder {
            color: #9CA3AF !important;
          }
          #vfrc-send-message,
          .vfrc-chat-input__send {
            background: #D1D5DB !important;
            background: linear-gradient(135deg, #D1D5DB, #9CA3AF) !important;
            border-color: #D1D5DB !important;
            color: #6B7280 !important;
            box-shadow: none !important;
            cursor: not-allowed !important;
          }
          #vfrc-send-message::after,
          .vfrc-chat-input__send::after {
            content: "Uploadez d'abord le document" !important;
          }
        `;
        sr.appendChild(_blockStyle);
      }

      console.log(`[UploadExt] ✅ Chat bloqué — ${_eventBlockers.length} listeners posés`);
    };

    const unblockChatInput = () => {
      console.log(`[UploadExt] unblockChatInput() — ${_eventBlockers.length} listeners à retirer`);
      _eventBlockers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn, true));
      _eventBlockers = [];
      if (_blockStyle) { _blockStyle.remove(); _blockStyle = null; }
      console.log('[UploadExt] ✅ Chat débloqué');
    };

    // ── Auto-scroll ─────────────────────────────────────────────────────
    const scrollToSelf = () => {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    };

    // ── State ───────────────────────────────────────────────────────────
    let isComponentActive = true;
    let isUploading = false;
    let timedTimer = null;
    let cleanupObserver = null;

    console.log('[UploadExt] State initial — isComponentActive:', isComponentActive, '| isUploading:', isUploading);

    const setupAutoUnlock = () => {
      console.log('[UploadExt] setupAutoUnlock() appelé');
      const container = findChatContainer();
      if (!container?.shadowRoot) {
        console.warn('[UploadExt] setupAutoUnlock: pas de container shadowRoot');
        return null;
      }
      const shadowRoot = container.shadowRoot;
      const selectors = [
        '.vfrc-chat--dialog', '[class*="Dialog"]', '[class*="dialog"]',
        '.vfrc-chat', '[class*="Messages"]', '[class*="messages"]'
      ];
      let dialogEl = null;
      for (const sel of selectors) { dialogEl = shadowRoot.querySelector(sel); if (dialogEl) break; }
      if (!dialogEl) {
        console.warn('[UploadExt] setupAutoUnlock: dialogEl introuvable');
        return null;
      }
      console.log('[UploadExt] setupAutoUnlock: observer posé sur', dialogEl.className);

      const observer = new MutationObserver((mutations) => {
        if (!isComponentActive || isUploading) return;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.dataset?.uploadExtension === 'true') continue;
            const isUser = node.classList?.contains('vfrc-user-response') ||
                           node.classList?.contains('vfrc-message--user') ||
                           node.querySelector?.('[class*="user"]');
            const isSys  = node.classList?.contains('vfrc-system-response') ||
                           node.classList?.contains('vfrc-assistant') ||
                           node.querySelector?.('[class*="assistant"]') ||
                           node.querySelector?.('[class*="system"]');
            if (isUser || isSys) {
              console.log('[UploadExt] autoUnlock déclenché par mutation — node:', node.className);
              autoUnlock();
              return;
            }
          }
        }
      });
      observer.observe(dialogEl, { childList: true, subtree: true });
      return () => observer.disconnect();
    };

    const autoUnlock = () => {
      console.log('[UploadExt] autoUnlock() — isComponentActive:', isComponentActive);
      if (!isComponentActive) return;
      isComponentActive = false;
      if (cleanupObserver) { cleanupObserver(); cleanupObserver = null; }
      if (timedTimer) { clearInterval(timedTimer); timedTimer = null; }
      root.style.display = 'none';
      unblockChatInput();
    };

    setTimeout(() => {
      if (isComponentActive && !isUploading) {
        console.log('[UploadExt] setupAutoUnlock lancé (500ms)');
        cleanupObserver = setupAutoUnlock();
      }
    }, 500);

    // ── Payload ─────────────────────────────────────────────────────────
    const p = trace?.payload || {};
    const title         = p.title || '';
    const subtitle      = p.subtitle || '';
    const description   = p.description || 'Glissez-déposez :';
    const descSub       = p.descSub || '(Brief de mission, cahier des charges, etc.)';
    const accept        = p.accept || '.pdf,.docx';
    const maxFileSizeMB = p.maxFileSizeMB || 25;
    const maxFiles      = p.maxFiles || 10;
    const variables     = p.variables || {};

    console.log('[UploadExt] Config — accept:', accept, '| maxFileSizeMB:', maxFileSizeMB, '| maxFiles:', maxFiles);

    const colors = {
      text: '#111827', textLight: '#9CA3AF', border: '#E5E7EB',
      bg: '#FAFAFA', white: '#FFFFFF', success: '#10B981',
      error: '#EF4444', warning: '#F59E0B', accent: '#1E2A3A',
    };

    const webhook          = p.webhook || {};
    const webhookUrl       = webhook.url;
    const webhookMethod    = (webhook.method || 'POST').toUpperCase();
    const webhookHeaders   = webhook.headers || {};
    const webhookTimeoutMs = Number.isFinite(webhook.timeoutMs) ? webhook.timeoutMs : 60000;
    const webhookRetries   = Number.isFinite(webhook.retries) ? webhook.retries : 1;
    const fileFieldName    = webhook.fileFieldName || 'files';
    const extra            = webhook.extra || {};

    console.log('[UploadExt] Webhook — url:', webhookUrl, '| method:', webhookMethod, '| timeoutMs:', webhookTimeoutMs);

    const requiredFiles = Math.max(1, Math.min(Number(p.minFiles) || 1, maxFiles));
    console.log('[UploadExt] requiredFiles:', requiredFiles);

    const awaitResponse      = p.awaitResponse !== false;
    const polling            = p.polling || {};
    const pollingEnabled     = !!polling.enabled;
    const pollingIntervalMs  = Number.isFinite(polling.intervalMs) ? polling.intervalMs : 2000;
    const pollingMaxAttempts = Number.isFinite(polling.maxAttempts) ? polling.maxAttempts : 120;
    const pollingHeaders     = polling.headers || {};

    console.log('[UploadExt] Polling — enabled:', pollingEnabled, '| intervalMs:', pollingIntervalMs, '| maxAttempts:', pollingMaxAttempts);

    const sendButtonText = p.sendButtonText || 'Envoyer';

    const vfContext = {
      conversation_id: p.conversation_id || null,
      user_id: p.user_id || null,
      locale: p.locale || null,
    };

    const loaderCfg         = p.loader || {};
    const loaderMode        = (loaderCfg.mode || 'auto').toLowerCase();
    const minLoadingTimeMs  = Number(loaderCfg.minLoadingTimeMs) > 0 ? Number(loaderCfg.minLoadingTimeMs) : 0;
    const autoCloseDelayMs  = Number(loaderCfg.autoCloseDelayMs) > 0 ? Number(loaderCfg.autoCloseDelayMs) : 800;
    const defaultAutoSteps  = [
      { progress: 0 }, { progress: 30 }, { progress: 60 }, { progress: 85 }, { progress: 100 }
    ];
    const timedPhases  = Array.isArray(loaderCfg.phases) ? loaderCfg.phases : [];
    const totalSeconds = Number(loaderCfg.totalSeconds) > 0 ? Number(loaderCfg.totalSeconds) : 120;

    console.log('[UploadExt] Loader — mode:', loaderMode, '| minLoadingTimeMs:', minLoadingTimeMs, '| phases:', timedPhases.length);

    if (!webhookUrl) {
      console.error('[UploadExt] ❌ webhook.url manquant — ABORT');
      element.innerHTML = `<div style="padding:16px;color:${colors.error}">Config manquante: webhook.url</div>`;
      console.groupEnd();
      return;
    }

    const hasTitle    = title?.trim();
    const hasSubtitle = subtitle?.trim();
    const showHeader  = hasTitle || hasSubtitle;

    // ── Styles ──────────────────────────────────────────────────────────
    const styles = `
      @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
      @keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }

      .upl { width:100%; max-width:100%; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif; font-size:14px; color:${colors.text}; animation:fadeIn 0.2s ease; box-sizing:border-box; }
      .upl * { box-sizing:border-box; }

      .upl-card { background:${colors.white}; border:1px solid ${colors.border}; border-radius:8px; overflow:hidden; width:100%; }
      .upl-header { padding:20px 20px 0; }
      .upl-title  { font-size:15px; font-weight:600; margin:0 0 2px; }
      .upl-subtitle { font-size:13px; color:${colors.textLight}; }
      .upl-body { padding:14px 16px 16px; overflow:hidden; }

      .upl-zone {
        background:${colors.bg}; border-radius:6px; padding:32px 20px;
        text-align:center; cursor:pointer; position:relative;
        transition:background 0.15s; width:100%;
      }
      .upl-zone::before {
        content:''; position:absolute; inset:8px;
        border:1px dashed ${colors.border}; border-radius:4px; pointer-events:none;
      }
      .upl-zone:hover, .upl-zone.drag { background:#F3F4F6; }
      .upl-zone-icon { width:32px; height:32px; margin:0 auto 10px; color:${colors.textLight}; }
      .upl-zone-text { font-size:13px; color:${colors.textLight}; line-height:1.5; }
      .upl-zone-sub  { font-size:12px; color:${colors.textLight}; opacity:.7; }

      .upl-zone.compact {
        padding:14px 10px;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        min-height:120px;
      }
      .upl-zone.compact .upl-zone-icon { width:20px; height:20px; margin:0 0 6px; }
      .upl-zone.compact .upl-zone-text { font-size:11px; }
      .upl-zone.compact .upl-zone-sub  { font-size:10px; }
      .upl-zone.compact::before { inset:5px; }

      .upl-two-col { display:flex; gap:10px; align-items:flex-start; width:100%; min-width:0; }
      .upl-col-left  { flex:0 0 110px; min-width:0; }
      .upl-col-right {
        flex:1; display:flex; flex-direction:column; gap:8px; min-width:0;
      }

      .upl-send-wrapper { display:flex; flex-direction:column; gap:4px; }
      .upl-btn { padding:9px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid transparent; width:100%; text-align:center; }
      .upl-btn-primary { background:${colors.accent}; color:${colors.white}; }
      .upl-btn-primary:hover:not(:disabled) { background:#2d3f52; }
      .upl-btn-primary:disabled { opacity:.35; cursor:not-allowed; }
      .upl-send-hint { font-size:11px; color:${colors.textLight}; text-align:center; }

      .upl-file-list { display:flex; flex-direction:column; gap:5px; }
      .upl-item {
        display:flex; align-items:center; padding:7px 10px;
        background:${colors.bg}; border-radius:6px;
      }
      .upl-item-icon { width:14px; height:14px; color:${colors.textLight}; margin-right:8px; flex-shrink:0; }
      .upl-item-info { flex:1; min-width:0; }
      .upl-item-name { font-size:12px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .upl-item-size { font-size:10px; color:${colors.textLight}; margin-top:1px; }
      .upl-item-del  { width:20px; height:20px; border:none; background:none; color:${colors.textLight}; cursor:pointer; display:flex; align-items:center; justify-content:center; border-radius:4px; margin-left:6px; flex-shrink:0; }
      .upl-item-del:hover { background:rgba(239,68,68,.1); color:${colors.error}; }

      .upl-count { font-size:11px; color:${colors.textLight}; }
      .upl-count.ok { color:${colors.success}; }

      .upl-msg { margin-top:10px; padding:8px 12px; border-radius:6px; font-size:12px; display:none; }
      .upl-msg.show { display:block; }
      .upl-msg.err  { background:rgba(239,68,68,.08); color:${colors.error}; }
      .upl-msg.warn { background:rgba(245,158,11,.08); color:${colors.warning}; }

      .upl-loader { display:none; padding:32px 24px; }
      .upl-loader.show { display:block; }
      .upl-loader-container { display:flex; align-items:center; gap:16px; }
      .upl-loader-bar  { flex:1; height:8px; background:${colors.border}; border-radius:4px; overflow:hidden; }
      .upl-loader-fill { height:100%; width:0%; background:${colors.text}; border-radius:4px; transition:width .4s; position:relative; }
      .upl-loader-fill::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.3) 50%,transparent 100%); background-size:200% 100%; animation:shimmer 2s infinite; }
      .upl-loader-pct  { font-size:15px; font-weight:600; min-width:48px; text-align:right; }
      .upl-loader.complete .upl-loader-fill { background:${colors.success}; }
      .upl-loader.complete .upl-loader-pct  { color:${colors.success}; }

      .upl-overlay { display:none; position:absolute; inset:0; z-index:10; }
      .upl-overlay.show { display:block; }
    `;

    const icons = {
      upload: `<svg class="upl-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/></svg>`,
      file:   `<svg class="upl-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`,
      x:      `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`
    };

    // ── DOM root ────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'upl';
    root.style.cssText = 'position:relative; overflow:hidden; max-width:100%;';
    root.dataset.uploadExtension = 'true';

    root.innerHTML = `
      <style>${styles}</style>
      <div class="upl-overlay"></div>
      <div class="upl-card">
        ${showHeader ? `<div class="upl-header">${hasTitle ? `<div class="upl-title">${title}</div>` : ''}${hasSubtitle ? `<div class="upl-subtitle">${subtitle}</div>` : ''}</div>` : ''}
        <div class="upl-body">
          <div class="upl-initial-view">
            <div class="upl-zone" id="drop-zone-main">
              ${icons.upload}
              <div class="upl-zone-text">${description}</div>
              <div class="upl-zone-sub">${descSub}</div>
              <input type="file" accept="${accept}" multiple style="display:none" />
            </div>
          </div>
          <div class="upl-two-col" id="two-col-view" style="display:none">
            <div class="upl-col-left">
              <div class="upl-zone compact" id="drop-zone-compact">
                ${icons.upload}
                <div class="upl-zone-text">Ajouter</div>
                <div class="upl-zone-sub">${accept.split(',').join(', ')}</div>
                <input type="file" accept="${accept}" multiple style="display:none" />
              </div>
            </div>
            <div class="upl-col-right">
              <div class="upl-send-wrapper">
                <button class="upl-btn upl-btn-primary send-btn" disabled>${sendButtonText}</button>
                <div class="upl-send-hint">Cliquez pour passer à la suite</div>
              </div>
              <div class="upl-count"></div>
              <div class="upl-file-list"></div>
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
    console.log('[UploadExt] ✅ DOM injecté dans element');
    console.groupEnd();

    // ── Refs ─────────────────────────────────────────────────────────────
    const initialView  = root.querySelector('#two-col-view').parentElement.querySelector('.upl-initial-view');
    const twoColView   = root.querySelector('#two-col-view');
    const zoneMain     = root.querySelector('#drop-zone-main');
    const zoneCompact  = root.querySelector('#drop-zone-compact');
    const inputMain    = zoneMain.querySelector('input[type="file"]');
    const inputCompact = zoneCompact.querySelector('input[type="file"]');
    const fileListEl   = root.querySelector('.upl-file-list');
    const countEl      = root.querySelector('.upl-count');
    const sendBtn      = root.querySelector('.send-btn');
    const msgDiv       = root.querySelector('.upl-msg');
    const loader       = root.querySelector('.upl-loader');
    const loaderPct    = root.querySelector('.upl-loader-pct');
    const loaderFill   = root.querySelector('.upl-loader-fill');
    const overlay      = root.querySelector('.upl-overlay');
    const bodyDiv      = root.querySelector('.upl-body');

    console.log('[UploadExt] Refs — sendBtn:', !!sendBtn, '| inputMain:', !!inputMain, '| inputCompact:', !!inputCompact);

    let selectedFiles = [];

    // ── Utils ────────────────────────────────────────────────────────────
    const clamp       = (v, a, b) => Math.max(a, Math.min(b, v));
    const formatSize  = bytes =>
      bytes < 1024         ? bytes + ' o'
      : bytes < 1024*1024  ? (bytes/1024).toFixed(1) + ' Ko'
      :                      (bytes/(1024*1024)).toFixed(1) + ' Mo';

    const showMsg = (text, type = 'warn') => { msgDiv.textContent = text; msgDiv.className = `upl-msg show ${type}`; };
    const hideMsg = () => { msgDiv.className = 'upl-msg'; };

    // ── updateList ──────────────────────────────────────────────────────
    const updateList = () => {
      console.log(`[UploadExt] updateList() — ${selectedFiles.length} fichiers | required: ${requiredFiles}`);
      hideMsg();

      if (!selectedFiles.length) {
        initialView.style.display = '';
        twoColView.style.display = 'none';
        sendBtn.disabled = true;
        fileListEl.innerHTML = '';
        countEl.textContent = '';
        return;
      }

      initialView.style.display = 'none';
      twoColView.style.display = 'flex';

      const total  = selectedFiles.reduce((s, f) => s + f.size, 0);
      const enough = selectedFiles.length >= requiredFiles;

      countEl.className = `upl-count${enough ? ' ok' : ''}`;
      countEl.textContent = `${selectedFiles.length} fichier${selectedFiles.length > 1 ? 's' : ''} · ${formatSize(total)}`;

      fileListEl.innerHTML = '';
      selectedFiles.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'upl-item';
        item.innerHTML = `${icons.file}<div class="upl-item-info"><div class="upl-item-name">${f.name}</div><div class="upl-item-size">${formatSize(f.size)}</div></div><button class="upl-item-del" data-i="${i}">${icons.x}</button>`;
        fileListEl.appendChild(item);
      });

      root.querySelectorAll('.upl-item-del').forEach(btn => {
        btn.onclick = () => {
          console.log('[UploadExt] Suppression fichier index', btn.dataset.i);
          selectedFiles.splice(parseInt(btn.dataset.i), 1);
          updateList();
          scrollToSelf();
        };
      });

      sendBtn.disabled = !enough;
      console.log(`[UploadExt] sendBtn.disabled = ${sendBtn.disabled} | enough: ${enough}`);
      if (selectedFiles.length > 0 && !enough)
        showMsg(`${requiredFiles - selectedFiles.length} fichier(s) manquant(s)`, 'warn');

      scrollToSelf();
    };

    // ── ✅ FIX SPA : lecture ArrayBuffer immédiate ──────────────────────
    const readFileToMemory = (file) => {
      return new Promise((resolve) => {
        console.log(`[UploadExt] readFileToMemory START — "${file.name}" size=${file.size} type="${file.type}"`);
        const reader = new FileReader();
        reader.onload = (e) => {
          const buffer = e.target.result;
          console.log(`[UploadExt] readFileToMemory READ OK — buffer byteLength: ${buffer.byteLength}`);
          const blob = new Blob([buffer], { type: file.type });
          const freshFile = new File([blob], file.name, {
            type: file.type,
            lastModified: file.lastModified || Date.now()
          });
          console.log(`[UploadExt] ✅ Fichier en mémoire — "${freshFile.name}" size=${freshFile.size} bytes`);
          resolve(freshFile);
        };
        reader.onerror = (e) => {
          console.error(`[UploadExt] ❌ readFileToMemory ERROR pour "${file.name}":`, e);
          console.warn('[UploadExt] Fallback: on garde le File original');
          resolve(file);
        };
        reader.readAsArrayBuffer(file);
      });
    };

    const addFiles = async (files) => {
      console.group(`[UploadExt] addFiles() — ${files.length} fichier(s) reçus`);
      console.log('[UploadExt] isComponentActive:', isComponentActive, '| isUploading:', isUploading);
      const errs = [];
      const toRead = [];

      for (const f of files) {
        console.log(`[UploadExt] Validation — "${f.name}" size=${f.size} type="${f.type}"`);
        if (selectedFiles.length + toRead.length >= maxFiles) {
          console.warn('[UploadExt] Limite maxFiles atteinte');
          errs.push('Limite atteinte');
          break;
        }
        if (maxFileSizeMB && f.size > maxFileSizeMB * 1024 * 1024) {
          console.warn(`[UploadExt] "${f.name}" trop gros: ${(f.size/1024/1024).toFixed(1)}Mo > ${maxFileSizeMB}Mo`);
          errs.push(`${f.name} trop gros`);
          continue;
        }
        if (selectedFiles.some(x => x.name === f.name && x.size === f.size)) {
          console.log(`[UploadExt] "${f.name}" déjà dans la liste, skip`);
          continue;
        }
        toRead.push(f);
      }

      console.log(`[UploadExt] ${toRead.length} fichier(s) à lire en mémoire`);

      if (toRead.length) {
        const freshFiles = await Promise.all(toRead.map(readFileToMemory));
        console.log('[UploadExt] Fichiers en mémoire:', freshFiles.map(f => `${f.name}(${f.size})`));
        selectedFiles.push(...freshFiles);
        updateList();
      }

      if (errs.length) {
        console.warn('[UploadExt] Erreurs validation:', errs);
        showMsg(errs.join(' · '), 'err');
      }

      console.groupEnd();
    };

    // ── Events zones drop ───────────────────────────────────────────────
    const bindZone = (zone, input) => {
      zone.onclick = () => {
        console.log('[UploadExt] Zone cliquée → ouverture file picker');
        input.click();
      };
      zone.ondragover  = e => { e.preventDefault(); zone.classList.add('drag'); };
      zone.ondragleave = () => zone.classList.remove('drag');
      zone.ondrop = e => {
        e.preventDefault();
        zone.classList.remove('drag');
        const dropped = Array.from(e.dataTransfer?.files || []);
        console.log(`[UploadExt] Drop — ${dropped.length} fichier(s)`);
        addFiles(dropped);
      };
      input.onchange = () => {
        const picked = Array.from(input.files || []);
        console.log(`[UploadExt] input.onchange — ${picked.length} fichier(s) sélectionnés`);
        addFiles(picked);
        input.value = '';
      };
    };
    bindZone(zoneMain,    inputMain);
    bindZone(zoneCompact, inputCompact);

    console.log('[UploadExt] ✅ Zones drag-drop bindées');

    // ── Blocage chat au démarrage ───────────────────────────────────────
    blockChatInput();

    // ── Envoi ───────────────────────────────────────────────────────────
    sendBtn.onclick = async () => {
      console.group('[UploadExt] ══════════ SEND CLICK ══════════');
      console.log('[UploadExt] selectedFiles.length:', selectedFiles.length, '| requiredFiles:', requiredFiles);
      console.log('[UploadExt] isComponentActive:', isComponentActive, '| isUploading:', isUploading);

      if (selectedFiles.length < requiredFiles || !isComponentActive) {
        console.warn('[UploadExt] ⚠️ Condition non remplie — abort send');
        console.groupEnd();
        return;
      }

      console.log('[UploadExt] ✅ Lancement de l\'upload');
      isUploading = true;
      if (cleanupObserver) { cleanupObserver(); cleanupObserver = null; }

      // Vérification fichiers corrompus
      const corruptFiles = selectedFiles.filter(f => f.size === 0);
      if (corruptFiles.length > 0) {
        console.error('[UploadExt] ❌ Fichiers corrompus (0 bytes):', corruptFiles.map(f => f.name));
        isUploading = false;
        showMsg('Fichier invalide. Retirez-le et re-sélectionnez-le depuis votre dossier.', 'err');
        window?.voiceflow?.chat?.interact?.({
          type: 'complete',
          payload: { webhookSuccess: false, error: 'corrupt_files', buttonPath: 'error' }
        });
        console.groupEnd();
        return;
      }

      console.log('[UploadExt] Fichiers à envoyer:', selectedFiles.map(f => `${f.name}(${f.size} bytes)`));

      root.style.pointerEvents = 'none';
      overlay.classList.add('show');
      sendBtn.disabled = true;

      const startTime = Date.now();
      const ui = showLoaderUI();

      console.log('[UploadExt] loaderMode:', loaderMode);
      if (loaderMode === 'timed') ui.timed(buildPlan());
      else ui.auto(defaultAutoSteps);

      try {
        console.log('[UploadExt] POST vers:', webhookUrl);
        const resp = await post({
          url: webhookUrl, method: webhookMethod, headers: webhookHeaders,
          timeoutMs: webhookTimeoutMs, retries: webhookRetries,
          files: selectedFiles, fileFieldName, extra, vfContext, variables
        });

        console.log('[UploadExt] ✅ Response reçue:', resp);
        let data = resp?.data ?? null;
        console.log('[UploadExt] data:', data);

        if (awaitResponse && pollingEnabled) {
          console.log('[UploadExt] Polling activé — jobId:', data?.jobId, '| statusUrl:', data?.statusUrl);
          const jobId     = data?.jobId;
          const statusUrl = data?.statusUrl || polling?.statusUrl;
          if (statusUrl || jobId) {
            console.log('[UploadExt] Démarrage polling sur:', statusUrl || `jobs/${jobId}`);
            data = await poll({
              statusUrl: statusUrl || `${webhookUrl.split('/webhook')[0]}/rest/jobs/${jobId}`,
              headers: pollingHeaders, intervalMs: pollingIntervalMs, maxAttempts: pollingMaxAttempts,
              onTick: st => {
                console.log('[UploadExt] Poll tick — status:', st);
                if (loaderMode === 'external' && Number.isFinite(st?.percent)) ui.set(st.percent);
              }
            });
            console.log('[UploadExt] ✅ Polling terminé — data:', data);
          } else {
            console.warn('[UploadExt] Polling activé mais pas de statusUrl/jobId dans la response');
          }
        }

        const elapsed = Date.now() - startTime;
        console.log('[UploadExt] Elapsed:', elapsed, 'ms | minLoadingTimeMs:', minLoadingTimeMs);
        if (minLoadingTimeMs - elapsed > 0) {
          const waitMs = Math.min(minLoadingTimeMs - elapsed, 1500);
          console.log('[UploadExt] Attente minLoadingTime:', waitMs, 'ms');
          ui.to(98, waitMs);
          await new Promise(r => setTimeout(r, minLoadingTimeMs - elapsed));
        }

        ui.done(data);
        console.groupEnd();

      } catch (err) {
        console.error('[UploadExt] ❌ ERREUR upload:', err);
        console.error('[UploadExt] message:', err?.message);
        console.error('[UploadExt] stack:', err?.stack);
        isUploading = false; isComponentActive = false;
        loader.classList.remove('show');
        bodyDiv.style.display = '';
        root.style.pointerEvents = '';
        overlay.classList.remove('show');
        sendBtn.disabled = false;

        const errMsg = String(err?.message || err);
        const isFetchError = errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('AbortError');
        showMsg(isFetchError ? 'Veuillez réactualiser la page' : errMsg, 'err');

        console.log('[UploadExt] interact error → buttonPath: error');
        window?.voiceflow?.chat?.interact?.({
          type: 'complete',
          payload: { webhookSuccess: false, error: errMsg, buttonPath: 'error' }
        });
        console.groupEnd();
      }
    };

    // ── Loader UI ───────────────────────────────────────────────────────
    function showLoaderUI() {
      console.log('[UploadExt] showLoaderUI()');
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
          console.log('[UploadExt] Loader timed — plan:', plan);
          let idx = 0;
          const next = () => {
            if (idx >= plan.length || locked) return;
            const ph = plan[idx++], t0 = Date.now();
            clear();
            timedTimer = setInterval(() => {
              if (locked) { clear(); return; }
              const r  = clamp((Date.now() - t0) / ph.durationMs, 0, 1);
              const nv = ph.progressStart + (ph.progressEnd - ph.progressStart) * r;
              if (nv > cur) { cur = nv; paint(); }
              if (Date.now() >= t0 + ph.durationMs) { clear(); cur = Math.max(cur, ph.progressEnd); paint(); next(); }
            }, 80);
          };
          next();
        },
        set(p_)  { if (!locked && p_ > cur) { cur = clamp(p_, 0, 100); paint(); } },
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
          console.log('[UploadExt] ✅ done() — data:', data);
          locked = true; clear();
          this.to(100, 400, () => {
            loader.classList.add('complete');
            setTimeout(() => {
              console.log('[UploadExt] interact success → buttonPath: success');
              isUploading = false; isComponentActive = false;
              root.style.display = 'none';
              unblockChatInput();
              window?.voiceflow?.chat?.interact?.({
                type: 'complete',
                payload: {
                  webhookSuccess: true,
                  webhookResponse: data,
                  files: selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
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
      const total  = haveSeconds ? timedPhases.reduce((s, ph) => s + Number(ph.seconds), 0) : totalSeconds;
      const alloc  = timedPhases.map(ph => ({ seconds: haveSeconds ? Number(ph.seconds) : total / timedPhases.length }));
      const startP = 5, endP = 98;
      const totalMs = alloc.reduce((s, a) => s + a.seconds * 1000, 0);
      let acc = 0, last = startP;
      return alloc.map((a, i) => {
        const pStart = i === 0 ? startP : last;
        const pEnd   = i === alloc.length - 1 ? endP : startP + (endP - startP) * ((acc + a.seconds * 1000) / totalMs);
        acc += a.seconds * 1000;
        last = pEnd;
        return { durationMs: Math.max(500, a.seconds * 1000), progressStart: pStart, progressEnd: pEnd };
      });
    }

    // ── POST résilient ──────────────────────────────────────────────────
    async function post({ url, method, headers, timeoutMs, retries, files, fileFieldName, extra, vfContext, variables }) {
      const buildFormData = () => {
        const fd = new FormData();
        files.forEach(f => {
          console.log(`[UploadExt] FormData.append — "${f.name}" size=${f.size}`);
          fd.append(fileFieldName, f, f.name);
        });
        Object.entries(extra).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
        Object.entries(variables).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
        if (vfContext.conversation_id) fd.append('conversation_id', vfContext.conversation_id);
        if (vfContext.user_id) fd.append('user_id', vfContext.user_id);
        return fd;
      };

      const cleanHeaders = () => {
        const h = { ...headers };
        delete h['Content-Type'];
        return h;
      };

      let err;
      for (let i = 0; i <= retries; i++) {
        try {
          console.log(`[UploadExt] fetch attempt ${i+1}/${retries+1} — timeout: ${timeoutMs}ms`);
          const ctrl = new AbortController();
          const to   = setTimeout(() => { console.warn('[UploadExt] ⏱️ AbortController timeout déclenché'); ctrl.abort(); }, timeoutMs);
          const r = await fetch(url, {
            method, headers: cleanHeaders(), body: buildFormData(), signal: ctrl.signal
          });
          clearTimeout(to);
          console.log(`[UploadExt] fetch response — status: ${r.status} ok: ${r.ok}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const json = await r.json().catch((e) => { console.warn('[UploadExt] JSON parse failed:', e); return null; });
          console.log('[UploadExt] fetch JSON:', json);
          return { ok: true, data: json };
        } catch (e) {
          err = e;
          console.warn(`[UploadExt] Attempt ${i+1} failed:`, e.message);

          if (e.message?.includes('Failed to fetch') || e.name === 'AbortError') {
            console.warn('[UploadExt] Fallback: retry sans AbortController...');
            await new Promise(r => setTimeout(r, 500));
            try {
              const r2 = await fetch(url, { method, headers: cleanHeaders(), body: buildFormData() });
              console.log(`[UploadExt] Fallback response — status: ${r2.status}`);
              if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
              return { ok: true, data: await r2.json().catch(() => null) };
            } catch (e2) {
              err = e2;
              console.warn('[UploadExt] Fallback also failed:', e2.message);
            }
          }

          if (i < retries) {
            console.log('[UploadExt] Retry dans 900ms...');
            await new Promise(r => setTimeout(r, 900));
          }
        }
      }
      throw err || new Error('Failed');
    }

    async function poll({ statusUrl, headers, intervalMs, maxAttempts, onTick }) {
      console.log(`[UploadExt] poll() — url: ${statusUrl} | interval: ${intervalMs}ms | max: ${maxAttempts}`);
      for (let i = 1; i <= maxAttempts; i++) {
        const r = await fetch(statusUrl, { headers });
        if (!r.ok) throw new Error(`Poll ${r.status}`);
        const j = await r.json().catch(() => ({}));
        console.log(`[UploadExt] poll #${i} — status: ${j?.status} percent: ${j?.percent}`);
        if (j?.status === 'error') throw new Error(j?.error || 'Error');
        onTick?.({ percent: j?.percent, phase: j?.phase });
        if (j?.status === 'done') {
          console.log('[UploadExt] ✅ poll done');
          return j?.data ?? j;
        }
        await new Promise(r => setTimeout(r, intervalMs));
      }
      throw new Error('Timeout');
    }

    // Auto-scroll initial
    scrollToSelf();

    // ── Enregistrer le cleanup global (singleton) ───────────────────────
    const cleanup = () => {
      console.log('[UploadExt] cleanup() appelé');
      if (timedTimer) clearInterval(timedTimer);
      if (cleanupObserver) cleanupObserver();
      isComponentActive = false;
      unblockChatInput();
    };
    window.__uploaderInstance = cleanup;
    console.log('[UploadExt] ✅ Instance enregistrée sur window.__uploaderInstance');

    return cleanup;
  }
};

try { window.Uploader = Uploader; } catch {}
