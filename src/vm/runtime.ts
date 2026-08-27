
import{init,runWasix} from "@wasmer/sdk"

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

    console.log("crossOriginIsolated:", crossOriginIsolated);
    const module = await WebAssembly.compile(new Uint8Array(wasm));
    console.log("WASM compiled successfully");
    console.log("imports:", WebAssembly.Module.imports(module));
    console.log("exports:", WebAssembly.Module.exports(module));


    const instance = await runWasix(module,{
        program:"program",
        args:options.args??[],
        env:options.env??{},
    })

    console.log("WASIX instance started");

    const result = await instance.wait()

    return{
        code:result.code,
        stdout:result.stdout,
        stderr:result.stderr
    };



}