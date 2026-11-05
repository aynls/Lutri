// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
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
