# EXIF Photo Blog

基于 [ccongeliano/exif-photo-blog](https://github.com/ccongeliano/exif-photo-blog) 二次开发的摄影博客。上传照片即可自动解析 EXIF 元数据(相机、镜头、胶片模拟、焦距、拍摄地点等),并按多维度组织浏览。本项目在原版基础上做了深度改造,以 **Cloudflare R2 + 边缘运行时(Cloudflare Workers / EdgeOne Pages)** 为一等部署目标,零数据库、零服务器依赖。

## 主要改造点(相对原版)

- **凭据登录**:管理员邮箱 + 密码登录(`AUTH_SECRET` 签名的 JWT 会话),不再依赖 NextAuth 第三方 OAuth 提供商。
- **服务端页面守卫**:以页面级服务端鉴权替代 Next.js middleware,在 Cloudflare Workers / EdgeOne Pages 等不支持 Node.js middleware 运行时的平台上行为一致。
- **存储统一为 Cloudflare R2**:唯一远程存储,通过 S3 兼容 API(aws4fetch)直连,无需平台专用 SDK。
- **零数据库**:照片 / 相册 / 图库等元数据以 JSON 文档形式(`_data/photos.json` 等)存放在与图片同一个 R2 桶内。
- **本地开发零配置**:无 R2 凭据时自动回退到本地文件系统(`.data/`),可用示例脚本一键灌入带 EXIF 的样片。
- **浏览器端图片预处理**:上传时在浏览器生成 `-sm` / `-md` / `-lg` 尺寸变体与模糊占位,服务端无需 sharp,天然适配边缘运行时。

## 功能特性

- EXIF 自动解析:相机、镜头、焦距、光圈、快门、ISO、GPS 等
- 多维度浏览:最近 / 年份 / 相机 / 镜头 / 胶片 / 配方 / 标签 / 相册 / 焦距
- 相册分享链接、照片原图下载(可开关)
- 全文搜索、无限滚动、键盘快捷键、灯箱查看
- 动态 OG 分享图生成、RSS(`/rss.xml`)与 JSON Feed(`/feed.json`)、sitemap
- AI 辅助(可选,OpenAI):上传后自动生成标题、标签与语义描述
- 拍摄地点逆地理编码(可选,Google Places)与照片地图展示
- 明暗主题(跟随系统或指定)、多语言界面(`zh-cn` / `en-us` 等 11 种语言)
- 布局与行为开关:网格首页 / 瀑布流网格、按色彩排序、访客下载等
- Upstash Redis 限流(可选)

## 技术栈

- [Next.js](https://nextjs.org)(App Router)+ React 19 + TypeScript
- Tailwind CSS 4、Radix UI、framer-motion
- [OpenNext Cloudflare](https://opennext.js.org/cloudflare) + Wrangler(Cloudflare Workers 部署)
- jose(JWT 会话)、aws4fetch(S3 兼容 API)、exifr(EXIF 解析)、OpenLayers(地图)

## 快速开始(本地开发)

```bash
# 1. 安装依赖(需要 pnpm)
pnpm install

# 2.(可选)配置环境变量
#    本地开发可以完全跳过此步——无 R2 凭据时自动使用 .data/ 本地存储
cp .env.example .env.local

# 3.(可选)灌入带真实 EXIF 的示例照片
node scripts/seed-local.mjs

# 4. 启动开发服务器
pnpm dev
```

访问 <http://localhost:3000>。首次使用请到 `/sign-in` 登录管理员账号后,即可在 `/admin` 上传与管理照片。

> 本地模式的登录凭据同样来自环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD`,`AUTH_SECRET` 必填(建议按 `.env.example` 注释中的命令生成 32 位以上随机串)。

## 环境变量

完整说明见 [.env.example](./.env.example)。摘要如下:

**必填(生产部署)**

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_DOMAIN` | 站点域名(不含协议),用于绝对 URL / OG 图 / Feed |
| `AUTH_SECRET` | 会话签名密钥,至少 32 位随机字符串 |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 管理员登录凭据 |
| `NEXT_PUBLIC_CLOUDFLARE_R2_BUCKET` | R2 桶名 |
| `NEXT_PUBLIC_CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare 账户 ID |
| `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_DOMAIN` | 桶的公开访问域名(自定义域或 `xxx.r2.dev`) |
| `CLOUDFLARE_R2_ACCESS_KEY` / `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 API Token 凭据(对象读写权限) |

**可选**

| 变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_NAV_TITLE` / `NEXT_PUBLIC_META_TITLE` / `NEXT_PUBLIC_META_DESCRIPTION` | 导航标题与元信息 |
| `NEXT_PUBLIC_LOCALE` | 界面语言,默认 `en-us`,可设 `zh-cn` 等 |
| `NEXT_PUBLIC_DEFAULT_THEME` | 默认主题 `dark` / `light`,默认跟随系统 |
| `NEXT_PUBLIC_GRID_HOMEPAGE` / `NEXT_PUBLIC_MASONRY_GRID` | 网格 / 瀑布流首页布局 |
| `NEXT_PUBLIC_PRESERVE_ORIGINAL_UPLOADS` | 保留原始文件不压缩上传 |
| `NEXT_PUBLIC_SITE_FEEDS` | 开启 RSS / JSON 订阅 |
| `NEXT_PUBLIC_ALLOW_PUBLIC_DOWNLOADS` | 允许访客下载原图 |
| `NEXT_PUBLIC_CATEGORY_VISIBILITY` | 分类可见性与顺序(逗号分隔) |
| `NEXT_PUBLIC_COLOR_SORT` | 按色彩排序 |
| `OPENAI_SECRET_KEY` / `OPENAI_MODEL` | AI 自动生成标题 / 标签 / 描述 |
| `GOOGLE_PLACES_GEOCODING_API_KEY` | 拍摄地点逆地理编码 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 接口限流 |

## 部署到 Cloudflare Workers

仓库已包含 [wrangler.jsonc](./wrangler.jsonc)(静态资源 + SSR Worker),使用 OpenNext 适配:

```bash
pnpm build:cf     # 仅构建 OpenNext Worker
pnpm preview:cf   # 构建并用 wrangler dev 本地预览(需 .dev.vars)
pnpm deploy:cf    # 构建并部署到 Cloudflare Workers
pnpm upload:cf    # 构建并上传(不立即发布)
```

步骤:

1. 创建 R2 桶,绑定自定义域名或开启 `r2.dev` 公开访问;
2. 创建 R2 API Token(对象读写权限),拿到 Access Key / Secret Key;
3. 在 [wrangler.jsonc](./wrangler.jsonc) 中把 `NEXT_INC_CACHE_R2_BUCKET` 绑定的 `bucket_name` 改为你的桶名——OpenNext 的跨隔离实例缓存(ISR / 数据缓存 / `revalidateTag`)依赖该绑定,对应的 Durable Object(`DOShardedTagCache` / `DOQueueHandler`)会在首次部署时自动创建;
4. 配置上表所列必填环境变量(部署环境或 `.dev.vars`);
5. **(安全必需)屏蔽公开域名下的元数据与缓存路径**:照片元数据文档(`_data/*.json`)与 OpenNext 增量缓存和图片同存于该桶,若桶绑定了公开域名,任何人将可直接下载全部元数据(含私密照片)。必须通过 WAF / Transform Rule 在公开域名上拦截 `/_data/*` 等前缀,或将元数据与缓存移至独立私有桶。验证:`curl -I https://<公开域名>/_data/photos.json` 应返回 403 / 404;
6. `pnpm deploy:cf` 完成部署。部署后可在 `/admin/insights` 查看元数据公开可读性的自动检测结果。

> 本地预览(`preview:cf`)使用 [.dev.vars.example](./.dev.vars.example):复制为 `.dev.vars` 并填写真实值。预览模式下元数据同样走 S3 兼容 API,需要真实 R2 凭据。

代码层面已同步适配 EdgeOne Pages 等其他边缘运行时(服务端页面守卫 + S3 兼容存储均不依赖 Cloudflare 专有 API)。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` / `pnpm start` | 常规 Next.js 构建 / 生产启动 |
| `pnpm lint` | ESLint 检查 |
| `node scripts/seed-local.mjs` | 向 `.data/` 灌入带 EXIF 的示例照片 |
| `pnpm build:cf` / `preview:cf` / `deploy:cf` / `upload:cf` | Cloudflare Workers 构建 / 预览 / 部署 / 上传 |

## 目录结构(节选)

```
app/                  # Next.js App Router 路由(前台、/admin、/sign-in、feed、og 等)
src/
  admin/              # 管理后台组件与 Server Actions
  auth/               # 凭据登录、JWT 会话、服务端页面守卫
  photo/              # 照片网格、详情、上传、EXIF、存储抽象等
  album/ tag/ film/ lens/ camera/ recipe/ ...   # 各分类域
  platforms/
    storage/          # R2 与本地文件系统双驱动存储
    store/            # 基于 R2(S3 API)的 JSON 文档元数据仓库
  i18n/               # 多语言文案
scripts/seed-local.mjs  # 本地示例数据生成
wrangler.jsonc        # Cloudflare Workers 部署配置
```
