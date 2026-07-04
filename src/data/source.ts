export const SOURCE_DIAGNOSIS_ID = [
  'ASD',
  'VSD',
  'PDA',
  'PS',
  'AS',
  'APSO',
  'APSI',
  'CoA',
  'Đứt đoạn cung ĐMC',
  'Dò vành',
  'TOF',
  'TBS phức tạp khác',
  'AVSD',
  'SV',
  'DORV',
  'Truncus',
  'TAPVR/PAPVR',
  'TGA',
  'Ebstein',
  'SVT',
  'Nhịp nhanh thất',
  'RLN khác',
  'Bệnh lý mạch máu',
  'Bệnh van tim',
  'Bệnh cơ tim'
];

/** Legacy / mock aliases mapped to canonical Source.DiagnosisID values. */
export const DIAGNOSIS_ID_ALIASES: Record<string, string> = {
  coao: 'CoA',
  'pulmonary stenosis': 'PS',
  arrhythmia: 'SVT',
  'bệnh lý mạch mẫu': 'Bệnh lý mạch máu',
};

export function normalizeDiagnosisID(value: unknown): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const exact = SOURCE_DIAGNOSIS_ID.find(id => id === trimmed);
  if (exact) return exact;

  const caseInsensitive = SOURCE_DIAGNOSIS_ID.find(
    id => id.toLowerCase() === trimmed.toLowerCase()
  );
  if (caseInsensitive) return caseInsensitive;

  const alias = DIAGNOSIS_ID_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return trimmed;
}

type SourceLike = { DiagnosisID?: unknown; [key: string]: unknown };

export function getDiagnosisOptions(sources: SourceLike[] = [], extraValues: unknown[] = []): string[] {
  const sourceValues = sources
    .map(source => normalizeDiagnosisID(source.DiagnosisID))
    .filter(Boolean);

  const baseValues = sourceValues.length > 0 ? sourceValues : SOURCE_DIAGNOSIS_ID;
  const seen = new Set<string>();

  return [...baseValues, ...extraValues.map(value => normalizeDiagnosisID(value))]
    .filter(Boolean)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Canonical DiagnosisID list from Source table only (no legacy consult values). */
export function getSourceDiagnosisOptions(sources: SourceLike[] = []): string[] {
  return getDiagnosisOptions(sources);
}

export const SOURCE_PROVINCE = [
  'Tuyên Quang', 'Cao Bằng', 'Lai Châu', 'Lào Cai', 'Thái Nguyên', 'Điện Biên', 'Lạng Sơn', 'Sơn La', 'Phú Thọ', 'Bắc Ninh', 'Quảng Ninh', 'TP Hà Nội', 'TP Hải Phòng', 'Hưng Yên', 'Ninh Bình', 'Thanh Hoá', 'Nghệ An', 'Hà Tĩnh', 'Quảng Trị', 'TP Huế', 'TP Đà Nẵng', 'Quảng Ngãi', 'Gia Lai', 'Đắk Lắk', 'Khánh Hoà', 'Lâm Đồng', 'Đồng Nai', 'Tây Ninh', 'TP Hồ Chí Minh', 'Đồng Tháp', 'An Giang', 'Vĩnh Long', 'TP Cần Thơ', 'Cà Mau', 'P. Sài Gòn - Tp. HCM', 'P. Tân Định - Tp. HCM', 'P. Bến Thành - Tp. HCM', 'P. Cầu Ông Lãnh - Tp. HCM', 'P. Bàn Cờ - Tp. HCM', 'P. Xuân Hòa - Tp. HCM', 'P. Nhiêu Lộc - Tp. HCM', 'P. Xóm Chiếu - Tp. HCM', 'P. Khánh Hội - Tp. HCM', 'P. Vĩnh Hội - Tp. HCM', 'P. Chợ Quán - Tp. HCM', 'P. An Đông - Tp. HCM', 'P. Chợ Lớn - Tp. HCM', 'P. Bình Tây - Tp. HCM', 'P. Bình Tiên - Tp. HCM', 'P. Bình Phú - Tp. HCM', 'P. Phú Lâm - Tp. HCM', 'P. Tân Thuận - Tp. HCM', 'P. Phú Thuận - Tp. HCM', 'P. Tân Mỹ - Tp. HCM', 'P. Tân Hưng - Tp. HCM', 'P. Chánh Hưng - Tp. HCM', 'P. Phú Định - Tp. HCM', 'P. Bình Đông - Tp. HCM', 'P. Diên Hồng - Tp. HCM', 'P. Vườn Lài - Tp. HCM', 'P. Hòa Hưng - Tp. HCM', 'P. Minh Phụng - Tp. HCM', 'P. Bình Thới - Tp. HCM', 'P. Hòa Bình - Tp. HCM', 'P. Phú Thọ - Tp. HCM', 'P. Đông Hưng Thuận - Tp. HCM', 'P. Trung Mỹ Tây - Tp. HCM', 'P. Tân Thới Hiệp - Tp. HCM', 'P. Thới An - Tp. HCM', 'P. An Phú Đông - Tp. HCM', 'P. An Lạc - Tp. HCM', 'P. Bình Tân - Tp. HCM', 'P. Tân Tạo - Tp. HCM', 'P. Bình Trị Đông - Tp. HCM', 'P. Bình Hưng Hòa - Tp. HCM', 'P. Gia Định - Tp. HCM', 'P. Bình Thạnh - Tp. HCM', 'P. Bình Lợi Trung - Tp. HCM', 'P. Thạnh Mỹ Tây - Tp. HCM', 'P. Bình Quới - Tp. HCM', 'P. Hạnh Thông - Tp. HCM', 'P. An Nhơn - Tp. HCM', 'P. Gò Vấp - Tp. HCM', 'P. An Hội Đông - Tp. HCM', 'P. Thông Tây Hội - Tp. HCM', 'P. An Hội Tây - Tp. HCM', 'P. Đức Nhuận - Tp. HCM', 'P. Cầu Kiệu - Tp. HCM', 'P. Phú Nhuận - Tp. HCM', 'P. Tân Sơn Hòa - Tp. HCM', 'P. Tân Sơn Nhất - Tp. HCM', 'P. Tân Hòa - Tp. HCM', 'P. Bảy Hiền - Tp. HCM', 'P. Tân Bình - Tp. HCM', 'P. Tân Sơn - Tp. HCM', 'P. Tây Thạnh - Tp. HCM', 'P. Tân Sơn Nhì - Tp. HCM', 'P. Phú Thọ Hòa - Tp. HCM', 'P. Tân Phú - Tp. HCM', 'P. Phú Thạnh - Tp. HCM', 'P. Hiệp Bình - Tp. HCM', 'P. Thủ Đức - Tp. HCM', 'P. Tam Bình - Tp. HCM', 'P. Linh Xuân - Tp. HCM', 'P. Tăng Nhơn Phú - Tp. HCM', 'P. Long Bình - Tp. HCM', 'P. Long Phước - Tp. HCM', 'P. Long Trường - Tp. HCM', 'P. Cát Lái - Tp. HCM', 'P. Bình Trưng - Tp. HCM', 'P. Phước Long - Tp. HCM', 'P. An Khánh - Tp. HCM', 'P. Đông Hòa - Tp. HCM', 'P. Dĩ An - Tp. HCM', 'P. Tân Đông Hiệp - Tp. HCM', 'P. An Phú - Tp. HCM', 'P. Bình Hòa - Tp. HCM', 'P. Lái Thiêu - Tp. HCM', 'P. Thuận An - Tp. HCM', 'P. Thuận Giao - Tp. HCM', 'P. Thủ Dầu Một - Tp. HCM', 'P. Phú Lợi - Tp. HCM', 'P. Chánh Hiệp - Tp. HCM', 'P. Bình Dương - Tp. HCM', 'P. Hòa Lợi - Tp. HCM', 'P. Phú An - Tp. HCM', 'P. Tây Nam - Tp. HCM', 'P. Long Nguyên - Tp. HCM', 'P. Bến Cát - Tp. HCM', 'P. Chánh Phú Hòa - Tp. HCM', 'P. Vĩnh Tân - Tp. HCM', 'P. Bình Cơ - Tp. HCM', 'P. Tân Uyên - Tp. HCM', 'P. Tân Hiệp - Tp. HCM', 'P. Tân Khánh - Tp. HCM', 'P. Vũng Tàu - Tp. HCM', 'P. Tam Thắng - Tp. HCM', 'P. Rạch Dừa - Tp. HCM', 'P. Phước Thắng - Tp. HCM', 'P. Long Hương - Tp. HCM', 'P. Bà Rịa - Tp. HCM', 'P. Tam Long - Tp. HCM', 'P. Tân Hải - Tp. HCM', 'P. Tân Phước - Tp. HCM', 'P. Phú Mỹ - Tp. HCM', 'P. Tân Thành - Tp. HCM', 'Xã Vĩnh Lộc - Tp. HCM', 'Xã Tân Vĩnh Lộc - Tp. HCM', 'Xã Bình Lợi - Tp. HCM', 'Xã Tân Nhựt - Tp. HCM', 'Xã Bình Chánh - Tp. HCM', 'Xã Hưng Long - Tp. HCM', 'Xã Bình Hưng - Tp. HCM', 'Xã Bình Khánh - Tp. HCM', 'Xã An Thới Đông - Tp. HCM', 'Xã Cần Giờ - Tp. HCM', 'Xã Củ Chi - Tp. HCM', 'Xã Tân An Hội - Tp. HCM', 'Xã Thái Mỹ - Tp. HCM', 'Xã An Nhơn Tây - Tp. HCM', 'Xã Nhuận Đức - Tp. HCM', 'Xã Phú Hòa Đông - Tp. HCM', 'Xã Bình Mỹ - Tp. HCM', 'Xã Đông Thạnh - Tp. HCM', 'Xã Hóc Môn - Tp. HCM', 'Xã Xuân Thới Sơn - Tp. HCM', 'Xã Bà Điểm - Tp. HCM', 'Xã Nhà Bè - Tp. HCM', 'Xã Hiệp Phước - Tp. HCM', 'Xã Thường Tân - Tp. HCM', 'Xã Bắc Tân Uyên - Tp. HCM', 'Xã Phú Giáo - Tp. HCM', 'Xã Phước Hòa - Tp. HCM', 'Xã Phước Thành - Tp. HCM', 'Xã An Long - Tp. HCM', 'Xã Trừ Văn Thố - Tp. HCM', 'Xã Bàu Bàng - Tp. HCM', 'Xã Long Hòa - Tp. HCM', 'Xã Thanh An - Tp. HCM', 'Xã Dầu Tiếng - Tp. HCM', 'Xã Minh Thạnh - Tp. HCM', 'Xã Châu Pha - Tp. HCM', 'Xã Long Hải - Tp. HCM', 'Xã Long Điền - Tp. HCM', 'Xã Phước Hải - Tp. HCM', 'Xã Đất Đỏ - Tp. HCM', 'Xã Nghĩa Thành - Tp. HCM', 'Xã Ngãi Giao - Tp. HCM', 'Xã Kim Long - Tp. HCM', 'Xã Châu Đức - Tp. HCM', 'Xã Bình Giã - Tp. HCM', 'Xã Xuân Sơn - Tp. HCM', 'Xã Hồ Tràm - Tp. HCM', 'Xã Xuyên Mộc - Tp. HCM', 'Xã Hòa Hội - Tp. HCM', 'Xã Bàu Lâm - Tp. HCM', 'Đặc khu Côn Đảo - Tp. HCM', 'Xã Bình Châu - Tp. HCM', 'Xã Hòa Hiệp - Tp. HCM', 'Xã Long Sơn - Tp. HCM', 'Xã Thạnh An - Tp. HCM', 'P. Thới Hòa - Tp. HCM'
];

export const SOURCE_CATH_METHOD = [
  'Chụp động mạch chủ số hóa xóa nền (DSA)',
  'Đóng các lỗ rò động mạch, tĩnh mạch',
  'Bít lỗ thông liên nhĩ/liên thất/ống động mạch',
  'Siêu âm tim qua đường thực quản',
  'Đặt coli bít ống động mạch',
  'Điều trị rối loạn nhịp tim bằng sóng tần số radio',
  'Nong mạch/đặt stent mạch các loại',
  'Đặt stent hẹp eo động mạch chủ',
  'Nong Van Động Mạch Phổi',
  'Nong van Động Mạch Chủ',
  'Nong hẹp eo động mạch chủ',
  'Đặt stent ống động mạch',
  'Đặt stent động mạch thận',
  'Phá vách liên nhĩ',
  'Đặt máy tạo nhịp'
];
