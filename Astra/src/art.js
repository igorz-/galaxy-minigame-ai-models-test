import { mulberry32 } from './engine.js';

// Spherical, seeded surface textures: all artwork is generated locally.
const cache = new Map();
export function planetArt(id, profile, seed, size = 192) {
  const key = `${id}-${profile}-${seed}-${size}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = mulberry32(seed + id * 137);
  const table = Array.from({ length: 32 * 32 * 32 }, random);
  const smooth = t => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function noise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const at = (a, b, c) => table[((a & 31) * 32 + (b & 31)) * 32 + (c & 31)];
    return lerp(lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), fx), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), fx), fy), lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), fx), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), fx), fy), fz);
  }
  const palettes = {
    Trade: [[35, 72, 83], [86, 143, 135], [190, 205, 165]],
    Forge: [[91, 47, 32], [185, 105, 61], [232, 189, 134]],
    Bastion: [[61, 57, 91], [121, 116, 155], [186, 184, 201]],
    Homeworld: id === 5 ? [[29, 60, 68], [67, 118, 125], [165, 187, 167]] : [[71, 46, 76], [132, 83, 111], [205, 169, 157]],
    'Ancient relay': [[85, 65, 34], [179, 145, 77], [244, 223, 160]],
  };
  const palette = palettes[profile];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px + .5 - size / 2) / (size / 2 - 2), y = (py + .5 - size / 2) / (size / 2 - 2);
    const r = x * x + y * y;
    if (r > 1) continue;
    const z = Math.sqrt(1 - r);
    let n = noise(x * 3 + 8, y * 3 + 8, z * 3 + 8) * .55 + noise(x * 9 + 8, y * 9 + 8, z * 9 + 8) * .28 + noise(x * 28 + 8, y * 28 + 8, z * 28 + 8) * .17;
    if (profile === 'Forge' || profile === 'Ancient relay') n = n * .55 + (.5 + .5 * Math.sin(y * 35 + x * 4 + n * 15)) * .45;
    n = Math.max(0, Math.min(.999, (n - .27) * 2.2));
    const a = palette[n < .5 ? 0 : 1], b = palette[n < .5 ? 1 : 2], t = (n % .5) * 2;
    const light = Math.max(.075, (-x * .48 - y * .42 + z * .68)) * .96;
    const atmosphere = Math.pow(1 - z, 4) * .24;
    const i = (py * size + px) * 4;
    for (let c = 0; c < 3; c++) image.data[i + c] = lerp(a[c], b[c], t) * light + atmosphere * palette[2][c];
    image.data[i + 3] = Math.min(255, (1 - r) * size * 180);
  }
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

export function starArt(seed) {
  const random = mulberry32(seed);
  let svg = '';
  for (let i = 0; i < 440; i++) {
    const x = random() * 920, y = random() * 660, radius = random() * .85 + .2;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${i % 5 ? '#c5d4d7' : '#e8ba84'}" opacity="${(random() * .55 + .1).toFixed(2)}"/>`;
    if (i % 75 === 0) svg += `<path d="M${x - 3},${y}h6 M${x},${y - 3}v6" stroke="#c5d4d7" stroke-width=".5" opacity=".5"/>`;
  }
  return svg;
}
