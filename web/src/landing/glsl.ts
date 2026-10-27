/** Shared GLSL for the hero objects: a dark body lit by one soft light, with a rim light in the product's accent colour. */
export const MESH_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

/** Fresnel term (0 face-on, 1 at the silhouette) and a soft key light. */
export const RIM_FN = /* glsl */ `
float rim(vec3 n, vec3 v, float power) {
  return pow(1.0 - max(dot(normalize(n), normalize(v)), 0.0), power);
}
float soft(vec3 n) {
  return 0.22 + 0.78 * max(dot(normalize(n), normalize(vec3(-0.45, 0.8, 0.5))), 0.0);
}`;
