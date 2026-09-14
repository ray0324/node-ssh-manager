# Auth header and password band

Replace the bordered auth title panel with a Pi-style open header, and a full-width password band that has only top and bottom rules.

This supersedes `docs/superpowers/specs/2026-09-14-auth-banner-panel-design.md`.

## Header (`AuthBanner`)

Shared on Init and Unlock. No border, no ASCII art, not centered.

Line 1:

- `sshm` — bold, `green`
- two spaces, then `v` + version from `package.json` — `gray`

Line 2:

- `本地加密 SSH 主机管理器` — default/white
- ` · 凭据保存在本机，主密码无法找回` — `gray`

Do not show extra headings: no `欢迎使用 sshm · 设置主密码`, no standalone `解锁`.

## Password band

Shared chrome for the focused password input:

- Ink `Box` with `borderStyle="single"`
- `borderTop` and `borderBottom` only (`borderLeft={false}`, `borderRight={false}`)
- `width="100%"` — full terminal width, not a shrink-wrapped rounded box
- `paddingX={1}`
- Label + masked `TextInput` on one row

Init:

- First stage label: `主密码:`
- After a valid first password, the same band switches to `再次输入:` (do not keep both fields on screen)

Unlock:

- Label stays `主密码:`

Errors stay red below the band. Busy text stays yellow below the band.

The auth screen root must not pad the password band, or the rules will not span the screen. Pad the header and error/busy lines instead.

## Version

Read `version` from `package.json` at runtime via `src/version.ts` (`createRequire`). Do not hard-code the version string in the banner component.

## Out of scope

- Screen-clear timing
- Vault / master-password crypto
- List-screen header
- Change-master-password screen
- Shortcut / footer chrome
