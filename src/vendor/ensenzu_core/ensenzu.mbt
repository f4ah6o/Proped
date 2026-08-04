///|
pub(all) struct DiagramSize {
  width : Double
  height : Double
} derive(Debug, Eq)

///|
pub fn default_size() -> DiagramSize {
  { width: 900.0, height: 640.0 }
}
