/**
 * Collage compositing library — ported from ARAY app.
 *
 * Implements smart slot detection: scans a frame PNG's alpha channel to find
 * transparent holes. Each connected transparent region = one photo slot.
 * The system also computes the rotation angle of each slot via image moments,
 * so photos can be drawn at any angle (horizontal, vertical, tilted 15°, etc.).
 *
 * This lets admins design frame PNGs with arbitrary slot layouts — 1 slot,
 * 2 slots, 3 slots, tilted polaroid frames, etc. — and the system figures out
 * where to place photos automatically. No manual slot coordinates needed.
 *
 * Flow:
 *   1. Load frame PNG → draw to canvas → getImageData
 *   2. detectHolesFromAlpha: connected-component labeling on alpha channel
 *      → each hole = { centroid, angle, rotated dimensions }
 *   3. For each photo: translate to centroid, rotate by angle, draw cover/contain
 *   4. Overlay frame PNG at natural size (pixel-perfect, no stretching)
 *
 * Ported from ARAY v4.7.67 (github.com/synclicen/ARAY).
 */

// ---------- Types ----------

export interface DetectedSlot {
  x: number; y: number; w: number; h: number; // axis-aligned bounding box
  cx: number; cy: number; // centroid (rotation pivot)
  angle: number; // rotation in radians (0 = horizontal)
  rw: number; rh: number; // rotated rectangle dimensions (major/minor axes)
}

export type FitMode = "fit" | "fill";

// ---------- Image loading ----------

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ---------- Drawing helpers ----------

/**
 * Cover-fit: scale image to FILL the slot, cropping overflow.
 * Like CSS background-size: cover.
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number
): void {
  const imgRatio = img.width / img.height;
  const slotRatio = dw / dh;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;

  if (imgRatio > slotRatio) {
    // Image wider than slot — crop horizontally
    sw = img.height * slotRatio;
    sx = (img.width - sw) / 2;
  } else {
    // Image taller than slot — crop vertically
    sh = img.width / slotRatio;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Contain-fit: scale image to fit INSIDE the slot, no cropping.
 * Image maintains aspect ratio. Empty area filled with black.
 * Like CSS background-size: contain.
 */
function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number
): void {
  const imgRatio = img.width / img.height;
  const slotRatio = dw / dh;

  let drawW = dw;
  let drawH = dh;
  let offsetX = 0;
  let offsetY = 0;

  if (imgRatio > slotRatio) {
    // Image wider than slot — fit to width, center vertically
    drawW = dw;
    drawH = dw / imgRatio;
    offsetY = (dh - drawH) / 2;
  } else {
    // Image taller than slot — fit to height, center horizontally
    drawH = dh;
    drawW = dh * imgRatio;
    offsetX = (dw - drawW) / 2;
  }

  // Fill slot with black background first
  ctx.fillStyle = "#000000";
  ctx.fillRect(dx, dy, dw, dh);

  // Draw image centered in slot
  ctx.drawImage(img, dx + offsetX, dy + offsetY, drawW, drawH);
}

// ---------- Smart Slot Detection (port from ARAY v4.7.67) ----------
//
// Detect transparent regions in a PNG via connected-component labeling on the
// alpha channel. Each connected transparent region = one slot.
//
// Also computes the ROTATION ANGLE of each slot using image moments. This
// allows photos to be drawn at any angle — matching tilted/rotated slots in
// the PNG template (e.g. polaroid-style frames at 15° tilt).
//
// Algorithm:
//   1. Build binary mask: alpha < threshold = hole
//   2. Connected-component labeling (4-connectivity flood fill)
//   3. For each hole: compute centroid + image moments → angle via:
//        theta = 0.5 * atan2(2*mu11, mu20 - mu02)
//   4. Second pass: compute rotated bounding box dimensions (rw, rh)
//   5. Sort in reading order (top-to-bottom with row tolerance, left-to-right)

export function detectHolesFromAlpha(
  imageData: ImageData,
  alphaThreshold = 128,
  minArea = 1000
): DetectedSlot[] {
  const W = imageData.width;
  const H = imageData.height;
  const data = imageData.data;

  // Build binary mask: 1 = hole (transparent), 0 = opaque
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    mask[i] = data[i * 4 + 3] < alphaThreshold ? 1 : 0;
  }

  // Connected-component labeling via iterative flood fill (4-connectivity)
  interface HoleInfo {
    label: number;
    minX: number; minY: number; maxX: number; maxY: number;
    area: number; sumX: number; sumY: number;
    sumXX: number; sumYY: number; sumXY: number;
  }
  const labels = new Int32Array(W * H);
  const holes: HoleInfo[] = [];
  const labelToIdx = new Map<number, number>();
  let nextLabel = 1;

  for (let seed = 0; seed < W * H; seed++) {
    if (mask[seed] !== 1 || labels[seed] !== 0) continue;
    const label = nextLabel++;
    const hd: HoleInfo = {
      label, minX: W, minY: H, maxX: 0, maxY: 0,
      area: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0,
    };
    const stack: number[] = [seed];
    labels[seed] = label;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % W;
      const y = (idx / W) | 0;
      hd.area++;
      hd.sumX += x; hd.sumY += y;
      hd.sumXX += x * x; hd.sumYY += y * y; hd.sumXY += x * y;
      if (x < hd.minX) hd.minX = x;
      if (y < hd.minY) hd.minY = y;
      if (x > hd.maxX) hd.maxX = x;
      if (y > hd.maxY) hd.maxY = y;
      if (x > 0) { const n = idx - 1; if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (x < W - 1) { const n = idx + 1; if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (y > 0) { const n = idx - W; if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n); } }
      if (y < H - 1) { const n = idx + W; if (mask[n] === 1 && labels[n] === 0) { labels[n] = label; stack.push(n); } }
    }
    if (hd.area >= minArea) {
      labelToIdx.set(label, holes.length);
      holes.push(hd);
    }
  }

  // Compute centroid + angle from central moments
  // theta = 0.5 * atan2(2*mu11, mu20 - mu02)
  const holesAngled = holes.map((hd) => {
    const cx = hd.sumX / hd.area;
    const cy = hd.sumY / hd.area;
    const mu20 = hd.sumXX / hd.area - cx * cx;
    const mu02 = hd.sumYY / hd.area - cy * cy;
    const mu11 = hd.sumXY / hd.area - cx * cy;
    const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
    return { ...hd, cx, cy, theta, minXR: Infinity, maxXR: -Infinity, minYR: Infinity, maxYR: -Infinity };
  });

  // Second pass: compute rotated bounding box
  for (let i = 0; i < W * H; i++) {
    const lbl = labels[i];
    if (lbl === 0) continue;
    const hIdx = labelToIdx.get(lbl);
    if (hIdx === undefined) continue;
    const hd = holesAngled[hIdx];
    const x = i % W;
    const y = (i / W) | 0;
    const dx = x - hd.cx;
    const dy = y - hd.cy;
    const cosT = Math.cos(-hd.theta);
    const sinT = Math.sin(-hd.theta);
    const xr = dx * cosT + dy * sinT;
    const yr = -dx * sinT + dy * cosT;
    if (xr < hd.minXR) hd.minXR = xr;
    if (xr > hd.maxXR) hd.maxXR = xr;
    if (yr < hd.minYR) hd.minYR = yr;
    if (yr > hd.maxYR) hd.maxYR = yr;
  }

  // Build result
  let result: DetectedSlot[] = holesAngled.map((hd) => ({
    x: hd.minX, y: hd.minY,
    w: hd.maxX - hd.minX + 1, h: hd.maxY - hd.minY + 1,
    cx: hd.cx, cy: hd.cy,
    angle: hd.theta,
    rw: Math.ceil(hd.maxXR - hd.minXR + 1),
    rh: Math.ceil(hd.maxYR - hd.minYR + 1),
  }));

  // Sort in reading order (top-to-bottom with row tolerance, then left-to-right)
  if (result.length > 0) {
    const avgH = result.reduce((s, h) => s + h.h, 0) / result.length;
    const rowTol = avgH * 0.5;
    result.sort((a, b) => {
      if (Math.abs(a.cy - b.cy) < rowTol) {
        return a.cx - b.cx; // same row → left to right
      }
      return a.cy - b.cy; // different rows → top to bottom
    });
  }

  return result;
}

// ---------- Public API ----------

/**
 * Analyzes a frame PNG and returns the detected photo slots.
 * Used by the admin UI to show how many photos the template expects.
 */
export async function detectTemplateSlots(
  frameDataUrl: string
): Promise<DetectedSlot[]> {
  const frameImg = await loadImage(frameDataUrl);
  if (!frameImg) return [];

  const W = frameImg.naturalWidth;
  const H = frameImg.naturalHeight;
  if (W === 0 || H === 0) return [];

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  ctx.drawImage(frameImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, W, H);
  const holes = detectHolesFromAlpha(
    imageData,
    128,
    Math.max(1000, Math.floor((W * H) * 0.005))
  );
  return holes;
}

/**
 * Returns the aspect ratio (width/height) of the FIRST detected slot.
 * Used by the /upload page to size the camera preview to match the slot —
 * so visitor captures photos at the correct aspect ratio for the collage.
 *
 * Falls back to 3/4 (portrait, common for photos) if no slots detected.
 */
export async function detectSlotAspectRatio(
  frameDataUrl: string
): Promise<number> {
  const slots = await detectTemplateSlots(frameDataUrl);
  if (slots.length === 0) return 3 / 4; // default portrait
  // Use the first slot's rotated dimensions (rw × rh) for aspect ratio.
  // This is the photo's aspect ratio after rotation correction.
  const first = slots[0];
  const ratio = first.rw / first.rh;
  // Clamp to reasonable bounds (0.5 to 2.0) to avoid extreme ratios
  return Math.max(0.5, Math.min(2.0, ratio));
}

/**
 * Composites N photos into a collage using a frame PNG template.
 *
 * @param frameDataUrl - Frame PNG (with transparent holes = slots)
 * @param photoDataUrls - Array of N photos (N should match slot count)
 * @param fitMode - "fit" (contain, no crop) or "fill" (cover, crop)
 * @returns Composite JPEG data URL, or null on failure
 *
 * The frame is drawn at its NATURAL dimensions (no stretching). Each photo
 * is drawn into its detected slot:
 *   - translate to slot centroid
 *   - rotate by slot angle (handles tilted slots)
 *   - draw cover/contain within rotated dimensions (rw × rh)
 */
export async function compositeCollage(
  frameDataUrl: string,
  photoDataUrls: string[],
  fitMode: FitMode = "fill"
): Promise<string | null> {
  try {
    const frameImg = await loadImage(frameDataUrl);
    if (!frameImg) throw new Error("Failed to load frame image");

    // Use PNG frame's natural dimensions as canvas size (pixel-perfect)
    const canvasW = frameImg.naturalWidth || 1080;
    const canvasH = frameImg.naturalHeight || 1920;

    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw frame to canvas to scan alpha channel for slot detection
    ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);
    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    const slots = detectHolesFromAlpha(
      imageData,
      128,
      Math.max(1000, Math.floor((canvasW * canvasH) * 0.005))
    );

    if (slots.length === 0) {
      throw new Error("No transparent slots detected in frame PNG");
    }

    // Clear canvas — black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Draw each photo into its slot (rotated to match slot angle)
    const photos = photoDataUrls.slice(0, slots.length);
    for (let i = 0; i < slots.length && i < photos.length; i++) {
      const slot = slots[i];
      const img = await loadImage(photos[i]);
      if (!img) continue;

      ctx.save();
      ctx.translate(slot.cx, slot.cy);
      if (slot.angle !== 0) {
        ctx.rotate(slot.angle);
      }
      // Draw centered at (0,0) with rotated dimensions rw×rh
      const dx = -slot.rw / 2;
      const dy = -slot.rh / 2;
      if (fitMode === "fill") {
        drawImageCover(ctx, img, dx, dy, slot.rw, slot.rh);
      } else {
        drawImageContain(ctx, img, dx, dy, slot.rw, slot.rh);
      }
      ctx.restore();
    }

    // Overlay PNG frame at NATURAL size — no stretching
    ctx.drawImage(frameImg, 0, 0, canvasW, canvasH);

    return canvas.toDataURL("image/jpeg", 0.92);
  } catch (err) {
    console.error("[Collage] Composite failed:", err);
    return null;
  }
}

/**
 * Resizes a photo data URL to max dimension (default 1600px) for upload.
 * Prevents uploading huge files (e.g. 4K photos from phone cameras).
 */
export async function resizePhoto(
  photoDataUrl: string,
  maxDim: number = 1600
): Promise<string> {
  const img = await loadImage(photoDataUrl);
  if (!img) return photoDataUrl;

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
  if (!ctx) return photoDataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}
