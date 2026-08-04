///|
const NUMERIC_TOLERANCE : Double = 1.0e-6

///|
fn nearly_zero(value : Double) -> Bool {
  value.abs() <= NUMERIC_TOLERANCE
}
