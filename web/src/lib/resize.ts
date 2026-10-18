/** Largest file the API accepts (it refuses anything bigger). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Shrinks a photo in the browser before upload: longest side at most `maxSide` px, re-encoded as JPEG.
 * Keeps every upload well under the host's request limit while staying sharp on screens and 4×6/5×7 prints.
 * Photos already small enough are re-encoded anyway, so metadata like GPS location never leaves the phone.
 * If the browser can't read the image (e.g. HEIC outside Safari), the original is sent when it fits the limit.
 */
export async function resizeImage(file: File, maxSide = 2560, quality = 0.85): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error("This photo couldn't be prepared. Try a JPEG or a screenshot of it.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This photo couldn't be prepared. Try a JPEG or a screenshot of it.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
}
