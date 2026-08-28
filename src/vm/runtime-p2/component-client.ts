// src/runtime/component-client.ts

export type RunResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
    runtimeError?: string;
};

export function createComponentClient() {
    const worker = new Worker(
        new URL("./component.worker.ts", import.meta.url),
        { type: "module" },
    );

    let nextId = 1;

    const pending = new Map<
        number,
        {
            resolve(value: unknown): void;
            reject(error: Error): void;
        }
    >();

    worker.addEventListener("message", (event) => {
        const message = event.data;

        const request = pending.get(message.id);

        if (!request) {
            return;
        }

        pending.delete(message.id);

        if (message.ok) {
            request.resolve(message.result);
        } else {
            request.reject(new Error(message.error));
        }
    });

    function call<T>(
        payload: Record<string, unknown>,
    ): Promise<T> {
        const id = nextId++;

        return new Promise<T>((resolve, reject) => {
            pending.set(id, {
                resolve: resolve as (value: unknown) => void,
                reject,
            });

            worker.postMessage({
                id,
                ...payload,
            });
        });
    }

    return {
        add(a: number, b: number) {
            return call<number>({
                op: "add",
                a,
                b,
            });
        },

        run(
            args: string[],
            env: Record<string, string>,
        ) {
            return call<RunResult>({
                op: "run",
                args,
                env,
            });
        },

        dispose() {
            worker.terminate();
        },
    };
}
