'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ROLES, type Role } from '@pulse/shared-types';
import { useWorkspace } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import type { MemberDTO } from '@/lib/types';

export default function MembersPage() {
  const { workspace } = useWorkspace();
  const { toast } = useToast();

  const [members, setMembers] = useState<MemberDTO[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      setMembers(await api<MemberDTO[]>(`/workspaces/${workspace.id}/members`));
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Failed to load members', 'fail');
    }
  }, [workspace, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setBusy('invite');
    try {
      const res = await api<{ invitationId: string; inviteUrl?: string }>(
        `/workspaces/${workspace.id}/invitations`,
        { method: 'POST', body: { email, role } },
      );
      setInviteUrl(res.inviteUrl ?? null);
      toast(res.inviteUrl ? 'Invitation created — link below' : 'Invitation sent', 'ok');
      setEmail('');
    } catch (err) {
      toast(err instanceof ApiError ? err.messageOf() : 'Invite failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(userId: string, nextRole: Role) {
    if (!workspace) return;
    setBusy(`role:${userId}`);
    try {
      await api(`/workspaces/${workspace.id}/members/${userId}`, {
        method: 'PATCH',
        body: { role: nextRole },
      });
      toast('Role updated', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Update failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  async function remove(userId: string, name: string) {
    if (!workspace) return;
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    setBusy(`del:${userId}`);
    try {
      await api(`/workspaces/${workspace.id}/members/${userId}`, { method: 'DELETE' });
      toast('Member removed', 'ok');
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.messageOf() : 'Remove failed', 'fail');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div className="page-head__title">
          <span className="label-mono">People · {workspace?.name ?? '…'}</span>
          <h1 className="display-1">Who&apos;s on the desk.</h1>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 'var(--space-8)', padding: 'var(--space-5)' }}>
        <span className="label-mono" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          Invite a teammate
        </span>
        <form
          onSubmit={invite}
          style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="inv-email">Email</label>
            <input
              id="inv-email"
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select
              id="inv-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.filter((r) => r !== 'owner').map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn--primary" type="submit" disabled={busy === 'invite'}>
            Invite
          </button>
        </form>
        {inviteUrl && (
          <p
            className="auth-err"
            style={{ marginTop: 'var(--space-4)', borderColor: 'var(--color-accent-line)', background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
          >
            Dev invite link: <span className="mono">{inviteUrl}</span>
          </p>
        )}
      </div>

      <div className="panel">
        {members === null ? (
          <div style={{ padding: 'var(--space-4)' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skel" style={{ height: 40, margin: 'var(--space-2) 0' }} />
            ))}
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div style={{ fontWeight: 550, color: 'var(--color-ink)' }}>
                      {m.user?.name ?? m.userId.slice(0, 8)}
                    </div>
                    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--color-ink-3)' }}>
                      {m.user?.email ?? ''}
                    </div>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ width: 'auto', padding: '4px 28px 4px 10px', fontSize: '0.8rem' }}
                      value={m.role}
                      disabled={m.role === 'owner' || busy === `role:${m.userId}`}
                      onChange={(e) => void changeRole(m.userId, e.target.value as Role)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.role !== 'owner' && (
                      <button
                        className="btn btn--sm btn--danger"
                        disabled={busy === `del:${m.userId}`}
                        onClick={() => void remove(m.userId, m.user?.name ?? m.userId)}
                      >
                        remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
