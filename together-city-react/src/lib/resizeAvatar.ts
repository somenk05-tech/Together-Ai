/**
 * Center-crop + downscale a chosen image to a square JPEG data URL.
 *
 * THE RESIZE IS NOT DECORATION. A photograph off a phone is three to eight
 * megabytes; the account-photo endpoint refuses anything over 400 000
 * characters, and a picture that size would be read back on every list that
 * draws a face. The device does the work once, and what travels is about
 * twenty kilobytes of square JPEG.
 *
 * It lived inside the profile page until a second surface — the picture a
 * reader can put on a chat row — needed exactly the same 240px square. Two
 * copies of a crop are two crops that drift, and the whole point of both is
 * that the same face comes out the same size.
 */
export function resizeAvatar(file: File, size = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no canvas')); return; }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
