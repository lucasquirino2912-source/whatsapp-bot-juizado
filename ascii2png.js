const Jimp = require('jimp');
const fs = require('fs');

const [,, inputFile, outFile='qr.png', scaleArg='8'] = process.argv;
const scale = parseInt(scaleArg, 10);

if (!inputFile) {
  console.error('Usage: node ascii2png.js input.txt [out.png] [scale]');
  process.exit(1);
}

const txt = fs.readFileSync(inputFile, 'utf8').replace(/\r/g,'');
const lines = txt.split('\n').filter(l => l.length>0);
const w = Math.max(...lines.map(l => l.length));
const h = lines.length;

new Jimp(w*scale, h*scale, 0xFFFFFFFF, (err, image) => {
  if (err) throw err;
  for (let y=0; y<h; y++) {
    for (let x=0; x<w; x++) {
      const ch = (lines[y][x] || ' ');
      const color = ch === ' ' ? 0xFFFFFFFF : 0x000000FF;
      for (let dy=0; dy<scale; dy++) {
        for (let dx=0; dx<scale; dx++) {
          image.setPixelColor(color, x*scale+dx, y*scale+dy);
        }
      }
    }
  }
  image.write(outFile, () => console.log('Saved', outFile));
});
