mod bindings {
    use super::Component;

    wit_bindgen::generate!();

    export!(Component);
}

struct Component;

impl bindings::exports::playground::demo::api::Guest for Component {
    fn add(a: u32, b: u32) -> u32 {
        a + b
    }
}

impl bindings::exports::wasi::cli::run::Guest for Component {
    fn run() -> Result<(), ()> {
        let args: Vec<String> = std::env::args().collect();

        let demo_env =
            std::env::var("DEMO_ENV").unwrap_or_else(|_| "<unset>".to_string());

        println!("args={}", args.join(","));
        println!("DEMO_ENV={demo_env}");

        eprintln!("message-from-stderr");

        if args.iter().any(|arg| arg == "--exit1") {
            std::process::exit(1);
        }

        Ok(())
    }
}

