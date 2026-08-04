///|
fn fixture(visibility : FindingVisibility) -> FindingHandoff {
  {
    id: "fixture",
    repository: "owner/repository",
    revision: "0123456789012345678901234567890123456789",
    title: "Reject stale response",
    summary: "A stale response can replace newer state.",
    impact: "The UI can present data for the wrong selection.",
    expected: "Only the latest response is applied.",
    actual: "An older response is applied after a newer request.",
    property: "stale responses are rejected",
    minimal_trace: ["Select(A)", "Select(B)", "Response(A)"],
    action_ids: ["select:a", "select:b", "response:a"],
    evidence: ["3-action minimized trace"],
    suggested_fix: ["Correlate responses with request IDs."],
    verification: ["Add a reverse-order response regression test."],
    visibility,
  }
}

///|
test "public handoff includes issue reproduction and PR drafts" {
  let files = public_handoff_files(fixture(PublicBug)).unwrap()
  assert_eq(files.length(), 5)
  assert_true(files.any(file => file.name == "issue.md"))
  assert_true(files.any(file => file.name == "pr-body.md"))
  let issue = files.filter(file => file.name == "issue.md").get(0).unwrap().content
  assert_true(issue.contains("No upstream issue"))
  assert_true(issue.contains("Response(A)"))
}

///|
test "security finding cannot be exported through public path" {
  match public_handoff_files(fixture(PrivateSecurity)) {
    Err(PublicExportBlocked(id)) => assert_eq(id, "fixture")
    _ => fail("private security finding was not blocked")
  }
}

///|
test "private security status withholds details" {
  let spec = fixture(PrivateSecurity)
  let status = safe_status_json(spec, ".private/disclosures/fixture")
  assert_true(status.contains("\"detailsWithheld\":true"))
  assert_true(!status.contains("Response(A)"))
  let files = private_handoff_files(spec)
  assert_true(files.any(file => file.name == "SECURITY-NOTE.md"))
}
