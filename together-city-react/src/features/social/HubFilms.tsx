import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { http } from '@/api/client';
import { useAuthStore } from '@/store/auth.store';

/**
 * ── A HUB SHOWS ITS OWN FILMS (owner, 17 Sep) ───────────────────────────────
 *
 * "Connect dating with dating site, health with health." Under a hub's landing,
 * the latest films the media desk sent out for that hub's topic: the Dating
 * landing shows the Dating channel's, Health and Nutrition show the Health
 * channel's (broadcast/topics.ts on the API decides which). A card opens the
 * film on Together TV when the city has a public copy, and otherwise offers
 * the platforms it is live on. Nothing is drawn until there is something to
 * show — an empty strip under a billboard is furniture.
 */

interface Film {
  id: string;
  title: string;
  createdAt: string;
  tvPostId: string | null;
  youtubeUrl: string | null;
  instagramUrl: string | null;
  threadsUrl: string | null;
  thumb: string | null;
}
interface Shelf { topic: { key: string; label: string; youtube: string } | null; items: Film[] }

export function HubFilms({ hub }: { hub: string }) {
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const q = useQuery({
    queryKey: ['hub-videos', hub],
    queryFn: () => http.get<Shelf>(`/hub-videos/${hub}`).then((r) => r.data),
    enabled: authed,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const shelf = q.data;
  if (!shelf?.topic || shelf.items.length === 0) return null;
  return (
    <section className="md-films" aria-label={`${shelf.topic.label} films`}>
      <h2 className="md-h">From our {shelf.topic.label} channel</h2>
      <div className="md-films-row">
        {shelf.items.map((f) => (
          <article key={f.id} className="card md-film">
            {f.tvPostId ? (
              <Link to={`/social/p/${f.tvPostId}`} className="md-film">
                {f.thumb && <img className="no-case" src={f.thumb} alt="" loading="lazy" />}
                <span className="md-film-title">{f.title}</span>
              </Link>
            ) : (
              <span className="md-film-title">{f.title}</span>
            )}
            <span className="md-film-links">
              {f.youtubeUrl && <a className="md-link" href={f.youtubeUrl} target="_blank" rel="noreferrer">YouTube</a>}
              {f.instagramUrl && <a className="md-link" href={f.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}
              {f.threadsUrl && <a className="md-link" href={f.threadsUrl} target="_blank" rel="noreferrer">Threads</a>}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
