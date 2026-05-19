const Jimp = require('jimp');

async function main() {
  const imgA = await Jimp.read('./public/Image A.png');
  const imgB = await Jimp.read('./public/Image B.png');

  console.log("Image A size:", imgA.bitmap.width, imgA.bitmap.height);
  console.log("Image B size:", imgB.bitmap.width, imgB.bitmap.height);

  for (let i = 0; i < 5; i++) {
    const cA = Jimp.intToRGBA(imgA.getPixelColor(i, 0));
    const cB = Jimp.intToRGBA(imgB.getPixelColor(i, 0));
    console.log(`Image A pixel (0, ${i}):`, cA);
    console.log(`Image B pixel (0, ${i}):`, cB);
  }
}

main().catch(console.error);
