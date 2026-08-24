import { useState } from 'react';
import { Button } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useMenu, useScanMenu, useSaveMenu, menuPhotoToDataUrl, type MenuDraftItem } from './api';

/**
 * THE OWNER'S MENU: PHOTOGRAPH IT, TYPE IT, OR CHANGE IT LATER.
 *
 * Three ways in, one grid out. Whether the lines arrived from a photograph,
 * from the owner typing them, or from the menu that is already live, they land
 * in the same editable rows and nothing is stored until save is pressed.
 *
 * That review step is not a formality — it is the feature. An extraction that
 * writes straight to the menu looks like magic in a demo and produces a
 * business held to a price a model misread: ₹180 read as ₹160 is twenty rupees
 * a plate, discovered by an argument at a table. So the reader PROPOSES. The
 * server enforces the same split — `scanMenu` has no write path at all.
 *
 * Editing matters as much as adding. Prices move, a dish comes off, a new one
 * goes on — and needing the printed menu back out of the drawer to change one
 * number is how a menu goes stale and stops being worth reading. So "Edit"
 * loads what is live into the same rows.
 *
 * A price the owner cannot state arrives EMPTY rather than as zero. An empty
 * field asks to be filled; a ₹0 is a wrong number that looks like a decision,
 * and the difference is whether anybody notices.
 *
 * The photograph is kept alongside the typed menu so anyone can check the
 * transcription against the original — and an edit that never mentions the
 * photo leaves it alone, because omitted is not the same as cleared.
 */
const cell: React.CSSProperties = {
  padding: '7px 9px', border: '1.5px solid var(--line)', borderRadius: 9,
  fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', width: '100%', boxSizing: 'border-box',
};

const BLANK: MenuDraftItem = { name: '', priceInr: null };

export function MenuEditor({ listingId }: { listingId: string }) {
  const live = useMenu(listingId);
  const scan = useScanMenu(listingId);
  const save = useSaveMenu(listingId);

  const [draft, setDraft] = useState<MenuDraftItem[] | null>(null);
  const [note, setNote] = useState('');
  const [scanUrl, setScanUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const count = live.data?.count ?? 0;

  const begin = (items: MenuDraftItem[], from?: string) => {
    setErr(null); setNote(from ?? ''); setScanUrl(undefined); setDraft(items); setOpen(true);
  };

  /** The live menu, flattened back into editable lines — WITH their ids, so
   *  publishing an edit updates each line in place and everything this editor
   *  does not show (sold-out switches, photos, sizes, add-ons, prep times)
   *  survives a corrected price. A line added here has no id and is new. */
  const editLive = () =>
    begin(
      (live.data?.sections ?? []).flatMap((s) =>
        s.items.map((i) => ({
          id: i.id,
          name: i.name,
          section: s.section ?? undefined,
          description: i.description ?? undefined,
          priceInr: i.priceInr,
        })),
      ),
    );

  const readMenu = async (file?: File | null) => {
    if (!file) return;
    setErr(null); setBusy(true);
    try {
      // Two uploads of the same picture, on purpose: the data URL goes to the
      // reader, and a stored copy stays with the listing so the transcription
      // can be checked against the original later.
      const [dataUrl, stored] = await Promise.all([menuPhotoToDataUrl(file), mediaApi.upload(file)]);
      const out = await scan.mutateAsync(dataUrl);
      setScanUrl(stored);
      setDraft(out.items);
      setNote(out.note);
      if (out.items.length === 0) setErr(out.note || 'Nothing readable in that photo.');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErr(msg ?? uploadErrorMessage(e));
    } finally { setBusy(false); }
  };

  const patch = (i: number, next: Partial<MenuDraftItem>) =>
    setDraft((d) => (d ? d.map((it, n) => (n === i ? { ...it, ...next } : it)) : d));

  const stop = () => { setDraft(null); setNote(''); setScanUrl(undefined); setErr(null); setOpen(false); };

  const publish = () => {
    if (!draft) return;
    const clean = draft.filter((d) => d.name.trim());
    // scanUrl stays undefined unless this pass came from a photograph — the
    // server treats undefined as "leave the picture where it was".
    save.mutate({ scanUrl, items: clean }, { onSuccess: stop });
  };

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13.5 }}>Menu</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {count === 0 ? 'Nothing published' : `${count} ${count === 1 ? 'item' : 'items'} live`}
        </span>
        {draft ? (
          <Button variant="line" size="sm" onClick={stop}>Cancel</Button>
        ) : count > 0 ? (
          <>
            <Button variant="line" size="sm" onClick={editLive}>Edit</Button>
            <Button variant="line" size="sm" onClick={() => { setOpen((v) => !v); setErr(null); }}>
              {open ? 'Close' : 'Photograph a new one'}
            </Button>
          </>
        ) : (
          <Button variant="line" size="sm" onClick={() => { setOpen((v) => !v); setErr(null); }}>
            {open ? 'Cancel' : 'Add a menu'}
          </Button>
        )}
      </div>

      {open && !draft && (
        <div style={{ marginTop: 10 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
            Photograph your menu and it will be typed out for you. You check every line before
            anything is published — nothing is saved until you say so.
          </p>
          <input type="file" accept="image/*" disabled={busy}
            aria-label="Photograph of your menu"
            onChange={(e) => { void readMenu(e.target.files?.[0]); e.target.value = ''; }}
            style={{ fontSize: 13, fontFamily: 'inherit' }} />
          {busy && <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Reading the menu…</p>}
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '6px 0 0' }} role="alert">{err}</p>}
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 6px' }}>
            No photograph handy? Type it out instead.
          </p>
          <Button variant="line" size="sm" disabled={busy} onClick={() => begin([{ ...BLANK }])}>
            Type the menu out
          </Button>
        </div>
      )}

      {draft && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12.5, margin: '0 0 4px', fontWeight: 700 }}>
            {scanUrl ? 'Read from your photo — check every price before publishing.' : 'Change anything, then publish.'}
          </p>
          {note && <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>{note}</p>}

          <div style={{ display: 'grid', gap: 10 }}>
            {draft.map((it, i) => (
              <div key={i} className="menu-edit-row">
                <input style={cell} className="menu-edit-name" value={it.name} aria-label={`Item ${i + 1} name`}
                  placeholder="Item" onChange={(e) => patch(i, { name: e.target.value })} maxLength={90} />
                <input style={cell} value={it.section ?? ''} aria-label={`Item ${i + 1} section`} placeholder="Section"
                  onChange={(e) => patch(i, { section: e.target.value || undefined })} maxLength={60} />
                <input style={cell} inputMode="numeric" aria-label={`Item ${i + 1} price in rupees`}
                  placeholder="Ask" value={it.priceInr == null ? '' : String(it.priceInr)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d]/g, '');
                    patch(i, { priceInr: raw === '' ? null : Number(raw) });
                  }} maxLength={6} />
                <button type="button" aria-label={it.name ? `Remove ${it.name}` : `Remove item ${i + 1}`}
                  onClick={() => setDraft((d) => (d ? d.filter((_, n) => n !== i) : d))}
                  style={{ minWidth: 34, minHeight: 44, background: 'none', border: 0, cursor: 'pointer', color: 'var(--muted)', fontFamily: 'inherit', fontSize: 15 }}>×</button>
                <input style={cell} className="menu-edit-desc" value={it.description ?? ''}
                  aria-label={`Item ${i + 1} description`} placeholder="Description (optional)"
                  onChange={(e) => patch(i, { description: e.target.value || undefined })} maxLength={160} />
              </div>
            ))}
          </div>

          <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
            A blank price shows as “Ask” rather than as free. Publishing replaces the whole menu
            with these lines.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button variant="accent" size="sm" disabled={save.isPending || draft.every((d) => !d.name.trim())} onClick={publish}>
              {save.isPending ? 'Publishing…' : `Publish ${draft.length} ${draft.length === 1 ? 'item' : 'items'}`}
            </Button>
            <Button variant="line" size="sm" onClick={() => setDraft((d) => (d ? [...d, { ...BLANK }] : d))}>Add a line</Button>
            <Button variant="line" size="sm" onClick={stop}>Discard</Button>
          </div>
          {err && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, margin: '8px 0 0' }} role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
