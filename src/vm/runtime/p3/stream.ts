import emitStdout from "@xterm/xterm";//wait for 


export async function writeViaStream(
    stream: ReadableStream<number>
){
    const reader = stream.getReader();
    try{
        for(;;)
        {const{done,value}=await reader.read();
        if(done)break;
        // send to terninal ui
        emitStdout(value);
    }
    return {tag: "ok", val : undefined};
    }catch{return{tag:"err",val:/*error code */ 99}}
}