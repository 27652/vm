// src/runtime/capture.ts

import { outputStreamCreate } from "@bytecodealliance/preview2-shim/io";

export function createCaptureStream() {
    const decoder = new TextDecoder();
    let output = "";

    const stream = outputStreamCreate({
        write(bytes: Uint8Array) {
            output += decoder.decode(bytes, { stream: true });
        },
    });

    return {
        stream,

        finish() {
            output += decoder.decode();
            return output;
        },
    };
}
