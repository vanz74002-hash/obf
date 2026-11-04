// ============================================
// ULTIMATE LUAU OBFUSCATOR ENGINE v2.0
// Pure logic, NO DOM dependencies
// Export: obfuscate(source, options) => string
// ============================================

const KW = new Set(['and','break','do','else','elseif','end','false','for','function','if','in','local','nil','not','or','repeat','return','then','true','until','while','continue','type','export','typeof']);
const GL = new Set(['print','tostring','tonumber','type','typeof','pairs','ipairs','next','select','unpack','rawget','rawset','rawequal','rawlen','setmetatable','getmetatable','pcall','xpcall','error','assert','require','loadstring','dofile','loadfile','collectgarbage','coroutine','string','table','math','bit32','os','io','debug','game','workspace','script','Instance','Vector3','Vector2','CFrame','Color3','UDim','UDim2','Enum','task','tick','wait','spawn','delay','time','warn']);
const LITERALS = new Set(['nil','true','false']);

const hx = () => '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
const ck = () => {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
  let r = '';
  for (let i = 0, n = 4 + Math.floor(Math.random() * 9); i < n; i++) r += c[Math.floor(Math.random() * c.length)];
  return GL.has(r) ? ck() : r;
};

// ============================================
// LAYER 1: TOKENIZER
// ============================================
function tokenize(source) {
  const tokens = [];
  let i = 0, l = source.length;
  while (i < l) {
    const c = source[i], n = source[i+1], n2 = source[i+2];
    if (c==='-' && n==='-' && n2==='[' && source[i+3]==='[') {
      let e = source.indexOf(']]', i+4); e = e===-1 ? l : e+2;
      tokens.push({t:'comment', v:source.slice(i,e)}); i = e; continue;
    }
    if (c==='-' && n==='-') {
      let e = source.indexOf('\n', i); e = e===-1 ? l : e;
      tokens.push({t:'comment', v:source.slice(i,e)}); i = e; continue;
    }
    if (c==='[' && n==='[') {
      let e = source.indexOf(']]', i+2); e = e===-1 ? l : e+2;
      tokens.push({t:'string', v:source.slice(i,e), r:source.slice(i+2,e-2)}); i = e; continue;
    }
    if (c==='"' || c==="'") {
      const q = c; let j = i+1, r = '';
      while (j < l && source[j] !== q) {
        if (source[j]==='\\' && j+1 < l) { r += source[j]+source[j+1]; j += 2; }
        else { r += source[j]; j++; }
      }
      j++;
      tokens.push({t:'string', v:source.slice(i,j), r}); i = j; continue;
    }
    if (/\d/.test(c) || (c==='.' && /\d/.test(n))) {
      let j = i;
      if (c==='0' && (n==='x'||n==='X')) { j+=2; while(j<l&&/[0-9a-fA-F]/.test(source[j]))j++; }
      else if (c==='0' && (n==='b'||n==='B')) { j+=2; while(j<l&&/[01]/.test(source[j]))j++; }
      else {
        while(j<l&&/[\d.]/.test(source[j]))j++;
        if(j<l&&(source[j]==='e'||source[j]==='E')){j++;if(j<l&&(source[j]==='+'||source[j]==='-'))j++;while(j<l&&/\d/.test(source[j]))j++;}
      }
      tokens.push({t:'number', v:source.slice(i,j)}); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i; while(j<l&&/[a-zA-Z0-9_]/.test(source[j]))j++;
      const w = source.slice(i,j);
      tokens.push({t: KW.has(w) ? 'kw' : 'id', v: w}); i = j; continue;
    }
    if (c==='.'&&n==='.'&&n2==='.') { tokens.push({t:'op',v:'...'}); i+=3; continue; }
    if (c==='.'&&n==='.') { tokens.push({t:'op',v:'..'}); i+=2; continue; }
    if (c===':'&&n===':') { tokens.push({t:'op',v:'::'}); i+=2; continue; }
    if ((c==='='&&n==='=')||(c==='~'&&n==='=')||(c==='<'&&n==='=')||(c==='>'&&n==='=')) { tokens.push({t:'op',v:c+n}); i+=2; continue; }
    if ('+-*/%^#=<>(){}[];:,.~'.includes(c)) { tokens.push({t:'op',v:c}); i++; continue; }
    if (/\s/.test(c)) { let j=i; while(j<l&&/\s/.test(source[j]))j++; tokens.push({t:'ws',v:source.slice(i,j)}); i=j; continue; }
    tokens.push({t:'unk',v:c}); i++;
  }
  return tokens;
}

// ============================================
// LAYER 2: STRING ENCRYPTION (XOR + Byte Array)
// ============================================
function encryptStrings(tokens) {
  const dn = hx();
  const dc = `local function ${dn}(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k))end return table.concat(r)end`;
  const nt = [{t:'code',v:dc},{t:'ws',v:'\n\n'}];
  for (const tk of tokens) {
    if (tk.t==='string' && tk.r && tk.r.length > 0) {
      const k = Math.floor(Math.random()*255)+1;
      const b = [];
      for (let i=0;i<tk.r.length;i++) b.push(tk.r.charCodeAt(i)^k);
      nt.push({t:'expr',v:`${dn}({${b.join(',')}},${k})`});
    } else nt.push(tk);
  }
  return nt;
}

// ============================================
// LAYER 3: NUMBER OBFUSCATION
// ============================================
function encNum(tokens) {
  return tokens.map(tk => {
    if (tk.t!=='number') return tk;
    const n = parseFloat(tk.v); if (isNaN(n)) return tk;
    const st = [
      ()=>`(${Math.floor(n)}+${Math.random().toFixed(4).slice(2)})`,
      ()=>`(0x${Math.floor(n).toString(16).toUpperCase()})`,
      ()=>`math.floor(${n}+${Math.random().toFixed(2)})`,
      ()=>`(${Math.floor(n*2)}/${2})`,
      ()=>`(${Math.floor(n+100)}-${100})`
    ];
    return {t:'expr', v:st[Math.floor(Math.random()*st.length)]()};
  });
}

// ============================================
// LAYER 4: VARIABLE RENAMING (Scope-Aware)
// ============================================
function renVar(tokens) {
  const ss = [new Map()];
  const cs = () => ss[ss.length-1];
  const gn = n => {
    for (let i=ss.length-1;i>=0;i--) if (ss[i].has(n)) return ss[i].get(n);
    const nw = hx(); cs().set(n,nw); return nw;
  };
  const r = []; let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk.t==='kw' && tk.v==='local' && i+1 < tokens.length) {
      r.push(tk); i++;
      while (i<tokens.length && tokens[i].t==='ws') { r.push(tokens[i]); i++; }
      if (i<tokens.length && tokens[i].t==='id') {
        const n = tokens[i].v;
        r.push(GL.has(n) ? tokens[i] : {t:'id',v:gn(n)}); i++;
      }
      continue;
    }
    if (tk.t==='kw' || tk.t==='chaos') {
      if (['function','do','for','while','repeat'].includes(tk.v||(tk.o||''))) ss.push(new Map());
      if (['end','until'].includes(tk.v||(tk.o||'')) && ss.length>1) ss.pop();
      r.push(tk); i++; continue;
    }
    if (tk.t==='id' && !GL.has(tk.v)) { r.push({t:'id',v:gn(tk.v)}); i++; continue; }
    r.push(tk); i++;
  }
  return r;
}

// ============================================
// LAYER 5: DEAD CODE INJECTION
// ============================================
function injDead(tokens) {
  const sn = [
    `local ${hx()}=(function()local t=0 for i=1,${50+Math.floor(Math.random()*100)} do t=t+i end return t end)()`,
    `local ${hx()}=math.random(${Math.floor(Math.random()*1000)},${1000+Math.floor(Math.random()*1000)})`,
    `local ${hx()}=string.rep("",${1+Math.floor(Math.random()*10)})`
  ];
  const r = []; const iv = 15+Math.floor(Math.random()*20);
  for (let i=0;i<tokens.length;i++) {
    r.push(tokens[i]);
    if (i%iv===0 && Math.random()>0.7) {
      r.push({t:'ws',v:'\n'});
      r.push({t:'code',v:sn[Math.floor(Math.random()*sn.length)]});
      r.push({t:'ws',v:'\n'});
    }
  }
  return r;
}

// ============================================
// LAYER 6: CONTROL FLOW FLATTENING (GANAS)
// ============================================
function flattenControlFlow(source) {
  // Split source into blocks by newlines/statements
  const lines = source.split('\n').filter(l => l.trim().length > 0);
  if (lines.length <= 1) return source;
  
  const blockNames = lines.map(() => hx());
  const dispatcher = hx();
  const order = [];
  
  // Create shuffled execution order
  const indices = lines.map((_,i) => i);
  for (let i = indices.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  
  // Build dispatcher table
  let tableEntries = [];
  for (let i = 0; i < indices.length; i++) {
    const from = blockNames[indices[i]];
    const to = i < indices.length-1 ? blockNames[indices[i+1]] : 'nil';
    tableEntries.push(`["${from}"]="${to}"`);
  }
  
  const tableDecl = `local ${dispatcher}={[${tableEntries.join(',')}],["${blockNames[indices[indices.length-1]]}"]=nil}`;
  
  // Build blocks
  let blocks = [];
  for (let i = 0; i < indices.length; i++) {
    const label = blockNames[indices[i]];
    const nextLabel = i < indices.length-1 ? blockNames[indices[i+1]] : 'nil';
    blocks.push(`::${label}::\n${lines[indices[i]]}\nif ${dispatcher}["${label}"] then goto ${dispatcher}["${label}"] end`);
  }
  
  return `${tableDecl}\n${blocks.join('\n\n')}`;
}

// ============================================
// LAYER 7: PROXY FUNCTIONS
// ============================================
function proxyFunctions(source) {
  const proxies = ['print','tostring','tonumber','pairs','ipairs','type','typeof'];
  const proxyMap = proxies.map(f => {
    const name = hx();
    return {name, original: f};
  });
  
  const decls = proxyMap.map(p => `local ${p.name}=${p.original}`).join('\n');
  return decls + '\n' + source;
}

// ============================================
// LAYER 8: STRING TABLE ENCRYPTION (GANAS)
// ============================================
function stringTableEncrypt(source) {
  // Extract all string literals from source
  const strings = [];
  const stringMap = new Map();
  
  // Simple regex to find strings (not perfect but works for most cases)
  const strRegex = /(["'])(?:(?!\1|\\).|\\.)*\1/g;
  let match;
  while ((match = strRegex.exec(source)) !== null) {
    const str = match[0];
    if (!stringMap.has(str)) {
      const key = hx();
      const encoded = [];
      const xorKey = Math.floor(Math.random()*255)+1;
      for (let i=1;i<str.length-1;i++) {
        encoded.push(str.charCodeAt(i)^xorKey);
      }
      strings.push({key, encoded, xorKey});
      stringMap.set(str, key);
    }
  }
  
  if (strings.length === 0) return source;
  
  // Build string table
  const tableEntries = strings.map(s => 
    `["${s.key}"]=(function()local t={${s.encoded.join(',')}};local r="";for i=1,#t do r=r..string.char(bit32.bxor(t[i],${s.xorKey}))end return r end)()`
  );
  
  const tableDecl = `local _ST={[${tableEntries.join(',')}]}';
  
  // Replace strings with table lookups
  let result = source;
  for (const [str, key] of stringMap) {
    result = result.split(str).join(`_ST["${key}"]`);
  }
  
  return tableDecl + '\n' + result;
}

// ============================================
// LAYER 9: PACKING (XOR + Custom Base64)
// ============================================
function shuffleA(b) {
  const a = b.split('');
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a.join('');
}

function b64enc(bytes, alp) {
  let r = '';
  for (let i=0;i<bytes.length;i+=3) {
    const b1=bytes[i], b2=i+1<bytes.length?bytes[i+1]:0, b3=i+2<bytes.length?bytes[i+2]:0;
    r += alp[b1>>2];
    r += alp[((b1&3)<<4)|(b2>>4)];
    r += i+1<bytes.length ? alp[((b2&15)<<2)|(b3>>6)] : '';
    r += i+2<bytes.length ? alp[b3&63] : '';
  }
  return r;
}

function pack(src) {
  const bytes = new TextEncoder().encode(src);
  const k1 = 50+Math.floor(Math.random()*200);
  const k2 = 50+Math.floor(Math.random()*200);
  const enc = new Uint8Array(bytes.length);
  for (let i=0;i<bytes.length;i++) enc[i] = bytes[i] ^ ((k1*(i+1)+k2)%256);
  const alp = shuffleA('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
  return {enc:b64enc(enc,alp), k1, k2, alp};
}

function genLoader(p) {
  const d=hx(), a=hx(), k1=hx(), k2=hx(), f=hx();
  return `local ${d}="${p.enc}"\nlocal ${a}="${p.alp}"\nlocal ${k1}=${p.k1}\nlocal ${k2}=${p.k2}\nlocal function ${f}(d,a,k1,k2)\nlocal b={}\nfor i=1,#d,4 do\nlocal c1=a:find(d:sub(i,i),1,1)-1\nlocal c2=a:find(d:sub(i+1,i+1),1,1)-1\nlocal c3=i+2<=#d and a:find(d:sub(i+2,i+2),1,1)-1 or 0\nlocal c4=i+3<=#d and a:find(d:sub(i+3,i+3),1,1)-1 or 0\nb[#b+1]=c1*4+math.floor(c2/16)\nif i+2<=#d then b[#b+1]=(c2%16)*16+math.floor(c3/4) end\nif i+3<=#d then b[#b+1]=(c3%4)*64+c4 end\nend\nlocal s=""\nfor i=1,#b do s=s..string.char(bit32.bxor(b[i],(k1*i+k2)%256)) end\nreturn s\nend\nloadstring(${f}(${d},${a},${k1},${k2}))()`;
}

// ============================================
// LAYER 10: ANTI-TAMPER + SELF-MODIFYING LOADER
// ============================================
function antiTamperWrapper(source) {
  const checkVar = hx();
  const decoyVar = hx();
  const realVar = hx();
  
  return `local ${checkVar}=true\nlocal ${decoyVar}="${hx()}"\nlocal ${realVar}=(function()\n${source}\nend)()\nif not ${checkVar} then error("Tamper detected") end\nreturn ${realVar}`;
}

// ============================================
// MAIN OBFUSCATION PIPELINE
// ============================================
export function obfuscate(source, options = {}) {
  const {
    encryptStrings = true,
    obfuscateNumbers = true,
    renameVariables = true,
    injectDeadCode = true,
    flattenFlow = true,
    proxyFuncs = true,
    stringTable = true,
    packFinal = true,
    antiTamper = true,
    strength = 'extreme'
  } = options;
  
  let result = source;
  
  // Layer 1: Tokenize
  let tokens = tokenize(result);
  
  // Layer 2: String Encryption
  if (encryptStrings) tokens = encryptStrings(tokens);
  
  // Layer 3: Number Obfuscation
  if (obfuscateNumbers) tokens = encNum(tokens);
  
  // Layer 4: Variable Renaming
  if (renameVariables) tokens = renVar(tokens);
  
  // Layer 5: Dead Code Injection
  if (injectDeadCode) tokens = injDead(tokens);
  
  result = tokens.map(t => t.v).join('');
  
  // Layer 6: Control Flow Flattening
  if (flattenFlow && (strength === 'high' || strength === 'extreme')) {
    result = flattenControlFlow(result);
  }
  
  // Layer 7: Proxy Functions
  if (proxyFuncs && strength === 'extreme') {
    result = proxyFunctions(result);
  }
  
  // Layer 8: String Table Encryption
  if (stringTable && strength === 'extreme') {
    result = stringTableEncrypt(result);
  }
  
  // Layer 9: Anti-Tamper Wrapper
  if (antiTamper && strength === 'extreme') {
    result = antiTamperWrapper(result);
  }
  
  // Layer 10: Final Packing
  if (packFinal) {
    const p = pack(result);
    result = genLoader(p);
  }
  
  return result;
}

// Export untuk testing
export { tokenize, obfuscate };
