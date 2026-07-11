# cf_gh_link

一个可直接部署到 Cloudflare Workers 的 GitHub 下载加速器。它只允许代理 GitHub 及其 Releases 下载域名，避免成为开放代理。

## 支持的请求

- Releases 资源（优先支持，下载响应会在边缘缓存一年）
- 仓库压缩包，例如 `archive/refs/heads/main.zip`
- Raw 文件
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
https://<worker>/gh/OWNER/REPO/archive/refs/heads/main.zip
https://<worker>/gh/OWNER/REPO/raw/main/README.md
git clone https://<worker>/gh/OWNER/REPO.git
```

对于 Git 操作，建议通过 `gh` 路由使用 Worker 地址作为 remote；Git 的 `info/refs`、`git-upload-pack` 请求会原样转发。

## 安全与缓存

仅允许 HTTPS 到 GitHub 白名单域名。Release 下载的跳转会改写回 Worker 域名，使客户端仍然经过加速器；仓库和 API 请求不被强制缓存，以免内容或鉴权语义错误。
