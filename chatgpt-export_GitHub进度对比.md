# GitHub进度对比

> github.com/27652/vm进度

我看到了这个仓库。现在我会按“已经做到哪、计划做到哪、最近一次提交在推进什么”三个维度给你判断进度；仓库目前只有 6 个提交，所以重点要看 `plan.md` 和源码，而不是 GitHub 的 Issues/PR 数量。

目前有一个很明确的信号：项目已经不只是“写计划”了，8 月 27–28 日连续在做 P1/P2 runtime，尤其 8 月 28 日有 `p2 implement`、`fix p2`、`implement p2 version`，随后又回头 `fix p1`、`title p1`。也就是说，当前处于 **Phase 0/P1/P2 的原型验证与修正阶段**，还没进入完整浏览器编译器阶段。

我看了 `github.com/27652/vm` 当前主分支。**现在已经跑过“浏览器内 WASI P1/P2 runtime 原型”，但距离完整的“浏览器里写代码 → 编译 → P2 Component → 运行”的目标还比较早。** 我会把整体完成度粗估在 **20% 左右**；这是按 `plan.md` 的完整目标估算，不是仓库官方百分比。turn820054view2

目前最实质的进展是 **P2 Runtime**。当前 `App.tsx` 已经能选择一个 `.wasm` P2 Component，传入 arguments/environment，运行后获取 `stdout`、`stderr`、exit code，还能显示 component 信息；代码里也已经有 `add(20, 22)` 这种自定义 Component API 调用测试。运行逻辑通过 `component-client`，而 `runtime-p2` 目录已经拆出了 `capture.ts`、`component-client.ts`、`component.worker.ts`，说明 Web Worker 这条路线已经开始成形。turn820054view3turn794972view1

最近两天推进挺快。**8 月 27 日**主要是从 WASIX 切换到 WASI、修 output；**8 月 28 日**连续提交了 `p2 implement`、`fix p2`、`implement p2 version`，之后又做了 `fix p1` 和 `title p1`。其中 `implement p2 version` 一次改了 5 个文件，约 **+875 / -172 行**，是目前比较关键的一次实现。turn146915view2

按 `plan.md` 来对照，大概是这样：

| 阶段 | 我判断的状态 |
|---|---|
| Phase 0：浏览器运行预编译 P2 | **接近完成 / 正在收尾** |
| P1 runtime 验证 | **已有原型** |
| Phase 1：浏览器 C 编译器（clang.wasm + lld.wasm） | **基本还没开始** |
| Phase 2：P1 → P2 浏览器内 Componentize | **尚未看到完整实现** |
| Phase 3：Jco Browser Runtime | **已经提前做了一部分** |
| Browser FS / OPFS | **尚早** |
| WIT Playground | **尚早** |
| Rust / rustc.wasm | **尚未进入** |
| Cargo / dependencies / 完整 Browser IDE | **远期** |

尤其关键的一点：当前 `package.json` 已经有 `jco-transpile`、`preview2-shim`、Wasmer WASI 和 xterm，但**还没有看到 clang/lld、Monaco/CodeMirror 等浏览器编译器/编辑器栈**。因此目前更准确地说，它是一个 **“Browser-side WASI P1/P2 VM runtime PoC”**，还不是计划最终描述的 Browser IDE。turn654214view0

接下来最关键的里程碑应该是：

**C source → `clang.wasm` → `lld.wasm` → WASI P1 `.wasm`**

这一关打通以后，再接：

**P1 `.wasm` → Preview1 Adapter → P2 Component → 当前已经在做的 P2 runtime**

一旦这整条链第一次在浏览器里端到端跑出 `Hello WASI`，项目就会从“runtime PoC”真正进入“浏览器编译 VM”的阶段。`plan.md` 本身也是把这个 edit → compile → run 循环定义为 Phase 1 的退出标准。

url打开 27652/vm 仓库https://github.com/27652/vm

我也可以持续帮你盯这个仓库，有新 commit 后直接告诉你“新增了什么、离下一个 milestone 还有多远”。

genui{"suggest_automation":{"label":"跟踪 vm 仓库开发进度"}}

-----

> 如果要升级p3，给出plan.md的小修正

可以，我会尽量保持“小修正”——不重写路线图，只把现有 P2 相关表述改成能自然演进到 P3 的版本，并标出哪些地方该加“兼容层/迁移层”而不是推倒重来。

可以。这里的 **P3 应明确写成 WASI Preview 3 / WASI 0.3，而不是现有 roadmap 里的 `Phase 3`**，避免两个 “P3” 混在一起。

而且我不建议把路线直接从 `P1 → P2` 全部改成 `P1 → P3`。**最小、风险最低的升级方式是保留 P2 bootstrap，同时把 Runtime 升级成 P2 + P3 双栈。** WASI 0.3 已于 2026-06-11 正式发布，当前是现行 Preview；核心变化是 Component Model 原生支持 `async func`、`stream<T>`、`future<T>`，并用这些机制替代 P2 的 `wasi:io` poll/stream 模型。P3 host 也可以兼容 P2，所以可以渐进迁移。

我建议 `plan.md` **只改下面 5 处**。

### 1. 标题 + Goal

```diff
-# Browser WASI P2 Playground — Implementation Plan
+# Browser WASI P2/P3 Playground — Implementation Plan
```

Goal：

```diff
-3. Produce a WASI Preview 2 / Component Model application.
+3. Produce WASI Preview 2 and Preview 3 / Component Model applications.

-4. Execute the generated component directly in the browser.
+4. Execute P2 and P3 components directly in the browser.
```

P3 已经是 WASI 0.3.x，不再只是未来概念。

---

### 2. 顶层架构不要改成 `P1 → P3`

我建议改成：

```diff
 Source Code
     │
     ▼
 Browser Compiler
     │
     ▼
 Core Wasm / WASI P1
     │
     ▼
 P1 → P2 Adapter
     │
     ▼
 WASI P2 Component
     │
+    ├───────────────┐
+    │               │
+    ▼               ▼
+P2 Runtime      P3-native Component
+                    │
+                    ▼
+               P3 Runtime
+                    │
+                    ▼
+          async / stream / future
     │
     ▼
 Jco
     │
     ▼
-JS Bindings + Core Wasm
+JS Bindings + Core Wasm
     │
     ▼
-Preview2 Shim
+Preview2 / Preview3 Shim
     │
     ▼
 Browser Web APIs
```

这里有个很重要的技术点：

**不要在 plan 里写 `P1 → P2 → P3 Adapter`。**

P1→P2 是明确的 Preview1 Adapter/componentize 流程，但 P2→P3 并不是同等级的“套一个 adapter 就生成 P3 binary”。P3 改的是 Component Model async ABI 和对应 WIT interface。现有 P2 component 更适合通过 **P2 compatibility/polyfill** 跑在 P3-capable host 上；真正需要 P3 特性的组件则 native target P3。

---

### 3. Phase 0 改成 P2/P3 Runtime PoC

这是我认为**最值得现在就改**的一处，因为你目前实际上就在做 runtime。

```diff
-# 3. Phase 0 — Runtime Proof of Concept
+# 3. Phase 0 — P2/P3 Runtime Proof of Concept
```

Objective：

```diff
-Prove that a precompiled WASI P2 component can execute inside the browser.
+Prove that precompiled WASI P2 and P3 components can execute inside
+the browser, while keeping P2 compatibility during the P3 migration.
```

Stack：

```diff
-WASI P2 component
+WASI P2 / P3 component
        │
        ▼
 @bytecodealliance/jco
        │
        ▼
-@bytecodealliance/preview2-shim
+preview2-shim / preview3-shim
        │
        ▼
 Browser
```

Tasks 增加几条就够：

```diff
 * Capture exit code.
 * Run everything inside a Web Worker.
+* Detect P2 vs P3 component requirements.
+* Add a P3 runtime path without removing the P2 path.
+* Test a minimal P3 async WIT export.
+* Test `future<T>`.
+* Test `stream<u8>`.
+* Fall back to the P2 runtime when P3 browser support is unavailable.
```

Exit Criteria：

```diff
-Browser can load and execute a P2 component without server-side runtime support.
+Browser can load P2 and P3 components without server-side runtime support.
+P2 remains functional while P3-native async features are introduced incrementally.
```

这比较符合当前生态，因为 jco 已有 WASI 0.3 支持，但 JS/TS P3 tooling 仍在继续完善；`preview3-shim` 也已经发布，不过浏览器端最好暂时按 experimental capability 处理。

---

### 4. 原来的 Phase 2 不要改，后面插一个很小的 P3 migration section

现有：

> `Phase 2 — Convert WASI P1 to P2`

**建议保留。**

因为你的 C compiler 首先输出 `wasm32-wasip1`，P1→P2 仍然是非常实用的 bootstrap 路线。当前 `plan.md` 这部分架构本身没问题。

在它后面插：

```markdown
## P3 Migration Layer

WASI Preview 3 / WASI 0.3 is an incremental runtime target rather than
a replacement for the P1 → P2 bootstrap pipeline.

Initial strategy:

    P1 compiler output
          │
          ▼
    P1 → P2 adapter
          │
          ▼
      P2 component
          │
          ▼
    P2 compatibility runtime

Native P3 components:

    P3 WIT / toolchain
          │
          ▼
    WASI P3 component
          │
          ▼
       Jco
          │
          ▼
    Preview3 runtime
          │
          ▼
 async func / stream / future

Do not require all compiler toolchains to emit P3 initially.

### Tasks

- [ ] Keep P2 components working unchanged.
- [ ] Add P3 component detection.
- [ ] Add Preview 3 host bindings.
- [ ] Test `async func`.
- [ ] Test `future<T>`.
- [ ] Test `stream<T>`.
- [ ] Test cancellation across component boundaries.
- [ ] Test P2 and P3 components side by side.

### Exit Criteria

The browser runtime can execute both existing P2 components and
P3-native components, and P3 components can use native async Component
Model primitives.
```

这一段基本就把整个升级策略讲清楚了。

---

### 5. `Phase 3 — Jco Browser Runtime` 是需要修改最多、但仍然很小的一处

改名字：

```diff
-# 6. Phase 3 — Jco Browser Runtime
+# 6. Phase 3 — Jco P2/P3 Browser Runtime
```

Runtime Pipeline：

```diff
 component.wasm
       │
       ▼
 jco transpile()
       │
       ├── JS bindings
       └── core wasm
               │
               ▼
-       preview2-shim
+   preview2-shim / preview3-shim
               │
               ▼
            Browser
```

然后 `WASI Interfaces` 这里必须修。

现在是：

```text
wasi:cli
wasi:io
wasi:clocks
wasi:random
```

建议改成：

```markdown
## WASI Interfaces

P2 compatibility:

    wasi:cli
    wasi:io
    wasi:clocks
    wasi:random

P3 native:

    wasi:cli
    wasi:clocks
    wasi:random

    Component Model native async:
    async func
    future<T>
    stream<T>

Later:

    wasi:filesystem
    wasi:http

Potentially limited:

    wasi:sockets
```

因为 **P3 最大的概念变化之一，就是不要再把 `wasi:io` 当核心 async abstraction**。P2 的 `pollable`、input/output stream、poll 等模式，被 Component Model 原生的 future/stream/async function 替代。

Tasks 再加：

```diff
 * Connect Preview2 shim.
+* Connect Preview3 shim.
+* Support async Component Model calls.
+* Map JS Promise ↔ Component Model async calls.
+* Support future<T>.
+* Support stream<T>.
 * Redirect stdout to terminal UI.
 * Redirect stderr to terminal UI.
 * Implement cancellation.
 * Implement execution timeout.
```

这里甚至可以顺手把：

```text
Implement cancellation
```

从普通 runtime feature 提升成 **P3 核心测试项**。因为 P3 的意义不只是“新版 WASI namespace”，而是跨 Component boundary 可组合的 async/concurrency。

---

## Rust 那一行也建议顺手改

现有：

```text
Phase 3
Rust single-file compilation
↓
rustc.wasm
↓
wasm32-wasip2
```

改成：

```text
Phase 3
Rust single-file compilation
↓
rustc.wasm
↓
wasm32-wasip2
↓
wasm32-wasip3 (experimental / nightly first)
```

目前 Rust 的 `wasm32-wasip2` 已经是稳定 Tier 2，而 `wasm32-wasip3` 仍是 Tier 3/nightly，所以**不要让整个项目依赖 wasip3 Rust target 才能前进**。

### 最终路线我会定成

```text
                    ┌──────── P2 compatibility ────────┐
                    │                                   ▼
C → clang → P1 → P2 Component ───────────────────→ P2 Runtime
                    │
                    │
                    │              gradual migration
                    │                     │
                    ▼                     ▼
              Component Model        P3 Runtime
                                           ▲
                                           │
                        native P3 components
                                           │
                     Rust / WIT / future toolchains
```

也就是说，**升级 P3 不应该改变当前最重要的 `C → P1 → P2` 工作线**。

真正应该升级的是：

**`P2-only runtime` → `P2-compatible + P3-native runtime`**

这样当前已经写好的 P1/P2 runtime 基本都不会浪费，而且可以马上单独做一个很小的 P3 PoC：`async func + future + stream`。这和 WASI 官方建议的渐进式 P2→P3 迁移方式也一致。

如果按“小修正”原则，我甚至建议 **不要把 plan.md 全文里的 P2 全局替换成 P3**；上面这几处改完就够了。