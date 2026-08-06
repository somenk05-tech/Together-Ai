import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListingForm } from '../ListingForm';
import { useCreateService } from '../api';

/**
 * LIST YOUR BUSINESS.
 *
 * The questions live in ListingForm, which the edit screen uses too — a
 * business is described the same way whether it is being created or corrected,
 * and two copies of that form would drift apart within a month.
 */
export function ListBusiness() {
  const nav = useNavigate();
  const create = useCreateService();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>List your business</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '60ch' }}>
        People nearby will find you by what you do and where you work. They message you
        without giving their name — you will see them as a neighbour, and the conversation
        stays inside this hub.
      </p>

      <ListingForm
        submitLabel="List my business" busyLabel="Listing…"
        pending={create.isPending} error={err}
        onCancel={() => nav('/services/browse')}
        onSubmit={(v) => {
          setErr(null);
          create.mutate({
            businessName: v.businessName,
            ...(v.slug ? { slug: v.slug } : {}),
            ...(v.businessType ? { businessType: v.businessType, details: v.details } : {}),
            categoryKey: v.categoryKey,
            about: v.about || undefined,
            city: v.city,
            areas: v.areas || undefined,
            phone: v.phone || undefined,
            priceFrom: v.priceFrom,
            ...(v.photoUrls.length ? { photoUrls: v.photoUrls } : {}),
            ...(v.lat != null ? { lat: v.lat, lng: v.lng } : {}),
            ...(v.radiusKm != null ? { radiusKm: v.radiusKm } : {}),
          }, {
            onSuccess: () => nav('/services/mine'),
            // The error the server actually gave, not a shrug. A form that says
            // "something went wrong" after somebody typed for four minutes is
            // how a listing silently never gets made.
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
