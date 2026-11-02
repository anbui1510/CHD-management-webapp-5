import type { StaffSlideDriveTarget } from './types';

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
    throw new Error(data.error || data.message || `Upload Drive HTTP ${res.status}`);
  }
  if (data.status === 'error') {
    throw new Error(
      data.message ||
        'Upload Drive thất bại. Kiểm tra Apps Script đã deploy action upload_staff_slide và quyền Drive.'
    );
  }
  if (!data.url) {
    throw new Error('Upload Drive thành công nhưng không có URL file.');
  }

  return { url: data.url, fileId: String(data.fileId || ''), name: data.name };
}
