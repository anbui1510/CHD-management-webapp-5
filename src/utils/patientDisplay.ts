export const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return dateStr;
  }
};

export const getExcelAgeHelper = (dobStr: string) => {
  if (!dobStr) return '';
  try {
    const birth = new Date(dobStr);
    const now = new Date('2026-06-06');

    const diffTime = now.getTime() - birth.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Sơ sinh';
    if (diffDays < 30) {
      return `${diffDays} ngày tuổi`;
    }

    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
      years--;
      months = 12 + months;
    }

    const totalMonths = years * 12 + months;
    if (totalMonths < 12) {
      return `${totalMonths} tháng tuổi`;
    }
    if (years <= 5) {
      return months > 0 ? `${years} tuổi ${months} tháng` : `${years} tuổi`;
    }
    return `${years} tuổi`;
  } catch {
    return '';
  }
};
