import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";


interface WasmTerminalProps {
  stdout?: string;
  stderr?: string;
}


export function WasmTerminal({
  stdout,
  stderr,
}: WasmTerminalProps) {
  const terminalElement = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalElement.current) return;

    const terminal = new Terminal();
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    terminal.open(terminalElement.current);
    fitAddon.fit();

    terminalRef.current = terminal;

    terminal.writeln("WASI terminal ready");

    //capture input
    const inputDisposable = terminal.onData((data) => {
    console.log("keyboard input:", data);

    // Echo what the user types
    terminal.write(data);
  });

    return () => {
      inputDisposable.dispose();
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    if (stdout) {
      terminalRef.current.writeln(stdout.replace(/\n/g, "\r\n"));
    }

    if (stderr) {
      terminalRef.current.writeln(stderr.replace(/\n/g, "\r\n"));
    }
  }, [stdout, stderr]);

  return <div ref={terminalElement} style={{ height: 400,width:"100%",textAlign:"left" }} />;
}
