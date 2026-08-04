///|
struct CliArgs {
  json : Bool
  output : String
  positionals : Array[String]
  help : Bool
  error : String?
}

///|
struct RunSummary {
  id : String
  output : String
  schema_version : Int
  seed : Int
  states : Int
  transitions : Int
  failures : Int
  diagnostics : Int
}

///|
fn json_string(value : String) -> String {
  value.escape(quote=true)
}

///|
fn parse_args(raw : Array[String]) -> CliArgs {
  let positionals : Array[String] = []
  let mut json = false
  let mut output = "demo/out"
  let mut help = false
  let mut error : String? = None
  let mut index = 1
  while index < raw.length() {
    let argument = raw[index]
    if argument == "--json" {
      json = true
    } else if argument == "--output" {
      if index + 1 >= raw.length() {
        error = Some("--output requires a directory")
      } else {
        index = index + 1
        output = raw[index]
      }
    } else if argument == "--help" || argument == "-h" {
      help = true
    } else if argument.has_prefix("-") {
      error = Some("unknown option: \{argument}")
    } else {
      positionals.push(argument)
    }
    index = index + 1
  }
  { json, output, positionals, help, error }
}

///|
fn print_help() -> Unit {
  println("Proped Rabbita CLI 0.2.0")
  println("")
  println("Usage:")
  println("  moon run src/cli -- <command> [arguments] [--json] [--output DIR]")
  println("")
  println("Commands:")
  println(
    "  schema                     Print the machine-readable command contract",
  )
  println("  version                    Print the CLI version")
  println("  demo list                  List runnable demos")
  println(
    "  demo describe <id>         Describe one demo and its deterministic defaults",
  )
  println(
    "  demo run <id|all>          Generate HTML, SVG, JSON, DOT, and summary artifacts",
  )
  println("")
  println("Demo IDs:")
  println("  newsletter                 Native Proped Rabbita form example")
  println(
    "  rabbita-counter            Vendored Rabbita official counter example",
  )
  println("")
  println("Exit codes: 0 success, 2 usage error, 3 property failure")
}

///|
fn schema_json() -> String {
  "{\"name\":\"proped-rabbita\",\"version\":\"0.2.0\",\"commands\":[{\"argv\":[\"schema\"],\"output\":\"command-contract-json\"},{\"argv\":[\"version\"],\"output\":\"version\"},{\"argv\":[\"demo\",\"list\"],\"flags\":[\"--json\"]},{\"argv\":[\"demo\",\"describe\",\"<id>\"],\"flags\":[\"--json\"]},{\"argv\":[\"demo\",\"run\",\"<id|all>\"],\"flags\":[\"--json\",\"--output <dir>\"],\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}],\"demoIds\":[\"newsletter\",\"rabbita-counter\"],\"exitCodes\":{\"0\":\"success\",\"2\":\"usage_error\",\"3\":\"property_failure\"}}"
}

///|
fn demo_list_json() -> String {
  "{\"ok\":true,\"command\":\"demo list\",\"demos\":[{\"id\":\"newsletter\",\"origin\":\"project\",\"description\":\"Newsletter form with validation, consent, submit, and reset states\"},{\"id\":\"rabbita-counter\",\"origin\":\"vendored\",\"description\":\"Rabbita official counter adapted for finite deterministic exploration\",\"upstreamRevision\":\"67e8169efa1bb2e8bd17018b62b41211cbc4c357\"}]}"
}

///|
fn demo_description_json(id : String) -> String? {
  if id == "newsletter" {
    Some(
      "{\"ok\":true,\"command\":\"demo describe\",\"demo\":{\"id\":\"newsletter\",\"origin\":\"project\",\"model\":\"email, consented, submitted\",\"actions\":[\"set-email\",\"toggle-consent\",\"submit\",\"reset\"],\"defaults\":{\"cases\":24,\"maxDepth\":8,\"maxStates\":64,\"seed\":7,\"shrinkBudget\":1024},\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}}",
    )
  } else if id == "rabbita-counter" {
    Some(
      "{\"ok\":true,\"command\":\"demo describe\",\"demo\":{\"id\":\"rabbita-counter\",\"origin\":\"vendored\",\"upstream\":\"moonbit-community/rabbita examples/counter\",\"upstreamRevision\":\"67e8169efa1bb2e8bd17018b62b41211cbc4c357\",\"model\":\"integer bounded to [-3,3] for exploration\",\"actions\":[\"inc\",\"dec\"],\"defaults\":{\"cases\":32,\"maxDepth\":10,\"maxStates\":16,\"seed\":11,\"shrinkBudget\":256},\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}}",
    )
  } else {
    None
  }
}

///|
fn print_demo_description(id : String) -> Bool {
  if id == "newsletter" {
    println("id: newsletter")
    println("origin: project")
    println("model: email, consented, submitted")
    println("actions: set-email, toggle-consent, submit, reset")
    println(
      "defaults: cases=24 max-depth=8 max-states=64 seed=7 shrink-budget=1024",
    )
    true
  } else if id == "rabbita-counter" {
    println("id: rabbita-counter")
    println("origin: vendored moonbit-community/rabbita examples/counter")
    println("upstream-revision: 67e8169efa1bb2e8bd17018b62b41211cbc4c357")
    println("model: integer bounded to [-3,3] for finite exploration")
    println("actions: inc, dec")
    println(
      "defaults: cases=32 max-depth=10 max-states=16 seed=11 shrink-budget=256",
    )
    true
  } else {
    false
  }
}

///|
fn summary_to_json(summary : RunSummary) -> String {
  "{\"id\":\{json_string(summary.id)},\"ok\":\{summary.failures == 0},\"output\":\{json_string(summary.output)},\"schemaVersion\":\{summary.schema_version},\"seed\":\{summary.seed},\"states\":\{summary.states},\"transitions\":\{summary.transitions},\"failures\":\{summary.failures},\"diagnostics\":\{summary.diagnostics},\"artifacts\":[\"atlas.html\",\"atlas.svg\",\"atlas.json\",\"atlas.dot\",\"summary.json\"]}"
}

///|
async fn write_report_files(
  output_dir : String,
  report : @proped.RunReport,
) -> Unit {
  if !@fs.exists(output_dir) {
    @fs.mkdir(output_dir, recursive=true)
  }
  @fs.write_file(
    "\{output_dir}/atlas.html",
    @proped.report_to_html(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.svg",
    @proped.report_to_flow_svg(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.json",
    @proped.report_to_json(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  @fs.write_file(
    "\{output_dir}/atlas.dot",
    @proped.report_to_dot(report),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
}

///|
async fn run_newsletter(output_root : String) -> RunSummary {
  let report = @proped.run(
    @newsletter.machine(),
    @newsletter.properties(),
    @newsletter.default_config(),
  )
  let output = "\{output_root}/newsletter"
  write_report_files(output, report)
  let summary : RunSummary = {
    id: "newsletter",
    output,
    schema_version: report.schema_version,
    seed: report.seed,
    states: report.states.length(),
    transitions: report.transitions.length(),
    failures: report.failures.length(),
    diagnostics: report.diagnostics.length(),
  }
  @fs.write_file(
    "\{output}/summary.json",
    summary_to_json(summary),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  summary
}

///|
async fn run_counter(output_root : String) -> RunSummary {
  let report = @proped.run(
    @counter.machine(),
    @counter.properties(),
    @counter.default_config(),
  )
  let output = "\{output_root}/rabbita-counter"
  write_report_files(output, report)
  let summary : RunSummary = {
    id: "rabbita-counter",
    output,
    schema_version: report.schema_version,
    seed: report.seed,
    states: report.states.length(),
    transitions: report.transitions.length(),
    failures: report.failures.length(),
    diagnostics: report.diagnostics.length(),
  }
  @fs.write_file(
    "\{output}/summary.json",
    summary_to_json(summary),
    create_mode=@fs.CreateMode::CreateOrTruncate,
  )
  summary
}

///|
fn summaries_json(summaries : Array[RunSummary]) -> String {
  let output = StringBuilder::new()
  output.write_string("{\"ok\":")
  let mut ok = true
  for summary in summaries {
    if summary.failures > 0 {
      ok = false
    }
  }
  output.write_object(ok)
  output.write_string(",\"command\":\"demo run\",\"runs\":[")
  for index, summary in summaries {
    if index > 0 {
      output.write_char(',')
    }
    output.write_string(summary_to_json(summary))
  }
  output.write_string("]}")
  output.to_string()
}

///|
fn print_summaries(summaries : Array[RunSummary]) -> Unit {
  for summary in summaries {
    let status = if summary.failures == 0 { "ok" } else { "failed" }
    println(
      "\{summary.id} \{status} states=\{summary.states} transitions=\{summary.transitions} failures=\{summary.failures} diagnostics=\{summary.diagnostics} output=\{summary.output}",
    )
  }
}

///|
fn usage_error(message : String, json : Bool) -> Unit {
  if json {
    println(
      "{\"ok\":false,\"error\":{\"code\":\"usage_error\",\"message\":\{json_string(message)}}}",
    )
  } else {
    println("error: \{message}")
  }
  @sys.exit(2)
}

///|
async fn main {
  let parsed = parse_args(@env.args())
  match parsed.error {
    Some(message) => {
      usage_error(message, parsed.json)
      return
    }
    None => ()
  }
  let args = parsed.positionals
  if parsed.help ||
    args.length() == 0 ||
    (args.length() == 1 && args[0] == "help") {
    print_help()
    return
  }
  if args[0] == "version" {
    if args.length() != 1 {
      usage_error("version does not accept positional arguments", parsed.json)
      return
    }
    if parsed.json {
      println("{\"ok\":true,\"version\":\"0.2.0\"}")
    } else {
      println("proped-rabbita 0.2.0")
    }
    return
  }
  if args[0] == "schema" {
    if args.length() != 1 {
      usage_error("schema does not accept positional arguments", parsed.json)
      return
    }
    println(schema_json())
    return
  }
  if args[0] != "demo" || args.length() < 2 {
    usage_error("unknown command; use help or schema", parsed.json)
    return
  }
  if args[1] == "list" {
    if args.length() != 2 {
      usage_error("demo list does not accept positional arguments", parsed.json)
      return
    }
    if parsed.json {
      println(demo_list_json())
    } else {
      println("newsletter\tproject\tNewsletter form state exploration")
      println(
        "rabbita-counter\tvendored\tOfficial Rabbita counter state exploration",
      )
    }
    return
  }
  if args[1] == "describe" {
    if args.length() != 3 {
      usage_error("demo describe requires exactly one demo id", parsed.json)
      return
    }
    let id = args[2]
    if parsed.json {
      match demo_description_json(id) {
        Some(description) => println(description)
        None => {
          usage_error("unknown demo id: \{id}", true)
          return
        }
      }
    } else if !print_demo_description(id) {
      usage_error("unknown demo id: \{id}", false)
      return
    }
    return
  }
  if args[1] != "run" || args.length() != 3 {
    usage_error(
      "use demo list, demo describe <id>, or demo run <id|all>",
      parsed.json,
    )
    return
  }
  let id = args[2]
  let summaries : Array[RunSummary] = []
  if id == "newsletter" {
    summaries.push(run_newsletter(parsed.output))
  } else if id == "rabbita-counter" {
    summaries.push(run_counter(parsed.output))
  } else if id == "all" {
    summaries.push(run_newsletter(parsed.output))
    summaries.push(run_counter(parsed.output))
  } else {
    usage_error("unknown demo id: \{id}", parsed.json)
    return
  }
  if parsed.json {
    println(summaries_json(summaries))
  } else {
    print_summaries(summaries)
  }
  for summary in summaries {
    if summary.failures > 0 {
      @sys.exit(3)
    }
  }
}
