///|
/// Render the human-facing, interactive Atlas view.
pub fn report_to_html(report : RunReport) -> String {
  let output = StringBuilder::new()
  let report_json = report_to_json(report).replace_all(
    old="</script>",
    new="<\\/script>",
  )
  let shell =
    #|<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proped Rabbita Atlas</title><style>
    #|:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#eef2f6;color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef2f6;line-height:1.45}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:15px 24px;background:#101827;color:#f8fafc;box-shadow:0 3px 16px #0f172a33}.brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:12px;height:12px;flex:none;border-radius:50%;background:#7dd3fc;box-shadow:0 0 0 5px #7dd3fc22}.eyebrow,.panel-kicker{margin:0;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.topbar .eyebrow{color:#93c5fd}.brand h1{margin:1px 0 0;font-size:20px;letter-spacing:-.02em}.topbar-actions{display:flex;align-items:center;justify-content:flex-end;gap:16px}.top-stats{color:#cbd5e1;font-size:12px;white-space:nowrap}.locale-switch{display:flex;padding:3px;border:1px solid #475569;border-radius:8px;background:#1e293b}.locale-switch button{border:0;border-radius:5px;padding:5px 8px;color:#cbd5e1;background:transparent;font:700 11px ui-monospace,monospace;cursor:pointer}.locale-switch button:hover,.locale-switch button:focus-visible{color:#fff;background:#334155;outline:2px solid #7dd3fc;outline-offset:1px}.locale-switch button.active{color:#0f172a;background:#e0f2fe}.layout{display:grid;grid-template-columns:minmax(0,1fr) 390px;gap:16px;max-width:1640px;margin:0 auto;padding:20px}.graph-panel,.inspector,.support-panel{background:#fff;border:1px solid #d7dee8;border-radius:14px;box-shadow:0 5px 20px #1720330c}.graph-panel{min-width:0;overflow:hidden}.panel-bar{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:18px 20px 14px;border-bottom:1px solid #e5eaf0}.panel-title{margin:3px 0 0;font-size:18px;letter-spacing:-.02em}.panel-help{margin:4px 0 0;color:#667085;font-size:13px}.legend{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px 14px;color:#667085;font-size:11px;white-space:nowrap}.legend-item{display:inline-flex;align-items:center;gap:6px}.legend-dot{width:8px;height:8px;border-radius:50%;background:#64748b}.legend-dot.initial{background:#2563eb}.legend-dot.failure{background:#dc2626}.graph-viewport{min-height:600px;overflow:auto;background:#f8fafc}.graph-viewport:focus-within{outline:2px solid #93c5fd;outline-offset:-2px}.graph-viewport svg{display:block;min-width:720px;max-width:none}.graph-empty{display:grid;place-items:center;min-height:360px;padding:32px;color:#667085}.state-node,.edge-group{cursor:pointer;outline:none}.state-node rect{fill:#fff;stroke:#b8c4d3;stroke-width:1.5;filter:drop-shadow(0 3px 5px #17203314)}.state-node:hover rect,.state-node:focus rect{stroke:#60a5fa;stroke-width:2.5}.state-node.selected rect{fill:#eff6ff;stroke:#2563eb;stroke-width:3}.state-node.initial rect{stroke:#2563eb}.state-node.failure rect{fill:#fff7ed;stroke:#dc2626;stroke-width:2.5}.state-node.selected.failure rect{stroke:#b91c1c;stroke-width:3}.node-label{fill:#172033;font-size:16px;font-weight:800}.node-meta{fill:#667085;font-size:11px}.node-id{fill:#94a3b8;font:10px ui-monospace,monospace}.node-chip{fill:#dbeafe}.node-chip-text{fill:#1d4ed8;font-size:10px;font-weight:800}.node-failure-chip{fill:#fee2e2}.node-failure-text{fill:#b91c1c;font-size:10px;font-weight:800}.node-noop-chip{fill:#f1f5f9}.node-noop-text{fill:#475569;font-size:10px;font-weight:800}.edge-path{fill:none;stroke:#94a3b8;stroke-width:1.8;marker-end:url(#atlas-arrow)}.edge-group:hover .edge-path,.edge-group:focus .edge-path{stroke:#2563eb;stroke-width:2.8}.edge-group.selected .edge-path{stroke:#1d4ed8;stroke-width:3.4}.edge-group.failure .edge-path{stroke:#dc2626;stroke-width:2.8;stroke-dasharray:7 4}.edge-label-bg{fill:#f8fafc;stroke:#dbe3ed;stroke-width:1}.edge-group.selected .edge-label-bg{fill:#dbeafe;stroke:#93c5fd}.edge-label{fill:#334155;font-size:11px;font-weight:700}.edge-count{fill:#64748b;font:10px ui-monospace,monospace}.inspector{position:sticky;top:84px;align-self:start;max-height:calc(100vh - 104px);overflow:auto}.inspector-header{padding:18px 18px 14px;border-bottom:1px solid #e5eaf0}.inspector-title{margin:3px 0 0;font-size:20px;letter-spacing:-.025em}.inspector-subtitle{margin:4px 0 0;color:#667085;font-size:12px}.surface-section{padding:16px 18px}.surface-section+.surface-section{border-top:1px solid #e5eaf0}.surface-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}.surface-heading h3{margin:0;color:#172033;font-size:13px}.surface-heading span{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.app-surface{background:#fffaf2}.app-surface .surface-heading span{color:#b45309}.atlas-surface{background:#f8fafc}.atlas-surface .surface-heading span{color:#1d4ed8}.preview-frame{overflow:hidden;border:1px solid #e4c99e;border-radius:9px;background:#fff;box-shadow:0 2px 8px #b4530914}.preview-frame iframe{display:block;width:100%;height:294px;border:0;background:#fff}.metadata-grid{display:grid;grid-template-columns:1fr;gap:9px}.metadata-row{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px;align-items:start;font-size:12px}.metadata-label{color:#667085}.metadata-value{min-width:0;color:#172033;font-weight:650;overflow-wrap:anywhere}.metadata-value code,.raw-action{font:11px ui-monospace,monospace;color:#475569}.related-list{display:grid;gap:5px;margin-top:12px}.related-label{color:#667085;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.related-edge{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:6px 8px;border:1px solid #dbe3ed;border-radius:6px;color:#334155;background:#fff;text-align:left;font-size:11px;cursor:pointer}.related-edge:hover,.related-edge:focus-visible{border-color:#60a5fa;background:#eff6ff;outline:2px solid #bfdbfe;outline-offset:1px}.related-edge small{color:#64748b;font:10px ui-monospace,monospace}.inspector details{margin-top:12px;border-top:1px solid #e5eaf0}.inspector summary,.support-panel summary{cursor:pointer;list-style:none}.inspector summary::-webkit-details-marker,.support-panel summary::-webkit-details-marker{display:none}.inspector summary{padding:12px 0 0;color:#334155;font-size:12px;font-weight:750}.inspector summary:before,.support-panel summary:before{display:inline-block;width:18px;color:#64748b;content:"▸"}.inspector details[open] summary:before,.support-panel details[open]>summary:before{content:"▾"}.dependency-list{display:grid;gap:5px;margin:10px 0 0;padding:0;list-style:none}.dependency-list li{padding:6px 8px;border-left:3px solid #cbd5e1;color:#475569;background:#fff;font:11px ui-monospace,monospace;overflow-wrap:anywhere}.supporting{display:grid;gap:12px;max-width:1640px;margin:0 auto;padding:0 20px 24px}.support-panel{overflow:hidden}.support-panel>summary{display:flex;align-items:center;gap:8px;padding:14px 18px;color:#172033;font-size:14px;font-weight:800}.support-summary{margin-left:auto;color:#64748b;font:11px ui-monospace,monospace;font-weight:500}.support-body{padding:0 18px 16px;border-top:1px solid #e5eaf0}.support-intro{margin:12px 0;color:#667085;font-size:12px}.transition-list,.raw-list,.property-list{display:grid;gap:6px}.transition-row{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;text-align:left;cursor:pointer}.transition-row:hover,.transition-row:focus-visible{border-color:#60a5fa;background:#eff6ff;outline:2px solid #bfdbfe;outline-offset:1px}.transition-node{min-width:0;color:#334155;font:11px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.transition-action{color:#1d4ed8;font-size:11px;font-weight:750;text-align:center}.transition-samples{color:#64748b;font:10px ui-monospace,monospace;white-space:nowrap}.subdetails{margin-top:14px;border-top:1px solid #e5eaf0}.subdetails summary{padding:12px 0;color:#475569;font-size:12px;font-weight:750}.raw-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;padding:7px 0;border-top:1px solid #eef2f6;color:#475569;font-size:11px}.raw-row:first-child{border-top:0}.raw-route{font:11px ui-monospace,monospace}.raw-action{overflow-wrap:anywhere}.success{padding:10px 12px;border:1px solid #bbf7d0;border-radius:8px;color:#166534;background:#f0fdf4;font-size:12px}.failure-row{padding:12px;border:1px solid #fecaca;border-radius:8px;color:#7f1d1d;background:#fff1f2}.failure-row+.failure-row{margin-top:8px}.failure-title{margin:0;font-size:12px}.failure-message{margin:4px 0 0;font-size:12px}.failure-state{margin:8px 0 0;color:#991b1b;font:11px ui-monospace,monospace}.trace{margin:8px 0 0;padding-left:22px;color:#7f1d1d;font:11px ui-monospace,monospace}.empty-state{padding:10px 0;color:#667085;font-size:12px}.footer{max-width:1640px;margin:0 auto;padding:0 20px 24px;color:#94a3b8;font-size:11px}@media(max-width:980px){.topbar{align-items:flex-start;flex-direction:column;padding:14px 18px}.topbar-actions{width:100%;justify-content:space-between}.layout{grid-template-columns:1fr;padding:14px}.graph-viewport{min-height:480px}.inspector{position:static;max-height:none}.supporting{padding:0 14px 20px}.legend{justify-content:flex-start}}@media(max-width:620px){.topbar-actions{align-items:flex-start;flex-direction:column;gap:10px}.top-stats{white-space:normal}.panel-bar{display:block;padding:16px}.legend{margin-top:12px}.graph-viewport{min-height:400px}.transition-row{grid-template-columns:minmax(0,1fr) auto;gap:4px}.transition-row .transition-action{grid-column:1/-1;grid-row:2;text-align:left}.transition-samples{grid-column:2;grid-row:1}.metadata-row{grid-template-columns:82px minmax(0,1fr)}}
    #|</style></head><body><header class="topbar"><div class="brand"><span class="brand-mark" aria-hidden="true"></span><div><p class="eyebrow" data-i18n="brandEyebrow">Proped Rabbita / Atlas</p><h1 data-i18n="brandTitle">State flow atlas</h1></div></div><div class="topbar-actions"><div class="top-stats" id="top-stats"></div><div class="locale-switch" role="group" aria-label="Language"><button type="button" data-lang="en" class="active">EN</button><button type="button" data-lang="ja">日本語</button></div></div></header><main class="layout"><section class="graph-panel" aria-labelledby="graph-title"><div class="panel-bar"><div><p class="panel-kicker" data-i18n="graphKicker">Atlas view</p><h2 class="panel-title" id="graph-title" data-i18n="graphTitle">Reachable state flow</h2><p class="panel-help" data-i18n="graphHelp">Select a state or edge to inspect the rendered app and its transition context.</p></div><div class="legend"><span class="legend-item"><i class="legend-dot initial"></i><span data-i18n="legendInitial">initial</span></span><span class="legend-item"><i class="legend-dot"></i><span data-i18n="legendState">state</span></span><span class="legend-item"><i class="legend-dot failure"></i><span data-i18n="legendFailure">failure</span></span></div></div><div class="graph-viewport" id="graph-viewport"><svg id="state-graph" role="img" aria-labelledby="graph-title"></svg></div></section><aside class="inspector" aria-labelledby="inspector-title"><div class="inspector-header"><p class="panel-kicker" data-i18n="inspectorKicker">Inspector</p><h2 class="inspector-title" id="inspector-title">S0</h2><p class="inspector-subtitle" id="inspector-subtitle"></p></div><section class="surface-section app-surface"><div class="surface-heading"><h3 data-i18n="renderedApp">Rendered app</h3><span data-i18n="appSurfaceLabel">application</span></div><div class="preview-frame"><iframe id="state-preview" sandbox title="Rendered app"></iframe></div></section><section class="surface-section atlas-surface"><div class="surface-heading"><h3 data-i18n="atlasMetadata">Atlas metadata</h3><span data-i18n="atlasSurfaceLabel">atlas</span></div><div id="selection-details" class="metadata-grid"></div><div id="related-actions" class="related-list"></div><details id="dependencies-details"><summary data-i18n="dependencies">Dependencies</summary><ul id="dependency-list" class="dependency-list"></ul></details></section></aside></main><section class="supporting"><details class="support-panel" id="transitions-panel"><summary><span data-i18n="transitions">Transitions</span><span class="support-summary" id="transitions-summary"></span></summary><div class="support-body"><p class="support-intro" data-i18n="transitionsIntro">The graph shows unique state-machine edges. Exploration samples remain available for audit.</p><div id="transition-list" class="transition-list"></div><details class="subdetails" id="raw-transitions-panel"><summary><span data-i18n="explorationSamples">Exploration samples</span><span class="support-summary" id="raw-transitions-summary"></span></summary><div id="raw-transition-list" class="raw-list"></div></details></div></details><details class="support-panel" id="properties-panel"><summary><span data-i18n="properties">Properties</span><span class="support-summary" id="properties-summary"></span></summary><div class="support-body"><div id="property-list" class="property-list"></div></div></details></section><footer class="footer" data-i18n="footer">Human-facing view: the JSON and DOT exports remain machine-oriented artifacts.</footer><script type="application/json" id="atlas-data">
  output.write_string(shell)
  output.write_string(report_json)
  output.write_string(
    (
      #|</script><script>
      #|(() => {
      #|  const SVG_NS = "http://www.w3.org/2000/svg";
      #|  const data = JSON.parse(document.getElementById("atlas-data").textContent || "{}");
      #|  const states = (data.states || []).map((state, index) => ({ ...state, index, label: "S" + index }));
      #|  const stateById = new Map(states.map(state => [state.id, state]));
      #|  const edgeByKey = new Map();
      #|  for (const transition of data.transitions || []) {
      #|    const key = transition.from + String.fromCharCode(0) + transition.action + String.fromCharCode(0) + transition.to;
      #|    const existing = edgeByKey.get(key);
      #|    if (existing) existing.samples += 1;
      #|    else edgeByKey.set(key, { ...transition, key, samples: 1 });
      #|  }
      #|  const edges = Array.from(edgeByKey.values()).map((edge, index) => ({ ...edge, index }));
      #|  const edgeByKeyWithIndex = new Map(edges.map(edge => [edge.key, edge]));
      #|  const visibleEdges = edges.filter(edge => edge.from !== edge.to);
      #|  const failureStateIds = new Set((data.failures || []).map(failure => failure.stateId));
      #|  const failureEdgeKeys = new Set();
      #|  for (const failure of data.failures || []) {
      #|    let current = states.length ? states[0].id : null;
      #|    for (const action of failure.trace || []) {
      #|      const edge = edges.find(candidate => candidate.from === current && candidate.action === action);
      #|      if (!edge) break;
      #|      failureEdgeKeys.add(edge.key);
      #|      current = edge.to;
      #|    }
      #|  }
      #|  const actionLabels = {
      #|    'SetEmail("")': { en: "Clear email", ja: "メールをクリア" },
      #|    'SetEmail("alice@example.com")': { en: "Enter valid email", ja: "有効なメールアドレスを入力" },
      #|    ToggleConsent: { en: "Toggle consent", ja: "同意を切り替え" },
      #|    Submit: { en: "Submit form", ja: "フォームを送信" },
      #|    Reset: { en: "Reset form", ja: "フォームをリセット" },
      #|  };
      #|  const copy = {
      #|    en: { brandEyebrow: "Proped Rabbita / Atlas", brandTitle: "State flow atlas", graphKicker: "Atlas view", graphTitle: "Reachable state flow", graphHelp: "Select a state or edge to inspect the rendered app and its transition context.", legendInitial: "initial", legendState: "state", legendFailure: "failure", inspectorKicker: "Inspector", renderedApp: "Rendered app", appSurfaceLabel: "application", atlasMetadata: "Atlas metadata", atlasSurfaceLabel: "atlas", dependencies: "Dependencies", transitions: "Transitions", transitionsIntro: "The graph shows unique state-machine edges. Exploration samples remain available for audit.", explorationSamples: "Exploration samples", properties: "Properties", footer: "Human-facing view: the JSON and DOT exports remain machine-oriented artifacts.", stateFingerprint: "State fingerprint", depth: "First depth", incoming: "Incoming", outgoing: "Outgoing", initialState: "Initial state", failureCount: "failures", noOpCount: "no-op", transition: "Transition", from: "From", to: "To", action: "Action", samples: "samples", rawAction: "Raw action", allPropertiesPass: "All generated traces satisfied the configured properties.", propertyFailure: "Property failure", trace: "Minimized trace", noStates: "No reachable states were discovered." },
      #|    ja: { brandEyebrow: "Proped Rabbita / Atlas", brandTitle: "状態遷移Atlas", graphKicker: "Atlas表示", graphTitle: "到達可能な状態フロー", graphHelp: "状態またはエッジを選択すると、描画されたアプリと遷移の詳細を確認できます。", legendInitial: "初期状態", legendState: "状態", legendFailure: "失敗", inspectorKicker: "インスペクタ", renderedApp: "描画されたアプリ", appSurfaceLabel: "アプリ", atlasMetadata: "Atlasメタデータ", atlasSurfaceLabel: "Atlas", dependencies: "依存関係", transitions: "遷移", transitionsIntro: "グラフにはユニークな状態機械のエッジを表示しています。探索サンプルは監査用に確認できます。", explorationSamples: "探索サンプル", properties: "プロパティ", footer: "人間向け表示です。JSONとDOTは機械向けの成果物として保持されます。", stateFingerprint: "状態fingerprint", depth: "初回の深度", incoming: "入力", outgoing: "出力", initialState: "初期状態", failureCount: "件の失敗", noOpCount: "no-op", transition: "遷移", from: "From", to: "To", action: "Action", samples: "回", rawAction: "raw action", allPropertiesPass: "生成されたすべてのtraceが設定済みプロパティを満たしました。", propertyFailure: "プロパティ失敗", trace: "縮約trace", noStates: "到達可能な状態が見つかりませんでした。" }
      #|  };
      #|  let lang = (navigator.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
      #|  let selectedStateId = states.length ? states[0].id : null;
      #|  let selectedEdgeKey = null;
      #|  const text = key => copy[lang][key] || key;
      #|  const actionText = action => (actionLabels[action] && actionLabels[action][lang]) || action;
      #|  const make = (tag, className, value) => {
      #|    const element = document.createElement(tag);
      #|    if (className) element.className = className;
      #|    if (value !== undefined) element.textContent = value;
      #|    return element;
      #|  };
      #|  const svgMake = (tag, attrs = {}) => {
      #|    const element = document.createElementNS(SVG_NS, tag);
      #|    for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
      #|    return element;
      #|  };
      #|  const stateLabel = id => stateById.get(id) ? stateById.get(id).label : "?";
      #|  const stateFailures = id => (data.failures || []).filter(failure => failure.stateId === id);
      #|  const noOpCount = id => edges.filter(edge => edge.from === id && edge.to === id).reduce((count, edge) => count + edge.samples, 0);
      #|  const relatedEdges = (id, direction) => edges.filter(edge => direction === "from" ? edge.from === id : edge.to === id);
      #|
      #|  function setStaticText() {
      #|    document.documentElement.lang = lang;
      #|    document.querySelectorAll("[data-i18n]").forEach(element => {
      #|      const key = element.getAttribute("data-i18n");
      #|      if (copy[lang][key]) element.textContent = text(key);
      #|    });
      #|    document.querySelectorAll("[data-lang]").forEach(button => button.classList.toggle("active", button.getAttribute("data-lang") === lang));
      #|    renderStats();
      #|    renderGraph();
      #|    renderInspector();
      #|    renderSupport();
      #|  }
      #|
      #|  function renderStats() {
      #|    const stateWord = lang === "ja" ? "状態" : states.length === 1 ? "state" : "states";
      #|    const edgeWord = lang === "ja" ? "ユニーク遷移" : edges.length === 1 ? "unique edge" : "unique edges";
      #|    const sampleWord = lang === "ja" ? "探索サンプル" : data.transitions.length === 1 ? "sample" : "samples";
      #|    const failureWord = lang === "ja" ? "件の失敗" : data.failures.length === 1 ? "failure" : "failures";
      #|    document.getElementById("top-stats").textContent = lang === "ja" ? states.length + stateWord + " · " + edges.length + edgeWord + " · " + data.transitions.length + sampleWord + " · " + data.failures.length + failureWord : states.length + " " + stateWord + " · " + edges.length + " " + edgeWord + " · " + data.transitions.length + " " + sampleWord + " · " + data.failures.length + " " + failureWord;
      #|  }
      #|
      #|  function layoutGraph() {
      #|    const columns = new Map();
      #|    for (const state of states) {
      #|      const depth = Math.max(0, Number(state.depth) || 0);
      #|      if (!columns.has(depth)) columns.set(depth, []);
      #|      columns.get(depth).push(state);
      #|    }
      #|    const maxDepth = columns.size ? Math.max(...columns.keys()) : 0;
      #|    const nodeWidth = 210, nodeHeight = 112, columnGap = 150, rowGap = 28, horizontalPadding = 120;
      #|    const routeMargin = 28, routeGap = 34;
      #|    const maxRows = Math.max(1, ...Array.from(columns.values()).map(column => column.length));
      #|    const xForDepth = depth => horizontalPadding + depth * (nodeWidth + columnGap);
      #|    const edgeTracks = { forward: [], reverse: [] };
      #|    const laneByKey = new Map();
      #|    for (const edge of visibleEdges) {
      #|      const fromState = stateById.get(edge.from), toState = stateById.get(edge.to);
      #|      if (!fromState || !toState) continue;
      #|      const fromX = xForDepth(Math.max(0, Number(fromState.depth) || 0)), toX = xForDepth(Math.max(0, Number(toState.depth) || 0));
      #|      const forward = fromX <= toX, startX = forward ? fromX + nodeWidth : fromX, endX = forward ? toX : toX + nodeWidth;
      #|      const labelWidth = Math.max(74, actionText(edge.action).length * 8 + 18);
      #|      const range = { start: Math.min(startX, endX) - labelWidth / 2 - 16, end: Math.max(startX, endX) + labelWidth / 2 + 16 };
      #|      const tracks = forward ? edgeTracks.forward : edgeTracks.reverse;
      #|      let slot = tracks.findIndex(track => track.every(other => range.end < other.start || range.start > other.end));
      #|      if (slot < 0) { slot = tracks.length; tracks.push([]); }
      #|      tracks[slot].push(range);
      #|      laneByKey.set(edge.key, { direction: forward ? "forward" : "reverse", slot });
      #|    }
      #|    const topLaneCount = Math.max(1, edgeTracks.forward.length), bottomLaneCount = Math.max(1, edgeTracks.reverse.length);
      #|    const topPadding = routeMargin + topLaneCount * routeGap + 24, bottomPadding = routeMargin + bottomLaneCount * routeGap + 24;
      #|    const contentHeight = maxRows * nodeHeight + (maxRows - 1) * rowGap;
      #|    const width = Math.max(720, horizontalPadding * 2 + (maxDepth + 1) * nodeWidth + maxDepth * columnGap);
      #|    const height = Math.max(480, topPadding + contentHeight + bottomPadding);
      #|    const positions = new Map();
      #|    for (const [depth, column] of columns) {
      #|      const x = xForDepth(depth);
      #|      column.forEach((state, row) => positions.set(state.id, { x, y: topPadding + row * (nodeHeight + rowGap), width: nodeWidth, height: nodeHeight }));
      #|    }
      #|    return { positions, width, height, laneByKey, routeMargin, routeGap };
      #|  }
      #|
      #|  function edgePath(from, to, laneY) {
      #|    const forward = from.x <= to.x, direction = forward ? 1 : -1;
      #|    const startX = forward ? from.x + from.width : from.x;
      #|    const endX = forward ? to.x : to.x + to.width;
      #|    const startY = from.y + from.height / 2, endY = to.y + to.height / 2;
      #|    const startBend = startX + direction * 24, endBend = endX - direction * 24;
      #|    return "M " + startX + " " + startY + " L " + startBend + " " + startY + " L " + startBend + " " + laneY + " L " + endBend + " " + laneY + " L " + endBend + " " + endY + " L " + endX + " " + endY;
      #|  }
      #|
      #|  function activate(element, action) {
      #|    element.addEventListener("click", action);
      #|    element.addEventListener("keydown", event => {
      #|      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
      #|    });
      #|  }
      #|
      #|  function renderGraph() {
      #|    const svg = document.getElementById("state-graph"), viewport = document.getElementById("graph-viewport");
      #|    svg.replaceChildren();
      #|    if (!states.length) { viewport.replaceChildren(make("div", "graph-empty", text("noStates"))); return; }
      #|    if (viewport.firstElementChild !== svg) viewport.replaceChildren(svg);
      #|    const layout = layoutGraph();
      #|    svg.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
      #|    svg.setAttribute("width", layout.width); svg.setAttribute("height", layout.height);
      #|    const defs = svgMake("defs"), marker = svgMake("marker", { id: "atlas-arrow", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" });
      #|    marker.append(svgMake("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#94a3b8" })); defs.append(marker); svg.append(defs);
      #|    for (const edge of visibleEdges) {
      #|      const from = layout.positions.get(edge.from), to = layout.positions.get(edge.to);
      #|      if (!from || !to) continue;
      #|      const selected = selectedEdgeKey === edge.key, failed = failureEdgeKeys.has(edge.key);
      #|      const group = svgMake("g", { class: "edge-group" + (selected ? " selected" : "") + (failed ? " failure" : ""), tabindex: "0", role: "button", "aria-label": stateLabel(edge.from) + " " + actionText(edge.action) + " " + stateLabel(edge.to) });
      #|      const lane = layout.laneByKey.get(edge.key), laneY = lane.direction === "forward" ? layout.routeMargin + lane.slot * layout.routeGap : layout.height - layout.routeMargin - lane.slot * layout.routeGap;
      #|      group.append(svgMake("path", { class: "edge-path", d: edgePath(from, to, laneY) }));
      #|      const forward = from.x <= to.x, direction = forward ? 1 : -1, startX = forward ? from.x + from.width : from.x, endX = forward ? to.x : to.x + to.width, labelX = (startX + direction * 24 + endX - direction * 24) / 2, labelY = laneY - 8;
      #|      const labelWidth = Math.max(74, actionText(edge.action).length * 8 + 18), labelBackground = svgMake("rect", { class: "edge-label-bg", x: labelX - labelWidth / 2, y: labelY - 15, width: labelWidth, height: "30", rx: "7" });
      #|      const label = svgMake("text", { class: "edge-label", x: labelX, y: labelY, "text-anchor": "middle" }); label.textContent = actionText(edge.action);
      #|      const count = svgMake("text", { class: "edge-count", x: labelX, y: labelY + 15, "text-anchor": "middle" }); count.textContent = "×" + edge.samples;
      #|      group.append(labelBackground, label, count); activate(group, () => selectEdge(edge.key)); svg.append(group);
      #|    }
      #|    for (const state of states) {
      #|      const position = layout.positions.get(state.id), failureCount = stateFailures(state.id).length, selected = selectedStateId === state.id && !selectedEdgeKey;
      #|      const group = svgMake("g", { class: "state-node" + (selected ? " selected" : "") + (state.index === 0 ? " initial" : "") + (failureCount ? " failure" : ""), tabindex: "0", role: "button", "aria-label": state.label + ": " + state.id });
      #|      group.append(svgMake("rect", { x: position.x, y: position.y, width: position.width, height: position.height, rx: "14" }));
      #|      const title = svgMake("text", { class: "node-label", x: position.x + 16, y: position.y + 27 }); title.textContent = state.label;
      #|      const meta = svgMake("text", { class: "node-meta", x: position.x + 16, y: position.y + 49 }); meta.textContent = text("depth") + " " + state.depth;
      #|      const id = svgMake("text", { class: "node-id", x: position.x + 16, y: position.y + 69 }); id.textContent = state.id.length > 28 ? state.id.slice(0, 25) + "…" : state.id;
      #|      group.append(title, meta, id);
      #|      let chipX = position.x + 16;
      #|      if (state.index === 0) { const chip = svgMake("rect", { class: "node-chip", x: chipX, y: position.y + 82, width: "76", height: "18", rx: "9" }); const chipText = svgMake("text", { class: "node-chip-text", x: chipX + 38, y: position.y + 94, "text-anchor": "middle" }); chipText.textContent = text("initialState"); group.append(chip, chipText); chipX += 84; }
      #|      if (failureCount) { const chipWidth = 64, chip = svgMake("rect", { class: "node-failure-chip", x: chipX, y: position.y + 82, width: chipWidth, height: "18", rx: "9" }); const chipText = svgMake("text", { class: "node-failure-text", x: chipX + chipWidth / 2, y: position.y + 94, "text-anchor": "middle" }); chipText.textContent = failureCount + " " + text("failureCount"); group.append(chip, chipText); chipX += chipWidth + 8; }
      #|      const noOps = noOpCount(state.id); if (noOps) { const chipWidth = 78, chip = svgMake("rect", { class: "node-noop-chip", x: chipX, y: position.y + 82, width: chipWidth, height: "18", rx: "9" }); const chipText = svgMake("text", { class: "node-noop-text", x: chipX + chipWidth / 2, y: position.y + 94, "text-anchor": "middle" }); chipText.textContent = text("noOpCount") + " ×" + noOps; group.append(chip, chipText); }
      #|      activate(group, () => selectState(state.id)); svg.append(group);
      #|    }
      #|  }
      #|
      #|  function metadataRow(container, label, value, code = false) {
      #|    const row = make("div", "metadata-row"), valueElement = make("span", "metadata-value");
      #|    row.append(make("span", "metadata-label", label)); valueElement.append(code ? make("code", "", value) : document.createTextNode(value)); row.append(valueElement); container.append(row);
      #|  }
      #|  function relatedButton(container, edge, outgoing) {
      #|    const button = make("button", "related-edge"); button.type = "button";
      #|    button.append(make("span", "", outgoing ? actionText(edge.action) + " → " + stateLabel(edge.to) : stateLabel(edge.from) + " → " + actionText(edge.action)), make("small", "", "×" + edge.samples));
      #|    button.addEventListener("click", () => selectEdge(edge.key)); container.append(button);
      #|  }
      #|
      #|  function renderInspector() {
      #|    const details = document.getElementById("selection-details"), related = document.getElementById("related-actions"), list = document.getElementById("dependency-list");
      #|    details.replaceChildren(); related.replaceChildren(); list.replaceChildren();
      #|    const state = stateById.get(selectedStateId);
      #|    if (!state) { document.getElementById("inspector-title").textContent = "—"; document.getElementById("inspector-subtitle").textContent = text("noStates"); return; }
      #|    const selectedEdge = selectedEdgeKey ? edgeByKeyWithIndex.get(selectedEdgeKey) : null, failures = stateFailures(state.id);
      #|    document.getElementById("inspector-title").textContent = selectedEdge ? text("transition") : state.label;
      #|    document.getElementById("inspector-subtitle").textContent = selectedEdge ? stateLabel(selectedEdge.from) + " → " + stateLabel(selectedEdge.to) : text("stateFingerprint") + " · " + state.depth;
      #|    const preview = document.getElementById("state-preview"); preview.srcdoc = state.html; preview.title = state.label + " — " + text("renderedApp");
      #|    if (selectedEdge) { metadataRow(details, text("from"), stateLabel(selectedEdge.from)); metadataRow(details, text("to"), stateLabel(selectedEdge.to)); metadataRow(details, text("action"), actionText(selectedEdge.action)); metadataRow(details, text("samples"), "×" + selectedEdge.samples); metadataRow(details, text("rawAction"), selectedEdge.action, true); }
      #|    else { metadataRow(details, text("stateFingerprint"), state.id, true); metadataRow(details, text("depth"), String(state.depth)); if (failures.length) metadataRow(details, text("propertyFailure"), failures.length + " " + text("failureCount")); }
      #|    const outgoing = relatedEdges(state.id, "from").filter(edge => edge.from !== edge.to), incoming = relatedEdges(state.id, "to").filter(edge => edge.from !== edge.to);
      #|    if (outgoing.length) { related.append(make("span", "related-label", text("outgoing"))); outgoing.forEach(edge => relatedButton(related, edge, true)); }
      #|    if (incoming.length) { related.append(make("span", "related-label", text("incoming"))); incoming.forEach(edge => relatedButton(related, edge, false)); }
      #|    state.dependencies.forEach(dependency => list.append(make("li", "", dependency)));
      #|  }
      #|
      #|  function transitionButton(edge) {
      #|    const button = make("button", "transition-row"); button.type = "button";
      #|    button.append(make("span", "transition-node", stateLabel(edge.from)), make("span", "transition-action", actionText(edge.action)), make("span", "transition-node", stateLabel(edge.to)), make("span", "transition-samples", "×" + edge.samples));
      #|    button.addEventListener("click", () => selectEdge(edge.key)); return button;
      #|  }
      #|
      #|  function renderSupport() {
      #|    document.getElementById("transitions-summary").textContent = lang === "ja" ? edges.length + "件 · " + data.transitions.length + "サンプル" : edges.length + " unique · " + data.transitions.length + " samples";
      #|    document.getElementById("raw-transitions-summary").textContent = String(data.transitions.length); document.getElementById("properties-summary").textContent = String(data.failures.length);
      #|    const transitionList = document.getElementById("transition-list"), rawList = document.getElementById("raw-transition-list"), propertyList = document.getElementById("property-list");
      #|    transitionList.replaceChildren(); visibleEdges.forEach(edge => transitionList.append(transitionButton(edge)));
      #|    rawList.replaceChildren(); (data.transitions || []).forEach(transition => { const row = make("div", "raw-row"); row.append(make("span", "raw-route", stateLabel(transition.from) + " → " + stateLabel(transition.to))); const action = make("span", "raw-action"); action.append(document.createTextNode(actionText(transition.action) + " · "), make("code", "", transition.action)); row.append(action); rawList.append(row); });
      #|    propertyList.replaceChildren(); const panel = document.getElementById("properties-panel");
      #|    if (!data.failures.length) { propertyList.append(make("div", "success", text("allPropertiesPass"))); panel.removeAttribute("open"); }
      #|    else { panel.setAttribute("open", ""); data.failures.forEach(failure => { const row = make("article", "failure-row"); row.append(make("h3", "failure-title", failure.property), make("p", "failure-message", failure.message), make("div", "failure-state", text("stateFingerprint") + ": " + failure.stateId)); if (failure.trace && failure.trace.length) { row.append(make("div", "related-label", text("trace"))); const trace = make("ol", "trace"); failure.trace.forEach(action => trace.append(make("li", "", actionText(action) + " · " + action))); row.append(trace); } propertyList.append(row); }); }
      #|  }
      #|
      #|  function selectState(id) { selectedStateId = id; selectedEdgeKey = null; renderGraph(); renderInspector(); }
      #|  function selectEdge(key) { const edge = edgeByKeyWithIndex.get(key); if (!edge) return; selectedEdgeKey = key; selectedStateId = edge.to; renderGraph(); renderInspector(); }
      #|  document.querySelectorAll("[data-lang]").forEach(button => button.addEventListener("click", () => { lang = button.getAttribute("data-lang") || "en"; setStaticText(); }));
      #|  function setStaticText() { document.documentElement.lang = lang; document.querySelectorAll("[data-i18n]").forEach(element => { const key = element.getAttribute("data-i18n"); if (copy[lang][key]) element.textContent = text(key); }); document.querySelectorAll("[data-lang]").forEach(button => button.classList.toggle("active", button.getAttribute("data-lang") === lang)); renderStats(); renderGraph(); renderInspector(); renderSupport(); }
      #|  function renderStats() { const stateWord = lang === "ja" ? "状態" : states.length === 1 ? "state" : "states"; const edgeWord = lang === "ja" ? "ユニーク遷移" : edges.length === 1 ? "unique edge" : "unique edges"; const sampleWord = lang === "ja" ? "探索サンプル" : data.transitions.length === 1 ? "sample" : "samples"; const failureWord = lang === "ja" ? "件の失敗" : data.failures.length === 1 ? "failure" : "failures"; document.getElementById("top-stats").textContent = lang === "ja" ? states.length + stateWord + " · " + edges.length + edgeWord + " · " + data.transitions.length + sampleWord + " · " + data.failures.length + failureWord : states.length + " " + stateWord + " · " + edges.length + " " + edgeWord + " · " + data.transitions.length + " " + sampleWord + " · " + data.failures.length + " " + failureWord; }
      #|  setStaticText();
      #|})();
      #|</script></body></html>
    ),
  )
  output.to_string()
}
