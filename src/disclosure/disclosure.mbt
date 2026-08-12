///|
/// Controls whether a finding can be exported as a normal public handoff.
pub(all) enum FindingVisibility {
  PublicBug
  PrivateSecurity
} derive(Debug, Eq)

///|
pub fn FindingVisibility::to_string(self : FindingVisibility) -> String {
  match self {
    PublicBug => "public-bug"
    PrivateSecurity => "private-security"
  }
}

///|
pub(all) struct FindingHandoff {
  id : String
  repository : String
  revision : String
  title : String
  summary : String
  impact : String
  expected : String
  actual : String
  property : String
  minimal_trace : Array[String]
  action_ids : Array[String]
  evidence : Array[String]
  suggested_fix : Array[String]
  verification : Array[String]
  visibility : FindingVisibility
} derive(Debug, Eq)

///|
pub(all) struct HandoffFile {
  name : String
  content : String
} derive(Debug, Eq)

///|
pub(all) enum HandoffError {
  PublicExportBlocked(String)
} derive(Debug, Eq)

///|
fn heading(title : String) -> String {
  "# " + title + "\n\n"
}

///|
fn bullet_lines(values : Array[String]) -> String {
  if values.is_empty() {
    "- None recorded.\n"
  } else {
    let output = StringBuilder::new()
    for value in values {
      output.write_string("- ")
      output.write_string(value)
      output.write_char('\n')
    }
    output.to_string()
  }
}

///|
fn numbered_lines(values : Array[String]) -> String {
  if values.is_empty() {
    "1. No steps recorded.\n"
  } else {
    let output = StringBuilder::new()
    for index, value in values {
      output.write_object(index + 1)
      output.write_string(". `")
      output.write_string(value)
      output.write_string("`\n")
    }
    output.to_string()
  }
}

///|
fn issue_markdown(spec : FindingHandoff) -> String {
  heading(spec.title) +
  "## Summary\n\n" +
  spec.summary +
  "\n\n" +
  "## Affected revision\n\n" +
  "- Repository: `" +
  spec.repository +
  "`\n" +
  "- Revision: `" +
  spec.revision +
  "`\n\n" +
  "## Minimal reproduction\n\n" +
  numbered_lines(spec.minimal_trace) +
  "\n" +
  "## Expected behavior\n\n" +
  spec.expected +
  "\n\n" +
  "## Actual behavior\n\n" +
  spec.actual +
  "\n\n" +
  "## Impact\n\n" +
  spec.impact +
  "\n\n" +
  "## Evidence\n\n" +
  bullet_lines(spec.evidence) +
  "\n" +
  "## Suggested direction\n\n" +
  bullet_lines(spec.suggested_fix) +
  "\n" +
  "## Verification\n\n" +
  bullet_lines(spec.verification) +
  "\n" +
  "---\n\nGenerated locally by Proped. No upstream issue, pull request, comment, or commit was created.\n"
}

///|
fn reproduction_markdown(spec : FindingHandoff) -> String {
  heading("Reproduction: " + spec.title) +
  "## Property\n\n`" +
  spec.property +
  "`\n\n" +
  "## Trace\n\n" +
  numbered_lines(spec.minimal_trace) +
  "\n" +
  "## Stable action IDs\n\n" +
  bullet_lines(spec.action_ids) +
  "\n" +
  "## Expected\n\n" +
  spec.expected +
  "\n\n" +
  "## Observed\n\n" +
  spec.actual +
  "\n"
}

///|
fn fix_plan_markdown(spec : FindingHandoff) -> String {
  heading("Fix plan: " + spec.title) +
  "## Proposed changes\n\n" +
  bullet_lines(spec.suggested_fix) +
  "\n" +
  "## Required verification\n\n" +
  bullet_lines(spec.verification) +
  "\n" +
  "## Scope guard\n\nKeep the patch limited to the response/input correlation or validation boundary described above. Preserve unrelated UI and storage behavior.\n"
}

///|
fn pr_body_markdown(spec : FindingHandoff) -> String {
  heading(spec.title) +
  "## Problem\n\n" +
  spec.summary +
  "\n\n" +
  "## Change\n\n" +
  bullet_lines(spec.suggested_fix) +
  "\n" +
  "## Why\n\n" +
  spec.impact +
  "\n\n" +
  "## Tests\n\n" +
  bullet_lines(spec.verification) +
  "\n" +
  "## Reproduction before the fix\n\n" +
  numbered_lines(spec.minimal_trace) +
  "\nNo upstream pull request was created by the generator.\n"
}

///|
fn json_string(value : String) -> String {
  value.escape(quote=true)
}

///|
fn json_array(values : Array[String]) -> String {
  let output = StringBuilder::new()
  output.write_char('[')
  for index, value in values {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string(json_string(value))
  }
  output.write_char(']')
  output.to_string()
}

///|
fn machine_json(spec : FindingHandoff, private_bundle : Bool) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"schemaVersion\":1,\"id\":")
  output.write_string(json_string(spec.id))
  output.write_string(",\"repository\":")
  output.write_string(json_string(spec.repository))
  output.write_string(",\"revision\":")
  output.write_string(json_string(spec.revision))
  output.write_string(",\"title\":")
  output.write_string(json_string(spec.title))
  output.write_string(",\"visibility\":")
  output.write_string(json_string(spec.visibility.to_string()))
  output.write_string(",\"privateBundle\":")
  output.write_object(private_bundle)
  output.write_string(",\"property\":")
  output.write_string(json_string(spec.property))
  output.write_string(",\"minimalTrace\":")
  output.write_string(json_array(spec.minimal_trace))
  output.write_string(",\"actionIds\":")
  output.write_string(json_array(spec.action_ids))
  output.write_string(",\"upstreamWritePerformed\":false}")
  output.to_string()
}

///|
fn complete_files(
  spec : FindingHandoff,
  private_bundle : Bool,
) -> Array[HandoffFile] {
  let files = [
    { name: "issue.md", content: issue_markdown(spec) },
    { name: "reproduction.md", content: reproduction_markdown(spec) },
    { name: "fix-plan.md", content: fix_plan_markdown(spec) },
    { name: "pr-body.md", content: pr_body_markdown(spec) },
    { name: "machine.json", content: machine_json(spec, private_bundle) },
  ]
  if private_bundle {
    files.push({
      name: "SECURITY-NOTE.md",
      content: heading("Private security disclosure") +
      "This bundle is intentionally stored below `.private/disclosures/`, which is excluded from version control. Do not copy its detailed reproduction into public issues, commits, logs, or Atlas artifacts before coordinated disclosure.\n",
    })
  }
  files
}

///|
/// Build files suitable for a normal public issue/PR handoff. Security findings
/// are blocked before any detailed content is returned.
pub fn public_handoff_files(
  spec : FindingHandoff,
) -> Result[Array[HandoffFile], HandoffError] {
  match spec.visibility {
    PublicBug => Ok(complete_files(spec, false))
    PrivateSecurity => Err(PublicExportBlocked(spec.id))
  }
}

///|
/// Build a complete private bundle. Callers must write it only below the
/// ignored `.private/disclosures/` root.
pub fn private_handoff_files(spec : FindingHandoff) -> Array[HandoffFile] {
  complete_files(spec, true)
}

///|
/// A safe status envelope for logs and stdout. It never contains reproduction
/// details for private security findings.
pub fn safe_status_json(spec : FindingHandoff, output : String) -> String {
  let withheld = spec.visibility is PrivateSecurity
  let builder = StringBuilder::new()
  builder.write_string("{\"id\":")
  builder.write_string(json_string(spec.id))
  builder.write_string(",\"visibility\":")
  builder.write_string(json_string(spec.visibility.to_string()))
  builder.write_string(",\"detailsWithheld\":")
  builder.write_object(withheld)
  builder.write_string(",\"output\":")
  builder.write_string(json_string(output))
  builder.write_string(",\"upstreamWritePerformed\":false}")
  builder.to_string()
}
