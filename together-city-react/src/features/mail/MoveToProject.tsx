import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useMailProjects, useFileThread, PROJECT_CAP, mailError } from './api';

/**
 * MOVE A CONVERSATION INTO A ROOM — the second of the two ways mail is ever
 * filed, and like the first it is something a person did.
 *
 * THE WHOLE THREAD, ALWAYS, and the sheet says how many messages that is
 * before it moves them. Half a trail in one room and half in another is not a
 * state anybody asked for; it is just what a per-message move produces the
 * first time somebody files one row of three.
 *
 * It never leaves All Email, and the line at the foot says so — the fear a
 * folder invites is that mail has gone somewhere it cannot be found again,
 * and the answer is one sentence rather than a help page.
 */
export function MoveToProject({ threadId, projectId, count, onDone }: {
  threadId: string; projectId?: string | null; count: number; onDone?: () => void;
}) {
  const q = useMailProjects();
  const file = useFileThread();
  const projects = (q.data ?? []).filter((p) => !p.archived);
  const [open, setOpen] = useState(false);
  const here = projects.find((p) => p.id === projectId);

  const move = (to: string | null) =>
    file.mutate({ threadId, projectId: to }, { onSuccess: () => { setOpen(false); onDone?.(); } });

  /* The panel hangs off the key rather than pushing the toolbar apart: this
     sits in a row of four buttons, and a sheet that opens IN that row moves
     Reply and Delete out from under the pointer that was heading for them. */
  return (
    <span className="mmove-wrap">
      {/* It opens a list of rooms to choose from, and it says so: without
          aria-haspopup and aria-expanded a screen reader announces a button
          that appears to do nothing. */}
      <Button variant="line" size="sm" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>
        {here ? `🗂 In ${here.name}` : '🗂 Move to project'}
      </Button>
      {open && (
      <div className="card mmove">
      <h3 className="mmove-h">Move this conversation</h3>
      <p className="muted mmove-hint">
        {count === 1 ? 'One message' : `All ${count} messages`}, and every reply from now on.
      </p>
      {/* A MOVE THAT WAS REFUSED LEFT THE SHEET OPEN AND THE ROW HIGHLIGHTED
          NOWHERE — indistinguishable from a press that did not register, so
          the citizen presses the same room again. The sheet stays open on
          failure, which is right: the choice they were making is still in
          front of them. */}
      {file.isError && (
        <p className="mail-mishap" role="alert">
          <span>⚠ {mailError(file.error, 'That conversation could not be moved.')}</span>{' '}
          <span className="muted">It is still filed where it was.</span>
        </p>
      )}
      {q.isError && (
        <p className="mail-mishap" role="alert">
          <span>⚠ Couldn’t load your projects.</span>{' '}
          <span className="muted">Nothing has been deleted — try again in a moment.</span>
        </p>
      )}
      {projects.length === 0 && !q.isError ? (
        <p className="muted mmove-hint" style={{ marginBottom: 10 }}>
          You have no projects yet. <Link to="/mail">Make one</Link> — up to {PROJECT_CAP}, and a project never hides mail.
        </p>
      ) : (
        <div className="mmove-opts">
          {projects.map((p) => (
            <button key={p.id} type="button" className={`mmove-opt${p.id === projectId ? ' on' : ''}`}
              disabled={file.isPending} onClick={() => move(p.id)}>
              <span className="mproj-dot" aria-hidden />
              <span className="mmove-opt-l">{p.name}</span>
              <span className="mmove-opt-k">{p.key}</span>
            </button>
          ))}
        </div>
      )}
      <p className="muted mmove-note">
        It stays in All Email either way — a project files a conversation, it never takes it out of your mailbox.
      </p>
      <div className="mmove-foot">
        {projectId && (
          <Button variant="line" size="sm" disabled={file.isPending} onClick={() => move(null)}>
            Take it out of {here?.name ?? 'the project'}
          </Button>
        )}
        <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      </div>
      )}
    </span>
  );
}
