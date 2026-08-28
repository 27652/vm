// src/runtime/component.worker.ts

import * as wasi from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import { createCaptureStream } from "./capture";

class WasiExit extends Error {
    constructor(public readonly code: number) {
        super(`WASI process exited with ${code}`);
    }
}

async function loadCoreModule(path: string): Promise<WebAssembly.Module> {
    const response = await fetch(`/components/demo/${path}`);

    if (!response.ok) {
        throw new Error(
            `Unable to load Wasm module ${path}: ${response.status}`
        );
    }

    const bytes = await response.arrayBuffer();

    return WebAssembly.compile(bytes);
}

async function instantiateDemo(
    args: string[],
    env: Record<string, string>,
) {
    const stdout = createCaptureStream();
    const stderr = createCaptureStream();

    /*
     * Override only the CLI pieces we need.
     *
     * Everything else continues to come from preview2-shim.
     */
    const cli = {
        ...wasi.cli,

        stdout: {
            getStdout() {
                return stdout.stream;
            },
        },

        stderr: {
            getStderr() {
                return stderr.stream;
            },
        },

        exit: {
            exit(status: { tag: "ok" | "err" }): never {
                throw new WasiExit(status.tag === "ok" ? 0 : 1);
            },

            exitWithCode(code: number): never {
                throw new WasiExit(code);
            },
        },
    };

    /*
     * Give this component invocation its own WASI environment.
     *
     * No FS.
     * No network.
     * Explicit args.
     * Explicit env.
     */
    const shim = new WASIShim({
        cli,

        sandbox: {
            args,
            env,
            preopens: {},
            enableNetwork: false,
        },
    });

    const module = await import(
        /* @vite-ignore */
        "/components/demo/demo.js"
    );

    const component = await module.instantiate(
        loadCoreModule,
        shim.getImportObject(),
    );

    return {
        component,
        stdout,
        stderr,
    };
}
type Request =
    | {
          id: number;
          op: "add";
          a: number;
          b: number;
      }
    | {
          id: number;
          op: "run";
          args: string[];
          env: Record<string, string>;
      };

type Response =
    | {
          id: number;
          ok: true;
          result: unknown;
      }
    | {
          id: number;
          ok: false;
          error: string;
      };

self.addEventListener("message", async (event: MessageEvent<Request>) => {
    const request = event.data;

    try {
        if (request.op === "add") {
            const runtime = await instantiateDemo([], {});

            /*
             * WIT:
             *
             * export api;
             *
             * becomes the JS interface object `api`.
             */
            const value = runtime.component.api.add(
                request.a,
                request.b,
            );

            self.postMessage({
                id: request.id,
                ok: true,
                result: value,
            } satisfies Response);

            return;
        }

        if (request.op === "run") {
            const runtime = await instantiateDemo(
                request.args,
                request.env,
            );

            let exitCode = 0;
            let runtimeError: string | undefined;

            try {
                /*
                 * wasi:cli/run export
                 */
                await runtime.component.run.run();
            } catch (error) {
                if (error instanceof WasiExit) {
                    exitCode = error.code;
                } else {
                    /*
                     * Keep actual runtime failures distinguishable
                     * from a deliberate WASI exit.
                     */
                    exitCode = 1;
                    runtimeError =
                        error instanceof Error
                            ? error.stack ?? error.message
                            : String(error);
                }
            }

            self.postMessage({
                id: request.id,
                ok: true,
                result: {
                    stdout: runtime.stdout.finish(),
                    stderr: runtime.stderr.finish(),
                    exitCode,
                    runtimeError,
                },
            } satisfies Response);

            return;
        }

        throw new Error("Unknown worker operation");
    } catch (error) {
        self.postMessage({
            id: request.id,
            ok: false,
            error:
                error instanceof Error
                    ? error.stack ?? error.message
                    : String(error),
        } satisfies Response);
    }
});
