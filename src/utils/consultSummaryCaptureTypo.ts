/** Cỡ chữ trên canvas 1080px — khi xem PNG full-width trên điện thoại ~16–18px tương đương. */
export const CAPTURE169_TYPO = {
  shell: 'text-[32px]',
  headerLine: 'text-[28px]',
  docTitle: 'text-[52px] leading-tight',
  patientBanner: 'text-[46px]',
  sectionTitle: 'text-[34px]',
  label: 'text-[30px]',
  value: 'text-[42px] leading-snug',
  body: 'text-[42px] leading-snug',
  badge: 'text-[30px]',
  row: 'text-[34px]',
  meta: 'text-[30px]',
  sectionsWrap: 'text-[32px]',
  /** Giá trị trường — đồng bộ với khối Kết quả staff chi tiết (đen, đậm vừa). */
  fieldValue: 'font-semibold text-slate-900',
} as const;
