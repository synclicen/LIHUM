/**
 * Frame compositing utility — applies a PNG frame overlay onto a photo.
 *
 * Used by:
 *   - /upload page (visitor camera capture + file upload)
 *   - AdminPanel camera test feature
 *
 * The frame is scaled to COVER the photo (like CSS background-size: cover),
 * maintaining aspect ratio. Transparent areas of the frame PNG show the
 * photo beneath; opaque areas overlay the photo (logo, branding, borders).
 *
 * This runs entirely client-side (browser canvas) — no server processing.
 * The result is a JPEG data URL ready for upload.
 */

/**
 * Loads an image from a data URL or URL string.
 * Returns a Promise<HTMLImageElement>.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = src;
  });
}

/**
 * Composites a frame overlay onto a photo.
 *
 * @param photoDataUrl - The source photo as a data URL (JPEG/PNG)
 * @param frameDataUrl - The frame PNG as a data URL (with transparency)
 * @returns A promise resolving to the composited JPEG data URL
 *
 * The frame is drawn to COVER the photo dimensions:
 *   - If frame is wider than photo (relative to aspect), scale frame height
 *     to match photo height, center horizontally
 *   - If frame is taller, scale frame width to match photo width, center vertically
 *
 * This ensures the frame always fills the entire photo edge-to-edge.
 */
export async function applyFrameToPhoto(
  photoDataUrl: string,
  frameDataUrl: string
): Promise<string> {
  const [photo, frame] = await Promise.all([
    loadImage(photoDataUrl),
    loadImage(frameDataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = photo.width;
  canvas.height = photo.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context tidak tersedia");
  }

  // Step 1: Draw the photo as the base layer
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

  // Step 2: Draw the frame on top, scaled to COVER the photo
  // (like CSS background-size: cover — fills entire area, may crop frame edges)
  const photoAspect = canvas.width / canvas.height;
  const frameAspect = frame.width / frame.height;

  let drawW: number, drawH: number, drawX: number, drawY: number;

  if (frameAspect > photoAspect) {
    // Frame is wider (relative) → scale by height, crop horizontally
    drawH = canvas.height;
    drawW = drawH * frameAspect;
    drawX = (canvas.width - drawW) / 2;
    drawY = 0;
  } else {
    // Frame is taller (relative) → scale by width, crop vertically
    drawW = canvas.width;
    drawH = drawW / frameAspect;
    drawX = 0;
    drawY = (canvas.height - drawH) / 2;
  }

  ctx.drawImage(frame, drawX, drawY, drawW, drawH);

  // Export as JPEG (smaller than PNG for photos)
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Reads a File object as a data URL.
 * Used for the file-upload path (visitor selects a photo from their device).
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal membaca file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Resizes a photo data URL to max dimension (default 1600px) for upload.
 * This prevents uploading huge files (e.g. 4K photos from phone cameras).
 *
 * If the photo is already smaller than maxDim, it's returned as-is.
 */
export async function resizePhoto(
  photoDataUrl: string,
  maxDim: number = 1600
): Promise<string> {
  const img = await loadImage(photoDataUrl);

  if (img.width <= maxDim && img.height <= maxDim) {
    return photoDataUrl; // already small enough
  }

  const scale = Math.min(maxDim / img.width, maxDim / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context tidak tersedia");
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Full pipeline: resize → apply frame → return composited JPEG.
 *
 * This is the main function called before uploading a photo:
 *   1. Resize to max 1600px (if needed)
 *   2. Apply frame overlay (if a frame is provided)
 *   3. Return the final JPEG data URL for upload
 */
export async function preparePhotoForUpload(
  photoDataUrl: string,
  frameDataUrl: string | null
): Promise<string> {
  // Step 1: resize
  const resized = await resizePhoto(photoDataUrl, 1600);

  // Step 2: apply frame (if provided)
  if (frameDataUrl && frameDataUrl.length > 0) {
    return applyFrameToPhoto(resized, frameDataUrl);
  }

  // No frame — just return the resized photo
  return resized;
}
