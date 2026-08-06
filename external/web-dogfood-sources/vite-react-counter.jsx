// Reviewed boundary derived from the MIT-licensed create-vite React template.
// Upstream remains read-only; this reduced fixture preserves only the counter state transition.
import { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)

  return (
    <button type="button" onClick={() => setCount((value) => value + 1)}>
      count is {count}
    </button>
  )
}
