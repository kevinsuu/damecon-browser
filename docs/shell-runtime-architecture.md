# Shell Runtime Architecture

The Electron main process keeps high-frequency browser work separate from persistent storage and
optional feature workloads. This document records the boundaries that should remain intact when
upstream shell changes are merged.

## Runtime configuration

`browser/config/runtime-config.js` wraps `configstore` with an in-memory snapshot. Reads from
network interception, cookie, window, and proxy code must use this runtime store instead of reading
the JSON file directly. Normal settings writes still use `configstore`'s atomic persistence before
the in-memory value is updated.

Window resize events are a special high-frequency path. The latest non-maximized window size is
kept in memory, width and height are persisted in one batch after resize activity settles, and a
pending size is flushed when the window closes. Do not reintroduce per-event or per-dimension
`configstore.set()` calls.

## Tab-owned WebContents

Every tab owns one content `BrowserView` for its lifetime. The find-in-page `BrowserView` is
optional and is created only when the user first opens find-in-page for that tab. Both views are
destroyed exactly once by `Tab.destroy()`.

Tab collection changes must go through `Tabs.remove()`. In particular, removing KC3 extension tabs
during an extension reload must remove the tab objects from `tabList`; destroying their views while
leaving the objects in the collection creates stale tab state.

Extension messages from a tab's `BrowserView` must resolve their owner through the extension
store's tab-to-window mapping before using Electron's `BrowserWindow.fromWebContents()`. Electron
does not return a `BrowserWindow` for a `BrowserView`; without the mapping, KC3 calls such as
`chrome.tabs.create()` fail even while their tab is open. Background-page resolution keeps the
upstream focused-window fallback. The successful BrowserView resolution diagnostic is emitted once
per `WebContents`, avoiding repeated logs on high-frequency extension API calls.

## KCCacheProxy boundaries

The shell exposes three KCCacheProxy-facing boundaries:

- `browser/kccacheproxy-api.js` is the main-process module that imports upstream runtime internals. It is the
  browser-facing facade for the full embedded proxy runtime, cache tools, image tools, and
  interactive Git mod operations.
- `browser/kccacheproxy-worker-api.js` is the updater-worker boundary and contains only the Git mod
  update workflow needed by the shell. It uses the shell's existing `isomorphic-git` dependency and
  does not import the KCCacheProxy submodule.

- `browser/kccacheproxy-tools-api.js` exposes only the image codec used by maintenance workers.

Updater worker code must use the updater worker boundary. Importing the browser facade from a worker bundles the
MITM proxy, Jimp, cache archive tools, and other main-process-only modules into that worker. The
boundary test fails when any other shell module reaches into `packages/kccacheproxy/src`. Keeping
the worker implementation shell-owned also allows the parent repository to build from a clean,
unchanged KCCacheProxy submodule revision.

Cache verification and proxy work still execute through the main facade. Image processing and ZIP
decompression use the maintenance worker described below. A future utility-process migration should preserve these public facades and replace their
implementation with request/response messaging incrementally.

## Recommendation core prerequisite

The shell consumes compiled output from `@kancolle-assistant/recommendation-core`. Direct shell
`start`, `start:trace`, `package`, and `make` commands build that workspace before Electron Forge
runs. `start:skip-build` intentionally bypasses all workspace builds and is suitable only when the
existing artifacts are already current.

## Extension runtime listener ownership

The extension router installs one process-level `web-contents-created` observer and dispatches new
background pages to the router registered for their session. Each extension host also receives at
most one destruction observer per router, regardless of how many Chrome events it subscribes to.
This prevents listener-limit warnings while preserving host cleanup.

On POSIX test hosts, the native-messaging fixture is an executable Node script. Windows retains the
Node single-executable application build. The POSIX path avoids depending on a particular Node
distribution exposing the SEA injection sentinel, which is not guaranteed by every Node 22 binary.

## Validation

Run the shell characterization and boundary tests after changing these areas:

```sh
yarn test:shell
```

Run a packaged shell build when changing worker or preload imports because the test bundle does not
exercise Electron Forge's worker-loader output.

## Isolated operation queues and shutdown

Fleet, expedition, and resource-ledger calculations have separate lazy worker lanes. Each lane runs
one request at a time and accepts at most 16 waiting requests. Queue waiting and execution each have
a separate 30-second deadline. An execution timeout or crash rejects the active request only; queued
work proceeds on a replacement worker and other lanes continue. Idle workers are reclaimed after
60 seconds. Worker diagnostics include operation, request ID, queue depth, waiting/execution time,
reason code and affected request count. Shutdown rejects pending work and awaits worker termination.

`kccp-runtime.js` owns proxy state per service instance; `services/proxy-lifecycle.js` owns serialized
start/stop operations and one restart timer. Disposal cancels initialization and stops future retries.
Proxy startup and closure have bounded waits. `services/proxy-settings.js` applies session proxy
settings and preserves the PAC/system/external branches. The main process awaits service cleanup at `will-quit`, after windows have accepted closure.
Cancelling a close confirmation therefore leaves services available. Reading proxy configuration no longer performs remote mod update
checks; those checks run separately at startup and at most every three hours with a ten-second deadline.
Concurrent checks share one operation; shutdown cancels it and stale results cannot overwrite changed settings.

## Maintenance work

`maintenance.worker.js` performs spritesheet extraction, outline generation and ZIP metadata/entry
decompression. `kccacheproxy-tools-api.js` is a dedicated codec boundary importing only upstream Jimp;
it does not import the proxy, configuration or cacher runtime. Images finish writing before a worker
reports success, and invalid metadata is reported as an error. ZIP entry buffers transfer back to the
main process, which retains ownership of cache metadata and asynchronous file writes. Cache imports
are serialized and preserve newer local entries; decoding failure is reported with counts and a stable
reason code. Maintenance has a separate worker lane with a two-minute execution deadline and the same
bounded waiting queue/idle cleanup policy. Large in-flight buffers still consume memory; background
execution primarily improves main-event-loop responsiveness, not total processing time.

The embedded network proxy, cache verification, mod conversion and prepatching still use the main
facade. Moving the full proxy or its shared mutable cache state to another process requires separate
streaming/concurrency measurements. Do not assume all KCCacheProxy work has moved to workers.

## Application services and renderer contracts

`recommendation-calculation.js` coordinates solving, exact KC3 verification and result presentation.
`snapshot-cache.js` owns snapshot generations, in-flight request sharing and bounded result caching.
The IPC layer verifies sender identity and request data before calling these services. Pure quest
ranking and synergy rules live in `recommendation-core/src/quests`; shell modules retain compatibility
exports. The core remains independent of Electron and KC3 globals.

WebUI preload exposes `sendWebUiCommand`, `onWebUiMessage`, `onLogUpdate` and `onRecentLogs`.
`webui-contract.js` restricts command names and validates payloads at both sides of IPC. Subscriptions
receive business data only, return an unsubscribe function and are removed on pagehide. There is no
arbitrary-channel send/on API. Source-origin checks remain enforced in the main process.

The Windows CI definition now includes shell tests. Local runtime validation can use
`script/smoke-packaged-runtime.js` against the packaged ASAR and matching Electron runtime; set
`KANCOLLE_SMOKE_ASAR` to the archive path and unset `ELECTRON_RUN_AS_NODE`. The smoke test uses a hidden
window and isolated userData. `script/benchmark-maintenance.js` creates synthetic image/ZIP fixtures,
compares output hashes and measures event-loop latency/RSS without reading account data.
