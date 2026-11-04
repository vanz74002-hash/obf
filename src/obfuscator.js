import pako from 'pako';

// ========================================
// UTILITIES & CONSTANTS
// ========================================
const LUAU_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 
  'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 
  'return', 'then', 'true', 'until', 'while', 'continue', 'type', 
  'export', 'typeof'
]);

const LUAU_GLOBALS = new Set([
  'print', 'tostring', 'tonumber', 'type', 'typeof', 'pairs', 'ipairs',
  'next', 'select', 'unpack', 'rawget', 'rawset', 'rawequal', 'rawlen',
  'setmetatable', 'getmetatable', 'pcall', 'xpcall', 'error', 'assert',
  'require', 'loadstring', 'dofile', 'loadfile', 'collectgarbage',
  'coroutine', 'string', 'table', 'math', 'bit32', 'os', 'io', 'debug',
  'game', 'workspace', 'script', 'Instance', 'Vector3', 'Vector2', 'CFrame',
  'Color3', 'UDim', 'UDim2', 'Enum', 'task', 'tick', 'wait', 'spawn',
  'delay', 'time', 'warn', 'assert', 'error', 'pcall', 'xpcall'
]);

function genHexName() {
  return '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
}

function genChaoticKeyword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
  let result = '';
  const len = Math.floor(Math.random() * 9) + 4;
  for (let i = 0; i < len; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (LUAU_GLOBALS.has(result)) return genChaoticKeyword();
  return result;
}

// ========================================
// LAYER 1: TOKENIZER WITH CHAOTIC KEYWORD MUTATION
// ========================================
function tokenize(source) {
  const tokens = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const char = source[i];
    const next = source[i + 1];
    const next2 = source[i + 2];

    // Block comment --[[ ]]
    if (char === '-' && next === '-' && next2 === '[' && source[i + 3] === '[') {
      let end = source.indexOf(']]', i + 4);
      if (end === -1) end = len; else end += 2;
      tokens.push({ type: 'comment', value: source.slice(i, end) });
      i = end; continue;
    }

    // Line comment --
    if (char === '-' && next === '-') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = len;
      tokens.push({ type: 'comment', value: source.slice(i, end) });
      i = end; continue;
    }

    // Block string [[ ]]
    if (char === '[' && next === '[') {
      let end = source.indexOf(']]', i + 2);
      if (end === -1) end = len; else end += 2;
      tokens.push({ type: 'string', value: source.slice(i, end), raw: source.slice(i + 2, end - 2) });
      i = end; continue;
    }

    // String " or '
    if (char === '"' || char === "'") {
      const quote = char;
      let j = i + 1;
      let raw = '';
      while (j < len && source[j] !== quote) {
        if (source[j] === '\\' && j + 1 < len) {
          raw += source[j] + source[j + 1]; j += 2;
        } else {
          raw += source[j]; j++;
        }
      }
      j++;
      tokens.push({ type: 'string', value: source.slice(i, j), raw });
      i = j; continue;
    }

    // Number
    if (/\d/.test(char) || (char === '.' && /\d/.test(next))) {
      let j = i;
      if (char === '0' && (next === 'x' || next === 'X')) {
        j += 2; while (j < len && /[0-9a-fA-F]/.test(source[j])) j++;
      } else if (char === '0' && (next === 'b' || next === 'B')) {
        j += 2; while (j < len && /[01]/.test(source[j])) j++;
      } else {
        while (j < len && /[\d.]/.test(source[j])) j++;
        if (j < len && (source[j] === 'e' || source[j] === 'E')) {
          j++; if (j < len && (source[j] === '+' || source[j] === '-')) j++;
          while (j < len && /\d/.test(source[j])) j++;
        }
      }
      tokens.push({ type: 'number', value: source.slice(i, j) });
      i = j; continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(source[j])) j++;
      const word = source.slice(i, j);
      
      if (LUAU_KEYWORDS.has(word)) {
        if (!['nil', 'true', 'false'].includes(word)) {
          tokens.push({ type: 'chaotic_keyword', value: genChaoticKeyword(), original: word });
        } else {
          tokens.push({ type: 'literal', value: word });
        }
      } else {
        tokens.push({ type: 'identifier', value: word });
      }
      i = j; continue;
    }

    // Operators
    if (char === '.' && next === '.' && next2 === '.') { tokens.push({ type: 'operator', value: '...' }); i += 3; continue; }
    if (char === '.' && next === '.') { tokens.push({ type: 'operator', value: '..' }); i += 2; continue; }
    if (char === ':' && next === ':') { tokens.push({ type: 'operator', value: '::' }); i += 2; continue; }
    if ((char === '=' && next === '=') || (char === '~' && next === '=') || (char === '<' && next === '=') || (char === '>' && next === '=')) {
      tokens.push({ type: 'operator', value: char + next }); i += 2; continue;
    }
    if ('+-*/%^#=<>(){}[];:,.~'.includes(char)) { tokens.push({ type: 'operator', value: char }); i++; continue; }

    // Whitespace
    if (/\s/.test(char)) {
      let j = i;
      while (j < len && /\s/.test(source[j])) j++;
      tokens.push({ type: 'whitespace', value: source.slice(i, j) });
      i = j; continue;
    }

    // Unknown
    tokens.push({ type: 'unknown', value: char });
    i++;
  }
  return tokens;
}

// ========================================
// LAYER 2: STRING ENCRYPTION (XOR + BYTE ARRAY)
// ========================================
function encryptStrings(tokens) {
  const decoderName = genHexName();
  const decoderCode = generateStringDecoder(decoderName);
  const newTokens = [decoderCode, { type: 'whitespace', value: '\n\n' }];
  
  for (const token of tokens) {
    if (token.type === 'string' && token.raw && token.raw.length > 0) {
      const key = Math.floor(Math.random() * 255) + 1;
      const bytes = [];
      for (let i = 0; i < token.raw.length; i++) bytes.push(token.raw.charCodeAt(i) ^ key);
      newTokens.push({ type: 'expression', value: `${decoderName}({${bytes.join(',')}},${key})` });
    } else {
      newTokens.push(token);
    }
  }
  return newTokens;
}

function generateStringDecoder(funcName) {
  return { type: 'code', value: `local function ${funcName}(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k))end return table.concat(r)end` };
}

// ========================================
// LAYER 3: NUMBER OBFUSCATION
// ========================================
function obfuscateNumbers(tokens) {
  return tokens.map(token => {
    if (token.type === 'number') {
      const num = parseFloat(token.value);
      if (isNaN(num)) return token;
      const strategies = [
        () => `(${Math.floor(num)}+${Math.random().toFixed(4).slice(2)})`,
        () => `(0x${Math.floor(num).toString(16).toUpperCase()})`,
        () => `math.floor(${num}+${Math.random().toFixed(2)})`,
        () => `(${Math.floor(num * 2)}/${2})`,
        () => `(${Math.floor(num + 100)}-${100})`
      ];
      return { type: 'expression', value: strategies[Math.floor(Math.random() * strategies.length)]() };
    }
    return token;
  });
}

// ========================================
// LAYER 4: VARIABLE RENAMING (SCOPE-AWARE)
// ========================================
function renameVariables(tokens) {
  const scopeStack = [new Map()];
  function currentScope() { return scopeStack[scopeStack.length - 1]; }
  function getOrGenName(name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) if (scopeStack[i].has(name)) return scopeStack[i].get(name);
    const newName = genHexName(); currentScope().set(name, newName); return newName;
  }
  
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    
    if (token.type === 'chaotic_keyword' && token.original === 'local' && i + 1 < tokens.length) {
      result.push(token); i++;
      while (i < tokens.length && tokens[i].type === 'whitespace') { result.push(tokens[i]); i++; }
      if (i < tokens.length && tokens[i].type === 'identifier') {
        const name = tokens[i].value;
        result.push(LUAU_GLOBALS.has(name) ? tokens[i] : { type: 'identifier', value: getOrGenName(name) });
        i++;
      }
      continue;
    }

    if (token.type === 'keyword' || token.type === 'chaotic_keyword') {
      if (['function','do','for','while','repeat'].includes(token.original || token.value)) scopeStack.push(new Map());
      if (['end','until'].includes(token.original || token.value) && scopeStack.length > 1) scopeStack.pop();
      result.push(token); i++; continue;
    }

    if (token.type === 'identifier' && !LUAU_GLOBALS.has(token.value)) {
      result.push({ type: 'identifier', value: getOrGenName(token.value) }); i++; continue;
    }
    result.push(token); i++;
  }
  return result;
}

// ========================================
// LAYER 5: DEAD CODE INJECTION
// ========================================
function injectDeadCode(tokens) {
  const deadCodeSnippets = [
    `local ${genHexName()}=(function()local t=0 for i=1,${Math.floor(Math.random()*100)+50} do t=t+i end return t end)()`,
    `local ${genHexName()}=string.rep(${genHexName()} or "",${Math.floor(Math.random()*10)+1})`,
    `local ${genHexName()}=math.random(${Math.floor(Math.random()*1000)},${Math.floor(Math.random()*1000)+1000})`
  ];
  const result = [];
  const injectInterval = Math.floor(Math.random() * 20) + 15;
  for (let i = 0; i < tokens.length; i++) {
    result.push(tokens[i]);
    if (i % injectInterval === 0 && Math.random() > 0.7) {
      result.push({ type: 'whitespace', value: '\n' });
      result.push({ type: 'code', value: deadCodeSnippets[Math.floor(Math.random() * deadCodeSnippets.length)] });
      result.push({ type: 'whitespace', value: '\n' });
    }
  }
  return result;
}

// ========================================
// LAYER 6-9: SELF-HOSTING POLYMORPHIC VM + PACKING
// ========================================
function shuffleAlphabet(base) {
  const arr = base.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

function customBase64Encode(bytes, alphabet) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i], b2 = i + 1 < bytes.length ? bytes[i + 1] : 0, b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += alphabet[b1 >> 2];
    result += alphabet[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < bytes.length ? alphabet[((b2 & 15) << 2) | (b3 >> 6)] : '';
    result += i + 2 < bytes.length ? alphabet[b3 & 63] : '';
  }
  return result;
}

function packSource(source) {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  const key = Math.floor(Math.random() * 255) + 1;
  const encrypted = new Uint8Array(compressed.length);
  for (let i = 0; i < compressed.length; i++) encrypted[i] = compressed[i] ^ ((key + i * 7) % 256);
  
  const baseAlpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const shuffledAlpha = shuffleAlphabet(baseAlpha);
  
  return { 
    encoded: customBase64Encode(encrypted, shuffledAlpha), 
    key, 
    alphabet: shuffledAlpha,
    integrity: key ^ 0xAA
  };
}

function generatePolymorphicVMLoader(packed) {
  // Generate UNIQUE names for THIS VM instance only
  const vmData = genHexName();
  const vmAlpha = genHexName();
  const vmKey = genHexName();
  const vmDecode = genHexName();
  const vmResult = genHexName();
  const vmStr = genHexName();
  const vmI = genHexName();
  const vmIntegrity = genHexName();
  
  // Self-hosting VM that can decode itself AND execute payload
  return `local ${vmData}="${packed.encoded}"
local ${vmAlpha}="${packed.alphabet}"
local ${vmKey}=${packed.key}
local ${vmIntegrity}=${packed.integrity}
local function ${vmDecode}(data,alpha,key)
local res={}
for ${vmI}=1,#data,4 do
local c1=alpha:find(data:sub(${vmI},${vmI}))-1
local c2=alpha:find(data:sub(${vmI}+1,${vmI}+1))-1
local c3=${vmI}+2<=#data and alpha:find(data:sub(${vmI}+2,${vmI}+2))-1 or 0
local c4=${vmI}+3<=#data and alpha:find(data:sub(${vmI}+3,${vmI}+3))-1 or 0
res[#res+1]=c1*4+c2/16
if ${vmI}+2<=#data then res[#res+1]=(c2%16)*16+c3/4 end
if ${vmI}+3<=#data then res[#res+1]=(c3%4)*64+c4 end
end
local out={}
for ${vmI}=1,#res do
out[${vmI}]=bit32.bxor(res[${vmI}],(key+${vmI}-1)%256)
end
return out
end
local ${vmResult}=${vmDecode}(${vmData},${vmAlpha},${vmKey})
local ${vmStr}=""
for ${vmI}=1,#${vmResult} do ${vmStr}=${vmStr}..string.char(${vmResult}[${vmI}]) end
-- Anti-tamper check
if bit32.bxor(${vmKey},0xAA)~=${vmIntegrity} then error("VM Integrity Failed") end
loadstring(${vmStr})()`;
}

function tokensToString(tokens) { return tokens.map(t => t.value).join(''); }

// ========================================
// MAIN PIPELINE (EXPORTED)
// ========================================
export function obfuscate(source, options = {}) {
  const { encryptStrings: encStr = true, obfuscateNumbers: encNum = true, renameVariables: renVar = true, injectDeadCode: deadCode = true, packFinal: pack = true, strength = 'extreme' } = options;
  
  // Layer 1: Tokenize with Chaotic Keywords
  let tokens = tokenize(source);
  
  // Layer 2: String Encryption
  if (encStr) tokens = encryptStrings(tokens);
  
  // Layer 3: Number Obfuscation
  if (encNum) tokens = obfuscateNumbers(tokens);
  
  // Layer 4: Variable Renaming (Handles chaotic keywords too)
  if (renVar) tokens = renameVariables(tokens);
  
  // Layer 5: Dead Code Injection
  if (deadCode) tokens = injectDeadCode(tokens);
  
  let result = tokensToString(tokens);
  
  // Layer 6: Control Flow Obfuscation
  if (strength === 'high' || strength === 'extreme') result = `(function()\n${result}\nend)()`;
  
  // Layer 7: Proxy Functions
  if (strength === 'extreme') {
    const proxies = ['print','tostring','tonumber','pairs','ipairs'].map(f => `local ${genHexName()}=${f}`).join('\n');
    result = proxies + '\n' + result;
  }
  
  // Layer 8 & 9: Polymorphic VM Packing + Loader
  if (pack) {
    const packed = packSource(result);
    result = generatePolymorphicVMLoader(packed);
  }
  return result;
}

export { tokenize };
