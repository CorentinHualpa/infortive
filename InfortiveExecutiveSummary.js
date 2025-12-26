/**
 *  ╔═══════════════════════════════════════════════════════════╗
 *  ║  InfortiveExecutiveSummary – Résumé Exécutif Infortive    ║
 *  ║                                                           ║
 *  ║  • Charte graphique Infortive                            ║
 *  ║  • Téléchargement : HTML / PDF / DOCX                    ║
 *  ║  • Copie : Brut (HTML) / Formaté (texte propre)         ║
 *  ║  • Résumé exécutif max 180 mots (1 page)                ║
 *  ║  • Footer avec contacts Infortive                        ║
 *  ║  • v2 - Fixes Word et HTML                               ║
 *  ╚═══════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════
// LOG DE CHARGEMENT
// ═══════════════════════════════════════════════════════════
console.log('🟢 [InfortiveExecutiveSummary] Extension CHARGÉE - v2.3 - ' + new Date().toISOString());

export const InfortiveExecutiveSummary = {
  name: 'InfortiveExecutiveSummary',
  type: 'response',
  
  match: ({ trace }) => {
    const isMatch = trace.type === 'infortive_summary' || trace.payload?.type === 'infortive_summary';
    console.log('🔍 [InfortiveExecutiveSummary] match() appelé:', {
      traceType: trace.type,
      payloadType: trace.payload?.type,
      isMatch: isMatch
    });
    return isMatch;
  },

  render: ({ trace, element }) => {
    console.log('🎨 [InfortiveExecutiveSummary] render() appelé');
    console.log('📦 [InfortiveExecutiveSummary] Payload reçu:', trace.payload);
    
    try {
      // ═══════════════════════════════════════════════════════════
      // CONFIGURATION INFORTIVE
      // ═══════════════════════════════════════════════════════════
      const INFORTIVE = {
        colors: {
          primary: '#0B3954',
          accent: '#E57C23',
          text: '#333333',
          textLight: '#666666',
          white: '#FFFFFF',
          background: '#F8F9FA'
        },
        logos: {
          main: 'https://i.imgur.com/VnAvdRW.png',
          footer: 'https://i.imgur.com/p3SecSW.png',
          white: 'https://i.imgur.com/VnAvdRW.png'
        },
        contacts: [
          { name: 'Hajar ZINE EDDINE', role: 'Directrice Générale', phone: '+33 6 72 71 98 90', email: 'hzineeddine@infortive.com' },
          { name: 'Guillaume REBMANN', role: 'Directeur de Comptes', phone: '+33 6 80 83 01 77', email: 'grebmann@infortive.com' },
          { name: 'Ziryab KHARBOUCHE', role: 'Directeur de Comptes', phone: '+33 6 80 53 20 46', email: 'zkharbouche@infortive.com' }
        ],
        tagline: "l'expert IT du management de transition",
        font: 'Merriweather'
      };

      // Configuration par défaut
      const defaultConfig = {
        missionName: 'Mission',
        missionTitle: 'Résumé Exécutif',
        content: '',
        fileName: 'infortive_resume_executif',
        clientLogo: '',
        showClientLogo: false,
        isConfidential: true,
        downloadIconText: 'Télécharger',
        copyIconText: 'Copier',
        copiedIcon: '✓',
        formats: ['html', 'pdf', 'docx'],
        showCopyButton: true,
        showDownloadButton: true
      };

      // Parser le payload
      let config = { ...defaultConfig };
      
      if (typeof trace.payload === 'string') {
        try {
          let cleanPayload = trace.payload.trim();
          
          if (cleanPayload.startsWith('{')) {
            try {
              const parsed = JSON.parse(cleanPayload);
              config = { ...defaultConfig, ...parsed };
            } catch (e) {
              const missionNameMatch = cleanPayload.match(/"missionName"\s*:\s*"([^"]+)"/);
              const missionTitleMatch = cleanPayload.match(/"missionTitle"\s*:\s*"([^"]+)"/);
              const fileNameMatch = cleanPayload.match(/"fileName"\s*:\s*"([^"]+)"/);
              const contentMatch = cleanPayload.match(/"content"\s*:\s*"([\s\S]*?)"\s*,\s*"[^"]+"\s*:/);
              
              if (missionNameMatch) config.missionName = missionNameMatch[1];
              if (missionTitleMatch) config.missionTitle = missionTitleMatch[1];
              if (fileNameMatch) config.fileName = fileNameMatch[1];
              if (contentMatch) {
                config.content = contentMatch[1]
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .replace(/\\/g, '');
              }
            }
          } else {
            const parts = cleanPayload.split('###OPTIONS###');
            config.content = parts[0].trim();
            
            if (parts[1]) {
              const lines = parts[1].trim().split('\n');
              lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && trimmedLine.includes('=')) {
                  const [key, ...valueParts] = trimmedLine.split('=');
                  const value = valueParts.join('=').trim();
                  const cleanKey = key.trim();
                  
                  if (value === 'true') config[cleanKey] = true;
                  else if (value === 'false') config[cleanKey] = false;
                  else if (cleanKey === 'formats' && value.includes(',')) {
                    config[cleanKey] = value.split(',').map(f => f.trim());
                  } else {
                    config[cleanKey] = value;
                  }
                }
              });
            }
          }
        } catch (error) {
          console.error('Erreur de parsing:', error);
          config.content = trace.payload;
        }
      } else if (typeof trace.payload === 'object' && trace.payload !== null) {
        config = { ...defaultConfig, ...trace.payload };
      }

      console.log('⚙️ [InfortiveExecutiveSummary] Config parsée:', {
        missionName: config.missionName,
        missionTitle: config.missionTitle,
        contentLength: config.content?.length || 0,
        formats: config.formats
      });

      if (!config.content || config.content.trim() === '') {
        console.warn('⚠️ [InfortiveExecutiveSummary] Aucun contenu fourni');
        return;
      }
      
      console.log('✅ [InfortiveExecutiveSummary] Contenu valide, création des boutons...');

      const container = document.createElement('div');
      container.className = 'infortive-actions-container';
      
      // ═══════════════════════════════════════════════════════════
      // STYLES CSS - NOUVEAU DESIGN AVEC CARTES DE TÉLÉCHARGEMENT
      // ═══════════════════════════════════════════════════════════
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        .infortive-actions-container {
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
          margin: 12px 0 !important;
          width: 100% !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }

        .infortive-section-title {
          font-size: 13px !important;
          font-weight: 600 !important;
          color: ${INFORTIVE.colors.primary} !important;
          margin-bottom: 4px !important;
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
        }

        .infortive-download-grid {
          display: flex !important;
          gap: 8px !important;
          flex-wrap: wrap !important;
        }

        .infortive-download-btn {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 12px 16px !important;
          border: 2px solid #e0e0e0 !important;
          border-radius: 10px !important;
          background: white !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          min-width: 70px !important;
          gap: 6px !important;
        }

        .infortive-download-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
        }

        .infortive-download-btn.pdf-btn {
          border-color: #E53935 !important;
        }
        .infortive-download-btn.pdf-btn:hover {
          background: #FFEBEE !important;
        }

        .infortive-download-btn.word-btn {
          border-color: #1976D2 !important;
        }
        .infortive-download-btn.word-btn:hover {
          background: #E3F2FD !important;
        }

        .infortive-download-btn.html-btn {
          border-color: #E57C23 !important;
        }
        .infortive-download-btn.html-btn:hover {
          background: #FFF3E0 !important;
        }

        .infortive-download-btn .btn-icon {
          width: 28px !important;
          height: 28px !important;
        }

        .infortive-download-btn .btn-label {
          font-size: 11px !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }

        .infortive-download-btn.pdf-btn .btn-label { color: #E53935 !important; }
        .infortive-download-btn.word-btn .btn-label { color: #1976D2 !important; }
        .infortive-download-btn.html-btn .btn-label { color: #E57C23 !important; }

        .infortive-download-btn.generating {
          opacity: 0.6 !important;
          pointer-events: none !important;
        }

        .infortive-download-btn .spinner {
          width: 24px !important;
          height: 24px !important;
          border: 3px solid #e0e0e0 !important;
          border-top-color: ${INFORTIVE.colors.primary} !important;
          border-radius: 50% !important;
          animation: spin 0.8s linear infinite !important;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .infortive-copy-section {
          display: flex !important;
          gap: 8px !important;
          margin-top: 4px !important;
        }

        .infortive-copy-btn {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          padding: 8px 12px !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 6px !important;
          background: #f5f5f5 !important;
          cursor: pointer !important;
          font-size: 12px !important;
          color: #666 !important;
          transition: all 0.2s ease !important;
        }

        .infortive-copy-btn:hover {
          background: #e8e8e8 !important;
          border-color: #ccc !important;
        }

        .infortive-copy-btn.copied {
          background: #E8F5E9 !important;
          border-color: #4CAF50 !important;
          color: #2E7D32 !important;
        }

        .infortive-toast {
          position: fixed !important;
          bottom: 20px !important;
          left: 50% !important;
          transform: translateX(-50%) translateY(100px) !important;
          background: ${INFORTIVE.colors.primary} !important;
          color: white !important;
          padding: 12px 24px !important;
          border-radius: 8px !important;
          font-size: 14px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
          z-index: 10000 !important;
          opacity: 0 !important;
          transition: all 0.3s ease !important;
        }

        .infortive-toast.show {
          transform: translateX(-50%) translateY(0) !important;
          opacity: 1 !important;
        }
      `;
      container.appendChild(styleEl);

      // Toast notification
      let toast = document.querySelector('.infortive-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'infortive-toast';
        document.body.appendChild(toast);
      }

      const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
      };

      // ═══════════════════════════════════════════════════════════
      // ICÔNES SVG POUR LES FORMATS
      // ═══════════════════════════════════════════════════════════
      const ICONS = {
        pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="#E53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M9 15h6"/>
          <path d="M9 11h6"/>
        </svg>`,
        word: `<svg viewBox="0 0 24 24" fill="none" stroke="#1976D2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M8 13h2l1 3 1-3h2"/>
        </svg>`,
        html: `<svg viewBox="0 0 24 24" fill="none" stroke="#E57C23" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
          <line x1="12" y1="2" x2="12" y2="22"/>
        </svg>`,
        copy: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>`,
        check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>`
      };

      // ═══════════════════════════════════════════════════════════
      // GÉNÉRATION HTML - VERSION CORRIGÉE
      // ═══════════════════════════════════════════════════════════
      const generateHTML = () => {
        console.log('📄 [InfortiveExecutiveSummary] generateHTML() appelé');
        const date = new Date();
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        
        let htmlContent = config.content;
        
        if (!htmlContent.includes('<')) {
          htmlContent = htmlContent.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('•') || line.startsWith('-')) return `<li>${line.substring(1).trim()}</li>`;
            return `<p>${line}</p>`;
          }).join('\n').replace(/<li>/g, '<ul><li>').replace(/<\/li>\n(?!<li>)/g, '</li></ul>\n');
        }
        
        return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.missionTitle} - ${config.missionName} - Infortive</title>
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    html, body {
      background: white;
      font-family: 'Merriweather', Georgia, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
    }
    
    .page {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 50px 200px 50px; /* padding-bottom = hauteur footer + marge de sécurité */
      min-height: 100vh;
      position: relative;
    }
    
    /* HEADER */
    .header {
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .logo-infortive {
      height: 55px;
      width: auto;
    }
    
    .tagline {
      font-size: 11pt;
      color: #E57C23;
      font-style: italic;
      margin-top: 10px;
    }
    
    /* TITLE SECTION */
    .title-section {
      border-left: 4px solid #E57C23;
      padding-left: 20px;
      margin: 40px 0;
    }
    
    .document-type {
      font-size: 16pt;
      color: #0B3954;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .mission-name {
      font-size: 18pt;
      color: #E57C23;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .confidential {
      font-size: 11pt;
      color: #666;
      font-style: italic;
      margin-bottom: 5px;
    }
    
    .date {
      font-size: 11pt;
      color: #E57C23;
    }
    
    /* CONTENT */
    .content h2 {
      font-size: 14pt;
      color: #0B3954;
      font-weight: 700;
      margin: 25px 0 12px 0;
      padding-bottom: 5px;
      border-bottom: 1px solid #E57C23;
    }
    
    .content h3 {
      font-size: 12pt;
      color: #E57C23;
      font-weight: 700;
      margin: 20px 0 10px 0;
    }
    
    .content p {
      margin-bottom: 12px;
      text-align: justify;
    }
    
    .content ul {
      margin: 12px 0 18px 0;
      padding-left: 0;
      list-style: none;
    }
    
    .content li {
      margin-bottom: 8px;
      padding-left: 20px;
      position: relative;
    }
    
    .content li::before {
      content: "•";
      color: #E57C23;
      font-weight: bold;
      position: absolute;
      left: 0;
    }
    
    .content strong { color: #0B3954; }
    
    /* FOOTER - POSITIONNÉ EN BAS, SANS CHEVAUCHEMENT */
    .footer {
      background: #0B3954;
      padding: 20px 50px;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: auto;
      min-height: 130px; /* Hauteur minimum pour le footer */
    }
    
    .footer-inner {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
    }
    
    /* Triangle orange - attaché au footer, pas au contenu */
    .footer::before {
      content: "";
      position: absolute;
      left: 50px;
      top: -30px;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 0 30px 25px;
      border-color: transparent transparent #E57C23 transparent;
    }
    
    .footer-contacts { display: flex; flex-direction: column; gap: 6px; }
    
    .contact-line { font-size: 9pt; color: white; line-height: 1.4; }
    .contact-name { font-weight: 700; }
    .contact-role { color: #E57C23; }
    .contact-info a { color: white; text-decoration: none; }
    
    .footer-logo-text {
      font-family: 'Merriweather', serif;
      font-size: 22pt;
      font-weight: 700;
      color: white;
    }
    
    .footer-logo-text .i-accent { color: #E57C23; }
    
    @media print {
      .page { padding-bottom: 150px; }
      .footer { position: fixed; bottom: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <img src="${INFORTIVE.logos.main}" alt="Infortive" class="logo-infortive">
      <div class="tagline">${INFORTIVE.tagline}</div>
    </div>
    
    <div class="title-section">
      <div class="document-type">${config.missionTitle}</div>
      <div class="mission-name">${config.missionName}</div>
      ${config.isConfidential ? '<div class="confidential">Confidentiel</div>' : ''}
      <div class="date">${dateStr}</div>
    </div>
    
    <div class="content">${htmlContent}</div>
  </div>
  
  <div class="footer">
    <div class="footer-inner">
      <div class="footer-contacts">
        ${INFORTIVE.contacts.map(c => `
          <div class="contact-line">
            <span class="contact-name">${c.name}</span> – 
            <span class="contact-role">${c.role}</span><br>
            <span class="contact-info">${c.phone} – <a href="mailto:${c.email}">${c.email}</a></span>
          </div>
        `).join('')}
      </div>
      <div class="footer-logo-text"><span class="i-accent">i</span>nfortive</div>
    </div>
  </div>
</body>
</html>`;
      };

      // ═══════════════════════════════════════════════════════════
      // GÉNÉRATION WORD - VERSION CORRIGÉE
      // ═══════════════════════════════════════════════════════════
      const generateDOCX = async () => {
        console.log('📝 [InfortiveExecutiveSummary] generateDOCX() appelé');
        const date = new Date();
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        
        let htmlContent = config.content;
        
        if (!htmlContent.includes('<')) {
          htmlContent = htmlContent.split('\n').map(line => {
            line = line.trim();
            if (!line) return '';
            if (line.startsWith('•') || line.startsWith('-')) return `<li>${line.substring(1).trim()}</li>`;
            return `<p>${line}</p>`;
          }).join('\n').replace(/<li>/g, '<ul><li>').replace(/<\/li>\n(?!<li>)/g, '</li></ul>\n');
        }
        
        const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { 
      size: A4; 
      margin: 2cm;
    }
    
    body {
      font-family: 'Merriweather', Georgia, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
    }
    
    /* HEADER - LOGO TAILLE CONTRÔLÉE */
    .header {
      margin-bottom: 15pt;
      padding-bottom: 10pt;
      border-bottom: 1pt solid #e0e0e0;
    }
    
    .header table { border-collapse: collapse; }
    .header td { border: none; padding: 0; }
    
    .tagline {
      font-size: 9pt;
      color: #E57C23;
      font-style: italic;
      margin-top: 8pt;
    }
    
    /* TITLE SECTION */
    .title-section {
      border-left: 3pt solid #E57C23;
      padding-left: 12pt;
      margin: 20pt 0;
    }
    
    .document-type {
      font-size: 14pt;
      color: #0B3954;
      font-weight: bold;
      margin-bottom: 5pt;
    }
    
    .mission-name {
      font-size: 16pt;
      color: #E57C23;
      font-weight: bold;
      margin-bottom: 5pt;
    }
    
    .confidential {
      font-size: 10pt;
      color: #666;
      font-style: italic;
    }
    
    .date {
      font-size: 10pt;
      color: #E57C23;
    }
    
    /* CONTENT */
    .content h2 {
      font-size: 13pt;
      color: #0B3954;
      font-weight: bold;
      margin: 15pt 0 8pt 0;
      border-bottom: 1pt solid #E57C23;
      padding-bottom: 3pt;
    }
    
    .content h3 {
      font-size: 11pt;
      color: #E57C23;
      font-weight: bold;
      margin: 12pt 0 6pt 0;
    }
    
    .content p {
      margin-bottom: 8pt;
      text-align: justify;
    }
    
    .content ul { margin: 8pt 0 12pt 20pt; }
    .content li { margin-bottom: 4pt; }
    .content strong { color: #0B3954; }
  </style>
</head>
<body>
  <!-- HEADER avec logo de taille fixe -->
  <div class="header">
    <table><tr><td>
      <img src="${INFORTIVE.logos.main}" width="150" height="52" style="width:150px;height:52px;">
    </td></tr></table>
    <div class="tagline">${INFORTIVE.tagline}</div>
  </div>
  
  <!-- TITLE SECTION -->
  <div class="title-section">
    <div class="document-type">${config.missionTitle}</div>
    <div class="mission-name">${config.missionName}</div>
    ${config.isConfidential ? '<div class="confidential">Confidentiel</div>' : ''}
    <div class="date">${dateStr}</div>
  </div>
  
  <!-- CONTENT -->
  <div class="content">${htmlContent}</div>
</body>
</html>`;

        return new Blob([wordHtml], { type: 'application/msword' });
      };

      // ═══════════════════════════════════════════════════════════
      // GÉNÉRATION PDF (inchangé - fonctionne bien)
      // ═══════════════════════════════════════════════════════════
      const generatePDF = async () => {
        console.log('📕 [InfortiveExecutiveSummary] generatePDF() appelé');
        if (!window.jspdf) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          document.head.appendChild(script);
          await new Promise(resolve => script.onload = resolve);
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const contentWidth = pageWidth - 2 * margin;
        
        const loadImageAsBase64 = async (url) => {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (error) { return null; }
        };
        
        const logoBase64 = await loadImageAsBase64(INFORTIVE.logos.main);
        let yPos = 15;
        
        if (logoBase64) doc.addImage(logoBase64, 'PNG', margin, yPos, 40, 14);
        
        doc.setFontSize(9);
        doc.setTextColor(229, 124, 35);
        doc.text(INFORTIVE.tagline, margin, yPos + 20);
        
        yPos = 42;
        doc.setDrawColor(224, 224, 224);
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        
        yPos = 55;
        doc.setFillColor(229, 124, 35);
        doc.rect(margin, yPos, 1.5, 35, 'F');
        
        const titleX = margin + 6;
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(11, 57, 84);
        doc.text(config.missionTitle, titleX, yPos + 5);
        
        doc.setFontSize(16);
        doc.setTextColor(229, 124, 35);
        doc.text(config.missionName, titleX, yPos + 15);
        
        if (config.isConfidential) {
          doc.setFontSize(10);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(102, 102, 102);
          doc.text('Confidentiel', titleX, yPos + 23);
        }
        
        const date = new Date();
        const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(229, 124, 35);
        doc.text(dateStr, titleX, yPos + 30);
        
        yPos = 100;
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(51, 51, 51);
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = config.content;
        
        const cleanText = (text) => text.replace(/•/g, '-').replace(/–/g, '-').replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"');
        
        const processContent = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
              const lines = doc.splitTextToSize(cleanText(text), contentWidth);
              lines.forEach(line => {
                if (yPos > pageHeight - 50) return;
                doc.text(line, margin, yPos);
                yPos += 6;
              });
              yPos += 2;
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            
            switch(tag) {
              case 'h2':
                doc.setFontSize(13);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(11, 57, 84);
                doc.text(cleanText(node.textContent), margin, yPos);
                yPos += 4;
                doc.setDrawColor(229, 124, 35);
                doc.setLineWidth(0.5);
                doc.line(margin, yPos, margin + 40, yPos);
                yPos += 6;
                doc.setFontSize(11);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(51, 51, 51);
                break;
                
              case 'h3':
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(229, 124, 35);
                doc.text(cleanText(node.textContent), margin, yPos);
                yPos += 6;
                doc.setFont(undefined, 'normal');
                doc.setTextColor(51, 51, 51);
                break;
                
              case 'p':
                const pLines = doc.splitTextToSize(cleanText(node.textContent), contentWidth);
                pLines.forEach(line => { doc.text(line, margin, yPos); yPos += 5; });
                yPos += 3;
                break;
                
              case 'ul':
              case 'ol':
                node.querySelectorAll('li').forEach((li, idx) => {
                  const bullet = tag === 'ul' ? '•' : `${idx + 1}.`;
                  doc.setTextColor(229, 124, 35);
                  doc.text(bullet, margin, yPos);
                  doc.setTextColor(51, 51, 51);
                  const liLines = doc.splitTextToSize(cleanText(li.textContent), contentWidth - 8);
                  liLines.forEach(line => { doc.text(line, margin + 6, yPos); yPos += 5; });
                });
                yPos += 3;
                break;
                
              default:
                node.childNodes.forEach(child => processContent(child));
            }
          }
        };
        
        tempDiv.childNodes.forEach(node => processContent(node));
        
        // Footer
        const footerY = pageHeight - 30;
        doc.setFillColor(11, 57, 84);
        doc.rect(0, footerY, pageWidth, 30, 'F');
        
        doc.setFillColor(229, 124, 35);
        doc.triangle(margin, footerY, margin + 15, footerY, margin, footerY - 25, 'F');
        
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        
        let contactY = footerY + 6;
        INFORTIVE.contacts.forEach(contact => {
          doc.setFont(undefined, 'bold');
          doc.text(contact.name, margin, contactY);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(229, 124, 35);
          doc.text(` – ${contact.role}`, margin + doc.getTextWidth(contact.name), contactY);
          doc.setTextColor(255, 255, 255);
          doc.text(`${contact.phone} – ${contact.email}`, margin, contactY + 3);
          contactY += 8;
        });
        
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(229, 124, 35);
        doc.text('i', pageWidth - margin - 45, footerY + 18);
        doc.setTextColor(255, 255, 255);
        doc.text('nfortive', pageWidth - margin - 41, footerY + 18);
        
        return doc;
      };

      // ═══════════════════════════════════════════════════════════
      // NOUVEAU DESIGN - BOUTONS DE TÉLÉCHARGEMENT DISTINCTS
      // ═══════════════════════════════════════════════════════════
      
      // Titre de section
      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'infortive-section-title';
      sectionTitle.innerHTML = `📥 Télécharger le résumé`;
      container.appendChild(sectionTitle);

      // Grille des boutons de téléchargement
      const downloadGrid = document.createElement('div');
      downloadGrid.className = 'infortive-download-grid';

      // Configuration des formats
      const formatConfig = {
        pdf: { 
          icon: ICONS.pdf, 
          label: 'PDF', 
          class: 'pdf-btn',
          action: async (btn) => {
            const fileName = `${config.fileName}_${new Date().toISOString().slice(0, 10)}`;
            (await generatePDF()).save(`${fileName}.pdf`);
            showToast('✅ PDF téléchargé');
          }
        },
        docx: { 
          icon: ICONS.word, 
          label: 'WORD', 
          class: 'word-btn',
          action: async (btn) => {
            const fileName = `${config.fileName}_${new Date().toISOString().slice(0, 10)}`;
            const blob = await generateDOCX();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${fileName}.doc`;
            link.click();
            showToast('✅ Word téléchargé');
          }
        },
        html: { 
          icon: ICONS.html, 
          label: 'HTML', 
          class: 'html-btn',
          action: async (btn) => {
            const blob = new Blob([generateHTML()], { type: 'text/html;charset=utf-8' });
            window.open(URL.createObjectURL(blob), '_blank');
            showToast('✅ Résumé ouvert');
          }
        }
      };

      // Créer les boutons pour chaque format configuré
      config.formats.forEach(format => {
        if (!formatConfig[format]) return;
        
        const btn = document.createElement('button');
        btn.className = `infortive-download-btn ${formatConfig[format].class}`;
        btn.innerHTML = `
          <div class="btn-icon">${formatConfig[format].icon}</div>
          <span class="btn-label">${formatConfig[format].label}</span>
        `;
        
        btn.addEventListener('click', async () => {
          // Afficher le spinner
          const iconEl = btn.querySelector('.btn-icon');
          const originalIcon = iconEl.innerHTML;
          iconEl.innerHTML = '<div class="spinner"></div>';
          btn.classList.add('generating');
          
          try {
            await formatConfig[format].action(btn);
          } catch (error) {
            console.error('Erreur:', error);
            showToast('❌ Erreur de génération');
          } finally {
            // Restaurer l'icône
            iconEl.innerHTML = originalIcon;
            btn.classList.remove('generating');
          }
        });
        
        downloadGrid.appendChild(btn);
      });

      container.appendChild(downloadGrid);

      // Section Copier (si activée)
      if (config.showCopyButton) {
        const copySection = document.createElement('div');
        copySection.className = 'infortive-copy-section';

        // Bouton copier formaté
        const copyFormattedBtn = document.createElement('button');
        copyFormattedBtn.className = 'infortive-copy-btn';
        copyFormattedBtn.innerHTML = `${ICONS.copy} Copier texte`;
        copyFormattedBtn.addEventListener('click', async () => {
          try {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = config.content;
            await navigator.clipboard.writeText(tempDiv.textContent);
            copyFormattedBtn.classList.add('copied');
            copyFormattedBtn.innerHTML = `${ICONS.check} Copié !`;
            showToast('✅ Texte copié');
            setTimeout(() => {
              copyFormattedBtn.classList.remove('copied');
              copyFormattedBtn.innerHTML = `${ICONS.copy} Copier texte`;
            }, 2000);
          } catch (err) {
            showToast('❌ Erreur de copie');
          }
        });
        copySection.appendChild(copyFormattedBtn);

        // Bouton copier HTML brut
        const copyHtmlBtn = document.createElement('button');
        copyHtmlBtn.className = 'infortive-copy-btn';
        copyHtmlBtn.innerHTML = `${ICONS.copy} Copier HTML`;
        copyHtmlBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(config.content);
            copyHtmlBtn.classList.add('copied');
            copyHtmlBtn.innerHTML = `${ICONS.check} Copié !`;
            showToast('✅ HTML copié');
            setTimeout(() => {
              copyHtmlBtn.classList.remove('copied');
              copyHtmlBtn.innerHTML = `${ICONS.copy} Copier HTML`;
            }, 2000);
          } catch (err) {
            showToast('❌ Erreur de copie');
          }
        });
        copySection.appendChild(copyHtmlBtn);

        container.appendChild(copySection);
      }

      element.appendChild(container);
      
      // Nettoyage du style du parent
      setTimeout(() => {
        const parent = element.closest('.vfrc-message');
        if (parent) {
          parent.style.background = 'transparent';
          parent.style.padding = parent.style.margin = '0';
          parent.style.border = parent.style.boxShadow = 'none';
        }
      }, 0);
      
      console.log('✅ InfortiveExecutiveSummary v2.3 prêt');
      
    } catch (error) {
      console.error('❌ InfortiveExecutiveSummary Error:', error);
    }
  }
};

export default InfortiveExecutiveSummary;
