/**
 *  ╔═══════════════════════════════════════════════════════════╗
 *  ║  InfortiveExecutiveSummary – Résumé Exécutif Infortive    ║
 *  ║                                                           ║
 *  ║  • Charte graphique Infortive                            ║
 *  ║  • Téléchargement : HTML / PDF / DOCX                    ║
 *  ║  • Copie : Brut (HTML) / Formaté (texte propre)         ║
 *  ║  • Résumé exécutif max 180 mots (1 page)                ║
 *  ║  • Footer avec contacts Infortive                        ║
 *  ╚═══════════════════════════════════════════════════════════╝
 */

export const InfortiveExecutiveSummary = {
  name: 'InfortiveExecutiveSummary',
  type: 'response',
  
  match: ({ trace }) => trace.type === 'infortive_summary' || trace.payload?.type === 'infortive_summary',

  render: ({ trace, element }) => {
    try {
      // ═══════════════════════════════════════════════════════════
      // CONFIGURATION INFORTIVE
      // ═══════════════════════════════════════════════════════════
      const INFORTIVE = {
        colors: {
          primary: '#0B3954',      // Bleu marine
          accent: '#E57C23',       // Orange
          text: '#333333',         // Texte principal
          textLight: '#666666',    // Texte secondaire
          white: '#FFFFFF',
          background: '#F8F9FA'
        },
        logos: {
          main: 'https://i.imgur.com/VnAvdRW.png',           // Logo couleur
          footer: 'https://i.imgur.com/p3SecSW.png',         // Bande footer
          white: 'https://i.imgur.com/VnAvdRW.png'           // Logo blanc (à remplacer si disponible)
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
        clientLogo: '',                              // URL du logo client (optionnel)
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
              // Parsing manuel en cas d'échec
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
            // MODE TEXT avec options
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

      // Vérifier si on a du contenu
      if (!config.content || config.content.trim() === '') {
        console.warn('InfortiveExecutiveSummary: Aucun contenu fourni');
        return;
      }

      // Container principal pour les boutons
      const container = document.createElement('div');
      container.className = 'infortive-actions-container';
      
      // ═══════════════════════════════════════════════════════════
      // STYLES CSS
      // ═══════════════════════════════════════════════════════════
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        /* Container principal */
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

        .action-button.copied {
          color: #4CAF50 !important;
        }

        .action-button-icon {
          font-size: 16px !important;
          line-height: 1 !important;
          opacity: 0.8 !important;
          transition: all 0.2s ease !important;
        }

        .action-button:hover .action-button-icon {
          opacity: 1 !important;
        }

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
          min-width: auto !important;
        }

        .action-menu.menu-below {
          bottom: auto !important;
          top: calc(100% + 2px) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        }

        .action-menu.show {
          opacity: 1 !important;
          visibility: visible !important;
        }

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
          transition: all 0.1s ease !important;
          width: 100% !important;
          text-align: left !important;
          white-space: nowrap !important;
        }

        .action-menu-option:hover {
          background: rgba(11, 57, 84, 0.1) !important;
        }

        .action-menu-option-icon {
          opacity: 0.8 !important;
          font-size: 14px !important;
        }

        .action-menu-option + .action-menu-option {
          border-top: 1px solid #f0f0f0 !important;
        }

        .action-button.generating {
          opacity: 0.6 !important;
          cursor: wait !important;
        }

        .action-button.generating .action-button-icon {
          animation: spin 1s linear infinite !important;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .action-toast {
          position: fixed !important;
          bottom: 20px !important;
          right: 20px !important;
          background: ${INFORTIVE.colors.primary} !important;
          color: white !important;
          padding: 8px 16px !important;
          border-radius: 6px !important;
          font-size: 13px !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
          z-index: 10000 !important;
          opacity: 0 !important;
          transform: translateY(10px) !important;
          transition: all 0.2s ease !important;
          pointer-events: none !important;
        }

        .action-toast.show {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }

        .vfrc-message--extension-InfortiveExecutiveSummary {
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .action-button {
          animation: fadeIn 0.3s ease-out !important;
        }
      `;

      container.appendChild(styleEl);

      // Toast de notification
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
      // GÉNÉRATION HTML (Style Infortive)
      // ═══════════════════════════════════════════════════════════
      const generateHTML = () => {
        const date = new Date();
        const dateStr = date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        
        let htmlContent = config.content;
        
        // Convertir le texte simple en HTML si nécessaire
        if (!htmlContent.includes('<')) {
          htmlContent = htmlContent
            .split('\n')
            .map(line => {
              line = line.trim();
              if (!line) return '';
              if (line.startsWith('•') || line.startsWith('-')) {
                return `<li>${line.substring(1).trim()}</li>`;
              }
              return `<p>${line}</p>`;
            })
            .join('\n')
            .replace(/<li>/g, '<ul><li>')
            .replace(/<\/li>\n(?!<li>)/g, '</li></ul>\n');
        }
        
        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="ProgId" content="Word.Document">
  <title>${config.missionTitle} - ${config.missionName} - Infortive</title>
  <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      background: white;
      font-family: 'Merriweather', Georgia, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: ${INFORTIVE.colors.text};
      height: 100%;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 20mm;
      margin: 0 auto;
      background: white;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    
    /* ═══════════ HEADER ═══════════ */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20mm;
      padding-bottom: 5mm;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .header-left {
      display: flex;
      flex-direction: column;
      gap: 2mm;
    }
    
    .logo-infortive {
      height: 35px;
      width: auto;
    }
    
    .tagline {
      font-size: 9pt;
      color: ${INFORTIVE.colors.accent};
      font-style: italic;
      margin-top: 2mm;
    }
    
    .header-right {
      text-align: right;
    }
    
    .client-logo {
      max-height: 40px;
      max-width: 120px;
    }
    
    /* ═══════════ TITLE SECTION ═══════════ */
    .title-section {
      border-left: 4px solid ${INFORTIVE.colors.accent};
      padding-left: 15px;
      margin-bottom: 15mm;
    }
    
    .document-type {
      font-size: 14pt;
      color: ${INFORTIVE.colors.primary};
      font-weight: 700;
      margin-bottom: 3mm;
    }
    
    .mission-name {
      font-size: 16pt;
      color: ${INFORTIVE.colors.accent};
      font-weight: 700;
      margin-bottom: 3mm;
    }
    
    .confidential {
      font-size: 10pt;
      color: ${INFORTIVE.colors.textLight};
      font-style: italic;
      margin-bottom: 2mm;
    }
    
    .date {
      font-size: 10pt;
      color: ${INFORTIVE.colors.accent};
    }
    
    /* ═══════════ CONTENT ═══════════ */
    .content {
      flex: 1;
    }
    
    .content h2 {
      font-size: 13pt;
      color: ${INFORTIVE.colors.primary};
      font-weight: 700;
      margin: 8mm 0 4mm 0;
      padding-bottom: 2mm;
      border-bottom: 1px solid ${INFORTIVE.colors.accent};
    }
    
    .content h3 {
      font-size: 11pt;
      color: ${INFORTIVE.colors.accent};
      font-weight: 700;
      margin: 6mm 0 3mm 0;
    }
    
    .content p {
      margin-bottom: 4mm;
      text-align: justify;
      color: ${INFORTIVE.colors.text};
    }
    
    .content ul {
      margin: 3mm 0 5mm 5mm;
      padding-left: 5mm;
    }
    
    .content li {
      margin-bottom: 2mm;
      color: ${INFORTIVE.colors.text};
    }
    
    .content li::marker {
      color: ${INFORTIVE.colors.accent};
    }
    
    .content strong {
      color: ${INFORTIVE.colors.primary};
    }
    
    /* ═══════════ FOOTER ═══════════ */
    .footer {
      margin-top: auto;
      background: ${INFORTIVE.colors.primary};
      margin-left: -20mm;
      margin-right: -20mm;
      margin-bottom: -15mm;
      padding: 8mm 20mm;
      position: relative;
    }
    
    .footer-triangle {
      position: absolute;
      left: 20mm;
      top: 0;
      width: 0;
      height: 0;
      border-style: solid;
      border-width: 0 0 25mm 15mm;
      border-color: transparent transparent ${INFORTIVE.colors.accent} transparent;
      transform: translateY(-100%);
    }
    
    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .footer-contacts {
      display: flex;
      flex-direction: column;
      gap: 1.5mm;
    }
    
    .contact-line {
      font-size: 8pt;
      color: white;
      line-height: 1.4;
    }
    
    .contact-name {
      font-weight: 700;
    }
    
    .contact-role {
      color: ${INFORTIVE.colors.accent};
    }
    
    .contact-info {
      opacity: 0.9;
    }
    
    .contact-info a {
      color: white;
      text-decoration: none;
    }
    
    .footer-logo {
      text-align: right;
    }
    
    .footer-logo-text {
      font-family: 'Merriweather', serif;
      font-size: 20pt;
      font-weight: 700;
      color: white;
      letter-spacing: -0.5px;
    }
    
    .footer-logo-text .i-accent {
      color: ${INFORTIVE.colors.accent};
    }
    
    /* Print styles */
    @media print {
      .page {
        width: 100%;
        min-height: 100vh;
        page-break-after: always;
      }
      
      .footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <img src="${INFORTIVE.logos.main}" alt="Infortive" class="logo-infortive">
        <div class="tagline">${INFORTIVE.tagline}</div>
      </div>
      ${config.showClientLogo && config.clientLogo ? `
      <div class="header-right">
        <img src="${config.clientLogo}" alt="Logo Client" class="client-logo">
      </div>
      ` : ''}
    </div>
    
    <!-- Title Section -->
    <div class="title-section">
      <div class="document-type">${config.missionTitle}</div>
      <div class="mission-name">${config.missionName}</div>
      ${config.isConfidential ? '<div class="confidential">Confidentiel</div>' : ''}
      <div class="date">${dateStr}</div>
    </div>
    
    <!-- Content -->
    <div class="content">
      ${htmlContent}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <div class="footer-triangle"></div>
      <div class="footer-content">
        <div class="footer-contacts">
          ${INFORTIVE.contacts.map(c => `
            <div class="contact-line">
              <span class="contact-name">${c.name}</span> – 
              <span class="contact-role">${c.role}</span><br>
              <span class="contact-info">${c.phone} – <a href="mailto:${c.email}">${c.email}</a></span>
            </div>
          `).join('')}
        </div>
        <div class="footer-logo">
          <div class="footer-logo-text"><span class="i-accent">i</span>nfortive</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
        
        return html;
      };

      // ═══════════════════════════════════════════════════════════
      // GÉNÉRATION PDF
      // ═══════════════════════════════════════════════════════════
      const generatePDF = async () => {
        if (!window.jspdf) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          document.head.appendChild(script);
          await new Promise(resolve => script.onload = resolve);
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        });
        
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const contentWidth = pageWidth - 2 * margin;
        
        // Charger le logo
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
          } catch (error) {
            console.error('Erreur de chargement de l\'image:', error);
            return null;
          }
        };
        
        const logoBase64 = await loadImageAsBase64(INFORTIVE.logos.main);
        
        let yPos = 15;
        
        // ═══════ HEADER ═══════
        if (logoBase64) {
          doc.addImage(logoBase64, 'PNG', margin, yPos, 40, 14);
        }
        
        // Tagline
        doc.setFontSize(9);
        doc.setTextColor(229, 124, 35); // Orange
        doc.text(INFORTIVE.tagline, margin, yPos + 20);
        
        // Ligne de séparation header
        yPos = 42;
        doc.setDrawColor(224, 224, 224);
        doc.setLineWidth(0.3);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        
        // ═══════ TITLE SECTION ═══════
        yPos = 55;
        
        // Barre orange à gauche
        doc.setFillColor(229, 124, 35);
        doc.rect(margin, yPos, 1.5, 35, 'F');
        
        const titleX = margin + 6;
        
        // Document type
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(11, 57, 84); // Bleu marine
        doc.text(config.missionTitle, titleX, yPos + 5);
        
        // Mission name
        doc.setFontSize(16);
        doc.setTextColor(229, 124, 35); // Orange
        doc.text(config.missionName, titleX, yPos + 15);
        
        // Confidential
        if (config.isConfidential) {
          doc.setFontSize(10);
          doc.setFont(undefined, 'italic');
          doc.setTextColor(102, 102, 102);
          doc.text('Confidentiel', titleX, yPos + 23);
        }
        
        // Date
        const date = new Date();
        const dateStr = date.toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(229, 124, 35);
        doc.text(dateStr, titleX, yPos + 30);
        
        // ═══════ CONTENT ═══════
        yPos = 100;
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(51, 51, 51);
        
        // Parser et afficher le contenu
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = config.content;
        
        const cleanText = (text) => {
          return text
            .replace(/•/g, '-')
            .replace(/–/g, '-')
            .replace(/'/g, "'")
            .replace(/"/g, '"')
            .replace(/"/g, '"');
        };
        
        const processContent = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) {
              const lines = doc.splitTextToSize(cleanText(text), contentWidth);
              lines.forEach(line => {
                if (yPos > pageHeight - 50) {
                  // Pas de nouvelle page pour un résumé court
                  return;
                }
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
                const pText = cleanText(node.textContent);
                const pLines = doc.splitTextToSize(pText, contentWidth);
                pLines.forEach(line => {
                  doc.text(line, margin, yPos);
                  yPos += 5;
                });
                yPos += 3;
                break;
                
              case 'ul':
              case 'ol':
                const items = node.querySelectorAll('li');
                items.forEach((li, idx) => {
                  const bullet = tag === 'ul' ? '•' : `${idx + 1}.`;
                  doc.setTextColor(229, 124, 35);
                  doc.text(bullet, margin, yPos);
                  doc.setTextColor(51, 51, 51);
                  const liText = cleanText(li.textContent);
                  const liLines = doc.splitTextToSize(liText, contentWidth - 8);
                  liLines.forEach((line, lineIdx) => {
                    doc.text(line, margin + 6, yPos);
                    yPos += 5;
                  });
                });
                yPos += 3;
                break;
                
              default:
                node.childNodes.forEach(child => processContent(child));
            }
          }
        };
        
        tempDiv.childNodes.forEach(node => processContent(node));
        
        // ═══════ FOOTER ═══════
        const footerY = pageHeight - 30;
        
        // Rectangle bleu marine
        doc.setFillColor(11, 57, 84);
        doc.rect(0, footerY, pageWidth, 30, 'F');
        
        // Triangle orange
        doc.setFillColor(229, 124, 35);
        doc.triangle(margin, footerY, margin + 15, footerY, margin, footerY - 25, 'F');
        
        // Contacts
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        
        let contactY = footerY + 6;
        INFORTIVE.contacts.forEach(contact => {
          doc.setFont(undefined, 'bold');
          doc.text(`${contact.name}`, margin, contactY);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(229, 124, 35);
          doc.text(` – ${contact.role}`, margin + doc.getTextWidth(`${contact.name}`), contactY);
          doc.setTextColor(255, 255, 255);
          doc.text(`${contact.phone} – ${contact.email}`, margin, contactY + 3);
          contactY += 8;
        });
        
        // Logo texte "infortive"
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(229, 124, 35);
        doc.text('i', pageWidth - margin - 45, footerY + 18);
        doc.setTextColor(255, 255, 255);
        doc.text('nfortive', pageWidth - margin - 41, footerY + 18);
        
        return doc;
      };

      // ═══════════════════════════════════════════════════════════
      // GÉNÉRATION DOCX (HTML avec extension .doc)
      // ═══════════════════════════════════════════════════════════
      const generateDOCX = async () => {
        const html = generateHTML();
        const blob = new Blob([html], { type: 'application/msword' });
        return blob;
      };

      // ═══════════════════════════════════════════════════════════
      // BOUTONS ET MENUS
      // ═══════════════════════════════════════════════════════════
      const checkMenuPosition = (menu, button) => {
        const buttonRect = button.getBoundingClientRect();
        const menuHeight = 150;
        
        if (buttonRect.top < menuHeight) {
          menu.classList.add('menu-below');
        } else {
          menu.classList.remove('menu-below');
        }
      };

      // BOUTON COPIER
      if (config.showCopyButton) {
        const copyWrapper = document.createElement('div');
        copyWrapper.className = 'action-button-wrapper';

        const copyButton = document.createElement('button');
        copyButton.className = 'action-button';
        copyButton.innerHTML = `<span class="action-button-icon">${config.copyIconText}</span>`;
        copyButton.title = 'Copier le texte';

        const copyMenu = document.createElement('div');
        copyMenu.className = 'action-menu';
        
        const htmlOption = document.createElement('button');
        htmlOption.className = 'action-menu-option';
        htmlOption.innerHTML = `<span class="action-menu-option-icon">🎨</span><span>Formaté</span>`;
        
        const textOption = document.createElement('button');
        textOption.className = 'action-menu-option';
        textOption.innerHTML = `<span class="action-menu-option-icon">📝</span><span>Brut</span>`;
        
        copyMenu.appendChild(htmlOption);
        copyMenu.appendChild(textOption);

        const copyContent = async (format = 'formatted') => {
          try {
            let textToCopy = '';
            
            if (format === 'formatted') {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = config.content;
              textToCopy = tempDiv.textContent || tempDiv.innerText || '';
            } else {
              textToCopy = config.content;
            }
            
            await navigator.clipboard.writeText(textToCopy);
            
            copyButton.classList.add('copied');
            copyButton.querySelector('.action-button-icon').textContent = config.copiedIcon;
            
            showToast(format === 'formatted' ? 'Texte formaté copié' : 'HTML brut copié');
            
            setTimeout(() => {
              copyButton.classList.remove('copied');
              copyButton.querySelector('.action-button-icon').textContent = config.copyIconText;
            }, 2000);
            
          } catch (err) {
            console.error('Erreur de copie:', err);
            showToast('Erreur lors de la copie');
          }
        };

        copyButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          if (!copyMenuVisible) {
            checkMenuPosition(copyMenu, copyButton);
            copyMenu.classList.add('show');
            copyMenuVisible = true;
            const downloadMenu = container.querySelector('.download-menu');
            if (downloadMenu) downloadMenu.classList.remove('show');
            downloadMenuVisible = false;
          } else {
            copyMenu.classList.remove('show');
            copyMenuVisible = false;
          }
        });

        htmlOption.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyContent('formatted');
          copyMenu.classList.remove('show');
          copyMenuVisible = false;
        });

        textOption.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyContent('raw');
          copyMenu.classList.remove('show');
          copyMenuVisible = false;
        });

        copyWrapper.appendChild(copyButton);
        copyWrapper.appendChild(copyMenu);
        container.appendChild(copyWrapper);
      }

      // BOUTON TÉLÉCHARGER
      if (config.showDownloadButton) {
        const downloadWrapper = document.createElement('div');
        downloadWrapper.className = 'action-button-wrapper';

        const downloadButton = document.createElement('button');
        downloadButton.className = 'action-button';
        downloadButton.innerHTML = `<span class="action-button-icon">${config.downloadIconText}</span>`;
        downloadButton.title = 'Télécharger le résumé';

        const downloadMenu = document.createElement('div');
        downloadMenu.className = 'action-menu download-menu';

        const formatIcons = { html: '🌐', pdf: '📄', docx: '📃' };
        const formatLabels = { html: 'HTML', pdf: 'PDF', docx: 'Word' };

        config.formats.forEach(format => {
          const option = document.createElement('button');
          option.className = 'action-menu-option';
          option.innerHTML = `
            <span class="action-menu-option-icon">${formatIcons[format]}</span>
            <span>${formatLabels[format]}</span>
          `;
          option.addEventListener('click', () => downloadReport(format));
          downloadMenu.appendChild(option);
        });

        const downloadReport = async (format) => {
          downloadButton.classList.add('generating');
          downloadButton.querySelector('.action-button-icon').textContent = '⏳';
          downloadMenu.classList.remove('show');
          downloadMenuVisible = false;
          
          try {
            const date = new Date().toISOString().slice(0, 10);
            const fileName = `${config.fileName}_${date}`;
            
            switch(format) {
              case 'html':
                const htmlContent = generateHTML();
                const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const htmlUrl = URL.createObjectURL(htmlBlob);
                window.open(htmlUrl, '_blank');
                setTimeout(() => URL.revokeObjectURL(htmlUrl), 1000);
                showToast('Résumé ouvert dans un nouvel onglet');
                break;
                
              case 'pdf':
                const pdf = await generatePDF();
                pdf.save(`${fileName}.pdf`);
                showToast('PDF téléchargé avec succès');
                break;
                
              case 'docx':
                const docxBlob = await generateDOCX();
                const docxUrl = URL.createObjectURL(docxBlob);
                const docxLink = document.createElement('a');
                docxLink.href = docxUrl;
                docxLink.download = `${fileName}.doc`;
                docxLink.click();
                URL.revokeObjectURL(docxUrl);
                showToast('Document Word téléchargé');
                break;
            }
            
            console.log(`✅ Résumé ${format.toUpperCase()} généré : ${fileName}`);
            
          } catch (error) {
            console.error('❌ Erreur de génération:', error);
            showToast('Erreur lors de la génération');
          } finally {
            downloadButton.classList.remove('generating');
            downloadButton.querySelector('.action-button-icon').textContent = config.downloadIconText;
          }
        };

        downloadButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          if (!downloadMenuVisible) {
            checkMenuPosition(downloadMenu, downloadButton);
            downloadMenu.classList.add('show');
            downloadMenuVisible = true;
            const copyMenu = container.querySelector('.action-menu:not(.download-menu)');
            if (copyMenu) copyMenu.classList.remove('show');
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

      // Fermer les menus au clic extérieur
      document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
          container.querySelectorAll('.action-menu').forEach(menu => {
            menu.classList.remove('show');
          });
          copyMenuVisible = false;
          downloadMenuVisible = false;
        }
      });

      element.appendChild(container);
      
      // Masquer le background Voiceflow
      setTimeout(() => {
        const parentMessage = element.closest('.vfrc-message');
        if (parentMessage) {
          parentMessage.style.background = 'transparent';
          parentMessage.style.padding = '0';
          parentMessage.style.margin = '0';
          parentMessage.style.border = 'none';
          parentMessage.style.boxShadow = 'none';
        }
      }, 0);
      
      console.log('✅ InfortiveExecutiveSummary prêt');
      
    } catch (error) {
      console.error('❌ InfortiveExecutiveSummary Error:', error);
    }
  }
};

export default InfortiveExecutiveSummary;
