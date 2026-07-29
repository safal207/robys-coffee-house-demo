use liminalqa_core::{
    decision::{DecisionEngine, SuiteDecision, TestDecision, TestSignals},
    triage::TriageVerdict,
};
use serde::{Deserialize, Serialize};
use std::{env, fs, path::Path};

#[derive(Debug, Deserialize)]
struct InputPacket {
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
}

#[derive(Debug, Serialize)]
struct EvidenceRecord {
    name: String,
    evidence: String,
}

#[derive(Debug, Serialize)]
struct OutputPacket {
    schema: &'static str,
    source_engine: &'static str,
    source_revision: &'static str,
    tested_commit: String,
    scope: String,
    suite_decision: SuiteDecision,
    test_decisions: Vec<TestDecision>,
    evidence: Vec<EvidenceRecord>,
}

fn parse_verdict(value: &str) -> Result<TriageVerdict, String> {
    match value {
        "stable" => Ok(TriageVerdict::Stable),
        "flake" => Ok(TriageVerdict::Flake),
        "known_issue" => Ok(TriageVerdict::KnownIssue),
        "new_bug" => Ok(TriageVerdict::NewBug),
        other => Err(format!("unsupported LiminalQA verdict: {other}")),
    }
}

fn assert_probability(name: &str, field: &str, value: f64) -> Result<(), String> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(format!("{name}: {field} must be between 0 and 1, got {value}"))
    }
}

fn markdown(packet: &OutputPacket) -> String {
    let mut output = String::new();
    output.push_str("# LiminalQA decision packet — Roby's\n\n");
    output.push_str(&format!("- Tested commit: `{}`\n", packet.tested_commit));
    output.push_str(&format!("- Scope: {}\n", packet.scope));
    output.push_str(&format!("- Merge policy: **{}**\n", packet.suite_decision.merge_policy));
    output.push_str(&format!("- Confidence: **{:.0}%**\n", packet.suite_decision.confidence * 100.0));
    if !packet.suite_decision.block_reason.is_empty() {
        output.push_str(&format!("- Reason: {}\n", packet.suite_decision.block_reason));
    }

    output.push_str("\n| Signal | Verdict | Policy | Action | Severity | Confidence |\n");
    output.push_str("|---|---|---|---|---|---:|\n");
    for decision in &packet.test_decisions {
        output.push_str(&format!(
            "| `{}` | {} | {} | {} | {} | {:.0}% |\n",
            decision.name,
            decision.verdict,
            decision.merge_policy,
            decision.recommended_action,
            decision.severity,
            decision.confidence * 100.0
        ));
    }

    output.push_str("\n## Evidence and causal hints\n");
    for (decision, evidence) in packet.test_decisions.iter().zip(&packet.evidence) {
        output.push_str(&format!("\n### `{}`\n\n", decision.name));
        output.push_str(&format!("Evidence: {}\n", evidence.evidence));
        for hint in &decision.root_cause_hints {
            output.push_str(&format!("- LiminalQA: {}\n", hint));
        }
        if decision.root_cause_hints.is_empty() {
            output.push_str("- LiminalQA: no causal warning generated.\n");
        }
    }

    output.push_str("\n## Interpretation boundary\n\n");
    output.push_str("This packet is advisory. Browser, security and performance contracts remain the source of truth. LiminalQA classifies the evidence and merge risk; it does not convert a failing test into a passing test.\n");
    output
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let input_path = env::args().nth(1).unwrap_or_else(|| "qa/liminal/robys-signals.json".into());
    let output_dir = env::args().nth(2).unwrap_or_else(|| "qa/liminal-artifacts".into());
    let tested_commit = env::var("ROBY_TESTED_COMMIT").unwrap_or_else(|_| "unknown".into());
    let source_revision = env::var("LIMINALQA_REVISION").unwrap_or_else(|_| "unknown".into());

    let input: InputPacket = serde_json::from_str(&fs::read_to_string(&input_path)?)?;
    if input.tests.is_empty() {
        return Err("LiminalQA input must contain at least one signal".into());
    }

    let mut decisions = Vec::with_capacity(input.tests.len());
    let mut evidence = Vec::with_capacity(input.tests.len());

    for signal in input.tests {
        assert_probability(&signal.name, "stability", signal.stability)?;
        assert_probability(&signal.name, "flake_probability", signal.flake_probability)?;
        assert_probability(&signal.name, "flake_score", signal.flake_score)?;
        if signal.run_count == 0 {
            return Err(format!("{}: run_count must be greater than zero", signal.name).into());
        }

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
        evidence.push(EvidenceRecord { name: signal.name, evidence: signal.evidence });
    }

    let suite_decision = DecisionEngine::evaluate_suite(&input.suite, &decisions);
    let packet = OutputPacket {
        schema: "robys.liminalqa.decision.v1",
        source_engine: "safal207/LiminalQAengineer::liminalqa-core::DecisionEngine",
        source_revision: Box::leak(source_revision.into_boxed_str()),
        tested_commit,
        scope: input.scope,
        suite_decision,
        test_decisions: decisions,
        evidence,
    };

    fs::create_dir_all(&output_dir)?;
    fs::write(Path::new(&output_dir).join("decision.json"), format!("{}\n", serde_json::to_string_pretty(&packet)?))?;
    fs::write(Path::new(&output_dir).join("decision.md"), markdown(&packet))?;

    println!("LiminalQA merge policy: {}", packet.suite_decision.merge_policy);
    println!("Decision artifacts written to {output_dir}");
    Ok(())
}
