mod assets;
mod clipboard;
mod desktop;
mod library;
mod mcp;
mod network;
mod result_cleanup;
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
            app.manage(clipboard::Clipboard::default());
            app.manage(storage::Store::open(app.handle())?);
            for directory in ["assets", "thumbnails"] {
                app.asset_protocol_scope()
                    .allow_directory(app.state::<storage::Store>().library_root()?.join(directory), true)?;
            }
            app.manage(std::sync::Arc::new(mcp::Bridge::new()?));
            app.manage(upscale::Scheduler::default());
            desktop::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::records_read,
            storage::records_commit,
            storage::storage_directory,
            storage::library_migrate,
            library::gallery_query,
            library::gallery_ids,
            library::gallery_entries,
            library::gallery_facets,
            library::gallery_backfill_provenance,
            library::gallery_mutate,
            library::gallery_cleanup,
            library::asset_provenance,
            library::asset_copy,
            library::asset_paste,
            library::assets_publish,
            library::staging_purge,
            library::asset_auto_export,
            library::library_stats,
            library::library_maintain,
            assets::asset_import,
            assets::mask_save,
            assets::asset_download,
            assets::asset_data,
            assets::asset_exists,
            assets::asset_export,
            assets::assets_export,
            assets::asset_delete,
            assets::result_stage,
            result_cleanup::result_discard,
            network::credential_save,
            network::credential_present,
            network::credential_remove,
            network::credential_check,
            network::http_request,
            network::http_stream,
            upscale::upscale_models,
            upscale::upscale_run,
            upscale::upscale_save,
            upscale::upscale_export,
            upscale::upscale_configure,
            upscale::upscale_devices,
            upscale::upscale_cancel,
            upscale::upscale_jobs,
            desktop::desktop_configure,
            desktop::desktop_zoom,
            desktop::desktop_shutdown,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_reply,
            mcp::mcp_get_token,
            mcp::mcp_rotate_token,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lutri")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<clipboard::Clipboard>().close();
            }
        });
}
