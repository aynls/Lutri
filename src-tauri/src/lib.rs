mod assets;
mod mcp;
mod network;
mod storage;
pub mod upscale;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(storage::Store::open(app.handle())?);
            app.manage(std::sync::Arc::new(mcp::Bridge::new()?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::records_read,
            storage::records_commit,
            storage::storage_directory,
            assets::asset_import,
            assets::asset_download,
            assets::asset_data,
            assets::asset_exists,
            assets::asset_export,
            assets::assets_export,
            assets::asset_delete,
            assets::result_stage,
            network::credential_save,
            network::credential_present,
            network::credential_remove,
            network::http_request,
            network::http_stream,
            upscale::upscale_models,
            upscale::upscale_run,
            upscale::upscale_save,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_reply,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lutri");
}
