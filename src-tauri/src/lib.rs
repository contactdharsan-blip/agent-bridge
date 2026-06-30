//! Agent Bridge Tauri application entry point.

mod commands;

use commands::AppState;

/// Build and run the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::list_agents,
            commands::start_session,
            commands::send_prompt,
            commands::resolve_permission,
            commands::cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Agent Bridge");
}
