// NoamBrowser calculator + unit/currency converter. No eval(): a small parser.
(function () {
  const FUNCS = { sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, ln: Math.log, log: Math.log10, log2: Math.log2,
    sin: (x) => Math.sin(x * Math.PI / 180), cos: (x) => Math.cos(x * Math.PI / 180), tan: (x) => Math.tan(x * Math.PI / 180), exp: Math.exp };
  const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E };

  function tokenize(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\*\*/g, '^');
    const out = []; let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      const num = /^(\d[\d,]*(?:\.\d+)?|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (num) {
        const raw = num[0];
        if (/,\d{1,2}(\D|$)/.test(raw) || /,\d{4,}/.test(raw)) return null; // reject "1,5" style ambiguity
        out.push({ t: 'n', v: parseFloat(raw.replace(/,/g, '')) }); i += raw.length; continue;
      }
      const id = /^[a-zπ]+/i.exec(s.slice(i));
      if (id) { const w = id[0].toLowerCase(); if (w in FUNCS) out.push({ t: 'f', v: w }); else if (w in CONSTS) out.push({ t: 'n', v: CONSTS[w], c: true }); else return null; i += id[0].length; continue; }
      if ('+-*/^%()!'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
      return null;
    }
    return out;
  }

  // recursive-descent: expr := term (('+'|'-') term)* ; term := power (('*'|'/'|implicit) power)* ; power := unary ('^' power)? ; unary := '-' unary | postfix ; postfix := primary ('%'|'!')*
  function parse(tokens) {
    let p = 0;
    const peek = () => tokens[p];
    const eat = (v) => { if (tokens[p] && tokens[p].v === v) { p++; return true; } return false; };
    function primary() {
      const t = tokens[p++]; if (!t) throw 0;
      if (t.t === 'n') return t.v;
      if (t.t === 'f') { if (!eat('(')) { const a = unary(); return FUNCS[t.v](a); } const a = expr(); if (!eat(')')) throw 0; return FUNCS[t.v](a); }
      if (t.v === '(') { const v = expr(); if (!eat(')')) throw 0; return v; }
      throw 0;
    }
    function postfix() {
      let v = primary();
      for (;;) {
        if (eat('%')) v = v / 100;
        else if (eat('!')) { if (v < 0 || v > 170 || v % 1) throw 0; let r = 1; for (let k = 2; k <= v; k++) r *= k; v = r; }
        else return v;
      }
    }
    function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
    function power() { const b = postfix(); if (eat('^')) return Math.pow(b, unary()); return b; }
    function term() {
      let v = unary();
      for (;;) {
        if (eat('*')) v *= unary();
        else if (eat('/')) v /= unary();
        else if (peek() && (peek().v === '(' || peek().t === 'f' || (peek().t === 'n' && (peek().c || (tokens[p - 1] && tokens[p - 1].v === ')'))))) v *= unary();
        else return v;
      }
    }
    function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else return v; } }
    const v = expr();
    if (p !== tokens.length) throw 0;
    return v;
  }

  function evaluate(src) {
    const tokens = tokenize(src);
    if (!tokens || !tokens.length) return null;
    try { const v = parse(tokens); return Number.isFinite(v) ? v : null; } catch { return null; }
  }

  function fmt(v, digits = 10) {
    if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(6).replace(/\.?0+e/, 'e');
    const r = Math.round(v * 10 ** digits) / 10 ** digits;
    return r.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  // ---------- units
  const U = {};
  const add = (cat, factor, ...names) => names.forEach((n) => (U[n] = { cat, factor, label: names[0] }));
  add('length', 1, 'm', 'meter', 'meters', 'metre', 'metres'); add('length', 1000, 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres');
  add('length', 0.01, 'cm', 'centimeter', 'centimeters'); add('length', 0.001, 'mm', 'millimeter', 'millimeters');
  add('length', 0.0254, 'in', 'inch', 'inches', '"'); add('length', 0.3048, 'ft', 'foot', 'feet', "'"); add('length', 0.9144, 'yd', 'yard', 'yards');
  add('length', 1609.344, 'mi', 'mile', 'miles'); add('length', 1852, 'nmi', 'nautical mile', 'nautical miles');
  add('mass', 1, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos'); add('mass', 0.001, 'g', 'gram', 'grams'); add('mass', 1e-6, 'mg', 'milligram', 'milligrams');
  add('mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds'); add('mass', 0.028349523125, 'oz', 'ounce', 'ounces'); add('mass', 1000, 't', 'ton', 'tons', 'tonne', 'tonnes'); add('mass', 6.35029318, 'st', 'stone', 'stones');
  add('volume', 1, 'l', 'liter', 'liters', 'litre', 'litres'); add('volume', 0.001, 'ml', 'milliliter', 'milliliters'); add('volume', 3.785411784, 'gal', 'gallon', 'gallons');
  add('volume', 0.946352946, 'qt', 'quart', 'quarts'); add('volume', 0.473176473, 'pt', 'pint', 'pints'); add('volume', 0.2365882365, 'cup', 'cups'); add('volume', 0.0295735295625, 'floz', 'fl oz', 'fluid ounce', 'fluid ounces');
  add('volume', 0.01478676478125, 'tbsp', 'tablespoon', 'tablespoons'); add('volume', 0.00492892159375, 'tsp', 'teaspoon', 'teaspoons');
  add('speed', 1, 'km/h', 'kmh', 'kph', 'kilometers per hour'); add('speed', 1.609344, 'mph', 'miles per hour'); add('speed', 3.6, 'm/s', 'meters per second'); add('speed', 1.852, 'knot', 'knots', 'kn');
  add('data', 1, 'b', 'byte', 'bytes'); add('data', 1024, 'kb', 'kilobyte', 'kilobytes'); add('data', 1024 ** 2, 'mb', 'megabyte', 'megabytes'); add('data', 1024 ** 3, 'gb', 'gigabyte', 'gigabytes'); add('data', 1024 ** 4, 'tb', 'terabyte', 'terabytes');
  add('time', 1, 's', 'sec', 'second', 'seconds'); add('time', 60, 'min', 'minute', 'minutes'); add('time', 3600, 'h', 'hr', 'hour', 'hours'); add('time', 86400, 'day', 'days'); add('time', 604800, 'week', 'weeks'); add('time', 31557600, 'year', 'years');
  add('area', 1, 'm2', 'm²', 'square meter', 'square meters', 'sqm'); add('area', 1e6, 'km2', 'km²', 'square kilometer', 'square kilometers'); add('area', 0.09290304, 'ft2', 'ft²', 'sqft', 'square foot', 'square feet');
  add('area', 4046.8564224, 'acre', 'acres'); add('area', 10000, 'ha', 'hectare', 'hectares'); add('area', 1000, 'dunam', 'dunams', 'dunum');
  const TEMPS = { c: 'C', '°c': 'C', celsius: 'C', f: 'F', '°f': 'F', fahrenheit: 'F', k: 'K', kelvin: 'K' };

  const CUR = { usd: 'USD', '$': 'USD', dollar: 'USD', dollars: 'USD', eur: 'EUR', '€': 'EUR', euro: 'EUR', euros: 'EUR', gbp: 'GBP', '£': 'GBP', pound: 'GBP', pounds: 'GBP',
    ils: 'ILS', nis: 'ILS', '₪': 'ILS', shekel: 'ILS', shekels: 'ILS', jpy: 'JPY', '¥': 'JPY', yen: 'JPY', chf: 'CHF', cad: 'CAD', aud: 'AUD', cny: 'CNY', inr: 'INR', rub: 'RUB',
    sek: 'SEK', nok: 'NOK', dkk: 'DKK', pln: 'PLN', czk: 'CZK', huf: 'HUF', try: 'TRY', brl: 'BRL', mxn: 'MXN', krw: 'KRW', sgd: 'SGD', hkd: 'HKD', nzd: 'NZD', zar: 'ZAR', thb: 'THB' };

  function convertParse(q) {
    const m = /^\s*([$€£₪¥])?\s*(-?[\d.,]+)\s*([^\d\s][^=]*?)?\s+(?:in|to|=|as|into)\s+(.+?)\s*$/i.exec(q);
    if (!m) return null;
    const val = parseFloat(m[2].replace(/,/g, '')); if (!Number.isFinite(val)) return null;
    const from = (m[1] || m[3] || '').trim().toLowerCase(), to = m[4].trim().toLowerCase();
    if (!from) return null;
    if (CUR[from] && CUR[to]) return { kind: 'currency', val, from: CUR[from], to: CUR[to] };
    if (TEMPS[from] && TEMPS[to]) {
      const f = TEMPS[from], t = TEMPS[to];
      const c = f === 'C' ? val : f === 'F' ? (val - 32) * 5 / 9 : val - 273.15;
      const r = t === 'C' ? c : t === 'F' ? c * 9 / 5 + 32 : c + 273.15;
      return { kind: 'unit', val, result: r, fromLabel: '°' + f, toLabel: t === 'K' ? 'K' : '°' + t };
    }
    const a = U[from] || U[from.replace(/s$/, '')], b = U[to] || U[to.replace(/s$/, '')];
    if (!a || !b || a.cat !== b.cat) return null;
    let r = val * a.factor / b.factor;
    if (a.cat === 'speed') r = val * a.factor / b.factor; // factors are relative to km/h
    return { kind: 'unit', val, result: r, fromLabel: a.label, toLabel: b.label };
  }

  // Returns { text, value } | { needRates: 'USD', ... } | null
  function compute(q, rates) {
    q = String(q || '').trim();
    if (!q || q.length > 120) return null;
    const conv = convertParse(q);
    if (conv) {
      if (conv.kind === 'unit') return { text: `${fmt(conv.val)} ${conv.fromLabel} = ${fmt(conv.result, 4)} ${conv.toLabel}`, value: fmt(conv.result, 4), kind: 'unit' };
      if (!rates || rates.base !== conv.from) return { needRates: conv.from, kind: 'currency' };
      const rate = rates.rates[conv.to]; if (!rate) return null;
      const v = conv.val * rate;
      return { text: `${fmt(conv.val)} ${conv.from} = ${v.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${conv.to}`, value: v.toFixed(2), kind: 'currency', note: `ECB rate, ${rates.date}` };
    }
    const expr = q.replace(/^=/, '');
    if (!/[\d)]\s*[-+*/^%×÷!]|\b(sqrt|sin|cos|tan|log|ln|abs|round|pi)\b|^=/i.test(q)) return null; // looks like a sum, not a search
    if (/^\d+(\.\d+)*$/.test(expr.trim())) return null;
    const v = evaluate(expr);
    if (v === null) return null;
    return { text: `${expr.trim()} = ${fmt(v)}`, value: fmt(v), kind: 'math' };
  }

  const api = { evaluate, compute, fmt };
  if (typeof module === 'object' && module.exports) module.exports = api; else window.NoamCalc = api;
})();
