// Together City — Legal & Policy Library content model.
// Company: Collective AI Private Limited ("the Company"). Brand: Together City.
// Ported from the supplied legaldata.js. Templates written to a publishable
// standard; review by an Indian technology lawyer required before launch.
// [TO-FILL] marks details you supply.

export interface PolicySection { h: string; html: string; }
export interface Policy {
  title: string;
  short: string;
  eff: string;
  drafted?: boolean;
  tldr: string[];
  sections: PolicySection[];
  related: string[];
}
export interface Volume { id: string; roman: string; title: string; desc: string; policies: string[]; }

export const CO = {
  company: 'Collective AI Private Limited',
  brand: 'Together City',
  domain: 'togethercity.app',
  cin: '[TO-FILL: CIN]',
  office: '[TO-FILL: Registered office address, Mumbai, Maharashtra]',
  jurisdiction: 'Mumbai, Maharashtra, India',
  grievanceOfficer: '[TO-FILL: Grievance Officer name]',
  grievanceEmail: 'grievance@togethercity.tech',
  support: 'support@togethercity.tech',
  privacyEmail: 'privacy@togethercity.tech',
  dpo: '[TO-FILL: Data Protection Officer / contact]',
  updated: '16 July 2026',
};

const tf = (s: string) => `<span class="tf">${s}</span>`;
const li = (arr: string[]) => `<ul>${arr.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const note = (s: string) => `<div class="note">${s}</div>`;

// ---- FULL DRAFTED POLICIES -------------------------------------------------

const P: Record<string, Policy> = {};

P.terms = {
  title: 'Terms of Service',
  short: 'The master agreement governing your use of Together City.',
  eff: CO.updated,
  tldr: [
    'By using Together City you agree to these Terms and all policies linked here.',
    'You must be 18 or older. One account per person; keep your login secure.',
    "You own what you post but grant us a licence to operate the service; don't post unlawful content.",
    'Many hubs (travel, restaurants, shopping, medical) connect you to third parties — we are an intermediary, not the seller or provider.',
    'Disputes are governed by Indian law, seated in Mumbai; a grievance officer handles complaints.',
  ],
  sections: [
    { h: '1. Who we are and what these Terms cover', html:
      `<p>These Terms of Service ("Terms") are a legally binding agreement between you and ${CO.company} ("${CO.brand}", "we", "us"), operator of the ${CO.brand} platform, mobile applications, and website at ${CO.domain} (together, the "Platform"). CIN: ${tf(CO.cin)}. Registered office: ${tf(CO.office)}.</p>
      <p>These Terms are published as an electronic record under the Information Technology Act, 2000 and the applicable rules, and do not require any physical or digital signature. By creating an account, accessing, or using the Platform you accept these Terms and every policy incorporated by reference, including our Privacy Policy, Community Guidelines, and hub-specific terms.</p>` },
    { h: '2. Eligibility', html:
      `<p>The Platform is intended solely for persons who are 18 years of age or older and competent to contract under the Indian Contract Act, 1872. You represent that you meet these requirements.</p>
      ${li(['You may not use the Platform if you are barred under any applicable law or previously removed by us.', 'Certain hubs (e.g. the Matchmaking District) require additional age and identity confirmation.', 'We may verify your identity and refuse, suspend, or terminate access at our discretion where the law or safety requires.'])}` },
    { h: '3. Your account', html:
      `<p>You are responsible for maintaining the confidentiality of your credentials and for all activity under your account.</p>
      ${li(['Provide accurate, current information and keep it updated.', 'One account per person unless we expressly permit otherwise.', 'Notify us immediately at ' + CO.support + ' of any unauthorised use.', 'We may offer two-factor authentication; we recommend you enable it.'])}` },
    { h: '4. The Platform is a multi-hub intermediary', html:
      `<p>${CO.brand} brings together social, dating, AI, medical, nutrition, restaurants, travel, e-commerce, financial, and creator features. For many of these we act as an <strong>intermediary</strong> under the IT Act, connecting you to independent third parties (sellers, restaurants, hotels, labs, creators, payment providers).</p>
      ${note('Except where we expressly say we are the seller or provider, contracts for goods, services, bookings, and diagnostics are between you and the relevant third party. We are not a party to those contracts and do not guarantee third-party performance.')}` },
    { h: '5. Acceptable use', html:
      `<p>You agree not to, and not to permit others to:</p>
      ${li(['Post or transmit content that is unlawful, defamatory, obscene, infringing, harassing, or that harms minors;', 'Impersonate any person, misrepresent your identity, or create fake or automated accounts;', 'Interfere with, scrape, reverse-engineer, or overload the Platform, or bypass security or rate limits;', 'Use the Platform for fraud, money laundering, spam, or to violate any Indian law;', 'Present AI outputs as professional medical, legal, or financial advice.'])}
      <p>Detailed rules are in our Community Guidelines and Content Moderation Policy.</p>` },
    { h: '6. Your content and the licence you grant', html:
      `<p>You retain ownership of content you create and post ("User Content"). To operate the Platform you grant us the licence set out in the User Content Licence (worldwide, non-exclusive, royalty-free, to host, store, reproduce, adapt for formatting, and display your content for the purpose of providing and promoting the service).</p>
      <p>You are solely responsible for your User Content and confirm you have the rights to post it. We may remove content that breaches these Terms or the law.</p>` },
    { h: '7. Payments, subscriptions, and refunds', html:
      `<p>Paid features (memberships such as Together+, bookings, purchases, creator payouts) are governed by our Payment & Subscription Terms and Refund, Cancellation & Return Policy. Payments are processed by RBI-authorised payment partners; we do not store full card details.</p>` },
    { h: '8. AI features', html:
      `<p>The Platform uses artificial intelligence to generate recommendations and content. AI outputs may be inaccurate and are provided for information only. Your use of AI features is governed by our AI Usage Policy and the AI, Medical, and Nutrition disclaimers.</p>` },
    { h: '9. Intellectual property', html:
      `<p>The Platform, including the ${CO.brand} name, logo, software, design, and AI prompts, is owned by or licensed to the Company and protected by intellectual-property law. Except for the limited right to use the Platform under these Terms, no rights are granted to you.</p>` },
    { h: '10. Suspension and termination', html:
      `<p>You may stop using the Platform and delete your account at any time (see Data Deletion). We may suspend or terminate your access, with or without notice, if you breach these Terms, create risk to others, or where required by law. Sections that by their nature survive termination (e.g. IP, liability, dispute resolution) will continue to apply.</p>` },
    { h: '11. Disclaimers and limitation of liability', html:
      `<p>The Platform is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, we disclaim implied warranties and are not liable for indirect, incidental, or consequential losses, or for the acts of third-party providers.</p>
      ${note('Nothing in these Terms limits liability that cannot be excluded under Indian law, including under the Consumer Protection Act, 2019.')}` },
    { h: '12. Indemnity', html:
      `<p>You agree to indemnify and hold the Company harmless from claims arising out of your User Content, your breach of these Terms, or your violation of any law or third-party right.</p>` },
    { h: '13. Grievance redressal', html:
      `<p>Complaints about content or the Platform may be sent to our Grievance Officer, ${tf(CO.grievanceOfficer)}, at ${CO.grievanceEmail}, who will acknowledge within 24 hours and resolve within the timelines set in our Grievance Redressal Policy.</p>` },
    { h: '14. Governing law and dispute resolution', html:
      `<p>These Terms are governed by the laws of India. Subject to the arbitration provision below, courts at ${CO.jurisdiction} have exclusive jurisdiction. Disputes may be referred to arbitration by a sole arbitrator under the Arbitration and Conciliation Act, 1996, seated in Mumbai, in English.</p>` },
    { h: '15. Changes to these Terms', html:
      `<p>We may update these Terms. Material changes will be notified in-app or by email. Continued use after changes take effect constitutes acceptance.</p>` },
  ],
  related: ['privacy', 'community', 'payments', 'grievance', 'ai'],
};

P.privacy = {
  title: 'Privacy Policy',
  short: 'How we collect, use, and protect your personal data under the DPDP Act.',
  eff: CO.updated,
  tldr: [
    'We collect only what we need to run the hubs you use, and we ask for your consent.',
    'Health data, chats, and location get extra protection and are never sold.',
    'You can access, correct, download, or delete your data at any time.',
    'We are the Data Fiduciary; contact our DPO for any privacy request.',
  ],
  sections: [
    { h: '1. Scope and our role', html:
      `<p>This Privacy Policy explains how ${CO.company} ("Data Fiduciary") handles your personal data when you use ${CO.brand}. It is issued under the Digital Personal Data Protection Act, 2023 ("DPDP Act"), the Information Technology Act, 2000, and applicable rules. By using the Platform you consent to this Policy.</p>` },
    { h: '2. Data we collect', html:
      `<p>Depending on the hubs you use, we may collect:</p>
      ${li(['<strong>Identity & contact:</strong> name, phone, email, date of birth, profile photo;', '<strong>Account & usage:</strong> handle, preferences, device and log data, cookies;', '<strong>Sensitive/health data:</strong> blood reports, biomarkers, nutrition and beauty profiles, prescriptions (Medical Hub is the single source of truth);', '<strong>Location:</strong> where you enable geo features (e.g. social map, restaurants, travel);', '<strong>Content:</strong> posts, chats, media, reviews;', '<strong>Transaction data:</strong> orders, bookings, payments (handled by our payment partners);', '<strong>Relationship data:</strong> matchmaking profile and compatibility inputs (stored locally to your account where feasible).'])}` },
    { h: '3. Purposes and legal basis', html:
      `<p>We process personal data on the basis of your consent, or where processing is necessary for a legitimate use permitted by the DPDP Act, to:</p>
      ${li(['Create and operate your account and the hubs you use;', 'Personalise recommendations (food, restaurants, travel, matches, beauty, medical insights);', 'Process payments, bookings, and creator payouts;', 'Keep the Platform safe, prevent fraud, and moderate content;', 'Comply with law and respond to lawful requests.'])}` },
    { h: '4. Consent and your control', html:
      `<p>We seek clear, specific, and informed consent before processing your data, and separately before processing sensitive categories such as health data. You may withdraw consent at any time; withdrawal does not affect prior lawful processing but may limit features.</p>
      ${note('Consent Manager: manage granular permissions (health sharing, location, marketing, cross-hub connections) from Settings → Privacy at any time.')}` },
    { h: '5. Health and medical data', html:
      `<p>Health data is processed only with your explicit consent and used to power Nutrition, Beauty, and Medical features you turn on. It is encrypted, never sold, and shared across hubs only by reference with your consent. You may withdraw sharing or delete health data at any time.</p>` },
    { h: '6. Children', html:
      `<p>The Platform is restricted to users 18 and older. We do not knowingly process the personal data of children. If we learn that a minor has registered, we will delete the account and associated data. See our Child Safety & Minor Protection Policy.</p>` },
    { h: '7. Sharing and disclosure', html:
      `<p>We share personal data only as needed:</p>
      ${li(['With third-party providers you transact with (sellers, restaurants, hotels, labs, creators) to fulfil your request;', 'With processors (Data Processors) who act on our instructions under contract;', 'With payment partners and, where required, regulators and law-enforcement under a valid legal request;', 'In a business transfer, subject to this Policy.'])}
      <p>We do not sell your personal data.</p>` },
    { h: '8. Security', html:
      `<p>We apply reasonable security safeguards: encryption in transit and at rest for sensitive data, access controls, hashing of passwords, rate limiting, audit logs, and periodic security testing. See our Security Policy. No system is perfectly secure; we will notify you and the Data Protection Board of any breach as required.</p>` },
    { h: '9. Retention', html:
      `<p>We keep personal data only for as long as necessary for the purposes above or as required by law, then delete or anonymise it. See our Data Retention Policy for category-wise periods.</p>` },
    { h: '10. Your rights', html:
      `<p>Subject to the DPDP Act, you may:</p>
      ${li(['Access a summary of your personal data and how it is processed;', 'Correct or update inaccurate data;', 'Download your data (“Download My Data”);', 'Delete your data / erase your account (“Delete Account”);', 'Nominate another person to exercise your rights;', 'Withdraw consent and lodge a grievance.'])}
      <p>Exercise these via Settings or by writing to ${CO.privacyEmail}.</p>` },
    { h: '11. Data Protection Officer & grievances', html:
      `<p>Data Protection Officer / contact: ${tf(CO.dpo)}, ${CO.privacyEmail}. Unresolved concerns may be escalated to our Grievance Officer and to the Data Protection Board of India.</p>` },
    { h: '12. Changes', html:
      `<p>We will notify you of material changes to this Policy in-app or by email.</p>` },
  ],
  related: ['cookies', 'retention', 'deletion', 'child', 'medical', 'security'],
};

P.cookies = {
  title: 'Cookie Policy',
  short: 'How we use cookies and similar technologies.',
  eff: CO.updated,
  tldr: [
    'We use essential cookies to run the site and optional ones for analytics and preferences.',
    'You can manage non-essential cookies from the consent banner or your browser.',
  ],
  sections: [
    { h: '1. What cookies are', html:
      `<p>Cookies and similar technologies (local storage, pixels) are small data files stored on your device that help the Platform function and remember your choices.</p>` },
    { h: '2. Types we use', html:
      li([
        '<strong>Strictly necessary:</strong> authentication, security, load balancing, cart/session state — these cannot be switched off.',
        '<strong>Preference:</strong> remember your hub settings, language, and profile.',
        '<strong>Analytics:</strong> understand usage to improve features (aggregated where possible).',
        '<strong>Advertising/attribution:</strong> only if enabled; used to measure campaigns and limit repetition.',
      ]) },
    { h: '3. Managing cookies', html:
      `<p>On first visit we show a consent banner for non-essential cookies. You can change your choices anytime in Settings → Privacy, or block cookies in your browser (some features may stop working).</p>` },
    { h: '4. Third-party cookies', html:
      `<p>Some embedded services (maps, video, payments) may set their own cookies governed by their policies. We disable optional third-party embeds until you consent where required.</p>` },
    { h: '5. Changes', html: `<p>We will update this Policy as our use of cookies changes.</p>` },
  ],
  related: ['privacy', 'retention'],
};

P.ai = {
  title: 'AI Usage Policy & Disclaimer',
  short: "How Together City's AI works, its limits, and your responsibilities.",
  eff: CO.updated,
  tldr: [
    'AI powers recommendations across food, restaurants, dating, travel, shopping, beauty, and health insights.',
    'AI can be wrong. It is informational only — not professional medical, legal, or financial advice.',
    'We label AI interactions and AI-generated content, and provide human-review paths for sensitive matters.',
  ],
  sections: [
    { h: '1. Where we use AI', html:
      `<p>${CO.brand} uses artificial intelligence and automated systems to generate meal plans, restaurant and travel suggestions, dating compatibility scores, beauty routines, shopping picks, and health-related insights, and to assist moderation.</p>` },
    { h: '2. AI is informational, not professional advice', html:
      `${note('AI outputs are generated automatically and may be inaccurate, incomplete, or unsuitable for your circumstances. They do not constitute medical, nutritional, legal, financial, or professional advice, and do not create a professional relationship.')}
      <p>Always use your own judgement and consult a qualified professional (doctor, dietitian, lawyer, advisor) before acting on AI output, especially for health, safety, money, or legal matters. See the Medical and Nutrition disclaimers.</p>` },
    { h: '3. Transparency and labelling', html:
      `<p>We make clear when you are interacting with an AI system, and label AI-generated or AI-assisted content where appropriate. We take steps to prevent harmful synthetic media and deepfakes in line with applicable Indian rules.</p>` },
    { h: '4. Human oversight', html:
      `<p>For sensitive matters (health insights, moderation decisions, account actions) we provide human-review pathways. You can request human review of an automated decision that significantly affects you by contacting ${CO.support}.</p>` },
    { h: '5. Your responsibilities', html:
      li([
        'Do not rely on AI as a substitute for professional advice;',
        "Do not use AI features to generate unlawful, deceptive, or harmful content, or deepfakes of real people without consent;",
        "Do not input others' personal or health data without authority;",
        'Label content you publish that you created with AI where our tools or the law require it.',
      ]) },
    { h: '6. Data used to power AI', html:
      `<p>AI features use the data described in our Privacy Policy, with your consent, and only for the hubs you enable. We apply safeguards against unfair or discriminatory outputs and continuously review them.</p>` },
    { h: '7. Limitation', html:
      `<p>To the extent permitted by law, we are not liable for decisions you make based on AI outputs. This Policy supplements, and is subject to, our Terms of Service.</p>` },
  ],
  related: ['medical', 'nutrition', 'terms', 'moderation'],
};

P.community = {
  title: 'Community Guidelines',
  short: 'The rules that keep Together City safe, respectful, and authentic.',
  eff: CO.updated,
  tldr: [
    'Be respectful and authentic; no harassment, hate, or dangerous content.',
    "No unlawful, sexual-exploitation, or misleading content; protect others' privacy.",
    'You can report, block, mute, and appeal. Violations lead to removal or account action.',
  ],
  sections: [
    { h: '1. Our expectations', html:
      `<p>${CO.brand} connects millions of people across social, dating, creator, and marketplace features. These Guidelines apply to all content and behaviour on the Platform and work alongside our Terms and Content Moderation Policy.</p>` },
    { h: '2. Content that is not allowed', html:
      li([
        'Illegal content, or content that promotes illegal acts;',
        'Child sexual abuse material or any content that sexualises minors (zero tolerance; reported to authorities);',
        'Harassment, bullying, threats, doxxing, or coordinated abuse;',
        'Hate speech or incitement based on religion, caste, gender, sexuality, disability, or origin;',
        'Graphic violence, self-harm promotion, or dangerous acts;',
        'Non-consensual intimate imagery and deepfakes of real people;',
        'Spam, scams, fraud, fake accounts, and manipulated engagement;',
        'Misinformation that risks public harm; misleading health or financial claims;',
        "Infringing content and unauthorised use of others' IP.",
      ]) },
    { h: '3. Authenticity and safety', html:
      `<p>Use your real identity, don't impersonate others, and protect people's privacy. For dating and in-person meetups, follow our Safety Centre guidance in the Matchmaking Hub Terms.</p>` },
    { h: '4. Tools you control', html:
      li(['Report content or accounts;', 'Block and mute users;', 'Copyright reporting;', 'Appeal a moderation decision (see Content Moderation Policy).']) },
    { h: '5. Enforcement', html:
      `<p>We may remove content, limit reach, restrict features, or suspend/terminate accounts. Serious or repeated violations, and any child-safety violation, result in permanent removal and, where required, reporting to law enforcement.</p>` },
  ],
  related: ['moderation', 'child', 'harassment', 'copyright', 'dating'],
};

P.moderation = {
  title: 'Content Moderation Policy',
  short: 'How we review, action, and let you appeal content decisions.',
  eff: CO.updated,
  tldr: [
    'We combine user reports, automated detection, and human review.',
    'We act on unlawful content within the timelines required by the IT Rules.',
    'You can appeal; a grievance officer oversees the process.',
  ],
  sections: [
    { h: '1. Purpose', html:
      `<p>This Policy explains how ${CO.brand}, as an intermediary under the IT Act and IT Rules, exercises due diligence over user content and handles reports and takedowns.</p>` },
    { h: '2. How content is reviewed', html:
      li([
        '<strong>User reports:</strong> anyone can report content or accounts;',
        '<strong>Automated detection:</strong> AI classifiers flag spam, CSAM signals, nudity, and abuse;',
        '<strong>Human review:</strong> trained reviewers decide edge cases and appeals.',
      ]) },
    { h: '3. Actions we may take', html:
      li(['Remove or restrict content;', 'Add labels or reduce distribution;', 'Warn, restrict features, suspend, or terminate accounts;', 'Preserve information and report to authorities where the law requires.']) },
    { h: '4. Timelines', html:
      `<p>We acknowledge grievances within 24 hours and act on them as soon as possible, and in any case within 15 days. Content in the nature of non-consensual intimate imagery is removed within 24 hours of a valid complaint. Unlawful content notified by a court or government agency is actioned within the time the law requires.</p>` },
    { h: '5. Appeals', html:
      `<p>If your content or account is actioned, you will be told the reason (where lawful) and how to appeal. Appeals are reviewed by a person not involved in the original decision. Unresolved appeals may be escalated to the Grievance Officer and any applicable Grievance Appellate Committee.</p>` },
    { h: '6. Transparency', html:
      `<p>We maintain records of actions taken and, where appropriate, publish periodic transparency information.</p>` },
  ],
  related: ['community', 'grievance', 'child', 'harassment'],
};

P.medical = {
  title: 'Medical & Health Data Disclaimer',
  short: 'Health features are informational and do not replace a doctor.',
  eff: CO.updated,
  tldr: [
    'Together City is not a hospital, lab, or telemedicine provider and does not diagnose.',
    'Health insights are informational support, not a substitute for professional care.',
    'Your medical data is encrypted, consented, and deletable/exportable by you.',
  ],
  sections: [
    { h: '1. No medical advice', html:
      `${note('Together City, including the Medical Hub, Nutrition Hub, blood-test features, and AI health insights, provides information and organisational tools only. It does not provide medical diagnosis, treatment, or professional medical advice, and is not a substitute for consultation with a qualified doctor.')}` },
    { h: '2. Always consult a professional', html:
      `<p>Never disregard or delay professional medical advice because of something on the Platform. In an emergency, contact your doctor or local emergency services immediately.</p>` },
    { h: '3. Blood tests and records', html:
      `<p>Where we facilitate lab tests or store reports, we act as an organiser/intermediary connecting you to independent labs and providers. Results and their interpretation are the responsibility of the provider and your treating doctor. We do not claim to diagnose any condition.</p>` },
    { h: '4. AI nutrition and insights', html:
      `<p>AI-generated nutrition plans, biomarker interpretations, and supplement suggestions are informational and may not suit your condition. Consult a doctor or registered dietitian before making changes, especially if you are pregnant, have a chronic condition, or take medication.</p>` },
    { h: '5. Your health data rights', html:
      `<p>Health data is processed only with your explicit consent, encrypted, never sold, and shared across hubs only by reference and with your consent. You can export or delete your health data at any time. See the Privacy Policy and Blood Test & Health Data Policy.</p>` },
    { h: '6. Future services', html:
      `<p>If we later offer telemedicine, diagnostics, or pharmacy services directly, additional healthcare regulations, licences, and specific terms will apply and be disclosed.</p>` },
  ],
  related: ['nutrition', 'privacy', 'healthdata', 'ai'],
};

P.dating = {
  title: 'Matchmaking Hub Terms',
  short: 'Rules and safety for the Matchmaking District.',
  eff: CO.updated,
  tldr: [
    '18+ only, with recommended identity verification.',
    'Chat identity stays hidden until both people choose to connect.',
    'Report abuse, block users, and use the Safety Centre; we take harassment seriously.',
  ],
  sections: [
    { h: '1. Eligibility and conduct', html:
      `<p>The Matchmaking District is strictly for users aged 18 or older. You agree to interact respectfully, honestly, and lawfully, and not to use the feature for solicitation, fraud, or harassment.</p>` },
    { h: '2. Identity and privacy', html:
      li([
        'Identity verification is strongly recommended and may be required;',
        "In activity dating, a host reviews a requester's profile card before approving;",
        'Chat identities remain masked until both users choose to become friends;',
        'Birth details used for astrology-based compatibility are stored to your account and only the score and explanation are surfaced.',
      ]) },
    { h: '3. Compatibility scoring', html:
      `<p>Compatibility (including any astrology-based scoring) is generated for entertainment and matching purposes and is not a guarantee of suitability, safety, or relationship success.</p>` },
    { h: '4. Safety', html:
      li([
        'Report abuse and block users at any time;',
        // Was "Screenshot-protection measures are applied where feasible", which
        // nothing implemented and no website can: browsers expose no way to stop
        // a screenshot. Somebody could have shared a photo believing otherwise,
        // which makes it the most costly kind of untrue sentence to leave up.
        'We cannot stop anyone taking a screenshot — no website can — so treat anything you share here as something that could be saved;',
        'Your matchmaking photos are shown inside the Matchmaking Hub only, to people allowed by the visibility setting on your profile — you can require a minimum match score, or hide your profile entirely;',
        'Sharing intimate images of someone without their consent is prohibited and can lead to permanent removal and reporting to authorities;',
        'Follow our Safety Centre before meeting anyone in person: meet in public, tell a friend, and trust your instincts;',
        'Emergency reporting is available in-app.',
      ]) },
    { h: '5. Anti-harassment', html:
      `<p>Harassment, threats, non-consensual imagery, and off-platform abuse are prohibited and may lead to permanent removal and reporting to authorities. See our Harassment & Abuse Policy.</p>` },
  ],
  related: ['community', 'harassment', 'identity', 'child', 'privacy'],
};

P.payments = {
  title: 'Payment & Subscription Terms',
  short: 'How payments, memberships, and auto-renewals work.',
  eff: CO.updated,
  tldr: [
    "Payments are processed by RBI-authorised gateways; we don't store full card details.",
    'Subscriptions (like Together+) renew automatically until cancelled.',
    'Prices show taxes; refunds follow the Refund Policy.',
  ],
  sections: [
    { h: '1. Payment processing', html:
      `<p>Payments on ${CO.brand} — memberships, bookings, orders, and gifts — are processed through RBI-authorised payment aggregators/gateways (e.g. Razorpay, Cashfree, or similar). We do not store your complete card or bank credentials. You agree to the payment partner's terms at checkout.</p>` },
    { h: '2. Pricing and taxes', html:
      `<p>Prices are shown in Indian Rupees (₹) unless stated otherwise (Travel may show other currencies). Applicable taxes and fees are displayed before you pay. You are responsible for any charges levied by your bank or card issuer.</p>` },
    { h: '3. Subscriptions and auto-renewal', html:
      `<p>Paid memberships such as Together+ are billed on a recurring basis and renew automatically at the end of each cycle until you cancel. We will disclose the price, cycle, and renewal date before you subscribe.</p>
      ${note('Cancel any time before the renewal date from Settings → Membership to stop the next charge. Cancellation takes effect at the end of the current paid period.')}` },
    { h: '4. Failed and disputed payments', html:
      `<p>If a payment fails, access to paid features may be paused. For unauthorised transactions, contact your bank and ${CO.support} promptly; we will assist with genuine disputes.</p>` },
    { h: '5. Creator payouts and points', html:
      `<p>Creator earnings (e.g. Post & Earn) and redeemable points are governed by the Creator Agreement and are subject to eligibility, review, caps, and applicable tax deduction.</p>` },
    { h: '6. Wallet and credits', html:
      `<p>If we offer stored balances or credits, additional terms and any RBI requirements will apply. Credits are not legal tender and, unless stated, are non-transferable and non-encashable. See the Wallet/Credits Policy.</p>` },
    { h: '7. Refunds', html:
      `<p>Refunds, cancellations, and returns are governed by our Refund, Cancellation & Return Policy and the seller/provider's own terms.</p>` },
  ],
  related: ['refunds', 'subscription', 'wallet', 'creator', 'terms'],
};

P.refunds = {
  title: 'Refund, Cancellation & Return Policy',
  short: 'When and how you can cancel, return, and get refunds.',
  eff: CO.updated,
  tldr: [
    'Cancellation and refund rights depend on the hub and the seller/provider.',
    'Refunds go back to your original payment method within stated timelines.',
    'Some items (perishables, bookings, personalised goods) may be non-refundable.',
  ],
  sections: [
    { h: '1. General', html:
      `<p>This Policy sets out cancellation, return, and refund rules across ${CO.brand}. Because many purchases involve third-party sellers and providers, the specific seller/provider's terms disclosed at checkout also apply, consistent with the Consumer Protection Act, 2019 and its e-commerce rules.</p>` },
    { h: '2. Cancellations', html:
      li([
        '<strong>Bookings (travel, hotels, restaurants, events):</strong> cancellation windows and charges are shown before you confirm and set by the provider;',
        '<strong>Marketplace orders:</strong> may be cancelled before dispatch; after dispatch, the return process applies;',
        '<strong>Subscriptions:</strong> cancel anytime to stop future renewals (no partial-period refund unless required by law).',
      ]) },
    { h: '3. Returns and replacements', html:
      `<p>Eligible physical goods may be returned within the window shown on the product page if unused and in original condition. Perishables (food, groceries), personalised items, opened supplements/cosmetics for hygiene reasons, and downloadable content may be non-returnable, except where defective or not as described.</p>` },
    { h: '4. Refund method and timelines', html:
      `<p>Approved refunds are issued to your original payment method. Timelines depend on the payment partner, typically 5–10 business days after approval. Booking refunds follow the provider's timeline disclosed at booking.</p>` },
    { h: '5. Defective, wrong, or not-as-described items', html:
      `<p>You are entitled to a replacement or refund for goods that are defective, damaged, or materially different from their description, in line with consumer law.</p>` },
    { h: '6. How to request', html:
      `<p>Raise a request from your order/booking page or contact ${CO.support}. Disputes not resolved may be escalated through our Grievance Redressal Policy.</p>` },
  ],
  related: ['payments', 'seller', 'travel', 'marketplace', 'grievance'],
};

P.grievance = {
  title: 'Grievance Redressal Policy',
  short: 'How to raise complaints and how quickly we respond.',
  eff: CO.updated,
  tldr: [
    'Contact our Grievance Officer for any complaint about content, data, or the service.',
    'We acknowledge within 24 hours and aim to resolve within 15 days.',
  ],
  sections: [
    { h: '1. Grievance Officer', html:
      `<p>In accordance with the IT Act, IT Rules, DPDP Act, and Consumer Protection (E-Commerce) Rules, we have appointed a Grievance Officer:</p>
      ${note(`Grievance Officer: ${tf(CO.grievanceOfficer)}<br>Email: ${CO.grievanceEmail}<br>Address: ${tf(CO.office)}`)}` },
    { h: '2. What you can raise', html:
      li(['Unlawful, harmful, or infringing content;', 'Privacy and data-protection concerns;', 'Consumer complaints about orders, bookings, and payments;', 'Account actions and appeals;', 'Any breach of our policies.']) },
    { h: '3. Timelines', html:
      li([
        'Acknowledgement within 24 hours of receipt;',
        'Resolution within 15 days (sooner for urgent categories such as non-consensual intimate imagery — within 24 hours);',
        'Reasoned outcome communicated to you.',
      ]) },
    { h: '4. Escalation', html:
      `<p>If you are not satisfied, you may escalate to any applicable Grievance Appellate Committee under the IT Rules, the Data Protection Board of India for data matters, or consumer forums under the Consumer Protection Act, 2019.</p>` },
  ],
  related: ['moderation', 'privacy', 'refunds', 'lawenforcement'],
};

P.child = {
  title: 'Child Safety & Minor Protection Policy',
  short: 'Our zero-tolerance approach to child safety.',
  eff: CO.updated,
  tldr: [
    'The Platform is for adults 18+ only; we do not allow minors.',
    'Zero tolerance for any content that exploits or endangers children.',
    'We remove, preserve, and report such content to authorities.',
  ],
  sections: [
    { h: '1. Adults only', html:
      `<p>${CO.brand} is restricted to users aged 18 and older. We do not knowingly permit minors to register or use the Platform. Accounts found to belong to minors are removed and their data deleted.</p>` },
    { h: '2. Zero tolerance for child exploitation', html:
      `${note('We have zero tolerance for child sexual abuse material (CSAM) or any content that sexualises, endangers, or exploits minors. Such content is removed immediately, preserved as required, and reported to the appropriate authorities.')}` },
    { h: '3. Detection and reporting', html:
      li(['Automated and human review to detect prohibited content;', 'Easy in-app reporting for child-safety concerns;', 'Cooperation with law enforcement and mandated reporting;', 'Permanent bans for offending accounts.']) },
    { h: '4. If you encounter such content', html:
      `<p>Report it immediately via the in-app report tool or to ${CO.grievanceEmail}. You may also report to the National Cyber Crime Reporting Portal and local authorities.</p>` },
  ],
  related: ['community', 'moderation', 'grievance', 'dating'],
};

P.seller = {
  title: 'Seller / Merchant Agreement',
  short: 'Terms for businesses selling through Together City.',
  eff: CO.updated,
  tldr: [
    'Sellers are responsible for their listings, goods, taxes, and consumer obligations.',
    'You must provide accurate information, honour orders, and handle returns lawfully.',
    'We may suspend sellers who breach policy or the law.',
  ],
  sections: [
    { h: '1. Relationship', html:
      `<p>This Agreement governs businesses ("Sellers/Merchants") offering goods or services on ${CO.brand}. ${CO.company} operates the marketplace as an intermediary; the contract of sale is between the Seller and the customer.</p>` },
    { h: '2. Seller obligations', html:
      li([
        'Provide accurate business identity, GSTIN where applicable, and contact details (as required by the Consumer Protection (E-Commerce) Rules, 2020);',
        'List accurate prices (inclusive of taxes), descriptions, images, and country of origin where required;',
        'Maintain stock, dispatch on time, and honour confirmed orders;',
        'Comply with all applicable laws, licences, and product-safety standards;',
        'Not sell prohibited, counterfeit, or unsafe goods.',
      ]) },
    { h: '3. Returns, refunds, and support', html:
      `<p>Sellers must offer a lawful return/refund process consistent with our Refund Policy and provide responsive customer support and complaint handling. Invoices must be issued for each sale.</p>` },
    { h: '4. Payments and fees', html:
      `<p>Settlements are made via our payment partner net of applicable platform fees and taxes, on the cycle disclosed to you. Sellers are responsible for their own tax compliance, including GST.</p>` },
    { h: '5. Liability and indemnity', html:
      `<p>Sellers are solely responsible for their products and indemnify the Company against claims arising from their listings, goods, or conduct.</p>` },
    { h: '6. Suspension', html:
      `<p>We may delist products or suspend Sellers for policy or legal breaches, poor ratings, or consumer harm.</p>` },
  ],
  related: ['marketplace', 'refunds', 'payments', 'merchant', 'advertising'],
};

P.creator = {
  title: 'Creator Agreement',
  short: 'Terms for creators posting content and earning on Together City.',
  eff: CO.updated,
  tldr: [
    'You keep ownership of your content and grant us a licence to host and promote it.',
    'Earnings (e.g. Post & Earn) depend on eligibility, review, and caps.',
    "Follow community and copyright rules; prohibited content isn't paid.",
  ],
  sections: [
    { h: '1. Who this covers', html:
      `<p>This Agreement applies to creators who post videos, photos, reviews, and other content, including under monetisation programmes such as Post & Earn.</p>` },
    { h: '2. Content ownership and licence', html:
      `<p>You retain ownership of your content. You grant ${CO.company} a worldwide, non-exclusive, royalty-free licence to host, reproduce, adapt for formatting, distribute, and promote your content on and off the Platform (including on social channels and in advertising) for as long as needed to operate and market the service.</p>` },
    { h: '3. Eligibility and payouts', html:
      li([
        'Monetisation is subject to eligibility rules (e.g. original videos of a minimum length), review, and approval;',
        'Payout rates and daily caps are as published in-app and may change;',
        'We may withhold or reverse earnings for fraud, manipulated engagement, or policy breaches;',
        'Payouts are subject to applicable tax deduction and your provision of valid tax/bank details.',
      ]) },
    { h: '4. Content standards', html:
      `<p>You must own or have rights to everything you post, comply with our Community Guidelines and Copyright Policy, and not post prohibited content. Sponsored/branded content must be disclosed per our Advertising and Sponsored Content policies.</p>` },
    { h: '5. Termination', html:
      `<p>We may remove content, pause monetisation, or terminate participation for breaches. Sections on IP licence and liability survive termination.</p>` },
  ],
  related: ['community', 'copyright', 'userlicense', 'advertising', 'payments'],
};

P.retention = {
  title: 'Data Retention & Deletion Policy',
  short: 'How long we keep data and how you delete it.',
  eff: CO.updated,
  tldr: [
    'We keep data only as long as needed or as the law requires, then delete or anonymise it.',
    'You can delete your account and data anytime; some records are kept for legal reasons.',
  ],
  sections: [
    { h: '1. Principle', html:
      `<p>We retain personal data only for as long as necessary for the purpose it was collected, to provide the service, meet legal obligations, resolve disputes, and enforce our agreements — then delete or anonymise it.</p>` },
    { h: '2. Indicative retention periods', html:
      li([
        '<strong>Account data:</strong> for the life of the account, then deleted within a reasonable period after closure;',
        '<strong>Transaction/tax records:</strong> as required by tax and company law (typically up to 8 years);',
        '<strong>Health data:</strong> until you delete it or withdraw consent, subject to any legal hold;',
        '<strong>Content:</strong> until you delete it or the account is closed;',
        '<strong>Logs/security data:</strong> a limited period for security and audit.',
      ]) },
    { h: '3. Deleting your account and data', html:
      `<p>You can delete your account and request erasure from Settings → Privacy or by writing to ${CO.privacyEmail}. On deletion we remove or anonymise your personal data, except where retention is required by law or for legitimate purposes (e.g. fraud prevention, financial records).</p>` },
    { h: '4. Download your data', html:
      `<p>You can request a copy of your data ("Download My Data") before deleting.</p>` },
    { h: '5. Backups', html:
      `<p>Residual copies in backups are overwritten in the ordinary backup cycle.</p>` },
  ],
  related: ['privacy', 'deletion', 'cookies', 'security'],
};

P.copyright = {
  title: 'Copyright & DMCA-style Complaint Policy',
  short: 'Report infringement and how we respond.',
  eff: CO.updated,
  tldr: [
    "Respect others' IP; only post what you own or are licensed to use.",
    'Rights holders can send a takedown notice; we act on valid complaints.',
    'Repeat infringers lose access.',
  ],
  sections: [
    { h: '1. Respect intellectual property', html:
      `<p>You may only post content you own or have permission to use. We respond to notices of alleged copyright and trademark infringement consistent with the Copyright Act, 1957 and the IT Act.</p>` },
    { h: '2. Filing a complaint', html:
      `<p>To report infringement, email ${CO.grievanceEmail} with:</p>
      ${li(['Your contact details and, if acting for a rights holder, your authority;', 'Identification of the copyrighted work and the infringing content (URLs/links);', 'A statement that you believe in good faith the use is unauthorised;', 'A statement that the information is accurate, under penalty of law;', 'Your signature (physical or electronic).'])}` },
    { h: '3. Our response', html:
      `<p>On a valid complaint we will act expeditiously to remove or disable access to the content and notify the person who posted it.</p>` },
    { h: '4. Counter-notice', html:
      `<p>If your content was removed and you believe this was a mistake or misidentification, you may submit a counter-notice with your details, identification of the content, and a good-faith statement. We may restore the content unless the complainant pursues legal action.</p>` },
    { h: '5. Repeat infringers', html:
      `<p>We terminate the accounts of repeat infringers.</p>` },
  ],
  related: ['community', 'userlicense', 'trademark', 'creator', 'grievance'],
};

// ---- STUB / SCAFFOLDED POLICIES (linked, full clauses in preparation) ------

const stub = (title: string, short: string, purpose: string, related?: string[]): Policy => ({
  title, short, eff: CO.updated, drafted: false, related: related || [],
  tldr: [purpose],
  sections: [
    { h: '1. Purpose', html: `<p>${purpose}</p>` },
    { h: '2. Status', html: note('Full clauses for this document are being finalised and will be reviewed by Indian legal counsel before publication. The summary above states its intended scope. Contact ' + CO.support + ' for the current position.') },
    { h: '3. Related documents', html: `<p>This document works alongside our Terms of Service, Privacy Policy, and the related policies listed for it.</p>` },
    { h: '4. Contact', html: `<p>Questions: ${CO.support}. Complaints: ${CO.grievanceEmail}.</p>` },
  ],
});

P.aidisclaimer = stub('AI Disclaimer', 'Standalone notice on the limits of AI outputs.', 'A short-form disclaimer, surfaced next to AI features, stating that AI outputs are automated, may be inaccurate, and are not professional advice.', ['ai', 'medical']);
P.nutrition = stub('Nutrition Disclaimer', 'Nutrition guidance is informational, not clinical advice.', 'Explains that AI meal plans, macros, and supplement suggestions are informational and not a substitute for a doctor or registered dietitian.', ['medical', 'ai', 'healthdata']);
P.healthdata = stub('Blood Test & Health Data Policy', 'How blood tests and health records are handled.', 'Governs ordering blood tests, storing reports in the Medical Hub, consent-based cross-hub sharing, encryption, and your rights to export or delete health data.', ['privacy', 'medical', 'retention']);
P.userlicense = stub('User Content Licence', 'The licence you grant us for your content.', 'Sets out the worldwide, non-exclusive, royalty-free licence you grant to host, store, adapt for formatting, and display your content to operate and promote the service.', ['terms', 'creator', 'copyright']);
P.trademark = stub('Trademark Policy', 'Use of the Together City brand and marks.', 'Governs permitted and prohibited use of the Together City name, logo, and brand assets, and how to report trademark misuse.', ['copyright', 'advertising']);
P.harassment = stub('Harassment & Abuse Policy', 'Our stance on harassment and abuse.', 'Prohibits harassment, threats, doxxing, non-consensual imagery, and coordinated abuse, and sets out reporting and enforcement.', ['community', 'moderation', 'dating']);
P.antifraud = stub('Anti-Fraud Policy', 'How we detect and prevent fraud.', 'Describes fraud, fake-account, and manipulated-engagement prevention, and the actions we take against fraudulent activity.', ['identity', 'payments', 'terms']);
P.identity = stub('Identity Verification Policy', 'When and how we verify identity.', 'Explains identity checks (recommended in Dating and required for some features/sellers), what we collect, and how it is protected.', ['dating', 'seller', 'privacy']);
P.merchant = stub('Merchant Agreement', 'General merchant terms across hubs.', 'Umbrella terms for merchants across marketplace, restaurants, and services, complementing the Seller Agreement.', ['seller', 'restaurant', 'payments']);
P.restaurant = stub('Restaurant Partner Agreement', 'Terms for restaurant partners.', 'Governs restaurant listings, menu/price accuracy, taxes, hygiene claims, delivery details, and ratings policy.', ['merchant', 'reviews', 'refunds']);
P.grocery = stub('Grocery Partner Agreement', 'Terms for grocery partners.', 'Governs grocery catalogues, pricing, freshness/expiry, substitutions, and fulfilment.', ['merchant', 'refunds']);
P.marketplace = stub('Marketplace Terms', 'Buyer-side marketplace rules.', 'Explains how the marketplace works, that the Company is an intermediary, and buyer protections under consumer law.', ['seller', 'refunds', 'payments']);
P.affiliate = stub('Affiliate Policy', 'Terms for affiliates and referrals.', 'Governs affiliate/referral participation, disclosure obligations, and commissions.', ['advertising', 'creator']);
P.subscription = stub('Subscription & Auto-Renewal Terms', 'Details of recurring memberships.', 'Sets out billing cycles, auto-renewal, price-change notice, and cancellation for memberships like Together+.', ['payments', 'refunds']);
P.wallet = stub('Wallet & Credits Policy', 'Rules for stored balances and points.', 'Governs any wallet, credits, or Together Points — issuance, expiry, redemption, and applicable RBI requirements.', ['payments', 'creator']);
P.travel = stub('Travel Booking Terms', 'Terms for booking travel.', 'Covers flights, trains, buses, and packages: third-party responsibility, cancellation/refund timelines, taxes, and insurance disclosures.', ['hotel', 'flight', 'refunds']);
P.hotel = stub('Hotel Booking Terms', 'Terms for hotel bookings.', 'Covers hotel reservations, provider terms, cancellation windows, and taxes.', ['travel', 'refunds']);
P.flight = stub('Flight Booking Terms', 'Terms for flight bookings.', 'Covers airline bookings, fare rules, changes/cancellations, and third-party carrier responsibility.', ['travel', 'refunds']);
P.experience = stub('Experience & Event Booking Terms', 'Terms for experiences and events.', 'Covers experiences, movies, and events: ticketing, seat selection, cancellation, and organiser responsibility.', ['travel', 'refunds']);
P.advertising = stub('Advertising Policy', 'Rules for advertisers on the Platform.', 'Governs ad content standards, prohibited advertising, targeting limits, and ad-record keeping.', ['sponsored', 'creator', 'community']);
P.sponsored = stub('Sponsored Content Policy', 'Disclosure of paid/branded content.', 'Requires clear labelling of sponsored and branded content by creators and advertisers.', ['advertising', 'creator']);
P.reviews = stub('Review & Ratings Policy', 'How reviews and ratings work.', 'Governs authentic reviews, prohibits fake/paid reviews and misleading rankings, and explains moderation of reviews.', ['restaurant', 'marketplace', 'moderation']);
P.deletion = stub('Data Deletion Policy', 'How to delete your data.', 'Step-by-step account and data deletion, what is removed, and what is retained for legal reasons.', ['retention', 'privacy']);
P.security = stub('Security Policy', 'Our security safeguards.', 'Describes encryption, authentication, access controls, testing, and breach response.', ['privacy', 'vulnerability', 'retention']);
P.vulnerability = stub('Vulnerability Disclosure Policy', 'How to report security issues.', 'Invites responsible disclosure of vulnerabilities, sets safe-harbour expectations, and our response process.', ['security']);
P.lawenforcement = stub('Law Enforcement & Government Request Policy', 'How we handle official requests.', 'Explains how we respond to lawful requests for data or content removal, the standards we apply, and user-notice practices.', ['privacy', 'grievance']);
P.compliance = stub('Corporate Compliance Manual', 'Internal compliance framework.', 'Internal manual covering roles (Grievance/Nodal/Compliance Officers), policies, training, and audits. Internal-facing.', ['grievance', 'security']);
P.employeeaup = stub('Employee Acceptable Use Policy', 'Rules for staff use of systems.', 'Internal policy on acceptable use of Company systems, data access, and confidentiality.', ['security', 'compliance']);
P.vendor = stub('Vendor Compliance Policy', 'Requirements for vendors and processors.', 'Sets data-protection, security, and compliance requirements for vendors and Data Processors.', ['security', 'privacy']);
P.api = stub('API & Developer Terms', 'Terms for developers using our APIs.', 'Governs API access, rate limits, data use, security, and prohibited uses for developers.', ['security', 'terms']);
P.accessibility = stub('Accessibility Policy', 'Our accessibility commitments.', 'States our commitment to accessible design and how to report accessibility barriers.', ['terms']);
P.disputes = stub('Arbitration & Dispute Resolution', 'How disputes are resolved.', 'Sets out negotiation, arbitration (seated in Mumbai under the Arbitration and Conciliation Act, 1996), governing law, and jurisdiction.', ['terms', 'grievance']);

// ---- VOLUME STRUCTURE ------------------------------------------------------

export const VOLUMES: Volume[] = [
  { id: 'v1', roman: 'I', title: 'Platform Terms & Data',
    desc: 'The master agreement, privacy, cookies, AI, and data rights.',
    policies: ['terms', 'privacy', 'cookies', 'ai', 'aidisclaimer', 'retention', 'deletion', 'security', 'vulnerability', 'lawenforcement'] },
  { id: 'v2', roman: 'II', title: 'Community, Dating, Creator & Advertising',
    desc: 'Behaviour, safety, moderation, and creator/advertiser rules.',
    policies: ['community', 'moderation', 'child', 'harassment', 'dating', 'identity', 'creator', 'userlicense', 'advertising', 'sponsored', 'affiliate', 'reviews'] },
  { id: 'v3', roman: 'III', title: 'Health, Nutrition, Restaurants & Travel',
    desc: 'Disclaimers and booking terms for health and lifestyle hubs.',
    policies: ['medical', 'nutrition', 'healthdata', 'restaurant', 'reviews', 'travel', 'hotel', 'flight', 'experience'] },
  { id: 'v4', roman: 'IV', title: 'Commerce, Payments & Partners',
    desc: 'Marketplace, seller, payment, subscription, and partner agreements.',
    policies: ['marketplace', 'seller', 'merchant', 'grocery', 'refunds', 'payments', 'subscription', 'wallet', 'antifraud', 'api'] },
  { id: 'v5', roman: 'V', title: 'Governance & Compliance',
    desc: 'Grievance, IP, internal compliance, and legal notices.',
    policies: ['grievance', 'copyright', 'trademark', 'compliance', 'employeeaup', 'vendor', 'accessibility', 'disputes'] },
];

export const POLICIES = P;
