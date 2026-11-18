// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let mut startup_args = std::env::args_os().skip(1);
    if startup_args.next().as_deref() == Some(std::ffi::OsStr::new("--mcp-stdio")) {
        let Some(endpoint) = startup_args.next() else {
            eprintln!("Missing Lutri MCP endpoint file");
            std::process::exit(1);
        };
        if let Err(error) = lutri_lib::run_mcp_stdio(std::path::Path::new(&endpoint)) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--upscale-devices") {
        if let Some(path) = args.get(2) {
            lutri_lib::upscale::run_device_probe(path);
        }
        return;
    }
    if args.get(1).map(String::as_str) == Some("--upscale-worker") {
        if let Some(path) = args.get(2) {
            if let Err(error) = lutri_lib::upscale::run_worker(path) {
                eprintln!("{error}");
                std::process::exit(1);
            }
        }
        return;
    }
    lutri_lib::run()
}
