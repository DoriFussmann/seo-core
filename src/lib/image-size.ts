/** Pixel dimensions read from an image file header. Supports PNG, JPEG, WebP and GIF. */
export interface ImageSize {
  format: "png" | "jpeg" | "webp" | "gif";
  width: number;
  height: number;
}

function pngSize(buf: Uint8Array, view: DataView): ImageSize | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !signature.every((byte, i) => buf[i] === byte)) return null;
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

function gifSize(buf: Uint8Array, view: DataView): ImageSize | null {
  const head = String.fromCharCode(...buf.slice(0, 6));
  if (buf.length < 10 || (head !== "GIF87a" && head !== "GIF89a")) return null;
  return { format: "gif", width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegSize(buf: Uint8Array, view: DataView): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    // Standalone markers carry no length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return { format: "jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buf: Uint8Array, view: DataView): ImageSize | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...buf.slice(start, end));
  if (buf.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const chunk = ascii(12, 16);
  if (chunk === "VP8X") {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { format: "webp", width, height };
  }
  if (chunk === "VP8 ") {
    return { format: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function imageSize(data: Uint8Array): ImageSize | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return pngSize(data, view) ?? jpegSize(data, view) ?? webpSize(data, view) ?? gifSize(data, view);
}
