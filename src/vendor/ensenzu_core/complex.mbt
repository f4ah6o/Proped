///|
pub struct Complex {
  re : Double
  im : Double
} derive(Debug, Eq)

///|
pub fn Complex::Complex(re~ : Double, im~ : Double) -> Self {
  { re, im }
}

///|
pub impl Add for Complex with fn add(self, other) {
  { re: self.re + other.re, im: self.im + other.im }
}

///|
pub impl Sub for Complex with fn sub(self, other) {
  { re: self.re - other.re, im: self.im - other.im }
}

///|
pub impl Mul for Complex with fn mul(self, other) {
  {
    re: self.re * other.re - self.im * other.im,
    im: self.re * other.im + self.im * other.re,
  }
}

///|
pub impl Div for Complex with fn div(self, other) {
  let denom = other.re * other.re + other.im * other.im
  {
    re: (self.re * other.re + self.im * other.im) / denom,
    im: (self.im * other.re - self.re * other.im) / denom,
  }
}

///|
pub fn Complex::conj(self : Self) -> Self {
  { re: self.re, im: -self.im }
}

///|
pub fn Complex::abs2(self : Self) -> Double {
  self.re * self.re + self.im * self.im
}

///|
pub fn Complex::abs(self : Self) -> Double {
  self.abs2().sqrt()
}
