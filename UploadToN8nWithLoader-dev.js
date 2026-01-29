// UploadToN8nWithLoader-dev.js – v8.0
// © Corentin – Version avec chat actif + détection message user
// v8.0 : Chat input toujours actif, détection écriture user → path "write"
//        Variables webhook dans objet "variables" pour flexibilité
//        Suppression du path "back"
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
    
    const findChatContainer = () => {
      let container = document.querySelector('#voiceflow-chat-container');
      if (container?.shadowRoot) return container;
      container = document.querySelector('#voiceflow-chat');
      if (container?.shadowRoot) return container;
      const allWithShadow = document.querySelectorAll('*');
      for (const el of allWithShadow) {
        if (el.shadowRoot?.querySelector('[class*="vfrc"]')) return el;
      }
      return null;
    };
    
    // ---------- STATE ----------
    let isComponentActive = true;
    let cleanupObserver = null;
    let cleanupInputListener = null;
    let timedTimer = null;
    
    // ---------- LISTENER MESSAGE USER ----------
    const setupUserInputListener = () => {
      const container = findChatContainer();
      if (!container?.shadowRoot) return null;
      
      const shadowRoot = container.shadowRoot;
      
      // Trouver le formulaire ou le bouton d'envoi
      const form = shadowRoot.querySelector('form');
      const sendBtn = 
        shadowRoot.querySelector('#vfrc-send-message') ||
        shadowRoot.querySelector('button.vfrc-chat-input__send') ||
        shadowRoot.querySelector('button[type="submit"]');
      const textarea = 
        shadowRoot.querySelector('textarea.vfrc-chat-input') ||
        shadowRoot.querySelector('textarea[id^="vf-chat-input"]') ||
        shadowRoot.querySelector('textarea');
      
      if (!textarea) return null;
      
      const handleUserMessage = (e) => {
        if (!isComponentActive) return;
        
        const message = textarea.value?.trim();
        if (!message) return;
        
        // Empêcher l'envoi normal
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[UploadToN8nWithLoaderDev] User typed message:', message);
        
        // Fermer l'extension et envoyer le message
        closeAndSendUserMessage(message);
      };
      
      // Écouter submit sur le form
      if (form) {
        form.addEventListener('submit', handleUserMessage, true);
      }
      
      // Écouter click sur le bouton send
      if (sendBtn) {
        sendBtn.addEventListener('click', handleUserMessage, true);
      }
      
      // Écouter Enter dans le textarea
      const handleKeydown = (e) => {
        if (!isComponentActive) return;
        if (e.key === 'Enter' && !e.shiftKey) {
          const message = textarea.value?.trim();
          if (message) {
            e.preventDefault();
            e.stopPropagation();
            closeAndSendUserMessage(message);
          }
        }
      };
      textarea.addEventListener('keydown', handleKeydown, true);
      
      return () => {
        if (form) form.removeEventListener('submit', handleUserMessage, true);
        if (sendBtn) sendBtn.removeEventListener('click', handleUserMessage, true);
        textarea.removeEventListener('keydown', handleKeydown, true);
      };
    };
    
    const closeAndSendUserMessage = (message) => {
      isComponentActive = false;
      
      // Cleanup
      if (cleanupObserver) {
        cleanupObserver();
        cleanupObserver = null;
      }
      if (cleanupInputListener) {
        cleanupInputListener();
        cleanupInputListener = null;
      }
      if (timedTimer) {
        clearInterval(timedTimer);
        timedTimer = null;
      }
      
      // Masquer l'extension
      root.style.display = 'none';
      
      // Vider le textarea
      const container = findChatContainer();
      if (container?.shadowRoot) {
        const textarea = container.shadowRoot.querySelector('textarea');
        if (textarea) textarea.value = '';
      }
      
      // Envoyer l'interact avec le message user
      window?.voiceflow?.chat?.interact?.({
        type: 'complete',
        payload: {
          webhookSuccess: false,
          buttonPath: 'write',
          userMessage: message
        }
      });
    };
    
    // Setup du listener dès le départ
    cleanupInputListener = setupUserInputListener();
    
    // ---------- AUTO-UNLOCK : Détecte si une autre action est déclenchée ----------
    const setupAutoUnlock = () => {
      const container = findChatContainer();
      if (!container?.shadowRoot) return null;
      
      const shadowRoot = container.shadowRoot;
      const selectors = [
        '.vfrc-chat--dialog',
        '[class*="Dialog"]',
        '[class*="dialog"]',
        '.vfrc-chat',
        '[class*="Messages"]',
        '[class*="messages"]'
      ];
      
      let dialogEl = null;
      for (const sel of selectors) {
        dialogEl = shadowRoot.querySelector(sel);
        if (dialogEl) break;
      }
      
      if (!dialogEl) return null;
      
      const observer = new MutationObserver((mutations) => {
        if (!isComponentActive) return;
        
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.dataset?.uploadExtension === 'true') continue;
            
            const isSystemResponse = 
              node.classList?.contains('vfrc-system-response') ||
              node.classList?.contains('vfrc-assistant') ||
              node.querySelector?.('[class*="assistant"]') ||
              node.querySelector?.('[class*="system"]') ||
              node.querySelector?.('[class*="Agent"]') ||
              node.querySelector?.('[class*="extension"]') ||
              node.querySelector?.('.upl');
            
            if (isSystemResponse) {
              console.log('[UploadToN8nWithLoaderDev] Another action detected, auto-unlocking...');
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
      if (!isComponentActive) return;
      isComponentActive = false;
      
      if (cleanupObserver) {
        cleanupObserver();
        cleanupObserver = null;
      }
      if (cleanupInputListener) {
        cleanupInputListener();
        cleanupInputListener = null;
      }
      
      root.style.display = 'none';
      
      if (timedTimer) {
        clearInterval(timedTimer);
        timedTimer = null;
      }
    };
    
    cleanupObserver = setupAutoUnlock();
    
    // ---------- CONFIG ----------
    const p = trace?.payload || {};
    const title         = p.title || '';
    const subtitle      = p.subtitle || '';
    const description   = p.description || 'Déposez vos fichiers ici';
    const accept        = p.accept || '.pdf,.docx';
    const maxFileSizeMB = p.maxFileSizeMB || 25;
    const maxFiles      = p.maxFiles || 10;
    
    // ═══════════════════════════════════════════════════════════════
    // 📦 VARIABLES À ENVOYER AU WEBHOOK (objet flexible)
    // ═══════════════════════════════════════════════════════════════
    const variables = p.variables || {};
    
    // ═══════════════════════════════════════════════════════════════
    // 🎨 PALETTE ULTRA MINIMALE - MONOCHROME
    // ═══════════════════════════════════════════════════════════════
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
    let isOBMS = false;
    
    if (p.minFiles !== undefined && p.minFiles !== null) {
      requiredFiles = Math.max(1, Math.min(Number(p.minFiles) || 1, maxFiles));
      isSimpleMode = true;
    } else {
      const obmsValue = (extra.obms || 'non').toLowerCase().trim();
      isOBMS = obmsValue === 'oui';
      requiredFiles = isOBMS ? 2 : 3;
    }
    
    const awaitResponse      = p.awaitResponse !== false;
    const polling            = p.polling || {};
    const pollingEnabled     = !!polling.enabled;
    const pollingIntervalMs  = Number.isFinite(polling.intervalMs) ? polling.intervalMs : 2000;
    const pollingMaxAttempts = Number.isFinite(polling.maxAttempts) ? polling.maxAttempts : 120;
    const pollingHeaders     = polling.headers || {};
    
    const pathSuccess = p.pathSuccess || 'Default';
    const pathError   = p.pathError || 'Fail';
    
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
    
    // ═══════════════════════════════════════════════════════════════
    // 📝 GESTION HEADER & HINT
    // ═══════════════════════════════════════════════════════════════
    const hasTitle = title && title.trim() !== '';
    const hasSubtitle = subtitle && subtitle.trim() !== '';
    const showHeader = hasTitle || hasSubtitle;
    
    let hintText = '';
    if (p.hint === false || p.hint === '') {
      hintText = '';
    } else if (typeof p.hint === 'string' && p.hint.trim() !== '') {
      hintText = p.hint;
    } else {
      let requiredDocsInfo;
      if (isSimpleMode) {
        requiredDocsInfo = requiredFiles === 1 
          ? `1 à ${maxFiles} fichiers` 
          : `${requiredFiles} à ${maxFiles} fichiers`;
      } else {
        requiredDocsInfo = `${requiredFiles} documents requis`;
      }
      hintText = requiredDocsInfo;
    }
    
    const showHint = hintText && hintText.trim() !== '';
    
    let docsListOBMS = '• Lettre de mission / Descriptif du poste\n• CV du candidat';
    let docsListFull = '• Lettre de mission / Descriptif du poste\n• CV du candidat\n• Profil AssessFirst du candidat';
    
    // ---------- STYLES ULTRA MINIMAUX ----------
    const styles = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      
      .upl {
        width: 100%;
        font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
        font-size: 14px;
        color: ${colors.text};
        animation: fadeIn 0.2s ease;
      }
      
      .upl * {
        box-sizing: border-box;
      }
      
      .upl-card {
        background: ${colors.white};
        border: 1px solid ${colors.border};
        border-radius: 8px;
        overflow: hidden;
      }
      
      .upl-header {
        padding: 20px 20px 0;
      }
      
      .upl-title {
        font-size: 15px;
        font-weight: 600;
        color: ${colors.text};
        margin: 0 0 2px;
        letter-spacing: -0.2px;
      }
      
      .upl-subtitle {
        font-size: 13px;
        color: ${colors.textLight};
        font-weight: 400;
      }
      
      .upl-body {
        padding: 20px;
      }
      
      .upl-body.no-header {
        padding-top: 20px;
      }
      
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
      
      .upl-zone:hover {
        background: #F3F4F6;
      }
      
      .upl-zone:hover::before {
        border-color: ${colors.textLight};
      }
      
      .upl-zone.drag {
        background: #F3F4F6;
      }
      
      .upl-zone.drag::before {
        border-color: ${colors.text};
      }
      
      .upl-zone-icon {
        width: 32px;
        height: 32px;
        margin: 0 auto 10px;
        color: ${colors.textLight};
        transition: color 0.15s ease;
      }
      
      .upl-zone:hover .upl-zone-icon {
        color: ${colors.text};
      }
      
      .upl-zone-text {
        font-size: 13px;
        color: ${colors.textLight};
        font-weight: 400;
        line-height: 1.5;
      }
      
      .upl-zone-hint {
        font-size: 11px;
        color: ${colors.textLight};
        margin-top: 6px;
        opacity: 0.7;
      }
      
      .upl-list {
        margin-top: 16px;
        display: none;
      }
      
      .upl-list.show {
        display: block;
      }
      
      .upl-item {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        background: ${colors.bg};
        border-radius: 6px;
        margin-bottom: 6px;
        animation: slideIn 0.15s ease;
      }
      
      .upl-item:last-child {
        margin-bottom: 0;
      }
      
      .upl-item-icon {
        width: 16px;
        height: 16px;
        color: ${colors.textLight};
        margin-right: 10px;
        flex-shrink: 0;
      }
      
      .upl-item-info {
        flex: 1;
        min-width: 0;
      }
      
      .upl-item-name {
        font-size: 13px;
        font-weight: 500;
        color: ${colors.text};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .upl-item-size {
        font-size: 11px;
        color: ${colors.textLight};
        margin-top: 1px;
      }
      
      .upl-item-del {
        width: 24px;
        height: 24px;
        border: none;
        background: none;
        color: ${colors.textLight};
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        margin-left: 8px;
        transition: all 0.1s ease;
      }
      
      .upl-item-del:hover {
        background: rgba(239, 68, 68, 0.1);
        color: ${colors.error};
      }
      
      .upl-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid ${colors.border};
      }
      
      .upl-count {
        font-size: 12px;
        color: ${colors.textLight};
      }
      
      .upl-count.ok {
        color: ${colors.success};
      }
      
      .upl-actions {
        display: flex;
        gap: 8px;
      }
      
      .upl-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.1s ease;
        border: 1px solid transparent;
      }
      
      .upl-btn-primary {
        background: ${colors.text};
        color: ${colors.white};
        border-color: ${colors.text};
      }
      
      .upl-btn-primary:hover:not(:disabled) {
        background: #374151;
        border-color: #374151;
      }
      
      .upl-btn-primary:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      
      .upl-btn-ghost {
        background: transparent;
        color: ${colors.textLight};
        border-color: ${colors.border};
      }
      
      .upl-btn-ghost:hover {
        background: ${colors.bg};
        color: ${colors.text};
      }
      
      .upl-msg {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 6px;
        font-size: 12px;
        display: none;
        animation: fadeIn 0.15s ease;
      }
      
      .upl-msg.show {
        display: block;
      }
      
      .upl-msg.err {
        background: rgba(239, 68, 68, 0.08);
        color: ${colors.error};
      }
      
      .upl-msg.ok {
        background: rgba(16, 185, 129, 0.08);
        color: ${colors.success};
      }
      
      .upl-msg.warn {
        background: rgba(245, 158, 11, 0.08);
        color: ${colors.warning};
      }
      
      .upl-msg.load {
        background: ${colors.bg};
        color: ${colors.textLight};
      }
      
      /* ═══════════════════════════════════════════════════════════════
         🎯 LOADER MINIMALISTE - Barre + Pourcentage uniquement
         ═══════════════════════════════════════════════════════════════ */
      .upl-loader {
        display: none;
        padding: 32px 24px;
        animation: fadeIn 0.25s ease;
      }
      
      .upl-loader.show {
        display: block;
      }
      
      .upl-loader.hide {
        animation: fadeOut 0.2s ease;
      }
      
      .upl-loader-container {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      
      .upl-loader-bar {
        flex: 1;
        height: 8px;
        background: ${colors.border};
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }
      
      .upl-loader-fill {
        height: 100%;
        width: 0%;
        background: ${colors.text};
        border-radius: 4px;
        transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      }
      
      /* Effet shimmer subtil sur la barre */
      .upl-loader-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.3) 50%,
          transparent 100%
        );
        background-size: 200% 100%;
        animation: shimmer 2s infinite;
      }
      
      .upl-loader-pct {
        font-size: 15px;
        font-weight: 600;
        color: ${colors.text};
        font-variant-numeric: tabular-nums;
        min-width: 48px;
        text-align: right;
      }
      
      /* État complété */
      .upl-loader.complete .upl-loader-fill {
        background: ${colors.success};
      }
      
      .upl-loader.complete .upl-loader-fill::after {
        animation: none;
      }
      
      .upl-loader.complete .upl-loader-pct {
        color: ${colors.success};
      }
      
      /* VALIDATION */
      .upl-valid {
        margin-top: 16px;
        padding: 16px;
        background: rgba(245, 158, 11, 0.06);
        border: 1px solid rgba(245, 158, 11, 0.15);
        border-radius: 6px;
        animation: slideIn 0.15s ease;
      }
      
      .upl-valid-title {
        font-size: 13px;
        font-weight: 500;
        color: ${colors.warning};
        margin-bottom: 8px;
      }
      
      .upl-valid-text {
        font-size: 12px;
        color: ${colors.text};
        line-height: 1.5;
        white-space: pre-line;
        margin-bottom: 12px;
      }
      
      .upl-valid-actions {
        display: flex;
        gap: 8px;
      }
      
      /* OVERLAY */
      .upl-overlay {
        display: none;
        position: absolute;
        inset: 0;
        background: transparent;
        z-index: 10;
        border-radius: 8px;
        pointer-events: all;
      }
      
      .upl-overlay.show {
        display: block;
      }
    `;
    
    // ---------- ICÔNES SVG MINIMALISTES ----------
    const icons = {
      upload: `<svg class="upl-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 15V3m0 0l-4 4m4-4l4 4"/>
        <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
      </svg>`,
      file: `<svg class="upl-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <path d="M14 2v6h6"/>
      </svg>`,
      x: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>`
    };
    
    // ---------- UI ----------
    const root = document.createElement('div');
    root.className = 'upl';
    root.style.position = 'relative';
    
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
        
        <!-- LOADER MINIMALISTE -->
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
    
    // ---------- DOM refs ----------
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
    
    // ---------- STATE ----------
    let selectedFiles = [];
    
    // ---------- Helpers ----------
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
    
    function clearValidation() {
      const v = root.querySelector('.upl-valid');
      if (v) v.remove();
    }
    
    function updateList() {
      filesList.innerHTML = '';
      clearValidation();
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
      
      if (selectedFiles.length > 0 && !enough && !isSimpleMode) {
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
    
    function validate() {
      if (isSimpleMode) return selectedFiles.length >= requiredFiles;
      
      if (selectedFiles.length < requiredFiles) {
        clearValidation();
        const docs = isOBMS ? docsListOBMS : docsListFull;
        
        const div = document.createElement('div');
        div.className = 'upl-valid';
        div.innerHTML = `
          <div class="upl-valid-title">Documents manquants</div>
          <div class="upl-valid-text">${selectedFiles.length}/${requiredFiles} fichiers sélectionnés.
Requis :
${docs}</div>
          <div class="upl-valid-actions">
            <button class="upl-btn upl-btn-primary" data-a="add">Ajouter</button>
          </div>
        `;
        bodyDiv.appendChild(div);
        
        div.querySelector('[data-a="add"]').onclick = () => {
          clearValidation();
          fileInput.click();
        };
        
        return false;
      }
      return true;
    }
    
    // ---------- Events ----------
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
      if (!selectedFiles.length || !validate()) return;
      
      root.style.pointerEvents = 'none';
      overlay.classList.add('show');
      clearValidation();
      sendBtn.disabled = true;
      
      // Désactiver le listener de message user pendant l'upload
      if (cleanupInputListener) {
        cleanupInputListener();
        cleanupInputListener = null;
      }
      
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
        isComponentActive = false;
        if (cleanupObserver) {
          cleanupObserver();
          cleanupObserver = null;
        }
        loader.classList.remove('show');
        bodyDiv.style.display = '';
        showMsg(String(err?.message || err), 'err');
        sendBtn.disabled = false;
        root.style.pointerEvents = '';
        overlay.classList.remove('show');
        window?.voiceflow?.chat?.interact?.({
          type: 'complete',
          payload: { webhookSuccess: false, error: String(err?.message || err), buttonPath: 'error' }
        });
      }
    };
    
    // ---------- Loader Minimaliste ----------
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
              // FIX: Ne jamais faire descendre la barre
              if (newVal > cur) {
                cur = newVal;
                paint();
              }
              if (now >= t1) { 
                clear(); 
                cur = Math.max(cur, p.progressEnd); 
                paint(); 
                next(); 
              }
            }, 80);
          };
          next();
        },
        
        // FIX: set() ne peut que faire monter la barre, jamais descendre
        set(p) { 
          if (!locked && p > cur) { 
            cur = clamp(p, 0, 100); 
            paint(); 
          } 
        },
        
        // FIX: to() ne peut que faire monter la barre
        to(target, ms = 1200, cb) {
          const targetClamped = clamp(target, 0, 100);
          // Si la cible est inférieure à cur, on skip l'animation
          if (targetClamped <= cur) {
            if (cb) cb();
            return;
          }
          const s = cur;
          const e = targetClamped;
          const t0 = performance.now();
          const step = t => {
            if (locked) { if (cb) cb(); return; }
            const k = clamp((t - t0) / ms, 0, 1);
            const newVal = s + (e - s) * k;
            if (newVal > cur) {
              cur = newVal;
              paint();
            }
            if (k < 1) requestAnimationFrame(step);
            else if (cb) cb();
          };
          requestAnimationFrame(step);
        },
        
        done(data) {
          locked = true;
          isComponentActive = false;
          if (cleanupObserver) {
            cleanupObserver();
            cleanupObserver = null;
          }
          clear();
          
          // Toujours terminer à 100%
          this.to(100, 400, () => {
            loader.classList.add('complete');
            setTimeout(() => {
              loader.classList.add('hide');
              setTimeout(() => {
                loader.classList.remove('show', 'hide', 'complete');
                root.style.display = 'none';
                overlay.classList.remove('show');
                
                // Envoyer directement le complete sans écran de confirmation
                window?.voiceflow?.chat?.interact?.({
                  type: 'complete',
                  payload: {
                    webhookSuccess: true,
                    webhookResponse: data,
                    files: selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
                    buttonPath: 'success'
                  }
                });
              }, 200);
            }, autoCloseDelayMs);
          });
        }
      };
    }
    
    function buildPlan() {
      const haveSeconds = timedPhases.every(ph => Number(ph.seconds) > 0);
      let total = haveSeconds ? timedPhases.reduce((s, ph) => s + Number(ph.seconds), 0) : totalSeconds;
      const weightsSum = timedPhases.reduce((s, ph) => s + (Number(ph.weight) || 0), 0) || timedPhases.length;
      const alloc = timedPhases.map((ph, i) => {
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
    
    // ---------- Network ----------
    async function post({ url, method, headers, timeoutMs, retries, files, fileFieldName, extra, vfContext, variables }) {
      let err;
      for (let i = 0; i <= retries; i++) {
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), timeoutMs);
          const fd = new FormData();
          files.forEach(f => fd.append(fileFieldName, f, f.name));
          
          // Ajouter extra
          Object.entries(extra).forEach(([k, v]) => fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
          
          // Ajouter variables (objet flexible)
          Object.entries(variables).forEach(([k, v]) => {
            fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
          });
          
          // Ajouter contexte VF
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
    
    return () => { 
      if (timedTimer) clearInterval(timedTimer); 
      if (cleanupObserver) cleanupObserver();
      if (cleanupInputListener) cleanupInputListener();
      isComponentActive = false;
    };
  }
};
try { window.UploadToN8nWithLoaderDev = UploadToN8nWithLoaderDev; } catch {}
