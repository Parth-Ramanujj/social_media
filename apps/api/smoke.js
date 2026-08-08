const BASE = 'http://localhost:4000/api';
const results = [];

function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
}

async function req(path, { method = 'GET', token, body, redirect = 'manual' } = {}) {
  const url = /^https?:\/\//.test(path) ? path : `${BASE}${path}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, data, location: res.headers.get('location') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const email = `smoke${Date.now()}@test.dev`;

  // 1. signup
  let r = await req('/auth/signup', {
    method: 'POST',
    body: { name: 'Smoke Tester', email, password: 'smoke1234' },
  });
  check('signup', r.status === 201, `status=${r.status}`);
  const token = r.data?.accessToken;
  check('signup returns accessToken', !!token);

  // 2. create workspace
  r = await req('/workspaces', { method: 'POST', token, body: { name: `Smoke WS ${Date.now()}` } });
  check('create workspace', r.status === 201, `status=${r.status}`);
  const workspaceId = r.data?.id;
  check('workspace id returned', !!workspaceId);

  // 3. connect dry-run URL for meta
  r = await req(`/workspaces/${workspaceId}/oauth/connect/meta`, { token });
  check('connect returns dry-run url', r.status === 200 && /\/api\/oauth\/callback\/meta\?/.test(r.data?.url ?? ''), r.data?.url ?? '');

  // 4. complete the dry-run callback (public route, no token needed)
  r = await req(r.data.url);
  check('callback 302 + account created', r.status === 302, `status=${r.status}`);

  // 5. accounts list
  r = await req(`/workspaces/${workspaceId}/accounts`, { token });
  const account = (r.data ?? []).find((a) => a.platform === 'meta');
  check('accounts lists meta account', r.status === 200 && !!account, account?.displayName ?? 'none');
  const accountId = account?.id;
  check('account id present', !!accountId);

  // 6. schedule a post for +8s
  const scheduledAt = new Date(Date.now() + 8_000).toISOString();
  r = await req('/workspaces/' + workspaceId + '/posts', {
    method: 'POST',
    token,
    body: {
      title: 'Smoke test post',
      status: 'scheduled',
      needsApproval: false,
      variants: [
        { socialAccountId: accountId, contentText: 'Hello from smoke test!', scheduledAt },
      ],
    },
  });
  check('create scheduled post', r.status === 201, `status=${r.status}`);
  const postId = r.data?.id;
  const variant = r.data?.variants?.[0];
  check('variant created with publishStatus=scheduled', variant?.publishStatus === 'scheduled', variant?.publishStatus ?? 'none');

  // 7. poll until published (dry-run publishes instantly after delay)
  let final;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await sleep(1000);
    r = await req(`/workspaces/${workspaceId}/posts/${postId}`, { token });
    final = r.data?.variants?.[0];
    if (final?.publishStatus === 'published' || final?.publishStatus === 'failed') break;
  }
  check('variant reaches published', final?.publishStatus === 'published', `status=${final?.publishStatus} err=${final?.errorMessage ?? '-'}`);
  check('platformPostId set (dry-run)', !!final?.platformPostId, final?.platformPostId ?? 'none');
  check('post status flips to published', r.data?.status === 'published', r.data?.status ?? 'none');

  // 8. audit trail
  r = await req(`/workspaces/${workspaceId}/audit`, { token });
  const actions = (r.data ?? []).map((a) => a.action);
  check('audit has post.published', actions.includes('post.published'), actions.slice(0, 6).join(','));

  // 9. approval gate: queued requires needsApproval
  r = await req('/workspaces/' + workspaceId + '/posts', {
    method: 'POST',
    token,
    body: {
      status: 'queued',
      needsApproval: false,
      variants: [{ socialAccountId: accountId, contentText: 'should fail' }],
    },
  });
  check('queued without approval rejected', r.status === 400, `status=${r.status}`);

  // 10. pending-approval post schedules only after approve
  r = await req('/workspaces/' + workspaceId + '/posts', {
    method: 'POST',
    token,
    body: {
      status: 'queued',
      needsApproval: true,
      variants: [
        { socialAccountId: accountId, contentText: 'approve me', scheduledAt: new Date(Date.now() + 6_000).toISOString() },
      ],
    },
  });
  check('queued with approval created', r.status === 201, `status=${r.status}`);
  const pendId = r.data?.id;
  const pendVariant = r.data?.variants?.[0];
  check('variant pending until approved', pendVariant?.publishStatus === 'pending', pendVariant?.publishStatus ?? 'none');

  r = await req(`/workspaces/${workspaceId}/posts/${pendId}/approve`, { method: 'POST', token });
  const apprVariant = r.data?.variants?.[0];
  check('approve schedules variant', apprVariant?.publishStatus === 'scheduled', apprVariant?.publishStatus ?? 'none');

  let apprFinal;
  const deadline2 = Date.now() + 20_000;
  while (Date.now() < deadline2) {
    await sleep(1000);
    r = await req(`/workspaces/${workspaceId}/posts/${pendId}`, { token });
    apprFinal = r.data?.variants?.[0];
    if (apprFinal?.publishStatus === 'published' || apprFinal?.publishStatus === 'failed') break;
  }
  check('approved post publishes', apprFinal?.publishStatus === 'published', `status=${apprFinal?.publishStatus} err=${apprFinal?.errorMessage ?? '-'}`);

  const passed = results.filter((x) => x.pass).length;
  const failed = results.filter((x) => !x.pass).length;
  console.log(`\n=== ${passed} passed, ${failed} failed (${results.length} total) ===`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('SMOKE CRASH:', e);
  process.exit(1);
});
