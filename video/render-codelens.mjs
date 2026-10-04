// Renders codelens-launch.html -> codelens-launch-60s.mp4 (1920x1080, 30fps, with the synthesized soundtrack)
// Requirements: Node 18+, ffmpeg on PATH.   Setup:  npm i puppeteer
// Run:          node render-codelens.mjs        (put this file next to codelens-launch.html)
import puppeteer from 'puppeteer';
import fs from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
const FPS = 30, N = 60 * FPS, dir = 'frames';
fs.mkdirSync(dir, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1920, height: 1080 }, protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto('file://' + path.resolve('codelens-launch.html') + '?render=1');
await page.waitForFunction('window.__ready===true');
console.log('Rendering audio...');
fs.writeFileSync('audio.wav', Buffer.from(await page.evaluate(() => window.__audioWav()), 'base64'));
for (let i = 0; i < N; i++) {
  const f = `${dir}/f${String(i).padStart(5, '0')}.jpg`;
  if (fs.existsSync(f)) continue;                       // resumable
  await page.evaluate(t => window.__seek(t), i / FPS);
  fs.writeFileSync(f, await page.screenshot({ type: 'jpeg', quality: 95 }));
  if (i % 100 === 0) console.log(`frame ${i}/${N}`);
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`, '-i', 'audio.wav', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', '60', 'codelens-launch-60s.mp4'], { stdio: 'inherit' });
console.log('Done: codelens-launch-60s.mp4');
