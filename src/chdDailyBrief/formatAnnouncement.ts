import type { ChdBriefContent } from './types';

export function formatAnnouncement(content: ChdBriefContent): string {
  const lines: string[] = [];
  lines.push(`Chao buoi sang bac si va cac anh chi em than men!`);
  lines.push('');
  lines.push(`Hom nay Bs. An chon chu de ${content.TOPIC} - mot trong nhung van de cot loi cua Tim mach nhi ma chung ta gap moi ngay. Chuc ca team mot ngay lam viec hieu qua, binh an va day nang luong!`);
  lines.push('');
  lines.push('5 bai doc hom nay:');
  lines.push('');

  for (const a of content.articles) {
    const titleUpper = a.titleNews.toUpperCase();
    lines.push(`${titleUpper} ${a.hook}`);
    lines.push('');
  }

  lines.push('Chi tiet day du (thiet ke nghien cuu, ket qua, y nghia lam sang, DOI) trong file Word ben tren.');
  return lines.join('\n');
}

export function formatAnnouncementVN(content: ChdBriefContent): string {
  const lines: string[] = [];
  lines.push('Chào buổi sáng bác sĩ và các anh chị em thân mến!');
  lines.push('');
  lines.push(`Hôm nay Bs. Ân chọn chủ đề ${content.TOPIC} - một trong những vấn đề cốt lõi của Tim mạch nhi mà chúng ta gặp mỗi ngày. Chúc cả team một ngày làm việc hiệu quả, bình an và đầy năng lượng!`);
  lines.push('');
  lines.push('5 bài đọc hôm nay:');
  lines.push('');

  for (const a of content.articles) {
    lines.push(`${a.titleNews.toUpperCase()} ${a.hook}`);
    lines.push('');
  }

  lines.push('Chi tiết đầy đủ (thiết kế nghiên cứu, kết quả, ý nghĩa lâm sàng, DOI) trong file Word bên trên.');
  return lines.join('\n');
}
