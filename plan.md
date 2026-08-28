# Browser WASI P2 Playground — Implementation Plan

## 1. Goal

Build a fully client-side web application that can:

1. Edit source code in the browser.
2. Compile source code to WebAssembly entirely in the browser.
3. Produce a WASI Preview 2 / Component Model application.
4. Execute the generated component directly in the browser.
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
    │
    ▼
Jco
    │
    ▼
JS Bindings + Core Wasm
    │
    ▼
Preview2 Shim
    │
    ▼
Browser Web APIs
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

# 3. Phase 0 — Runtime Proof of Concept

## Objective

Prove that a precompiled WASI P2 component can execute inside the browser.

Do not add compilation yet.

## Stack

```text
WASI P2 component
        │
        ▼
@bytecodealliance/jco
        │
        ▼
@bytecodealliance/preview2-shim
        │
        ▼
Browser
```

## Tasks

* [ ] Create a minimal WASI P2 component.
* [ ] Export one simple WIT function.
* [ ] Test `wasi:cli/stdout`.
* [ ] Test arguments.
* [ ] Test environment variables.
* [ ] Capture stdout.
* [ ] Capture stderr.
* [ ] Capture exit code.
* [ ] Run everything inside a Web Worker.

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

Browser can load and execute a P2 component without server-side runtime support.

---

# 4. Phase 1 — Browser C Compiler

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

# 5. Phase 2 — Convert WASI P1 to P2

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
WASI Preview 2
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

# 6. Phase 3 — Jco Browser Runtime

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
       preview2-shim
              │
              ▼
           Browser
```

## WASI Interfaces

Initial support:

```text
wasi:cli
wasi:io
wasi:clocks
wasi:random
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

# 7. Phase 4 — Browser Filesystem

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

# 8. Phase 5 — WIT Playground

## Objective

Make Component Model features first-class instead of treating P2 only as a CLI runtime.

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

# 9. Phase 6 — Component Composition

## Objective

Allow multiple components to communicate.

Example:

```text
image-decoder.component.wasm
          │
```
