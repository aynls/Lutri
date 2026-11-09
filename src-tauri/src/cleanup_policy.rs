use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

pub const DEFAULT_RETENTION_DAYS: u32 = 30;
pub const MAX_RETENTION_DAYS: u32 = 3650;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPolicy {
    pub enabled: bool,
    pub retention_days: u32,
}

impl Default for CleanupPolicy {
    fn default() -> Self {
        Self {
            enabled: false,
            retention_days: DEFAULT_RETENTION_DAYS,
        }
    }
}

pub fn validate_policy(policy: &CleanupPolicy) -> Result<(), String> {
    if !(1..=MAX_RETENTION_DAYS).contains(&policy.retention_days) {
        return Err("Invalid cleanup retention period".into());
    }
    Ok(())
}

pub fn is_protected(entry: &Value) -> bool {
    entry["favorite"] == true || entry["boardIds"].as_array().is_some_and(|boards| !boards.is_empty())
}

pub fn manual_candidate(entry: &Value, in_use: &HashSet<String>) -> bool {
    matches!(entry["source"].as_str(), Some("generated" | "imported"))
        && entry
            .get("staged")
            .is_none_or(|value| value.is_null() || value == false)
        && entry["favorite"].as_bool() == Some(false)
        && entry["boardIds"].as_array().is_some_and(Vec::is_empty)
        && entry["asset"]["id"].as_str().is_some_and(|id| !in_use.contains(id))
}

pub fn automatic_candidate(entry: &Value, policy: &CleanupPolicy, now_ms: u64, in_use: &HashSet<String>) -> bool {
    if !policy.enabled
        || validate_policy(policy).is_err()
        || entry["source"] != "generated"
        || !manual_candidate(entry, in_use)
    {
        return false;
    }
    let Some(created_at) = entry["addedAt"].as_u64() else {
        return false;
    };
    let unprotected_since = match entry.get("unprotectedSince") {
        None | Some(Value::Null) => created_at,
        Some(value) => match value.as_u64() {
            Some(timestamp) => timestamp,
            None => return false,
        },
    };
    now_ms
        .checked_sub(created_at.max(unprotected_since))
        .is_some_and(|age| age >= u64::from(policy.retention_days) * 86_400_000)
}
