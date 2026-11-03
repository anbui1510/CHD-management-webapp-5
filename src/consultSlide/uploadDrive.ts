import type { StaffSlideDriveTarget } from './types';

const DRIVE_AUTH_HELP =
  'Apps Script chưa có quyền Google Drive (cần scope auth/drive). ' +
  'Mở Apps Script → Project Settings → bật appsscript.json → dán manifest có ' +
  'https://www.googleapis.com/auth/drive → Lưu → chạy authorizeStaffSlideDrive → Allow → ' +
  'Deploy → Manage deployments → New version.';

export function formatStaffSlideUploadError(raw: string): string {
  const msg = String(raw || '');
  if (
    /auth\/drive/i.test(msg) ||
    /DriveApp\.Folder\.createFolder/i.test(msg) ||
    /DriveApp\.createFolder/i.test(msg) ||
    /DriveApp\.Folder\.createFile/i.test(msg) ||
    /不具有呼叫.*DriveApp/i.test(msg) ||
    /無權呼叫.*DriveApp/i.test(msg) ||
    /do not have permission to call.*DriveApp/i.test(msg)
  ) {
    return DRIVE_AUTH_HELP;
  }
  return msg || 'Upload Drive thất bại. Kiểm tra Apps Script upload_staff_slide và quyền Drive.';
}

export async function uploadStaffSlideToDrive(opts: {
  fileName: string;
  base64: string;
  target: StaffSlideDriveTarget;
}): Promise<{ url: string; fileId: string; name?: string }> {
  const res = await fetch('/api/sheets/proxy', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'post',
      payload: {
        action: 'upload_staff_slide',
        fileName: opts.fileName,
        base64: opts.base64,
        rootFolderId: opts.target.rootFolderId,
        yearFolderName: opts.target.yearFolderName,
        monthFolderName: opts.target.monthFolderName,
      },
    }),
  });

  const text = await res.text();
  let data: {
    status?: string;
    message?: string;
    error?: string;
    url?: string;
    fileId?: string;
    name?: string;
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'Apps Script trả về không phải JSON khi upload Drive. Hãy paste/deploy lại Apps Script (action upload_staff_slide).'
    );
  }

  if (!res.ok) {
    throw new Error(formatStaffSlideUploadError(data.error || data.message || `Upload Drive HTTP ${res.status}`));
  }
  if (data.status === 'error') {
    throw new Error(
      formatStaffSlideUploadError(
        data.message ||
          'Upload Drive thất bại. Kiểm tra Apps Script đã deploy action upload_staff_slide và quyền Drive.'
      )
    );
  }
  if (!data.url) {
    throw new Error('Upload Drive thành công nhưng không có URL file.');
  }

  return { url: data.url, fileId: String(data.fileId || ''), name: data.name };
}
