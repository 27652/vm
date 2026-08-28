fn main() {
    println!("hello from wasm");

    for (key, value) in std::env::vars() {
        println!("env: {key}={value}");
    }

    for arg in std::env::args() {
        println!("arg: {arg}");
    }

    eprintln!("this is stderr");
}

