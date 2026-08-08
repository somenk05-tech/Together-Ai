import type { CvKind, Visibility } from './api';

/**
 * The words this hub uses for the professional record, in one file.
 *
 * Not in the components, because three of them need the same names — the
 * editor's heading, the document's section heads and the review's card labels —
 * and three copies of "Certifications" is how one of them ends up saying
 * "Certificates". Not in api.ts either: the wire has `kind: 'certification'`
 * and always will; what a citizen reads is a separate decision.
 */

/**
 * A LINK OFF A CV IS NOT A LINK YET.
 *
 * Every url on this record arrives from one of two places, and neither is
 * trustworthy in the way an `href` needs: a model read it off a PDF, or a
 * citizen typed it into a box. `javascript:` and `data:` both parse as URLs and
 * both run when clicked, so the string is checked against the two schemes a
 * portfolio link is ever written in before it becomes an anchor.
 *
 * A bare "somen.dev" is the common case and gets https rather than a shrug —
 * refusing to link it would punish the ordinary way people write their own site
 * down. Anything that is not http or https after that comes back null and the
 * caller prints the text instead: the citizen still sees exactly what their CV
 * said, which is the honest failure. Silently dropping it would leave them
 * wondering where their portfolio went.
 */
export function webUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  // A scheme-relative "//host" is http(s) by inheritance, and a naked domain
  // has no scheme at all. Both become https before parsing; neither can
  // smuggle one in, because a string containing "://" already has its own.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/\//, '')}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Singular. This labels ONE thing rather than a section. */
export const KIND_ONE: Record<string, string> = {
  experience: 'Role', education: 'Qualification', project: 'Project',
  certification: 'Certification', award: 'Award', language: 'Language', link: 'Link',
};

/** Plural — a section head. */
export const KIND_MANY: Record<string, string> = {
  experience: 'Experience', education: 'Education', project: 'Projects',
  certification: 'Certifications', award: 'Awards', language: 'Languages', link: 'Links',
};

/** A kind nobody here has heard of still belongs to somebody, so it keeps its
 *  section and wears its own name rather than being dropped. */
export const sectionLabel = (kind: string): string =>
  KIND_MANY[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** What the two head fields are actually called for this kind. A degree has an
 *  institution, not an organisation, and a language has neither. */
export const FIELD_NAMES: Record<string, { title: string; org: string; qualifier: string }> = {
  experience: { title: 'Job title', org: 'Employer', qualifier: 'Team or function' },
  education: { title: 'Qualification', org: 'Institution', qualifier: 'Grade or result' },
  project: { title: 'Project', org: 'Made for', qualifier: 'Your part in it' },
  certification: { title: 'Certification', org: 'Issued by', qualifier: 'Reference number' },
  award: { title: 'Award', org: 'Given by', qualifier: 'What for' },
  language: { title: 'Language', org: 'Where you use it', qualifier: 'How well you speak it' },
  link: { title: 'What this is', org: 'Where it lives', qualifier: 'Anything worth adding' },
};
export const fieldNames = (kind: CvKind) =>
  FIELD_NAMES[kind] ?? { title: 'Title', org: 'Organisation', qualifier: 'Qualifier' };

/**
 * WHAT THE SETTINGS ACTUALLY SAY, in sentences.
 *
 * The Jobs profile used to print one promise unconditionally — "There's no
 * candidate directory, companies can't browse or search you". It is true of
 * somebody who has left everything private, which is the default and most
 * people, and it is a lie the moment they open their profile to recruiters. A
 * privacy note that contradicts the control above it is worse than no note: it
 * is the app telling somebody their details are safe while it publishes them.
 *
 * So the promise survives WORD FOR WORD for the citizens it is true of, and
 * everybody else is told what they have opened instead.
 */
export interface VisibilityAnswers {
  profileVisibility: Visibility;
  contactVisibility: Visibility;
  salaryVisibility: Visibility;
}

export const allPrivate = (p: VisibilityAnswers): boolean =>
  p.profileVisibility === 'private' && p.contactVisibility === 'private' && p.salaryVisibility === 'private';

export function whoCanSee(p: VisibilityAnswers): string[] {
  if (allPrivate(p)) {
    return [
      "There's no candidate directory — companies can't browse or search you.",
      'Your CV stays private until you apply to a role; only then does that one employer see your'
      + ' headline and the skills relevant to their job, never your raw CV.',
    ];
  }
  const who = (v: Visibility) => (v === 'recruiters' ? 'recruiters on Together City' : 'everyone on Together City');
  return [
    p.profileVisibility === 'private'
      ? 'Your profile is private — nobody can browse or search you.'
      : `Your profile can be found by ${who(p.profileVisibility)}.`,
    p.contactVisibility === 'private'
      ? 'Your contact details stay private.'
      : `Your contact details are shown to ${who(p.contactVisibility)}.`,
    p.salaryVisibility === 'private'
      ? 'What you earn and what you are asking for stay private, and are never shown.'
      : `What you earn and what you are asking for are shown to ${who(p.salaryVisibility)}.`,
  ];
}
