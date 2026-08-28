# Browser WASI P2/P3 Playground — Implementation Plan

## 1. Goal

Build a fully client-side web application that can:

1. Edit source code in the browser.
2. Compile source code to WebAssembly entirely in the browser.
3. Produce WASI Preview 2 and Preview 3 / Component Model applications.
4. Execute P2 and P3 components directly in the browser.
5. Capture stdout / stderr / exit status.
6. Avoid sending user source code to a backend server.

Target architecture:

```text
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
    ├──► P2 Runtime ───────────────┐
    │                              │
P3-native Component ─► P3 Runtime ┤
                                   ▼
                                  Jco
                                   │
                                   ▼
JS Bindings + Core Wasm
    │
    ▼
Preview2 / Preview3 Shim
    │
    ▼
Browser Web APIs

P3-native components use:

    async func / stream / future
```

---

# 2. Recommended Route

Do not start with a complete Rust + Cargo environment.

Recommended progression:

```text
Phase 1
C
↓
clang.wasm
↓
WASI P1
↓
P1 → P2 Adapter
↓
Component
↓
jco
↓
Browser

Phase 2
WIT-defined Components
↓
Custom exports/imports
↓
JS ↔ Component interop

Phase 3
Rust single-file compilation
↓
rustc.wasm
↓
wasm32-wasip2
↓
wasm32-wasip3 (experimental / nightly first)

Phase 4
Cargo
↓
Dependencies
↓
Crate Cache
↓
Full Browser IDE
```

---

# 3. Current Status

The repository currently has a browser-side WASI P1/P2 runtime prototype:
components can be selected and executed with arguments and environment
variables, while stdout, stderr, exit status, and component information are
exposed through the UI and Worker-based runtime.

The project is therefore in the Phase 0/P1/P2 prototype stage. The browser C
compiler, in-browser P1 → P2 componentization, filesystem persistence, and
full Browser IDE remain future milestones.

---

# 4. Phase 0 — P2/P3 Runtime Proof of Concept

## Objective

Prove that precompiled WASI P2 and P3 components can execute inside the browser,
while keeping P2 compatibility during the P3 migration.

Do not add compilation yet.

## Stack

```text
WASI P2 / P3 component
        │
        ▼
@bytecodealliance/jco
        │
        ▼
preview2-shim / preview3-shim
        │
        ▼
Browser
```

## Tasks

* [x] Create a minimal WASI P2 component.
* [x] Export one simple WIT function.
* [x] Test `wasi:cli/stdout`.
* [x] Test arguments.
* [x] Test environment variables.
* [x] Capture stdout.
* [x] Capture stderr.
* [x] Capture exit code.
* [x] Run everything inside a Web Worker.
* [ ] Detect P2 vs P3 component requirements.
* [ ] Add a P3 runtime path without removing the P2 path.
* [ ] Test a minimal P3 async WIT export.
* [ ] Test `future<T>`.
* [ ] Test `stream<u8>`.
* [ ] Fall back to the P2 runtime when P3 browser support is unavailable.

## Example

```wit
package playground:demo;

interface api {
    add: func(a: u32, b: u32) -> u32;
}

world app {
    export api;
}
```

Expected browser API:

```js
const result = component.add(1, 2);

console.log(result);
// 3
```

## Exit Criteria

Browser can load P2 and P3 components without server-side runtime support.
P2 remains functional while P3-native async features are introduced incrementally.

---

# 5. Phase 1 — Browser C Compiler

## Objective

Compile C source code entirely inside the browser.

Start with C because the compiler/toolchain is much easier to bootstrap than Rust.

## Architecture

```text
main.c
  │
  ▼
clang.wasm
  │
  ▼
object file
  │
  ▼
lld.wasm
  │
  ▼
app.wasm
```

Target:

```text
wasm32-wasip1
```

## Browser Components

```text
Main Thread
├── Editor
├── UI
└── Build Controls

Compiler Worker
├── clang.wasm
├── lld.wasm
├── sysroot
├── libc
└── Virtual Filesystem
```

## Tasks

* [ ] Integrate Monaco or CodeMirror.
* [ ] Run compiler inside Web Worker.
* [ ] Load `clang.wasm`.
* [ ] Load `lld.wasm`.
* [ ] Provide WASI sysroot.
* [ ] Add in-memory filesystem.
* [ ] Write editor contents to `/workspace/main.c`.
* [ ] Invoke compiler.
* [ ] Invoke linker.
* [ ] Extract generated `app.wasm`.
* [ ] Show diagnostics in editor.
* [ ] Cache compiler assets using IndexedDB / Cache Storage.

## First Test

Source:

```c
#include <stdio.h>

int main() {
    printf("Hello WASI\n");
    return 0;
}
```

Output:

```text
Hello WASI
```

## Exit Criteria

The following loop works:

```text
edit
↓
compile
↓
run
↓
edit
↓
compile
↓
run
```

with no backend compilation service.

---

# 6. Phase 2 — Convert WASI P1 to P2

## Objective

Turn the compiler output into a real WebAssembly Component.

Initial compiler output:

```text
Core Wasm
+
wasi_snapshot_preview1
```

Desired output:

```text
WebAssembly Component
+
WASI Preview 2 (P2 bootstrap)
```

## Pipeline

```text
app.wasm
WASI P1
   │
   ▼
Preview1 Adapter
   │
   ▼
Component Encoder
   │
   ▼
app.component.wasm
WASI P2
```

## Tools

Candidate tooling:

```text
wasm-tools
wit-component
jco component tooling
Preview1 Reactor Adapter
Preview1 Command Adapter
```

The tooling itself should eventually run as Wasm inside the browser.

## Tasks

* [ ] Load Preview1 adapter.
* [ ] Componentize generated P1 module.
* [ ] Produce `.component.wasm`.
* [ ] Validate component.
* [ ] Inspect imports/exports.
* [ ] Execute generated P2 component.
* [ ] Verify stdout behavior is unchanged.

## Exit Criteria

This works completely client-side:

```text
C source
↓
WASI P1 wasm
↓
WASI P2 component
↓
execute
```

---

# 7. P3 Migration Layer

WASI Preview 3 / WASI 0.3 is an incremental runtime target rather than a
replacement for the P1 → P2 bootstrap pipeline.

Initial strategy:

```text
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
```

Native P3 components:

```text
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
```

Do not require all compiler toolchains to emit P3 initially.

## Tasks

* [ ] Keep P2 components working unchanged.
* [ ] Add P3 component detection.
* [ ] Add Preview 3 host bindings.
* [ ] Test `async func`.
* [ ] Test `future<T>`.
* [ ] Test `stream<T>`.
* [ ] Test cancellation across component boundaries.
* [ ] Test P2 and P3 components side by side.

## Exit Criteria

The browser runtime can execute both existing P2 components and P3-native
components, and P3 components can use native async Component Model primitives.

---

# 8. Phase 3 — Jco P2/P3 Browser Runtime

## Objective

Execute newly generated components without reloading the page.

## Runtime Pipeline

```text
component.wasm
      │
      ▼
jco transpile()
      │
      ├── JS bindings
      └── core wasm
              │
              ▼
   preview2-shim / preview3-shim
              │
              ▼
           Browser
```

## WASI Interfaces

P2 compatibility:

```text
wasi:cli
wasi:io
wasi:clocks
wasi:random
```

P3 native:

```text
wasi:cli
wasi:clocks
wasi:random

Component Model native async:
async func
future<T>
stream<T>
```

Later:

```text
wasi:filesystem
wasi:http
```

Potentially limited:

```text
wasi:sockets
```

because arbitrary TCP sockets are unavailable to normal browser JavaScript.

## Tasks

* [ ] Run Jco in Worker.
* [ ] Feed component bytes directly to Jco.
* [ ] Generate JS bindings dynamically.
* [ ] Instantiate generated core Wasm.
* [ ] Connect Preview2 shim.
* [ ] Connect Preview3 shim.
* [ ] Support async Component Model calls.
* [ ] Map JS Promise ↔ Component Model async calls.
* [ ] Support `future<T>`.
* [ ] Support `stream<T>`.
* [ ] Redirect stdout to terminal UI.
* [ ] Redirect stderr to terminal UI.
* [ ] Implement cancellation.
* [ ] Implement execution timeout.

## Exit Criteria

User clicks:

```text
Compile & Run
```

and receives output without page reload or server call.

---

# 9. Phase 4 — Browser Filesystem

## Objective

Provide a useful WASI filesystem.

Abstract interface:

```text
wasi:filesystem
       │
       ▼
Browser FS Adapter
```

Possible implementations:

```text
Memory FS
IndexedDB
OPFS
File System Access API
```

Recommended hierarchy:

```text
/
├── workspace/
│   ├── main.c
│   └── ...
│
├── tmp/
│
├── sdk/
│   ├── include/
│   └── lib/
│
└── cache/
```

## Strategy

Start with:

```text
Memory FS
```

then add:

```text
OPFS
```

for persistent projects.

## Tasks

* [ ] Implement `/workspace`.
* [ ] Implement `/tmp`.
* [ ] Mount compiler sysroot read-only.
* [ ] Persist workspace to OPFS.
* [ ] Add import/export project.
* [ ] Add file size limits.
* [ ] Prevent filesystem escape.

---

# 10. Phase 5 — WIT Playground

## Objective

Make Component Model features first-class instead of treating P2/P3 only as a
CLI runtime.

UI:

```text
┌──────────────┬──────────────┐
│ Source       │ WIT          │
│              │              │
│ main.c       │ world.wit    │
│              │              │
├──────────────┴──────────────┤
│ Generated Interface         │
├─────────────────────────────┤
│ JS Consumer                 │
├─────────────────────────────┤
│ Output                      │
└─────────────────────────────┘
```

Example WIT:

```wit
package demo:image;

interface processor {
    resize: func(
        data: list<u8>,
        width: u32,
        height: u32
    ) -> list<u8>;
}

world plugin {
    export processor;
}
```

Browser usage:

```js
const output = await component.resize(
    input,
    800,
    600
);
```

## Tasks

* [ ] WIT editor.
* [ ] WIT syntax highlighting.
* [ ] Validate WIT.
* [ ] Generate bindings.
* [ ] Display component imports.
* [ ] Display component exports.
* [ ] Generate JS calling examples.
* [ ] Allow multiple components.

## Exit Criteria

The playground demonstrates:

```text
Language A
   │
   ▼
  WIT
   │
   ▼
Component
   │
   ▼
Language B
```

rather than only running `main()`.

---

# 11. Phase 6 — Component Composition

## Objective

Allow multiple components to communicate.

Example:

```text
image-decoder.component.wasm
          │
```
