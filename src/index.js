import { UI } from "./ui.js";

const ALLOWED_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "codeload.github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "github-releases.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host", "cookie",
  "cf-connecting-ip", "cf-ipcountry", "cf-ray", "x-forwarded-for",
]);

function html() {
  return new Response(UI, {
    headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
  });
}

function badRequest(message) {
  return new Response(message, { status: 400, headers: { "content-type": "text/plain; charset=UTF-8" } });
}

function targetFromRequest(url) {
  // Full GitHub URL form: /https://github.com/owner/repo/...
  const raw = url.href.slice(url.origin.length + 1);
  if (raw.startsWith("https://")) return new URL(raw);

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "gh" && parts.length >= 3) {
    return new URL(`https://github.com/${parts.slice(1).join("/")}${url.search}`);
  }
  if (parts[0] === "api" && parts.length >= 2) {
    return new URL(`https://api.github.com/${parts.slice(1).join("/")}${url.search}`);
  }
  if (parts[0] === "releases" && parts.length >= 5) {
    const [owner, repo, tag, ...asset] = parts.slice(1);
    return new URL(`https://github.com/${owner}/${repo}/releases/download/${tag}/${asset.join("/")}${url.search}`);
  }
  return null;
}

function safeHeaders(headers) {
  const result = new Headers();
  for (const [name, value] of headers) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) result.set(name, value);
  }
  result.set("user-agent", "cf-gh-link/1.0");
  return result;
}

function isReleaseAsset(url) {
  return url.hostname === "github.com" && /\/releases\/download\//.test(url.pathname)
    || ["objects.githubusercontent.com", "github-releases.githubusercontent.com", "release-assets.githubusercontent.com"].includes(url.hostname);
}

function proxyUrl(requestUrl, target) {
  return `${requestUrl.origin}/${target.href}`;
}

async function proxy(request) {
  const requestUrl = new URL(request.url);
  const target = targetFromRequest(requestUrl);
  if (!target) return requestUrl.pathname === "/" ? html() : badRequest("Use /gh/OWNER/REPO/... or /https://github.com/...");
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) return badRequest("Target host is not allowed");
  if (!["GET", "HEAD", "POST"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD, POST" } });

  const init = {
    method: request.method,
    headers: safeHeaders(request.headers),
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return new Response("Unable to reach GitHub upstream", { status: 502 });
  }

  const headers = safeHeaders(upstream.headers);
  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    const redirectTarget = new URL(location, target);
    if (redirectTarget.protocol === "https:" && ALLOWED_HOSTS.has(redirectTarget.hostname)) {
      headers.set("location", proxyUrl(requestUrl, redirectTarget));
    } else {
      headers.set("location", location);
    }
  }

  // Release artifacts are immutable at a tag URL. Make them cacheable at Cloudflare's edge;
  // range requests retain GitHub's own semantics and are deliberately not force-cached.
  if (isReleaseAsset(target) && request.method === "GET" && !request.headers.has("range") && upstream.ok) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  } else if (target.pathname.endsWith(".git") || target.pathname.includes("/info/refs") || target.hostname === "api.github.com") {
    headers.set("cache-control", "no-store");
  }
  headers.set("x-github-accelerator", "cf-gh-link");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}

export default { fetch: proxy };
