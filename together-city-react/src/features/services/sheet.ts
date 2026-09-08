import type { MenuDraftItem } from './api';

/**
 * ── A STOCK SHEET, READ INTO LINES (owner, 8 Sep) ────────────────────────────
 *
 * "If it's a grocery store, let them update material list, upload files."
 * A kirana does not type four hundred products into a form; it has them in
 * a sheet already — the one the wholesaler sent, the one the accountant
 * keeps. This reads that sheet, CSV or Excel, into the same draft rows the
 * menu photograph produces, and hands them to the same review grid. Nothing
 * publishes until the owner has looked at every line, exactly as with the
 * photograph: a sheet with the price column one over is four hundred wrong
 * prices, and the review grid is where that is caught.
 *
 * COLUMNS ARE FOUND BY NAME, NOT BY POSITION, when a header row exists:
 * "Item", "Product", "Name" for the name; "Price", "Rate", "MRP", "₹" for the
 * price; "Section", "Category", "Group", "Aisle" for the section; "Description"
 * or "Details" for the description. A sheet with no header is read as
 * name · price · section, which is how most people would write one by hand.
 * A price that is not a number becomes "Ask" (null), never zero — a shop that
 * left a cell blank was not giving it away.
 */
export type SheetRow = readonly (string | number | null | undefined)[];

const cellText = (v: string | number | null | undefined): string => (v == null ? '' : String(v)).trim();

/** Rupees out of "₹1,200.00", "1200", "Rs. 45" — or null when nothing numeric is there. */
export function readRupees(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  // The first number in the cell, commas dropped — not "every digit in the
  // cell", which turned "Rs. 45" into ".45" and priced it at zero.
  const m = cellText(v).match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const NAME_HEADS = ['name', 'item', 'product', 'title', 'material', 'description of item', 'particulars'];
const PRICE_HEADS = ['price', 'rate', 'mrp', 'cost', 'amount', 'inr', 'rs', '₹', 'selling price', 'sale price'];
const SECTION_HEADS = ['section', 'category', 'group', 'aisle', 'type', 'department'];
const DESC_HEADS = ['description', 'details', 'note', 'notes', 'size', 'pack', 'unit', 'quantity'];

function headerIndex(heads: string[], names: readonly string[]): number {
  const lower = heads.map((h) => h.toLowerCase().trim());
  for (const n of names) {
    const exact = lower.indexOf(n);
    if (exact >= 0) return exact;
  }
  for (const n of names) {
    const loose = lower.findIndex((h) => h.includes(n));
    if (loose >= 0) return loose;
  }
  return -1;
}

/** Does the first row read as headings rather than as a product? */
function looksLikeHeader(row: SheetRow): boolean {
  const cells = row.map(cellText).filter(Boolean);
  if (cells.length < 2) return false;
  const words = cells.map((c) => c.toLowerCase());
  const known = [...NAME_HEADS, ...PRICE_HEADS, ...SECTION_HEADS, ...DESC_HEADS];
  return words.filter((w) => known.some((k) => w === k || w.includes(k))).length >= 2
    && !cells.some((c) => /^\d+(\.\d+)?$/.test(c));
}

export function rowsToDraft(rows: readonly SheetRow[]): { items: MenuDraftItem[]; note: string } {
  const nonEmpty = rows.filter((r) => r.some((c) => cellText(c)));
  if (!nonEmpty.length) return { items: [], note: 'That sheet has no rows in it.' };

  let start = 0;
  let name = 0, price = 1, section = 2, desc = -1;
  let how = 'Read as name · price · section, since the sheet has no headings.';
  if (looksLikeHeader(nonEmpty[0])) {
    const heads = nonEmpty[0].map(cellText);
    const n = headerIndex(heads, NAME_HEADS);
    const p = headerIndex(heads, PRICE_HEADS);
    const s = headerIndex(heads, SECTION_HEADS);
    const d = headerIndex(heads, DESC_HEADS);
    if (n >= 0) name = n;
    price = p >= 0 ? p : (n === 1 ? 0 : 1);
    section = s;
    desc = d;
    start = 1;
    how = `Read the columns by their headings — name from “${heads[name]}”`
      + (p >= 0 ? `, price from “${heads[p]}”` : ', no price column found (every line says Ask)')
      + (s >= 0 ? `, section from “${heads[s]}”` : '') + '.';
  }

  let sectionCarry: string | undefined;
  const items: MenuDraftItem[] = [];
  for (const row of nonEmpty.slice(start)) {
    const nm = cellText(row[name]);
    const sec = section >= 0 ? cellText(row[section]) : '';
    // A row with a section and nothing else is a heading inside the sheet —
    // "VEGETABLES" on its own line — and applies to the rows under it.
    if (!nm && sec) { sectionCarry = sec; continue; }
    if (!nm) continue;
    if (sec) sectionCarry = sec;
    items.push({
      name: nm.slice(0, 90),
      section: sectionCarry ? sectionCarry.slice(0, 60) : undefined,
      priceInr: price >= 0 ? readRupees(row[price]) : null,
      description: desc >= 0 && cellText(row[desc]) ? cellText(row[desc]).slice(0, 140) : undefined,
    });
  }
  return { items, note: `${how} ${items.length} ${items.length === 1 ? 'line' : 'lines'}. Check every price before publishing.` };
}

/** A CSV / TSV text into rows. Quoted fields, doubled quotes and CRLF are handled; nothing else is needed. */
export function parseDelimited(text: string): SheetRow[] {
  const delim = (text.split('\n')[0] ?? '').includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * ── AN .XLSX, READ WITHOUT A LIBRARY ─────────────────────────────────────────
 *
 * A workbook is a zip of XML. The browser can inflate a zip entry itself
 * (DecompressionStream, every current engine), and the two files that matter
 * are small and regular: the first worksheet's cells, and the shared-strings
 * table the cells point into. Reading them here is ~80 lines; the library
 * that does it in general is 400 KB and would ride in every page load for
 * the one shopkeeper a week who uploads a workbook. Formulas are read by their
 * cached value, dates by their serial number (which a price column never is),
 * and anything this cannot make sense of becomes an empty cell — never a
 * wrong one.
 */
async function inflateRaw(bytes: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return bytes;
  if (method !== 8) throw new Error('That workbook uses a compression this reader cannot open.');
  // A copy onto its own ArrayBuffer: the slice of the zip is a view, and Blob wants a whole buffer.
  const own = bytes.slice().buffer;
  const stream = new Blob([own]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Every entry of a zip: name → bytes, read from the central directory. */
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // End of central directory: signature 0x06054b50, searched from the tail.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file is not a workbook.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    // Local header: 30 bytes + its own name and extra lengths.
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    if (/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml)$/.test(name)) {
      out.set(name, await inflateRaw(u8.subarray(start, start + csize), method));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const colIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buf: ArrayBuffer): Promise<SheetRow[]> {
  const files = await unzip(buf);
  const dec = new TextDecoder();
  const xml = (name: string) => new DOMParser().parseFromString(dec.decode(files.get(name) as Uint8Array), 'application/xml');
  const shared: string[] = [];
  if (files.has('xl/sharedStrings.xml')) {
    for (const si of Array.from(xml('xl/sharedStrings.xml').getElementsByTagName('si'))) {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
    }
  }
  const sheetName = [...files.keys()].filter((k) => k.startsWith('xl/worksheets/')).sort()[0];
  if (!sheetName) return [];
  const rows: SheetRow[] = [];
  for (const row of Array.from(xml(sheetName).getElementsByTagName('row'))) {
    const cells: (string | number | null)[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const at = colIndex(c.getAttribute('r') ?? `${String.fromCharCode(65 + cells.length)}1`);
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? null;
      let value: string | number | null = null;
      if (t === 's') value = shared[Number(v)] ?? null;
      else if (t === 'inlineStr') value = c.getElementsByTagName('t')[0]?.textContent ?? null;
      else if (t === 'str' || t === 'b' || t === 'e') value = v;
      else if (v != null) { const num = Number(v); value = Number.isFinite(num) ? num : v; }
      while (cells.length < at) cells.push(null);
      cells[at] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** The file, whatever it is, into draft lines. */
export async function readSheetFile(file: File): Promise<{ items: MenuDraftItem[]; note: string }> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (ext === 'xlsx' || ext === 'xlsm') return rowsToDraft(await readXlsx(await file.arrayBuffer()));
  if (ext === 'xls') return { items: [], note: 'That is the old Excel format (.xls). Save it as .xlsx or .csv and upload that.' };
  return rowsToDraft(parseDelimited(await file.text()));
}
