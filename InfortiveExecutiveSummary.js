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
console.log('🟢 [InfortiveExecutiveSummary] Extension CHARGÉE - v2.1 - ' + new Date().toISOString());

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
        downloadIconText: '📥',
        copyIconText: '📋',
        copiedIcon: '✅',
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
      // STYLES CSS
      // ═══════════════════════════════════════════════════════════
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        .infortive-actions-container {
          display: inline-flex !important;
          gap: 8px !important;
          align-items: center !important;
          margin: -0.75rem 0 0.5rem 0 !important;
          justify-content: flex-end !important;
          width: 100% !important;
        }

        .action-button-wrapper {
          position: relative !important;
          display: inline-flex !important;
          align-items: center !important;
        }

        .action-button {
          background: transparent !important;
          color: ${INFORTIVE.colors.accent} !important;
          border: 1px solid transparent !important;
          padding: 4px 8px !important;
          border-radius: 6px !important;
          font-size: 16px !important;
          cursor: pointer !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          transition: all 0.2s ease !important;
          min-width: 32px !important;
          height: 32px !important;
        }

        .action-button:hover {
          background: rgba(229, 124, 35, 0.1) !important;
          border-color: ${INFORTIVE.colors.accent} !important;
        }

        .action-button.copied { color: #4CAF50 !important; }

        .action-button-icon {
          font-size: 16px !important;
          line-height: 1 !important;
          opacity: 0.8 !important;
          transition: all 0.2s ease !important;
        }

        .action-button:hover .action-button-icon { opacity: 1 !important; }

        .action-menu {
          position: absolute !important;
          bottom: calc(100% + 2px) !important;
          right: 0 !important;
          background: white !important;
          border: 1px solid #e0e0e0 !important;
          border-radius: 6px !important;
          box-shadow: 0 -2px 8px rgba(0,0,0,0.1) !important;
          padding: 2px !important;
          z-index: 1000 !important;
          opacity: 0 !important;
          visibility: hidden !important;
          transition: all 0.15s ease !important;
        }

        .action-menu.menu-below {
          bottom: auto !important;
          top: calc(100% + 2px) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        }

        .action-menu.show { opacity: 1 !important; visibility: visible !important; }

        .action-menu-option {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          padding: 6px 12px !important;
          border: none !important;
          background: none !important;
          color: ${INFORTIVE.colors.primary} !important;
          font-size: 12px !important;
          cursor: pointer !important;
          border-radius: 4px !important;
          width: 100% !important;
          text-align: left !important;
          white-space: nowrap !important;
        }

        .action-menu-option:hover { background: rgba(11, 57, 84, 0.1) !important; }
        .action-menu-option + .action-menu-option { border-top: 1px solid #f0f0f0 !important; }

        .action-button.generating { opacity: 0.6 !important; cursor: wait !important; }
        .action-button.generating .action-button-icon { animation: spin 1s linear infinite !important; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .action-toast {
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          background: ${INFORTIVE.colors.primary} !important;
          color: white !important;
          padding: 8px 16px !important;
          border-radius: 6px !important;
          font-size: 13px !important;
          z-index: 10000 !important;
          opacity: 0 !important;
          transform: translateY(10px) !important;
          transition: all 0.2s ease !important;
        }

        .action-toast.show { opacity: 1 !important; transform: translateY(0) !important; }

        .vfrc-message--extension-InfortiveExecutiveSummary {
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
        }
      `;

      container.appendChild(styleEl);

      let toast = document.querySelector('.action-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'action-toast';
        document.body.appendChild(toast);
      }

      const showToast = (message) => {
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 1500);
      };

      let copyMenuVisible = false;
      let downloadMenuVisible = false;

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
      padding: 40px 50px 120px 50px;
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
  <style>
    @page { size: A4; margin: 2cm; }
    
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
    
    /* FOOTER - TABLEAU SIMPLE POUR WORD */
    .footer-table {
      width: 100%;
      background-color: #0B3954;
      margin-top: 30pt;
      border-collapse: collapse;
    }
    
    .footer-table td {
      padding: 12pt;
      vertical-align: middle;
    }
    
    .footer-contacts { font-size: 8pt; color: white; }
    .contact-name { font-weight: bold; color: white; }
    .contact-role { color: #E57C23; }
    .contact-info { color: #cccccc; }
    
    .footer-logo {
      font-size: 18pt;
      font-weight: bold;
      color: white;
      text-align: right;
    }
    
    .i-orange { color: #E57C23; }
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
  
  <!-- FOOTER - Format tableau pour Word -->
  <table class="footer-table">
    <tr>
      <td style="width:70%;">
        <div class="footer-contacts">
          ${INFORTIVE.contacts.map(c => `
            <div style="margin-bottom:6pt;">
              <span class="contact-name">${c.name}</span> – 
              <span class="contact-role">${c.role}</span><br>
              <span class="contact-info">${c.phone} – ${c.email}</span>
            </div>
          `).join('')}
        </div>
      </td>
      <td style="width:30%;">
        <div class="footer-logo"><span class="i-orange">i</span>nfortive</div>
      </td>
    </tr>
  </table>
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
      // BOUTONS
      // ═══════════════════════════════════════════════════════════
      const checkMenuPosition = (menu, button) => {
        const rect = button.getBoundingClientRect();
        if (rect.top < 150) menu.classList.add('menu-below');
        else menu.classList.remove('menu-below');
      };

      if (config.showCopyButton) {
        const copyWrapper = document.createElement('div');
        copyWrapper.className = 'action-button-wrapper';

        const copyButton = document.createElement('button');
        copyButton.className = 'action-button';
        copyButton.innerHTML = `<span class="action-button-icon">${config.copyIconText}</span>`;
        copyButton.title = 'Copier le texte';

        const copyMenu = document.createElement('div');
        copyMenu.className = 'action-menu';
        
        ['Formaté', 'Brut'].forEach((label, i) => {
          const opt = document.createElement('button');
          opt.className = 'action-menu-option';
          opt.innerHTML = `<span class="action-menu-option-icon">${i === 0 ? '🎨' : '📝'}</span><span>${label}</span>`;
          opt.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const text = i === 0 
                ? ((() => { const d = document.createElement('div'); d.innerHTML = config.content; return d.textContent; })())
                : config.content;
              await navigator.clipboard.writeText(text);
              copyButton.classList.add('copied');
              copyButton.querySelector('.action-button-icon').textContent = config.copiedIcon;
              showToast(i === 0 ? 'Texte formaté copié' : 'HTML brut copié');
              setTimeout(() => {
                copyButton.classList.remove('copied');
                copyButton.querySelector('.action-button-icon').textContent = config.copyIconText;
              }, 2000);
            } catch (err) { showToast('Erreur lors de la copie'); }
            copyMenu.classList.remove('show');
            copyMenuVisible = false;
          });
          copyMenu.appendChild(opt);
        });

        copyButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!copyMenuVisible) {
            checkMenuPosition(copyMenu, copyButton);
            copyMenu.classList.add('show');
            copyMenuVisible = true;
            container.querySelector('.download-menu')?.classList.remove('show');
            downloadMenuVisible = false;
          } else {
            copyMenu.classList.remove('show');
            copyMenuVisible = false;
          }
        });

        copyWrapper.appendChild(copyButton);
        copyWrapper.appendChild(copyMenu);
        container.appendChild(copyWrapper);
      }

      if (config.showDownloadButton) {
        const downloadWrapper = document.createElement('div');
        downloadWrapper.className = 'action-button-wrapper';

        const downloadButton = document.createElement('button');
        downloadButton.className = 'action-button';
        downloadButton.innerHTML = `<span class="action-button-icon">${config.downloadIconText}</span>`;
        downloadButton.title = 'Télécharger';

        const downloadMenu = document.createElement('div');
        downloadMenu.className = 'action-menu download-menu';

        const formats = { html: ['🌐', 'HTML'], pdf: ['📄', 'PDF'], docx: ['📃', 'Word'] };

        config.formats.forEach(format => {
          const opt = document.createElement('button');
          opt.className = 'action-menu-option';
          opt.innerHTML = `<span class="action-menu-option-icon">${formats[format][0]}</span><span>${formats[format][1]}</span>`;
          opt.addEventListener('click', async () => {
            downloadButton.classList.add('generating');
            downloadButton.querySelector('.action-button-icon').textContent = '⏳';
            downloadMenu.classList.remove('show');
            downloadMenuVisible = false;
            
            try {
              const fileName = `${config.fileName}_${new Date().toISOString().slice(0, 10)}`;
              
              if (format === 'html') {
                const blob = new Blob([generateHTML()], { type: 'text/html;charset=utf-8' });
                window.open(URL.createObjectURL(blob), '_blank');
                showToast('Résumé ouvert');
              } else if (format === 'pdf') {
                (await generatePDF()).save(`${fileName}.pdf`);
                showToast('PDF téléchargé');
              } else if (format === 'docx') {
                const blob = await generateDOCX();
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${fileName}.doc`;
                link.click();
                showToast('Word téléchargé');
              }
            } catch (error) {
              console.error('Erreur:', error);
              showToast('Erreur de génération');
            } finally {
              downloadButton.classList.remove('generating');
              downloadButton.querySelector('.action-button-icon').textContent = config.downloadIconText;
            }
          });
          downloadMenu.appendChild(opt);
        });

        downloadButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!downloadMenuVisible) {
            checkMenuPosition(downloadMenu, downloadButton);
            downloadMenu.classList.add('show');
            downloadMenuVisible = true;
            container.querySelector('.action-menu:not(.download-menu)')?.classList.remove('show');
            copyMenuVisible = false;
          } else {
            downloadMenu.classList.remove('show');
            downloadMenuVisible = false;
          }
        });

        downloadWrapper.appendChild(downloadButton);
        downloadWrapper.appendChild(downloadMenu);
        container.appendChild(downloadWrapper);
      }

      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          container.querySelectorAll('.action-menu').forEach(m => m.classList.remove('show'));
          copyMenuVisible = downloadMenuVisible = false;
        }
      });

      element.appendChild(container);
      
      setTimeout(() => {
        const parent = element.closest('.vfrc-message');
        if (parent) {
          parent.style.background = 'transparent';
          parent.style.padding = parent.style.margin = '0';
          parent.style.border = parent.style.boxShadow = 'none';
        }
      }, 0);
      
      console.log('✅ InfortiveExecutiveSummary v2 prêt');
      
    } catch (error) {
      console.error('❌ InfortiveExecutiveSummary Error:', error);
    }
  }
};

export default InfortiveExecutiveSummary;
