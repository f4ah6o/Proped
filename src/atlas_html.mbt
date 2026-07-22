///|
fn atlas_html_escape(value : String) -> String {
  let output = StringBuilder::new()
  for char in value {
    match char {
      '&' => output.write_string("&amp;")
      '<' => output.write_string("&lt;")
      '>' => output.write_string("&gt;")
      '"' => output.write_string("&quot;")
      '\'' => output.write_string("&#39;")
      _ => output.write_char(char)
    }
  }
  output.to_string()
}

///|
fn atlas_html_write_stat(
  output : StringBuilder,
  label : String,
  value : Int,
) -> Unit {
  output.write_string("<div class=\"stat\"><dt>")
  output.write_string(atlas_html_escape(label))
  output.write_string("</dt><dd>")
  output.write_object(value)
  output.write_string("</dd></div>")
}

///|
/// Render a static, human-facing Flow Canvas atlas report.
pub fn report_to_html(report : RunReport) -> String {
  let svg = report_to_flow_svg(report)
  let unique_edges = atlas_aggregate_transitions(report).length()
  let output = StringBuilder::new()
  output.write_string(
    (
      #|<!doctype html>
      #|<html lang="en">
      #|<head>
      #|<meta charset="utf-8">
      #|<meta name="viewport" content="width=device-width,initial-scale=1">
      #|<title>Proped Rabbita Atlas</title>
      #|<style>
      #|:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#eef2f6;color-scheme:light}
      #|*{box-sizing:border-box}
      #|body{max-width:1440px;margin:0 auto;padding:32px;color:#172033;background:#eef2f6;line-height:1.5}
      #|header,.panel{border:1px solid #d7dee8;border-radius:14px;background:#fff;box-shadow:0 5px 20px #1720330c}
      #|header{padding:24px 28px;background:#101827;color:#f8fafc}
      #|h1{margin:0;font-size:28px;letter-spacing:-.03em}
      #|h2{margin:0 0 12px;font-size:18px;letter-spacing:-.02em}
      #|header p{margin:6px 0 0;color:#cbd5e1}
      #|main{display:grid;gap:20px;margin-top:20px}
      #|.panel{padding:24px}
      #|.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:0}
      #|.stat{padding:12px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc}
      #|dt{color:#64748b;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
      #|dd{margin:3px 0 0;color:#172033;font-size:22px;font-weight:800}
      #|.graph{overflow:auto;padding:16px;background:#f8fafc;border-radius:10px}
      #|.graph svg{display:block;min-width:640px;max-width:none}
      #|.failure-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}
      #|.failure{padding:14px;border:1px solid #fecaca;border-radius:9px;background:#fff1f2}
      #|.failure h3{margin:0;color:#7f1d1d;font-size:14px}
      #|.failure p{margin:5px 0 0;color:#991b1b}
      #|.failure code,.trace{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
      #|.failure-meta{margin-top:10px;color:#991b1b;font-size:12px}
      #|.trace{margin:6px 0 0;padding-left:20px;color:#7f1d1d}
      #|.success{padding:12px;border:1px solid #bbf7d0;border-radius:9px;color:#166534;background:#f0fdf4}
      #|.links{display:flex;flex-wrap:wrap;gap:12px;margin:0;padding:0;list-style:none}
      #|a{color:#1d4ed8;font-weight:700}
      #|footer{margin-top:20px;color:#64748b;font-size:12px}
      #|@media(max-width:640px){body{padding:16px}.panel,header{padding:18px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
      #|</style>
      #|</head>
      #|<body>
      #|<header><h1>Proped Rabbita Atlas</h1><p>Static Flow Canvas report for the explored UI state graph.</p></header>
      #|<main>
      #|<section class="panel" aria-labelledby="overview-title"><h2 id="overview-title">Overview</h2><dl class="stats">
    ),
  )
  atlas_html_write_stat(output, "Seed", report.seed)
  atlas_html_write_stat(output, "Cases", report.cases)
  atlas_html_write_stat(output, "Steps", report.steps)
  atlas_html_write_stat(output, "States", report.states.length())
  atlas_html_write_stat(output, "Raw transitions", report.transitions.length())
  atlas_html_write_stat(output, "Unique edges", unique_edges)
  atlas_html_write_stat(output, "Property failures", report.failures.length())
  output.write_string("</dl></section>")
  output.write_string(
    (
      #|<section class="panel" aria-labelledby="graph-title"><h2 id="graph-title">Flow Canvas</h2><div class="graph">
    ),
  )
  output.write_string(svg)
  output.write_string("</div></section>")
  output.write_string(
    (
      #|<section class="panel" aria-labelledby="failure-title"><h2 id="failure-title">Property failures</h2>
    ),
  )
  if report.failures.is_empty() {
    output.write_string(
      "<p class=\"success\">All generated traces satisfied the configured properties.</p>",
    )
  } else {
    output.write_string("<ul class=\"failure-list\">")
    for failure in report.failures {
      output.write_string("<li class=\"failure\"><h3>")
      output.write_string(atlas_html_escape(failure.property))
      output.write_string("</h3><p>")
      output.write_string(atlas_html_escape(failure.message))
      output.write_string("</p><div class=\"failure-meta\">State: <code>")
      output.write_string(atlas_html_escape(failure.state_id))
      output.write_string("</code></div>")
      if failure.trace.is_empty() {
        output.write_string(
          "<div class=\"failure-meta\">Minimized trace: none</div>",
        )
      } else {
        output.write_string(
          "<div class=\"failure-meta\">Minimized trace:</div><ol class=\"trace\">",
        )
        for action in failure.trace {
          output.write_string("<li>")
          output.write_string(atlas_html_escape(action))
          output.write_string("</li>")
        }
        output.write_string("</ol>")
      }
      output.write_string("</li>")
    }
    output.write_string("</ul>")
  }
  output.write_string(
    (
      #|</section>
      #|<section class="panel" aria-labelledby="artifacts-title"><h2 id="artifacts-title">Artifacts</h2><ul class="links">
      #|<li><a href="atlas.json">atlas.json</a></li>
      #|<li><a href="atlas.dot">atlas.dot</a></li>
      #|</ul></section>
      #|</main>
      #|<footer>Human-facing static report. JSON and DOT remain machine-oriented artifacts.</footer>
      #|</body>
      #|</html>
    ),
  )
  output.to_string()
}
