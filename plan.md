# Browser WebAssembly Component Playground Roadmap

## 1. Project Goal

Build a fully client-side WebAssembly development environment capable of compiling, loading, inspecting, composing, and running WebAssembly Components directly in the browser.

The runtime should treat the WebAssembly Component Model as the primary execution abstraction rather than binding the architecture to one specific WASI generation.

The target architecture is:

```text
                    Browser Component Runtime
                              │
               ┌──────────────┴──────────────┐
               │                             │
           WASI 0.2                      WASI 0.3.1
        compatibility                    primary path
               │                             │
               └──────────────┬──────────────┘
                              │
                       Browser Host APIs
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
      Console / UI       Browser FS          Web APIs
                         OPFS / IDB         fetch / crypto
```

Long-term source pipeline:

```text
Source Code
    │
    ▼
Browser Compiler
    │
    ▼
Core WebAssembly / WASI 0.1
    │
    ▼
Componentization
    │
    ▼
WebAssembly Component
    │
    ├── WASI 0.2
    │
    └── WASI 0.3.1
            │
            ▼
           Jco
            │
            ▼
   Browser Component Runtime
            │
            ▼
      Browser Host APIs
```

The runtime should eventually support Components produced by multiple languages and toolchains without requiring server-side processing.

---

# 2. Design Principles

## 2.1 Component Model First

Do not model the VM as a "WASI Preview 2 runtime" or "WASI Preview 3 runtime".

Instead:

```text
WebAssembly Component
        │
        ▼
Generic Component Runtime
        │
        ▼
Selected Host Implementation
```

WASI is one family of host interfaces implemented on top of the Component Runtime.

This allows future support for:

```text
WASI 0.2
WASI 0.3.x
future WASI versions
custom WIT worlds
non-WASI Components
```

without rewriting the Component loader.

---

## 2.2 WASI 0.3.1 Is the Primary Target

New runtime work should target WASI 0.3.1.

Important Component Model features required by the WASI 0.3.1 baseline include:

```text
async func
future<T>
stream<T>
map<K, V>
implements
external-id
```

WASI 0.3 also replaces several patterns previously represented through `wasi:io` resources.

Conceptually:

```text
WASI 0.2

pollable
input-stream
output-stream
start-X / finish-X
subscribe()


WASI 0.3

future<T>
stream<T>
async func
native async suspension
```

Do not design new generic runtime APIs around `wasi:io`.

---

## 2.3 Preserve WASI 0.2 Compatibility

Existing WASI 0.2 support should remain functional.

WASI 0.2 should be treated as a compatibility backend:

```text
Component
   │
   ▼
detect WASI version
   │
   ├── 0.2 → Wasi02BrowserHost
   │
   └── 0.3 → Wasi03BrowserHost
```

Regression tests must ensure that existing WASI 0.2 Components continue to load and run.

---

## 2.4 Browser First

All primary execution paths must work entirely inside the browser.

No server-side runtime should be required for:

```text
Component loading
Component inspection
Jco transpilation
Component instantiation
WASI execution
stdout / stderr
filesystem
basic HTTP integration
```

Node-specific implementations may be useful for tests and development but must not become architectural dependencies of the browser runtime.

---

# 3. Target Runtime Architecture

Refactor the current structure:

```text
src/vm/runtime-p2/
```

toward:

```text
src/vm/runtime-component/
├── component-client.ts
├── component.worker.ts
├── component-loader.ts
├── component-info.ts
├── transpile.ts
├── runtime.ts
│
├── host/
│   ├── host.ts
│   ├── registry.ts
│   │
│   ├── wasi02/
│   │   ├── host.ts
│   │   ├── cli.ts
│   │   ├── stdio.ts
│   │   ├── exit.ts
│   │   ├── clocks.ts
│   │   └── random.ts
│   │
│   └── wasi03/
│       ├── host.ts
│       ├── cli.ts
│       ├── stdio.ts
│       ├── exit.ts
│       ├── clocks.ts
│       └── random.ts
│
├── io/
│   ├── output-capture.ts
│   ├── input-source.ts
│   └── text.ts
│
├── fs/
│   ├── filesystem.ts
│   ├── memory.ts
│   ├── opfs.ts
│   └── indexeddb.ts
│
└── tests/
    └── fixtures/
```

The generic runtime must not directly depend on Preview 2-specific stream resources.

---

# 4. Core Runtime Interfaces

## Component Information

Introduce a normalized component description.

```ts
export type WasiVersion =
    | "0.2"
    | "0.3"
    | "unknown";

export interface ComponentInfo {
    wasiVersion: WasiVersion;

    imports: ComponentImport[];
    exports: ComponentExport[];

    hasCliRun: boolean;

    features: {
        async: boolean;
        streams: boolean;
        futures: boolean;
        maps: boolean;
    };
}
```

This information should be created during Component loading.

---

## Component Host

Define a host abstraction independent of WASI version.

```ts
export interface ComponentHost {
    readonly wasiVersion: WasiVersion;

    createImports(
        options: RunOptions,
    ): Promise<Record<string, unknown>>;

    finish(): Promise<RunResult>;

    dispose(): void;
}
```

Runtime flow:

```text
load Component
      │
      ▼
inspect Component
      │
      ▼
detectWasiVersion()
      │
      ▼
createHost()
      │
      ▼
host.createImports()
      │
      ▼
component.instantiate()
      │
      ▼
execute export
```

---

# 5. Phase 0 — Freeze Existing WASI 0.2 Runtime

## Goal

Turn the current WASI 0.2 implementation into a stable compatibility baseline before major refactoring.

Existing functionality to preserve:

```text
Upload P2 Component
        ↓
Jco transpile
        ↓
generated JS + core wasm
        ↓
WASI 0.2 host
        ↓
component.run.run()
        ↓
stdout / stderr / exitCode
```

## Tasks

* Preserve current Component upload.
* Preserve Worker-based execution.
* Preserve in-memory Jco generated bundle.
* Preserve Blob URL JavaScript module loading.
* Preserve args and environment variables.
* Preserve stdout capture.
* Preserve stderr capture.
* Preserve WASI exit handling.
* Preserve custom exported interface invocation.
* Add automated regression fixtures.

## Required Fixtures

```text
wasi02-command.wasm
wasi02-args-env.wasm
wasi02-stdout.wasm
wasi02-stderr.wasm
wasi02-exit.wasm
wasi02-custom-api.wasm
```

## Exit Criteria

```text
✓ Load arbitrary compatible WASI 0.2 Component
✓ Run wasi:cli/run
✓ Capture stdout
✓ Capture stderr
✓ Pass arguments
✓ Pass environment variables
✓ Return guest exit code
✓ Reload another Component
✓ Multiple sequential runs work
✓ Existing custom API demo works
```

No new WASI 0.2 features should be added after this phase unless needed for compatibility.

---

# 6. Phase 1 — Generic Component Runtime

## Goal

Separate generic Component Model functionality from WASI 0.2 host functionality.

Current code conceptually mixes:

```text
Component loading
Jco transpilation
WASI 0.2
stdio
execution
```

These should become separate layers.

Target:

```text
ComponentLoader
      │
      ▼
GeneratedBundle
      │
      ▼
ComponentRuntime
      │
      ▼
ComponentHost
```

## Move Jco Logic

Move:

```text
generate()
generated.files
Blob URL creation
core wasm module loading
bundle disposal
```

into:

```text
transpile.ts
component-loader.ts
```

Suggested abstraction:

```ts
export interface GeneratedBundle {
    jsUrl: string;

    files: Map<string, Uint8Array>;

    imports: unknown[];
    exports: unknown[];

    loadCoreModule(
        path: string,
    ): Promise<WebAssembly.Module>;

    dispose(): void;
}
```

## Version Detection

Add:

```ts
detectWasiVersion(...)
```

Inspect Component imports and exports.

Examples:

```text
wasi:cli/...@0.2.x
    → WASI 0.2

wasi:cli/...@0.3.x
    → WASI 0.3
```

Do not assume that every Component uses WASI.

Possible result:

```text
unknown
```

must remain valid for custom WIT Components.

## Exit Criteria

```text
✓ Component transpilation contains no WASI-specific code
✓ Component bundle loading contains no WASI-specific code
✓ Host is selected independently
✓ WASI 0.2 tests still pass
✓ Non-WASI Component can be inspected
```

---

# 7. Phase 2 — Shared Browser I/O Layer

## Goal

Remove Preview 2 resource semantics from the generic capture implementation.

Current conceptual design:

```text
createCaptureStream()
        │
        ▼
WASI 0.2 output-stream
```

Replace with:

```text
OutputCapture
      │
      ├── WASI 0.2 adapter
      │
      └── WASI 0.3 adapter
```

## Output Capture

```ts
export interface OutputCapture {
    append(
        bytes: Uint8Array,
    ): void;

    finish(): string;
}
```

Implementation:

```ts
class TextOutputCapture
    implements OutputCapture
{
    private decoder =
        new TextDecoder();

    private output = "";

    append(bytes: Uint8Array) {
        this.output +=
            this.decoder.decode(
                bytes,
                { stream: true },
            );
    }

    finish() {
        this.output +=
            this.decoder.decode();

        return this.output;
    }
}
```

## WASI 0.2 Adapter

```text
wasi:cli/stdout
      ↓
output-stream.write()
      ↓
OutputCapture.append()
```

## WASI 0.3 Adapter

```text
wasi:cli/stdout
      ↓
write-via-stream(stream<u8>)
      ↓
consume async stream
      ↓
OutputCapture.append()
      ↓
complete future
```

The capture implementation should know nothing about WASI.

## Exit Criteria

```text
✓ UTF-8 split writes work
✓ WASI 0.2 stdout works
✓ WASI 0.2 stderr works
✓ Capture implementation has no preview2-shim dependency
```

---

# 8. Phase 3 — WASI 0.3.1 Runtime Proof of Concept

## Goal

Run a prebuilt WASI 0.3.1 Component entirely in the browser.

Initial pipeline:

```text
WASI 0.3.1 Component
        │
        ▼
       Jco
        │
        ▼
generated JS + core wasm
        │
        ▼
Wasi03BrowserHost
        │
        ▼
Browser Worker
```

Do not depend on the assumption that a complete upstream Preview 3 browser shim exists.

The host boundary should make it possible to:

```text
use upstream implementation
```

when appropriate, or:

```text
provide playground-specific browser host
```

when necessary.

---

## Initial WASI 0.3 Interfaces

Implement only the minimum useful command environment first.

### CLI

```text
wasi:cli/environment
wasi:cli/stdin
wasi:cli/stdout
wasi:cli/stderr
wasi:cli/exit
wasi:cli/run
```

### Other Initial Interfaces

```text
wasi:clocks
wasi:random
```

Initially disabled:

```text
filesystem
sockets
http
network
```

---

## Async Run

WASI 0.3 execution must treat async as a Component Model feature rather than JavaScript-only wrapping.

Conceptually:

```text
component.run.run()
        │
        ▼
Component Model async func
        │
        ▼
native Component suspension
        │
        ▼
Promise / async host interaction
```

Test:

```text
async suspension
async completion
nested async calls
host async completion
```

---

## WASI 0.3 stdio

Do not emulate the WASI 0.2 `output-stream` API internally.

Output flow:

```text
Guest
  │
  ▼
stream<u8>
  │
  ▼
write-via-stream
  │
  ▼
Wasi03BrowserHost
  │
  ▼
OutputCapture
```

Input flow:

```text
Browser Input
     │
     ▼
InputSource
     │
     ▼
stream<u8>
     │
     ▼
Guest
```

---

## Exit Handling

Maintain the distinction between:

```text
guest exit
```

and:

```text
runtime failure / trap
```

Normalized result:

```ts
export interface RunResult {
    stdout: string;
    stderr: string;

    exitCode: number;

    runtimeError?: string;
}
```

---

## Exit Criteria

```text
✓ Load WASI 0.3.1 Component
✓ Instantiate in browser
✓ Run async wasi:cli/run
✓ args work
✓ env works
✓ stdout works
✓ stderr works
✓ guest exit works
✓ random works
✓ clocks work
✓ Component reload works
✓ multiple runs work
```

---

# 9. Phase 4 — WASI 0.3.1 Component Model Feature Tests

WASI 0.3.1 should not be considered supported based only on a CLI hello-world Component.

Explicitly validate the Component Model feature baseline.

## async func

Example:

```wit
interface async-demo {
    calculate: async func(
        value: u32,
    ) -> u32;
}
```

Test:

```text
JS
 ↓
Component async function
 ↓
await
 ↓
result
```

---

## future<T>

Test:

```text
Component
    │
    ▼
future<T>
    │
    ▼
host completion
```

Test:

```text
successful completion
error completion
delayed completion
cancellation
```

---

## stream<T>

Test:

```text
small stream
multi-chunk stream
large stream
early completion
consumer cancellation
backpressure
```

Pay special attention to:

```text
stream<u8>
```

because it is fundamental to stdio, filesystem, and HTTP bodies.

---

## map<K, V>

Create a test WIT interface using:

```wit
map<string, string>
```

Validate:

```text
Component → JavaScript

JavaScript → Component
```

including:

```text
empty maps
multiple entries
Unicode strings
round trip
```

---

## implements / external-id

Add fixtures exercising multiple compatible interface instances.

Validate that:

```text
interface identity
```

is preserved through:

```text
Component
 ↓
Jco
 ↓
JavaScript bindings
 ↓
composition
```

---

## Fixtures

```text
tests/fixtures/
├── wasi03-command-basic.wasm
├── wasi03-async-run.wasm
├── wasi03-future.wasm
├── wasi03-stream.wasm
├── wasi03-stream-stdout.wasm
├── wasi031-map.wasm
├── wasi031-implements.wasm
└── wasi031-custom-world.wasm
```

## Exit Criteria

```text
✓ async func tested
✓ future tested
✓ stream tested
✓ cancellation tested
✓ map tested
✓ implements tested
✓ external-id behavior tested
```

---

# 10. Phase 5 — Unified WASI 0.2 / 0.3 Runtime

## Goal

Make Component loading independent of WASI generation.

User flow:

```text
Upload Component
      │
      ▼
Inspect
      │
      ▼
Detect WASI
      │
      ├───────────────┐
      ▼               ▼
   WASI 0.2        WASI 0.3
      │               │
      ▼               ▼
Wasi02Host        Wasi03Host
      │               │
      └───────┬───────┘
              ▼
        execute export
```

## UI

Display:

```text
Component Type
WASI Version
World
Imports
Exports
Async exports
Component Model feature level
```

Example:

```text
WASI: 0.3.1

Features:
✓ async
✓ future
✓ stream
✓ map
```

For WASI 0.2:

```text
WASI: 0.2.x

Compatibility runtime
```

## Unsupported Components

Never fail with only a low-level JavaScript exception.

Return structured diagnostics:

```ts
type CompatibilityIssue = {
    interface?: string;
    version?: string;
    feature?: string;
    message: string;
};
```

Example UI:

```text
Cannot run this Component.

Unsupported import:
wasi:http/...@0.3.x

Filesystem: supported
HTTP: not yet supported
```

## Exit Criteria

```text
✓ One load API handles P2 and P3 Components
✓ Host is automatically selected
✓ UI identifies WASI generation
✓ Unsupported imports produce useful diagnostics
```

---

# 11. Phase 6 — Async Component Composition

## Goal

Validate the primary architectural advantage of WASI 0.3:

```text
native async composition
```

Build:

```text
Component A
     │
     │ async call
     ▼
Component B
     │
     │ future / stream
     ▼
Browser Host
```

Tests must include:

```text
nested async calls
future forwarding
stream forwarding
backpressure
cancellation
errors
timeouts
```

---

## Composition Runtime

Create an abstraction:

```ts
interface ComponentInstanceRegistry {
    register(
        name: string,
        instance: unknown,
    ): void;

    resolve(
        name: string,
    ): unknown;
}
```

Eventually support:

```text
Component A import
      │
      ▼
Component B export
```

without crossing the browser network stack.

---

## Composition UI

Eventually visualize:

```text
┌────────────┐
│ Component A│
└─────┬──────┘
      │ import foo
      ▼
┌────────────┐
│ Component B│
└─────┬──────┘
      │ wasi:http
      ▼
┌────────────┐
│ Browser Host│
└────────────┘
```

## Exit Criteria

```text
✓ Compose two Components
✓ Async calls cross Component boundary
✓ Stream crosses Component boundary
✓ Cancellation propagates
✓ Host import can terminate composition chain
```

---

# 12. Phase 7 — Browser Compiler

## Goal

Compile C source code directly in the browser.

Initial toolchain:

```text
C Source
   │
   ▼
clang.wasm
   │
   ▼
LLVM bitcode / object
   │
   ▼
lld.wasm
   │
   ▼
WASI 0.1 Core Wasm
```

Keep compiler bootstrapping independent of WASI 0.3 runtime work.

Initial C compilation target:

```text
wasm32-wasip1
```

because compiler/toolchain support for this path is mature and well-understood.

---

## Compiler Worker

Use a dedicated Worker:

```text
UI Worker
Component Runtime Worker
Compiler Worker
```

Compilation must not block UI or Component execution.

---

## Exit Criteria

```text
✓ Compile hello.c
✓ Compile multiple source files
✓ Capture compiler diagnostics
✓ Produce wasm32-wasip1
✓ No server required
```

---

# 13. Phase 8 — Componentization

## Goal

Turn compiler-generated Core Wasm into Components.

Initial reliable path:

```text
C
 ↓
wasm32-wasip1
 ↓
WASI 0.1 Core Module
 ↓
Preview 1 Adapter
 ↓
WASI 0.2 Component
 ↓
Component Runtime
```

Do not require a direct:

```text
WASI 0.1 → WASI 0.3
```

conversion path as a prerequisite for the browser compiler.

The Runtime should already support both:

```text
compiler-generated WASI 0.2 Components
```

and:

```text
uploaded WASI 0.3.1 Components
```

---

## Future Native WASI 0.3 Compilation

When guest toolchains support stable WASI 0.3 generation:

```text
Source
   │
   ▼
Language Toolchain
   │
   ▼
WASI 0.3 Component
   │
   ▼
Component Runtime
```

can be added without changing the Runtime architecture.

---

# 14. Phase 9 — Browser Filesystem

## Goal

Provide one browser filesystem core that can be adapted to both WASI 0.2 and WASI 0.3.

Architecture:

```text
             BrowserFilesystem
                    │
        ┌───────────┼───────────┐
        │           │           │
     MemoryFS      OPFS      IndexedDB
        │
        ├───────────────────────┐
        ▼                       ▼
WASI 0.2 Adapter          WASI 0.3 Adapter
```

---

## Browser Filesystem API

Prefer async primitives internally.

Example:

```ts
interface BrowserFilesystem {
    read(
        path: string,
        offset: bigint,
        length?: bigint,
    ): AsyncIterable<Uint8Array>;

    write(
        path: string,
        data: AsyncIterable<Uint8Array>,
        offset?: bigint,
    ): Promise<void>;

    stat(
        path: string,
    ): Promise<FileStat>;

    readDirectory(
        path: string,
    ): AsyncIterable<DirectoryEntry>;
}
```

Do not make the BrowserFilesystem API mirror Preview 2 `input-stream` / `output-stream`.

---

## WASI 0.3 Filesystem

Map:

```text
stream<T>
future<T>
async func
```

onto BrowserFilesystem.

Support:

```text
read
write
directory iteration
metadata
create/remove
rename
```

Add OPFS only after the in-memory implementation is stable.

---

## Exit Criteria

```text
✓ Memory filesystem
✓ File read/write
✓ Directory iteration
✓ WASI 0.2 adapter
✓ WASI 0.3 adapter
✓ OPFS backend
✓ persistence between runs
```

---

# 15. Phase 10 — WASI HTTP 0.3

## Goal

Map WASI 0.3 HTTP onto browser networking APIs.

Target:

```text
WASI HTTP Component
        │
        ▼
Wasi03HttpHost
        │
        ▼
Browser fetch()
```

Represent request/response bodies using streaming APIs wherever possible.

Architecture:

```text
WASI stream<u8>
       │
       ▼
ReadableStream
       │
       ▼
fetch()
       │
       ▼
Response.body
       │
       ▼
WASI stream<u8>
```

Focus on the WASI 0.3 HTTP model first.

WASI 0.2 HTTP compatibility can be added later if required.

---

## Browser Restrictions

Document browser constraints explicitly:

```text
CORS
forbidden headers
cookie policy
TLS controlled by browser
no arbitrary raw sockets
same-origin behavior
service worker interaction
```

Do not hide these differences from the user.

---

## Exit Criteria

```text
✓ GET
✓ POST
✓ request body streaming
✓ response body streaming
✓ status and headers
✓ cancellation
✓ timeout
✓ useful CORS errors
```

---

# 16. Phase 11 — WIT Playground

## Goal

Expose the Component Model directly to users rather than only exposing CLI execution.

Allow users to inspect and invoke arbitrary exported WIT functions.

Example:

```wit
interface calculator {
    add: func(
        a: u32,
        b: u32,
    ) -> u32;

    slow-add: async func(
        a: u32,
        b: u32,
    ) -> u32;
}
```

UI:

```text
Exports

calculator.add
  a: [ 10 ]
  b: [ 20 ]

[ Call ]

Result:
30


calculator.slow-add

[ Call Async ]

Result:
30
```

---

## Type Support

Support Component Model values:

```text
bool
integers
float
char
string
list
record
tuple
flags
enum
variant
option
result
resource
map
future
stream
```

Provide special UI handling for:

```text
future
stream
resource
```

---

## Component Inspector

Display:

```text
World
Imports
Exports
WASI version

Functions
Resources
Async functions
Streams
Futures

Component Model features
```

---

# 17. Phase 12 — Rust and Additional Languages

## Rust WASI 0.2 Track

Support mature WASI 0.2 workflows first where useful.

```text
Rust
 ↓
WASI 0.2 Component
 ↓
Runtime
```

---

## Rust WASI 0.3 Track

Add a separate toolchain profile:

```text
Rust
 ↓
WASI 0.3-capable bindings/toolchain
 ↓
WASI 0.3.1 Component
 ↓
Runtime
```

Do not silently mix:

```text
0.2 WIT
0.3 WIT
different bindgen versions
different Component Model feature levels
```

---

## Toolchain Matrix

Maintain an explicit compatibility table in the repository.

Example:

| Guest Target | WIT   | Component Features                  | Runtime    |
| ------------ | ----- | ----------------------------------- | ---------- |
| WASI 0.2.x   | 0.2   | sync/resource-based I/O             | Wasi02Host |
| WASI 0.3.0   | 0.3   | async/future/stream                 | Wasi03Host |
| WASI 0.3.1   | 0.3.1 | async/future/stream/map/annotations | Wasi03Host |

Lock known-good versions for:

```text
Jco
Jco transpilation component
WASI WIT packages
Preview 2 shim
Preview 3-related tooling
wit-bindgen
wasm-tools
guest compiler
adapter modules
```

Avoid relying on loose dependency ranges for the compatibility-critical toolchain.

---

# 18. Worker Architecture

Target worker topology:

```text
                       UI
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
 Component Worker  Compiler Worker  Utility Worker
         │
         ▼
Component Runtime
         │
         ├── Jco
         ├── Host
         ├── Wasm modules
         └── Component instances
```

The UI thread should never perform:

```text
large Component transpilation
large WebAssembly compilation
guest execution
source compilation
```

---

# 19. Runtime Lifecycle

Component state:

```text
EMPTY
  │
  │ load(bytes)
  ▼
LOADING
  │
  ▼
READY
  │
  ├── instantiate
  │       │
  │       ▼
  │     RUNNING
  │       │
  │       ▼
  │     READY
  │
  ├── reload
  │
  ▼
DISPOSED
```

Generated Jco bundles may be cached.

Component instances should normally be per-run unless explicit persistent-instance behavior is requested.

---

# 20. Cancellation

Cancellation becomes increasingly important with WASI 0.3.

Every long-running operation should eventually support:

```text
AbortSignal
```

Examples:

```text
Component execution
HTTP request
stream consumption
filesystem operation
compiler invocation
```

Worker protocol:

```ts
{
    id,
    op: "cancel"
}
```

Cancellation must clean up:

```text
pending promises
stream readers
Blob URLs
Component instances
filesystem handles
network requests
```

---

# 21. Resource Limits

Introduce explicit limits before exposing unrestricted Components.

Potential limits:

```text
maximum Component size
maximum generated JS size
maximum core wasm size
maximum stdout size
maximum stderr size
maximum filesystem size
maximum execution time
maximum concurrent runs
maximum stream buffering
```

Avoid unbounded buffering.

Especially for WASI 0.3:

```text
stream<T>
```

must remain streaming rather than being automatically converted into complete in-memory arrays.

---

# 22. Testing Strategy

Use three levels.

## Unit Tests

Test:

```text
version detection
path normalization
capture
bundle lifecycle
host selection
error normalization
```

---

## Component Fixtures

Run actual WebAssembly Components for:

```text
WASI 0.2
WASI 0.3
WASI 0.3.1
custom WIT
```

---

## Browser Integration Tests

Verify:

```text
Worker startup
dynamic import via Blob URL
WebAssembly.compile
Jco browser transpilation
Component execution
streaming
cancellation
filesystem
HTTP
```

Tests must run in an actual browser environment.

Node-only success is insufficient.

---

# 23. Compatibility CI

Introduce a compatibility matrix.

```text
                    Runtime

             WASI 0.2   WASI 0.3.1

P2 CLI           ✓
P2 custom WIT    ✓

P3 CLI                       ✓
P3 async                     ✓
P3 stream                    ✓
P3 future                    ✓
P3 map                       ✓
P3 composition               ✓
```

CI should detect regressions in both generations.

---

# 24. Error Model

Normalize runtime errors.

```ts
export type RuntimeFailure =
    | {
        kind: "unsupported-component";
        message: string;
    }
    | {
        kind: "unsupported-import";
        importName: string;
    }
    | {
        kind: "transpile-error";
        message: string;
    }
    | {
        kind: "instantiate-error";
        message: string;
    }
    | {
        kind: "guest-trap";
        message: string;
    }
    | {
        kind: "host-error";
        message: string;
    }
    | {
        kind: "cancelled";
    };
```

Do not expose arbitrary Jco stack traces as the primary user-facing diagnostic.

Keep stack traces available in developer/debug mode.

---

# 25. Security Model

Components should run with deny-by-default capabilities.

Default host:

```text
stdin       controlled
stdout      captured
stderr      captured

filesystem  denied
network     denied
http        denied

environment explicit only
arguments   explicit only
```

Capabilities should be enabled deliberately.

Example:

```ts
client.run({
    args,
    env,

    capabilities: {
        filesystem: false,
        http: false,
    },
});
```

---

# 26. Browser Capability Mapping

Long-term mapping:

```text
WASI CLI
    → Browser UI / Worker

WASI clocks
    → performance / Date

WASI random
    → crypto.getRandomValues

WASI filesystem
    → MemoryFS / OPFS / IndexedDB

WASI HTTP
    → fetch / Request / Response

WASI streams
    → Component streams / Web Streams

WASI sockets
    → restricted / potentially unsupported
```

Do not pretend that browser security allows every traditional WASI capability.

Unsupported capabilities should produce explicit compatibility diagnostics.

---

# 27. UI Roadmap

## Component Tab

Display:

```text
Filename
Component size
WASI version
World
Imports
Exports
Features
```

---

## Run Tab

```text
Arguments
Environment variables
Capabilities

[ Run ]
[ Cancel ]
```

Output:

```text
stdout
stderr
exit code
runtime error
execution time
```

---

## WIT Tab

Display parsed interface information.

Allow invoking exports directly.

---

## Composition Tab

Future:

```text
Component A exports
        │
        ▼
Component B imports
```

Allow visual linking of compatible interfaces.

---

## Files Tab

Expose BrowserFilesystem.

```text
/
├── src/
├── tmp/
└── data/
```

---

# 28. Milestones

## Milestone A — Stable P2 Baseline

```text
✓ existing runtime frozen
✓ regression tests
✓ component fixtures
```

---

## Milestone B — Generic Component Runtime

```text
✓ runtime-p2 renamed/refactored
✓ generic transpilation
✓ ComponentInfo
✓ WASI detection
✓ host abstraction
```

---

## Milestone C — WASI 0.3.1 CLI

```text
✓ Wasi03BrowserHost
✓ async run
✓ args/env
✓ stdout/stderr
✓ exit
✓ clocks
✓ random
```

---

## Milestone D — Component Model 0.3.1 Features

```text
✓ future
✓ stream
✓ async func
✓ map
✓ implements
✓ external-id
```

---

## Milestone E — Dual Runtime

```text
✓ WASI 0.2 automatically selected
✓ WASI 0.3 automatically selected
✓ unified UI
✓ compatibility diagnostics
```

---

## Milestone F — Async Composition

```text
✓ component-to-component calls
✓ async propagation
✓ streams
✓ cancellation
✓ backpressure
```

---

## Milestone G — Browser Compiler

```text
✓ clang
✓ lld
✓ wasm32-wasip1
✓ diagnostics
```

---

## Milestone H — Source to Component

```text
C source
  ↓
WASI 0.1 Core Wasm
  ↓
Adapter
  ↓
WASI 0.2 Component
  ↓
Runtime
```

---

## Milestone I — Browser Filesystem

```text
✓ MemoryFS
✓ OPFS
✓ WASI 0.2
✓ WASI 0.3
```

---

## Milestone J — WASI HTTP 0.3

```text
✓ fetch
✓ request streaming
✓ response streaming
✓ cancellation
```

---

# 29. Immediate Next Tasks

Work should proceed in this order.

## 1. Freeze Current P2 Runtime

Add fixture-based tests before refactoring.

---

## 2. Rename Runtime Layer

```text
runtime-p2
    ↓
runtime-component
```

Do not rename WASI 0.2-specific host code to generic names.

---

## 3. Extract Jco Transpilation

Move:

```text
generate()
Blob URL handling
generated files
core module loader
```

out of `component.worker.ts`.

---

## 4. Extract WASI 0.2 Host

Move current:

```text
WASIShim
stdout
stderr
exit
args
env
```

into:

```text
host/wasi02/
```

At this point current P2 behavior should still pass all tests.

---

## 5. Introduce ComponentInfo

Implement:

```text
imports
exports
WASI version detection
feature information
```

---

## 6. Introduce Shared OutputCapture

Remove Preview 2 types from generic output capture.

---

## 7. Build Minimal Wasi03BrowserHost

Start only with:

```text
environment
stdout
stderr
exit
run
```

Then:

```text
clocks
random
```

---

## 8. Run First WASI 0.3.1 Command

Target test:

```text
Component
    │
    ▼
async run()
    │
    ▼
"Hello from WASI 0.3.1"
```

This is the first major P3 milestone.

---

## 9. Add stream / future Tests

Before filesystem or HTTP.

---

## 10. Add map / implements Fixtures

This completes the 0.3.1 baseline validation.

---

# 30. Non-Goals for the Initial WASI 0.3.1 Upgrade

Do not block the first WASI 0.3.1 runtime on:

```text
full filesystem support
HTTP
sockets
Cargo
Rust compiler in browser
C compiler in browser
Component composition UI
debugger
package registry
```

First prove:

```text
load
inspect
transpile
instantiate
async run
stdio
exit
```

for WASI 0.3.1.

---

# 31. Primary Upgrade Path

The recommended implementation sequence is:

```text
Current Runtime
     │
     ▼
Freeze P2 behavior
     │
     ▼
Generic Component Runtime
     │
     ▼
Host abstraction
     │
     ├───────────────────┐
     ▼                   ▼
Wasi02BrowserHost   Wasi03BrowserHost
                         │
                         ▼
                  Async / Stream / Future
                         │
                         ▼
                    WASI 0.3.1
                         │
                         ▼
                     Composition
                         │
                         ▼
                    Filesystem
                         │
                         ▼
                       HTTP
```

Do not begin by rewriting the compiler pipeline.

The runtime boundary should be stabilized first.

---

# 32. Definition of WASI 0.3.1 Support

The project may claim basic WASI 0.3.1 runtime support once all of the following work in a real browser:

```text
✓ WASI 0.3.1 Component can be loaded
✓ Jco transpilation works client-side
✓ Component can be instantiated
✓ async wasi:cli/run works
✓ stdout stream works
✓ stderr stream works
✓ arguments work
✓ environment works
✓ guest exit works
✓ clocks work
✓ random works
✓ future<T> works
✓ stream<T> works
✓ map<K,V> works
✓ 0.3.1 interface identity features are accepted
✓ multiple runs work
✓ Component reload works
✓ WASI 0.2 still works
```

Full WASI 0.3 support should be described separately from basic runtime support.

For example:

```text
WASI 0.3.1 Core Runtime
WASI 0.3.1 Filesystem
WASI 0.3.1 HTTP
```

should have independent compatibility indicators.

---

# 33. Final Architecture

Long-term:

```text
                         Browser IDE
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      Source Editor     WIT Inspector       Filesystem
          │                  │                  │
          ▼                  │                  │
    Browser Compiler         │                  │
          │                  │                  │
          ▼                  │                  │
      Core Wasm              │                  │
          │                  │                  │
          ▼                  │                  │
   Componentization          │                  │
          │                  │                  │
          └────────────┬─────┘                  │
                       ▼                        │
             WebAssembly Component             │
                       │                        │
                       ▼                        │
               Component Runtime ◄─────────────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
       Wasi02BrowserHost   Wasi03BrowserHost
              │                 │
              └────────┬────────┘
                       ▼
                  Browser APIs
              ┌────────┼─────────┐
              ▼        ▼         ▼
            OPFS     fetch     crypto
```

The architecture should make WASI versions replaceable host layers rather than fundamental runtime boundaries.

That is the main requirement of the WASI 0.3.1 migration.
