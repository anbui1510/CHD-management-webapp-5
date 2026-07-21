import type { EnrichedTransplant } from './transplantUtils';
import { formatVNTime } from '../../types';

function calcAgeDisplay(dob?: string): string {
  if (!dob) return '';
  const parts = String(dob).trim().split(/[/-]/);
  let birth: Date | null = null;
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      birth = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    } else if (parts[0].length === 4) {
      birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  if (!birth || Number.isNaN(birth.getTime())) return formatVNTime(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${formatVNTime(dob)} (${years} tuổi ${months} tháng)`;
}

export async function exportTransplantExcel(items: EnrichedTransplant[], staffName = 'Admin'): Promise<void> {
  if (items.length === 0) {
    throw new Error('Không có bệnh nhân nào để xuất Excel');
  }

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Transplant_Waitlist');

  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const fontTimesNormal = { name: 'Times New Roman', size: 11 };
  const fontTimesBold = { name: 'Times New Roman', size: 11, bold: true };
  const fontTimesTitle = { name: 'Times New Roman', size: 14, bold: true };
  const centerAlignment = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF000000' } },
    left: { style: 'thin' as const, color: { argb: 'FF000000' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
    right: { style: 'thin' as const, color: { argb: 'FF000000' } },
  };

  worksheet.addRow(['BỆNH VIỆN NHI ĐỒNG THÀNH PHỐ']);
  worksheet.addRow(['KHOA TIM MẠCH']);
  worksheet.addRow([]);
  worksheet.getCell('A1').font = fontTimesBold;
  worksheet.getCell('A2').font = fontTimesBold;

  const titleRow = worksheet.addRow([
    '',
    'DANH SÁCH CHỜ GHÉP TIM - KHOA TIM MẠCH - BỆNH VIỆN NHI ĐỒNG THÀNH PHỐ',
  ]);
  worksheet.mergeCells(`B${titleRow.number}:L${titleRow.number}`);
  const titleCell = worksheet.getCell(`B${titleRow.number}`);
  titleCell.font = fontTimesTitle;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.addRow([]);

  const headers = [
    'STT',
    'Mã NB',
    'Họ và tên',
    'Thông tin',
    'Chẩn đoán',
    'Nhóm máu',
    'XN gen',
    'MRI',
    'Holter',
    'Siêu âm tim',
    'Điều trị hiện tại',
    'Trạng thái',
    'Ghi chú',
  ];
  const headerRow = worksheet.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.font = fontTimesBold;
    cell.alignment = centerAlignment;
    cell.border = thinBorder;
  });

  items.forEach((item, index) => {
    const pat = item.__patient;
    const infoLines = [
      pat?.PatientSex ? `Giới tính: ${pat.PatientSex}` : '',
      pat?.PatientDOB ? calcAgeDisplay(pat.PatientDOB) : '',
      item.TransWeight ? `${item.TransWeight}kg` : '',
      pat?.PatientAddress ? String(pat.PatientAddress) : '',
    ].filter(Boolean).join('\n');

    const row = worksheet.addRow([
      index + 1,
      pat?.PatientID1 || '',
      String(pat?.PatientName || '').toUpperCase(),
      infoLines,
      [item.TransDiagID, item.DetailTransDiagkháct].filter(Boolean).join(' — '),
      item.BloodType || '',
      item.Gens || '',
      item.MRI || '',
      item.Holter || '',
      item.TTE || '',
      item.Treatment || '',
      item.TransStatus || '',
      item.TransNote || '',
    ]);
    row.height = Math.max(40, infoLines.split('\n').length * 16);
    row.eachCell(cell => {
      cell.font = fontTimesNormal;
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });
  });

  worksheet.columns = [
    { width: 5 },
    { width: 12 },
    { width: 24 },
    { width: 28 },
    { width: 30 },
    { width: 14 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 24 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
  ];

  const signRow = worksheet.lastRow ? worksheet.lastRow.number + 3 : items.length + 10;
  worksheet.getCell(`A${signRow}`).value = 'TRƯỞNG KHOA TIM MẠCH';
  worksheet.getCell(`A${signRow}`).font = fontTimesBold;
  worksheet.getCell(`A${signRow}`).alignment = centerAlignment;

  const now = new Date();
  const dateLine = `TP Hồ Chí Minh, ngày ${now.getDate()} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
  worksheet.getCell(`J${signRow - 1}`).value = dateLine;
  worksheet.getCell(`J${signRow - 1}`).font = fontTimesNormal;
  worksheet.getCell(`J${signRow - 1}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`J${signRow}`).value = 'NGƯỜI LẬP BẢNG';
  worksheet.getCell(`J${signRow}`).font = fontTimesBold;
  worksheet.getCell(`J${signRow}`).alignment = centerAlignment;
  worksheet.getCell(`J${signRow + 4}`).value = `BS. ${staffName}`;
  worksheet.getCell(`J${signRow + 4}`).font = fontTimesBold;
  worksheet.getCell(`J${signRow + 4}`).alignment = centerAlignment;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Danh_sach_cho_ghep_tim_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
