# 实现参考（2026-10-03）

此改造对照以下公开源码理解 OAuth 协议、凭证结构与回调生命周期，按 MV3 扩展环境重新实现；没有将上游服务器或 SDK 源文件整体复制进扩展。

| 来源 | 固定版本 / 文件 | 采用的设计 |
| --- | --- | --- |
| zhishile/codex-auth-helper | `6325382a90c57bd48f7c5cd657de079ae36c7c55` | 原始 fork、MV3 目录和图标；替换旧 Session 导出逻辑 |
| anxkhn/codex-openai-proxy | [`b489b01132f215377fc212e6b38c7ff86094253e/auth/oauth.py`](https://github.com/anxkhn/codex-openai-proxy/blob/b489b01132f215377fc212e6b38c7ff86094253e/src/codex_openai_proxy/auth/oauth.py) | 随机 verifier/state、SHA256 challenge、授权码交换的表单字段、localhost 回调路径 |
| EvanZhouDev/openai-oauth | [`9079e62840a7f4b19114cb8f4bb0009b5bcf1773/login.ts`](https://github.com/EvanZhouDev/openai-oauth/blob/9079e62840a7f4b19114cb8f4bb0009b5bcf1773/packages/openai-oauth/src/login.ts) | 回调 state 校验、超时、localhost:1455、授权码单次交换 |
| EvanZhouDev/openai-oauth | [`runtime.ts`](https://github.com/EvanZhouDev/openai-oauth/blob/9079e62840a7f4b19114cb8f4bb0009b5bcf1773/packages/core/src/runtime.ts)、[`auth-file.ts`](https://github.com/EvanZhouDev/openai-oauth/blob/9079e62840a7f4b19114cb8f4bb0009b5bcf1773/packages/local/src/auth-file.ts) | `openid profile email offline_access`、Codex client ID、token claims 元数据、原生 auth.json 结构 |
| QuantumNous/new-api | [`v1.0.0-rc.41/oauth_key.go`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.41/relay/channel/codex/oauth_key.go) | 导出对象的八个平铺字段 |
| QuantumNous/new-api | [`codex_credential_refresh.go`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.41/service/codex_credential_refresh.go)、[`codex_oauth.go`](https://github.com/QuantumNous/new-api/blob/v1.0.0-rc.41/service/codex_oauth.go) | refresh_token 必需、固定 client ID、expired/last_refresh 的含义 |

与参考项目的区别：MV3 扩展无法直接监听 TCP localhost 端口，本版使用用户手动粘贴回调 URL；只交换本页发起的授权，校验 origin/path/state/期限。没有读取浏览器 Cookie、监听全局导航或向第三方发送凭证的功能。

真实 OAuth token 保留原样，不构造 synthetic id_token，不将 session token 当成 refresh_token，不修改 token 内的到期时间。

官方补充资料：[Codex app-server / Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)。该文档强调模型目录不等于模型调用权限；本插件对 New API rc.41 的兼容性取自该版本源码，不能将官方其他 OAuth 集成的支持视为对本社区插件的认证。
