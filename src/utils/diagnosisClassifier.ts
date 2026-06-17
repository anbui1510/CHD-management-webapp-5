import { removeDiacritics } from '../types';

const normalizeDiagnosisText = (value?: string) =>
  removeDiacritics(String(value || '').toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();

const hasWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);

export function classifyDiagnosisText(...parts: Array<string | undefined | null>): string {
  const text = normalizeDiagnosisText(parts.filter(Boolean).join(' || '));
  if (!text) return '';

  if (/sv|that doc nhat|tam that doc nhat|thieu san tim trai|single ventricle|tim 1 that|tim mot that/.test(text)) return 'SV';
  if (/truncus|than chung dong mach|than chung dm|than dong mach chung|than dm chung|tcdm/.test(text)) return 'Truncus';
  if (/tga|chuyen vi dai dong mach|chuyen vi ddm|hoan vi dai dong mach|hoan vi ddm|cvddm|hvddm/.test(text)) return 'TGA';
  if (/dorv|that phai hai duong ra|that phai 2 duong ra|tp2dr/.test(text)) return 'DORV';
  if (/tapvr|papvr|tapvc|papvc|bat thuong tinh mach phoi|hoi luu tinh mach phoi|hoi luu tmp|bttmp/.test(text)) return 'TAPVR/PAPVR';
  if (/avsd|kenh nhi that|thong vach nhi that|thong san nhi that|knt|tvnt/.test(text)) return 'AVSD';
  if (/tof|tu chung fallot|fallot|fallot 4/.test(text) || hasWord(text, 'tf')) return 'TOF';
  if (/apso|khong lo van dmp.*thong lien that|teo.*thong lien that|pa\/vsd|pa-vsd/.test(text)) return 'APSO';
  if (/apsi|khong lo van dmp.*kin|teo.*kin|pa\/ivs|pa-ivs/.test(text)) return 'APSI';
  if (/ebstein/.test(text)) return 'Ebstein';
  if (/iaa|dut doan cung dmc|dut doan cung dong mach chu|gian doan cung/.test(text)) return 'Đứt đoạn cung ĐMC';
  if (/coa|hep eo dmc|hep eo dong mach chu|thieu san cung/.test(text)) return 'CoA';
  if (/do vanh|ro vanh|do dong mach vanh|ro dong mach vanh|coronary fistula/.test(text)) return 'Dò vành';
  if (/benh ly mach mau|bat thuong mach mau|phinh mach|di dang mach mau|avm/.test(text)) return 'Bệnh lý mạch máu';
  if (/nhip nhanh that|nnt|ventricular tachycardia/.test(text) || hasWord(text, 'vt')) return 'Nhịp nhanh thất';
  if (/svt|nhip nhanh kich phat tren that|nhip nhanh tren that|nntt|psvt|avnrt|avrt/.test(text)) return 'SVT';
  if (/rln|roi loan nhip|ngoai tam thu|ntt|nhip cham|block nhi that|wpw/.test(text)) return 'RLN khác';
  if (/benh co tim|co tim gian|co tim phi dai|dcmp|hcmp|rcmp/.test(text) || hasWord(text, 'cmp')) return 'Bệnh cơ tim';
  if (/benh van tim|ho van|hep van|hep ho van|sa van|viem noi tam mac/.test(text)) return 'Bệnh van tim';
  if (hasWord(text, 'as') || /hep van dmc|hep van dong mach chu|hep chu/.test(text)) return 'AS';
  if (hasWord(text, 'ps') || /hep van dmp|hep tai van dong mach phoi|hep tai van dmp|hep van dong mach phoi|hep phoi/.test(text)) return 'PS';
  if (/vsd|thong lien that|tlt/.test(text)) return 'VSD';
  if (/asd|thong lien nhi|tln/.test(text)) return 'ASD';
  if (/pda|con ong dong mach|ong dong mach|codm/.test(text)) return 'PDA';

  return 'TBS phức tạp khác';
}

