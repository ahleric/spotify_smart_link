export type ResizeOptions = {
  maxDimension?: number;
  quality?: number;
  preferWebP?: boolean;
};

export async function resizeImageFile(
  file: File,
  options: ResizeOptions = {},
): Promise<File> {
  const maxDimension = options.maxDimension ?? 1200;
  const quality = options.quality ?? 0.8;
  const preferWebP = options.preferWebP ?? true;

  if (typeof window === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  if (width <= maxDimension && height <= maxDimension) {
    bitmap.close?.();
    return file;
  }

  const scale = maxDimension / Math.max(width, height);
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(targetW, targetH)
    : Object.assign(document.createElement('canvas'), {
        width: targetW,
        height: targetH,
      });

  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const mimeCandidates = preferWebP ? ['image/webp', 'image/jpeg'] : ['image/jpeg'];
  let blob: Blob | null = null;
  let finalMime = 'image/jpeg';
  for (const mime of mimeCandidates) {
    try {
      const out =
        canvas instanceof OffscreenCanvas
          ? await canvas.convertToBlob({ type: mime, quality })
          : await new Promise<Blob | null>((resolve) =>
              (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), mime, quality),
            );
      if (out && out.type === mime) {
        blob = out;
        finalMime = mime;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^./\\]+$/, '') || 'image';
  const ext = finalMime === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${baseName}.${ext}`, {
    type: finalMime,
    lastModified: Date.now(),
  });
}
