import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateProjectFormula, validateProjectFormula } from '../src/utils/project-calculation-formula';

test('evaluates the default project formulas', () => {
  const values = { market: 1000, actual: 400, ai: 250, margin: 0.3, employeeCount: 3 };
  assert.equal(evaluateProjectFormula('(market - actual) * margin / employeeCount', values), 60);
  assert.equal(evaluateProjectFormula('(market - ai) * margin / employeeCount', values), 75);
});

test('rejects unknown variables and division by zero', () => {
  assert.throws(() => validateProjectFormula('market + secret'), /Недопустимая переменная/);
  assert.throws(() => validateProjectFormula('market * -1'), /Унарный минус/);
  assert.throws(
    () => evaluateProjectFormula('market / employeeCount', {
      market: 100,
      actual: 0,
      ai: 0,
      margin: 0.3,
      employeeCount: 0,
    }),
    /Деление на ноль/,
  );
});
