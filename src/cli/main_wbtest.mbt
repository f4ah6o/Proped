///|
test "CLI parsing skips executable and accepts machine flags anywhere" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--json", "--output", "artifacts",
  ])
  assert_true(parsed.json)
  assert_true(!parsed.help)
  assert_eq(parsed.output, "artifacts")
  assert_eq(parsed.positionals, ["demo", "run", "all"])
  assert_eq(parsed.error, None)
}

///|
test "CLI parsing treats help as a global flag" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--help",
  ])
  assert_true(parsed.help)
  assert_eq(parsed.positionals, ["demo", "run", "all"])
  assert_eq(parsed.error, None)
}

///|
test "CLI parsing reports a missing output directory" {
  let parsed = parse_args([
    "/tmp/proped-rabbita", "demo", "run", "all", "--output",
  ])
  assert_eq(parsed.error, Some("--output requires a directory"))
}

///|
test "CLI parsing rejects unknown options" {
  let parsed = parse_args(["/tmp/proped-rabbita", "demo", "list", "--yaml"])
  assert_eq(parsed.error, Some("unknown option: --yaml"))
}

///|
test "command schema exposes demos artifacts and exit codes" {
  let schema = schema_json()
  assert_true(schema.contains("rabbita-counter"))
  assert_true(schema.contains("summary.json"))
  assert_true(schema.contains("property_failure"))
}

///|
test "run summaries are stable machine-readable envelopes" {
  let summary : RunSummary = {
    id: "example",
    output: "demo/out/example",
    schema_version: 2,
    seed: 7,
    states: 3,
    transitions: 5,
    failures: 0,
    diagnostics: 0,
  }
  let json = summaries_json([summary])
  assert_true(json.contains("\"ok\":true"))
  assert_true(json.contains("\"states\":3"))
  assert_true(json.contains("atlas.json"))
}
