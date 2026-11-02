export function vsub(v: Float32Array, m: Float32Array): Float32Array {
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] - m[i];
  return o;
}

export function unit(v: Float32Array): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / s;
  return o;
}
