//! ACP client host — the 🔴 transport core, isolated behind a narrow contract.
//!
//! The public surface is deliberately tiny: the [`AcpHost`] trait and the plain
//! data types in [`contract`]. Real transport lives in private modules and must
//! never leak `agent_client_protocol` types past this boundary.
//!
//! - [`FakeAcpHost`] — scripted, transport-free; for UI/IPC development.

pub mod contract;
mod fake;
mod host;
pub mod registry;
mod translate;

pub use contract::{
    AcpHost, AcpHostError, AdapterSpec, AgentEvent, Decision, ErrorKind, PermissionReqId,
    SessionConfig, SessionId, StopReason,
};
pub use fake::FakeAcpHost;
pub use host::AcpHostHandle;
pub use registry::{adapter_for, known_agents, AgentInfo};

/// Small helpers shared by unit tests across modules.
#[cfg(test)]
pub(crate) mod test_support {
    use crate::contract::{AdapterSpec, SessionConfig};

    /// A throwaway [`SessionConfig`] for tests that don't spawn anything.
    pub fn dummy_config() -> SessionConfig {
        SessionConfig {
            cwd: std::env::temp_dir(),
            adapter: AdapterSpec {
                command: "true".into(),
                args: vec![],
                env: vec![],
            },
        }
    }
}
