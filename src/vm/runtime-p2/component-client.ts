// src/vm/runtime-p2/component-client.ts

export type RunResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
    runtimeError?: string;
};

export type LoadResult = {
    imports: string[];
    exports: Array<
        [
            string,
            "function" | "instance",
        ]
    >;
    files: string[];
};

type WorkerResponse =
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

export function createComponentClient() {
    const worker = new Worker(
        new URL(
            "./component.worker.ts",
            import.meta.url,
        ),
        {
            type: "module",
        },
    );

    let nextId = 1;

    const pending = new Map<
        number,
        {
            resolve(value: unknown): void;
            reject(error: Error): void;
        }
    >();

    worker.addEventListener(
        "message",
        (
            event: MessageEvent<WorkerResponse>,
        ) => {
            const message = event.data;

            const request =
                pending.get(message.id);

            if (!request) {
                return;
            }

            pending.delete(message.id);

            if (message.ok==true) {
                request.resolve(
                    message.result,
                );
            } else {
                request.reject(
                    new Error(
                        message.error,
                    ),
                );
            }
        },
    );

    /**
     * Worker 自身加载失败、
     * bundler 错误之类不会经过正常 RPC，
     * 所以单独处理。
     */
    worker.addEventListener(
        "error",
        (event) => {
            const error =
                new Error(
                    event.message ||
                        "P2 worker failed",
                );

            for (
                const request
                of pending.values()
            ) {
                request.reject(error);
            }

            pending.clear();
        },
    );

    function call<T>(
        payload: Record<
            string,
            unknown
        >,
        transfer: Transferable[] = [],
    ): Promise<T> {
        const id = nextId++;

        return new Promise<T>(
            (resolve, reject) => {
                pending.set(id, {
                    resolve:
                        resolve as (
                            value: unknown,
                        ) => void,
                    reject,
                });

                worker.postMessage(
                    {
                        id,
                        ...payload,
                    },
                    transfer,
                );
            },
        );
    }

    return {
        /**
         * 加载用户上传的 WASI P2 Component。
         *
         * Worker 会执行：
         *
         * component wasm
         *   ↓
         * Jco generate
         *   ↓
         * JS + core wasm
         */
        load(
            componentBytes: ArrayBuffer,
        ) {
            /**
             * 做一份独立 copy。
             *
             * postMessage transferable 后
             * 这个 ArrayBuffer 会 detach，
             * 不影响调用侧原来的 buffer。
             */
            const bytes =
                componentBytes.slice(0);

            return call<LoadResult>(
                {
                    op: "load",
                    componentBytes: bytes,
                },
                [bytes],
            );
        },

        /**
         * 当前 demo 专用：
         *
         * playground:demo/api.add
         */
        add(
            a: number,
            b: number,
        ) {
            return call<number>({
                op: "add",
                a,
                b,
            });
        },

        /**
         * 执行 wasi:cli/run。
         */
        run(
            args: string[] = [],
            env: Record<
                string,
                string
            > = {},
        ) {
            return call<RunResult>({
                op: "run",
                args,
                env,
            });
        },

        dispose() {
            worker.terminate();

            const error =
                new Error(
                    "Component client disposed",
                );

            for (
                const request
                of pending.values()
            ) {
                request.reject(error);
            }

            pending.clear();
        },
    };
}

export type ComponentClient =
    ReturnType<
        typeof createComponentClient
    >;
