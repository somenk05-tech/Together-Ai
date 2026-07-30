import { describe, it, expect } from 'vitest';
import {
  orientationOnlyApp1, readOrientation, sniff, stripJpeg, stripMetadata, stripPng, stripWebp,
} from './image-metadata';

const bytes = (...xs: number[]) => new Uint8Array(xs);
const str = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const join = (...ps: Uint8Array[]) => {
  const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of ps) { out.set(p, at); at += p.length; }
  return out;
};
/** A marker segment with its two-byte length filled in for you. */
const seg = (marker: number, payload: Uint8Array) =>
  join(bytes(0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff), payload);

const contains = (hay: Uint8Array, needle: string) => {
  const n = str(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let k = 0; k < n.length; k++) if (hay[i + k] !== n[k]) continue outer;
    return true;
  }
  return false;
};

/** A little-endian Exif payload carrying an Orientation and something secret. */
const exifLE = (orientation: number) => join(
  str('Exif\0\0'),
  str('II'), bytes(0x2a, 0x00), bytes(0x08, 0x00, 0x00, 0x00),
  bytes(0x01, 0x00),
  bytes(0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00),
  bytes(0x00, 0x00, 0x00, 0x00),
  str('GPS 19.0760 72.8777 HOME'),
);

const SCAN = join(bytes(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00),
  bytes(0x12, 0x34, 0x56, 0x78, 0x9a), bytes(0xff, 0xd9));

describe('sniff', () => {
  it('knows the three containers a phone produces, and nothing else', () => {
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(sniff(join(bytes(0x89), str('PNG\r\n'), bytes(0x1a, 0x0a)))).toBe('png');
    expect(sniff(join(str('RIFF'), bytes(0, 0, 0, 0), str('WEBP')))).toBe('webp');
    expect(sniff(str('%PDF-1.7'))).toBeNull();
    expect(sniff(bytes())).toBeNull();
  });
});

describe('readOrientation', () => {
  it('reads a little-endian block', () => {
    expect(readOrientation(exifLE(6).subarray(6))).toBe(6);
  });
  it('reads a big-endian block', () => {
    const mm = join(str('MM'), bytes(0x00, 0x2a), bytes(0x00, 0x00, 0x00, 0x08),
      bytes(0x00, 0x01), bytes(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x00),
      bytes(0x00, 0x00, 0x00, 0x00));
    expect(readOrientation(mm)).toBe(8);
  });
  it('says "the right way up" when the block does not say, rather than guessing', () => {
    expect(readOrientation(bytes())).toBe(1);
    expect(readOrientation(str('not a tiff header at all'))).toBe(1);
    const noTag = join(str('MM'), bytes(0x00, 0x2a), bytes(0x00, 0x00, 0x00, 0x08),
      bytes(0x00, 0x00), bytes(0x00, 0x00, 0x00, 0x00));
    expect(readOrientation(noTag)).toBe(1);
  });
  it('refuses an out-of-range value', () => {
    const bad = join(str('MM'), bytes(0x00, 0x2a), bytes(0x00, 0x00, 0x00, 0x08),
      bytes(0x00, 0x01), bytes(0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x63, 0x00, 0x00),
      bytes(0x00, 0x00, 0x00, 0x00));
    expect(readOrientation(bad)).toBe(1);
  });
});

describe('orientationOnlyApp1', () => {
  it('is a fixed 36 bytes and reads back as what went in', () => {
    for (let o = 1; o <= 8; o++) {
      const app1 = orientationOnlyApp1(o);
      expect(app1.length).toBe(36);        // 34 declared, plus the two marker bytes
      expect(app1[3]).toBe(0x22);                     // the declared length matches the real one
      expect(readOrientation(app1.subarray(10))).toBe(o);
    }
  });
  it('normalises nonsense to upright', () => {
    expect(readOrientation(orientationOnlyApp1(0).subarray(10))).toBe(1);
    expect(readOrientation(orientationOnlyApp1(99).subarray(10))).toBe(1);
  });
});

describe('stripJpeg', () => {
  const jfif = seg(0xe0, join(str('JFIF\0'), bytes(0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00)));
  const icc = seg(0xe2, join(str('ICC_PROFILE\0'), bytes(0x01, 0x01), str('colour data')));

  it('removes the coordinates and keeps which way up the photo was', () => {
    const src = join(bytes(0xff, 0xd8), jfif, seg(0xe1, exifLE(6)), SCAN);
    const r = stripJpeg(src)!;
    expect(r.removed).toEqual(['Exif']);
    expect(contains(r.bytes, 'GPS 19.0760')).toBe(false);
    expect(contains(src, 'GPS 19.0760')).toBe(true);          // the fixture really did carry it
    expect(readOrientation(r.bytes.subarray(12))).toBe(6);
  });

  it('leaves the image data and the colour profile exactly as they were', () => {
    const src = join(bytes(0xff, 0xd8), jfif, seg(0xe1, exifLE(1)), icc, SCAN);
    const r = stripJpeg(src)!;
    expect(contains(r.bytes, 'ICC_PROFILE')).toBe(true);
    expect(contains(r.bytes, 'JFIF')).toBe(true);
    expect([...r.bytes.subarray(r.bytes.length - SCAN.length)]).toEqual([...SCAN]);
  });

  it('drops XMP and the Photoshop block, which carry location too', () => {
    const xmp = seg(0xe1, join(str('http://ns.adobe.com/xap/1.0/\0'), str('<x:xmpmeta>19.0760</x:xmpmeta>')));
    const iptc = seg(0xed, join(str('Photoshop 3.0\0'), str('8BIM city=Mumbai')));
    const r = stripJpeg(join(bytes(0xff, 0xd8), xmp, iptc, SCAN))!;
    expect(r.removed).toEqual(['XMP', 'IPTC']);
    expect(contains(r.bytes, 'xmpmeta')).toBe(false);
    expect(contains(r.bytes, '8BIM')).toBe(false);
  });

  it('touches nothing in a file that was already clean', () => {
    const src = join(bytes(0xff, 0xd8), jfif, SCAN);
    const r = stripJpeg(src)!;
    expect(r.removed).toEqual([]);
    expect([...r.bytes]).toEqual([...src]);
  });

  it('is idempotent — stripping twice is stripping once', () => {
    const once = stripJpeg(join(bytes(0xff, 0xd8), jfif, seg(0xe1, exifLE(3)), SCAN))!;
    const twice = stripJpeg(once.bytes)!;
    expect(readOrientation(twice.bytes.subarray(12))).toBe(3);
    expect([...twice.bytes]).toEqual([...once.bytes]);
  });

  it('refuses to guess at bytes it cannot parse', () => {
    expect(stripJpeg(str('not a jpeg'))).toBeNull();
    expect(stripJpeg(bytes(0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x00))).toBeNull();   // length past the end
    expect(stripJpeg(bytes(0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0x99, 0x99))).toBeNull(); // no marker where one must be
  });
});

describe('stripPng', () => {
  const png = (...chunks: Uint8Array[]) => join(bytes(0x89), str('PNG\r\n'), bytes(0x1a, 0x0a), ...chunks);
  const chunk = (type: string, data: Uint8Array) => join(
    bytes((data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff),
    str(type), data, bytes(0xde, 0xad, 0xbe, 0xef),
  );

  it('drops the chunks that can hold a location and keeps the picture', () => {
    const src = png(
      chunk('IHDR', bytes(0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0)),
      chunk('eXIf', str('II*\0 GPS 19.0760')),
      chunk('tEXt', str('Comment\0taken at home')),
      chunk('IDAT', str('pixels')),
      chunk('IEND', bytes()),
    );
    const r = stripPng(src)!;
    expect(r.removed).toEqual(['eXIf', 'tEXt']);
    expect(contains(r.bytes, 'GPS 19.0760')).toBe(false);
    expect(contains(r.bytes, 'taken at home')).toBe(false);
    expect(contains(r.bytes, 'IHDR')).toBe(true);
    expect(contains(r.bytes, 'pixels')).toBe(true);
    expect(contains(r.bytes, 'IEND')).toBe(true);
  });

  it('leaves a clean file byte-for-byte alone', () => {
    const src = png(chunk('IHDR', bytes(0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0)), chunk('IEND', bytes()));
    expect([...stripPng(src)!.bytes]).toEqual([...src]);
  });

  it('refuses a chunk that runs off the end', () => {
    expect(stripPng(png(join(bytes(0x00, 0x00, 0xff, 0x00), str('IDAT'), str('short'))))).toBeNull();
  });
});

describe('stripWebp', () => {
  const chunk = (fourcc: string, data: Uint8Array) => {
    const n = data.length;
    const pad = n % 2 ? bytes(0) : bytes();
    return join(str(fourcc), bytes(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff), data, pad);
  };
  const riff = (...cs: Uint8Array[]) => {
    const body = join(str('WEBP'), ...cs);
    return join(str('RIFF'), bytes(body.length & 0xff, (body.length >>> 8) & 0xff,
      (body.length >>> 16) & 0xff, (body.length >>> 24) & 0xff), body);
  };

  it('drops EXIF and XMP, clears the flags that advertised them, and fixes the size', () => {
    const src = riff(
      chunk('VP8X', bytes(0x08 | 0x04 | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0)),   // Exif + XMP + Alpha
      chunk('VP8 ', str('pixels')),
      chunk('EXIF', str('II*\0 GPS 19.0760')),
      chunk('XMP ', str('<x:xmpmeta/>')),
    );
    const r = stripWebp(src)!;
    expect(r.removed).toEqual(['EXIF', 'XMP']);
    expect(contains(r.bytes, 'GPS 19.0760')).toBe(false);
    expect(contains(r.bytes, 'pixels')).toBe(true);
    expect(r.bytes[20]).toBe(0x10);                        // Alpha kept, Exif and XMP cleared
    const declared = r.bytes[4] | (r.bytes[5] << 8) | (r.bytes[6] << 16) | (r.bytes[7] << 24);
    expect(declared).toBe(r.bytes.length - 8);
  });

  it('leaves a plain lossy file alone', () => {
    const src = riff(chunk('VP8 ', str('pixels')));
    const r = stripWebp(src)!;
    expect(r.removed).toEqual([]);
    expect([...r.bytes]).toEqual([...src]);
  });
});

describe('stripMetadata', () => {
  it('picks the right taker-apart, and admits when it has none', () => {
    expect(stripMetadata(join(bytes(0xff, 0xd8), SCAN))!.container).toBe('jpeg');
    expect(stripMetadata(str('%PDF-1.7 ...'))).toBeNull();
    expect(stripMetadata(str('ftypheic'))).toBeNull();     // HEIC: not one we can take apart
  });
});
