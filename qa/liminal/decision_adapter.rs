use liminalqa_core::{
    decision::{DecisionEngine, SuiteDecision, TestDecision, TestSignals},
    evaluate_suite_strict,
    triage::TriageVerdict,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    env, fs,
    io::{Error, ErrorKind, Read},
    path::{Component, Path, PathBuf},
};

const INPUT_SCHEMA: &str = "robys.liminalqa.input.v2";
const OUTPUT_SCHEMA: &str = "robys.liminalqa.decision.v2";

#[derive(Debug, Deserialize)]
struct InputPacket {
    schema: String,
    tested_commit: String,
    source_run_id: String,
    generated_at: String,
    suite: String,
    scope: String,
    tests: Vec<InputSignal>,
}

#[derive(Debug, Deserialize)]
struct InputSignal {
    name: String,
    verdict: String,
    stability: f64,
    flake_probability: f64,
    flake_score: f64,
    run_count: usize,
    evidence: String,
    evidence_path: String,
    evidence_sha256: String,
    evidence_bytes: u64,
}

#[derive(Debug, Serialize)]
struct EvidenceRecord {
    name: String,
    statement: String,
    path: String,
    bytes: u64,
    sha256: String,
    verified: bool,
}

#[derive(Debug, Serialize)]
struct OutputPacket {
    schema: &'static str,
    input_schema: &'static str,
    source_engine: &'static str,
    source_revision: String,
    source_run_id: String,
    generated_at: String,
    tested_commit: String,
    scope: String,
    suite_decision: SuiteDecision,
    test_decisions: Vec<TestDecision>,
    evidence: Vec<EvidenceRecord>,
}

fn invalid_data(message: impl Into<String>) -> Error {
    Error::new(ErrorKind::InvalidData, message.into())
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_commit_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn parse_verdict(value: &str) -> Result<TriageVerdict, Error> {
    match value {
        "stable" => Ok(TriageVerdict::Stable),
        "flake" => Ok(TriageVerdict::Flake),
        "known_issue" => Ok(TriageVerdict::KnownIssue),
        "new_bug" => Ok(TriageVerdict::NewBug),
        other => Err(invalid_data(format!("unsupported LiminalQA verdict: {other}"))),
    }
}

fn assert_probability(name: &str, field: &str, value: f64) -> Result<(), Error> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(invalid_data(format!(
            "{name}: {field} must be between 0 and 1, got {value}"
        )))
    }
}

fn safe_relative_path(value: &str) -> Result<PathBuf, Error> {
    let path = Path::new(value);
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err(invalid_data(format!(
            "evidence path must be a non-empty relative path: {value:?}"
        )));
    }
    if path.components().any(|component| !matches!(component, Component::Normal(_))) {
        return Err(invalid_data(format!(
            "evidence path contains an unsafe component: {value:?}"
        )));
    }
    Ok(path.to_path_buf())
}

fn file_sha256(path: &Path) -> Result<(u64, String), Error> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(invalid_data(format!(
            "evidence is not a regular file: {}",
            path.display()
        )));
    }

    let mut file = fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut hashed_bytes: u64 = 0;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hashed_bytes += read as u64;
        digest.update(&buffer[..read]);
    }
    Ok((hashed_bytes, format!("{:x}", digest.finalize())))
}

fn verify_evidence(root: &Path, signal: &InputSignal) -> Result<EvidenceRecord, Error> {
    if !valid_sha256(&signal.evidence_sha256) {
        return Err(invalid_data(format!(
            "{}: evidence_sha256 must be 64 hexadecimal characters",
            signal.name
        )));
    }

    let relative = safe_relative_path(&signal.evidence_path)?;
    let joined = root.join(&relative);
    let symlink_metadata = fs::symlink_metadata(&joined)?;
    if symlink_metadata.file_type().is_symlink() {
        return Err(invalid_data(format!(
            "{}: symlink evidence is not allowed: {}",
            signal.name,
            relative.display()
        )));
    }

    let canonical_root = fs::canonicalize(root)?;
    let canonical_file = fs::canonicalize(&joined)?;
    if !canonical_file.starts_with(&canonical_root) {
        return Err(invalid_data(format!(
            "{}: evidence path escapes the evidence root: {}",
            signal.name,
            relative.display()
        )));
    }

    let (actual_bytes, actual_sha256) = file_sha256(&canonical_file)?;
    if actual_bytes != signal.evidence_bytes {
        return Err(invalid_data(format!(
            "{}: evidence byte mismatch for {}: expected {}, got {}",
            signal.name,
            relative.display(),
            signal.evidence_bytes,
            actual_bytes
        )));
    }
    if actual_sha256 != signal.evidence_sha256.to_ascii_lowercase() {
        return Err(invalid_data(format!(
            "{}: evidence SHA-256 mismatch for {}",
            signal.name,
            relative.display()
        )));
    }

    Ok(EvidenceRecord {
        name: signal.name.clone(),
        statement: signal.evidence.clone(),
        path: relative.to_string_lossy().replace('\\', "/"),
        bytes: actual_bytes,
        sha256: actual_sha256,
        verified: true,
    })
}

fn markdown(packet: &OutputPacket) -> String {
    let mut output = String::new();
    output.push_str("# LiminalQA decision packet — Roby's\n\n");
    output.push_str(&format!("- Tested commit: `{}`\n", packet.tested_commit));
    output.push_str(&format!("- Source run: `{}`\n", packet.source_run_id));
    output.push_str(&format!("- Generated: `{}`\n", packet.generated_at));
    output.push_str(&format!("- LiminalQA revision: `{}`\n", packet.source_revision));
    output.push_str(&format!("- Scope: {}\n", packet.scope));
    output.push_str(&format!(
        "- Merge policy: **{}**\n",
        packet.suite_decision.merge_policy
    ));
    output.push_str(&format!(
        "- Confidence: **{:.0}%**\n",
        packet.suite_decision.confidence * 100.0
    ));
    if !packet.suite_decision.block_reason.is_empty() {
        output.push_str(&format!(
            "- Reason: {}\n",
            packet.suite_decision.block_reason
        ));
    }

    output.push_str("\n| Signal | Verdict | Policy | Action | Severity | Confidence | Evidence |\n");
    output.push_str("|---|---|---|---|---|---:|---|\n");
    for (decision, evidence) in packet.test_decisions.iter().zip(&packet.evidence) {
        output.push_str(&format!(
            "| `{}` | {} | {} | {} | {} | {:.0}% | `{}` / `{}` |\n",
            decision.name,
            decision.verdict,
            decision.merge_policy,
            decision.recommended_action,
            decision.severity,
            decision.confidence * 100.0,
            evidence.path,
            evidence.sha256
        ));
    }

    output.push_str("\n## Evidence and causal hints\n");
    for (decision, evidence) in packet.test_decisions.iter().zip(&packet.evidence) {
        output.push_str(&format!("\n### `{}`\n\n", decision.name));
        output.push_str(&format!("Evidence: {}\n", evidence.statement));
        output.push_str(&format!(
            "Verified file: `{}` ({} bytes, SHA-256 `{}`).\n",
            evidence.path, evidence.bytes, evidence.sha256
        ));
        for hint in &decision.root_cause_hints {
            output.push_str(&format!("- LiminalQA: {}\n", hint));
        }
        if decision.root_cause_hints.is_empty() {
            output.push_str("- LiminalQA: no causal warning generated.\n");
        }
    }

    output.push_str("\n## Interpretation boundary\n\n");
    output.push_str("This packet is advisory. Every accepted signal is bound to the exact checked head and an independently re-hashed evidence file. Browser, security and performance contracts remain the source of truth. LiminalQA classifies supplied evidence and never converts a failed or missing check into success.\n");
    output
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input_path = env::args()
        .nth(1)
        .unwrap_or_else(|| "qa/liminal-artifacts/input-signals.json".into());
    let output_dir = env::args()
        .nth(2)
        .unwrap_or_else(|| "qa/liminal-artifacts".into());
    let evidence_root = env::var("ROBY_EVIDENCE_ROOT").unwrap_or_else(|_| output_dir.clone());
    let expected_commit = env::var("ROBY_TESTED_COMMIT")?;
    let expected_run_id = env::var("ROBY_SOURCE_RUN_ID")?;
    let source_revision = env::var("LIMINALQA_REVISION")?;

    if !valid_commit_sha(&expected_commit) {
        return Err(invalid_data("ROBY_TESTED_COMMIT must be an exact 40-character SHA").into());
    }
    if expected_run_id.trim().is_empty() {
        return Err(invalid_data("ROBY_SOURCE_RUN_ID must not be empty").into());
    }
    if !valid_commit_sha(&source_revision) {
        return Err(invalid_data("LIMINALQA_REVISION must be an exact 40-character SHA").into());
    }

    let input: InputPacket = serde_json::from_str(&fs::read_to_string(&input_path)?)?;
    if input.schema != INPUT_SCHEMA {
        return Err(invalid_data(format!(
            "unsupported input schema: expected {INPUT_SCHEMA}, got {}",
            input.schema
        ))
        .into());
    }
    if input.tested_commit != expected_commit {
        return Err(invalid_data(format!(
            "stale or cross-head input: packet={}, expected={expected_commit}",
            input.tested_commit
        ))
        .into());
    }
    if input.source_run_id != expected_run_id {
        return Err(invalid_data(format!(
            "cross-run input: packet={}, expected={expected_run_id}",
            input.source_run_id
        ))
        .into());
    }
    if input.generated_at.trim().is_empty() || !input.generated_at.contains('T') {
        return Err(invalid_data("generated_at must be a non-empty ISO-like timestamp").into());
    }
    if input.scope.trim().is_empty() || !input.scope.contains(&expected_commit) {
        return Err(invalid_data("scope must identify the exact tested commit").into());
    }
    if input.tests.is_empty() {
        return Err(invalid_data("LiminalQA input must contain at least one signal").into());
    }

    let evidence_root = PathBuf::from(evidence_root);
    fs::create_dir_all(&evidence_root)?;
    let mut names = HashSet::new();
    let mut decisions = Vec::with_capacity(input.tests.len());
    let mut evidence = Vec::with_capacity(input.tests.len());

    for signal in &input.tests {
        if !names.insert(signal.name.clone()) {
            return Err(invalid_data(format!("duplicate signal name: {}", signal.name)).into());
        }
        assert_probability(&signal.name, "stability", signal.stability)?;
        assert_probability(
            &signal.name,
            "flake_probability",
            signal.flake_probability,
        )?;
        assert_probability(&signal.name, "flake_score", signal.flake_score)?;
        if signal.run_count == 0 {
            return Err(invalid_data(format!(
                "{}: run_count must be greater than zero",
                signal.name
            ))
            .into());
        }

        let verified_evidence = verify_evidence(&evidence_root, signal)?;
        let verdict = parse_verdict(&signal.verdict)?;
        let decision = DecisionEngine::evaluate_test(TestSignals {
            name: &signal.name,
            suite: &input.suite,
            verdict,
            stability: signal.stability,
            flake_probability: signal.flake_probability,
            flake_score: signal.flake_score,
            trend: None,
            baseline: None,
            run_count: signal.run_count,
        });
        decisions.push(decision);
        evidence.push(verified_evidence);
    }

    let suite_decision = evaluate_suite_strict(&input.suite, &decisions);
    let packet = OutputPacket {
        schema: OUTPUT_SCHEMA,
        input_schema: INPUT_SCHEMA,
        source_engine: "safal207/LiminalQAengineer::liminalqa-core::evaluate_suite_strict",
        source_revision,
        source_run_id: input.source_run_id,
        generated_at: input.generated_at,
        tested_commit: input.tested_commit,
        scope: input.scope,
        suite_decision,
        test_decisions: decisions,
        evidence,
    };

    fs::create_dir_all(&output_dir)?;
    fs::write(
        Path::new(&output_dir).join("decision.json"),
        format!("{}\n", serde_json::to_string_pretty(&packet)?),
    )?;
    fs::write(
        Path::new(&output_dir).join("decision.md"),
        markdown(&packet),
    )?;

    println!(
        "LiminalQA merge policy: {}",
        packet.suite_decision.merge_policy
    );
    println!("Decision artifacts written to {output_dir}");
    Ok(())
}
