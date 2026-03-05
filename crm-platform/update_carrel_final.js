const fs = require('fs');
let content = fs.readFileSync('public/proposals/carrel-forwarding-proposal.html', 'utf8');

const logoMatch = content.match(/src="(data:image\/png;base64,iVBOR[\s\S]*?)"/);
let logoSrc = logoMatch ? logoMatch[1] : '';

// Replace KPI Vencimiento
content = content.replace(
  /<div class="kpi-label">Vencimiento del Contrato<\/div>[\s\S]*?<div class="kpi-sub">~4 meses restantes<\/div>/,
  `<div class="kpi-label">Vencimiento del Contrato</div>
        <div class="kpi-value amber">Julio de 2026</div>
        <div class="kpi-sub">~4 meses restantes</div>`
);

// Replace coo-alert-body
content = content.replace(
  /<div class="coo-alert-body">[\s\S]*?<\/div>/,
  `<div class="coo-alert-body">
          Asegure su tarifa ahora. Las tarifas están en su punto más bajo de la temporada antes de que lleguen los precios de verano. Esta propuesta compara las opciones de los mejores proveedores calificados en plazos de 54 y 60 meses &mdash; para que Alberto pueda aprobar con total visibilidad hoy.
        </div>`
);

// Replace Fin del Contrato detail
content = content.replace(
  /<span class="info-val"\s*style="color:#d97706;">30 de junio de 2026<\/span>/,
  `<span class="info-val" style="color:#d97706;">1 de julio de 2026</span>`
);

// Replace the table with the cards layout
const tableSection = /<table class="rates-table">[\s\S]*?<\/table>/;
const newCards = `<div style="display:flex; gap: 16px; margin-bottom: 24px;">
          <!-- 54 Month ENGIE Card -->
          <div class="protection-card" style="flex: 1; display: flex; flex-direction: column; padding: 0;">
            <div style="background: var(--blue); color: white; padding: 8px 16px; font-weight: bold; border-top-left-radius: 5px; border-top-right-radius: 5px; font-size: 10pt; display: flex; justify-content: space-between;">
              <span>Recomendado: 54 Meses</span>
              <span style="background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; font-size: 8pt;">ENGIE</span>
            </div>
            <div style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: flex-start;">
                <div style="display:flex; flex-direction: column;">
                  <span class="info-key" style="font-size: 9pt;">Tarifa de Energía</span>
                  <span style="font-family: 'DM Mono', monospace; font-size: 16pt; color: #0d9e6e; font-weight: bold;">$0.07085</span>
                </div>
                <img style="max-width: 40px; height: auto;" src="${logoSrc}"/>
              </div>
              <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px;">
                <span class="info-key" style="font-size: 9pt;">Costo Anual Estimado</span>
                <span class="info-val" style="font-size: 11pt; color: #0d9e6e; font-weight: 500;">~$14,477/yr</span>
              </div>
            </div>
          </div>

          <!-- 60 Month APG&E Card -->
          <div class="protection-card" style="flex: 1; display: flex; flex-direction: column; padding: 0; border: 1px solid var(--border);">
            <div style="background: rgba(0,0,0,0.03); color: var(--text); padding: 8px 16px; font-weight: bold; border-top-left-radius: 5px; border-top-right-radius: 5px; font-size: 10pt; display: flex; justify-content: space-between; border-bottom: 1px solid var(--border);">
              <span>Alternativa: 60 Meses</span>
              <span style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px; font-size: 8pt;">APG&amp;E</span>
            </div>
            <div style="padding: 16px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px; align-items: flex-start;">
                <div style="display:flex; flex-direction: column;">
                  <span class="info-key" style="font-size: 9pt;">Tarifa de Energía</span>
                  <span style="font-family: 'DM Mono', monospace; font-size: 16pt; font-weight: bold; color: var(--text);">$0.07156</span>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px;">
                <span class="info-key" style="font-size: 9pt;">Costo Anual Estimado</span>
                <span class="info-val" style="font-size: 11pt; color: var(--text);">~$14,622/yr</span>
              </div>
            </div>
          </div>
        </div>`;
content = content.replace(tableSection, newCards);

// "ganada cada columna" update
content = content.replace(
  /<span class="section-title">Opciones de Tarifas Cotizadas &mdash; Plazos de 54 y 60 Meses<\/span>[\s\S]*?<span class="section-desc">El proveedor calificado de ERCOT con precio más bajo gana cada columna<\/span>/,
  `<span class="section-title">Opciones de Tarifas Cotizadas &mdash; Plazos de 54 y 60 Meses</span>\n          <span class="section-desc">Comparación de opciones seleccionadas para el cliente</span>`
);

fs.writeFileSync('public/proposals/carrel-forwarding-proposal.html', content);
console.log('done');
