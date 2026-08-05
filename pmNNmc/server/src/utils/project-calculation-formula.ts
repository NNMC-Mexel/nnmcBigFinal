export const PROJECT_FORMULA_VARIABLES = [
  'market',
  'actual',
  'ai',
  'margin',
  'employeeCount',
] as const;

type FormulaVariable = (typeof PROJECT_FORMULA_VARIABLES)[number];
type FormulaValues = Record<FormulaVariable, number>;

type Token =
  | { type: 'number'; value: number }
  | { type: 'variable'; value: FormulaVariable }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'leftParen' }
  | { type: 'rightParen' };

const VARIABLE_SET = new Set<string>(PROJECT_FORMULA_VARIABLES);
const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

function tokenize(expression: string): Token[] {
  const source = String(expression || '').trim();
  if (!source) throw new Error('Формула не может быть пустой');

  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < source.length && /[0-9.]/.test(source[index])) {
        if (source[index] === '.') dots += 1;
        index += 1;
      }
      const raw = source.slice(start, index);
      const value = Number(raw);
      if (dots > 1 || !Number.isFinite(value)) throw new Error(`Некорректное число: ${raw}`);
      tokens.push({ type: 'number', value });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const name = source.slice(start, index);
      if (!VARIABLE_SET.has(name)) throw new Error(`Недопустимая переменная: ${name}`);
      tokens.push({ type: 'variable', value: name as FormulaVariable });
      continue;
    }

    if (char === '(') tokens.push({ type: 'leftParen' });
    else if (char === ')') tokens.push({ type: 'rightParen' });
    else if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
    } else {
      throw new Error(`Недопустимый символ в формуле: ${char}`);
    }
    index += 1;
  }

  return tokens;
}

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const operators: Token[] = [];
  let previous: Token | null = null;

  tokens.forEach((token) => {
    if (token.type === 'number' || token.type === 'variable') {
      output.push(token);
    } else if (token.type === 'operator') {
      const unaryMinus = token.value === '-' && (!previous || previous.type === 'operator' || previous.type === 'leftParen');
      if (unaryMinus) throw new Error('Унарный минус не поддерживается; используйте вычитание');
      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top.type !== 'operator' || PRECEDENCE[top.value] < PRECEDENCE[token.value]) break;
        output.push(operators.pop() as Token);
      }
      operators.push(token);
    } else if (token.type === 'leftParen') {
      operators.push(token);
    } else {
      let matched = false;
      while (operators.length > 0) {
        const top = operators.pop() as Token;
        if (top.type === 'leftParen') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) throw new Error('Нарушен баланс скобок');
    }
    previous = token;
  });

  while (operators.length > 0) {
    const token = operators.pop() as Token;
    if (token.type === 'leftParen' || token.type === 'rightParen') throw new Error('Нарушен баланс скобок');
    output.push(token);
  }
  return output;
}

export function evaluateProjectFormula(expression: string, values: FormulaValues): number {
  const stack: number[] = [];
  const rpn = toRpn(tokenize(expression));

  rpn.forEach((token) => {
    if (token.type === 'number') stack.push(token.value);
    else if (token.type === 'variable') stack.push(Number(values[token.value]));
    else if (token.type === 'operator') {
      if (stack.length < 2) throw new Error('Некорректная структура формулы');
      const right = stack.pop() as number;
      const left = stack.pop() as number;
      if (token.value === '/' && right === 0) throw new Error('Деление на ноль');
      if (token.value === '+') stack.push(left + right);
      if (token.value === '-') stack.push(left - right);
      if (token.value === '*') stack.push(left * right);
      if (token.value === '/') stack.push(left / right);
    }
  });

  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error('Формула не возвращает конечное число');
  return stack[0];
}

export function validateProjectFormula(expression: string): void {
  evaluateProjectFormula(expression, {
    market: 100,
    actual: 60,
    ai: 50,
    margin: 0.3,
    employeeCount: 2,
  });
}
