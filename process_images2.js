async function main() {
  const jimpModule = await import('jimp');
  const Jimp = jimpModule.default ?? jimpModule.Jimp ?? jimpModule;

  const imgA = await Jimp.read('./public/Image A.png');
  const imgB = await Jimp.read('./public/Image B.png');

  let cntA = {};
  let cntB = {};
  for(let y = 0; y < imgA.bitmap.height; y++) {
    for(let x = 0; x < imgA.bitmap.width; x++) {
      const {r, g, b} = Jimp.intToRGBA(imgA.getPixelColor(x, y));
      const key = `${r},${g},${b}`;
      cntA[key] = (cntA[key] || 0) + 1;
    }
  }

  const sortedA = Object.entries(cntA).sort((a,b) => b[1] - a[1]).slice(0, 10);
  console.log("Top 10 colors Image A:", sortedA);

  for(let y = 0; y < imgB.bitmap.height; y++) {
    for(let x = 0; x < imgB.bitmap.width; x++) {
      const {r, g, b} = Jimp.intToRGBA(imgB.getPixelColor(x, y));
      const key = `${r},${g},${b}`;
      cntB[key] = (cntB[key] || 0) + 1;
    }
  }
  const sortedB = Object.entries(cntB).sort((a,b) => b[1] - a[1]).slice(0, 10);
  console.log("Top 10 colors Image B:", sortedB);

}

main().catch(console.error);
