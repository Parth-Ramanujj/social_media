import type { Metadata } from 'next';
import Link from 'next/link';
import { PlatformMark, PulseMark } from '@/components/icons';
import { CopyButton } from '@/components/copy-button';

export const metadata: Metadata = {
  title: 'Advanced Platform Setup Guide (Gujarati) — Pulse',
  description:
    'Meta, X, LinkedIn ane YouTube ne Pulse sathe connect karvani advanced step-by-step guide.',
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
  env: { key: string; value: string; where?: string }[];
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
    name: 'Meta (Facebook + Instagram)',
    headline: 'Facebook Page ane Instagram Business account mate',
    account: 'Facebook Page + Instagram Business',
    review: 'Test mode ma review ni jarur nathi',
    appUrl: 'https://developers.facebook.com/apps',
    redirectUri: `${BASE}/meta`,
    env: [
      { key: 'META_APP_ID', value: '123456...', where: 'App Dashboard → Settings → Basic' },
      { key: 'META_APP_SECRET', value: '••••••••', where: 'App Dashboard → Settings → Basic' },
      { key: 'META_APP_VERSION', value: 'v22.0', where: 'Hamesha latest version lakho' },
      { key: 'META_ENABLED', value: 'true', where: 'Manual setup' },
    ],
    scopes: 'Facebook Login, Instagram Graph API (post karva mate)',
    create: [
      { text: 'Pela <a href="https://developers.facebook.com/apps" target="_blank" style="color: var(--color-accent); text-decoration: underline;">developers.facebook.com/apps</a> par jao ane <strong>"Create App"</strong> par click karo.' },
      { text: '<strong>Use cases:</strong> "Other" select karo ane Next aapo. Pachi app type ma <strong>Business</strong> select karo.' },
      { text: '<strong>App details:</strong> Tamari app nu naam lakho ane contact email nakho.' },
      { text: '<strong>Business (Optional):</strong> Jo tamaru Meta Business account banelu hoy to ahiya select kari shako chho, athva e vaha select karya vagar aagal vadho.' },
      { text: '<strong>Overview/Requirements:</strong> Create app par click karo ane password nakhi submit karo.' },
    ],
    scopesStep: [
      { text: 'Dashboard mathi <strong>"Add Product"</strong> par jao.' },
      { text: '<strong>Facebook Login</strong> ane <strong>Instagram Graph API</strong> ne setup karo.' },
    ],
    redirectStep: [
      { text: 'Left menu mathi <strong>Facebook Login → Settings</strong> ma jao.' },
      { text: 'Tya <strong>"Valid OAuth redirect URIs"</strong> nu option hashe tya niche aapeli URI paste karo.' },
    ],
    credentials: [
      { name: 'App ID (Client ID)', where: 'Settings → Basic ma jao', looksLike: '15-20 numbers' },
      { name: 'App Secret', where: 'Settings → Basic ma "Show" click karo', looksLike: '32 character string' },
    ],
    verify: [
      { text: 'Aa badhi details <strong>.env</strong> file ma nakhine API server restart karo (<code class="mono">pnpm --filter @pulse/api start:dev</code>).' },
      { text: 'Pulse app ma Accounts ma jaine Meta connect karo.' },
    ],
    notes: [
      'Jo tamare test karvu hoy to App "Development mode" ma j rakho. Tame potana account thi post kari shaksho.',
      'Instagram par post karva mate tamaru Insta account "Business" ke "Creator" hovu joiye ane te tamara Facebook Page sathe linked hovu joiye.',
    ],
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    headline: 'Twitter par post karva mate',
    account: 'Twitter account',
    review: 'Turant mali jashe (Essential access)',
    appUrl: 'https://developer.x.com/en/portal',
    redirectUri: `${BASE}/x`,
    env: [
      { key: 'X_CLIENT_ID', value: 'ABCDEF...', where: 'Portal → Settings → Keys and tokens' },
      { key: 'X_CLIENT_SECRET', value: '••••••••', where: 'Portal → Settings → Keys and tokens' },
      { key: 'X_ENABLED', value: 'true', where: 'Manual setup' },
    ],
    scopes: 'tweet.read, tweet.write, users.read',
    create: [
      { text: '<a href="https://developer.x.com/en/portal" target="_blank" style="color: var(--color-accent); text-decoration: underline;">developer.x.com/en/portal</a> par jao ane account banavo.' },
      { text: 'Ek nava <strong>Project</strong> ni andhar ek navi <strong>App</strong> banavo (Essential access).' },
    ],
    scopesStep: [
      { text: 'App ni settings ma <strong>User authentication settings</strong> open karo.' },
      { text: 'Tya <strong>OAuth 2.0</strong> enable karo ane App permissions ma <strong>Read and write</strong> select karo.' },
    ],
    redirectStep: [
      { text: 'Tej page par <strong>Callback / Redirect URL</strong> nu box hashe, tya nicheni URL paste karo.' },
    ],
    credentials: [
      { name: 'Client ID', where: 'Keys and tokens tab (OAuth 2.0 section)', looksLike: 'Random characters' },
      { name: 'Client Secret', where: 'Tej jagya e (Generate karyo hoy tyare j dekhay)', looksLike: 'Long random string' },
    ],
    verify: [
      { text: 'Credentials <strong>.env</strong> ma set karo ane API restart karo, pachi X ne connect karo.' },
    ],
    notes: [
      'Free tier (Essential) ma tame fatka text post kari shaksho. Photo/Video mate paid tier joiye.',
    ],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    headline: 'Professional network par share karva mate',
    account: 'LinkedIn profile',
    review: 'Personal share mate review nathi',
    appUrl: 'https://www.linkedin.com/developers/apps',
    redirectUri: `${BASE}/linkedin`,
    env: [
      { key: 'LINKEDIN_CLIENT_ID', value: '789xyz...', where: 'Auth tab ma' },
      { key: 'LINKEDIN_CLIENT_SECRET', value: '••••••••', where: 'Auth tab ma' },
      { key: 'LINKEDIN_ENABLED', value: 'true', where: 'Manual setup' },
    ],
    scopes: 'openid, profile, email, w_member_social',
    create: [
      { text: '<a href="https://www.linkedin.com/developers/apps" target="_blank" style="color: var(--color-accent); text-decoration: underline;">linkedin.com/developers/apps</a> par jao ane <strong>"Create app"</strong> button par click karo.' },
      { text: 'App nu naam, company page ane logo add kari submit karo.' },
    ],
    scopesStep: [
      { text: 'App banavi lidha pachi <strong>Products</strong> tab ma jao.' },
      { text: '<strong>"Sign In with LinkedIn"</strong> ane <strong>"Share on LinkedIn"</strong> ma "Request Access" par click karo.' },
    ],
    redirectStep: [
      { text: '<strong>Auth</strong> tab ma <strong>"OAuth 2.0 settings"</strong> section ma jao.' },
      { text: '<strong>Authorized redirect URLs for your app</strong> ma nicheni URL add karo.' },
    ],
    credentials: [
      { name: 'Client ID', where: 'Auth tab ma top par', looksLike: '14 character string' },
      { name: 'Client Secret', where: 'Client ID ni niche, "Reveal" par click karo', looksLike: '16 character string' },
    ],
    verify: [
      { text: 'Banne key <strong>.env</strong> ma add karo ane Pulse ma LinkedIn connect karo.' },
    ],
    notes: [
      'Company Page par post karva mate LinkedIn admin taraf thi extra approval joiye.'
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube (Google)',
    headline: 'Video upload karva mate',
    account: 'Google account',
    review: 'Test mode ma verify nathi karavvu padtu',
    appUrl: 'https://console.cloud.google.com',
    redirectUri: `${BASE}/youtube`,
    env: [
      { key: 'GOOGLE_CLIENT_ID', value: '123-abc...', where: 'APIs & Services → Credentials' },
      { key: 'GOOGLE_CLIENT_SECRET', value: '••••••••', where: 'APIs & Services → Credentials' },
      { key: 'YOUTUBE_ENABLED', value: 'true', where: 'Manual setup' },
    ],
    scopes: 'youtube.upload',
    create: [
      { text: '<a href="https://console.cloud.google.com" target="_blank" style="color: var(--color-accent); text-decoration: underline;">console.cloud.google.com</a> par jao ane account login karo.' },
      { text: 'Upar thi ek navo <strong>Project</strong> create karo.' },
    ],
    scopesStep: [
      { text: 'Menu mathi <strong>APIs & Services → Library</strong> ma jao ane <strong>"YouTube Data API v3"</strong> Enable karo.' },
      { text: '<strong>OAuth consent screen</strong> ma jao. "External" select kari Test users ma tamaru email add karo.' },
    ],
    redirectStep: [
      { text: 'Menu mathi <strong>APIs & Services → Credentials</strong> ma jao.' },
      { text: '<strong>"Create Credentials" → "OAuth client ID"</strong> (Web application) select karo ane Authorized redirect URIs ma nicheni link add karo.' },
    ],
    credentials: [
      { name: 'Client ID', where: 'Credentials tab ma', looksLike: 'ends with .apps.googleusercontent.com' },
      { name: 'Client Secret', where: 'Download JSON karine k tya j click karine', looksLike: 'Random string' },
    ],
    verify: [
      { text: '.env ma variables set karo, API restart karo, ane YouTube connect karo.' },
    ],
    notes: [
      'Testing mode ma Google consent screen par warning aapse, "Continue" par click kari sako chho.'
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
    <div className="guide-step" style={{ background: 'var(--color-paper-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--color-rule)', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <span className="guide-step__num" style={{ background: 'var(--color-paper)', color: 'var(--color-accent)', fontWeight: 600, border: '1px solid var(--color-accent-line)' }}>{label ?? num}</span>
      <div>
        <p
          className="guide-step__text"
          style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--color-ink)' }}
          dangerouslySetInnerHTML={{ __html: step.text }}
        />
        {step.sub?.length && (
          <ul className="guide-step__sub" style={{ marginTop: 'var(--space-2)' }}>
            {step.sub.map((s, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: s }} style={{ color: 'var(--color-ink-2)' }} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SectionWrapper({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--color-ink)' }}>{title}</h3>
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-2)', marginLeft: 'var(--space-4)', borderLeft: '2px solid var(--color-rule)', paddingLeft: 'var(--space-4)' }}>
        {children}
      </div>
    </div>
  );
}

function EnvTable({ env }: { env: { key: string; value: string; where?: string }[] }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: 'var(--radius)', border: '1px solid var(--color-rule)' }}>
      <table className="guide-table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--color-paper-2)' }}>
          <tr>
            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Env var</th>
            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Value</th>
            {env[0]?.where && <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Kyathi malase?</th>}
          </tr>
        </thead>
        <tbody>
          {env.map((e, index) => (
            <tr key={e.key} style={{ borderBottom: index === env.length - 1 ? 'none' : '1px solid var(--color-rule)' }}>
              <td style={{ padding: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-graphite)' }}>{e.key}</td>
              <td style={{ padding: 'var(--space-3)', fontSize: '0.9rem' }}>{e.value}</td>
              {e.where && <td style={{ padding: 'var(--space-3)', fontSize: '0.85rem', color: 'var(--color-ink-3)' }}>{e.where}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CredentialTable({ creds }: { creds: Credential[] }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: 'var(--radius)', border: '1px solid var(--color-rule)' }}>
      <table className="guide-table" style={{ margin: 0, width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--color-paper-2)' }}>
          <tr>
            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Credential</th>
            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Kyathi Malase</th>
            <th style={{ padding: 'var(--space-3)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-rule)' }}>Kevu dekhase</th>
          </tr>
        </thead>
        <tbody>
          {creds.map((c, index) => (
            <tr key={c.name} style={{ borderBottom: index === creds.length - 1 ? 'none' : '1px solid var(--color-rule)' }}>
              <td style={{ padding: 'var(--space-3)', fontWeight: 500, fontSize: '0.9rem' }}>{c.name}</td>
              <td style={{ padding: 'var(--space-3)', fontSize: '0.85rem', color: 'var(--color-ink-2)' }}>{c.where}</td>
              <td style={{ padding: 'var(--space-3)', fontSize: '0.85rem', color: 'var(--color-ink-3)', fontFamily: 'var(--font-mono)' }}>{c.looksLike}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlatformCard({ p, index }: { p: PlatformGuide; index: number }) {
  let stepNum = 1;

  return (
    <section className="guide-card" id={`platform-${p.id}`} style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.03)', border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {/* CARD HEADER */}
      <div style={{ background: 'var(--color-paper-2)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-rule)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: 48, height: 48, background: 'var(--color-paper)', borderRadius: 'var(--radius)', border: '1px solid var(--color-rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
             <PlatformMark platform={p.id} size={28} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-graphite)', letterSpacing: '-0.02em' }}>{p.name}</h2>
            <span className="label-mono" style={{ fontSize: '0.75rem', color: 'var(--color-ink-3)', marginTop: '4px', display: 'block' }}>
              {p.headline}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', background: 'var(--color-paper)', border: '1px solid var(--color-rule)', borderRadius: 'var(--radius)', color: 'var(--color-ink)' }}>Joiye: {p.account}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-ink-3)' }}>{p.review}</span>
        </div>
      </div>

      {/* CARD BODY */}
      <div className="guide-card__body" style={{ padding: 'var(--space-5)' }}>
        
        {/* STEP 1: CREATE APP */}
        <SectionWrapper title="Developer app banavo" icon="🛠️">
          {p.create.map((s, i) => <Step key={i} step={s} num={stepNum++} />)}
        </SectionWrapper>

        {/* STEP 2: SCOPES */}
        <SectionWrapper title="Products & Permissions enable karo" icon="🔐">
           <div style={{ padding: 'var(--space-3)', background: 'var(--color-accent-soft)', borderRadius: 'var(--radius)', border: '1px solid var(--color-accent-line)', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 600 }}>Required Scopes:</span>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-ink-2)', marginTop: '4px' }}>{p.scopes}</p>
           </div>
          {p.scopesStep.map((s, i) => <Step key={i} step={s} num={stepNum++} />)}
        </SectionWrapper>

        {/* STEP 3: REDIRECT URI */}
        <SectionWrapper title="Redirect URI add karo" icon="🔗">
          {p.redirectStep.map((s, i) => <Step key={i} step={s} num={stepNum++} />)}
          <div className="guide-code-row" style={{ marginTop: 'var(--space-2)' }}>
            <code className="guide-code" style={{ flex: 1, fontSize: '0.9rem' }}>{p.redirectUri}</code>
            <CopyButton text={p.redirectUri} label="Redirect URI copy karo" />
          </div>
        </SectionWrapper>

        {/* STEP 4: CREDENTIALS */}
        <SectionWrapper title="Credentials (Keys) Copy karo" icon="🔑">
          <CredentialTable creds={p.credentials} />
        </SectionWrapper>

        {/* STEP 5: ENV VARIABLES */}
        <SectionWrapper title=".env file ma details add karo" icon="📄">
          <EnvTable env={p.env} />
          <div className="guide-code-row" style={{ marginTop: 'var(--space-3)' }}>
            <code className="guide-code" style={{ flex: 1, fontSize: '0.85rem' }}>
              {p.env.map((e) => `${e.key}=${e.value}`).join('\n')}
            </code>
            <CopyButton text={p.env.map((e) => `${e.key}=${e.value}`).join('\n')} label=".env block copy karo" />
          </div>
        </SectionWrapper>

        {/* NOTES & VERIFY */}
        <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px dashed var(--color-rule-2)' }}>
          {p.notes.map((n, i) => (
            <div className="guide-note" key={i} style={{ marginBottom: 'var(--space-2)' }}>
              <span aria-hidden>ℹ</span>
              <span dangerouslySetInnerHTML={{ __html: n }} />
            </div>
          ))}

          <div className="guide-note guide-note--ok" style={{ marginTop: 'var(--space-4)' }}>
            <span aria-hidden>✓</span>
            <span>
              <strong>Puru thayu →</strong> API server restart karo (<span className="mono">pnpm --filter
              @pulse/api start:dev</span>), Pulse ma jao → <span className="mono">Accounts</span>,{' '}
              <strong>connect</strong> par click karo ane login karo. Bss thase connect!
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function AdvanceGuidePage() {
  return (
    <div className="guide" style={{ background: 'var(--color-paper-3)', minHeight: '100vh', paddingBottom: 'var(--space-12)' }}>
      <header className="guide__top" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-paper)', borderBottom: '1px solid var(--color-rule)', padding: 'var(--space-3) var(--space-5)' }}>
        <div className="guide__brand" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
          <PulseMark size={24} />
          <span style={{ fontSize: '1.1rem' }}>Pulse</span>
          <span className="label-mono" style={{ marginLeft: 'var(--space-2)', color: 'var(--color-accent)' }}>Advance platform setup (Gujarati)</span>
        </div>
        <nav className="guide__topnav" aria-label="Platforms" style={{ display: 'flex', gap: 'var(--space-4)' }}>
          {PLATFORMS.map((p) => (
            <a key={p.id} href={`#platform-${p.id}`} style={{ color: 'var(--color-ink-2)', fontSize: '0.9rem', textDecoration: 'none', fontWeight: 500 }}>
              {p.name.split(' ')[0]}
            </a>
          ))}
        </nav>
        <Link className="btn btn--sm btn--ghost" href="/login">
          Sign in
        </Link>
      </header>

      <div className="guide__layout" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 'var(--space-8)', padding: 'var(--space-8) var(--space-5)' }}>
        
        {/* SIDEBAR TOC */}
        <aside className="guide__toc" aria-label="On this page" style={{ position: 'sticky', top: '100px', alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <span className="guide-toc__label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-ink-3)', letterSpacing: '0.05em' }}>Pela aa vachi lo</span>
          <a href="#before-you-start" style={{ fontSize: '0.95rem', color: 'var(--color-ink)', textDecoration: 'none' }}>Basic Setup 🚀</a>
          
          <span className="guide-toc__label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-ink-3)', letterSpacing: '0.05em', marginTop: 'var(--space-4)' }}>Platforms</span>
          {PLATFORMS.map((p) => (
            <a key={p.id} href={`#platform-${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.95rem', color: 'var(--color-ink)', textDecoration: 'none' }}>
              {p.name.split(' ')[0]}
              <span className="guide-toc__time" style={{ fontSize: '0.75rem', color: 'var(--color-ink-3)', background: 'var(--color-paper-2)', padding: '2px 6px', borderRadius: '4px' }}>~10m</span>
            </a>
          ))}
          
          <span className="guide-toc__label" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-ink-3)', letterSpacing: '0.05em', marginTop: 'var(--space-4)' }}>Errors aave to?</span>
          <a href="#troubleshooting" style={{ fontSize: '0.95rem', color: 'var(--color-fail)', textDecoration: 'none' }}>Troubleshooting ⚠️</a>
        </aside>

        {/* MAIN CONTENT */}
        <div className="guide__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          <div className="guide__intro" style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
            <span className="label-mono" style={{ color: 'var(--color-accent)' }}>Setup guide · Ek dam easy steps ma</span>
            <h1 className="display-1" style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-graphite)', marginTop: 'var(--space-2)' }}>Social Platforms Connect Karo.</h1>
            <p className="lede" style={{ maxWidth: '64ch', margin: '0 auto', fontSize: '1.15rem', color: 'var(--color-ink-2)', lineHeight: 1.6, marginTop: 'var(--space-4)' }}>
              Dareke platform mate <strong>developer app</strong> banavvi padse jethi Pulse tamara account mathi post kari shake. 
              Aa guide ma me <strong>small mathi small steps</strong> lakhya chhe, credentials kyathi malase te pan kidhu chhe. 
            </p>
          </div>

          <div className="guide__grid" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            {/* BEFORE YOU START SECTION */}
            <section className="guide-card" id="before-you-start" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.03)', border: '1px solid var(--color-rule)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div className="guide-card__head" style={{ background: 'var(--color-paper-2)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-rule)' }}>
                <h2>Pela aa vachi lo 🚀</h2>
                <span className="label-mono" style={{ fontSize: '0.75rem', color: 'var(--color-ink-3)' }}>
                  Badha platforms mate basic step · 5 min
                </span>
              </div>
              <div className="guide-card__body" style={{ padding: 'var(--space-5)' }}>
                <SectionWrapper title="Server chaloo karo (Basic Setup)" icon="💻">
                   <Step num={1} step={{ text: '<strong>Docker Desktop</strong> chaloo karo, pachi terminal ma <code class="mono">docker compose up -d</code> run karo.' }} />
                   <Step num={2} step={{ text: 'Database mate: <code class="mono">pnpm db:migrate -- --name init</code> ane <code class="mono">pnpm db:seed</code> run karo.' }} />
                   <Step num={3} step={{ text: '<code class="mono">.env.example</code> copy karine navi <code class="mono">.env</code> file banavo (main folder ma).' }} />
                </SectionWrapper>
                
                <SectionWrapper title="Shared secrets nakho" icon="🔒">
                   <Step num={4} step={{ text: 'Niche aapeki 5 shared secrets (keys) ma long random string lakhi do.' }} />
                   <Step num={5} step={{ text: 'API ane web app start karo (<code class="mono">localhost:3000</code>). Tya <strong>Accounts</strong> ma joi shaksho ke platforms dry-run mode ma dekhase.' }} />
                </SectionWrapper>

                <div style={{ marginTop: 'var(--space-5)' }}>
                  <span className="guide-phase__label" style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: 'var(--space-3)', display: 'block' }}>Shared .env values (aa hovi joiye)</span>
                  <EnvTable env={COMMON_ENV} />
                </div>
              </div>
            </section>

            {/* PLATFORMS MAP */}
            {PLATFORMS.map((p, i) => (
              <PlatformCard key={p.id} p={p} index={i} />
            ))}

            {/* TROUBLESHOOTING */}
            <section className="guide-card" id="troubleshooting" style={{ border: '1px solid var(--color-fail-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div className="guide-card__head" style={{ background: 'var(--color-paper)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-fail-soft)' }}>
                <h2 style={{ color: 'var(--color-fail)' }}>Errors aave to shu karvu? ⚠️</h2>
                <span className="label-mono" style={{ fontSize: '0.75rem', color: 'var(--color-ink-3)' }}>
                  Connect karti vakhte prb aave to
                </span>
              </div>
              <div className="guide-card__body" style={{ padding: 'var(--space-5)' }}>
                <div className="guide-note" style={{ borderLeftColor: 'var(--color-fail)', background: 'var(--color-fail-soft)', marginBottom: 'var(--space-3)' }}>
                  <span aria-hidden style={{ color: 'var(--color-fail)' }}>✕</span>
                  <span>
                    <strong>Error 4xx aave connection vakhte</strong> — Aa mota bhage redirect-URI na mismatch na lidhe aave chhe. Developer portal ma je exact URI lakheli hoy (slash vagar), tej ahiya hovi joiye.
                  </span>
                </div>
                <div className="guide-note" style={{ borderLeftColor: 'var(--color-fail)', background: 'var(--color-fail-soft)', marginBottom: 'var(--space-3)' }}>
                  <span aria-hidden style={{ color: 'var(--color-fail)' }}>✕</span>
                  <span>
                    <strong>“Invalid grant” / “state mismatch”</strong> — OAuth state 10 minute ma expire thai jay. Pachu Pulse Accounts mathi connect par click karo ane process jaldi puri karo.
                  </span>
                </div>
                <div className="guide-note" style={{ borderLeftColor: 'var(--color-fail)', background: 'var(--color-fail-soft)', marginBottom: 'var(--space-3)' }}>
                  <span aria-hidden style={{ color: 'var(--color-fail)' }}>✕</span>
                  <span>
                    <strong>Publish ma permission denied aave</strong> — App development mode ma hashe ane tame jenu account login karyu chhe te test users ma nai hoy. App setting ma jaine tamaru account add kari do (especially Meta ma).
                  </span>
                </div>
                <div className="guide-note" style={{ borderLeftColor: 'var(--color-fail)', background: 'var(--color-fail-soft)' }}>
                  <span aria-hidden style={{ color: 'var(--color-fail)' }}>✕</span>
                  <span>
                    <strong>Results ma <code className="mono">dry-run:</code> aave chhe</strong> — Ena matalab credentials (client id, secret) missing chhe athva <code className="mono">*_ENABLED=true</code> nathi karyu. .env file check karo ane API fari restart karo.
                  </span>
                </div>
              </div>
            </section>
          </div>

          <footer className="guide__foot" style={{ marginTop: 'var(--space-8)', padding: 'var(--space-5) 0', borderTop: '1px solid var(--color-rule)', display: 'flex', justifyContent: 'space-between' }}>
            <span className="label-mono" style={{ color: 'var(--color-ink-3)' }}>Pulse · advance setup guide</span>
            <Link className="label-mono" href="/login" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
              Sign in →
            </Link>
          </footer>
        </div>
      </div>
    </div>
  );
}
