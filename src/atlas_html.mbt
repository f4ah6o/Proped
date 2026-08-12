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
  en : String,
  ja : String,
  value : Int,
) -> Unit {
  output.write_string("<div class=\"stat\"><dt><span data-lang=\"en\">")
  output.write_string(atlas_html_escape(en))
  output.write_string("</span><span data-lang=\"ja\" hidden>")
  output.write_string(atlas_html_escape(ja))
  output.write_string("</span></dt><dd>")
  output.write_object(value)
  output.write_string("</dd></div>")
}

///|
fn atlas_html_write_dependencies(
  output : StringBuilder,
  dependencies : Array[String],
) -> Unit {
  if dependencies.is_empty() {
    output.write_string("<span class=\"muted\">none</span>")
  } else {
    output.write_string("<ul class=\"compact-list\">")
    for dependency in dependencies {
      output.write_string("<li><code>")
      output.write_string(atlas_html_escape(dependency))
      output.write_string("</code></li>")
    }
    output.write_string("</ul>")
  }
}

///|
fn atlas_html_write_transition_link(
  output : StringBuilder,
  id : String,
  transition : AtlasTransition,
) -> Unit {
  output.write_string(
    "<li><button class=\"transition-link\" type=\"button\" data-select-edge=\"",
  )
  output.write_string(atlas_html_escape(id))
  output.write_string("\"><code>")
  output.write_string(atlas_html_escape(transition.action_id))
  output.write_string("</code> ")
  output.write_string(atlas_html_escape(transition.action))
  output.write_string(" <span class=\"muted\">")
  output.write_string(atlas_html_escape(transition.from))
  output.write_string(" → ")
  output.write_string(atlas_html_escape(transition.to))
  output.write_string("</span></button></li>")
}

///|
fn atlas_html_write_state_transitions(
  output : StringBuilder,
  state_id : String,
  transitions : Array[AtlasTransition],
  incoming : Bool,
) -> Unit {
  let mut count = 0
  output.write_string("<ul class=\"compact-list transition-list\">")
  for index, transition in transitions {
    let matches = if incoming {
      transition.to == state_id
    } else {
      transition.from == state_id
    }
    if matches {
      atlas_html_write_transition_link(
        output,
        "transition-\{index}",
        transition,
      )
      count = count + 1
    }
  }
  if count == 0 {
    output.write_string("<li class=\"muted\">none</li>")
  }
  output.write_string("</ul>")
}

///|
fn atlas_html_write_state_failures(
  output : StringBuilder,
  report : RunReport,
  state_id : String,
) -> Unit {
  let mut count = 0
  output.write_string("<ul class=\"compact-list\">")
  for failure in report.failures {
    if failure.state_id == state_id {
      count = count + 1
      output.write_string("<li><strong>")
      output.write_string(atlas_html_escape(failure.property))
      output.write_string("</strong><div class=\"muted\">")
      output.write_string(atlas_html_escape(failure.message))
      output.write_string("</div></li>")
    }
  }
  if count == 0 {
    output.write_string("<li class=\"muted\">none</li>")
  }
  output.write_string("</ul>")
}

///|
fn atlas_html_write_failure_trace(
  output : StringBuilder,
  failure : FailureReport,
) -> Unit {
  if failure.trace.is_empty() {
    output.write_string("<span class=\"muted\">none</span>")
  } else {
    output.write_string("<ol class=\"trace\">")
    for action in failure.trace {
      output.write_string("<li>")
      output.write_string(atlas_html_escape(action))
      output.write_string("</li>")
    }
    output.write_string("</ol>")
  }
}

///|
/// Render an interactive, human-facing Atlas backed by the same FlowGraph used
/// for standalone SVG output. Machine-oriented JSON and DOT contracts remain
/// unchanged.
pub fn report_to_html(report : RunReport) -> String {
  let svg = report_to_flow_svg(report)
  let transitions = atlas_aggregate_transitions(report)
  let failing_edges = atlas_failure_transition_indices(report, transitions)
  let output = StringBuilder::new()
  output.write_string(
    (
      #|<!doctype html>
      #|<html lang="en">
      #|<head>
      #|<meta charset="utf-8">
      #|<meta name="viewport" content="width=device-width,initial-scale=1">
      #|<title>Proped Atlas</title>
      #|<style>
      #|:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#eef2f6;color-scheme:light}
      #|*{box-sizing:border-box}
      #|body{max-width:1600px;margin:0 auto;padding:32px;color:#172033;background:#eef2f6;line-height:1.5}
      #|header,.panel{border:1px solid #d7dee8;border-radius:14px;background:#fff;box-shadow:0 5px 20px #1720330c}
      #|header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:24px 28px;background:#101827;color:#f8fafc}
      #|h1{margin:0;font-size:28px;letter-spacing:-.03em}
      #|h2{margin:0 0 12px;font-size:18px;letter-spacing:-.02em}
      #|h3{margin:18px 0 7px;font-size:14px}
      #|header p{margin:6px 0 0;color:#cbd5e1}
      #|main{display:grid;gap:20px;margin-top:20px}
      #|.panel{padding:24px}
      #|.toolbar{display:flex;gap:6px;flex:0 0 auto}
      #|button{font:inherit}
      #|.locale-button{border:1px solid #64748b;border-radius:8px;padding:6px 10px;color:#e2e8f0;background:#1e293b;cursor:pointer}
      #|.locale-button[aria-pressed="true"]{border-color:#93c5fd;color:#0f172a;background:#dbeafe}
      #|.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:0}
      #|.stat{padding:12px;border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc}
      #|dt{color:#64748b;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
      #|dd{margin:3px 0 0;color:#172033;font-size:22px;font-weight:800}
      #|.workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,1fr);gap:18px;align-items:start}
      #|.graph{overflow:auto;min-height:360px;padding:16px;background:#f8fafc;border-radius:10px}
      #|.graph svg{display:block;min-width:640px;max-width:none}
      #|.graph [data-flow-node],.graph [data-flow-edge]{cursor:pointer;outline:none}
      #|.graph [data-flow-node]:focus-visible rect{stroke:#7c3aed;stroke-width:4}
      #|.graph [data-flow-edge]:focus-visible .flow-edge{stroke:#7c3aed;stroke-width:4}
      #|.graph .flow-node.is-selected rect{stroke:#1d4ed8;stroke-width:4;filter:drop-shadow(0 3px 5px #1d4ed844)}
      #|.graph .flow-edge-group.is-selected .flow-edge{stroke:#1d4ed8;stroke-width:4;stroke-dasharray:none}
      #|.inspector{position:sticky;top:16px;max-height:78vh;overflow:auto;padding:18px;border:1px solid #dbe3ee;border-radius:10px;background:#f8fafc}
      #|.inspector-card{padding-top:2px}
      #|.inspector-card[hidden], [data-lang][hidden]{display:none!important}
      #|.selection-kind{display:inline-block;margin-bottom:8px;padding:2px 7px;border-radius:999px;color:#1e3a8a;background:#dbeafe;font-size:11px;font-weight:800;text-transform:uppercase}
      #|.metadata{display:grid;grid-template-columns:minmax(100px,auto) minmax(0,1fr);gap:7px 12px;margin:0}
      #|.metadata dt{align-self:start}
      #|.metadata dd{min-width:0;margin:0;font-size:13px;font-weight:500;overflow-wrap:anywhere}
      #|.preview{width:100%;min-height:180px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}
      #|.compact-list{margin:0;padding-left:20px;font-size:13px}
      #|.transition-list{padding:0;list-style:none}
      #|.transition-link{width:100%;padding:6px 8px;border:1px solid transparent;border-radius:7px;text-align:left;color:#1d4ed8;background:transparent;cursor:pointer}
      #|.transition-link:hover{border-color:#bfdbfe;background:#eff6ff}
      #|.muted{color:#64748b;font-size:12px}
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
      #|@media(max-width:900px){.workspace{grid-template-columns:1fr}.inspector{position:static;max-height:none}}
      #|@media(max-width:640px){body{padding:16px}.panel,header{padding:18px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}header{display:block}.toolbar{margin-top:16px}}
      #|</style>
      #|</head>
      #|<body>
      #|<header><div><h1>Proped Atlas</h1><p><span data-lang="en">Interactive Flow Canvas report for the explored UI state graph.</span><span data-lang="ja" hidden>探索したUI状態グラフの対話型Flow Canvasレポートです。</span></p></div><div class="toolbar" role="group" aria-label="Language"><button class="locale-button" type="button" data-locale="en" aria-pressed="true">English</button><button class="locale-button" type="button" data-locale="ja" aria-pressed="false">日本語</button></div></header>
      #|<main>
      #|<section class="panel" aria-labelledby="overview-title"><h2 id="overview-title"><span data-lang="en">Overview</span><span data-lang="ja" hidden>概要</span></h2><dl class="stats">
    ),
  )
  atlas_html_write_stat(output, "Seed", "シード", report.seed)
  atlas_html_write_stat(output, "Cases", "ケース", report.cases)
  atlas_html_write_stat(output, "Steps", "ステップ", report.steps)
  atlas_html_write_stat(output, "States", "状態", report.states.length())
  atlas_html_write_stat(
    output,
    "Raw transitions",
    "生の遷移",
    report.transitions.length(),
  )
  atlas_html_write_stat(
    output,
    "Unique edges",
    "一意なエッジ",
    transitions.length(),
  )
  atlas_html_write_stat(
    output,
    "Property failures",
    "プロパティ失敗",
    report.failures.length(),
  )
  atlas_html_write_stat(
    output,
    "Diagnostics",
    "診断",
    report.diagnostics.length(),
  )
  output.write_string(
    (
      #|</dl></section>
      #|<section class="panel" aria-labelledby="graph-title"><h2 id="graph-title"><span data-lang="en">Flow Canvas and Inspector</span><span data-lang="ja" hidden>Flow CanvasとInspector</span></h2><div class="workspace"><div class="graph">
    ),
  )
  output.write_string(svg)
  output.write_string(
    (
      #|</div><aside class="inspector" aria-live="polite"><h2><span data-lang="en">Inspector</span><span data-lang="ja" hidden>インスペクター</span></h2><p id="inspector-empty" class="muted"><span data-lang="en">Select a state or transition.</span><span data-lang="ja" hidden>状態または遷移を選択してください。</span></p>
    ),
  )
  for state in report.states {
    output.write_string(
      "<article class=\"inspector-card\" data-detail-kind=\"node\" data-detail-id=\"",
    )
    output.write_string(atlas_html_escape(state.id))
    output.write_string(
      "\" hidden><span class=\"selection-kind\"><span data-lang=\"en\">State</span><span data-lang=\"ja\" hidden>状態</span></span><h3>",
    )
    output.write_string(atlas_html_escape(state.id))
    output.write_string("</h3><iframe class=\"preview\" sandbox title=\"")
    output.write_string(atlas_html_escape("Rendered preview for \{state.id}"))
    output.write_string("\" srcdoc=\"")
    output.write_string(atlas_html_escape(state.html))
    output.write_string(
      "\"></iframe><h3><span data-lang=\"en\">Metadata</span><span data-lang=\"ja\" hidden>メタデータ</span></h3><dl class=\"metadata\"><dt>Fingerprint</dt><dd><code>",
    )
    output.write_string(atlas_html_escape(state.id))
    output.write_string(
      "</code></dd><dt><span data-lang=\"en\">Depth</span><span data-lang=\"ja\" hidden>深さ</span></dt><dd>",
    )
    output.write_object(state.depth)
    output.write_string(
      "</dd><dt><span data-lang=\"en\">Dependencies</span><span data-lang=\"ja\" hidden>依存関係</span></dt><dd>",
    )
    atlas_html_write_dependencies(output, state.dependencies)
    output.write_string(
      "</dd></dl><h3><span data-lang=\"en\">Incoming transitions</span><span data-lang=\"ja\" hidden>入力遷移</span></h3>",
    )
    atlas_html_write_state_transitions(output, state.id, transitions, true)
    output.write_string(
      "<h3><span data-lang=\"en\">Outgoing transitions</span><span data-lang=\"ja\" hidden>出力遷移</span></h3>",
    )
    atlas_html_write_state_transitions(output, state.id, transitions, false)
    output.write_string(
      "<h3><span data-lang=\"en\">Failures at this state</span><span data-lang=\"ja\" hidden>この状態の失敗</span></h3>",
    )
    atlas_html_write_state_failures(output, report, state.id)
    output.write_string("</article>")
  }
  for index, transition in transitions {
    output.write_string(
      "<article class=\"inspector-card\" data-detail-kind=\"edge\" data-detail-id=\"transition-",
    )
    output.write_object(index)
    output.write_string(
      "\" hidden><span class=\"selection-kind\"><span data-lang=\"en\">Transition</span><span data-lang=\"ja\" hidden>遷移</span></span><h3>",
    )
    output.write_string(atlas_html_escape(transition.action))
    output.write_string(
      "</h3><dl class=\"metadata\"><dt>Action ID</dt><dd><code>",
    )
    output.write_string(atlas_html_escape(transition.action_id))
    output.write_string(
      "</code></dd><dt><span data-lang=\"en\">From</span><span data-lang=\"ja\" hidden>遷移元</span></dt><dd><code>",
    )
    output.write_string(atlas_html_escape(transition.from))
    output.write_string(
      "</code></dd><dt><span data-lang=\"en\">To</span><span data-lang=\"ja\" hidden>遷移先</span></dt><dd><code>",
    )
    output.write_string(atlas_html_escape(transition.to))
    output.write_string(
      "</code></dd><dt><span data-lang=\"en\">Samples</span><span data-lang=\"ja\" hidden>サンプル数</span></dt><dd>",
    )
    output.write_object(transition.samples)
    output.write_string(
      "</dd><dt><span data-lang=\"en\">Failure path</span><span data-lang=\"ja\" hidden>失敗経路</span></dt><dd>",
    )
    output.write_string(
      if atlas_contains_int(failing_edges, index) {
        "yes"
      } else {
        "no"
      },
    )
    output.write_string("</dd></dl></article>")
  }
  output.write_string("</aside></div></section>")
  output.write_string(
    (
      #|<section class="panel" aria-labelledby="failure-title"><h2 id="failure-title"><span data-lang="en">Property failures</span><span data-lang="ja" hidden>プロパティ失敗</span></h2>
    ),
  )
  if report.failures.is_empty() {
    output.write_string(
      "<p class=\"success\"><span data-lang=\"en\">All generated traces satisfied the configured properties.</span><span data-lang=\"ja\" hidden>生成されたすべてのトレースが設定済みプロパティを満たしました。</span></p>",
    )
  } else {
    output.write_string("<ul class=\"failure-list\">")
    for failure in report.failures {
      output.write_string("<li class=\"failure\"><h3>")
      output.write_string(atlas_html_escape(failure.property))
      output.write_string("</h3><p>")
      output.write_string(atlas_html_escape(failure.message))
      output.write_string(
        "</p><div class=\"failure-meta\"><span data-lang=\"en\">State</span><span data-lang=\"ja\" hidden>状態</span>: <button class=\"transition-link\" type=\"button\" data-select-node=\"",
      )
      output.write_string(atlas_html_escape(failure.state_id))
      output.write_string("\"><code>")
      output.write_string(atlas_html_escape(failure.state_id))
      output.write_string(
        "</code></button></div><div class=\"failure-meta\"><span data-lang=\"en\">Minimized trace</span><span data-lang=\"ja\" hidden>最小化トレース</span>:</div>",
      )
      atlas_html_write_failure_trace(output, failure)
      output.write_string("</li>")
    }
    output.write_string("</ul>")
  }
  output.write_string(
    (
      #|</section>
      #|<section class="panel" aria-labelledby="diagnostic-title"><h2 id="diagnostic-title"><span data-lang="en">Diagnostics</span><span data-lang="ja" hidden>診断</span></h2>
    ),
  )
  if report.diagnostics.is_empty() {
    output.write_string(
      "<p class=\"success\"><span data-lang=\"en\">No runner diagnostics were recorded.</span><span data-lang=\"ja\" hidden>ランナー診断は記録されませんでした。</span></p>",
    )
  } else {
    output.write_string("<ul class=\"failure-list\">")
    for diagnostic in report.diagnostics {
      output.write_string("<li class=\"failure\"><h3>")
      output.write_string(
        atlas_html_escape(run_diagnostic_kind_name(diagnostic.kind)),
      )
      output.write_string("</h3><p>")
      output.write_string(atlas_html_escape(diagnostic.message))
      output.write_string("</p><div class=\"failure-meta\">Identity: <code>")
      output.write_string(atlas_html_escape(diagnostic.identity))
      output.write_string("</code></div></li>")
    }
    output.write_string("</ul>")
  }
  output.write_string(
    (
      #|</section>
      #|<section class="panel" aria-labelledby="artifacts-title"><h2 id="artifacts-title"><span data-lang="en">Artifacts</span><span data-lang="ja" hidden>成果物</span></h2><ul class="links">
      #|<li><a href="atlas.json">atlas.json</a></li>
      #|<li><a href="atlas.dot">atlas.dot</a></li>
      #|</ul></section>
      #|</main>
      #|<footer><span data-lang="en">The Inspector reuses Flow Canvas identities. JSON and DOT remain machine-oriented artifacts.</span><span data-lang="ja" hidden>InspectorはFlow Canvasの識別子を再利用します。JSONとDOTは機械向け成果物のままです。</span></footer>
      #|<script>
      #|(() => {
      #|  const graphItems = Array.from(document.querySelectorAll('[data-flow-node],[data-flow-edge]'));
      #|  const cards = Array.from(document.querySelectorAll('[data-detail-kind][data-detail-id]'));
      #|  const empty = document.getElementById('inspector-empty');
      #|  const select = (kind, id) => {
      #|    let found = false;
      #|    graphItems.forEach((item) => {
      #|      const active = kind === 'node' ? item.dataset.flowNode === id : item.dataset.flowEdge === id;
      #|      item.classList.toggle('is-selected', active);
      #|      item.setAttribute('aria-pressed', active ? 'true' : 'false');
      #|    });
      #|    cards.forEach((card) => {
      #|      const active = card.dataset.detailKind === kind && card.dataset.detailId === id;
      #|      card.hidden = !active;
      #|      found = found || active;
      #|    });
      #|    empty.hidden = found;
      #|  };
      #|  graphItems.forEach((item) => {
      #|    const activate = () => item.dataset.flowNode ? select('node', item.dataset.flowNode) : select('edge', item.dataset.flowEdge);
      #|    item.addEventListener('click', activate);
      #|    item.addEventListener('keydown', (event) => {
      #|      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      #|    });
      #|  });
      #|  document.querySelectorAll('[data-select-node]').forEach((button) => button.addEventListener('click', () => select('node', button.dataset.selectNode)));
      #|  document.querySelectorAll('[data-select-edge]').forEach((button) => button.addEventListener('click', () => select('edge', button.dataset.selectEdge)));
      #|  document.querySelectorAll('[data-locale]').forEach((button) => button.addEventListener('click', () => {
      #|    const locale = button.dataset.locale;
      #|    document.documentElement.lang = locale;
      #|    document.querySelectorAll('[data-lang]').forEach((item) => { item.hidden = item.dataset.lang !== locale; });
      #|    document.querySelectorAll('[data-locale]').forEach((item) => item.setAttribute('aria-pressed', item.dataset.locale === locale ? 'true' : 'false'));
      #|  }));
      #|  if (graphItems.length > 0) {
      #|    const first = graphItems.find((item) => item.dataset.flowNode) || graphItems[0];
      #|    if (first.dataset.flowNode) select('node', first.dataset.flowNode); else select('edge', first.dataset.flowEdge);
      #|  }
      #|})();
      #|</script>
      #|</body>
      #|</html>
    ),
  )
  output.to_string()
}
