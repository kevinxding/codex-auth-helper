// Protocol references and exact source revisions are recorded in REFERENCES.md.
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const REDIRECT_URI = 'http://localhost:1455/auth/callback';
const ISSUER = 'https://auth.openai.com';
const AUTH_CLAIM = 'https://api.openai.com/auth';
const MAX_AGE_MS = 10 * 60 * 1000;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwtPart(token, index) {
  try {
    const part = token.split('.')[index].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')), c => c.charCodeAt(0));
    const result = JSON.parse(new TextDecoder().decode(bytes));
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
  } catch { return {}; }
}

function required(value, name) {
  if (typeof value !== 'string' || !value.trim() || /^(placeholder|null|undefined)$/i.test(value.trim())) {
    throw new Error(`缺少真实的 ${name}。请使用 OAuth 授权，网页 Session 无法补出刷新凭证。`);
  }
  return value.trim();
}

function signedShape(token, name) {
  const parts = token.split('.');
  const header = jwtPart(token, 0);
  if (parts.length !== 3 || !parts[2] || !header.alg || header.alg === 'none' || header.cpa_synthetic || parts[2] === 'synthetic') {
    throw new Error(`${name} 不是带签名的 JWT，拒绝导出占位或合成凭证。`);
  }
}

// Structural inspection only: decoding claims does not verify JWT signatures.
export function normalizeCredential(data, { issuedNow = false } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('需要单个账号的 JSON 对象。');
  const tokens = data.tokens ?? data;
  const accessToken = required(tokens.access_token, 'access_token');
  const refreshToken = required(tokens.refresh_token, 'refresh_token');
  const idToken = required(tokens.id_token, 'id_token');
  signedShape(accessToken, 'access_token');
  signedShape(idToken, 'id_token');
  const access = jwtPart(accessToken, 1);
  const id = jwtPart(idToken, 1);
  if (access.client_id && access.client_id !== CLIENT_ID) {
    throw new Error('此 token 的 OAuth client_id 与 New API Codex 刷新流程不匹配，请重新 OAuth 授权。');
  }
  const accessAccount = access[AUTH_CLAIM]?.chatgpt_account_id;
  const idAccount = id[AUTH_CLAIM]?.chatgpt_account_id;
  const accountId = required(tokens.account_id || accessAccount || idAccount, 'account_id');
  if ((accessAccount && accessAccount !== accountId) || (idAccount && idAccount !== accountId)) {
    throw new Error('account_id 与 token 中的账号不一致，请重新授权，勿混用多个账号的字段。');
  }
  if (refreshToken === accessToken || refreshToken === idToken) throw new Error('refresh_token 不能使用 access_token 或 id_token 代替。');
  if (typeof access.exp !== 'number' || !Number.isFinite(access.exp) || !Number.isFinite(new Date(access.exp * 1000).getTime())) {
    throw new Error('无法从 access_token 读取真实到期时间。');
  }
  if (access.exp * 1000 <= Date.now()) throw new Error('access_token 已过期，请重新授权或从凭证管理端取得最新文件。');
  const key = {
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: idToken,
    account_id: accountId,
    type: 'codex',
    expired: new Date(access.exp * 1000).toISOString(),
  };
  const email = data.email || id.email || access['https://api.openai.com/profile']?.email;
  if (typeof email === 'string' && email) key.email = email;
  // Importing a file is not a refresh: preserve its real timestamp or omit it.
  if (issuedNow) key.last_refresh = new Date().toISOString();
  else if (typeof data.last_refresh === 'string' && Number.isFinite(Date.parse(data.last_refresh))) {
    key.last_refresh = new Date(data.last_refresh).toISOString();
  }
  return key;
}

export async function beginAuthorization() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const url = new URL('/oauth/authorize', ISSUER);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access', state,
    code_challenge: challenge, code_challenge_method: 'S256',
    id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: 'codex_cli_rs',
  }).toString();
  return { url: url.href, verifier, state, createdAt: Date.now() };
}

export async function exchangeCallback(raw, pending) {
  if (!pending || Date.now() - pending.createdAt > MAX_AGE_MS) throw new Error('本次授权已过期，请重新点击登录。');
  let callback;
  try { callback = new URL(raw); } catch { throw new Error('请输入完整回调网址。'); }
  const expected = new URL(REDIRECT_URI);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.username || callback.password || callback.hash) {
    throw new Error('回调必须是本次登录的 http://localhost:1455/auth/callback 网址。');
  }
  const params = callback.searchParams;
  if (params.getAll('state').length !== 1 || params.get('state') !== pending.state) throw new Error('授权 state 不匹配，请使用本插件本次发起的登录链接。');
  if (params.has('iss') && (params.getAll('iss').length !== 1 || params.get('iss') !== ISSUER)) throw new Error('授权签发方不匹配。');
  if (params.has('error')) throw new Error('官方页面未完成授权，请重新登录。');
  if (params.getAll('code').length !== 1 || !params.get('code')) throw new Error('回调缺少唯一授权码。');
  let response;
  try {
    response = await fetch(`${ISSUER}/oauth/token`, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID,
        code: params.get('code'), redirect_uri: REDIRECT_URI, code_verifier: pending.verifier }),
    });
  } catch { throw new Error('交换凭证连接失败或超时。请重新发起授权，不要重复使用旧回调网址。'); }
  // Never display the raw upstream response, which might include credentials.
  if (!response.ok) throw new Error(`OAuth 交换失败（HTTP ${response.status}）。请重新授权；若仍失败，可导入 Codex 原生 auth.json。`);
  let result;
  try { result = await response.json(); } catch { throw new Error('授权服务器未返回 JSON，请重新授权。'); }
  return normalizeCredential(result, { issuedNow: true });
}

export function codexFormat(key) {
  const result = { auth_mode: 'chatgpt', OPENAI_API_KEY: null, tokens: {
    id_token: key.id_token, access_token: key.access_token, refresh_token: key.refresh_token, account_id: key.account_id,
  } };
  if (key.last_refresh) result.last_refresh = key.last_refresh;
  return result;
}
