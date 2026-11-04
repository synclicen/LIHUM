# Task 6 — Visitor Upload Page (`/upload`)

## Agent
Z.ai Code (Code mode)

## Deliverable
- Created `src/app/upload/page.tsx` — public visitor-facing upload page.

## What was built
- **Route**: `/upload?gallery=GALLERY_ID` (client component, wrapped in `<Suspense>` because `useSearchParams()` requires it in Next 16).
- **Theme**: LIHUM dark gold (`bg-[#0C061A]`, cards `bg-[#120A21]`, accent `text-[#D4AF37]`). Mobile-first, `max-w-md` centered. Sticky header + sticky upload footer (with iOS safe-area inset).
- **Initial load**:
  - `GET /api/projects/:id/visitor-upload` → `{ id, name, allowVisitorUpload }`.
  - `GET /api/settings/visitor-frame` → `{ enabled, frameImage }`. Both fetched once on mount.
  - Loading / error / forbidden / ready states.
- **Camera capture** (`getUserMedia`):
  - `facingMode: environment` default + switch (front/back) button.
  - Live video preview with frame PNG as an `absolute inset-0 object-cover pointer-events-none` overlay → live preview of the final composited photo.
  - Capture → canvas → JPEG 0.92 data URL → `preparePhotoForUpload(rawDataUrl, frameImage)` → framed + resized (max 1600px) JPEG pushed to `capturedPhotos`.
  - Handles `NotAllowedError` / `NotFoundError` / `NotReadableError` / `OverconstrainedError` with Indonesian messages.
  - Stream stopped on unmount and on upload success.
- **File upload alternative**:
  - Hidden `<input type="file" accept="image/*" multiple>` triggered by "Pilih dari Galeri" button.
  - Each file → `readFileAsDataURL` → `preparePhotoForUpload` → added to `capturedPhotos`.
- **Captured photos preview**: 3-col grid (max-h-72 scroll), each thumbnail shows the FRAMED version with per-photo remove + "Hapus Semua".
- **Upload flow**:
  - "Upload N Foto" sticky button (slides up via Framer Motion).
  - `POST /api/projects/:id/visitor-upload` with body `{ photos: [{ base64Data: <raw base64 stripped of data: prefix>, mimeType: "image/jpeg", fileName: "photo-<ts>-<i>.jpg" }] }`.
  - Loading spinner on button, success state with "Lihat Galeri" link to `/?gallery=GALLERY_ID` + "Tambah Foto Lagi", error toast with dismiss.
- **Constraints enforced client-side**: max 15 photos per session (matches server rate-limit), warning when within 2 of the limit.

## File referenced (for context, not modified)
- `src/components/lihum/AdminPanel.tsx` (camera getUserMedia pattern, cover-fit crop, error messages).
- `src/lib/frame-compositing.ts` — used `preparePhotoForUpload` + `readFileAsDataURL`.
- `src/app/api/projects/[id]/visitor-upload/route.ts` — matched request/response shape.
- `src/app/api/settings/visitor-frame/route.ts` — confirmed response shape.
- `src/components/lihum/GalleryView.tsx` — theme color reference.

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- `bunx next build` → ✓ Compiled successfully; `/upload` registered as a static route.
