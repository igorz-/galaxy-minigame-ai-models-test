import { mulberry32 } from "./engine.js";

// Locally rendered spherical terrain: no external images or GPU required.
const palettes = [
  [
    [56, 65, 72],
    [151, 143, 122],
  ],
  [
    [97, 53, 34],
    [218, 166, 100],
  ],
  [
    [41, 63, 70],
    [142, 179, 177],
  ],
  [
    [94, 64, 69],
    [183, 136, 114],
  ],
  [
    [72, 67, 45],
    [165, 155, 108],
  ],
  [
    [29, 69, 81],
    [125, 160, 128],
  ],
  [
    [47, 81, 65],
    [157, 171, 112],
  ],
  [
    [65, 56, 98],
    [177, 150, 197],
  ],
  [
    [80, 75, 63],
    [198, 184, 147],
  ],
  [
    [47, 53, 66],
    [138, 149, 164],
  ],
  [
    [70, 67, 57],
    [158, 149, 120],
  ],
  [
    [53, 75, 74],
    [142, 173, 159],
  ],
  [
    [65, 56, 98],
    [177, 150, 197],
  ],
  [
    [89, 65, 43],
    [193, 166, 106],
  ],
  [
    [99, 48, 34],
    [208, 142, 87],
  ],
  [
    [50, 60, 78],
    [134, 151, 179],
  ],
  [
    [96, 55, 40],
    [207, 149, 104],
  ],
  [
    [73, 75, 42],
    [161, 177, 115],
  ],
  [
    [42, 50, 57],
    [128, 140, 146],
  ],
  [
    [72, 63, 49],
    [168, 148, 109],
  ],
];
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;
function makeNoise(seed) {
  const rand = mulberry32(seed),
    grid = Array.from({ length: 128 * 128 }, rand);
  return (x, y) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = smooth(x - ix),
      fy = smooth(y - iy);
    const at = (a, b) =>
      grid[(((b % 128) + 128) % 128) * 128 + (((a % 128) + 128) % 128)];
    return mix(
      mix(at(ix, iy), at(ix + 1, iy), fx),
      mix(at(ix, iy + 1), at(ix + 1, iy + 1), fx),
      fy,
    );
  };
}
export function planetArt(id, seed) {
  const size = 224,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d"),
    img = ctx.createImageData(size, size),
    data = img.data;
  const noise = makeNoise((seed + id * 389) >>> 0),
    [dark, light] = palettes[id];
  const radius = 98,
    center = 112;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = (x - center) / radius,
        ny = (y - center) / radius,
        rr = nx * nx + ny * ny,
        index = (y * size + x) * 4;
      if (rr > 1.08) continue;
      if (rr > 1) {
        const glow = Math.pow(1 - (rr - 1) / 0.08, 2);
        data[index] = 95;
        data[index + 1] = 136;
        data[index + 2] = 153;
        data[index + 3] = glow * 39;
        continue;
      }
      const z = Math.sqrt(1 - rr),
        u = Math.atan2(nx, z) * 9 + 40,
        v = Math.asin(ny) * 9 + 30;
      let n =
        noise(u, v) * 0.52 +
        noise(u * 2.4, v * 2.4) * 0.28 +
        noise(u * 6.2, v * 6.2) * 0.14 +
        noise(u * 19, v * 19) * 0.06;
      if ([0, 1, 4, 8, 13, 14, 16, 19].includes(id))
        n =
          n * 0.56 +
          (Math.sin(v * 5 + noise(u * 0.4, v * 0.8) * 8) * 0.5 + 0.5) * 0.44;
      if ([5, 6, 11, 17].includes(id))
        n = n > 0.51 ? Math.min(1, (n - 0.4) * 2) : n * 0.43;
      const diffuse = Math.max(0, -nx * 0.52 - ny * 0.48 + z * 0.7),
        lighting = 0.08 + 0.95 * Math.pow(diffuse, 0.85);
      const rim = Math.pow(1 - z, 3) * 0.25;
      for (let c = 0; c < 3; c++)
        data[index + c] = Math.min(
          255,
          mix(dark[c], light[c], n) * lighting + rim * [54, 87, 105][c],
        );
      data[index + 3] = Math.min(255, (1 - rr) * 1400);
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
export function starfield(seed) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1050;
  const ctx = canvas.getContext("2d"),
    random = mulberry32(seed + 9811);
  ctx.fillStyle = "#0b1015";
  ctx.fillRect(0, 0, 1600, 1050);
  const clouds = [
    [700, 500, 570, "42,65,58"],
    [1150, 260, 510, "64,49,82"],
    [380, 720, 460, "31,55,64"],
  ];
  for (const [x, y, r, c] of clouds) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${c},.34)`);
    g.addColorStop(0.45, `rgba(${c},.12)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1600, 1050);
  }
  for (let i = 0; i < 1100; i++) {
    const x = random() * 1600,
      y = random() * 1050,
      r = random() > 0.98 ? 1.5 : random() * 0.8 + 0.2;
    const alpha = random() * 0.5 + 0.06;
    ctx.fillStyle = `rgba(193,210,206,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.3) {
      ctx.strokeStyle = `rgba(190,215,217,${alpha * 0.3})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();
    }
  }
  return canvas.toDataURL();
}
