const FONT_FILE = 'Roboto-Regular.ttf';
const FONT_URL = '/lichkhoa/fonts/Roboto-Regular.ttf';
const FONT_NAME = 'Roboto';

let fontBase64 = null;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function ensureRobotoFaces(doc) {
  const list = () => doc.getFontList?.()[FONT_NAME] || [];
  if (!list().includes('normal')) {
    doc.addFileToVFS(FONT_FILE, fontBase64);
    doc.addFont(FONT_FILE, FONT_NAME, 'normal');
  }
  // jsPDF-autotable defaults headStyles to bold; map all styles to the same TTF.
  ['bold', 'italic', 'bolditalic'].forEach((style) => {
    if (!list().includes(style)) {
      doc.addFont(FONT_FILE, FONT_NAME, style);
    }
  });
}

export async function registerPdfUnicodeFont(doc) {
  if (!fontBase64) {
    const response = await fetch(FONT_URL);
    if (!response.ok) throw new Error('Không tải được font PDF.');
    fontBase64 = bufferToBase64(await response.arrayBuffer());
  }
  ensureRobotoFaces(doc);
  doc.setFont(FONT_NAME, 'normal');
  return FONT_NAME;
}

/** Shared autoTable options so Unicode cells render reliably. */
export function pdfAutoTableFontStyles(pdfFont) {
  return {
    styles: {
      font: pdfFont,
      fontStyle: 'normal',
      fontSize: 7,
      cellPadding: 2.5,
      halign: 'center',
      valign: 'middle',
      lineColor: [208, 215, 222],
      lineWidth: 0.5,
      textColor: [32, 33, 36]
    },
    headStyles: {
      font: pdfFont,
      fontStyle: 'normal',
      fillColor: [232, 234, 237],
      textColor: [32, 33, 36],
      fontSize: 7
    }
  };
}

export function pinPdfCellFont(data, pdfFont) {
  if (!data?.cell?.styles) return;
  data.cell.styles.font = pdfFont;
  data.cell.styles.fontStyle = 'normal';
}
