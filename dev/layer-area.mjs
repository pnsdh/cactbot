// The compositor's layers for the cbkr timeline with six running bars: how many and how much area
// (what the GPU composites every frame).
//
// node layer-area.mjs [page]
// page: raidboss (dist/, default) or the URL of another build's raidboss.html.
import { launch, openPage, wait } from './lib/overlay.mjs';

const [page = 'raidboss'] = process.argv.slice(2);
const browser = await launch();
const { page: p } = await openPage(browser, page, { query: 'timeline=1&alerts=0' });
await p.evaluate(() => {
  for (let i = 0; i < 6; i++) {
    const div = document.createElement('div');
    div.className = `timer-bar${i === 0 ? ' next' : ''}${i === 1 ? ' soon' : ''}`;
    const bar = document.createElement('timer-bar');
    div.appendChild(bar);
    bar.righttext = 'remain';
    bar.lefttext = `줄 ${i + 1}`;
    bar.toward = 'right';
    bar.stylefill = 'fill';
    document.getElementById('timeline').appendChild(div);
    bar.duration = 30;
    bar.value = 5 + i * 4;
  }
});
await wait(1500);
const cdp = await p.target().createCDPSession();
const layers = await new Promise((resolve) => {
  cdp.on('LayerTree.layerTreeDidChange', (e) => {
    if (e.layers)
      resolve(e.layers);
  });
  void cdp.send('LayerTree.enable');
});
await browser.close();
const drawing = layers.filter((l) => l.drawsContent);
console.log(JSON.stringify({
  page,
  layers: layers.length,
  drawing: drawing.length,
  areaMpx: +(drawing.reduce((s, l) => s + l.width * l.height, 0) / 1e6).toFixed(3),
  over20kpx: drawing.filter((l) => l.width * l.height > 20000).length,
}));
