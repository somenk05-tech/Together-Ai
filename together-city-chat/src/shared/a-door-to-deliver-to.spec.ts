import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADDRESS_LABELS, DeliveryAddressSchema, addressText, parseAddress, snapshotOf } from './delivery-address';

/**
 * A DOOR TO DELIVER TO — owner, 7 Sep: "add a detailed delivery address to
 * be saved and show the delivery address if it is already saved; also create
 * a page for all past orders."
 *
 * What the API promises: the door is one shape everywhere; the one-line
 * addressText every older reader uses is composed from it; a label outside
 * the book's three pages is refused; each till's order keeps a snapshot of
 * the door and hands it back with the order.
 */

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

const DOOR = {
  name: 'Somen', phone: '+91 98765 43210', line1: 'Flat 4B, Sunrise Towers, MG Road', line2: 'Bistupur',
  landmark: 'Opposite the post office', city: 'Jamshedpur', state: 'Jharkhand', pincode: '831001',
};
/** The same door with the two optional lines left out. */
const BARE = { name: DOOR.name, phone: DOOR.phone, line1: DOOR.line1, city: DOOR.city, state: DOOR.state, pincode: DOOR.pincode };

describe('the shape of a door', () => {
  it('takes a whole door and refuses a half one', () => {
    expect(DeliveryAddressSchema.safeParse(DOOR).success).toBe(true);
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, pincode: '0831001' }).success).toBe(false);
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, pincode: '83100' }).success).toBe(false);
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, phone: 'call me' }).success).toBe(false);
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, name: 'S' }).success).toBe(false);
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, line1: '' }).success).toBe(false);
    // The two optional lines may be left out altogether.
    expect(DeliveryAddressSchema.safeParse(BARE).success).toBe(true);
    // And nothing the form did not ask for rides along.
    expect(DeliveryAddressSchema.safeParse({ ...DOOR, lat: 22.8 }).success).toBe(false);
  });

  it('composes the one line older readers keep reading, without the name or the phone', () => {
    const line = addressText(DeliveryAddressSchema.parse(DOOR));
    expect(line).toBe('Flat 4B, Sunrise Towers, MG Road, Bistupur, Opposite the post office, Jamshedpur, Jharkhand 831001');
    expect(line).not.toMatch(/Somen|98765/);
    expect(addressText(DeliveryAddressSchema.parse(BARE))).toBe('Flat 4B, Sunrise Towers, MG Road, Jamshedpur, Jharkhand 831001');
  });

  it('has three pages, and the controller refuses a fourth', () => {
    expect([...ADDRESS_LABELS]).toEqual(['home', 'work', 'other']);
    const ctl = src('profile/profile.controller.ts');
    expect(ctl).toMatch(/@Put\('addresses\/:label'\)/);
    expect(ctl).toMatch(/new ZodValidationPipe\(DeliveryAddressSchema\)/);
    expect(ctl).toMatch(/if \(!\(ADDRESS_LABELS as readonly string\[\]\)\.includes\(label\)\)/);
  });
});

describe('what an order keeps of the door', () => {
  it('is a snapshot — label, name, phone and the line — and survives a bad or missing one', () => {
    const snap = snapshotOf({
      label: 'home', addressText: 'x', name: 'Somen', phone: '1', line1: null, line2: null, landmark: null,
      city: null, state: null, pincode: null, lat: null, lng: null,
    });
    expect(snap).toEqual({ label: 'home', name: 'Somen', phone: '1', addressText: 'x' });
    expect(parseAddress(JSON.stringify(snap))).toEqual(snap);
    expect(parseAddress(null)).toBeNull();
    expect(parseAddress(undefined)).toBeNull();
    expect(parseAddress('not json')).toBeNull();
    expect(parseAddress('{"label":"home"}')).toBeNull();
  });

  it('is written by both tills from the label the order carries, and read back with every order', () => {
    for (const f of ['beauty/beauty.service.ts', 'fitness/supplements/supplements.service.ts']) {
      const s = src(f);
      expect({ f, snap: /const door = dto\.addressLabel \? await this\.masterProfile\.addressSnapshot\(userId, dto\.addressLabel\) : null;/.test(s) }).toEqual({ f, snap: true });
      expect({ f, kept: /addressJson: door \? JSON\.stringify\(door\) : null/.test(s) }).toEqual({ f, kept: true });
      expect({ f, back: /address: parseAddress\(o\.addressJson\)/.test(s) }).toEqual({ f, back: true });
    }
    for (const f of ['beauty/dto/beauty.dto.ts', 'fitness/dto/supplements.dto.ts']) {
      expect({ f, dto: /addressLabel: z\.enum\(ADDRESS_LABELS\)\.optional\(\)/.test(src(f)) }).toEqual({ f, dto: true });
    }
  });

  it('the book mirrors home into the legacy profile line, as the local-services checkout always did', () => {
    const book = src('profile/master-profile.service.ts');
    expect(book).toMatch(/async saveAddress\(userId: string, label: AddressLabel, dto: DeliveryAddressDto\)/);
    expect(book).toMatch(/if \(label === 'home'\) \{\s*await swallow\(\s*px\.masterProfile\.upsert/);
    const migration = src('../prisma/migrations/20260907T120000_a_door_to_deliver_to/migration.sql');
    for (const col of ['name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode']) {
      expect(migration).toContain(`ALTER TABLE "SavedAddress" ADD COLUMN "${col}" TEXT;`);
    }
    expect(migration).toContain('ALTER TABLE "BeautyOrder" ADD COLUMN "addressJson" TEXT;');
    expect(migration).toContain('ALTER TABLE "SupplementOrder" ADD COLUMN "addressJson" TEXT;');
  });
});
