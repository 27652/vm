
import { init } from "@wasmer/wasi";
import { Buffer } from "buffer";




Object.assign(globalThis, { Buffer });

export interface RunOptions {
    args?: string[];
    env?:Record<string, string>;
}

export interface RunResult{
    code: number;
    stdout: string;
    stderr: string;
}

let initializePromise :Promise<void>|null=null;

export async function initializeVM(){




   if (!initializePromise) {
    initializePromise = init().then(()=>undefined).catch(error=>{
        initializePromise=null;
        throw error;
    });
  }

  await initializePromise;
}


export async function runWasm(
    wasm: Uint8Array,
    options:RunOptions={}
):Promise<RunResult>{
    await initializeVM();


    const { WASI } = await import("@wasmer/wasi");

    console.log("crossOriginIsolated:", crossOriginIsolated);
    const module = await WebAssembly.compile(new Uint8Array(wasm));
    console.log("WASM compiled successfully");
    console.log("imports:", WebAssembly.Module.imports(module));
    console.log("exports:", WebAssembly.Module.exports(module));


  const wasi = new WASI({
    args: ["program", ...(options.args ?? [])],
    env: options.env ?? {},
  });

    console.log("WASI instance started");

  const instance = wasi.instantiate(module, {});

  const code = wasi.start(instance);

  return {
    code,
    stdout: wasi.getStdoutString(),
    stderr: wasi.getStderrString(),
  };
}