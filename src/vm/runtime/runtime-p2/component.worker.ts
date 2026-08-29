// src/vm/runtime-p2/component.worker.ts

import * as wasi from "@bytecodealliance/preview2-shim";
import { WASIShim } from "@bytecodealliance/preview2-shim/instantiation";
import {
    $init as initJcoBindgen,
    generate,
} from "@bytecodealliance/jco-transpile/component";

import { createCaptureStream } from "./capture";

/**
 * 在浏览器里没有真正的 process.exit。
 *
 * WASI guest 调用 exit 时，我们把它转换成异常，
 * 然后在 run() 外层捕获并转换成 exitCode。
 */
class WasiExit extends Error {
    public readonly code: number;
    constructor(code: number) {
        super(`WASI process exited with ${code}`);
        this.name = "WasiExit";
        this.code = code
    }
}

type GeneratedBundle = {
    /**
     * Jco 生成的 JS module Blob URL。
     */
    jsUrl: string;

    /**
     * Jco 拆出来的所有文件。
     *
     * 通常包括：
     *
     * component.js
     * component.core.wasm
     * ...
     */
    files: Map<string, Uint8Array>;

    imports: string[];

    exports: Array<
        [
            string,
            "function" | "instance",
        ]
    >;

    dispose(): void;
};

type ComponentInstance = Record<string, any>;

type Request =
    /**
     * 用户上传新的 P2 Component。
     *
     * load 后，后面的 add/run 都使用这个 Component。
     */
    | {
          id: number;
          op: "load";
          componentBytes: ArrayBuffer;
      }

    /**
     * demo WIT:
     *
     * playground:demo/api.add
     */
    | {
          id: number;
          op: "add";
          a: number;
          b: number;
      }

    /**
     * wasi:cli/run
     */
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

/**
 * 如果调用方还没有 load() 用户 Component，
 * 就默认使用仓库里的 P2 demo。
 *
 * 这样当前 demo 可以直接运行，
 * 不需要立刻修改 UI。
 */
const DEFAULT_COMPONENT_URL =
    "/code/p2/p2_demo.wasm";

/**
 * 当前加载的原始 P2 Component。
 */
let componentBytes: Uint8Array | null = null;

/**
 * 当前 Component 对应的 Jco transpile/generate 结果。
 *
 * 一个 Component 只 transpile 一次；
 * run/add 可以重复 instantiate。
 */
let generatedBundle:
    Promise<GeneratedBundle> | null = null;

/**
 * ./foo.core.wasm
 * foo.core.wasm
 *
 * 都统一成：
 *
 * foo.core.wasm
 */
function normalizePath(path: string): string {
    let value = path.replaceAll("\\", "/");

    while (value.startsWith("./")) {
        value = value.slice(2);
    }

    while (value.startsWith("/")) {
        value = value.slice(1);
    }

    return value;
}

/**
 * 如果没有通过 load() 指定 Component，
 * 自动读取 public/code/p2/p2_demo.wasm。
 */
async function getComponentBytes(): Promise<Uint8Array> {
    if (componentBytes) {
        return componentBytes;
    }

    const response =
        await fetch(DEFAULT_COMPONENT_URL);

    if (!response.ok) {
        throw new Error(
            `Unable to load default P2 component: ` +
                `${response.status} ${response.statusText}`,
        );
    }

    componentBytes = new Uint8Array(
        await response.arrayBuffer(),
    );

    return componentBytes;
}

/**
 * P2 Component
 *
 *       ↓
 *
 * Jco js-component-bindgen
 *
 *       ↓
 *
 * component.js
 * *.core.wasm
 *
 *
 * 全过程都发生在 Worker 内存中，
 * 不写 public/components，也不请求服务器转换。
 */
async function transpileComponent(
    bytes: Uint8Array,
): Promise<GeneratedBundle> {
    /**
     * @bytecodealliance/jco-transpile/component
     * 本身是一个 WebAssembly Component 生成的 JS binding。
     *
     * 首次使用前先完成初始化。
     */
    await initJcoBindgen;

    /**
     * 这里基本对应：
     *
     * jco transpile component.wasm \
     *   --instantiation async
     *
     * 但是完全在浏览器内存中完成。
     */
    const generated = generate(bytes, {
        name: "component",

        /**
         * 非常关键。
         *
         * 生成：
         *
         * export async function instantiate(
         *     getCoreModule,
         *     imports,
         * )
         *
         * 而不是自动 import WASI。
         *
         * 这样我们才能自己传 WASIShim。
         */
        instantiation: {
            tag: "async",
        },

        /**
         * instantiation 模式下 WASI imports
         * 由 WASIShim 动态提供，因此这里不用 map。
         */
        map: [],

        asyncMode: undefined,
        importBindings: undefined,

        validLiftingOptimization: false,
        tracing: false,

        noComponentErrorWrapping: true,

        /**
         * 我们明确运行在 browser Worker，
         * 不生成 Node.js fs/path 兼容代码。
         */
        noNodejsCompat: true,

        /**
         * runtime 不需要 .d.ts。
         */
        noTypescript: true,

        tlaCompat: false,

        /**
         * 0 = 不把 core wasm base64 内联进 JS。
         *
         * 这样所有 core wasm 都会出现在 files 中，
         * 我们可以直接 WebAssembly.compile。
         */
        base64Cutoff: 0,

        noNamespacedExports: false,

        multiMemory: false,
        bindgenEnableWasmExnref: false,

        strict: false,

        flagsAsBigint: false,
        variantsInlineCases: false,
        useNamespaceObjects: false,
        enumValuesScreamingSnakeCase: false,


        asmjs: false,
    });

    const files = new Map<string, Uint8Array>();

    for (
        const [name, contents]
        of generated.files
    ) {
        files.set(
            normalizePath(name),
            contents,
        );
    }

    /**
     * 找到生成出来的入口 JS。
     *
     * name: "component"
     *
     * 通常就是：
     *
     * component.js
     */
    const jsEntry = [...files.entries()]
        .find(([name]) =>
            name.endsWith(".js"),
        );

    if (!jsEntry) {
        throw new Error(
            "Jco did not generate a JavaScript entry module",
        );
    }

    const [jsName, jsBytes] = jsEntry;

    /**
     * JS 只存在内存。
     *
     * Uint8Array
     *      ↓
     * JS source
     *      ↓
     * Blob
     *      ↓
     * blob:...
     *      ↓
     * dynamic import()
     */
    const jsSource =
        new TextDecoder().decode(jsBytes);

    const jsBlob = new Blob(
        [jsSource],
        {
            type: "text/javascript",
        },
    );

    const jsUrl =
        URL.createObjectURL(jsBlob);

    console.debug(
        "[P2] transpiled",
        {
            jsEntry: jsName,
            files: [...files.keys()],
            imports: generated.imports,
            exports: generated.exports,
        },
    );

    return {
        jsUrl,

        files,

        imports: generated.imports,

        exports:
            generated.exports as Array<
                [
                    string,
                    "function" | "instance",
                ]
            >,

        dispose() {
            URL.revokeObjectURL(jsUrl);
        },
    };
}

/**
 * 当前 Component 的 transpile result。
 *
 * 缓存 Promise 的原因：
 * 两个调用同时进来也只 transpile 一次。
 */
async function getGeneratedBundle(): Promise<GeneratedBundle> {
    if (!generatedBundle) {
        generatedBundle =
            getComponentBytes()
                .then(transpileComponent)
                .catch((error) => {
                    /**
                     * transpile 失败允许下一次重试。
                     */
                    generatedBundle = null;

                    throw error;
                });
    }

    return generatedBundle;
}

/**
 * 换 Component 时清除旧 Jco 输出。
 */
async function replaceComponent(
    bytes: Uint8Array,
) {
    const previous = generatedBundle;

    componentBytes = bytes;

    generatedBundle = null;

    if (previous) {
        try {
            const oldBundle =
                await previous;

            oldBundle.dispose();
        } catch {
            /**
             * 旧 transpile 本来就失败的话无需处理。
             */
        }
    }
}

/**
 * 为一次 Component 调用建立独立 WASI 环境。
 *
 * 每一次 run：
 *
 * - 独立 args
 * - 独立 env
 * - 独立 stdout
 * - 独立 stderr
 * - 无 filesystem
 * - 无 network
 */
async function instantiateComponent(
    args: string[],
    env: Record<string, string>,
) {
    const stdout =
        createCaptureStream();

    const stderr =
        createCaptureStream();

    /**
     * preview2-shim 自带完整 CLI subsystem。
     *
     * 我们只覆盖：
     *
     * stdout
     * stderr
     * exit
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
            exit(
                status: {
                    tag: "ok" | "err";
                },
            ): never {
                throw new WasiExit(
                    status.tag === "ok"
                        ? 0
                        : 1,
                );
            },

            exitWithCode(
                code: number,
            ): never {
                throw new WasiExit(code);
            },
        },
    };

    const shim = new WASIShim({
        cli,

        sandbox: {
            args,
            env,

            /**
             * 默认不给 guest filesystem。
             */
            preopens: {},

            /**
             * 默认不给 guest network。
             */
            enableNetwork: false,
        },
    });

    const bundle =
        await getGeneratedBundle();

    /**
     * Jco 生成的 JS 现在是 Blob URL。
     */
    const module = await import(
        /* @vite-ignore */
        bundle.jsUrl
    );

    if (
        typeof module.instantiate
        !== "function"
    ) {
        throw new Error(
            "Generated Jco module does not export instantiate()",
        );
    }

    /**
     * Jco 生成 JS 请求 core wasm 时，
     * 直接从内存 Map 读取。
     *
     * 不再：
     *
     * fetch("/components/demo/foo.core.wasm")
     */
    async function loadCoreModule(
        path: string,
    ): Promise<WebAssembly.Module> {
        const normalized =
            normalizePath(path);

        const bytes =
            bundle.files.get(normalized);

        if (!bytes) {
            throw new Error(
                `Missing generated core Wasm module: ${path}\n` +
                    `Available files:\n` +
                    [...bundle.files.keys()]
                        .map(
                            (name) =>
                                `  - ${name}`,
                        )
                        .join("\n"),
            );
        }
      // Make an ArrayBuffer-backed copy.
        const wasmBytes =
            new Uint8Array(bytes.byteLength);

        wasmBytes.set(bytes);

        return WebAssembly.compile(
            wasmBytes,
        );
    }

    /**
     * 这一步真正把：
     *
     * Jco generated bindings
     * +
     * core wasm
     * +
     * WASI P2 Host imports
     *
     * 拼成 Component instance。
     */
    const component =
        (await module.instantiate(
            loadCoreModule,

            shim.getImportObject(),
        )) as ComponentInstance;

    return {
        component,

        stdout,
        stderr,
    };
}

/**
 * wasi:cli/run Component 执行。
 */
async function runComponent(
    args: string[],
    env: Record<string, string>,
) {
    const runtime =
        await instantiateComponent(
            args,
            env,
        );

    let exitCode = 0;

    let runtimeError:
        string | undefined;

    try {
        const run =
            runtime.component.run;

        if (
            !run
            || typeof run.run
                !== "function"
        ) {
            throw new Error(
                "Component does not export wasi:cli/run",
            );
        }

        await run.run();
    } catch (error) {
        if (
            error instanceof WasiExit
        ) {
            exitCode = error.code;
        } else {
            exitCode = 1;

            runtimeError =
                error instanceof Error
                    ? error.stack
                        ?? error.message
                    : String(error);
        }
    }

    return {
        stdout:
            runtime.stdout.finish(),

        stderr:
            runtime.stderr.finish(),

        exitCode,

        runtimeError,
    };
}

self.addEventListener(
    "message",

    async (
        event: MessageEvent<Request>,
    ) => {
        const request =
            event.data;

        try {
            /**
             * 用户上传新的 P2 Component。
             */
            if (
                request.op === "load"
            ) {
                /**
                 * 拷贝一份。
                 *
                 * 即使调用侧之后 detach ArrayBuffer，
                 * worker 内也有自己的 bytes。
                 */
                const bytes =
                    new Uint8Array(
                        request.componentBytes,
                    );

                await replaceComponent(
                    bytes,
                );

                /**
                 * load 时直接 transpile，
                 * 可以尽早把非法 Component 错误返回 UI。
                 */
                const bundle =
                    await getGeneratedBundle();

                self.postMessage({
                    id: request.id,
                    ok: true,

                    result: {
                        imports:
                            bundle.imports,

                        exports:
                            bundle.exports,

                        files:
                            [
                                ...bundle.files.keys(),
                            ],
                    },
                } satisfies Response);

                return;
            }

            /**
             * playground:demo/api.add
             *
             * 只是 demo-specific helper。
             */
            if (
                request.op === "add"
            ) {
                const runtime =
                    await instantiateComponent(
                        [],
                        {},
                    );

                const api =
                    runtime.component.api;

                if (
                    !api
                    || typeof api.add
                        !== "function"
                ) {
                    throw new Error(
                        "Component does not export playground:demo/api.add",
                    );
                }

                const value =
                    api.add(
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

            /**
             * wasi:cli/run
             */
            if (
                request.op === "run"
            ) {
                const result =
                    await runComponent(
                        request.args,
                        request.env,
                    );

                self.postMessage({
                    id: request.id,
                    ok: true,
                    result,
                } satisfies Response);

                return;
            }

            throw new Error(
                "Unknown worker operation",
            );
        } catch (error) {
            self.postMessage({
                id: request.id,

                ok: false,

                error:
                    error instanceof Error
                        ? error.stack
                            ?? error.message
                        : String(error),
            } satisfies Response);
        }
    },
);
