//! Agent Bridge Tauri application entry point.

mod commands;
mod doctor;
mod engines;
mod native_config;
mod terminal;

use commands::AppState;

/// Build and run the Tauri application.
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Runtime shell (acp-host).
            commands::list_agents,
            commands::start_session,
            commands::send_prompt,
            commands::resolve_permission,
            commands::cancel,
            // Pure engines (projection / handoff / profile / secrets).
            engines::preview_mcp,
            engines::check_drift,
            engines::preview_instructions,
            engines::build_handoff_brief,
            engines::validate_profile,
            engines::merge_profiles,
            engines::recommend_features,
            engines::workflow_continuity,
            engines::gap_fills_for,
            engines::audit_secret_bindings,
            engines::parse_native_mcp,
            // Native config file I/O (FR24 disk writes, FR26 import wizard).
            native_config::read_native_file,
            native_config::write_native_file,
            // Local diagnostics (FR32).
            doctor::run_doctor,
            // One-click open-native-login (FR47).
            terminal::open_agent_login_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Agent Bridge");
}
