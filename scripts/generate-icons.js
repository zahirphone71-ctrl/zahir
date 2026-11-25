import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function generateAllIcons() {
  console.log('[Icon Generator] Generating exact 3D Gold ZC application icons from source image...');

  const inputJpg = path.resolve(process.cwd(), 'src/assets/images/zc_gold_logo_1788275481340.jpg');
  const dirs = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'build'),
    path.resolve(process.cwd(), 'assets'),
    path.resolve(process.cwd(), 'dist')
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 1. Process source: Prioritize the official vector SVG (public/icon.svg) displayed in LogoZ and throughout the app
  let masterPngBuffer;
  const inputSvg = path.resolve(process.cwd(), 'public/icon.svg');

  if (fs.existsSync(inputSvg)) {
    console.log('[Icon Generator] Rendering master 1024x1024 PNG directly from official vector logo (public/icon.svg)...');
    const svgBuf = fs.readFileSync(inputSvg);
    masterPngBuffer = await sharp(svgBuf, { density: 300 })
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();
  } else if (fs.existsSync(inputJpg)) {
    console.log('[Icon Generator] Fallback to JPG source...');
    const { data, info } = await sharp(inputJpg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const outBuf = Buffer.alloc(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const diff = max - min;
      
      let alpha = 255;
      if (diff < 18 && min > 185) {
        alpha = 0; // Pure transparent background
      } else if (diff < 28 && min > 165) {
        const factor = (min - 165) / 20;
        alpha = Math.max(0, Math.min(255, Math.round(255 * (1 - factor))));
      }

      outBuf[i * 4] = r;
      outBuf[i * 4 + 1] = g;
      outBuf[i * 4 + 2] = b;
      outBuf[i * 4 + 3] = alpha;
    }

    masterPngBuffer = await sharp(outBuf, { raw: { width, height, channels: 4 } })
      .trim()
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();
  } else {
    // Fallback if image not found
    masterPngBuffer = fs.readFileSync(path.resolve(process.cwd(), 'public', 'icon.png'));
  }

  // 2. Generate PNGs at required sizes with Lanczos resampling
  const sizes = [512, 256, 192, 180, 128, 64, 48, 32, 16];
  const pngBuffers = {};

  for (const size of sizes) {
    const buf = await sharp(masterPngBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ quality: 100, compressionLevel: 9 })
      .toBuffer();
    pngBuffers[size] = buf;
  }

  // Save standard icon files
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'icon.png'), pngBuffers[512]);
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'icon-512.png'), pngBuffers[512]);
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'icon-256.png'), pngBuffers[256]);
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'icon-192.png'), pngBuffers[192]);
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'apple-touch-icon.png'), pngBuffers[180]);

  fs.writeFileSync(path.resolve(process.cwd(), 'build', 'icon.png'), pngBuffers[512]);
  fs.writeFileSync(path.resolve(process.cwd(), 'build', 'icon-256.png'), pngBuffers[256]);

  fs.writeFileSync(path.resolve(process.cwd(), 'assets', 'icon.png'), pngBuffers[512]);
  fs.writeFileSync(path.resolve(process.cwd(), 'icon.png'), pngBuffers[512]);

  // 3. Keep pristine vector SVG
  if (fs.existsSync(path.resolve(process.cwd(), 'public', 'icon.svg'))) {
    const svgBuf = fs.readFileSync(path.resolve(process.cwd(), 'public', 'icon.svg'));
    fs.writeFileSync(path.resolve(process.cwd(), 'build', 'icon.svg'), svgBuf);
    fs.writeFileSync(path.resolve(process.cwd(), 'icon.svg'), svgBuf);
  }

  // 4. Generate Multi-Resolution Windows ICO
  function createIcoFromPngs(pngList) {
    const count = pngList.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    let offset = headerSize + count * dirEntrySize;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // Type: 1 = ICO
    header.writeUInt16LE(count, 4); // Number of images

    const entries = [];
    for (const item of pngList) {
      const entry = Buffer.alloc(dirEntrySize);
      entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
      entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
      entry.writeUInt8(0, 2); // Color palette
      entry.writeUInt8(0, 3); // Reserved
      entry.writeUInt16LE(1, 4); // Color planes
      entry.writeUInt16LE(32, 6); // Bits per pixel
      entry.writeUInt32LE(item.buffer.length, 8); // Size of image data
      entry.writeUInt32LE(offset, 12); // Offset of image data
      entries.push(entry);
      offset += item.buffer.length;
    }

    return Buffer.concat([header, ...entries, ...pngList.map(item => item.buffer)]);
  }

  const icoList = [
    { width: 256, height: 256, buffer: pngBuffers[256] },
    { width: 128, height: 128, buffer: pngBuffers[128] },
    { width: 64, height: 64, buffer: pngBuffers[64] },
    { width: 48, height: 48, buffer: pngBuffers[48] },
    { width: 32, height: 32, buffer: pngBuffers[32] },
    { width: 16, height: 16, buffer: pngBuffers[16] }
  ];

  const icoBuffer = createIcoFromPngs(icoList);

  // Save ICO files
  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'favicon.ico'), icoBuffer);
  fs.writeFileSync(path.resolve(process.cwd(), 'build', 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.resolve(process.cwd(), 'build', 'installerHeaderIcon.ico'), icoBuffer);
  fs.writeFileSync(path.resolve(process.cwd(), 'assets', 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.resolve(process.cwd(), 'icon.ico'), icoBuffer);

  // Web App Manifest
  const manifest = {
    name: "ZCtrl | MikroTik Management & Card Studio",
    short_name: "ZCtrl",
    description: "نظام تحكم وإدارة سيرفرات مايكروتك وتوليد وطباعة الكروت",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  };

  fs.writeFileSync(path.resolve(process.cwd(), 'public', 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('✅ [Icon Generator] All icons perfectly updated to match the exact 3D Gold ZC image!');
}

generateAllIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
