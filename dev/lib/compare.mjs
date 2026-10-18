// Comparing screenshots in the browser (no image library needed): how far apart two images are,
// and a sheet with both side by side and their difference (amplified).
import fs from 'node:fs';

const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;

// rows: [{ label, a: file, b: file }].  Returns each row's mean and max channel difference
// (0-255) and writes the sheet to `sheetFile`.
export const compareImages = async (browser, rows, sheetFile, amplify = 4) => {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async (rows, amplify) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const pixels = (img) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height);
      };
      const loaded = [];
      for (const row of rows)
        loaded.push({ label: row.label, a: await load(row.a), b: await load(row.b) });
      const w = Math.max(...loaded.map((r) => r.a.width));
      const h = Math.max(...loaded.map((r) => r.a.height));
      const sheet = document.createElement('canvas');
      sheet.width = w * 3 + 20;
      sheet.height = (h + 16) * loaded.length;
      const ctx = sheet.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      const stats = [];
      loaded.forEach((row, i) => {
        const pa = pixels(row.a);
        const pb = pixels(row.b);
        const diff = new ImageData(pa.width, pa.height);
        let sum = 0;
        let max = 0;
        for (let k = 0; k < pa.data.length; k += 4) {
          for (let ch = 0; ch < 3; ch++) {
            const d = Math.abs(pa.data[k + ch] - (pb.data[k + ch] ?? 0));
            sum += d;
            max = Math.max(max, d);
            diff.data[k + ch] = Math.min(255, d * amplify);
          }
          diff.data[k + 3] = 255;
        }
        const mean = sum / (pa.width * pa.height * 3);
        stats.push({ label: row.label, mean: +mean.toFixed(2), max });
        const y = i * (h + 16);
        ctx.fillStyle = '#000';
        ctx.font = '11px sans-serif';
        ctx.fillText(`${row.label}  mean=${mean.toFixed(2)} max=${max}`, 2, y + 11);
        ctx.drawImage(row.a, 0, y + 14);
        ctx.drawImage(row.b, w + 10, y + 14);
        ctx.putImageData(diff, w * 2 + 20, y + 14);
      });
      return { stats, sheet: sheet.toDataURL('image/png') };
    },
    rows.map((r) => ({ label: r.label, a: dataUrl(r.a), b: dataUrl(r.b) })),
    amplify,
  );
  await page.close();
  fs.writeFileSync(sheetFile, Buffer.from(result.sheet.split(',')[1], 'base64'));
  return result.stats;
};
