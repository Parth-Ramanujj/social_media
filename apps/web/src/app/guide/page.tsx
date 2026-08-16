import type { Metadata } from 'next';
import Link from 'next/link';
import { PlatformMark, PulseMark } from '@/components/icons';
import { CopyButton } from '@/components/copy-button';
import '../../styles/app.css';

export const metadata: Metadata = {
  title: 'Platform setup guide — Pulse',
  description:
    'Step-by-step guide to connect Meta, X, LinkedIn and YouTube to Pulse.',
};

interface Step {
  text: string;
  sub?: string[];
}

interface Credential {
  name: string;
  where: string;
  looksLike: string;
}

interface PlatformGuide {
  id: string;
  name: string;
  headline: string;
  account: string;
  review: string;
  appUrl: string;
  redirectUri: string;
  env: { key: string; value: string; where: string }[];
  scopes: string;
  create: Step[];
  scopesStep: Step[];
  redirectStep: Step[];
  credentials: Credential[];
  verify: Step[];
  notes: string[];
}

const BASE = 'http://localhost:4000/api/oauth/callback';

const PLATFORMS: PlatformGuide[] = [
  {
    id: 'meta',
    name: 'Meta',
    headline: 'Facebook Page + Instagram Business',
    account: 'Facebook account + Page',
    review: 'dev mode: instant · production: App Review',
    appUrl: 'https://developers.facebook.com/apps',
    redirectUri: `${BASE}/meta`,
    env: [
      { key: 'META_APP_ID', value: '1234567890123456', where: 'App Settings → Basic' },
      { key: 'META_APP_SECRET', value: 'a1b2c3…', where: 'App Settings → Basic (Show)' },
      { key: 'META_APP_VERSION', value: 'v22.0', where: 'leave as default' },
      { key: 'META_ENABLED', value: 'true', where: 'you set this' },
    ],
    scopes: 'pages_manage_posts, pages_read_engagement (Page posts) + instagram_basic, instagram_content_publish (IG posts)',
    create: [
      { text: 'Open <strong>developers.facebook.com/apps</strong> and sign in with your personal Facebook account.' },
      { text: 'Click <strong>Create App</strong> → choose app type <strong>Business</strong> (not Consumer).' },
      { text: 'Enter an <strong>App name</strong> (e.g. “Pulse local”), your contact email, then <strong>Create app</strong>.' },
      { text: 'If prompted for a business portfolio, create a free one — it takes 30 seconds.' },
    ],
    scopesStep: [
      { text: 'From the app dashboard click <strong>Add product</strong> and add <strong>Facebook Login</strong>.' },
      { text: 'Add the second product <strong>Instagram</strong> (the “Instagram Graph API” one).' },
      { text: 'You need a <strong>Facebook Page</strong> and an <strong>Instagram Business/Creator</strong> account linked to that Page. Connect Instagram → <strong>Link account</strong> inside the Instagram product settings.' },
    ],
    redirectStep: [
      { text: 'Go to <strong>Facebook Login → Settings</strong> (left menu of your app).' },
      { text: 'Paste the URI below into <strong>Valid OAuth redirect URIs</strong> and click <strong>Save changes</strong>. Exact match — no trailing slash, no spaces.' },
    ],
    credentials: [
      { name: 'App ID', where: 'App Settings → Basic → “App ID”', looksLike: '16-digit number' },
      { name: 'App Secret', where: 'same page → “App Secret” → click Show', looksLike: '32-char string' },
      { name: 'App Version', where: 'dashboard header (or .env default v22.0)', looksLike: 'v22.0' },
    ],
    verify: [
      { text: 'Set <strong>META_ENABLED=true</strong> in .env, restart the API, then in Pulse go to <strong>Accounts</strong> → connect → Meta.' },
      { text: 'App mode: keep <strong>Development</strong>. Add your profile under <strong>App roles</strong> so the connect + publish test works.' },
    ],
    notes: [
      'Instagram publishing needs <strong>Advanced Access</strong>. In development mode it works for the app admin; for production you must submit <strong>App Review</strong> for each permission.',
      'Page posts work with <strong>Standard Access</strong> in dev mode — great for a first live test.',
    ],
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    headline: 'Project + App on the X developer portal',
    account: 'X account (free)',
    review: 'free Essential tier — no review',
    appUrl: 'https://developer.x.com/en/portal',
    redirectUri: `${BASE}/x`,
    env: [
      { key: 'X_CLIENT_ID', value: 'Mj…LWFte0N9', where: 'Keys and tokens tab' },
      { key: 'X_CLIENT_SECRET', value: '••••••••••••', where: 'Keys and tokens tab (Generate)' },
      { key: 'X_ENABLED', value: 'true', where: 'you set this' },
    ],
    scopes: 'OAuth 2.0 with PKCE — tweet.read, tweet.write, users.read',
    create: [
      { text: 'Open <strong>developer.x.com/en/portal</strong> and sign in with the X account you want to post from.' },
      { text: 'Go to <strong>Dashboard → Projects & Apps → New Project</strong>. Give it a name (e.g. “Pulse”).' },
      { text: 'Inside the project click <strong>New App</strong> — name it (e.g. “Pulse-local”). The <strong>Essential</strong> tier (free) is enough.' },
    ],
    scopesStep: [
      { text: 'Open the app → <strong>Settings → User authentication settings → Set up</strong>.' },
      { text: 'Set <strong>App permissions</strong> to <strong>Read and write</strong> (this enables tweet.write).' },
      { text: 'Choose <strong>Web App, Automated App or Bot</strong> as app type, turn on <strong>OAuth 2.0 with PKCE</strong>.' },
    ],
    redirectStep: [
      { text: 'In the same <strong>User authentication settings</strong> form, add the URI below to <strong>Callback / Redirect URL</strong>.' },
      { text: 'Save — X returns <strong>Client ID</strong> and lets you <strong>Generate a Client Secret</strong> right there. Copy both now.' },
    ],
    credentials: [
      { name: 'Client ID', where: 'app → Keys and tokens tab → “OAuth 2.0 Client ID”', looksLike: '~40 chars ending in 0N9' },
      { name: 'Client Secret', where: 'same tab → “OAuth 2.0 Client Secret” (Generate if blank)', looksLike: '~64 chars' },
    ],
    verify: [
      { text: 'Fill <strong>X_CLIENT_ID</strong> + <strong>X_CLIENT_SECRET</strong> in .env, set <strong>X_ENABLED=true</strong>, restart the API.' },
      { text: 'In Pulse → <strong>Accounts</strong> → connect → X → approve the consent screen. Then post a test tweet from the composer.' },
    ],
    notes: [
      'PKCE is used, so the secret is only ever exchanged server-side by Pulse.',
      'Essential tier posts text + up to 4 images; it cannot upload video.',
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    headline: 'Developer app with Sign In + Share',
    account: 'LinkedIn account',
    review: 'free products — no review',
    appUrl: 'https://www.linkedin.com/developers/apps',
    redirectUri: `${BASE}/linkedin`,
    env: [
      { key: 'LINKEDIN_CLIENT_ID', value: '86abc1def2', where: 'Auth tab, top of page' },
      { key: 'LINKEDIN_CLIENT_SECRET', value: '••••••••••••', where: 'Auth tab, top of page' },
      { key: 'LINKEDIN_ENABLED', value: 'true', where: 'you set this' },
    ],
    scopes: 'openid, profile, email (Sign In) + w_member_social (Share on LinkedIn)',
    create: [
      { text: 'Open <strong>linkedin.com/developers/apps</strong> → <strong>Create app</strong>.' },
      { text: 'Fill the form: app name, LinkedIn page URL (any company page you follow or own), privacy policy URL, logo, then <strong>Create app</strong>.' },
      { text: 'It lands on the app overview — this is your app home. Keep the page open.' },
    ],
    scopesStep: [
      { text: 'Open the <strong>Products</strong> tab → <strong>Add product</strong>.' },
      { text: 'Add <strong>Sign In with LinkedIn</strong> (adds openid/profile/email scopes).' },
      { text: 'Add <strong>Share on LinkedIn</strong> (adds <strong>w_member_social</strong> — the posting permission). Both are free products.' },
    ],
    redirectStep: [
      { text: 'Open the <strong>Auth</strong> tab → <strong>OAuth 2.0 settings</strong> → <strong>Authorized redirect URLs</strong> → <strong>Add</strong>.' },
      { text: 'Paste the URI below exactly and hit <strong>Save</strong>.' },
    ],
    credentials: [
      { name: 'Client ID', where: 'Auth tab → top of page “Client ID”', looksLike: '10-char string' },
      { name: 'Client Secret', where: 'Auth tab → “Client Secret” (regenerate if lost)', looksLike: '20-char string' },
    ],
    verify: [
      { text: 'Fill both values in .env, set <strong>LINKEDIN_ENABLED=true</strong>, restart the API.' },
      { text: 'Accounts → connect → LinkedIn → approve. The “default” redirect created by LinkedIn can’t be edited — your added URI is the one Pulse uses.' },
    ],
    notes: [
      'Posting to a <strong>Company Page</strong> needs <strong>Organization Access</strong>: the org admin approves your app in the LinkedIn admin console → “My companies” → “Authorized third-party apps”. Personal posts need nothing extra.',
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube',
    headline: 'Google Cloud project + OAuth client',
    account: 'Google account',
    review: '“Testing” mode — no review',
    appUrl: 'https://console.cloud.google.com',
    redirectUri: `${BASE}/youtube`,
    env: [
      { key: 'GOOGLE_CLIENT_ID', value: '1234….apps.googleusercontent.com', where: 'Credentials → your OAuth client' },
      { key: 'GOOGLE_CLIENT_SECRET', value: 'GOCSPX-…', where: 'same panel (or download JSON)' },
      { key: 'YOUTUBE_ENABLED', value: 'true', where: 'you set this' },
    ],
    scopes: 'YouTube Data API v3 — youtube.upload (publish videos)',
    create: [
      { text: 'Open <strong>console.cloud.google.com</strong> and sign in. Click the project picker (top-left) → <strong>New Project</strong> → name it (e.g. “Pulse”) → <strong>Create</strong>.' },
      { text: 'Make sure the new project is selected in the top bar.' },
      { text: 'Go to <strong>APIs & Services → Library</strong> → search <strong>“YouTube Data API v3”</strong> → open it → <strong>Enable</strong>.' },
    ],
    scopesStep: [
      { text: 'Go to <strong>APIs & Services → OAuth consent screen</strong>.' },
      { text: 'Choose <strong>External</strong> (even for personal use) → fill app name + your email → <strong>Save and continue</strong> past scopes and test users.' },
      { text: 'In <strong>Test users</strong>, add your own Google account — otherwise the consent screen refuses access.' },
    ],
    redirectStep: [
      { text: 'Go to <strong>APIs & Services → Credentials → Create Credentials → OAuth client ID</strong>.' },
      { text: 'Application type: <strong>Web application</strong>. Under <strong>Authorized redirect URIs</strong> paste the URI below → <strong>Create</strong>.' },
      { text: 'The confirmation panel shows <strong>Client ID</strong> + <strong>Client Secret</strong> — copy both (or <strong>Download JSON</strong> for a backup).' },
    ],
    credentials: [
      { name: 'Client ID', where: 'Credentials → click your OAuth client → “Client ID”', looksLike: 'ends in .apps.googleusercontent.com' },
      { name: 'Client Secret', where: 'same panel → “Client Secret”', looksLike: 'starts with GOCSPX-' },
    ],
    verify: [
      { text: 'Fill .env, set <strong>YOUTUBE_ENABLED=true</strong>, restart the API.' },
      { text: 'Accounts → connect → YouTube → approve with the test account you added.' },
    ],
    notes: [
      'In “Testing” mode the consent screen shows a warning — expected, harmless. Requesting <strong>Verification</strong> removes it for production.',
      'Videos upload to the channel of the account that consents. The composer needs a public video file URL for YouTube.',
    ],
  },
];

const COMMON_ENV = [
  { key: 'APP_URL', value: 'http://localhost:4000' },
  { key: 'FRONTEND_URL', value: 'http://localhost:3000' },
  { key: 'JWT_ACCESS_SECRET', value: 'long random string' },
  { key: 'JWT_REFRESH_SECRET', value: 'long random string' },
  { key: 'TOKEN_ENCRYPTION_KEY', value: '32-byte base64 key' },
];

function Step({ step, num, label }: { step: Step; num: number; label?: string }) {
  return (
    <div className="guide-step">
      <span className="guide-step__num">{label ?? num}</span>
      <div>
        <p
          className="guide-step__text"
          dangerouslySetInnerHTML={{ __html: step.text }}
        />
        {step.sub?.length && (
          <ul className="guide-step__sub">
            {step.sub.map((s, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: s }} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Phase({ title, steps, start }: { title: string; steps: Step[]; start: number }) {
  return (
    <div className="guide-phase">
      <span className="guide-phase__label">{title}</span>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {steps.map((s, i) => (
          <Step key={i} step={s} num={start + i} />
        ))}
      </div>
    </div>
  );
}

function EnvTable({ env }: { env: { key: string; value: string; where?: string }[] }) {
  return (
    <table className="guide-table">
      <thead>
        <tr>
          <th>Env var</th>
          <th>Value</th>
          {env[0]?.where && <th>Comes from</th>}
        </tr>
      </thead>
      <tbody>
        {env.map((e) => (
          <tr key={e.key}>
            <td>{e.key}</td>
            <td>{e.value}</td>
            {e.where && <td>{e.where}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CredentialTable({ creds }: { creds: Credential[] }) {
  return (
    <table className="guide-table">
      <thead>
        <tr>
          <th>Credential</th>
          <th>Where to find it</th>
          <th>Looks like</th>
        </tr>
      </thead>
      <tbody>
        {creds.map((c) => (
          <tr key={c.name}>
            <td>{c.name}</td>
            <td>{c.where}</td>
            <td style={{ color: 'var(--color-ink-3)' }}>{c.looksLike}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlatformCard({ p, index }: { p: PlatformGuide; index: number }) {
  let phaseStart = 0;
  const phases: { title: string; steps: Step[] }[] = [
    { title: 'Create the developer app', steps: p.create },
    { title: 'Enable products & scopes', steps: p.scopesStep },
    { title: 'Register the redirect URI', steps: p.redirectStep },
    { title: 'Verify it works', steps: p.verify },
  ];

  return (
    <section className="guide-card" id={`platform-${p.id}`}>
      <div className="guide-card__head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <PlatformMark platform={p.id} size={22} />
          <div>
            <h2>{p.name}</h2>
            <span className="label-mono" style={{ fontSize: '0.68rem' }}>
              {p.headline}
            </span>
          </div>
        </div>
        <div className="guide-card__tags">
          <span className="guide-tag">needs {p.account}</span>
          <span className="guide-tag guide-tag--muted">{p.review}</span>
        </div>
      </div>

      <div className="guide-card__body">
        {phases.map((ph, i) => {
          const start = phaseStart;
          phaseStart += ph.steps.length;
          return <Phase key={ph.title} title={ph.title} steps={ph.steps} start={start + 1} />;
        })}

        <div className="guide-phase">
          <span className="guide-phase__label">Redirect URI — exact match</span>
          <div className="guide-code-row">
            <code className="guide-code">{p.redirectUri}</code>
            <CopyButton text={p.redirectUri} label="copy URI" />
          </div>
        </div>

        <div className="guide-phase">
          <span className="guide-phase__label">Copy your credentials</span>
          <CredentialTable creds={p.credentials} />
        </div>

        <div className="guide-phase">
          <span className="guide-phase__label">Configure .env at the repo root</span>
          <EnvTable env={p.env} />
          <div className="guide-code-row">
            <code className="guide-code">
              {p.env.map((e) => `${e.key}=${e.value}`).join('\n')}
            </code>
            <CopyButton text={p.env.map((e) => `${e.key}=${e.value}`).join('\n')} label="copy .env block" />
          </div>
        </div>

        {p.notes.map((n, i) => (
          <div className="guide-note" key={i}>
            <span aria-hidden>ℹ</span>
            <span dangerouslySetInnerHTML={{ __html: n }} />
          </div>
        ))}

        <div className="guide-note guide-note--ok">
          <span aria-hidden>✓</span>
          <span>
            <strong>Done →</strong> restart the API (<span className="mono">pnpm --filter
            @pulse/api start:dev</span>), open Pulse → <span className="mono">Accounts</span>, click{' '}
            <strong>connect</strong> on {p.name} and complete the consent screen. You land back on
            Pulse with the channel listed, ready for the composer.
          </span>
        </div>
      </div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <div className="guide">
      <header className="guide__top">
        <div className="guide__brand">
          <PulseMark size={20} />
          Pulse
          <span className="label-mono">platform setup guide</span>
        </div>
        <nav className="guide__topnav" aria-label="Platforms">
          {PLATFORMS.map((p) => (
            <a key={p.id} href={`#platform-${p.id}`}>
              {p.name}
            </a>
          ))}
        </nav>
        <Link className="btn btn--sm btn--ghost" href="/login">
          sign in
        </Link>
      </header>

      <div className="guide__layout">
        <aside className="guide__toc" aria-label="On this page">
          <span className="guide-toc__label">Platforms</span>
          <a href="#before-you-start">Before you start</a>
          {PLATFORMS.map((p) => (
            <a key={p.id} href={`#platform-${p.id}`}>
              {p.name}
              <span className="guide-toc__time">~10 min</span>
            </a>
          ))}
          <a href="#troubleshooting">Troubleshooting</a>
        </aside>

        <div className="guide__body">
          <div className="guide__intro">
            <span className="label-mono">Self-hosting · connect real channels</span>
            <h1 className="display-1">Connect your social platforms.</h1>
            <p className="lede" style={{ maxWidth: '56ch' }}>
              Each platform needs a <strong>developer app</strong> so Pulse can hold an OAuth token
              and post on your behalf. This guide walks through every click — including{' '}
              <strong>where exactly each credential lives</strong> in each developer portal. No
              credentials? Pulse runs in <strong>dry-run mode</strong>, so everything else works
              meanwhile.
            </p>
          </div>

          <div className="guide__grid">
            <section className="guide-card" id="before-you-start">
              <div className="guide-card__head">
                <div>
                  <h2>Before you start</h2>
                  <span className="label-mono" style={{ fontSize: '0.68rem' }}>
                    same for every platform · 5 min
                  </span>
                </div>
              </div>
              <div className="guide-card__body">
                <Phase
                  title="Get the stack running"
                  start={1}
                  steps={[
                    { text: 'Start <strong>Docker Desktop</strong>, then run <code class="mono">docker compose up -d</code> in the repo root.' },
                    { text: 'Apply the schema and seed data: <code class="mono">pnpm db:migrate -- --name init</code> then <code class="mono">pnpm db:seed</code>.' },
                    { text: 'Copy <code class="mono">.env.example</code> → <code class="mono">.env</code> at the <strong>repo root</strong> (never inside apps/api).' },
                  ]}
                />
                <Phase
                  title="Set the shared secrets"
                  start={4}
                  steps={[
                    { text: 'Fill the five shared values below with long random strings (a password manager’s generator is fine).' },
                    { text: 'Start the API + web, sign in at <code class="mono">localhost:3000</code> and open <strong>Accounts</strong> — the six platform cards are already there, in dry-run mode.' },
                    { text: 'Every time you change <code class="mono">.env</code>, <strong>restart the API</strong>.' },
                  ]}
                />
                <span className="guide-phase__label">Shared .env values</span>
                <EnvTable env={COMMON_ENV} />
                <div className="guide-note">
                  <span aria-hidden>ℹ</span>
                  <span>
                    Callback URLs below assume the default <code className="mono">APP_URL=http://localhost:4000</code>.
                    On a real domain use{' '}
                    <code className="mono">https://your-domain.com/api/oauth/callback/&lt;platform&gt;</code>{' '}
                    and register that exact string in each portal.
                  </span>
                </div>
              </div>
            </section>

            {PLATFORMS.map((p, i) => (
              <PlatformCard key={p.id} p={p} index={i} />
            ))}

            <section className="guide-card" id="troubleshooting">
              <div className="guide-card__head">
                <div>
                  <h2>Troubleshooting</h2>
                  <span className="label-mono" style={{ fontSize: '0.68rem' }}>
                    when connect or publish fails
                  </span>
                </div>
              </div>
              <div className="guide-card__body">
                <div className="guide-note">
                  <span aria-hidden>✕</span>
                  <span>
                    <strong>4xx during token exchange</strong> — almost always a redirect-URI
                    mismatch. Every platform validates the callback URL character-for-character
                    (scheme, host, path, no trailing slash). Re-check the registered URI in the
                    portal against the one on this page.
                  </span>
                </div>
                <div className="guide-note">
                  <span aria-hidden>✕</span>
                  <span>
                    <strong>“Invalid grant” / “state mismatch”</strong> — the OAuth state expires
                    after 10 minutes. Re-run connect from Accounts and complete the consent screen
                    promptly.
                  </span>
                </div>
                <div className="guide-note">
                  <span aria-hidden>✕</span>
                  <span>
                    <strong>Permissions denied on publish</strong> — the app is in development/test
                    mode and the account isn’t added as a test role, or the scope needs App Review /
                    Advanced Access (Meta is the usual suspect — see its notes).
                  </span>
                </div>
                <div className="guide-note">
                  <span aria-hidden>✕</span>
                  <span>
                    <strong>Rotate a token</strong> — disconnect the account in <strong>Accounts</strong>{' '}
                    and reconnect. Pulse stores tokens encrypted (AES-256-GCM) and refreshes them
                    automatically where the platform supports refresh tokens.
                  </span>
                </div>
                <div className="guide-note">
                  <span aria-hidden>✕</span>
                  <span>
                    <strong>Results contain <code className="mono">dry-run:</code></strong> — the
                    platform’s credentials are missing or <code className="mono">*_ENABLED=false</code>.
                    Compare the env var names in the tables above, then restart the API.
                  </span>
                </div>
              </div>
            </section>
          </div>

          <footer className="guide__foot">
            <span className="label-mono">Pulse · self-hosted social operations</span>
            <Link className="label-mono" href="/login" style={{ color: 'var(--color-accent)' }}>
              sign in →
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
