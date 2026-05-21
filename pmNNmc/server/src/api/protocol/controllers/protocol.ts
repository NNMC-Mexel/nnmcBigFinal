import type { Context } from 'koa';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { generateProtocolPdf, ProtocolPdfData } from '../services/protocol-pdf';

declare const strapi: any;

const PROTOCOL_UID = 'api::protocol.protocol';
const USER_UID = 'plugin::users-permissions.user';
const DEPARTMENT_UID = 'api::department.department';

const POPULATE_FULL = {
  creator: { fields: ['id', 'username', 'email', 'fullName'], populate: { department: true } },
  creatorDepartment: { fields: ['id', 'key', 'name_ru', 'name_kz'] },
  attendees: { fields: ['id', 'username', 'email', 'fullName'], populate: { department: { fields: ['id', 'name_ru'] } } },
  responsibles: { fields: ['id', 'username', 'email', 'fullName'] },
  tasks: true,
  pdfFiles: { fields: ['id', 'name', 'url', 'size', 'mime', 'createdAt'] },
};

const POPULATE_LIST = {
  creator: { fields: ['id', 'username', 'email', 'fullName'] },
  creatorDepartment: { fields: ['id', 'name_ru'] },
  attendees: { fields: ['id'] },
  responsibles: { fields: ['id'] },
  pdfFiles: { fields: ['id', 'url', 'createdAt'] },
};

function userLabel(user: any): string {
  return user?.fullName || user?.username || user?.email || `User #${user?.id ?? ''}`;
}

function normalizeAllowedFilter(value: any): string {
  const v = String(value || 'mine').toLowerCase();
  if (['mine', 'with-me', 'department', 'all'].includes(v)) return v;
  return 'mine';
}

function uniqIds(values: any[]): number[] {
  return Array.from(new Set(values.map((v) => Number(v?.id ?? v)).filter((n) => Number.isFinite(n))));
}

async function loadFullUser(strapiInstance: any, userId: number): Promise<any> {
  return strapiInstance.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { department: true },
  });
}

async function isSuperAdmin(strapiInstance: any, userId: number): Promise<boolean> {
  const user = await loadFullUser(strapiInstance, userId);
  return Boolean(user?.isSuperAdmin);
}

function extractResponsibleIds(tasks: any[]): number[] {
  if (!Array.isArray(tasks)) return [];
  return uniqIds(tasks.map((t) => t?.responsibleId).filter((v) => v != null));
}

function sanitizeTasks(tasks: any): any[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task, index) => ({
    order: Number(task?.order ?? index + 1),
    title: String(task?.title || '').trim(),
    deadline: task?.deadline || null,
    responsibleId:
      task?.responsibleId == null || task?.responsibleId === ''
        ? null
        : Number(task.responsibleId),
    fact: String(task?.fact || '').trim() || null,
  }));
}

function describeChanges(before: any, after: any): string[] {
  const changes: string[] = [];
  const fields: Array<[string, string]> = [
    ['theme', 'тема'],
    ['meetingDate', 'дата совещания'],
    ['conclusion', 'заключение'],
    ['nextMeetingDate', 'следующее совещание'],
  ];
  for (const [field, label] of fields) {
    if (String(before?.[field] || '') !== String(after?.[field] || '')) {
      changes.push(label);
    }
  }
  const beforeAttendees = uniqIds(before?.attendees || []).sort().join(',');
  const afterAttendees = uniqIds(after?.attendees || []).sort().join(',');
  if (beforeAttendees !== afterAttendees) changes.push('присутствующие');

  const tasksDiffer = JSON.stringify(before?.tasks || []) !== JSON.stringify(after?.tasks || []);
  if (tasksDiffer) changes.push('задачи');

  return changes;
}

async function buildPdfDataFromProtocol(strapiInstance: any, protocol: any): Promise<ProtocolPdfData> {
  const responsibleIds = extractResponsibleIds(protocol.tasks || []);
  const responsibleUsers: any[] =
    responsibleIds.length > 0
      ? await strapiInstance.db
          .query(USER_UID)
          .findMany({ where: { id: { $in: responsibleIds } }, select: ['id', 'username', 'email', 'fullName'] })
      : [];
  const respMap = new Map<number, any>(responsibleUsers.map((u: any) => [Number(u.id), u]));

  return {
    theme: protocol.theme,
    meetingDate: protocol.meetingDate,
    creatorDepartmentName: protocol.creatorDepartment?.name_ru || protocol.creatorDepartment?.key || null,
    creator: protocol.creator
      ? {
          id: protocol.creator.id,
          fullName: protocol.creator.fullName,
          username: protocol.creator.username,
          email: protocol.creator.email,
        }
      : null,
    attendees: (protocol.attendees || []).map((u: any) => ({
      id: u.id,
      fullName: u.fullName,
      username: u.username,
      email: u.email,
    })),
    tasks: (protocol.tasks || []).map((t: any, index: number) => ({
      order: t.order ?? index + 1,
      title: t.title,
      deadline: t.deadline,
      responsibleId: t.responsibleId,
      responsibleName: t.responsibleId ? userLabel(respMap.get(Number(t.responsibleId))) : '',
      fact: t.fact || '',
    })),
    conclusion: protocol.conclusion,
    nextMeetingDate: protocol.nextMeetingDate,
    version: protocol.version || 1,
    generatedAt: new Date(),
  };
}

async function uploadPdfBuffer(strapiInstance: any, buffer: Buffer, fileName: string): Promise<any> {
  const tmpName = `${crypto.randomBytes(8).toString('hex')}-${fileName}`;
  const tmpPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const uploadService = strapiInstance.plugin('upload').service('upload');
    const files = await uploadService.upload({
      data: { fileInfo: { name: fileName } },
      files: {
        filepath: tmpPath,
        originalFilename: fileName,
        mimetype: 'application/pdf',
        size: buffer.length,
      },
    });
    return Array.isArray(files) ? files[0] : files;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

async function regeneratePdf(strapiInstance: any, protocolId: number): Promise<any> {
  const full = await strapiInstance.entityService.findOne(PROTOCOL_UID, protocolId, {
    populate: POPULATE_FULL as any,
  });
  if (!full) return null;
  const pdfData = await buildPdfDataFromProtocol(strapiInstance, full);
  const buffer = await generateProtocolPdf(pdfData);
  const fileName = `protocol-${full.id}-v${full.version || 1}.pdf`;
  const uploaded = await uploadPdfBuffer(strapiInstance, buffer, fileName);
  const existingIds = (full.pdfFiles || []).map((f: any) => Number(f.id));
  await strapiInstance.entityService.update(PROTOCOL_UID, protocolId, {
    data: { pdfFiles: [...existingIds, uploaded.id] },
  });
  return uploaded;
}

async function notifyUsers(
  strapiInstance: any,
  userIds: number[],
  title: string,
  body: string,
  protocolId: number,
  actorId: number
) {
  for (const userId of userIds) {
    if (Number(userId) === Number(actorId)) continue;
    try {
      await strapiInstance.entityService.create('api::notification.notification', {
        data: {
          recipient: userId,
          title,
          body,
          type: 'protocol',
          link: `/app/protocols/${protocolId}`,
          isRead: false,
        },
      });
    } catch (e: any) {
      strapiInstance.log.warn(`[protocol] notify failed: ${e?.message || e}`);
    }
  }
}

export default {
  async findMany(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const filter = normalizeAllowedFilter(ctx.query.filter);
    const fullUser = await loadFullUser(strapi, user.id);
    const superAdmin = Boolean(fullUser?.isSuperAdmin);
    const myDeptId = fullUser?.department?.id ? Number(fullUser.department.id) : null;

    let where: any = {};

    if (filter === 'mine') {
      where = { creator: { id: user.id } };
    } else if (filter === 'with-me') {
      where = {
        $or: [
          { attendees: { id: user.id } },
          { responsibles: { id: user.id } },
        ],
      };
    } else if (filter === 'department') {
      if (!myDeptId) {
        ctx.body = { data: [] };
        return;
      }
      const deptUsers: any[] = await strapi.db.query(USER_UID).findMany({
        where: { department: myDeptId },
        select: ['id'],
      });
      const userIds = uniqIds(deptUsers);
      where = {
        $or: [
          { creatorDepartment: { id: myDeptId } },
          { attendees: { id: { $in: userIds } } },
          { responsibles: { id: { $in: userIds } } },
        ],
      };
    } else if (filter === 'all') {
      if (!superAdmin) return ctx.forbidden('Доступно только суперадмину');
      where = {};
    }

    // Drafts visible only to author (regardless of filter)
    if (!superAdmin) {
      where = {
        $and: [
          where,
          {
            $or: [{ status: 'published' }, { creator: { id: user.id } }],
          },
        ],
      };
    }

    const items = await strapi.db.query(PROTOCOL_UID).findMany({
      where,
      orderBy: { createdAt: 'desc' },
      populate: POPULATE_LIST as any,
      limit: 500,
    });

    ctx.body = { data: items };
  },

  async findOne(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const protocol = await strapi.entityService.findOne(PROTOCOL_UID, ctx.params.id, {
      populate: POPULATE_FULL as any,
    });
    if (!protocol) return ctx.notFound('Протокол не найден');

    const fullUser = await loadFullUser(strapi, user.id);
    const superAdmin = Boolean(fullUser?.isSuperAdmin);
    const myDeptId = fullUser?.department?.id ? Number(fullUser.department.id) : null;

    const isCreator = Number(protocol.creator?.id) === Number(user.id);
    const isAttendee = (protocol.attendees || []).some((a: any) => Number(a.id) === Number(user.id));
    const isResponsible = (protocol.responsibles || []).some((r: any) => Number(r.id) === Number(user.id));
    const sameDept =
      myDeptId && Number(protocol.creatorDepartment?.id) === Number(myDeptId);

    if (protocol.status === 'draft' && !isCreator && !superAdmin) {
      return ctx.forbidden('Черновик доступен только автору');
    }
    if (!superAdmin && !isCreator && !isAttendee && !isResponsible && !sameDept) {
      return ctx.forbidden('Нет доступа к этому протоколу');
    }

    ctx.body = { data: protocol };
  },

  async create(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const body: any = (ctx.request.body as any)?.data || (ctx.request.body as any) || {};

    const theme = String(body.theme || '').trim();
    const meetingDate = body.meetingDate || new Date().toISOString().slice(0, 10);
    if (!theme) return ctx.badRequest('Тема обязательна');

    const fullUser = await loadFullUser(strapi, user.id);
    const attendees = uniqIds(body.attendees || []);
    const tasks = sanitizeTasks(body.tasks);
    const responsibles = extractResponsibleIds(tasks);

    const created = await strapi.entityService.create(PROTOCOL_UID, {
      data: {
        theme,
        meetingDate,
        creator: user.id,
        creatorDepartment: fullUser?.department?.id || body.creatorDepartment || null,
        attendees,
        responsibles,
        tasks,
        conclusion: body.conclusion ? String(body.conclusion) : null,
        nextMeetingDate: body.nextMeetingDate || null,
        status: 'draft',
        version: 1,
        history: [
          {
            timestamp: new Date().toISOString(),
            userId: user.id,
            userName: userLabel(fullUser),
            action: 'created',
            summary: 'Черновик создан',
          },
        ],
      },
      populate: POPULATE_FULL as any,
    });

    ctx.body = { data: created };
  },

  async update(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const protocol = await strapi.entityService.findOne(PROTOCOL_UID, ctx.params.id, {
      populate: POPULATE_FULL as any,
    });
    if (!protocol) return ctx.notFound('Протокол не найден');

    const fullUser = await loadFullUser(strapi, user.id);
    const superAdmin = Boolean(fullUser?.isSuperAdmin);
    const myDeptId = fullUser?.department?.id ? Number(fullUser.department.id) : null;

    const isCreator = Number(protocol.creator?.id) === Number(user.id);
    const isAttendee = (protocol.attendees || []).some((a: any) => Number(a.id) === Number(user.id));
    const sameDept = myDeptId && Number(protocol.creatorDepartment?.id) === Number(myDeptId);

    if (protocol.status === 'draft' && !isCreator && !superAdmin) {
      return ctx.forbidden('Черновик может редактировать только автор');
    }
    if (protocol.status === 'published' && !isCreator && !isAttendee && !sameDept && !superAdmin) {
      return ctx.forbidden('Нет прав на редактирование');
    }

    const body: any = (ctx.request.body as any)?.data || (ctx.request.body as any) || {};
    const wasPublished = protocol.status === 'published';

    const beforeSnapshot = {
      theme: protocol.theme,
      meetingDate: protocol.meetingDate,
      conclusion: protocol.conclusion,
      nextMeetingDate: protocol.nextMeetingDate,
      attendees: (protocol.attendees || []).map((a: any) => a.id),
      tasks: protocol.tasks || [],
    };

    const theme = body.theme != null ? String(body.theme).trim() : protocol.theme;
    if (!theme) return ctx.badRequest('Тема обязательна');

    const newAttendees = body.attendees != null ? uniqIds(body.attendees) : (protocol.attendees || []).map((a: any) => Number(a.id));
    const newTasks = body.tasks != null ? sanitizeTasks(body.tasks) : (protocol.tasks || []).map((t: any) => ({
      order: t.order,
      title: t.title,
      deadline: t.deadline,
      responsibleId: t.responsibleId,
      fact: t.fact,
    }));
    const responsibles = extractResponsibleIds(newTasks);

    const afterSnapshot = {
      theme,
      meetingDate: body.meetingDate ?? protocol.meetingDate,
      conclusion: body.conclusion ?? protocol.conclusion,
      nextMeetingDate: body.nextMeetingDate ?? protocol.nextMeetingDate,
      attendees: newAttendees,
      tasks: newTasks,
    };

    const changes = describeChanges(beforeSnapshot, afterSnapshot);
    const willBumpVersion = wasPublished && changes.length > 0;
    const newVersion = willBumpVersion ? (protocol.version || 1) + 1 : protocol.version || 1;

    const historyEntry = changes.length > 0
      ? {
          timestamp: new Date().toISOString(),
          userId: user.id,
          userName: userLabel(fullUser),
          action: 'edited',
          summary: changes.join(', '),
          version: newVersion,
        }
      : null;
    const nextHistory = historyEntry ? [...(protocol.history || []), historyEntry] : protocol.history;

    const previousAttendeeIds = uniqIds(protocol.attendees || []);
    const addedAttendees = newAttendees.filter((id) => !previousAttendeeIds.includes(id));

    await strapi.entityService.update(PROTOCOL_UID, ctx.params.id, {
      data: {
        theme,
        meetingDate: afterSnapshot.meetingDate,
        attendees: newAttendees,
        responsibles,
        tasks: newTasks,
        conclusion: afterSnapshot.conclusion,
        nextMeetingDate: afterSnapshot.nextMeetingDate,
        version: newVersion,
        history: nextHistory,
      },
    });

    if (willBumpVersion) {
      await regeneratePdf(strapi, Number(ctx.params.id));
    }

    if (wasPublished && addedAttendees.length > 0) {
      await notifyUsers(
        strapi,
        addedAttendees,
        'Вас добавили в протокол',
        `«${theme}»`,
        Number(ctx.params.id),
        user.id
      );
    }

    const fresh = await strapi.entityService.findOne(PROTOCOL_UID, ctx.params.id, {
      populate: POPULATE_FULL as any,
    });
    ctx.body = { data: fresh, bumped: willBumpVersion };
  },

  async publish(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const protocol = await strapi.entityService.findOne(PROTOCOL_UID, ctx.params.id, {
      populate: POPULATE_FULL as any,
    });
    if (!protocol) return ctx.notFound('Протокол не найден');
    if (Number(protocol.creator?.id) !== Number(user.id) && !(await isSuperAdmin(strapi, user.id))) {
      return ctx.forbidden('Публиковать может только автор');
    }
    if (protocol.status === 'published') {
      return ctx.badRequest('Уже опубликован');
    }

    const fullUser = await loadFullUser(strapi, user.id);
    const historyEntry = {
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: userLabel(fullUser),
      action: 'published',
      summary: 'Опубликован',
      version: 1,
    };

    await strapi.entityService.update(PROTOCOL_UID, ctx.params.id, {
      data: {
        status: 'published',
        version: 1,
        history: [...(protocol.history || []), historyEntry],
      },
    });

    await regeneratePdf(strapi, Number(ctx.params.id));

    const targets = uniqIds([
      ...(protocol.attendees || []),
      ...(protocol.responsibles || []),
    ]);
    await notifyUsers(
      strapi,
      targets,
      'Новый протокол',
      `«${protocol.theme}»`,
      Number(ctx.params.id),
      user.id
    );

    const fresh = await strapi.entityService.findOne(PROTOCOL_UID, ctx.params.id, {
      populate: POPULATE_FULL as any,
    });
    ctx.body = { data: fresh };
  },

  async delete(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const superAdmin = await isSuperAdmin(strapi, user.id);
    if (!superAdmin) return ctx.forbidden('Удалять может только SuperAdmin');

    await strapi.entityService.delete(PROTOCOL_UID, ctx.params.id);
    ctx.body = { ok: true };
  },

  async usersByDepartment(ctx: Context) {
    const user = (ctx.state as any).user;
    if (!user) return ctx.unauthorized('Необходима авторизация');

    const departments = await strapi.db.query(DEPARTMENT_UID).findMany({
      orderBy: { name_ru: 'asc' },
      select: ['id', 'key', 'name_ru'],
    });
    const users = await strapi.db.query(USER_UID).findMany({
      where: { confirmed: true, blocked: false },
      select: ['id', 'username', 'email', 'fullName'],
      populate: { department: { select: ['id', 'name_ru'] } },
      orderBy: { fullName: 'asc' },
      limit: 5000,
    });

    const byDept = new Map<number, any[]>();
    const noDept: any[] = [];
    for (const u of users) {
      const deptId = u.department?.id ? Number(u.department.id) : null;
      if (deptId == null) {
        noDept.push(u);
        continue;
      }
      if (!byDept.has(deptId)) byDept.set(deptId, []);
      byDept.get(deptId)!.push(u);
    }

    const result = departments.map((d: any) => ({
      id: d.id,
      name: d.name_ru || d.key,
      users: (byDept.get(Number(d.id)) || []).map((u) => ({
        id: u.id,
        fullName: u.fullName,
        username: u.username,
        email: u.email,
      })),
    }));
    if (noDept.length > 0) {
      result.push({
        id: 0,
        name: 'Без отдела',
        users: noDept.map((u) => ({
          id: u.id,
          fullName: u.fullName,
          username: u.username,
          email: u.email,
        })),
      });
    }

    ctx.body = { data: result };
  },
};
