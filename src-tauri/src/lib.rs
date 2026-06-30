//! Agent Bridge Tauri application entry point.

mod commands;
mod engines;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Agent Bridge");
}
