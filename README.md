# New API Codex OAuth 助手

基于 [zhishile/codex-auth-helper](https://github.com/zhishile/codex-auth-helper) 的 Chromium / Edge 扩展改造版。面向 New API 的 **ChatGPT Subscription (Codex)** 渠道，生成可以粘贴到渠道密钥框的平铺 JSON。

## 与原版的区别

- 使用 OAuth Authorization Code + PKCE S256；用户在 `auth.openai.com` 自行登录。
- 通过官方 token 接口取得真实 `access_token`、`refresh_token` 和 `id_token`。
- 删除网页 Session 抓取、合成 id_token、sessionToken/placeholder 冒充 refresh_token 的逻辑。
- 支持导入 Codex 原生嵌套 `auth.json` 或 New API 平铺凭证，并检查字段、账号一致性、access token 到期时间。
- 一键复制或保存 New API JSON；同时提供 Codex 原生格式导出。
- 默认脱敏展示 token，凭证只保存在当前扩展页内存；不写浏览器同步存储，不自动上传到 New API。
- OAuth 请求仅发往 `https://auth.openai.com/oauth/token`。不是离线授权工具。

## 安装（无需构建）

1. 下载本分支或使用本地仓库，放在 D 盘。
2. 打开 Edge 的 `edge://extensions`，开启开发者模式。
3. 点击“加载解压缩的扩展”，选择本仓库的 `extension` 文件夹。
4. 点击工具栏扩展图标，会打开一个完整操作页。

替换旧版本时，在原扩展卡片上重新加载；如果它仍指向旧目录，请加载本版的 `extension` 文件夹。

## 使用 OAuth 获得 refresh_token

1. 点击“使用 ChatGPT 进行 OAuth 授权”，在新标签页完成登录及官方要求的验证。保持扩展操作页打开。
2. 登录后跳转到 `http://localhost:1455/auth/callback?code=…&state=…`。本插件没有本地 HTTP 服务，因此“无法访问此页面”是可预期的。
3. 复制这个页面地址栏的完整网址，返回扩展粘贴，点击“完成授权并读取凭证”。不要只复制 code。
4. 插件会校验回调地址、state、10 分钟有效期，再使用本次 PKCE verifier 交换凭证。
5. 点击“保存 New API JSON”（保存到 D 盘）或“复制 New API JSON”。

请勿同时运行另一个 Codex 登录回调服务。回调错误、超时或网络错误后应重新开始登录，避免重复使用已消费的授权码。刷新或关闭扩展页会丢失此次授权状态和内存凭证。

## 导入已有文件

展开“已有 Codex auth.json？直接导入”，选择本地文件。文件不通过网络发送。

缺少真实 refresh_token、带 synthetic id_token、账号字段矛盾或 access token 过期的文件会被拒绝。仅改变 JSON 格式无法修复被撤销的凭证，也不能从网页 Session 凭空生成 refresh_token。

## New API 导出格式

字段对照 `QuantumNous/new-api` 的 `v1.0.0-rc.41` 源码：

```json
{
  "access_token": "<OAuth 返回值>",
  "refresh_token": "<OAuth 返回值>",
  "id_token": "<OAuth 返回值>",
  "account_id": "<token 中的 ChatGPT account ID>",
  "type": "codex",
  "expired": "<access_token.exp 转换成 ISO 8601>",
  "email": "<存在时导出>",
  "last_refresh": "<真实授权/刷新时间，存在时导出>"
}
```

进入 New API → 渠道 → ChatGPT Subscription (Codex) → 将完整 JSON 粘贴到密钥框。文件不是全渠道备份；不要拿它去导入整个渠道表。导入旧文件时不会把导入时间冒充 last_refresh。

New API rc.41 的刷新实现固定使用 Codex OAuth client ID，因此插件使用相同 client ID。OAuth 获取行为受上游接口和账号授权约束；本项目不是 OpenAI 官方插件。

## 刷新与凭证边界

插件负责获取和导出，后续由 New API 管理刷新。插件不在后台定时刷新，以免导出后与服务器竞争轮换同一 refresh_token。不要把同一份可刷新凭证同时交给多个自动刷新客户端。

完整导出文件和剪贴板内容相当于登录凭证。页面的“清除”仅清除内存，不删除已保存文件、不撤销上游授权，也不会更改系统剪贴板。

JWT 只做结构检查和元数据解码，没有离线验证签名或上游调用权限。refresh_token 是否仍有效只能由官方授权服务器判断。获取模型列表成功也不等于实际推理请求成功。

## 实现来源与验证状态

参照其他开源实现的协议设计，并按浏览器扩展环境重新实现，无运行时第三方依赖。具体文件、版本和采用的设计见 [REFERENCES.md](REFERENCES.md)。

按需求没有编写或运行测试，也没有使用真实账号完成 OAuth / New API 端到端调用。仅进行代码审阅和静态语法检查；不得把此版本描述为已实测登录成功。

`landing-page/` 是保留的上游旧展示页，不代表本版行为；本 README 与 extension/ 为本版依据。
