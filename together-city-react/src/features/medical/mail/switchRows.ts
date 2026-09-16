import type { MedicalMailSettings as Settings } from './api';

/** The switches, in the citizen's own words. Shared with Privacy & Consent. */
export function switchRows(s: Settings, set: (patch: Partial<Pick<Settings, 'status' | 'processDocuments' | 'aiAnalysis' | 'autoLink' | 'classifyEmails' | 'notify'>>) => void, brief = false): Array<[string, string, boolean, (v: boolean) => void]> {
  return [
    ['Medical Mail enabled', brief ? 'Receive mail at your medical address.' : 'Receive mail at your medical address. Off pauses it — the address is kept, new mail is refused.', s.status === 'active', (v) => set({ status: v ? 'active' : 'paused' })],
    ['Email classification', brief ? 'Read arriving mail to say what kind it is.' : 'Read the sender, subject, body and attachment names to say what kind of medical mail it is, and flag ordinary mail that looks medical. Nothing is moved without you.', s.classifyEmails, (v) => set({ classifyEmails: v })],
    ['Medical document processing', brief ? 'Read attachments and file them in Health Records.' : 'Read each attachment and file it in the right Health Records folder — the same reader the Upload button uses. Off keeps files with their email, unfiled until you save them.', s.processDocuments, (v) => set({ processDocuments: v })],
    ['Automatic record linking', brief ? 'Keep documents linked to their email and on your timeline.' : 'Keep every filed document linked to the email it arrived in, and put it on your medical timeline.', s.autoLink, (v) => set({ autoLink: v })],
    ['AI medical analysis', brief ? 'Allow “Analyze” on a mailed document.' : 'Allow “Analyze” on a document — the existing Record Analysis, labelled as AI-generated and never a diagnosis.', s.aiAnalysis, (v) => set({ aiAnalysis: v })],
    ...(brief ? [] : [['Notifications', 'Tell you a medical message arrived. The alert never says what it is — a lock screen is a shared screen.', s.notify, (v: boolean) => set({ notify: v })] as [string, string, boolean, (v: boolean) => void]]),
  ];
}
