import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Spinner, EmptyState, Button } from '@/components/ui';
import { ListingForm } from '../ListingForm';
import { useMyServices, useUpdateService } from '../api';

/**
 * EDIT THE WHOLE PAGE, INCLUDING THE NAME.
 *
 * The PATCH endpoint has taken every field since the hub shipped; there was
 * simply no screen calling it, so a shop that opened as "salon" stayed "salon"
 * and a business that moved could not say so. Owning a listing you cannot
 * correct is worse than not having one — a wrong address in a directory sends
 * people to the wrong door.
 *
 * It starts from the listing as it actually is rather than from an empty form.
 * A pre-filled field is a decision the owner already made and does not have to
 * make again; a blank one is a question they will answer differently under
 * time pressure, and the answer that reaches the database is the new one.
 */
export function EditBusiness() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const mine = useMyServices();
  const update = useUpdateService(id);
  const [err, setErr] = useState<string | null>(null);

  if (mine.isLoading) return <Spinner label="Loading your listing…" />;
  if (mine.isError) {
    return <EmptyState title="Couldn't load your listing"
      hint="The form starts from what you already wrote, so it waits rather than showing you a blank page. Try again in a moment." />;
  }

  const listing = (mine.data ?? []).find((l) => l.id === id);
  // Not "no listings". This is one specific listing that is not among the
  // caller's own, and saying so is the difference between a bug report and a
  // shrug.
  if (!listing) {
    return (
      <EmptyState title="That listing is not one of yours"
        hint="You can only edit a business you put up yourself."
        action={<Button variant="line" onClick={() => nav('/services/mine')}>Back to my business</Button>} />
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>Edit your business</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '60ch' }}>
        Everything here can change — the name, what you do, where you are, your photos.
        Your messages and the people who kept you stay exactly as they are.
      </p>

      <ListingForm
        initial={listing}
        submitLabel="Save changes" busyLabel="Saving…"
        pending={update.isPending} error={err}
        onCancel={() => nav('/services/mine')}
        onSubmit={(v) => {
          setErr(null);
          update.mutate(v, {
            onSuccess: () => nav('/services/mine'),
            onError: (e: unknown) => {
              const m = e as { response?: { data?: { message?: string | string[] } } };
              const raw = m?.response?.data?.message;
              setErr(Array.isArray(raw) ? raw.join(', ') : raw ?? 'Could not save that. Check the fields and try again.');
            },
          });
        }}
      />
    </div>
  );
}
