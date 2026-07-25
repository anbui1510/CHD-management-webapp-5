import html2canvas from 'html2canvas';
import { toBlob as htmlToImageBlob } from 'html-to-image';

export type CopyImageResultType = 'share' | 'clipboard' | 'download';

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
