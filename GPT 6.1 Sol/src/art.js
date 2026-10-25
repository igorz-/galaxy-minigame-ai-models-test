import { mulberry32 } from './engine.js';

function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}
function fbm(x, y) {
  let sum = 0, amp = .5;
  for (let i = 0; i < 5; i++) { sum += noise(x, y) * amp; x = x * 2.03 + 7.1; y = y * 2.03 + 3.4; amp *= .5; }
  return sum;
}
const palettes = [
  [[42, 70, 78], [164, 166, 127], [217, 207, 169]],
  [[90, 49, 31], [204, 129, 71], [235, 197, 137]],
  [[56, 67, 67], [129, 141, 127], [201, 203, 180]],
  [[63, 58, 75], [146, 131, 147], [215, 194, 177]],
  [[30, 57, 79], [88, 133, 152], [193, 207, 207]],
];
export function makePlanet(world, seed) {
  const size = 180, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
  const rand = mulberry32(seed + world.id * 731), offset = rand() * 300;
  const palette = world.relay ? [[62, 57, 95], [167, 151, 197], [236, 224, 250]] : palettes[world.home ? (world.id === 5 ? 1 : 4) : Math.floor(rand() * palettes.length)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x - size / 2) / (size * .46), ny = (y - size / 2) / (size * .46), r = nx * nx + ny * ny;
    if (r > 1) continue;
    const z = Math.sqrt(1 - r), u = Math.atan2(nx, z) * 2.7 + offset, v = Math.asin(ny) * 3.5;
    let terrain = fbm(u, v + offset);
    if (world.profile === 'Forge' || world.relay) terrain = terrain * .55 + (Math.sin(ny * 31 + terrain * 13) * .5 + .5) * .45;
    const t = Math.max(0, Math.min(1, (terrain - .22) * 1.9)), a = t < .5 ? palette[0] : palette[1], b = t < .5 ? palette[1] : palette[2], mix = (t % .5) * 2;
    const light = Math.max(0, nx * -.52 + ny * -.4 + z * .75), shade = .09 + .91 * Math.pow(light, .85);
    const rim = Math.pow(1 - z, 5) * .18, grain = (rand() - .5) * 9;
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) image.data[i + c] = (a[c] * (1 - mix) + b[c] * mix) * shade + rim * palette[2][c] + grain;
    image.data[i + 3] = Math.min(255, (1 - Math.sqrt(r)) * size * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}
export function paintStars(canvas, seed) {
  const ctx = canvas.getContext('2d'); canvas.width = 1600; canvas.height = 1000;
  const r = mulberry32(seed);
  for (let i = 0; i < 620; i++) {
    const x = r() * 1600, y = r() * 1000, radius = r() < .025 ? 1.7 : r() * .9;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(220,222,222,${r() * .55 + .1})`; ctx.fill();
    if (radius > 1.4) { ctx.fillStyle = '#dcd1ae25'; ctx.fillRect(x - 5, y - .4, 10, .8); ctx.fillRect(x - .4, y - 5, .8, 10); }
  }
}
