import { describe, it, expect } from 'vitest';
import { parseDelimited, readRupees, rowsToDraft } from './sheet';

/**
 * The grocer's sheet, read in the browser (owner, 8 Sep: "if it's a grocery
 * store, let them update material list, upload files"). The server never sees
 * the file — only the rows the owner approves in the grid — so the rules that
 * decide what a cell MEANS live here, and this is where they are held to.
 */
describe('a price out of a cell', () => {
  it('reads rupees however the shop wrote them', () => {
    expect(readRupees('₹1,200.00')).toBe(1200);
    expect(readRupees('Rs. 45')).toBe(45);
    expect(readRupees(80)).toBe(80);
    expect(readRupees(' 12.6 ')).toBe(13);
  });

  it('turns a blank or a word into Ask, never into free', () => {
    // A shop that left the cell empty was not giving the thing away.
    expect(readRupees('')).toBeNull();
    expect(readRupees('call us')).toBeNull();
    expect(readRupees(null)).toBeNull();
    expect(readRupees(-5)).toBeNull();
  });
});

describe('the rows become a draft', () => {
  it('reads the columns by their headings, in whatever order the sheet has them', () => {
    const { items, note } = rowsToDraft([
      ['Category', 'MRP', 'Product', 'Pack'],
      ['Dairy', '62', 'Amul Milk', '1 L'],
      ['Staples', '₹ 1,150', 'Basmati rice', '10 kg'],
    ]);
    expect(items).toEqual([
      { name: 'Amul Milk', section: 'Dairy', priceInr: 62, description: '1 L' },
      { name: 'Basmati rice', section: 'Staples', priceInr: 1150, description: '10 kg' },
    ]);
    expect(note).toContain('“Product”');
    expect(note).toContain('2 lines');
  });

  it('falls back to name · price · section when there are no headings', () => {
    const { items, note } = rowsToDraft([['Tomato', '40', 'Vegetables'], ['Onion', '', 'Vegetables']]);
    expect(items[0]).toEqual({ name: 'Tomato', section: 'Vegetables', priceInr: 40, description: undefined });
    expect(items[1].priceInr).toBeNull();
    expect(note).toContain('no headings');
  });

  it('lets a section on a line of its own carry down to the rows beneath it', () => {
    // "VEGETABLES" on its own row is a heading inside the sheet, the way
    // people actually lay these out — not a product called nothing.
    const { items } = rowsToDraft([
      ['Item', 'Price', 'Section'],
      ['', '', 'Vegetables'],
      ['Potato', '30', ''],
      ['Spinach', '25', ''],
      ['', '', 'Dairy'],
      ['Curd', '55', ''],
    ]);
    expect(items.map((i) => [i.name, i.section])).toEqual([
      ['Potato', 'Vegetables'], ['Spinach', 'Vegetables'], ['Curd', 'Dairy'],
    ]);
  });

  it('says so when there is no price column, instead of pricing everything at zero', () => {
    const { items, note } = rowsToDraft([['Material', 'Unit'], ['Cement', 'bag'], ['Sand', 'ton']]);
    expect(items.every((i) => i.priceInr === null)).toBe(true);
    expect(note).toContain('no price column');
  });

  it('skips empty rows and says when the sheet has none', () => {
    expect(rowsToDraft([]).note).toContain('no rows');
    expect(rowsToDraft([['', null, undefined], [' ']]).items).toEqual([]);
    expect(rowsToDraft([['Name', 'Price'], [], ['Bread', '40'], ['', '']]).items).toHaveLength(1);
  });
});

describe('a CSV or TSV into rows', () => {
  it('handles quoted commas, doubled quotes and CRLF', () => {
    const rows = parseDelimited('name,price\r\n"Rice, basmati",120\r\n"Say ""hi""",5\n');
    expect(rows).toEqual([['name', 'price'], ['Rice, basmati', '120'], ['Say "hi"', '5']]);
  });

  it('reads a tab-separated export when the first line has tabs', () => {
    expect(parseDelimited('Tomato\t40\nOnion\t35')).toEqual([['Tomato', '40'], ['Onion', '35']]);
  });

  it('keeps the last line even without a trailing newline', () => {
    expect(parseDelimited('a,1\nb,2')).toHaveLength(2);
  });
});
