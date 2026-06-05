# SSH 账号密码管理工具(sshm)—— 原型设计

- 日期:2026-06-06
- 状态:已通过 brainstorm,待实现
- 范围:Node.js + TypeScript 实现的本地终端 UI(TUI)SSH 账号密码管理工具原型(MVP)

---

## 1. 目标与范围

构建一个**单用户、本地运行的终端 UI 工具**,帮助用户管理一组 SSH 主机条目(含密码),并能在 TUI 中按 Enter 一键连接到远端 shell。

### MVP 必需能力

- 首次启动设置主密码并创建本地加密保险库
- 主机条目 CRUD:别名、host、port、user、密码、备注
- 一键 SSH 连接(自动注入密码,认证仅支持密码)
- 重启后通过主密码解锁恢复数据

### 显式不在 MVP 范围(YAGNI)

- 私钥 / passphrase / ssh-agent / ProxyJump 等其他认证方式
- 搜索、过滤、标签分组
- 导入 `~/.ssh/config` 或导出备份
- 多人/团队共享、网络同步
- 端口转发、SFTP
- 连接历史、统计

### 成功标准

通过文末"手动验收清单"(§8)即视为原型完成。

---

## 2. 架构概览

系统切成 5 个职责清晰、单向依赖的小模块:

```
                   ┌─────────────┐
                   │     UI      │  Ink 组件树:List / Form / Modal / UnlockScreen
                   │ (src/ui/*)  │
                   └──────┬──────┘
                          │ 调用
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  ┌───────────┐    ┌────────────┐    ┌────────────┐
  │  Vault    │    │  HostRepo  │    │ SshClient  │
  │ (加密读写) │    │ (CRUD API) │    │  (连接器)   │
  └─────┬─────┘    └──────┬─────┘    └────────────┘
        │ 提供 plaintext  │ 持久化通过 Vault
        └────────►◄───────┘
                          │
                   ┌──────▼──────┐
                   │   Crypto    │  scrypt + AES-256-GCM 原语,纯函数
                   └─────────────┘
```

**职责边界:**

| 模块 | 输入 | 输出 | 不做什么 |
|---|---|---|---|
| `Crypto` | (明文, 主密码) | 密文 buffer | 不碰文件、不管会话 |
| `Vault` | 文件路径 + 主密码 | 解锁后给一个内存中的 JSON 对象 + `save()` 方法 | 不知道"主机"长什么样 |
| `HostRepo` | Vault 实例 | `list/add/update/remove/get` | 不知道加密细节 |
| `SshClient` | Host 对象 | 把远端 shell 流接到 stdout/stdin,返回退出码 | 不知道密码从哪来 |
| `UI` | 用户键盘事件 | 调下面四个模块 | 不直接读写文件、不直接调 ssh2 |

依赖方向:UI → {Vault, HostRepo, SshClient};HostRepo → Vault;Vault → Crypto。无反向引用,每层均可独立 mock 测试。

---

## 3. 加密与持久化(Vault)

### 文件位置与权限

- 保险库文件:`~/.sshm/vault.enc`
- 目录权限:`0700`;文件权限:`0600`
- 已知主机指纹:`~/.sshm/known_hosts.json`(普通 JSON,详见 §5)

### 文件二进制格式

```
┌──────────┬───────────┬──────────┬──────────┬─────────────────┐
│ magic(4) │ version(1)│ salt(16) │  iv(12)  │ ciphertext+tag  │
│  "SSHM"  │   0x01    │  random  │  random  │   (变长)         │
└──────────┴───────────┴──────────┴──────────┴─────────────────┘
```

- `magic + version`:格式识别与未来升级
- `salt`(16 字节):每 vault 独立,scrypt KDF 用
- `iv`(12 字节):AES-GCM 标准 nonce,**每次 `save()` 重新随机生成**
- `ciphertext + tag`:AES-256-GCM 输出;GCM auth tag 16 字节附在末尾(Node `crypto` 默认行为)

### 密钥派生

```
key = scrypt(masterPassword, salt, 32, { N: 2^15, r: 8, p: 1 })
```

`N = 32768` 在桌面机上约 100ms,够慢挡暴力,不影响交互体验。

### 明文 JSON Schema(解密后)

```json
{
  "schemaVersion": 1,
  "hosts": [
    {
      "id": "h_xxxxxxxx",
      "alias": "prod-web-1",
      "host": "10.0.0.5",
      "port": 22,
      "user": "deploy",
      "password": "...",
      "note": "生产 Web 节点",
      "createdAt": "2026-06-06T...",
      "updatedAt": "2026-06-06T..."
    }
  ]
}
```

### 设计决策

1. **密码以明文写在 JSON 字段中** —— 整个文件已用主密码加密,不再二次加密,避免假安全感。
2. **主密码不落盘**;派生出的 32B 密钥仅在解锁会话内驻留,程序退出即清零。
3. **写入采用 write-then-rename 原子替换**:先写 `vault.enc.tmp` → `fsync` → `rename`,防止崩溃损坏。
4. **解锁失败判定**走 GCM auth tag 自然校验;tag 不通过即"主密码错误"。

### 错误处理

| 情况 | 行为 |
|---|---|
| 文件不存在 | 引导用户"创建新保险库 + 设置主密码"(InitScreen) |
| magic / version 不匹配 | 拒绝并提示文件可能损坏 |
| auth tag 校验失败 | 提示"主密码错误",允许无限次重试(单机本地工具,不做锁定) |

---

## 4. 主机模型与 HostRepo

### Host 字段定义

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `id` | string | 是 | nanoid 生成,不可变 |
| `alias` | string | 是 | 1–64 字符;在 vault 内唯一 |
| `host` | string | 是 | 1–255 字符,不为空 |
| `port` | number | 是 | 1–65535,默认 22 |
| `user` | string | 是 | 1–64 字符 |
| `password` | string | 是 | 任意非空字符串 |
| `note` | string | 否 | ≤ 500 字符 |
| `createdAt` | ISO8601 | 是 | 由 repo 自动赋值 |
| `updatedAt` | ISO8601 | 是 | 由 repo 自动更新 |

字段校验用 `zod` 在 `HostRepo` 入口完成,UI 仅做提示。

### HostRepo API

```ts
list(): Host[]
get(id: string): Host | undefined
add(input: Omit<Host, 'id'|'createdAt'|'updatedAt'>): Host
update(id: string, patch: Partial<Host>): Host
remove(id: string): void
```

`add` / `update` / `remove` 内部调用 `vault.save()`;调用方无需关心持久化。

---

## 5. SSH 连接器(SshClient)

### 接口

```ts
SshClient.connect(host: Host): Promise<number>  // resolve 退出码
```

### 实现流程(基于 `ssh2`)

```
1. new ssh2.Client()
2. client.connect({ host, port, username, password, readyTimeout: 15000,
                    hostVerifier: <见下> })
3. on('ready') → client.shell({ term: process.env.TERM ?? 'xterm-256color',
                                rows, cols })
4. 拿到 stream(双向):
     process.stdin  ─pipe→ stream
     stream         ─pipe→ process.stdout
     stream.stderr  ─pipe→ process.stderr
5. process.stdin.setRawMode(true)
6. 监听 process.stdout 'resize' → stream.setWindow(rows, cols, ...)
7. stream 'close' → 还原 raw mode、resolve(exitCode)
```

### 关键细节

| 问题 | 处理 |
|---|---|
| TUI 与远端 shell 共用 stdin/stdout | 进入连接前由 CLI 入口 `app.unmount()` 释放终端;断开后判断是否重新挂载 TUI |
| Raw mode | 必须开启,否则 Ctrl-C 等键被 Node 拦截而非传给远端 |
| 窗口大小变化 | 监听 `process.stdout` 的 `resize` 事件,经 `stream.setWindow` 通知服务端,避免 vim/htop 错乱 |
| 主机指纹校验 | 首次连接弹"是否信任此指纹 Y/N"确认,接受后写入 `~/.sshm/known_hosts.json`;后续连接自动比对 |
| 错误分类 | 网络不通 / 认证失败 / 主机密钥不信任 / 超时,分别给中文提示 |
| 密码内存生命周期 | 用完立刻把局部变量置 `null`;不写日志、不进 error message |

### 界面交接流程

```
Ink 主界面
   │ 用户按 Enter
   ▼
app.unmount()  ← TUI 把终端还给 OS
   ▼
SshClient.connect(host)  ← 占满整个终端,体验等同于直接 ssh
   ▼
用户 Ctrl-D / exit
   ▼
打印 "[已断开 prod-web-1, 退出码 0,按任意键返回列表]"
   ▼
按键 → 重新挂载 Ink 主界面
```

### 简化(原型范围)

- 不支持 ProxyJump / Bastion
- 不支持端口转发、SFTP
- 不复用 `~/.ssh/config`(自带配置库,避免双源)
- 不集成 ssh-agent(MVP 仅密码认证)

---

## 6. TUI 交互(Ink)

### 屏幕状态机

```
   启动
     │
     ▼
  ┌─────────────┐  vault 不存在
  │ 检查 vault   │──────────────► InitScreen (设置主密码 ×2)
  └──────┬──────┘
         │ vault 存在
         ▼
  ┌─────────────┐  Ctrl-C
  │ UnlockScreen │────────────► 退出
  │ (输入主密码) │
  └──────┬──────┘
         │ 解锁成功
         ▼
  ┌─────────────────────┐       Enter      ┌──────────────┐
  │     ListScreen      │─────────────────►│  SSH 会话     │
  │ (主界面,主机列表)   │◄─────────────────│  (脱离 TUI)   │
  └──┬───────┬──────────┘   断开后按键返回   └──────────────┘
     │ a     │ e/d
     ▼       ▼
  ┌────────────────┐
  │  HostFormScreen │  添加 / 编辑
  └────────────────┘
```

### 主界面布局(ListScreen)

```
┌─ sshm v0.1 ─────────────────────── 12 hosts ──┐
│                                                │
│  > prod-web-1     deploy@10.0.0.5:22           │
│    prod-web-2     deploy@10.0.0.6:22           │
│    staging-db     root@10.1.2.3:2222           │
│    dev-mac        ray@192.168.1.20             │
│                                                │
├────────────────────────────────────────────────┤
│ ↑↓ 选择   Enter 连接   a 添加   e 编辑          │
│ d 删除                          q 退出          │
└────────────────────────────────────────────────┘
```

### 键位

| 键 | 动作 |
|---|---|
| `↑` `↓` / `j` `k` | 移动光标 |
| `Enter` | 连接选中主机 |
| `a` | 添加新主机 → HostFormScreen |
| `e` | 编辑选中主机 → HostFormScreen |
| `d` | 删除(弹确认 Modal,默认焦点在"取消") |
| `q` / `Ctrl-C` | 退出程序 |

### HostFormScreen(添加 / 编辑)

- 字段顺序:`alias → host → port → user → password → note`
- `Tab` / `↓` 下一个字段,`Shift-Tab` / `↑` 上一个
- 密码字段输入时显示为 `••••`
- 最后一字段 `Enter` 或任意位置 `Ctrl-S` 保存
- `Esc` 取消返回列表
- 校验:alias 非空且 vault 内唯一;host 非空;port 默认 22 并限 1–65535

### Ink 组件树

```
<App>
  ├─ <UnlockScreen>           (vault 未解锁时)
  ├─ <InitScreen>             (首次启动时)
  └─ <Main>                   (解锁后)
       ├─ <ListScreen>
       │    ├─ <HostList>     (受控的 SelectInput)
       │    └─ <Footer>       (键位提示)
       ├─ <HostFormScreen>
       └─ <ConfirmModal>      (删除确认)
```

顶层 `useReducer` 管理屏幕路由与当前选中 host id;`VaultContext` / `RepoContext` 注入服务,UI 组件不直接 import `Vault`/`HostRepo`,便于测试替换。

### 错误与状态反馈

- 解锁失败 → UnlockScreen 输入框下方红色一行 "主密码错误,请重试"
- 保存失败(磁盘写入) → 表单底部红色错误,不返回列表
- 删除前必须确认 → 二次确认 Modal,默认焦点在"取消"

---

## 7. 项目结构、依赖与构建

### 仓库布局

```
ssh-manager/
├── package.json
├── tsconfig.json
├── README.md
├── bin/
│   └── sshm.js                     # #!/usr/bin/env node,加载 dist
├── src/
│   ├── index.tsx                   # CLI 入口:启动 Ink
│   ├── crypto/
│   │   ├── kdf.ts                  # scrypt 派生
│   │   └── aead.ts                 # AES-256-GCM encrypt/decrypt
│   ├── vault/
│   │   ├── format.ts               # 文件头编解码、原子写
│   │   └── vault.ts                # Vault 类:unlock / save / lock
│   ├── hosts/
│   │   ├── types.ts                # Host 接口、zod schema
│   │   └── repo.ts                 # HostRepo:list/get/add/update/remove
│   ├── ssh/
│   │   ├── client.ts               # SshClient.connect()
│   │   └── knownHosts.ts           # 指纹存取
│   ├── ui/
│   │   ├── App.tsx
│   │   ├── context.tsx             # VaultContext, RepoContext
│   │   ├── screens/
│   │   │   ├── InitScreen.tsx
│   │   │   ├── UnlockScreen.tsx
│   │   │   ├── ListScreen.tsx
│   │   │   └── HostFormScreen.tsx
│   │   └── components/
│   │       ├── HostList.tsx
│   │       ├── Footer.tsx
│   │       └── ConfirmModal.tsx
│   └── paths.ts                    # ~/.sshm 路径常量,集中以便测试覆盖
├── tests/
│   ├── crypto.test.ts
│   ├── vault.test.ts
│   ├── repo.test.ts
│   └── ssh-client.test.ts          # 走内嵌 ssh2.Server
└── docs/
    └── superpowers/specs/
        └── 2026-06-06-ssh-manager-design.md
```

### 运行时依赖

| 包 | 用途 |
|---|---|
| `ink` (v5) | TUI 渲染(React 18) |
| `react` | Ink 配套 |
| `ink-text-input` | 表单 / 密码输入框 |
| `ink-select-input` | 列表选择 |
| `ssh2` | SSH 协议客户端(自带 PTY 支持) |
| `nanoid` | 生成 host id |
| `zod` | Host schema 运行时校验 |

**为什么没有 `node-pty`?** `ssh2` 的 `client.shell({ term, rows, cols })` 已自带 PTY 支持,客户端只需把本地 stdin/stdout 桥过去,无需本地 PTY。去掉 native 依赖,**装包零编译**。

### 开发依赖

`typescript`、`tsx`(开发态运行)、`vitest`、`@types/react`、`@types/ssh2`、`@types/node`、`ink-testing-library`

### 打包与发布

- `tsc` 输出到 `dist/`
- `package.json` 的 `bin` 字段指向 `bin/sshm.js`
- `npm link` 后即可 `sshm` 直接运行
- 原型阶段不发布到 npm

### 测试策略

| 层级 | 工具 | 重点 |
|---|---|---|
| 单元 | vitest | crypto(加解密对称、tag 失败抛错)、vault(往返、坏文件、错误密码)、repo(CRUD + 重名校验) |
| 集成 | vitest + 临时目录 | 用 `os.tmpdir()` 隔离 vault,跑"创建 → 加主机 → 重新打开 → 列出"全链路 |
| SSH 客户端 | vitest + 内嵌 `ssh2.Server` | 断言能连接、能收发数据、能 resize、能传退出码 |
| UI | `ink-testing-library` | 渲染各 Screen,断言关键文本与按键反应,注入 mock Repo/Vault |

**不测的:** 真实远端 SSH;Ink 的视觉像素级输出。

---

## 8. 手动验收清单(原型完成判据)

1. 首次启动 → 设置主密码 → 列表为空
2. 添加一个真实主机(可以是 `localhost` 自连)→ 列表出现
3. 退出程序 → 重新启动 → 输入主密码 → 列表仍在
4. 输错主密码 → 红字提示,不崩溃
5. Enter → 成功 ssh 进入远端 shell → 能跑 `vim`、能 resize → `exit` 返回列表
6. 编辑主机改密码 → 保存 → 重连仍可用
7. 删除主机 → 二次确认 → 列表消失
8. 文件权限:`~/.sshm` 是 `0700`,`vault.enc` 是 `0600`

---

## 9. 已记录的简化与后续工作(非 MVP)

- 私钥 / passphrase / ssh-agent 认证
- ProxyJump / Bastion
- 搜索、标签、分组
- 导入 `~/.ssh/config`、加密备份导入导出
- 端口转发、SFTP
- 连接历史与统计
- 多人 / 团队共享
