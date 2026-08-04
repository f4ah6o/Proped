///|
pub(all) enum ActiveView {
  FeedView
  SavedView
} derive(Debug, Eq)

///|
pub fn ActiveView::to_string(self : ActiveView) -> String {
  match self {
    FeedView => "feed"
    SavedView => "saved"
  }
}

///|
pub(all) struct Item {
  id : Int
  subscription_id : Int
  title : String
  read : Bool
  saved : Bool
} derive(Debug, Eq)

///|
pub(all) struct SearchResult {
  item_id : Int
  query : String
  title : String
  saved : Bool
} derive(Debug, Eq)

///|
pub(all) enum RequestKind {
  LoadItems
  Search
  SetSaved
} derive(Debug, Eq)

///|
pub fn RequestKind::to_string(self : RequestKind) -> String {
  match self {
    LoadItems => "load-items"
    Search => "search"
    SetSaved => "set-saved"
  }
}

///|
pub(all) struct PendingRequest {
  effect : @external.EffectDescriptor
  kind : RequestKind
  subscription_id : Int
  query : String
  item_id : Int
  saved : Bool
} derive(Debug, Eq)

///|
pub(all) struct Model {
  active_view : ActiveView
  selected_subscription_id : Int
  unread_only : Bool
  search_modal_open : Bool
  search_query : String
  items : Array[Item]
  search_results : Array[SearchResult]
  loading : Bool
  status_line : String
  pending_requests : Array[PendingRequest]
  next_request_id : Int
  latest_items_request_id : Int
  latest_search_request_id : Int
  latest_saved_request_id : Int
  desired_saved : Bool
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  SelectSubscription(Int)
  OpenSearchModal
  CloseSearchModal
  UpdateSearchQuery(String)
  ToggleItemSaved(Int, Bool)
  ItemsLoaded(Int, Int, Array[Item])
  SearchLoaded(Int, String, Array[SearchResult])
  ItemSavedSet(Int, Int, Bool, Bool)
} derive(Debug, Eq)

///|
fn initial_item() -> Item {
  {
    id: 1,
    subscription_id: 1,
    title: "Initial item",
    read: false,
    saved: false,
  }
}

///|
pub fn initial() -> Model {
  {
    active_view: FeedView,
    selected_subscription_id: 0,
    unread_only: true,
    search_modal_open: false,
    search_query: "",
    items: [initial_item()],
    search_results: [],
    loading: false,
    status_line: "Ready.",
    pending_requests: [],
    next_request_id: 1,
    latest_items_request_id: 0,
    latest_search_request_id: 0,
    latest_saved_request_id: 0,
    desired_saved: false,
  }
}

///|
fn pending_without(model : Model, request_id : Int) -> Array[PendingRequest] {
  model.pending_requests.filter(request => request.effect.id != request_id)
}

///|
fn record_request(
  model : Model,
  kind : RequestKind,
  subscription_id? : Int = 0,
  query? : String = "",
  item_id? : Int = 0,
  saved? : Bool = false,
) -> (Model, Int) {
  let id = model.next_request_id
  let requests = model.pending_requests.copy()
  requests.push({
    effect: {
      id,
      kind: @external.HttpRequest,
      operation: kind.to_string(),
      payload: if kind is LoadItems {
        "subscription_id=\{subscription_id}"
      } else if kind is Search {
        "query=\{query}"
      } else {
        "item_id=\{item_id};saved=\{saved}"
      },
    },
    kind,
    subscription_id,
    query,
    item_id,
    saved,
  })
  ({ ..model, pending_requests: requests, next_request_id: id + 1 }, id)
}

///|
fn items_for(subscription_id : Int) -> Array[Item] {
  [
    {
      id: subscription_id * 10 + 1,
      subscription_id,
      title: "Feed \{subscription_id} item",
      read: false,
      saved: false,
    },
  ]
}

///|
fn results_for(query : String) -> Array[SearchResult] {
  [
    {
      item_id: 100 + query.length(),
      query,
      title: "Result for \{query}",
      saved: false,
    },
  ]
}

///|
fn items_with_saved(
  items : Array[Item],
  item_id : Int,
  saved : Bool,
) -> Array[Item] {
  items.map(item => if item.id == item_id { { ..item, saved, } } else { item })
}

///|
fn results_with_saved(
  results : Array[SearchResult],
  item_id : Int,
  saved : Bool,
) -> Array[SearchResult] {
  results.map(result => {
    if result.item_id == item_id {
      { ..result, saved, }
    } else {
      result
    }
  })
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    SelectSubscription(subscription_id) => {
      let selected = {
        ..model,
        active_view: FeedView,
        selected_subscription_id: subscription_id,
        loading: true,
        status_line: "Loading feed titles...",
      }
      let (recorded, request_id) = record_request(
        selected,
        LoadItems,
        subscription_id~,
      )
      { ..recorded, latest_items_request_id: request_id }
    }
    OpenSearchModal =>
      { ..model, search_modal_open: true, status_line: "Search is open." }
    CloseSearchModal => { ..model, search_modal_open: false }
    UpdateSearchQuery(query) =>
      if !model.search_modal_open {
        { ..model, search_query: query }
      } else {
        let changed = {
          ..model,
          search_query: query,
          loading: true,
          status_line: "Searching...",
        }
        let (recorded, request_id) = record_request(changed, Search, query~)
        { ..recorded, latest_search_request_id: request_id }
      }
    ToggleItemSaved(item_id, saved) => {
      let optimistic = {
        ..model,
        items: items_with_saved(model.items, item_id, saved),
        search_results: results_with_saved(model.search_results, item_id, saved),
        loading: true,
        status_line: if saved {
          "Saved."
        } else {
          "Removed from saved."
        },
        desired_saved: saved,
      }
      let (recorded, request_id) = record_request(
        optimistic,
        SetSaved,
        item_id~,
        saved~,
      )
      { ..recorded, latest_saved_request_id: request_id }
    }
    ItemsLoaded(request_id, _origin_subscription_id, items) =>
      {
        ..model,
        items,
        loading: false,
        status_line: "\{items.length()} titles loaded.",
        pending_requests: pending_without(model, request_id),
      }
    SearchLoaded(request_id, _origin_query, results) =>
      {
        ..model,
        search_results: results,
        loading: false,
        status_line: "\{results.length()} matches.",
        pending_requests: pending_without(model, request_id),
      }
    ItemSavedSet(request_id, item_id, saved, success) => {
      let applied = if success { saved } else { !saved }
      {
        ..model,
        items: items_with_saved(model.items, item_id, applied),
        search_results: results_with_saved(
          model.search_results,
          item_id,
          applied,
        ),
        loading: false,
        status_line: if success {
          "Save completed."
        } else {
          "Save failed."
        },
        pending_requests: pending_without(model, request_id),
      }
    }
  }
}

///|
fn has_pending_kind(model : Model, kind : RequestKind) -> Bool {
  model.pending_requests.any(request => request.kind == kind)
}

///|
fn push_selection(
  actions : Array[Msg],
  model : Model,
  subscription_id : Int,
) -> Unit {
  if model.selected_subscription_id != subscription_id ||
    !has_pending_kind(model, LoadItems) {
    actions.push(SelectSubscription(subscription_id))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let actions : Array[Msg] = []
  push_selection(actions, model, 1)
  push_selection(actions, model, 2)
  if !model.search_modal_open {
    actions.push(OpenSearchModal)
  } else {
    actions.push(CloseSearchModal)
    if model.search_query != "alpha" {
      actions.push(UpdateSearchQuery("alpha"))
    }
    if model.search_query != "beta" {
      actions.push(UpdateSearchQuery("beta"))
    }
  }
  let current_saved = model.items.get(0).map_or(false, item => item.saved)
  actions.push(ToggleItemSaved(1, !current_saved))
  for request in model.pending_requests {
    match request.kind {
      LoadItems =>
        actions.push(
          ItemsLoaded(
            request.effect.id,
            request.subscription_id,
            items_for(request.subscription_id),
          ),
        )
      Search =>
        actions.push(
          SearchLoaded(
            request.effect.id,
            request.query,
            results_for(request.query),
          ),
        )
      SetSaved => {
        actions.push(
          ItemSavedSet(request.effect.id, request.item_id, request.saved, true),
        )
        actions.push(
          ItemSavedSet(request.effect.id, request.item_id, request.saved, false),
        )
      }
    }
  }
  actions
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    SelectSubscription(id) if id != 1 => [SelectSubscription(1)]
    UpdateSearchQuery(query) if query != "a" => [UpdateSearchQuery("a")]
    ToggleItemSaved(id, saved) if id != 1 => [ToggleItemSaved(1, saved)]
    ItemsLoaded(request_id, subscription_id, _items) =>
      [ItemsLoaded(request_id, subscription_id, items_for(subscription_id))]
    SearchLoaded(request_id, query, _results) =>
      [SearchLoaded(request_id, query, results_for(query))]
    _ => []
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    SelectSubscription(id) => "select-subscription:\{id}"
    OpenSearchModal => "open-search"
    CloseSearchModal => "close-search"
    UpdateSearchQuery(query) => "search-query:\{query.length()}:\{query}"
    ToggleItemSaved(id, saved) => "toggle-saved:\{id}:\{saved}"
    ItemsLoaded(request_id, subscription_id, _) =>
      "items-loaded:\{request_id}:\{subscription_id}"
    SearchLoaded(request_id, query, _) =>
      "search-loaded:\{request_id}:\{query.length()}:\{query}"
    ItemSavedSet(request_id, item_id, saved, success) =>
      "saved-set:\{request_id}:\{item_id}:\{saved}:\{success}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    SelectSubscription(id) => "SelectSubscription(\{id})"
    OpenSearchModal => "OpenSearchModal"
    CloseSearchModal => "CloseSearchModal"
    UpdateSearchQuery(query) => "UpdateSearchQuery(\{query.escape(quote=true)})"
    ToggleItemSaved(id, saved) => "ToggleItemSaved(\{id}, \{saved})"
    ItemsLoaded(request_id, subscription_id, _) =>
      "ItemsLoaded(request=\{request_id}, subscription=\{subscription_id})"
    SearchLoaded(request_id, query, _) =>
      "SearchLoaded(request=\{request_id}, query=\{query.escape(quote=true)})"
    ItemSavedSet(request_id, item_id, saved, success) =>
      "ItemSavedSet(request=\{request_id}, item=\{item_id}, saved=\{saved}, success=\{success})"
  }
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("signal-reader|view=")
  output.write_string(model.active_view.to_string())
  output.write_string("|selected=")
  output.write_object(model.selected_subscription_id)
  output.write_string("|unread=")
  output.write_object(model.unread_only)
  output.write_string("|search-open=")
  output.write_object(model.search_modal_open)
  output.write_string("|query=")
  output.write_object(model.search_query.length())
  output.write_char(':')
  output.write_string(model.search_query)
  output.write_string("|loading=")
  output.write_object(model.loading)
  output.write_string("|status=")
  output.write_object(model.status_line.length())
  output.write_char(':')
  output.write_string(model.status_line)
  output.write_string("|latest-items=")
  output.write_object(model.latest_items_request_id)
  output.write_string("|latest-search=")
  output.write_object(model.latest_search_request_id)
  output.write_string("|latest-saved=")
  output.write_object(model.latest_saved_request_id)
  output.write_string("|desired-saved=")
  output.write_object(model.desired_saved)
  output.write_string("|next-request=")
  output.write_object(model.next_request_id)
  for item in model.items {
    output.write_string("|item=")
    output.write_object(item.id)
    output.write_char(':')
    output.write_object(item.subscription_id)
    output.write_char(':')
    output.write_object(item.saved)
    output.write_char(':')
    output.write_object(item.read)
    output.write_char(':')
    output.write_object(item.title.length())
    output.write_char(':')
    output.write_string(item.title)
  }
  for result in model.search_results {
    output.write_string("|result=")
    output.write_object(result.item_id)
    output.write_char(':')
    output.write_object(result.query.length())
    output.write_char(':')
    output.write_string(result.query)
    output.write_char(':')
    output.write_object(result.saved)
  }
  for request in model.pending_requests {
    output.write_string("|request=")
    output.write_object(request.effect.id)
    output.write_char(':')
    output.write_string(request.kind.to_string())
    output.write_char(':')
    output.write_object(request.subscription_id)
    output.write_char(':')
    output.write_object(request.query.length())
    output.write_char(':')
    output.write_string(request.query)
    output.write_char(':')
    output.write_object(request.item_id)
    output.write_char(':')
    output.write_object(request.saved)
  }
  output.to_string()
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let item_rows : Array[@rabbita.Html] = []
  for item in model.items {
    item_rows.push(
      @html.li("feed=\{item.subscription_id};saved=\{item.saved};\{item.title}"),
    )
  }
  let result_rows : Array[@rabbita.Html] = []
  for result in model.search_results {
    result_rows.push(@html.li("query=\{result.query};\{result.title}"))
  }
  @rabbita.Val::constant(
    @html.main_([
      @html.h1("Signal Reader"),
      @html.p("selected=\{model.selected_subscription_id}"),
      @html.p("query=\{model.search_query}"),
      @html.p(model.status_line),
      @html.ul(item_rows),
      @html.ul(result_rows),
    ]),
  )
}

///|
pub fn dependencies(_model : Model) -> Array[String] {
  [
    "external/manifests/signal-reader.json", "src/vendor/signal_reader/signal_reader.mbt",
    "src/vendor/signal_reader/UPSTREAM.md",
  ]
}

///|
fn pending_effects(model : Model) -> Array[@external.EffectDescriptor] {
  model.pending_requests.map(request => request.effect)
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property(
      "feed responses match the current subscription",
      fn(_before, msg, after) {
        match msg {
          ItemsLoaded(_, origin_subscription_id, items) =>
            if after.active_view is FeedView &&
              origin_subscription_id != after.selected_subscription_id &&
              !items.is_empty() {
              @proped.Fail(
                "response for subscription \{origin_subscription_id} replaced items while subscription \{after.selected_subscription_id} was selected",
              )
            } else {
              @proped.Pass
            }
          _ => @proped.Pass
        }
      },
    ),
    @proped.transition_property("search responses match the current query", fn(
      _before,
      msg,
      after,
    ) {
      match msg {
        SearchLoaded(_, origin_query, results) =>
          if origin_query != after.search_query && !results.is_empty() {
            @proped.Fail(
              "response for query \{origin_query.escape(quote=true)} replaced results for current query \{after.search_query.escape(quote=true)}",
            )
          } else {
            @proped.Pass
          }
        _ => @proped.Pass
      }
    }),
    @proped.transition_property("latest saved intent wins", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        ItemSavedSet(request_id, item_id, _, _) => {
          let actual = after.items
            .filter(item => item.id == item_id)
            .get(0)
            .map_or(before.desired_saved, item => item.saved)
          if request_id != before.latest_saved_request_id &&
            actual != before.desired_saved {
            @proped.Fail(
              "stale saved-state callback changed item \{item_id} away from the latest user intent",
            )
          } else {
            @proped.Pass
          }
        }
        _ => @proped.Pass
      }
    }),
    @external.unique_effect_ids_property(
      "pending request IDs remain unique", pending_effects,
    ),
    @proped.state_property("rendered selection and query match model", fn(
      model,
      html,
    ) {
      if !html.contains("selected=\{model.selected_subscription_id}") {
        @proped.Fail("rendered selection does not match model")
      } else if !html.contains("query=\{model.search_query}") {
        @proped.Fail("rendered query does not match model")
      } else {
        @proped.Pass
      }
    }),
  ]
}

///|
pub fn machine() -> @proped.Machine[Model, Msg] {
  @proped.rabbita_machine_with_action_id(
    initial(),
    update,
    actions,
    shrink,
    view,
    fingerprint,
    action_id,
    describe,
    dependencies,
  )
}

///|
pub fn default_config() -> @proped.RunConfig {
  { cases: 320, max_depth: 8, max_states: 720, seed: 67, shrink_budget: 4096 }
}
