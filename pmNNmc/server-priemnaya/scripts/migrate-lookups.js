const fs = require('fs');
const path = require('path');
const core = require('@strapi/core');

const JOURNAL_LOOKUPS = {
  mkbCodes: [],
  operationCodes: [],
  organizations: [],
  regions: [],
  helpTypes: [],
  departments: []
};

const parseLookups = () => {
  const filePath =
    process.env.LOOKUP_SOURCE ||
    path.join(__dirname, '..', '..', 'frontend', 'js', 'journal.js');
  const text = fs.readFileSync(filePath, 'utf8');

  const getArray = (name) => {
    const re = new RegExp(`(?:const|let) ${name} = \\[(\\s|\\S)*?\\];`);
    const m = text.match(re);
    if (!m) return [];
    const arrText = m[0].replace(new RegExp(`(?:const|let) ${name} =`), '');
    // eslint-disable-next-line no-eval
    return eval(arrText);
  };

  const mkb = getArray('MKB_CODES');
  const ops = getArray('OPERATION_CODES');
  const departments = getArray('DEFAULT_DEPARTMENTS');

  const mapMatch = text.match(/const ORG_EMAIL_MAP = \{([\s\S]*?)\};/);
  let orgMap = {};
  if (mapMatch) {
    // eslint-disable-next-line no-eval
    orgMap = eval('({' + mapMatch[1] + '})');
  }

  const regionsMatch = text.match(/const regions = \[([\s\S]*?)\];/);
  let regions = [];
  if (regionsMatch) {
    // eslint-disable-next-line no-eval
    regions = eval('[' + regionsMatch[1] + ']');
  }

  const helpMatch = text.match(/fillSelect\('help-type', \[([\s\S]*?)\]\);/);
  let helpTypes = [];
  if (helpMatch) {
    // eslint-disable-next-line no-eval
    helpTypes = eval('[' + helpMatch[1] + ']');
  }

  JOURNAL_LOOKUPS.mkbCodes = mkb;
  JOURNAL_LOOKUPS.operationCodes = ops;
  JOURNAL_LOOKUPS.organizations = Object.entries(orgMap).map(([name, emails]) => ({
    name,
    emails: Array.isArray(emails) ? emails : (emails ? [emails] : [])
  }));
  JOURNAL_LOOKUPS.regions = regions;
  JOURNAL_LOOKUPS.helpTypes = helpTypes;
  JOURNAL_LOOKUPS.departments = departments;

  return JOURNAL_LOOKUPS;
};

const run = async () => {
  const appContext = await core.compileStrapi();
  const strapi = await core.createStrapi(appContext).load();

  try {
    const lookups = parseLookups();

    const mkbUid = 'api::mkb-code.mkb-code';
    const opUid = 'api::operation-code.operation-code';
    const orgUid = 'api::organization.organization';
    const regionUid = 'api::region.region';
    const helpUid = 'api::help-type.help-type';
    const departmentUid = 'api::department.department';

    await strapi.db.query(mkbUid).deleteMany({});
    await strapi.db.query(opUid).deleteMany({});
    await strapi.db.query(orgUid).deleteMany({});
    await strapi.db.query(regionUid).deleteMany({});
    await strapi.db.query(helpUid).deleteMany({});
    await strapi.db.query(departmentUid).deleteMany({});

    for (let i = 0; i < lookups.mkbCodes.length; i += 1) {
      await strapi.db.query(mkbUid).create({ data: { code: String(lookups.mkbCodes[i]), sort: i } });
    }

    for (let i = 0; i < lookups.operationCodes.length; i += 1) {
      await strapi.db.query(opUid).create({ data: { code: String(lookups.operationCodes[i]), sort: i } });
    }

    for (let i = 0; i < lookups.organizations.length; i += 1) {
      const org = lookups.organizations[i];
      const emails = org.emails || [];
      await strapi.db.query(orgUid).create({
        data: {
          name: org.name,
          primary_email: emails[0] || null,
          emails,
          sort: i
        }
      });
    }

    for (let i = 0; i < lookups.regions.length; i += 1) {
      await strapi.db.query(regionUid).create({ data: { name: String(lookups.regions[i]), sort: i } });
    }

    for (let i = 0; i < lookups.helpTypes.length; i += 1) {
      await strapi.db.query(helpUid).create({ data: { name: String(lookups.helpTypes[i]), sort: i } });
    }

    for (let i = 0; i < lookups.departments.length; i += 1) {
      await strapi.db.query(departmentUid).create({ data: { name: String(lookups.departments[i]), sort: i } });
    }

    strapi.log.info('Lookup migration completed');
  } finally {
    await strapi.destroy();
  }
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
