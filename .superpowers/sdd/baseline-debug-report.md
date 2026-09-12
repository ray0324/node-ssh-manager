# Baseline SSH Test Failure Debug Report

## Status

Root cause confirmed and minimally fixed with a regression test.

## Investigation evidence

### Reproduction

The requested worktree is `/Users/ray/Lab/ssh-manager/.worktrees/cli-interaction-polish` on branch `feat/cli-interaction-polish`.

Running the worktree's focused suite with the already-installed Vitest 1.6.1 binary reproduced the baseline:

```text
/Users/ray/Lab/ssh-manager/node_modules/.bin/vitest run tests/ssh-client.test.ts
Exit: 1
Tests: 3 passed
Unhandled errors: 2
Error: Bad packet length
Stack: AESGCMDecipherNative.decrypt -> Protocol.parsePacket -> Protocol.parse
       -> ssh2/lib/server.js socket data handler
Latest associated tests:
- rejects wrong password
- refuses untrusted host when onUnknownHost returns false
```

The failure was timing-dependent. Ten isolated runs per existing test produced:

```text
connects with password: 1/10 failed
rejects wrong password: 2/10 failed
refuses untrusted host: 6/10 failed
```

This comparison showed that the failure was not specific to password rejection or trust rejection: all three tests execute the same unknown-host pre-flight probe. The shortest test after probing failed most often.

### Complete test and implementation inspection

`tests/ssh-client.test.ts` starts a real in-process `ssh2.Server`. Each test uses a fresh `KnownHosts`, so every call to `SshClient.connect()` first invokes `fetchHostKey()`. Server-side connection objects had no `error` listener, which is why protocol errors became uncaught Vitest errors instead of assertion failures.

`src/ssh/client.ts` performed this probe sequence:

1. `hostVerifier` receives the host key during key exchange.
2. It resolves `fetchHostKey()`.
3. It calls `cb(true)` to continue key exchange.
4. It schedules `probe.end()` with `setImmediate()`.

The caller can therefore finish trust handling while the probe is still closing. In the rejection test, `connect()` rejects immediately after `fetchHostKey()` resolves, making teardown overlap the end of the test.

The `ssh2` implementation and documentation establish the relevant boundary:

- `hostVerifier` decides whether to **continue with the handshake**; it is not a handshake-complete callback.
- `ssh2/lib/client.js` emits `handshake` from `onHandshakeComplete`, then starts user authentication.
- `probe.end()` sends an SSH disconnect packet.
- The observed stack is in `ssh2/lib/server.js` while parsing that packet with the negotiated AES-GCM decipher.

### Working/failing pattern

The normal interactive connection remains alive through completed key exchange, authentication, shell setup, shell close, and then `client.end()`. The pre-flight probe instead ended on the next event-loop turn from inside host verification, before the documented handshake-complete event. That teardown timing is the material difference.

## Evidence-backed hypothesis and minimal test

**Hypothesis:** `setImmediate(() => probe.end())` races completion of SSH key exchange. It can send the disconnect while peers are transitioning cipher state, causing the server to parse the packet with the wrong AES-GCM state and throw `Bad packet length`.

As a throwaway hypothesis test, probe teardown was changed only from `setImmediate` to the client's documented `handshake` event. Thirty consecutive focused-suite runs then produced:

```text
hypothesis test failures: 0/30
```

The exploratory change was reverted before beginning the TDD cycle.

## RED evidence

The regression test makes server-side connection errors observable, runs ten real rejected host-key probes, waits for the server to close all connections, and asserts that no server protocol errors occurred.

Command:

```text
/Users/ray/Lab/ssh-manager/node_modules/.bin/vitest run tests/ssh-client.test.ts -t "tears down host-key probes"
```

Exact outcome:

```text
Exit: 1
Test Files: 1 failed
Tests: 1 failed, 3 skipped
Expected: []
Received: seven "Bad packet length" errors
Failure: tests/ssh-client.test.ts:213
```

This is the expected failure mode and proves the regression test detects the baseline defect.

## Minimal fix

`fetchHostKey()` now registers a one-shot `handshake` listener before accepting the host key and ends the probe from that listener. This delays only probe teardown until `ssh2` reports key exchange complete. Host-key capture, trust prompting, authentication, and interactive-session behavior are unchanged.

## GREEN and verification evidence

Focused SSH suite:

```text
/Users/ray/Lab/ssh-manager/node_modules/.bin/vitest run tests/ssh-client.test.ts
Exit: 0
Test Files: 1 passed
Tests: 4 passed
Unhandled errors: 0
```

Post-fix stress run:

```text
20 consecutive focused SSH suite runs
Exit: 0
post-fix SSH failures: 0/20
```

Full suite:

```text
/Users/ray/Lab/ssh-manager/node_modules/.bin/vitest run
Exit: 0
Test Files: 5 passed
Tests: 28 passed
Unhandled errors: 0
```

Type check:

```text
/Users/ray/Lab/ssh-manager/node_modules/.bin/tsc -p . --noEmit
Exit: 0
Output: none
```

IDE diagnostics reported no linter errors in the two changed TypeScript files. `git diff --check` exited 0.

## Files changed

- `src/ssh/client.ts`
  - End the host-key probe only after the one-shot `handshake` event.
- `tests/ssh-client.test.ts`
  - Capture real server connection errors.
  - Add a ten-probe regression test that fails on packet corruption.
- `.superpowers/sdd/baseline-debug-report.md`
  - Record investigation, TDD evidence, verification, and review.

## Self-review

- The production change is one event-boundary substitution with no unrelated refactor.
- The listener is registered before `cb(true)`, so a synchronously completed handshake cannot be missed.
- `once` prevents teardown from firing again on a future rekey.
- Existing post-key-capture probe errors remain intentionally ignored by the existing `got` guard.
- The regression uses real `ssh2` client/server traffic and asserts the externally visible server protocol outcome rather than mocking implementation calls.
- Waiting for `server.close()` ensures all probe connections finish before checking captured errors.
- The test loop is intentionally limited to ten because the original race was intermittent; RED produced seven failures in one run while GREEN remains fast.

## Concerns

The worktree has no local `node_modules`. Invoking the literal `pnpm test` caused pnpm to attempt dependency downloads from `registry.npmmirror.com`, which were unavailable in the sandbox, so that invocation was stopped. Verification used the parent checkout's lockfile-compatible installed Vitest 1.6.1 and TypeScript binaries while keeping the process working directory at the requested worktree. The direct full-suite command executed the same Vitest configuration and all worktree tests successfully, but the literal package-script invocation was not completed.
