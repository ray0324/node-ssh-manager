# sshm 认证 Banner 与清屏设计

## 目标

给主密码界面加上统一的 ASCII banner。解锁或初始化成功后清屏，再全屏绘制主机列表。开始连接后先清屏，再展示未知主机确认或远程会话输出。

## 非目标

- 不从远程会话断开返回列表时清屏。
- 不清空终端滚动历史。
- 不改变 vault 格式、主机数据、主密码流程或 SSH 协议。
- 不新增第三方依赖。
- 不新增命令行子命令。

## Banner

初始化与解锁共用 `AuthBanner`，放在表单上方。图形与标语必须在 80 列内完整可见：

```
  ____  ____  _   _ __  __
 / ___|| ___|| | | |  \/  |
 \___ \|___ \| |_| | |\/| |
  ___) |___) |  _  | |  | |
 |____/|____/|_| |_|_|  |_|
  本地加密 SSH 主机管理器
```

- 初始化：banner 下方保留现有不可找回说明，标题仍为设置主密码。
- 解锁：banner 下方标题为「解锁」。
- 列表顶栏保持 `sshm · SSH 主机管理器`，不使用该 ASCII 图。

## 清屏

新增 `clearTerminal(stream)`：向 stdout 写入 `ESC[2J` 与 `ESC[H`，擦除当前显示区并把光标移到左上角。不发送 `ESC[3J`。

调用时机：

1. 初始化或解锁成功，Ink unmount 完成之后、绘制主机列表之前。
2. 用户选中主机，列表 Ink unmount 完成之后、未知主机确认之前。
3. 即将把远程会话输出写入终端之前，再清一次。

不清屏的情况：

- 主密码错误或初始化失败，仍留在认证界面。
- 用户取消认证。
- 远程会话断开后按任意键返回列表。
- 连接失败后的错误行与「按任意键返回」提示。

未知主机确认在第二次清屏之前进行，因此确认文案出现在干净屏幕上；确认结束后再清一次，避免确认文字混进远程输出。

## 组件与调用链

- `AuthBanner`：只渲染 ASCII 与标语。
- `InitScreen` / `UnlockScreen`：顶部使用 `AuthBanner`，其余校验与忙碌状态不变。
- `clearTerminal`：纯函数，写入指定可写流。
- `src/index.tsx`：在认证成功后、连接前、远程输出前调用 `clearTerminal(process.stdout)`。

`App`、`ListScreen`、`Vault`、`SshClient` 的协议与回调形状保持不变。`SshClient.connect` 仍先做指纹预检，再建立交互会话；清屏发生在调用方，不进入 SSH 客户端内部。

## 数据流

```
Init/Unlock 成功 → unmount → clearTerminal → runMain / 列表
列表 Enter → unmount → clearTerminal → 可选未知主机确认 → clearTerminal → SSH 输出
SSH 断开 → 断开提示 → 任意键 → 列表（不清屏）
```

## 测试

- `AuthBanner` 或认证屏幕包含完整 ASCII 行与「本地加密 SSH 主机管理器」。
- `clearTerminal` 向测试流写入 `ESC[2J` 与 `ESC[H`，且不含 `ESC[3J`。
- 现有初始化、解锁、列表与 SSH 客户端测试继续通过。
- 验收运行完整 Vitest 与 TypeScript 构建。
