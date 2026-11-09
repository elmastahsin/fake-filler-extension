/**
 * Generates strings that satisfy an HTML `pattern` attribute.
 *
 * Used as a fallback when a generated value fails the control's validation —
 * e.g. pattern="05[0-9]{9}", "[A-Z]{2}[0-9]{4}" or "\d{3}-\d{3}". Supports the
 * regex subset that appears in real-world forms: literals, escapes (\d \w \s),
 * character classes with ranges / negation, groups, alternation and all
 * quantifiers. Lookarounds and backreferences are ignored; the result is always
 * verified against the real RegExp before being used.
 */

const DIGITS = '0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = LOWER.toUpperCase();
const WORD = `${LOWER}${UPPER}${DIGITS}_`;
const PRINTABLE = `${LOWER}${UPPER}${DIGITS} .-_@`;
const MAX_RANGE = 400;

function rangeChars(from, to) {
  let out = '';
  const start = from.charCodeAt(0);
  const end = Math.min(to.charCodeAt(0), start + MAX_RANGE);
  for (let c = start; c <= end; c += 1) out += String.fromCharCode(c);
  return out;
}

class Parser {
  constructor(source, maxRepeat) {
    this.s = source;
    this.i = 0;
    this.maxRepeat = maxRepeat;
  }

  peek() {
    return this.s[this.i];
  }

  parseAlternation() {
    const branches = [this.parseSequence()];
    while (this.peek() === '|') {
      this.i += 1;
      branches.push(this.parseSequence());
    }
    return { type: 'alt', branches };
  }

  parseSequence() {
    const items = [];
    while (this.i < this.s.length && this.peek() !== '|' && this.peek() !== ')') {
      const atom = this.parseAtom();
      const [min, max] = this.parseQuantifier();
      if (atom) items.push({ atom, min, max });
    }
    return { type: 'seq', items };
  }

  /** Returns a set of characters for an escape like \d, or a literal. */
  parseEscape(inClass = false) {
    const e = this.s[this.i++];
    switch (e) {
      case 'd': return { type: 'set', chars: DIGITS };
      case 'w': return { type: 'set', chars: WORD };
      case 's': return { type: 'set', chars: ' ' };
      case 'D': return { type: 'set', chars: LOWER };
      case 'W': return { type: 'set', chars: '-' };
      case 'S': return { type: 'set', chars: WORD };
      case 'n': return { type: 'lit', char: '\n' };
      case 't': return { type: 'lit', char: '\t' };
      case 'b': return inClass ? { type: 'lit', char: '\b' } : null;
      case 'B': return null;
      case 'p':
      case 'P': {
        const close = this.s.indexOf('}', this.i);
        if (this.peek() === '{' && close > 0) this.i = close + 1;
        return { type: 'set', chars: e === 'p' ? `${LOWER}${UPPER}` : DIGITS };
      }
      case 'u': {
        const hex = this.s.slice(this.i, this.i + 4);
        if (/^[\da-f]{4}$/i.test(hex)) {
          this.i += 4;
          return { type: 'lit', char: String.fromCharCode(parseInt(hex, 16)) };
        }
        return { type: 'lit', char: 'u' };
      }
      case 'x': {
        const hex = this.s.slice(this.i, this.i + 2);
        if (/^[\da-f]{2}$/i.test(hex)) {
          this.i += 2;
          return { type: 'lit', char: String.fromCharCode(parseInt(hex, 16)) };
        }
        return { type: 'lit', char: 'x' };
      }
      default:
        if (!inClass && /\d/.test(e)) return null; // backreference
        return { type: 'lit', char: e ?? '' };
    }
  }

  parseClass() {
    let negate = false;
    if (this.peek() === '^') {
      negate = true;
      this.i += 1;
    }
    let chars = '';
    let first = true;
    while (this.i < this.s.length && (this.peek() !== ']' || first)) {
      first = false;
      let token;
      if (this.peek() === '\\') {
        this.i += 1;
        token = this.parseEscape(true);
      } else {
        token = { type: 'lit', char: this.s[this.i++] };
      }
      if (!token) continue;
      if (token.type === 'set') {
        chars += token.chars;
        continue;
      }
      // Range a-z (a '-' right before ']' is a literal).
      if (this.peek() === '-' && this.s[this.i + 1] && this.s[this.i + 1] !== ']') {
        this.i += 1;
        let endChar = this.s[this.i++];
        if (endChar === '\\') {
          const esc = this.parseEscape(true);
          endChar = esc?.type === 'lit' ? esc.char : endChar;
        }
        chars += rangeChars(token.char, endChar);
      } else {
        chars += token.char;
      }
    }
    this.i += 1; // ']'
    if (negate) {
      const excluded = new Set(chars);
      chars = [...PRINTABLE].filter((c) => !excluded.has(c)).join('') || 'x';
    }
    return { type: 'set', chars: chars || 'x' };
  }

  parseAtom() {
    const ch = this.s[this.i++];
    switch (ch) {
      case '^':
      case '$':
        return null;
      case '(': {
        let ignore = false;
        if (this.peek() === '?') {
          const next = this.s[this.i + 1];
          if (next === ':') this.i += 2;
          else if (next === '=' || next === '!') {
            ignore = true;
            this.i += 2;
          } else if (next === '<') {
            const after = this.s[this.i + 2];
            if (after === '=' || after === '!') {
              ignore = true;
              this.i += 3;
            } else {
              const close = this.s.indexOf('>', this.i);
              this.i = close > 0 ? close + 1 : this.i + 2;
            }
          }
        }
        const node = this.parseAlternation();
        if (this.peek() === ')') this.i += 1;
        return ignore ? null : { type: 'group', node };
      }
      case '[':
        return this.parseClass();
      case '.':
        return { type: 'set', chars: WORD };
      case '\\':
        return this.parseEscape(false);
      default:
        return { type: 'lit', char: ch };
    }
  }

  parseQuantifier() {
    let min = 1;
    let max = 1;
    const ch = this.peek();
    if (ch === '?') [min, max] = [0, 1];
    else if (ch === '*') [min, max] = [0, this.maxRepeat];
    else if (ch === '+') [min, max] = [1, this.maxRepeat];
    else if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(this.s.slice(this.i));
      if (!m) return [1, 1];
      min = Number(m[1]);
      max = m[2] ? (m[3] ? Number(m[3]) : min + this.maxRepeat) : min;
      this.i += m[0].length - 1;
    } else {
      return [1, 1];
    }
    this.i += 1;
    if (this.peek() === '?' || this.peek() === '+') this.i += 1; // lazy / possessive
    return [min, max];
  }
}

function render(node, rnd) {
  switch (node.type) {
    case 'alt':
      return render(node.branches[rnd.int(0, node.branches.length - 1)], rnd);
    case 'seq':
      return node.items
        .map(({ atom, min, max }) => {
          const count = rnd.int(min, Math.max(min, max));
          let out = '';
          for (let k = 0; k < count; k += 1) out += render(atom, rnd);
          return out;
        })
        .join('');
    case 'group':
      return render(node.node, rnd);
    case 'set':
      return node.chars[rnd.int(0, node.chars.length - 1)];
    case 'lit':
      return node.char;
    default:
      return '';
  }
}

/**
 * Compiles an HTML `pattern` the way browsers do (anchored, `v` flag with a
 * `u` fallback for older engines). Returns null for invalid patterns.
 * @param {string} pattern
 */
export function compilePattern(pattern) {
  if (!pattern) return null;
  for (const flags of ['v', 'u', '']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags);
    } catch {
      /* try next flag set */
    }
  }
  return null;
}

/**
 * Produces a string matching `pattern`, or null if none was found.
 * @param {string} pattern
 * @param {{int:(a:number,b:number)=>number}} rnd
 * @param {{maxLength?:number|null, minLength?:number|null, attempts?:number}} [options]
 */
export function generateFromPattern(pattern, rnd, { maxLength = null, minLength = null, attempts = 25 } = {}) {
  const re = compilePattern(pattern);
  if (!re) return null;
  let ast;
  try {
    ast = new Parser(pattern, 3).parseAlternation();
  } catch {
    return null;
  }
  for (let i = 0; i < attempts; i += 1) {
    const candidate = render(ast, rnd);
    if (maxLength && candidate.length > maxLength) continue;
    if (minLength && candidate.length < minLength) continue;
    if (re.test(candidate)) return candidate;
  }
  return null;
}

