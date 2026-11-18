mod assets;
mod batch;
mod cleanup_policy;
mod clipboard;
mod desktop;
mod layers;
mod library;
mod local_resources;
mod mcp;
mod network;
mod psd;
mod result_cleanup;
mod storage;
pub mod upscale;

use tauri::Manager;

pub use mcp::stdio::run as run_mcp_stdio;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show_main_window(app)
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
            app.manage(std::sync::Arc::new(mcp::Bridge::default()));
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
            library::gallery_delete_board,
            local_resources::local_files_query,
            local_resources::local_files_delete,
            local_resources::local_files_cleanup,
            library::asset_provenance,
            library::asset_copy,
            library::asset_paste,
            library::assets_publish,
            library::staging_purge,
            library::asset_auto_export,
            library::library_stats,
            library::library_maintain,
            layers::layer_directory_available,
            layers::layer_result_save,
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
            network::writer_discover_efforts,
            network::http_request,
            network::http_stream,
            batch::batch_input_append,
            batch::batch_upload,
            batch::batch_output_fetch,
            batch::batch_output_read,
            batch::batch_files_remove,
            upscale::upscale_models,
            upscale::upscale_run,
            upscale::upscale_export,
            upscale::upscale_configure,
            upscale::upscale_devices,
            upscale::upscale_cancel,
            upscale::upscale_jobs,
            desktop::desktop_configure,
            desktop::desktop_zoom,
            desktop::desktop_shutdown,
            mcp::mcp_register,
            mcp::mcp_start,
            mcp::mcp_status,
            mcp::mcp_stop,
            mcp::mcp_set_stdio_enabled,
            mcp::mcp_stdio_config,
            mcp::mcp_reply,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Lutri")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => app.state::<clipboard::Clipboard>().close(),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => desktop::show_main_window(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
                desktop::request_exit(app);
            }
            _ => (),
        });
}
