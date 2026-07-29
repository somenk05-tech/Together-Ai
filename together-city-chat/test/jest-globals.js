/**
 * Browser globals that pdf.js expects and Node does not provide.
 *
 * medical.service.ts imports pdf-parse, which pulls in pdfjs-dist. That module
 * touches DOMMatrix (and friends) at import time, so ANY spec importing
 * MedicalService died with "ReferenceError: DOMMatrix is not defined" before a
 * single test ran — which is why the medical suites were red regardless of what
 * they asserted.
 *
 * These stubs exist only to let the module finish importing. Nothing under test
 * renders a PDF; the parsing paths that would genuinely need a real DOMMatrix
 * are not exercised here. If a test ever does need real PDF rasterisation, it
 * needs a DOM environment, not a richer fake.
 */
class DOMMatrixStub {
  constructor(init) {
    const v = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
    [this.a, this.b, this.c, this.d, this.e, this.f] = v;
  }
  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
  invertSelf() { return this; }
}

class PathStub {}
class ImageDataStub {
  constructor(width, height) { this.width = width; this.height = height; this.data = new Uint8ClampedArray(0); }
}

if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixStub;
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = PathStub;
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageDataStub;
