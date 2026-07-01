const fs = require('fs');
const path = require('path');

const directory = __dirname;
const sources = [
  'EmployeesHttpServiceModule.bsl',
  'TimesheetHttpServiceHandlers.bsl',
  'KpiAccrualHttpServiceHandler.bsl',
  'VacationRequestHttpServiceHandler.bsl',
];
const target = path.join(directory, 'NNMCHttpServiceModule.bsl');

const content = sources
  .map((name) => fs.readFileSync(path.join(directory, name), 'utf8').trim())
  .join('\r\n\r\n');

fs.writeFileSync(target, `${content}\r\n`, 'utf8');
console.log(`Built ${target}`);
