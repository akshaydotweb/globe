// Simple polygon clipping (Sutherland–Hodgman)

export function clipPolygon(polygon, bounds) {
  let output = polygon

  const edges = [
    { inside: p => p[0] >= bounds.minX, intersect: (a,b)=>intersectX(bounds.minX,a,b) },
    { inside: p => p[0] <= bounds.maxX, intersect: (a,b)=>intersectX(bounds.maxX,a,b) },
    { inside: p => p[1] >= bounds.minY, intersect: (a,b)=>intersectY(bounds.minY,a,b) },
    { inside: p => p[1] <= bounds.maxY, intersect: (a,b)=>intersectY(bounds.maxY,a,b) }
  ]

  edges.forEach(edge => {
    const input = output
    output = []

    for (let i = 0; i < input.length; i++) {
      const A = input[i]
      const B = input[(i + 1) % input.length]

      const insideA = edge.inside(A)
      const insideB = edge.inside(B)

      if (insideA && insideB) {
        output.push(B)
      } else if (insideA && !insideB) {
        output.push(edge.intersect(A, B))
      } else if (!insideA && insideB) {
        output.push(edge.intersect(A, B))
        output.push(B)
      }
    }
  })

  return output
}

function intersectX(x, a, b) {
  const t = (x - a[0]) / (b[0] - a[0])
  return [x, a[1] + t * (b[1] - a[1])]
}

function intersectY(y, a, b) {
  const t = (y - a[1]) / (b[1] - a[1])
  return [a[0] + t * (b[0] - a[0]), y]
}