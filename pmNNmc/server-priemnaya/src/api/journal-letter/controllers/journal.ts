import type { Context } from 'koa';

const JOURNAL_LETTER_UID = 'api::journal-letter.journal-letter';
const JOURNAL_CHANGE_UID = 'api::journal-letter-change.journal-letter-change';
const USER_UID = 'plugin::users-permissions.user';
const MKB_UID = 'api::mkb-code.mkb-code';
const OP_UID = 'api::operation-code.operation-code';
const ORG_UID = 'api::organization.organization';
const REGION_UID = 'api::region.region';
const HELP_UID = 'api::help-type.help-type';
const DEPARTMENT_UID = 'api::department.department';

const getJwtService = () => strapi.plugin('users-permissions').service('jwt');
const getUserService = () => strapi.plugin('users-permissions').service('user');

const pickUserName = (user: any) => user?.display_name || user?.username || null;

const mapLetter = (letter: any) => ({
  id: letter.id,
  letter_number: letter.letter_number,
  incoming_number: letter.incoming_number,
  outgoing_number: letter.outgoing_number,
  fio: letter.fio,
  region: letter.region,
  direction: letter.direction,
  arrival_date: letter.arrival_date,
  send_date: letter.send_date,
  transfer_from: letter.transfer_from,
  transfer_to: letter.transfer_to,
  transfer_org: letter.transfer_org,
  transfer_email: letter.transfer_email,
  mkb: letter.mkb,
  mkb_other: letter.mkb_other,
  operation_code: letter.operation_code,
  operation_other: letter.operation_other,
  department: letter.department,
  department_other: letter.department_other,
  incoming_content: letter.incoming_content,
  outgoing_content: letter.outgoing_content,
  subject: letter.subject,
  content: letter.content,
  help_type: letter.help_type,
  created_at: letter.createdAt,
  updated_at: letter.updatedAt,
  created_by_name: pickUserName(letter.created_by_user),
  updated_by_name: pickUserName(letter.updated_by_user)
});

const mapHistory = (item: any) => ({
  field_name: item.field_name,
  old_value: item.old_value,
  new_value: item.new_value,
  changed_at: item.changed_at,
  changed_by_name: pickUserName(item.changed_by_user)
});

const normalize = (value: any) => (value === undefined ? null : value);

const requireJournalUser = async (ctx: Context) => {
  const jwtService = getJwtService();
  let payload: any;
  try {
    payload = await jwtService.getToken(ctx as any);
  } catch (e) {
    ctx.unauthorized('Invalid or expired token');
    return null;
  }

  if (!payload || !payload.id) {
    ctx.unauthorized('Access token required');
    return null;
  }

  const user = await strapi.db.query(USER_UID).findOne({
    where: { id: payload.id },
    select: ['id', 'username', 'email', 'blocked', 'display_name'],
  });
  if (!user) {
    ctx.forbidden('Invalid or expired token');
    return null;
  }
  if (user.blocked) {
    ctx.forbidden('Account is deactivated');
    return null;
  }

  return user;
};

const loadLookups = async () => {
  const [mkb, ops, orgs, regions, helpTypes, departments] = await Promise.all([
    strapi.db.query(MKB_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
    strapi.db.query(OP_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
    strapi.db.query(ORG_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
    strapi.db.query(REGION_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
    strapi.db.query(HELP_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] }),
    strapi.db.query(DEPARTMENT_UID).findMany({ orderBy: [{ sort: 'asc' }, { id: 'asc' }] })
  ]);

  return {
    mkbCodes: mkb.map((x: any) => x.code),
    operationCodes: ops.map((x: any) => x.code),
    organizations: orgs.map((x: any) => ({
      name: x.name,
      email: x.primary_email || null,
      emails: Array.isArray(x.emails) ? x.emails : []
    })),
    regions: regions.map((x: any) => x.name),
    helpTypes: helpTypes.map((x: any) => x.name),
    departments: departments.map((x: any) => x.name)
  };
};

export default {
  async lookups(ctx: Context) {
    const data = await loadLookups();
    return ctx.send(data);
  },

  async login(ctx: Context) {
    const { login, password } = (ctx.request as any).body || {};
    if (!login || !password) {
      return ctx.badRequest('Missing login or password');
    }

    const user = await strapi.db.query(USER_UID).findOne({
      where: { username: login },
      select: ['id', 'username', 'email', 'password', 'blocked', 'display_name'],
    });
    if (!user || user.blocked) {
      return ctx.unauthorized('Invalid login or password');
    }

    const valid = await getUserService().validatePassword(password, user.password);
    if (!valid) {
      return ctx.unauthorized('Invalid login or password');
    }

    const token = await getJwtService().issue({ id: user.id });

    return ctx.send({
      token,
      user: {
        id: user.id,
        login: user.username,
        display_name: user.display_name
      }
    });
  },

  async me(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    return ctx.send({
      id: user.id,
      login: user.username,
      display_name: user.display_name
    });
  },

  async listLetters(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const letters = await strapi.db.query(JOURNAL_LETTER_UID).findMany({
      populate: {
        created_by_user: { select: ['id', 'username', 'display_name'] },
        updated_by_user: { select: ['id', 'username', 'display_name'] }
      }
    });

    const dateValue = (letter: any) => {
      const raw = letter.arrival_date || letter.send_date || letter.createdAt;
      const value = raw ? new Date(raw).getTime() : 0;
      return Number.isNaN(value) ? 0 : value;
    };

    letters.sort((a: any, b: any) => {
      const diff = dateValue(b) - dateValue(a);
      if (diff !== 0) return diff;
      return b.id - a.id;
    });

    return ctx.send(letters.map(mapLetter));
  },

  async createLetter(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const payload = (ctx.request as any).body || {};
    const baseNumber = payload.letter_number || payload.incoming_number || payload.outgoing_number;

    if (!baseNumber || !payload.fio) {
      return ctx.badRequest('Letter number and FIO are required');
    }

    const data = {
      letter_number: baseNumber,
      incoming_number: normalize(payload.incoming_number),
      outgoing_number: normalize(payload.outgoing_number),
      fio: payload.fio,
      region: normalize(payload.region),
      direction: payload.direction || 'incoming',
      arrival_date: normalize(payload.arrival_date),
      send_date: normalize(payload.send_date),
      transfer_from: normalize(payload.transfer_from),
      transfer_to: normalize(payload.transfer_to),
      transfer_org: normalize(payload.transfer_org),
      transfer_email: normalize(payload.transfer_email),
      mkb: normalize(payload.mkb),
      mkb_other: normalize(payload.mkb_other),
      operation_code: normalize(payload.operation_code),
      operation_other: normalize(payload.operation_other),
      department: normalize(payload.department),
      department_other: normalize(payload.department_other),
      incoming_content: normalize(payload.incoming_content),
      outgoing_content: normalize(payload.outgoing_content),
      subject: normalize(payload.subject),
      content: normalize(payload.content),
      help_type: normalize(payload.help_type),
      created_by_user: user.id,
      updated_by_user: user.id
    };

    const created = await strapi.db.query(JOURNAL_LETTER_UID).create({ data });

    await strapi.db.query(JOURNAL_CHANGE_UID).create({
      data: {
        letter: created.id,
        changed_by_user: user.id,
        field_name: 'created',
        old_value: null,
        new_value: '�������',
        changed_at: new Date().toISOString()
      }
    });

    return ctx.send({ id: created.id, message: 'Letter created' });
  },

  async getLetter(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const id = Number((ctx.params as any).id);
    const letter = await strapi.db.query(JOURNAL_LETTER_UID).findOne({
      where: { id },
      populate: {
        created_by_user: { select: ['id', 'username', 'display_name'] },
        updated_by_user: { select: ['id', 'username', 'display_name'] }
      }
    });

    if (!letter) {
      return ctx.notFound('Letter not found');
    }

    return ctx.send(mapLetter(letter));
  },

  async updateLetter(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const id = Number((ctx.params as any).id);
    const existing = await strapi.db.query(JOURNAL_LETTER_UID).findOne({ where: { id } });
    if (!existing) {
      return ctx.notFound('Letter not found');
    }

    const payload = (ctx.request as any).body || {};

    const changes: Array<[string, any, any]> = [];
    const compare = (field: string, nextValue: any) => {
      const currentValue = existing[field];
      if (currentValue !== nextValue) {
        changes.push([field, currentValue, nextValue]);
      }
    };

    const letter_number = normalize(payload.letter_number) || normalize(payload.incoming_number) || normalize(payload.outgoing_number) || existing.letter_number;
    const incoming_number = normalize(payload.incoming_number);
    const outgoing_number = normalize(payload.outgoing_number);
    const fio = payload.fio;
    const region = normalize(payload.region);
    const direction = payload.direction || existing.direction || 'incoming';
    const arrival_date = normalize(payload.arrival_date);
    const send_date = normalize(payload.send_date);
    const transfer_from = normalize(payload.transfer_from);
    const transfer_to = normalize(payload.transfer_to);
    const transfer_org = normalize(payload.transfer_org);
    const transfer_email = normalize(payload.transfer_email);
    const mkb = normalize(payload.mkb);
    const mkb_other = normalize(payload.mkb_other);
    const operation_code = normalize(payload.operation_code);
    const operation_other = normalize(payload.operation_other);
    const department = normalize(payload.department);
    const department_other = normalize(payload.department_other);
    const incoming_content = normalize(payload.incoming_content);
    const outgoing_content = normalize(payload.outgoing_content);
    const subject = normalize(payload.subject);
    const help_type = normalize(payload.help_type);
    const content = payload.content === undefined ? existing.content : normalize(payload.content);

    compare('letter_number', letter_number);
    compare('incoming_number', incoming_number);
    compare('outgoing_number', outgoing_number);
    compare('fio', fio);
    compare('region', region);
    compare('direction', direction);
    compare('arrival_date', arrival_date);
    compare('send_date', send_date);
    compare('transfer_from', transfer_from);
    compare('transfer_to', transfer_to);
    compare('transfer_org', transfer_org);
    compare('transfer_email', transfer_email);
    compare('mkb', mkb);
    compare('mkb_other', mkb_other);
    compare('operation_code', operation_code);
    compare('operation_other', operation_other);
    compare('department', department);
    compare('department_other', department_other);
    compare('incoming_content', incoming_content);
    compare('outgoing_content', outgoing_content);
    compare('subject', subject);
    compare('content', content);
    compare('help_type', help_type);

    await strapi.db.query(JOURNAL_LETTER_UID).update({
      where: { id },
      data: {
        letter_number,
        incoming_number,
        outgoing_number,
        fio,
        region,
        direction,
        arrival_date,
        send_date,
        transfer_from,
        transfer_to,
        transfer_org,
        transfer_email,
        mkb,
        mkb_other,
        operation_code,
        operation_other,
        department,
        department_other,
        incoming_content,
        outgoing_content,
        subject,
        content,
        help_type,
        updated_by_user: user.id
      }
    });

    for (const change of changes) {
      await strapi.db.query(JOURNAL_CHANGE_UID).create({
        data: {
          letter: id,
          changed_by_user: user.id,
          field_name: change[0],
          old_value: change[1] ?? null,
          new_value: change[2] ?? null,
          changed_at: new Date().toISOString()
        }
      });
    }

    return ctx.send({ message: 'Letter updated' });
  },

  async deleteLetter(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const id = Number((ctx.params as any).id);
    const existing = await strapi.db.query(JOURNAL_LETTER_UID).findOne({ where: { id } });
    if (!existing) {
      return ctx.notFound('Letter not found');
    }

    await strapi.db.query(JOURNAL_CHANGE_UID).deleteMany({ where: { letter: id } });
    await strapi.db.query(JOURNAL_LETTER_UID).delete({ where: { id } });

    return ctx.send({ message: 'Letter deleted' });
  },

  async letterHistory(ctx: Context) {
    const user = await requireJournalUser(ctx);
    if (!user) return;

    const id = Number((ctx.params as any).id);
    const history = await strapi.db.query(JOURNAL_CHANGE_UID).findMany({
      where: { letter: id },
      populate: { changed_by_user: { select: ['id', 'username', 'display_name'] } },
      orderBy: [{ changed_at: 'desc' }, { id: 'desc' }]
    });

    return ctx.send(history.map(mapHistory));
  }
};
