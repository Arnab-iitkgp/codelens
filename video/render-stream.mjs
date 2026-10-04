import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const FPS = 30;
const DURATION = 60;
const N = DURATION * FPS; // 1800 frames

(async () => {
  console.log('Starting high-fidelity CodeLens launch film render...');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080 },
    protocolTimeout: 1200000,
  });

  const page = await browser.newPage();
  const htmlPath = path.resolve('video/codelens-launch.html');
  await page.goto('file://' + htmlPath + '?render=1');
  await page.waitForFunction('window.__ready===true');

  console.log('Rendering audio...');
  const audioBase64 = await page.evaluate(() => window.__audioWav());
  fs.writeFileSync('video/audio.wav', Buffer.from(audioBase64, 'base64'));

  // Also capture poster frame at t=4.5s
  await page.evaluate(() => window.__seek(4.5));
  const posterBuf = await page.screenshot({ type: 'jpeg', quality: 95 });
  fs.writeFileSync('public/video-poster.jpg', posterBuf);
  console.log('Saved public/video-poster.jpg');

  console.log(`Piping ${N} lossless PNG frames directly to FFmpeg with BT.709 color matrix...`);
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', String(FPS),
      '-i', 'pipe:0',
      '-i', 'video/audio.wav',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '16',
      '-vf', 'scale=in_range=full:in_color_matrix=bt709:out_range=limited:out_color_matrix=bt709,format=yuv420p',
      '-color_range', 'tv',
      '-colorspace', 'bt709',
      '-color_primaries', 'bt709',
      '-color_trc', 'bt709',
      '-c:a', 'aac',
      '-b:a', '256k',
      '-movflags', '+faststart',
      '-t', String(DURATION),
      'video/codelens-launch-60s.mp4',
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );

  for (let i = 0; i < N; i++) {
    const t = i / FPS;
    await page.evaluate((time) => window.__seek(time), t);
    const buf = await page.screenshot({ type: 'png' });
    ffmpeg.stdin.write(buf);
    if (i % 150 === 0) {
      console.log(`Rendered frame ${i}/${N} (${(i / FPS).toFixed(1)}s)`);
    }
  }

  ffmpeg.stdin.end();
  await browser.close();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  // Copy to public/video/
  fs.copyFileSync('video/codelens-launch-60s.mp4', 'public/video/codelens-launch-60s.mp4');
  console.log('Successfully rendered and updated public/video/codelens-launch-60s.mp4!');
})();
