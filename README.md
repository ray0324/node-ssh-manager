# node-ssh-manager

单用户本地 TUI SSH 连接管理器。安装后使用命令 `sshm`，主机条目存放在加密 vault 中。

## 安装

需要 [Node.js](https://nodejs.org/) 18+。

```
npm install -g node-ssh-manager
```

也可直接运行，不全局安装：

```
npx --package node-ssh-manager sshm
```

## 使用

```
sshm
```

首次运行会引导设置主密码并创建空 vault。

## 当前限制

- 仅支持密码认证（不支持 SSH key / agent / ProxyJump）
- 单用户、单机本地使用（无多端同步、无团队共享）
- 无导入/导出，无 SSH config 解析

## 主界面快捷键

- `↑` / `↓` 或 `k` / `j`：上下移动
- `Enter`：连接选中主机
- `a`：新增主机
- `e`：编辑选中主机
- `d`：删除选中主机
- `p`：查看选中主机的密码
- `q`：退出

新增或编辑主机时，使用 `Tab` / `Shift+Tab` 切换字段、`Ctrl+S` 保存、
`Ctrl+R` 显示或隐藏密码、`Esc` 取消。

## 文件位置

- `~/.sshm/vault.enc` — 加密的主机数据
- `~/.sshm/known_hosts.json` — 已信任的主机指纹

## 加密说明

Vault 使用 AES-256-GCM 加密，密钥由主密码经 scrypt KDF 派生。**忘记主密码 = 永久丢失所有数据**，没有任何恢复机制，请妥善保管。

## 从源码开发

```
pnpm install
pnpm build
node bin/sshm.js
```

开发时也可直接：

```
pnpm dev
```

## License

MIT
