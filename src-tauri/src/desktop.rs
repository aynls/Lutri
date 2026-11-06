use crate::{storage::Store, upscale::Scheduler};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

pub struct Desktop {
    background: AtomicBool,
    exiting: AtomicBool,
    open: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn request_exit(app: &tauri::AppHandle) {
    if let Some(desktop) = app.try_state::<Desktop>() {
        if desktop.exiting.swap(true, Ordering::SeqCst) {
            return;
        }
    }
    if app.emit_to("main", "desktop-exit-request", ()).is_err() {
        if let Some(scheduler) = app.try_state::<Scheduler>() {
            scheduler.shutdown();
        }
        app.exit(0);
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        Some(vec!["--background"]),
    ))?;
    let open = MenuItem::with_id(app, "open", "Open Lutri", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("lutri")
        .menu(&menu)
        .tooltip("Lutri")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "quit" => request_exit(app),
            _ => (),
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    let tray = tray.build(app)?;
    let body = app
        .state::<Store>()
        .db
        .lock()
        .ok()
        .and_then(|db| {
            db.query_row(
                "SELECT body FROM records WHERE collection='preferences' AND id='preferences'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|body| serde_json::from_str::<Value>(&body).ok())
        .unwrap_or(json!({}));
    let background = body["desktop"]["background"].as_bool().unwrap_or(false);
    tray.set_visible(background)?;
    app.manage(Desktop {
        background: AtomicBool::new(background),
        exiting: AtomicBool::new(false),
        open,
        quit,
    });
    if let Some(window) = app.get_webview_window("main") {
        if background && std::env::args().any(|arg| arg == "--background") {
            window.hide()?;
        }
        let handle = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(desktop) = handle.try_state::<Desktop>() {
                    api.prevent_close();
                    if desktop.background.load(Ordering::SeqCst) {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    } else {
                        request_exit(&handle);
                    }
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_configure(
    app: tauri::AppHandle,
    background: bool,
    launch_at_login: bool,
    open_label: String,
    quit_label: String,
) -> Result<(), String> {
    if launch_at_login && !background {
        return Err("Background mode is required for launch at login".into());
    }
    let desktop = app.state::<Desktop>();
    if launch_at_login {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    }
    .map_err(|e| e.to_string())?;
    desktop.background.store(background, Ordering::SeqCst);
    desktop.open.set_text(open_label).map_err(|e| e.to_string())?;
    desktop.quit.set_text(quit_label).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("lutri") {
        tray.set_visible(background).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_zoom(app: tauri::AppHandle, zoom: f64) -> Result<(), String> {
    if !(0.5..=2.0).contains(&zoom) {
        return Err("Invalid interface scale".into());
    }
    for (_, window) in app.webview_windows() {
        window.set_zoom(zoom).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn desktop_shutdown(app: tauri::AppHandle) {
    if let Some(scheduler) = app.try_state::<Scheduler>() {
        scheduler.shutdown();
    }
    app.exit(0);
}
