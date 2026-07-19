# cf_gh_link

一个可直接部署到 Cloudflare Workers 的 GitHub 下载加速器。它只允许代理 GitHub 及其 Releases 下载域名，避免成为开放代理。

## 支持的请求

- Releases 资源（优先支持，下载响应会在边缘缓存一年）
- 仓库压缩包，例如 `archive/refs/heads/main.zip`
- Raw 文件（粘贴 GitHub `blob` 文件页会自动转换为 `raw.githubusercontent.com` 下载地址）
- GitHub API
- Git Smart HTTP：可用 Worker URL 执行 `git clone`、`fetch`、`pull`

## 部署

1. 安装依赖：`npm install`
2. 登录 Cloudflare：`npx wrangler login`
3. 部署：`npm run deploy`

部署成功后，将输出的 `https://cf-gh-link.<账户>.workers.dev` 替换下面的 `<worker>`。

## 用法

最通用的格式是在原始 GitHub 地址前添加 Worker 域名和一个 `/`：

```text
https://<worker>/https://github.com/OWNER/REPO/releases/download/TAG/FILE
```

也可使用更短的路由：

```text
https://<worker>/releases/OWNER/REPO/TAG/FILE
https://<worker>/releases/OWNER/REPO/TAG/WITH/SLASHES/FILE
https://<worker>/gh/OWNER/REPO/archive/refs/heads/main.zip
https://<worker>/gh/OWNER/REPO/blob/main/README.md
https://<worker>/gh/OWNER/REPO/raw/main/README.md
git clone https://<worker>/gh/OWNER/REPO.git
```

短 `releases` 路由会把最后一个路径片段识别为资源文件名，因此 tag 可以包含 `/`。粘贴 GitHub `blob` 文件页时，Worker 会自动改写到对应的 raw 下载地址。

对于 Git 操作，建议通过 `gh` 路由使用 Worker 地址作为 remote；Git 的 `info/refs`、`git-upload-pack` 请求会原样转发。


## 固定短链

如果有常用的加速资源，可以直接在 Cloudflare Workers 后台添加环境变量，无需修改代码即可生成固定短链。支持以下变量名（按优先级读取第一个非空值）：`SHORT_LINKS`、`FIXED_LINKS`、`LINKS`。

推荐使用 JSON 对象格式：

```json
{
  "mytool": "https://github.com/OWNER/REPO/releases/download/TAG/FILE",
  "readme": "https://github.com/OWNER/REPO/blob/main/README.md"
}
```

也支持逐行配置，便于在后台变量输入框中快速维护：

```text
mytool=https://github.com/OWNER/REPO/releases/download/TAG/FILE
readme=https://github.com/OWNER/REPO/blob/main/README.md
```

配置完成后访问 `https://<worker>/mytool` 或 `https://<worker>/readme` 即可按对应资源进行加速。短链名称只能占用一级路径；`gh`、`api`、`releases` 等内置路由名称会保留给系统使用。

如果通过 Wrangler、GitHub Actions 或 Cloudflare 构建重新部署，请保留配置中的 `keep_vars: true`。否则重新部署可能会覆盖在 Cloudflare 后台手动添加的环境变量，导致访问短链时仍提示 `Use /gh/OWNER/REPO/..., /SHORT_NAME, or /https://github.com/...`。

## 安全与缓存

仅允许 HTTPS 到 GitHub 白名单域名。Release 下载的跳转会改写回 Worker 域名，使客户端仍然经过加速器；仓库和 API 请求不被强制缓存，以免内容或鉴权语义错误。

## 服务范围

仅对静态资源下载提供加速，包括 Releases 文件、仓库压缩包和 Raw 文件。GitHub 网页、仓库主页及仓库介绍页不提供加速支持。
