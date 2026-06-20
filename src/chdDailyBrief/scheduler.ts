import { runPipeline, wasAutoRunToday, markAutoRunToday } from './runPipeline';
import { formatDateISO } from './topics';

const VN_TZ = 'Asia/Ho_Chi_Minh';

function isEnabled(): boolean {
  const val = (process.env.CHD_BRIEF_AUTO_ENABLED ?? 'true').toLowerCase();
  return val === 'true' || val === '1' || val === 'yes';
}

function getVNTimeParts(): { hour: number; minute: number; dateIso: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return {
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
    dateIso: `${year}-${month}-${day}`,
  };
}

export function startChdBriefScheduler(): void {
  if (!isEnabled()) {
    console.log('[CHD Brief] Auto scheduler disabled (CHD_BRIEF_AUTO_ENABLED != true)');
    return;
  }

  console.log('[CHD Brief] Scheduler started - runs daily at 07:00 Asia/Ho_Chi_Minh');

  setInterval(async () => {
    try {
      const { hour, minute, dateIso } = getVNTimeParts();
      if (hour === 7 && minute === 0 && !wasAutoRunToday()) {
        console.log(`[CHD Brief] Auto-generating brief for ${dateIso}...`);
        markAutoRunToday();
        const result = await runPipeline({ date: new Date(dateIso + 'T12:00:00') });
        if (result.success) {
          console.log(`[CHD Brief] Auto-generation complete: ${result.docxPath}`);
        } else {
          console.error(`[CHD Brief] Auto-generation failed: ${result.error}`);
        }
      }
    } catch (err) {
      console.error('[CHD Brief] Scheduler error:', err);
    }
  }, 60_000);
}
