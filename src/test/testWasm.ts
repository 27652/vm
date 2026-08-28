import {runWasm} from "../vm/runtime";

export async function testRuntime() {
  const response = await fetch("/code/p1/main.wasm");
  const buffer = await response.arrayBuffer();
  const wasm = new Uint8Array(buffer);

  const result = await runWasm(wasm, {
    args: ["one", "two"],
    env: {
      NAME: "Alice",
    },
  });

  console.log("exit code:", result.code);
  console.log("stdout:", result.stdout);
  console.log("stderr:", result.stderr);
  return result
}
