# Auth banner panel

Superseded by `docs/superpowers/specs/2026-09-14-auth-header-design.md`.

Replace the ASCII art startup mark with a compact Ink panel on Init and Unlock.

## Layout

- Shared `AuthBanner` above the form on both screens
- Ink `Box` with `borderStyle="round"`, `paddingX={3}`, `paddingY={1}`, `minWidth={48}`
- Width is larger than the subtitle; still not full terminal width
- Title: `SSHM` — bold uppercase, `green`, centered
- Subtitle: `本地加密 SSH 主机管理器` — `white`

## Out of scope

- Screen-clear timing
- Vault / master-password flows
- List-screen header
