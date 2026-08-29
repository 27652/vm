// src/App.tsx

import {
    useEffect,
    useRef,
    useState,
} from "react";

import "./App.css";

import {
    createComponentClient,
    type ComponentClient,
    type LoadResult,
} from "./vm/runtime/runtime-p2/component-client";

import {
    WasmTerminal,
} from "./ui/terminal";

function parseArgs(
    value: string,
): string[] {
    return value
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseEnv(
    value: string,
): Record<string, string> {
    const result:
        Record<string, string> = {};

    for (
        const rawLine
        of value.split("\n")
    ) {
        const line =
            rawLine.trim();

        if (!line) {
            continue;
        }

        const index =
            line.indexOf("=");

        if (index === -1) {
            throw new Error(
                `Invalid env: "${line}". Expected KEY=value`,
            );
        }

        const key =
            line
                .slice(0, index)
                .trim();

        const envValue =
            line.slice(index + 1);

        if (!key) {
            throw new Error(
                `Invalid env: "${line}"`,
            );
        }

        result[key] = envValue;
    }

    return result;
}

function App() {
    const clientRef =
        useRef<ComponentClient | null>(
            null,
        );

    const [fileName, setFileName] =
        useState(
            "built-in p2_demo.wasm",
        );

    const [
        componentInfo,
        setComponentInfo,
    ] =
        useState<LoadResult | null>(
            null,
        );

    const [args, setArgs] =
        useState(
            "p2-demo hello",
        );

    const [env, setEnv] =
        useState(
            "DEMO_ENV=browser",
        );

    const [stdout, setStdout] =
        useState("");

    const [stderr, setStderr] =
        useState("");

    const [
        exitCode,
        setExitCode,
    ] =
        useState<number | null>(
            null,
        );

    const [status, setStatus] =
        useState("Ready");

    const [busy, setBusy] =
        useState(false);

    /**
     * 一个 App 生命周期只创建一个 Worker。
     */
    useEffect(() => {
        const client =
            createComponentClient();

        clientRef.current =
            client;

        return () => {
            client.dispose();

            clientRef.current =
                null;
        };
    }, []);

    async function loadFile(
        file: File,
    ) {
        const client =
            clientRef.current;

        if (!client) {
            return;
        }

        setBusy(true);

        setStatus(
            `Loading ${file.name}...`,
        );

        setStdout("");
        setStderr("");
        setExitCode(null);

        try {
            const buffer =
                await file.arrayBuffer();

            /**
             * Worker 内：
             *
             * P2 wasm
             *   ↓
             * Jco
             *   ↓
             * JS + core wasm
             */
            const info =
                await client.load(
                    buffer,
                );

            setFileName(
                file.name,
            );

            setComponentInfo(
                info,
            );

            setStatus(
                "Component loaded",
            );

            console.log(
                "P2 component:",
                info,
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            setStatus(
                "Load failed",
            );

            setStderr(
                message,
            );
        } finally {
            setBusy(false);
        }
    }

    async function run() {
        const client =
            clientRef.current;

        if (!client) {
            return;
        }

        setBusy(true);

        setStatus(
            "Running...",
        );

        /**
         * terminal.tsx 是 append 模式，
         * 这里先清一下 React state。
         */
        setStdout("");
        setStderr("");
        setExitCode(null);

        try {
            const result =
                await client.run(
                    parseArgs(args),
                    parseEnv(env),
                );

            setStdout(
                result.stdout,
            );

            let finalStderr =
                result.stderr;

            if (
                result.runtimeError
            ) {
                finalStderr +=
                    `${
                        finalStderr
                            ? "\n"
                            : ""
                    }${result.runtimeError}`;
            }

            setStderr(
                finalStderr,
            );

            setExitCode(
                result.exitCode,
            );

            setStatus(
                `Finished with exit code ${result.exitCode}`,
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            setStatus(
                "Runtime failed",
            );

            setStderr(
                message,
            );

            setExitCode(1);
        } finally {
            setBusy(false);
        }
    }

    async function testAdd() {
        const client =
            clientRef.current;

        if (!client) {
            return;
        }

        setBusy(true);

        try {
            const value =
                await client.add(
                    20,
                    22,
                );

            setStdout(
                `api.add(20, 22) = ${value}\n`,
            );

            setStatus(
                "API call succeeded",
            );
        } catch (error) {
            setStderr(
                error instanceof Error
                    ? error.message
                    : String(error),
            );

            setStatus(
                "API call failed",
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <section
                id="center"
                style={{
                    padding: 32,
                }}
            >
                <div>
                    <h1>
                        WASI P2 VM
                    </h1>

                    <p>
                        Browser-side
                        Component Model
                        runtime
                    </p>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection:
                            "column",
                        gap: 16,
                        width: "min(700px, 100%)",
                        textAlign:
                            "left",
                    }}
                >
                    <label>
                        <div>
                            P2 Component
                        </div>

                        <input
                            type="file"
                            accept=".wasm,application/wasm"
                            disabled={
                                busy
                            }
                            onChange={(
                                event,
                            ) => {
                                const file =
                                    event
                                        .target
                                        .files?.[0];

                                if (file) {
                                    void loadFile(
                                        file,
                                    );
                                }
                            }}
                        />
                    </label>

                    <div>
                        Loaded:{" "}
                        <code>
                            {
                                fileName
                            }
                        </code>
                    </div>

                    <label>
                        <div>
                            Arguments
                        </div>

                        <input
                            value={
                                args
                            }
                            disabled={
                                busy
                            }
                            onChange={(
                                event,
                            ) =>
                                setArgs(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            style={{
                                width: "100%",
                                boxSizing:
                                    "border-box",
                                padding: 8,
                            }}
                        />
                    </label>

                    <label>
                        <div>
                            Environment
                        </div>

                        <textarea
                            value={
                                env
                            }
                            disabled={
                                busy
                            }
                            onChange={(
                                event,
                            ) =>
                                setEnv(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            rows={4}
                            placeholder={
                                "DEMO_ENV=browser\nFOO=bar"
                            }
                            style={{
                                width: "100%",
                                boxSizing:
                                    "border-box",
                                padding: 8,
                            }}
                        />
                    </label>

                    <div
                        style={{
                            display:
                                "flex",
                            gap: 12,
                            alignItems:
                                "center",
                        }}
                    >
                        <button
                            type="button"
                            className="counter"
                            disabled={
                                busy
                            }
                            onClick={() =>
                                void run()
                            }
                        >
                            Run
                        </button>

                        <button
                            type="button"
                            className="counter"
                            disabled={
                                busy
                            }
                            onClick={() =>
                                void testAdd()
                            }
                        >
                            Test
                            add(20,
                            22)
                        </button>

                        <span>
                            {status}
                        </span>
                    </div>

                    {exitCode !==
                        null && (
                        <div>
                            Exit code:{" "}
                            <code>
                                {
                                    exitCode
                                }
                            </code>
                        </div>
                    )}

                    {componentInfo && (
                        <details>
                            <summary>
                                Component
                                information
                            </summary>

                            <pre
                                style={{
                                    overflowX:
                                        "auto",
                                }}
                            >
                                {JSON.stringify(
                                    componentInfo,
                                    null,
                                    2,
                                )}
                            </pre>
                        </details>
                    )}
                </div>
            </section>

            <div className="ticks" />

            <WasmTerminal
                stdout={stdout}
                stderr={stderr}
            />

            <div className="ticks" />

            <section
                id="spacer"
            />
        </>
    );
}

export default App;
