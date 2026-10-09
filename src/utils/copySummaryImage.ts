import html2canvas from 'html2canvas';
import { toBlob as htmlToImageBlob } from 'html-to-image';

export type CopyImageResultType = 'share' | 'clipboard' | 'download';

const SUMMARY_CAPTURE_OPTIONS = {
  backgroundColor: '#ffffff',
  style: {
    transform: 'scale(1)',
    transformOrigin: 'top left',
  },
  pixelRatio: 2,
  cacheBust: true,
} as const;

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function jpegBlobToPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Blob {
  const pageW = Math.max(1, Math.round((widthPx * 72) / 96));
  const pageH = Math.max(1, Math.round((heightPx * 72) / 96));
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const offsets: number[] = [];

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushObj = (body: Uint8Array) => {
    offsets.push(offset);
    push(body);
  };

  push(encoder.encode('%PDF-1.4\n'));
  pushObj(encoder.encode('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  pushObj(encoder.encode('2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n'));
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  pushObj(encoder.encode(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`
  ));
  pushObj(encoder.encode(`4 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`));
  pushObj(concatBytes([
    encoder.encode(
      `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`
    ),
    jpeg,
    encoder.encode('\nendstream\nendobj\n'),
  ]));

  const xrefStart = offset;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (const objOffset of offsets) {
    xref += `${String(objOffset).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  push(encoder.encode(xref));
  return new Blob([concatBytes(chunks)], { type: 'application/pdf' });
}

async function blobToJpeg(blob: Blob): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Không đọc được ảnh tóm tắt.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không tạo được ảnh tóm tắt.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) resolve(result);
        else reject(new Error('Không tạo được ảnh JPEG.'));
      }, 'image/jpeg', 0.92);
    });
    return {
      bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function captureElementPngBlob(element: HTMLElement): Promise<Blob> {
  try {
    const blob = await htmlToImageBlob(element, SUMMARY_CAPTURE_OPTIONS);
    if (blob) return blob;
    throw new Error('html-to-image returned empty blob');
  } catch (htmlToImageErr) {
    console.warn('html-to-image failed, falling back to html2canvas:', htmlToImageErr);
    const html2canvasFn = typeof html2canvas === 'function' ? html2canvas : (html2canvas as { default?: typeof html2canvas }).default;
    if (typeof html2canvasFn !== 'function') {
      throw new Error('Thư viện chụp ảnh chưa được tải đúng cách.');
    }
    const canvas = await html2canvasFn(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
    });
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Không tạo được ảnh PNG.');
    return blob;
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openElementAsPdf(element: HTMLElement): Promise<void> {
  const png = await captureElementPngBlob(element);
  const jpeg = await blobToJpeg(png);
  const pdf = jpegBlobToPdf(jpeg.bytes, jpeg.width, jpeg.height);
  const url = URL.createObjectURL(pdf);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Trình duyệt đã chặn tab mới. Hãy cho phép popup của trang này rồi bấm PDF lại.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function copyElementAsImage(
  elementId: string,
  options: {
    isMobile: boolean;
    fileName: string;
    shareTitle?: string;
  }
): Promise<CopyImageResultType> {
  const el = document.getElementById(elementId);
  if (!el) {
    throw new Error('Không tìm thấy khung tóm tắt để chụp ảnh.');
  }

  const handleBlobResult = async (blob: Blob, sourceCanvas?: HTMLCanvasElement): Promise<CopyImageResultType> => {
    const { isMobile, fileName, shareTitle = 'Tóm tắt' } = options;

    if (isMobile && typeof navigator.share === 'function') {
      try {
        const file = new File([blob], fileName, { type: blob.type || 'image/png' });
        if (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: shareTitle,
          });
          return 'share';
        }
      } catch (shareErr: unknown) {
        if ((shareErr as { name?: string })?.name === 'AbortError') {
          return 'share';
        }
        console.warn('Web Share failed:', shareErr);
      }
    }

    try {
      if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Trình duyệt không hỗ trợ sao chép ảnh trực tiếp.');
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      return 'clipboard';
    } catch (clipboardErr) {
      console.warn('Clipboard write failed, falling back to download:', clipboardErr);
      if (isMobile) {
        throw new Error('Không thể chia sẻ ảnh. Hãy chụp màn hình trực tiếp trên khung tóm tắt bên trên.');
      }
      const link = document.createElement('a');
      link.download = fileName;

      if (sourceCanvas) {
        link.href = sourceCanvas.toDataURL('image/png');
      } else {
        link.href = URL.createObjectURL(blob);
      }

      link.click();
      if (!sourceCanvas) {
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
      }
      return 'download';
    }
  };

  try {
    const blob = await htmlToImageBlob(el, {
      backgroundColor: '#ffffff',
      style: {
        transform: 'scale(1)',
        transformOrigin: 'top left',
      },
      pixelRatio: 2,
      cacheBust: true,
    });
    if (blob) {
      return await handleBlobResult(blob);
    }
    throw new Error('html-to-image returned empty blob');
  } catch (htmlToImageErr) {
    console.warn('html-to-image failed, falling back to html2canvas:', htmlToImageErr);

    const html2canvasFn = typeof html2canvas === 'function' ? html2canvas : (html2canvas as { default?: typeof html2canvas }).default;
    if (typeof html2canvasFn !== 'function') {
      throw new Error('Thư viện chụp ảnh (html2canvas) chưa được tải đúng cách.');
    }
    const canvas = await html2canvasFn(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      return await handleBlobResult(blob, canvas);
    }
    throw new Error('html2canvas returned empty blob');
  }
}
