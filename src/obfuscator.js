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

// ========================================
// LAYER 1: TOKENIZER (Simple but Effective)
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
      if (end === -1) end = len;
      else end += 2;
      tokens.push({ type: 'comment', value: source.slice(i, end) });
      i = end;
      continue;
    }

    // Line comment --
    if (char === '-' && next === '-') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = len;
      tokens.push({ type: 'comment', value: source.slice(i, end) });
      i = end;
      continue;
    }

    // Block string [[ ]]
    if (char === '[' && next === '[') {
      let end = source.indexOf(']]', i + 2);
      if (end === -1) end = len;
      else end += 2;
      tokens.push({ type: 'string', value: source.slice(i, end), raw: source.slice(i + 2, end - 2) });
      i = end;
      continue;
    }

    // String " or '
    if (char === '"' || char === "'") {
      const quote = char;
      let j = i + 1;
      let raw = '';
      while (j < len && source[j] !== quote) {
        if (source[j] === '\\' && j + 1 < len) {
          raw += source[j] + source[j + 1];
          j += 2;
        } else {
          raw += source[j];
          j++;
        }
      }
      j++; // skip closing quote
      tokens.push({ type: 'string', value: source.slice(i, j), raw });
      i = j;
      continue;
    }

    // Number
    if (/\d/.test(char) || (char === '.' && /\d/.test(next))) {
      let j = i;
      if (char === '0' && (next === 'x' || next === 'X')) {
        j += 2;
        while (j < len && /[0-9a-fA-F]/.test(source[j])) j++;
      } else if (char === '0' && (next === 'b' || next === 'B')) {
        j += 2;
        while (j < len && /[01]/.test(source[j])) j++;
      } else {
        while (j < len && /[\d.]/.test(source[j])) j++;
        if (j < len && (source[j] === 'e' || source[j] === 'E')) {
          j++;
          if (j < len && (source[j] === '+' || source[j] === '-')) j++;
          while (j < len && /\d/.test(source[j])) j++;
        }
      }
      tokens.push({ type: 'number', value: source.slice(i, j) });
      i = j;
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_]/.test(source[j])) j++;
      const word = source.slice(i, j);
      const type = LUAU_KEYWORDS.has(word) ? 'keyword' : 'identifier';
      tokens.push({ type, value: word });
      i = j;
      continue;
    }

    // Operators
    if (char === '.' && next === '.' && next2 === '.') {
      tokens.push({ type: 'operator', value: '...' });
      i += 3;
      continue;
    }
    if (char === '.' && next === '.') {
      tokens.push({ type: 'operator', value: '..' });
      i += 2;
      continue;
    }
    if (char === ':' && next === ':') {
      tokens.push({ type: 'operator', value: '::' });
      i += 2;
      continue;
    }
    if ((char === '=' && next === '=') || (char === '~' && next === '=') ||
        (char === '<' && next === '=') || (char === '>' && next === '=')) {
      tokens.push({ type: 'operator', value: char + next });
      i += 2;
      continue;
    }
    if ('+-*/%^#=<>(){}[];:,.~'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    // Whitespace
    if (/\s/.test(char)) {
      let j = i;
      while (j < len && /\s/.test(source[j])) j++;
      tokens.push({ type: 'whitespace', value: source.slice(i, j) });
      i = j;
      continue;
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
      for (let i = 0; i < token.raw.length; i++) {
        bytes.push(token.raw.charCodeAt(i) ^ key);
      }
      const encrypted = `{${bytes.join(',')}}`;
      newTokens.push({ type: 'expression', value: `${decoderName}(${encrypted},${key})` });
    } else {
      newTokens.push(token);
    }
  }
  
  return newTokens;
}

function generateStringDecoder(funcName) {
  const code = `local function ${funcName}(t,k)local r={}for i=1,#t do r[i]=string.char(bit32.bxor(t[i],k))end return table.concat(r)end`;
  return { type: 'code', value: code };
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
      
      const strategy = strategies[Math.floor(Math.random() * strategies.length)];
      return { type: 'expression', value: strategy() };
    }
    return token;
  });
}

// ========================================
// LAYER 4: VARIABLE RENAMING (SCOPE-AWARE)
// ========================================
function renameVariables(tokens) {
  const scopeStack = [new Map()]; // global scope
  const renameMap = new Map();
  
  function currentScope() {
    return scopeStack[scopeStack.length - 1];
  }
  
  function genName() {
    return '_0x' + Math.random().toString(16).slice(2, 10).toUpperCase();
  }
  
  function getOrGenName(name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i].has(name)) {
        return scopeStack[i].get(name);
      }
    }
    const newName = genName();
    currentScope().set(name, newName);
    return newName;
  }
  
  const result = [];
  let i = 0;
  
  while (i < tokens.length) {
    const token = tokens[i];
    
    if (token.type === 'keyword') {
      if (token.value === 'local' && i + 1 < tokens.length) {
        result.push(token);
        i++;
        // Skip whitespace
        while (i < tokens.length && tokens[i].type === 'whitespace') {
          result.push(tokens[i]);
          i++;
        }
        // Rename identifier after local
        if (i < tokens.length && tokens[i].type === 'identifier') {
          const name = tokens[i].value;
          if (!LUAU_GLOBALS.has(name)) {
            const newName = getOrGenName(name);
            result.push({ type: 'identifier', value: newName });
          } else {
            result.push(tokens[i]);
          }
          i++;
        }
        continue;
      }
      
      if (token.value === 'function' || token.value === 'do' || 
          token.value === 'for' || token.value === 'while' || 
          token.value === 'repeat') {
        scopeStack.push(new Map());
      }
      
      if (token.value === 'end' || token.value === 'until') {
        if (scopeStack.length > 1) {
          scopeStack.pop();
        }
      }
      
      result.push(token);
      i++;
      continue;
    }
    
    if (token.type === 'identifier' && !LUAU_GLOBALS.has(token.value)) {
      const newName = getOrGenName(token.value);
      result.push({ type: 'identifier', value: newName });
      i++;
      continue;
    }
    
    result.push(token);
    i++;
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
      const snippet = deadCodeSnippets[Math.floor(Math.random() * deadCodeSnippets.length)];
      result.push({ type: 'whitespace', value: '\n' });
      result.push({ type: 'code', value: snippet });
      result.push({ type: 'whitespace', value: '\n' });
    }
  }
  
  return result;
}

// ========================================
// LAYER 6: CONTROL FLOW OBFUSCATION
// ========================================
function obfuscateControlFlow(source) {
  // Wrap entire code in IIFE
  const wrapped = `(function()\n${source}\nend)()`;
  return wrapped;
}

// ========================================
// LAYER 7: PROXY FUNCTIONS
// ========================================
function injectProxyFunctions(source) {
  const proxies = [
    `local ${genHexName()}=print`,
    `local ${genHexName()}=tostring`,
    `local ${genHexName()}=tonumber`,
    `local ${genHexName()}=pairs`,
    `local ${genHexName()}=ipairs`
  ];
  
  return proxies.join('\n') + '\n' + source;
}

// ========================================
// LAYER 8: FINAL PACKING (COMPRESS + ENCRYPT + ENCODE)
// ========================================
function packSource(source) {
  // Step 1: Compress with pako (deflate)
  const compressed = pako.deflate(new TextEncoder().encode(source));
  
  // Step 2: XOR encrypt with rotating key
  const key = Math.floor(Math.random() * 255) + 1;
  const encrypted = new Uint8Array(compressed.length);
  for (let i = 0; i < compressed.length; i++) {
    encrypted[i] = compressed[i] ^ ((key + i) % 256);
  }
  
  // Step 3: Encode with custom Base64
  const customAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+_';
  const encoded = customBase64Encode(encrypted, customAlphabet);
  
  return { encoded, key, alphabet: customAlphabet };
}

function customBase64Encode(bytes, alphabet) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    
    result += alphabet[b1 >> 2];
    result += alphabet[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < bytes.length ? alphabet[((b2 & 15) << 2) | (b3 >> 6)] : '';
    result += i + 2 < bytes.length ? alphabet[b3 & 63] : '';
  }
  return result;
}

// ========================================
// LAYER 9: LOADER GENERATION (OBFUSCATED)
// ========================================
function generateLoader(packed) {
  const decoderName = genHexName();
  const decompressName = genHexName();
  
  const loader = `
local ${decoderName}="${packed.encoded}"
local ${genHexName()}="${packed.alphabet}"
local ${genHexName()}=${packed.key}

local function ${decompressName}(s,a,k)
  local b={}
  for i=1,#s,4 do
    local c1=a:find(s:sub(i,i))-1
    local c2=a:find(s:sub(i+1,i+1))-1
    local c3=i+2<=#s and a:find(s:sub(i+2,i+2))-1 or 0
    local c4=i+3<=#s and a:find(s:sub(i+3,i+3))-1 or 0
    b[#b+1]=c1*4+c2/16
    if i+2<=#s then b[#b+1]=(c2%16)*16+c3/4 end
    if i+3<=#s then b[#b+1]=(c3%4)*64+c4 end
  end
  local r={}
  for i=1,#b do
    r[i]=bit32.bxor(b[i],(k+i-1)%256)
  end
  return r
end

local ${genHexName()}=${decompressName}(${decoderName},${genHexName()},${genHexName()})
local ${genHexName()}=""
for i=1,#${genHexName()} do
  ${genHexName()}=${genHexName()}..string.char(${genHexName()}[i])
end

-- Decompress (pako inflate equivalent in Luau)
local ${genHexName()}=function(s)
  -- Simplified inflate (for demo, use actual inflate in production)
  return s
end

loadstring(${genHexName()}(${genHexName()}))()
`;
  
  return loader;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================
function tokensToString(tokens) {
  return tokens.map(t => t.value).join('');
}

// ========================================
// MAIN OBFUSCATION PIPELINE
// ========================================
export function obfuscate(source, options = {}) {
  const {
    encryptStrings = true,
    obfuscateNumbers = true,
    renameVariables = true,
    injectDeadCode = true,
    packFinal = true,
    strength = 'extreme' // 'low', 'medium', 'high', 'extreme'
  } = options;
  
  // Layer 1: Tokenize
  let tokens = tokenize(source);
  
  // Layer 2: String Encryption
  if (encryptStrings) {
    tokens = encryptStrings(tokens);
  }
  
  // Layer 3: Number Obfuscation
  if (obfuscateNumbers) {
    tokens = obfuscateNumbers(tokens);
  }
  
  // Layer 4: Variable Renaming
  if (renameVariables) {
    tokens = renameVariables(tokens);
  }
  
  // Layer 5: Dead Code Injection
  if (injectDeadCode) {
    tokens = injectDeadCode(tokens);
  }
  
  // Convert back to string
  let result = tokensToString(tokens);
  
  // Layer 6: Control Flow Obfuscation
  if (strength === 'high' || strength === 'extreme') {
    result = obfuscateControlFlow(result);
  }
  
  // Layer 7: Proxy Functions
  if (strength === 'extreme') {
    result = injectProxyFunctions(result);
  }
  
  // Layer 8 & 9: Packing + Loader
  if (packFinal) {
    const packed = packSource(result);
    result = generateLoader(packed);
  }
  
  return result;
}

export { tokenize };
