// Requires a built Storybook served locally and macOS sips. No image-generation API.
// Usage: node scripts/export-ipad-assets.mjs [http://127.0.0.1:8082/storybook/]
import { webkit } from '@playwright/test';
import { captureIPadStartScreens } from './lib/capture-ipad-start-screens.mjs';
import { mkdir, readFile, writeFile, copyFile, readdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'design-assets/ipad-release');
const base = process.argv[2] ?? 'http://127.0.0.1:8082/storybook/';
// Parts/social exports retain the simple native launch source.
const story = new URL('iframe.html?id=ipad-assets-start-screens--native-parts&viewMode=story', base).href;
const release = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
const screenMetadata = await captureIPadStartScreens({ base, output, screens: release.screens });
const iconSizes = [16,20,29,32,36,40,48,57,58,60,70,72,76,80,87,96,114,120,128,144,150,152,167,180,192,256,310,512,1024];
const manifest = {
  ...screenMetadata,
  icon: 'Existing blue piano artwork, unchanged; resized from its opaque 1024px original.',
  regenerate: 'npx storybook build -o dist/storybook && node scripts/export-ipad-assets.mjs',
  launch: 'Native applications use independent adaptive storyboards and 1x/2x/3x sliced key assets. Full-screen PNGs are exports, not stretched native launch backgrounds.',
  sources: [
    'https://developer.apple.com/documentation/xcode/specifying-your-apps-launch-screen',
    'https://developer.apple.com/design/human-interface-guidelines/app-icons',
    'https://www.apple.com/ipad-air/specs/', 'https://www.apple.com/ipad-pro/specs/',
    'https://www.apple.com/ipad-mini/specs/', 'https://www.apple.com/ipad-11/specs/',
  ],
  screens: release.screens, icons: iconSizes, parts: [],
};
for (const folder of ['screens', 'icons', 'launch-parts']) await mkdir(resolve(output, folder), {recursive:true});
const browser = await webkit.launch();
try {
  // Public share artwork uses the same typography and piano as the launch screen.
  const social = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await social.goto(story);
  await social.locator('main h1').waitFor();
  await social.evaluate(() => document.fonts.ready);
  await social.locator('main > div').evaluate(el => { el.style.height = '190px'; });
  await social.screenshot({path:resolve(root,'public/social-preview.png')});
  await social.close();
  // Export the actual rendered typography and key surfaces, not a redrawing.
  for (const scale of [1,2,3]) {
    for (const [kind,width,height] of [['Wordmark',400,120],['WhiteKey',72,266],['BlackKey',58,157]]) {
      const part = await browser.newPage({viewport:{width:500,height:500},deviceScaleFactor:scale});
      await part.goto(story);
      await part.locator('main h1').waitFor();
      await part.evaluate(() => document.fonts.ready);
      await part.evaluate(({kind,width,height}) => {
        const source = document.querySelector(kind==='Wordmark'?'main h1':kind==='WhiteKey'?'.piano-key:not(.piano-key--black)':'.piano-key--black').cloneNode(true);
        const container = document.createElement('div');
        container.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;display:grid;place-items:center`;
        if(kind==='Wordmark') {
          source.style.cssText='position:static;display:block;margin:0;font-family:var(--font-display);font-size:80px;font-weight:600;letter-spacing:-2px;line-height:120px;color:hsl(var(--foreground))';
        } else {
          source.style.cssText=`position:absolute;left:${kind==='BlackKey'?8:0}px;top:0;width:${kind==='BlackKey'?42:72}px;height:${kind==='BlackKey'?149:266}px`;
        }
        container.append(source);
        document.body.replaceChildren(container);
        if(kind==='Wordmark' && source.getBoundingClientRect().width > width) {
          throw new Error('Launch wordmark exceeds its export canvas');
        }
        // Storybook applies its canvas background with !important.
        document.documentElement.style.setProperty('background', 'transparent', 'important');
        document.body.style.cssText='margin:0;background:transparent !important';
      }, {kind,width,height});
      const filename = `Launch${kind}@${scale}x.png`;
      const png = await part.screenshot({path:resolve(output,'launch-parts',filename),omitBackground:true,clip:{x:0,y:0,width,height}});
      if(kind !== 'WhiteKey') {
        const alpha = await part.evaluate(async data => {
          const image = new Image(); image.src = data; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, 1, 1).data[3];
        }, 'data:image/png;base64,' + png.toString('base64'));
        if(alpha !== 0) throw new Error(`${filename} must retain a transparent background`);
      }
      manifest.parts.push({filename,scale,width:width*scale,height:height*scale});
      await part.close();
    }
  }
} finally { await browser.close(); }

const iconMaster = resolve(root,'ios/App/App/Assets.xcassets/AppIcon.appiconset/replay1024.png');
for (const size of iconSizes) {
  const dest=resolve(output,'icons',`icon-${size}.png`);
  if(size===1024) await copyFile(iconMaster,dest);
  else execFileSync('sips',['-z',String(size),String(size),iconMaster,'--out',dest],{stdio:'pipe'});
}
// Retain all existing public URLs, including older touch-icon sizes still linked by index.html.
for (const filename of await readdir(resolve(root,'public'))) {
  const match=filename.match(/^(?:apple-icon|android-icon|favicon|ms-icon)-(\d+)x\d+\.png$/);
  if(match && iconSizes.includes(Number(match[1]))) await copyFile(resolve(output,'icons',`icon-${match[1]}.png`),resolve(root,'public',filename));
}
for(const name of ['apple-icon.png','apple-icon-precomposed.png']) await copyFile(resolve(output,'icons/icon-180.png'),resolve(root,'public',name));
await copyFile(resolve(output,'icons/icon-512.png'),resolve(root,'public/android-icon-512x512.png'));
// ICO supports PNG payloads; preserve sharp 16/32/48px variants in one favicon.
const payloads=await Promise.all([16,32,48].map(size=>readFile(resolve(output,'icons',`icon-${size}.png`))));
const header=Buffer.alloc(6+16*payloads.length);header.writeUInt16LE(1,2);header.writeUInt16LE(payloads.length,4);
let offset=header.length;
payloads.forEach((png,i)=>{const entry=6+16*i;header[entry]=header[entry+1]=[16,32,48][i];header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;});
await writeFile(resolve(root,'public/favicon.ico'),Buffer.concat([header,...payloads]));
await copyFile(iconMaster,resolve(root,'ios-learn-native/ReplayLearn/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'));

// Independent copies in each app: no runtime dependency between projects.
for(const catalog of ['ios/App/App/Assets.xcassets','ios-learn-native/ReplayLearn/Resources/Assets.xcassets']) {
  for(const [kind,width,height,caps] of [['Wordmark',400,120,null],['WhiteKey',72,266,{top:1,bottom:8,left:8,right:8}],['BlackKey',58,157,{top:2,bottom:14,left:14,right:14}]]) {
    const dir=resolve(root,catalog,`Launch${kind}.imageset`);await mkdir(dir,{recursive:true});
    const images=[];
    for(const scale of [1,2,3]) {
      const filename=`Launch${kind}@${scale}x.png`;
      await copyFile(resolve(output,'launch-parts',filename),resolve(dir,filename));
      const entry={filename,idiom:'universal',scale:`${scale}x`};
      if(caps) entry.resizing={mode:'9-part',center:{mode:'stretch',width:(width-caps.left-caps.right)*scale,height:(height-caps.top-caps.bottom)*scale},'cap-insets':Object.fromEntries(Object.entries(caps).map(([key,value])=>[key,value*scale]))};
      images.push(entry);
    }
    await writeFile(resolve(dir,'Contents.json'),JSON.stringify({images,info:{author:'xcode',version:1}},null,2)+'\n');
  }
}
await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Exported ${manifest.screens.length} screens, ${iconSizes.length} icon sizes and ${manifest.parts.length} native launch parts.`);

await import('./generate-launch-storyboards.mjs');

const nativePack = resolve(output, 'native');
await mkdir(resolve(nativePack, 'ReplayAssets.xcassets'), {recursive:true});
await copyFile(resolve(root, 'ios/App/App/Base.lproj/LaunchScreen.storyboard'), resolve(nativePack, 'LaunchScreen.storyboard'));
for(const asset of ['Contents.json', 'AppIcon.appiconset', 'LaunchWordmark.imageset', 'LaunchWhiteKey.imageset', 'LaunchBlackKey.imageset']) {
  await cp(resolve(root, 'ios/App/App/Assets.xcassets', asset), resolve(nativePack, 'ReplayAssets.xcassets', asset), {recursive:true});
}
// Keep the existing downloadable pack in sync with the current release artwork.
execFileSync('ditto',['-c','-k','--norsrc','--keepParent',output,resolve(root,'design-assets/replay-ipad-assets.zip')]);
