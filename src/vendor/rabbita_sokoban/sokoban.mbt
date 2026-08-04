///|
// Adapted from moonbit-community/rabbita examples/sokoban at revision
// 67e8169efa1bb2e8bd17018b62b41211cbc4c357.
//
// Changes from upstream:
// - expose the board, model, transition, and view as a reusable package;
// - replace browser Keyboard events with typed directions;
// - use arrays for deterministic native exploration;
// - bound history growth while retaining branching timeline behavior;
// - preserve invalid JumpTo parsing as cursor 0, which is detected by a
//   property because malformed timeline input unexpectedly rewinds history.
//
// Licensed under Apache-2.0. See LICENSE and UPSTREAM.md in this directory.
pub(all) enum Tile {
  Wall
  Floor
  Goal
} derive(Debug, Eq)

///|
pub(all) struct Pos {
  x : Int
  y : Int
} derive(Debug, Eq)

///|
pub(all) struct World {
  player : Pos
  crates : Array[Pos]
} derive(Debug, Eq)

///|
pub(all) enum Direction {
  Up
  Down
  Left
  Right
} derive(Debug, Eq)

///|
pub(all) enum Msg {
  Move(Direction)
  JumpTo(String)
} derive(Debug, Eq)

///|
pub(all) struct Model {
  history : Array[World]
  cursor : Int
} derive(Debug, Eq)

///|
let board : Array[Array[Tile]] = [
  [Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Wall, Floor, Floor, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Goal, Floor, Floor, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Goal, Floor, Floor, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Goal, Floor, Floor, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Floor, Floor, Floor, Wall],
  [Wall, Floor, Floor, Floor, Floor, Floor, Wall, Wall, Floor, Wall],
  [Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall, Wall],
]

///|
pub fn initial_world() -> World {
  {
    player: { x: 2, y: 5 },
    crates: [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }],
  }
}

///|
pub fn initial() -> Model {
  { history: [initial_world()], cursor: 0 }
}

///|
pub fn tile_at(position : Pos) -> Tile {
  if position.x < 0 ||
    position.y < 0 ||
    position.y >= board.length() ||
    position.x >= board[position.y].length() {
    Wall
  } else {
    board[position.y][position.x]
  }
}

///|
fn crate_index_at(crates : Array[Pos], position : Pos) -> Int? {
  for index, crate in crates {
    if crate == position {
      return Some(index)
    }
  }
  None
}

///|
fn direction_delta(direction : Direction) -> Pos {
  match direction {
    Up => { x: 0, y: -1 }
    Down => { x: 0, y: 1 }
    Left => { x: -1, y: 0 }
    Right => { x: 1, y: 0 }
  }
}

///|
pub fn try_move(direction : Direction, world : World) -> World? {
  let delta = direction_delta(direction)
  let target = { x: world.player.x + delta.x, y: world.player.y + delta.y }
  if tile_at(target) == Wall {
    return None
  }
  match crate_index_at(world.crates, target) {
    Some(crate_index) => {
      let crate_target = { x: target.x + delta.x, y: target.y + delta.y }
      if tile_at(crate_target) == Wall ||
        crate_index_at(world.crates, crate_target) is Some(_) {
        None
      } else {
        let crates = world.crates.copy()
        crates[crate_index] = crate_target
        Some({ player: target, crates })
      }
    }
    None => Some({ ..world, player: target })
  }
}

///|
fn clamp(min : Int, max : Int, value : Int) -> Int {
  Int::min(Int::max(min, value), max)
}

///|
fn branch_history(model : Model, next : World) -> Array[World] {
  let result : Array[World] = []
  for index = 0; index <= model.cursor; index = index + 1 {
    result.push(model.history[index])
  }
  result.push(next)
  result
}

///|
pub fn update(model : Model, msg : Msg) -> Model {
  match msg {
    Move(direction) =>
      match try_move(direction, model.history[model.cursor]) {
        Some(next) =>
          { history: branch_history(model, next), cursor: model.cursor + 1 }
        None => model
      }
    JumpTo(point) => {
      let index = @string.parse_int(point) catch { _ => 0 }
      { ..model, cursor: clamp(0, model.history.length() - 1, index) }
    }
  }
}

///|
fn push_move(
  actions : Array[Msg],
  model : Model,
  direction : Direction,
) -> Unit {
  if try_move(direction, model.history[model.cursor]) is Some(_) {
    actions.push(Move(direction))
  }
}

///|
pub fn actions(model : Model) -> Array[Msg] {
  let result : Array[Msg] = []
  if model.history.length() < 6 {
    push_move(result, model, Up)
    push_move(result, model, Down)
    push_move(result, model, Left)
    push_move(result, model, Right)
  }
  if model.cursor > 0 {
    result.push(JumpTo("not-a-number"))
    result.push(JumpTo("0"))
  }
  let last = model.history.length() - 1
  if model.cursor != last {
    result.push(JumpTo(last.to_string()))
  }
  result
}

///|
pub fn shrink(msg : Msg) -> Array[Msg] {
  match msg {
    Move(direction) if direction != Up => [Move(Up)]
    JumpTo(point) if point != "not-a-number" => [JumpTo("not-a-number")]
    _ => []
  }
}

///|
fn Direction::tag(self : Direction) -> String {
  match self {
    Up => "up"
    Down => "down"
    Left => "left"
    Right => "right"
  }
}

///|
fn Direction::label(self : Direction) -> String {
  match self {
    Up => "Up"
    Down => "Down"
    Left => "Left"
    Right => "Right"
  }
}

///|
pub fn action_id(msg : Msg) -> String {
  match msg {
    Move(direction) => "move:\{direction.tag()}"
    JumpTo(point) => "jump:\{point.length()}:\{point}"
  }
}

///|
pub fn describe(msg : Msg) -> String {
  match msg {
    Move(direction) => "Move(\{direction.label()})"
    JumpTo(point) => "JumpTo(\{point.escape(quote=true)})"
  }
}

///|
fn write_pos(output : StringBuilder, position : Pos) -> Unit {
  output.write_object(position.x)
  output.write_char(',')
  output.write_object(position.y)
}

///|
pub fn fingerprint(model : Model) -> String {
  let output = StringBuilder::new()
  output.write_string("rabbita-sokoban|cursor=")
  output.write_object(model.cursor)
  for index, world in model.history {
    output.write_string("|world=")
    output.write_object(index)
    output.write_string(":p=")
    write_pos(output, world.player)
    for crate in world.crates {
      output.write_string(":c=")
      write_pos(output, crate)
    }
  }
  output.to_string()
}

///|
fn tile_class(world : World, position : Pos) -> String {
  let tile = tile_at(position)
  let has_crate = crate_index_at(world.crates, position) is Some(_)
  if has_crate && tile == Goal {
    "tile goal crate-home"
  } else if has_crate {
    "tile crate"
  } else if world.player == position {
    "tile player"
  } else {
    match tile {
      Wall => "tile wall"
      Floor => "tile floor"
      Goal => "tile goal"
    }
  }
}

///|
pub fn view(model : Model) -> @rabbita.Val[@rabbita.Html] {
  let world = model.history[model.cursor]
  let rows : Array[@rabbita.Html] = []
  for y = 0; y < board.length(); y = y + 1 {
    let cells : Array[@rabbita.Html] = []
    for x = 0; x < board[y].length(); x = x + 1 {
      let position = { x, y }
      cells.push(@html.span(class=tile_class(world, position), "\{x},\{y}"))
    }
    rows.push(@html.div(class="board-row", cells))
  }
  let page = @html.main_(class="page", [
    @html.h1("Sokoban"),
    @html.div(class="board", rows),
    @html.div(
      class="timeline-count",
      "\{model.cursor} / \{model.history.length() - 1}",
    ),
  ])
  @rabbita.Val::constant(page)
}

///|
pub fn dependencies(_ : Model) -> Array[String] {
  [
    "src/vendor/rabbita_sokoban/upstream/main.mbt.txt", "src/vendor/rabbita_sokoban/upstream/styles.css",
    "src/vendor/rabbita_sokoban/sokoban.mbt",
  ]
}

///|
fn valid_world(world : World) -> String? {
  if tile_at(world.player) == Wall {
    return Some("player occupies a wall")
  }
  for index, crate in world.crates {
    if tile_at(crate) == Wall {
      return Some("crate \{index} occupies a wall")
    }
    if crate == world.player {
      return Some("player overlaps crate \{index}")
    }
    for other = index + 1; other < world.crates.length(); other = other + 1 {
      if crate == world.crates[other] {
        return Some("crates overlap")
      }
    }
  }
  None
}

///|
pub fn properties() -> Array[@proped.Property[Model, Msg]] {
  [
    @proped.transition_property("invalid timeline input preserves cursor", fn(
      before,
      msg,
      after,
    ) {
      match msg {
        JumpTo("not-a-number") if after.cursor != before.cursor =>
          @proped.Fail(
            "invalid timeline input rewound cursor from \{before.cursor} to \{after.cursor}",
          )
        _ => @proped.Pass
      }
    }),
    @proped.state_property("cursor remains inside history", fn(model, _) {
      if model.cursor < 0 || model.cursor >= model.history.length() {
        @proped.Fail("cursor escaped history bounds")
      } else {
        @proped.Pass
      }
    }),
    @proped.state_property("all historical worlds remain valid", fn(model, _) {
      for world in model.history {
        match valid_world(world) {
          Some(message) => return @proped.Fail(message)
          None => ()
        }
      }
      @proped.Pass
    }),
    @proped.state_property("rendered timeline matches model", fn(model, html) {
      let expected = "\{model.cursor} / \{model.history.length() - 1}"
      if html.contains(expected) {
        @proped.Pass
      } else {
        @proped.Fail("rendered timeline did not match cursor and history")
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
  { cases: 192, max_depth: 12, max_states: 480, seed: 41, shrink_budget: 4096 }
}
