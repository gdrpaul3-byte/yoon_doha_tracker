const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ids = process.argv.slice(2);
const profile = process.env.TINGLE_BROWSER_PROFILE || '/root/projects/tingle-browser-research/browser-profile';
for (const f of ['SingletonLock','SingletonSocket','SingletonCookie']) { try { fs.unlinkSync(path.join(profile, f)); } catch {} }
(async()=>{
 const context = await chromium.launchPersistentContext(profile,{headless:true,channel:'chrome',locale:'ko-KR',viewport:{width:1280,height:900},args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-software-rasterizer']});
 const page = context.pages()[0] || await context.newPage();
 const out=[];
 for (const id of ids) {
  await page.goto(`https://tingle.chat/chat/characters/${id}`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{}); await page.waitForTimeout(2000);
  const data = await page.evaluate(()=>{
    const visible = el => { const r=el.getBoundingClientRect(); return r.width>20 && r.height>20; };
    return [...document.images].filter(visible).map((img,i)=>{const r=img.getBoundingClientRect(); return {i, src: img.src, alt: img.alt, w:r.width, h:r.height, x:r.x, y:r.y, naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight};});
  });
  out.push({id,title:await page.title(),imgs:data});
 }
 console.log(JSON.stringify(out,null,2));
 await context.close();
})().catch(e=>{console.error(e);process.exit(1)});
