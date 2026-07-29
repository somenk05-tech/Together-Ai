import { useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import {
  useAvatarAsset, useAvatarOptions, useAvatarPreview, useAvatars,
  useCreateAvatar, useDeleteAvatar, useDeselectAvatar, useSelectAvatar,
  type Avatar, type AvatarInputs,
} from '../api';

/** 'hairColour' → 'Hair colour'. The API speaks camelCase; people don't. */
function label(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
/** 'darkBrown' → 'dark brown' */
function optionLabel(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').toLowerCase();
}

const CHOICE_KEYS = [
  'skinTone', 'hairStyle', 'hairColour', 'eyeColour',
  'facialHair', 'accessory', 'expression', 'background',
] as const;

function Choice({
  name, values, current, onPick,
}: { name: string; values: string[]; current: string; onPick: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="muted" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
        {label(name)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {values.map((v) => {
          const active = v === current;
          return (
            <button
              key={v}
              type="button"
              onClick={() => onPick(v)}
              aria-pressed={active}
              style={{
                border: `1px solid ${active ? 'var(--accent, #4a6fa5)' : 'var(--line)'}`,
                background: active ? 'var(--accent, #4a6fa5)' : 'transparent',
                color: active ? '#fff' : 'inherit',
                borderRadius: 999, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer',
              }}
            >
              {optionLabel(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One saved avatar. Its picture comes from a signed link that expires, so the
 *  query refetches rather than the URL being cached in a list payload. */
function SavedAvatar({
  avatar, onSelect, onDelete, busy,
}: { avatar: Avatar; onSelect: (id: string) => void; onDelete: (id: string) => void; busy: boolean }) {
  const asset = useAvatarAsset(avatar.id);
  return (
    <div
      className="card"
      style={{
        padding: 12, textAlign: 'center',
        outline: avatar.isSelected ? '2px solid var(--accent, #4a6fa5)' : 'none',
      }}
    >
      <div style={{ width: 96, height: 96, margin: '0 auto 8px' }}>
        {asset.data
          ? <img src={asset.data.url} alt="" width={96} height={96} style={{ borderRadius: '50%' }} />
          : <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--line)' }} />}
      </div>
      {avatar.isSelected && (
        <div style={{ fontSize: 11.5, marginBottom: 6, color: 'var(--accent, #4a6fa5)' }}>In use</div>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {!avatar.isSelected && (
          <Button size="sm" variant="line" disabled={busy} onClick={() => onSelect(avatar.id)}>Use</Button>
        )}
        <Button
          size="sm" variant="line" disabled={busy}
          style={{ color: '#c62828', borderColor: '#f0b0b0' }}
          onClick={() => { if (window.confirm('Delete this avatar?')) onDelete(avatar.id); }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

/**
 * Pick a face.
 *
 * Two things this page is careful about. It never implies a model drew the
 * result — the note under the preview says what actually made it, because the
 * backend reports that and pretending otherwise would be the easiest lie in the
 * app to tell. And it only previews live when the server says previews are free
 * (`previewable`), so the day a paid provider is bound this page stops
 * previewing on every click instead of quietly running up a bill.
 */
export function Avatars() {
  const options = useAvatarOptions();
  const saved = useAvatars();
  const create = useCreateAvatar();
  const select = useSelectAvatar();
  const deselect = useDeselectAvatar();
  const remove = useDeleteAvatar();

  const [choices, setChoices] = useState<AvatarInputs | null>(null);
  const current = useMemo<AvatarInputs>(
    () => choices ?? options.data?.defaults ?? {},
    [choices, options.data],
  );

  const canPreview = Boolean(options.data?.previewable) && Object.keys(current).length > 0;
  const preview = useAvatarPreview(current, canPreview);

  if (options.isLoading) return <Spinner />;
  if (!options.data) return <EmptyState title="Avatars are unavailable right now." />;

  const pick = (key: string, value: string) => setChoices({ ...current, [key]: value });
  const busy = create.isPending || select.isPending || remove.isPending || deselect.isPending;
  const inUse = saved.data?.find((a) => a.isSelected);

  return (
    <div style={{ padding: '0 4px 40px' }}>
      <PageHeader
        eyebrow="Profile"
        title="Your avatar"
        sub="Choose a face to use beside your name and in calls."
      />

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(200px, 260px) 1fr', alignItems: 'start' }}>
        <div className="card" style={{ padding: 18, textAlign: 'center', position: 'sticky', top: 12 }}>
          <div style={{ width: 160, height: 160, margin: '0 auto' }}>
            {preview.data
              ? <img src={preview.data.dataUrl} alt="Avatar preview" width={160} height={160} />
              : <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'var(--line)' }} />}
          </div>

          {/* Never let a screen imply a model drew this. */}
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.5, margin: '10px 0 0' }}>
            {options.data.generatedBy === 'deterministic'
              ? 'Drawn from your choices. No AI is involved.'
              : 'Generated by an image model from your choices.'}
          </p>
          {!options.data.previewable && (
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
              Live preview is off for this provider — save to see the result.
            </p>
          )}

          <Button
            style={{ marginTop: 12, width: '100%' }}
            disabled={busy}
            onClick={() => create.mutate(current)}
          >
            {create.isPending ? 'Saving…' : 'Save this avatar'}
          </Button>
          {create.isError && (
            <p style={{ color: '#c62828', fontSize: 12, margin: '8px 0 0' }}>
              {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'That could not be saved.'}
            </p>
          )}
        </div>

        <div>
          {CHOICE_KEYS.map((key) => (
            <Choice
              key={key}
              name={key}
              values={(options.data as unknown as Record<string, string[]>)[key] ?? []}
              current={current[key] ?? ''}
              onPick={(v) => pick(key, v)}
            />
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: 15, margin: '28px 0 12px' }}>Saved</h2>
      {saved.isLoading && <Spinner />}
      {saved.data?.length === 0 && (
        <EmptyState title="No avatars yet." hint="Pick some options above and save one." />
      )}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {saved.data?.map((a) => (
          <SavedAvatar
            key={a.id}
            avatar={a}
            busy={busy}
            onSelect={(id) => select.mutate(id)}
            onDelete={(id) => remove.mutate(id)}
          />
        ))}
      </div>
      {inUse && (
        <Button
          size="sm" variant="line" style={{ marginTop: 14 }} disabled={busy}
          onClick={() => deselect.mutate()}
        >
          Use my photo instead
        </Button>
      )}
    </div>
  );
}
