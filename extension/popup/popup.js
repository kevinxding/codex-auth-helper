import { beginAuthorization, exchangeCallback, normalizeCredential, codexFormat } from '../oauth.js';

const $ = id => document.getElementById(id);
let pending = null;
let credential = null;
let busy = false;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.error = String(error);
}

function render() {
  $('callback-panel').hidden = !pending;
  $('result').hidden = !credential;
  if (!credential) {
    $('preview').textContent = '';
    $('account').textContent = '';
    $('expiry').textContent = '';
    return;
  }
  $('account').textContent = `账号：${credential.email || '未提供邮箱'} · ${credential.account_id}`;
  $('expiry').textContent = `Access token 到期：${new Date(credential.expired).toLocaleString()}（不代表 refresh token 的有效期）`;
  const preview = { ...credential };
  for (const key of ['access_token', 'refresh_token', 'id_token']) preview[key] = '[已提供，隐藏显示]';
  $('preview').textContent = JSON.stringify(preview, null, 2);
}

async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button,input').forEach(el => el.disabled = true);
  try { await action(); } catch (error) { status(error.message || '操作失败，请重新授权。', true); }
  finally {
    busy = false;
    document.querySelectorAll('button,input').forEach(el => el.disabled = false);
    render();
  }
}

$('login').addEventListener('click', () => run(async () => {
  pending = null;
  credential = null;
  $('callback').value = '';
  const request = await beginAuthorization();
  await chrome.tabs.create({ url: request.url });
  pending = request;
  status('已打开官方授权页面。完成后将完整回调网址粘贴到本页，10 分钟内有效。');
}));

$('cancel').addEventListener('click', () => {
  pending = null;
  $('callback').value = '';
  status('已取消本次授权。');
  render();
});

$('exchange').addEventListener('click', () => run(async () => {
  if (!pending) throw new Error('请先发起授权。');
  status('正在向官方交换授权码…');
  try {
    credential = await exchangeCallback($('callback').value.trim(), pending);
    status('已收到 OAuth 凭证，可导出 New API JSON。尚未发起模型调用。');
  } finally {
    // Do not retry a possibly consumed authorization code after a network failure.
    pending = null;
    $('callback').value = '';
  }
}));

$('file').addEventListener('change', () => run(async () => {
  const file = $('file').files[0];
  if (!file) return;
  credential = null;
  pending = null;
  $('callback').value = '';
  try {
    if (file.size > 1024 * 1024) throw new Error('文件超过 1 MB，请选择单账号 auth.json。');
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('文件不是合法 JSON。'); }
    credential = normalizeCredential(data);
    status('已在本地转换格式。没有向上游发送请求，无法据此确认凭证是否被撤销。');
  } finally { $('file').value = ''; }
}));

async function download(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename, saveAs: true });
    status('已提交保存请求。请在保存窗口中选择 D 盘位置。');
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
}

$('download').addEventListener('click', () => run(async () => {
  if (!credential) return;
  await download(normalizeCredential(credential), 'newapi-codex.json');
}));
$('copy').addEventListener('click', () => run(async () => {
  if (!credential) return;
  await navigator.clipboard.writeText(JSON.stringify(normalizeCredential(credential), null, 2));
  status('New API JSON 已复制。粘贴到你自己的渠道密钥框即可。');
}));
$('codex').addEventListener('click', () => run(async () => {
  if (!credential) return;
  await download(codexFormat(normalizeCredential(credential)), 'auth.json');
}));
$('clear').addEventListener('click', () => {
  credential = null;
  pending = null;
  $('callback').value = '';
  $('file').value = '';
  status('已清除本页内存中的凭证。已下载文件和系统剪贴板未被删除。');
  render();
});
