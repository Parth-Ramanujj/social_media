import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../common/mailer/mailer.service';
import { PrismaService } from '../common/prisma/prisma.service';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async create(opts: {
    workspaceId: string;
    invitedBy: { id: string; name: string; email: string };
    email: string;
    role: Role;
  }) {
    const { workspaceId, invitedBy, email, role } = opts;
    const normalizedEmail = email.toLowerCase();

    const existingMember = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email: normalizedEmail } },
    });
    if (existingMember) {
      throw new ConflictException('This user is already a member of the workspace');
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { workspaceId, email: normalizedEmail, status: 'pending' },
    });
    if (pending) {
      throw new ConflictException('An invitation is already pending for this email');
    }

    const rawToken = randomBytes(32).toString('hex');
    const invitation = await this.prisma.invitation.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role,
        tokenHash: hashToken(rawToken),
        invitedById: invitedBy.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    const frontendUrl = this.config.get<string>('frontendUrl')!;
    const inviteUrl = `${frontendUrl}/invite/${rawToken}`;

    await this.mailer.send({
      to: normalizedEmail,
      subject: `${invitedBy.name} invited you to join their workspace on Pulse`,
      text: `Hello!\n\n${invitedBy.name} (${invitedBy.email}) invited you to join their workspace with the ${role} role.\n\nAccept the invitation here: ${inviteUrl}\n\nThis invitation expires in 7 days.`,
      html: `<p>Hello!</p><p>${invitedBy.name} invited you to join their workspace with the <strong>${role}</strong> role.</p><p><a href="${inviteUrl}">Accept invitation</a></p>`,
    });

    await this.audit.log({
      workspaceId,
      userId: invitedBy.id,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: invitation.id,
      meta: { email: normalizedEmail, role },
    });

    // Return the raw link in dev so flows work without an inbox (Mailpit UI: http://localhost:8025).
    return {
      invitationId: invitation.id,
      ...(process.env.NODE_ENV === 'development' ? { inviteUrl } : {}),
    };
  }

  async accept(opts: { rawToken: string; userId: string; email: string }) {
    const { rawToken, userId, email } = opts;
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException('Invitation not found or already used');
    }
    if (invitation.expiresAt < new Date()) {
      throw new NotFoundException('Invitation has expired');
    }
    if (invitation.email !== email.toLowerCase()) {
      throw new ConflictException('Invitation was sent to a different email address');
    }

    const membership = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });
      const membership = await tx.workspaceMember.create({
        data: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
        include: { workspace: true },
      });
      return { updated, membership };
    });

    await this.audit.log({
      workspaceId: invitation.workspaceId,
      userId,
      action: 'invitation.accepted',
      targetType: 'invitation',
      targetId: invitation.id,
    });

    return membership.membership;
  }

  list(workspaceId: string) {
    return this.prisma.invitation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { id: true, email: true, name: true } } },
    });
  }

  async revoke(opts: { workspaceId: string; actorId: string; invitationId: string }) {
    const result = await this.prisma.invitation.updateMany({
      where: { id: opts.invitationId, workspaceId: opts.workspaceId, status: InvitationStatus.pending },
      data: { status: InvitationStatus.revoked },
    });
    if (result.count === 0) {
      throw new NotFoundException('Pending invitation not found');
    }
    await this.audit.log({
      workspaceId: opts.workspaceId,
      userId: opts.actorId,
      action: 'invitation.revoked',
      targetType: 'invitation',
      targetId: opts.invitationId,
    });
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}