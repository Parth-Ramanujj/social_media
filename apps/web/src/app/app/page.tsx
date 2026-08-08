'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { fmtDate } from '@/lib/format';
import type { PostDTO, SocialAccountDTO } from '@/lib/types';
import { StatusChip } from '@/components/status-chip';
import { PlatformMark } from '@/components/icons';

const FILTERS = [
  'all',
  'published',
  'scheduled',
  'queued',
  'draft',
  'failed',
  'publishing',
] as const;

function DashboardInner() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const router = useRouter();
  const params = useSearchParams();

  const [posts, setPosts] = useState<PostDTO[] | null>(null);
  const [accounts, setAccounts] = useState<SocialAccountDTO[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PostDTO | null>(null);

  const filter = params.get('status') ?? 'all';
  const filterValid = (FILTERS as readonly string[]).includes(filter);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const status = filterValid && filter !== 'all' ? filter : undefined;
      const [p, a] = await Promise.all([
        api<PostDTO[]>(
          `/workspaces/${workspace.id}/posts${status ? `?status=${status}` : ''}`,
        ),
        api<SocialAccountDTO[]>(`/workspaces/${workspace.id}/accounts`),
      ]);
      setPosts(p);
      setAccounts(a);
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load posts', 'fail');
    }
  }, [workspace, filter, filterValid, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // light polling while anything is mid-flight
  useEffect(() => {
    const hasInflight = posts?.some((p) =>
      p.variants.some((v) => ['scheduled', 'publishing', 'pending'].includes(v.publishStatus)),
    );
    if (!hasInflight) return;
    const t = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(t);
  }, [posts, load]);

  const stats = useMemo(() => {
    const all = posts ?? [];
    return {
      published: all.filter((p) => p.status === 'published').length,
      scheduled: all.filter((p) => p.status === 'scheduled').length,
      queued: all.filter((p) => p.status === 'queued').length,
      accounts: accounts?.length ?? 0,
    };
  }, [posts, accounts]);

  async function act(post: PostDTO, action: 'approve' | 'publish-now' | 'delete') {
    if (!workspace) return;
    setBusyId(post.id);
    try {
      if (action === 'delete') {
        await api(`/workspaces/${workspace.id}/posts/${post.id}`, { method: 'DELETE' });
        toast('Post deleted', 'ok');
      } else {
        await api(`/workspaces/${workspace.id}/posts/${post.id}/${action}`, {
          method: 'POST',
        });
        toast(action === 'approve' ? 'Approved — queued for publish' : 'Publishing now…', 'ok');
      }
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Action failed', 'fail');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  }

  const accountName = useCallback(
    (id: string) => accounts?.find((a) => a.id === id)?.displayName ?? id.slice(0, 8),
    [accounts],
  );

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">Publish desk · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">What ships, when.</h1>
        </div>
        <Link href="/app/composer" className="btn btn--primary">
          New post →
        </Link>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="stat__label">Published</div>
          <div className="stat__value">{stats.published}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Scheduled</div>
          <div className="stat__value stat__value--accent">{stats.scheduled}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Awaiting approval</div>
          <div className="stat__value">{stats.queued}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Connected accounts</div>
          <div className="stat__value">{stats.accounts}</div>
        </div>
      </div>

      <div className="filter-row" style={{ marginBottom: 'var(--space-5)' }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-chip${filter === f ? ' is-active' : ''}`}
            onClick={() => {
              const next = f === 'all' ? '/app' : `/app?status=${f}`;
              router.push(next);
            }}
          >
            {f}
          </button>
        ))}
        <button className="btn btn--ghost btn--sm btn--mono" onClick={() => void load()}>
          ↻ refresh
        </button>
      </div>

      <div className="panel">
        {posts === null ? (
          <div style={{ padding: 'var(--space-4)' }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skel" style={{ height: 44, margin: 'var(--space-2) 0' }} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="empty">
            <span className="label-mono">No posts{filter !== 'all' ? ` · ${filter}` : ''}</span>
            <Link href="/app/composer" className="btn">
              Compose the first one
            </Link>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="post-row">
              <div className="post-row__body">
                <div className="post-row__title">{post.title ?? 'Untitled post'}</div>
                <div className="post-row__meta">
                  <StatusChip status={post.status} />
                  <span>created {fmtDate(post.createdAt)}</span>
                </div>
                {post.variants.length > 0 && (
                  <div className="post-row__variants">
                    {post.variants.map((v) => (
                      <span key={v.id} className="chip chip--platform" title={v.contentText}>
                        <PlatformMark platform={v.platform} size={11} />
                        {v.platform}
                        {v.scheduledAt ? ` · ${fmtDate(v.scheduledAt)}` : ''}
                        {v.errorMessage ? ` · ${v.errorMessage.slice(0, 40)}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="post-row__actions">
                {post.status === 'queued' && (
                  <button
                    className="btn btn--sm btn--primary"
                    disabled={busyId === post.id}
                    onClick={() => void act(post, 'approve')}
                  >
                    approve
                  </button>
                )}
                {['draft', 'scheduled', 'failed', 'queued'].includes(post.status) && (
                  <button
                    className="btn btn--sm"
                    disabled={busyId === post.id}
                    onClick={() => void act(post, 'publish-now')}
                  >
                    publish now
                  </button>
                )}
                <button
                  className="btn btn--sm btn--danger"
                  disabled={busyId === post.id}
                  onClick={() => setConfirmDelete(post)}
                >
                  delete
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {confirmDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete post">
          <div className="modal">
            <span className="label-mono">Delete post</span>
            <p style={{ margin: 'var(--space-3) 0' }}>
              Delete <strong>{confirmDelete.title ?? 'this post'}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={() => void act(confirmDelete, 'delete')}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="skel" style={{ height: 200 }} />}>
      <DashboardInner />
    </Suspense>
  );
}
