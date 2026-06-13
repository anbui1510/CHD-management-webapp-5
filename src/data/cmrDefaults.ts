/** Giá trị mặc định cho CMRMethod / CMRDevice khi chưa nhập. */
export const DEFAULT_CMR_METHOD =
  'Chụp cộng hưởng từ tim (1.5T) có tiêm thuốc cản quang';

export const DEFAULT_CMR_DEVICE =
  'Dụng cụ cấp cứu cơ bản (dây oxy, bóng, mask, NKQ, hộp chống sốc, an thần)';

export const resolveCMRMethod = (value?: string): string => {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_CMR_METHOD;
};

export const resolveCMRDevice = (value?: string): string => {
  const trimmed = String(value || '').trim();
  return trimmed || DEFAULT_CMR_DEVICE;
};
