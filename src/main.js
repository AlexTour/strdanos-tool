import "./style.css";
import LibRaw from "libraw-wasm";

const app = document.querySelector("#app");
app.innerHTML = `
<header class="topbar">
  <div class="brand"><span class="brand-name">strdanos tool</span><span class="brand-sub">page correction studio</span></div>
  <div class="local-note"><span class="dot"></span> LOCAL PROCESSING · FILES STAY ON YOUR DEVICE</div>
</header>
<main>
  <section class="intro">
    <div><div class="eyebrow">Newspaper & archive digitization</div><h1>Give every page<br>the attention it deserves.</h1></div>
    <p>Correct perspective, straighten, crop and balance your digitized pages. Work through a batch, then export clean files ready for your archive.</p>
  </section>
  <section class="workspace">
    <div class="panel stage-panel">
      <div class="stage-head">
        <span class="section-label">Image workspace <span id="imageCounter"></span></span>
        <div class="stage-actions"><button class="icon-btn" id="fitBtn">Fit image</button><button class="icon-btn" id="resetBtn">Reset</button></div>
      </div>
      <div class="canvas-wrap" id="canvasWrap">
        <div class="empty-state" id="emptyState">
          <div class="upload-symbol">↥</div>
          <h3>Bring your pages in</h3>
          <p>Drop one or multiple RAW, TIFF, JPEG or PNG files here. Your images are processed locally and never uploaded.</p>
          <button class="primary" id="chooseBtn">Choose images</button>
        </div>
        <canvas id="previewCanvas"></canvas>
      </div>
      <div class="statusbar"><span id="statusText">Waiting for images</span><span id="dimensions">—</span></div>
    </div>
    <aside class="sidebar">
      <div class="panel control-panel">
        <div class="control-title"><h2>Correction</h2><span class="section-label">01 / Enhance</span></div>
        <button class="primary wand" id="autoBtn"><span class="spark">✳</span> Magic wand · Auto-correct current</button>
        <button class="secondary" id="autoAllBtn" style="width:100%;margin-top:8px">✳ Auto-correct entire batch</button>
        <p class="control-copy">Detect page edges, correct perspective, straighten the page, crop and automatically balance the image. Run it on the current page or the whole queue.</p>
        <div class="control-row"><label for="brightness">Brightness <span class="value" id="brightnessVal">0</span></label><input id="brightness" type="range" min="-60" max="60" value="0"></div>
        <div class="control-row"><label for="contrast">Contrast <span class="value" id="contrastVal">0</span></label><input id="contrast" type="range" min="-60" max="60" value="0"></div>
        <div class="control-row"><label for="rotation">Rotation <span class="value" id="rotationVal">0°</span></label><input id="rotation" type="range" min="-15" max="15" step=".1" value="0"></div>
        <div class="button-row"><button class="secondary" id="applyManualBtn">Apply adjustments</button><button class="secondary" id="detectBtn">Detect edges</button></div>
        <p class="control-copy" id="manualHint">Manual sliders apply to the selected image. Use Detect edges to preview an automatic page crop.</p>
      </div>
      <div class="panel file-list">
        <div class="file-list-head"><strong>Batch queue</strong><button class="icon-btn" id="addMoreBtn">+ Add</button></div>
        <div class="file-items" id="fileItems"><div class="control-copy">No images added yet.</div></div>
      </div>
      <div class="panel export-panel">
        <h2>Export files</h2>
        <select class="export-select" id="formatSelect">
          <option value="jpeg">JPEG · Maximum quality (100)</option>
          <option value="png">PNG · Lossless</option>
        </select>
        <button class="primary" id="exportCurrentBtn">Export current image</button>
        <button class="secondary" id="exportAllBtn" style="width:100%;margin-top:8px">Export all processed images</button>
        <p class="control-copy">JPEG quality 100 is still technically lossy. Choose PNG for lossless pixel preservation. Original RAW files are never modified.</p>
      </div>
    </aside>
  </section>
</main>
<footer><span>STRDANOS TOOL · VERSION 1.0</span><span>BUILT FOR CAREFUL DIGITIZATION</span></footer>
<input id="fileInput" type="file" accept="image/*,.cr2,.cr3,.nef,.arw,.dng,.raf,.orf,.rw2,.pef,.srw,.3fr,.iiq" multiple hidden>
<div class="drop-overlay" id="dropOverlay">Drop pages to add to your batch</div>
<div class="toast" id="toast"></div>
`;

const $ = (id) => document.getElementById(id);
const canvas = $("previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const state = { items: [], active: -1, cvReady: false, busy: false };

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function status(message) { $("statusText").textContent = message; }
function setBusy(value, message = "") {
  state.busy = value;
  $("autoBtn").disabled = value;
  $("applyManualBtn").disabled = value;
  $("detectBtn").disabled = value;
  if (message) status(message);
}
function isRaw(file) {
  return /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2|pef|srw|3fr|iiq|kdc|dcr|mos|mrw|x3f)$/i.test(file.name);
}
async function decodeRaw(file) {
  const raw = new LibRaw();
  await raw.open(new Uint8Array(await file.arrayBuffer()));
  const data = await raw.imageData();
  const width = data.width, height = data.height;
  const pixels = data.data instanceof Uint8ClampedArray ? data.data : new Uint8ClampedArray(data.data);
  const imageData = new ImageData(pixels, width, height);
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  c.getContext("2d").putImageData(imageData, 0, 0);
  if (typeof raw.close === "function") await raw.close();
  return await createImageBitmap(c);
}
async function decodeFile(file) {
  if (isRaw(file)) return await decodeRaw(file);
  return await createImageBitmap(file);
}
function makeItem(file, bitmap) {
  const c = document.createElement("canvas"); c.width = bitmap.width; c.height = bitmap.height;
  c.getContext("2d").drawImage(bitmap, 0, 0);
  return {
    file, name: file.name, original: c, processed: null, preview: null,
    brightness: 0, contrast: 0, rotation: 0, detected: false, done: false
  };
}
async function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith("image/") || isRaw(f));
  if (!files.length) { toast("Please choose supported image files."); return; }
  for (const file of files) {
    try {
      status(`Decoding ${file.name}…`);
      const bitmap = await decodeFile(file);
      const item = makeItem(file, bitmap);
      state.items.push(item);
      bitmap.close?.();
    } catch (err) {
      console.error(err);
      toast(`Could not decode ${file.name}. Try converting it to TIFF first.`);
    }
  }
  renderQueue();
  if (state.active < 0 && state.items.length) selectItem(0);
  status(`${state.items.length} image(s) ready`);
}
function activeItem() { return state.items[state.active] || null; }
function renderQueue() {
  $("imageCounter").textContent = state.items.length ? `· ${state.items.length} loaded` : "";
  const list = $("fileItems");
  if (!state.items.length) { list.innerHTML = `<div class="control-copy">No images added yet.</div>`; return; }
  list.innerHTML = state.items.map((it, i) => `
    <div class="file-item ${i === state.active ? "active" : ""}" data-index="${i}">
      <img class="file-thumb" src="${it.preview || it.original.toDataURL("image/jpeg",.55)}">
      <div class="file-meta"><div class="file-name">${escapeHtml(it.name)}</div><div class="file-detail">${it.original.width} × ${it.original.height}</div></div>
      <span class="file-state">${it.done ? "READY" : "RAW"}</span>
    </div>`).join("");
  list.querySelectorAll(".file-item").forEach(el => el.addEventListener("click", () => selectItem(Number(el.dataset.index))));
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function selectItem(index) {
  state.active = index;
  const item = activeItem();
  if (!item) return;
  $("emptyState").style.display = "none"; canvas.style.display = "block";
  $("brightness").value = item.brightness; $("contrast").value = item.contrast; $("rotation").value = item.rotation;
  updateSliderLabels();
  drawItem(item);
  renderQueue();
}
function drawItem(item) {
  const source = item.processed || item.original;
  canvas.width = source.width; canvas.height = source.height;
  ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(source,0,0);
  $("dimensions").textContent = `${source.width} × ${source.height}px`;
}
function updateSliderLabels() {
  $("brightnessVal").textContent = $("brightness").value;
  $("contrastVal").textContent = $("contrast").value;
  $("rotationVal").textContent = `${Number($("rotation").value).toFixed(1)}°`;
}
["brightness","contrast","rotation"].forEach(id => $(id).addEventListener("input", updateSliderLabels));

function applyTone(imageCanvas, brightness, contrast) {
  const out = document.createElement("canvas"); out.width = imageCanvas.width; out.height = imageCanvas.height;
  const c = out.getContext("2d", {willReadFrequently:true});
  c.drawImage(imageCanvas,0,0);
  const img = c.getImageData(0,0,out.width,out.height);
  const b = brightness * 2.0;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const d = img.data;
  for (let i=0;i<d.length;i+=4) {
    d[i] = clamp(factor * (d[i] - 128) + 128 + b);
    d[i+1] = clamp(factor * (d[i+1] - 128) + 128 + b);
    d[i+2] = clamp(factor * (d[i+2] - 128) + 128 + b);
  }
  c.putImageData(img,0,0); return out;
}
function clamp(v) { return Math.max(0,Math.min(255,v)); }
function rotateCanvas(source, degrees) {
  const rad = degrees * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const w = Math.ceil(source.width*cos + source.height*sin), h = Math.ceil(source.width*sin + source.height*cos);
  const out = document.createElement("canvas"); out.width=w; out.height=h;
  const c = out.getContext("2d"); c.translate(w/2,h/2); c.rotate(rad);
  c.drawImage(source,-source.width/2,-source.height/2); return out;
}
function autoTone(source) {
  // Use one luminance-derived tonal range for all channels, avoiding
  // independent RGB stretching that could introduce colour casts.
  const out = document.createElement("canvas"); out.width=source.width; out.height=source.height;
  const c=out.getContext("2d",{willReadFrequently:true}); c.drawImage(source,0,0);
  const image=c.getImageData(0,0,out.width,out.height), d=image.data;
  const hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=4){
    const y=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);
    hist[y]++;
  }
  const total=d.length/4;
  let lo=0,hi=255,sum=0;
  for(let i=0;i<256;i++){sum+=hist[i];if(sum>total*.004){lo=i;break;}}
  sum=0;for(let i=255;i>=0;i--){sum+=hist[i];if(sum>total*.004){hi=i;break;}}
  const span=Math.max(48,hi-lo);
  for(let i=0;i<d.length;i+=4){
    for(let ch=0;ch<3;ch++) d[i+ch]=clamp((d[i+ch]-lo)*255/span);
  }
  c.putImageData(image,0,0); return out;
}
function loadOpenCV() {
  return new Promise((resolve,reject)=>{
    if (window.cv && window.cv.Mat) return resolve(window.cv);
    const script=document.createElement("script");
    script.src="https://docs.opencv.org/4.x/opencv.js";
    script.onload=()=>{ window.cv.onRuntimeInitialized=()=>resolve(window.cv); if(window.cv.Mat) resolve(window.cv); };
    script.onerror=reject; document.head.appendChild(script);
  });
}
async function detectAndWarp(source) {
  const cv=await loadOpenCV();
  // Work on a downscaled copy for contour detection; the final warp uses full resolution.
  const scale=Math.min(1,1400/Math.max(source.width,source.height));
  const sw=Math.round(source.width*scale), sh=Math.round(source.height*scale);
  const small=document.createElement("canvas"); small.width=sw; small.height=sh;
  small.getContext("2d").drawImage(source,0,0,sw,sh);
  const src=cv.imread(small), gray=new cv.Mat(), blur=new cv.Mat(), edges=new cv.Mat();
  const contours=new cv.MatVector(), hierarchy=new cv.Mat();
  let quad=null;
  try {
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    cv.Canny(blur,edges,35,110);
    const kernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5));
    cv.morphologyEx(edges,edges,cv.MORPH_CLOSE,kernel);
    cv.findContours(edges,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    let bestArea=0;
    for(let i=0;i<contours.size();i++){
      const cnt=contours.get(i), peri=cv.arcLength(cnt,true), approx=new cv.Mat();
      cv.approxPolyDP(cnt,approx,.02*peri,true);
      if(approx.rows===4 && cv.isContourConvex(approx)){
        const area=Math.abs(cv.contourArea(approx));
        if(area>bestArea && area>sw*sh*.12){
          bestArea=area; quad=[];
          for(let j=0;j<4;j++) quad.push({x:approx.intAt(j,0)/scale,y:approx.intAt(j,1)/scale});
        }
      }
      cnt.delete(); approx.delete();
    }
    kernel.delete();
  } finally {
    src.delete();gray.delete();blur.delete();edges.delete();contours.delete();hierarchy.delete();
  }
  if(!quad) throw new Error("No clear page boundary found. Try a page with stronger contrast against its background.");
  const ordered=orderPoints(quad);
  const [tl,tr,br,bl]=ordered;
  const width=Math.round(Math.max(distance(tl,tr),distance(bl,br)));
  const height=Math.round(Math.max(distance(tl,bl),distance(tr,br)));
  const srcFull=cv.imread(source), dst=new cv.Mat();
  const srcPts=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
  const dstPts=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,width-1,0,width-1,height-1,0,height-1]);
  const M=cv.getPerspectiveTransform(srcPts,dstPts);
  cv.warpPerspective(srcFull,dst,M,new cv.Size(width,height),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());
  const out=document.createElement("canvas"); out.width=width;out.height=height;cv.imshow(out,dst);
  srcFull.delete();dst.delete();srcPts.delete();dstPts.delete();M.delete();
  return out;
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function orderPoints(points){
  const sum=p=>p.x+p.y, diff=p=>p.y-p.x;
  return [
    points.reduce((a,b)=>sum(b)<sum(a)?b:a),
    points.reduce((a,b)=>diff(b)<diff(a)?b:a),
    points.reduce((a,b)=>sum(b)>sum(a)?b:a),
    points.reduce((a,b)=>diff(b)>diff(a)?b:a)
  ];
}
async function autoCorrect(item) {
  let geometric=item.original;
  try { geometric=await detectAndWarp(item.original); item.detected=true; }
  catch(err){ console.warn(err); item.detected=false; }
  const toned=autoTone(geometric);
  item.processed=toned; item.brightness=0;item.contrast=0;item.rotation=0;item.done=true;
}
async function autoCorrectCurrent() {
  const item=activeItem(); if(!item || state.busy)return;
  setBusy(true,`Correcting ${item.name}…`);
  try {
    await autoCorrect(item);
    drawItem(item);renderQueue();
    status(item.detected ? `Auto-corrected ${item.name}` : `Tone corrected; page boundary not found for ${item.name}`);
    if(!item.detected) toast("Tone corrected, but no clear page boundary was found.");
  } catch(err) {
    console.error(err); toast("Automatic correction failed. Check that OpenCV can load, then try again."); status("Correction failed");
  } finally { setBusy(false); }
}
async function autoCorrectBatch() {
  if(!state.items.length || state.busy)return;
  setBusy(true,"Preparing automatic correction…");
  let failed=0;
  try {
    for(let i=0;i<state.items.length;i++){
      const item=state.items[i];
      status(`Auto-correcting ${i+1} of ${state.items.length}: ${item.name}`);
      try { await autoCorrect(item); } catch(err) { console.error(err); failed++; }
      if(state.active===i) drawItem(item);
      renderQueue();
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    status(`Batch complete · ${state.items.length-failed} processed`);
    toast(failed ? `${failed} image(s) could not be processed.` : "All pages processed.");
  } finally { setBusy(false); }
}
async function detectOnly(item) {
  setBusy(true,"Detecting page boundaries…");
  try {
    const warped=await detectAndWarp(item.original);
    item.processed=warped;item.detected=true;item.done=true;
    drawItem(item);renderQueue();status("Page boundary detected and corrected");
  } catch(err){toast(err.message || "Could not detect page boundary.");status("No page boundary detected");}
  finally{setBusy(false);}
}
function applyManual(item) {
  const b=Number($("brightness").value), c=Number($("contrast").value), r=Number($("rotation").value);
  const base=item.processed || item.original;
  const rotated=rotateCanvas(base,r);
  item.processed=applyTone(rotated,b,c);
  item.brightness=b;item.contrast=c;item.rotation=r;item.done=true;
  drawItem(item);renderQueue();status("Manual adjustments applied");
}
function downloadCanvas(source, filename, format) {
  const mime=format==="png"?"image/png":"image/jpeg";
  source.toBlob(blob=>{
    if(!blob){toast("Export failed.");return;}
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename.replace(/\.[^.]+$/,"")+(format==="png"?".png":".jpg");
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  },mime,format==="png"?undefined:1.0);
}
function exportItem(item) {
  if(!item) return;
  const source=item.processed||item.original;
  downloadCanvas(source,item.name,$("formatSelect").value);
}
async function exportAll() {
  if(!state.items.length)return;
  const format=$("formatSelect").value;
  for(let i=0;i<state.items.length;i++){
    const item=state.items[i];status(`Exporting ${i+1} of ${state.items.length}…`);
    downloadCanvas(item.processed||item.original,item.name,format);
    await new Promise(r=>setTimeout(r,250));
  }
  status("Batch export started");toast("Exported all images. Your browser may ask permission for multiple downloads.");
}

$("chooseBtn").onclick=()=>$("fileInput").click();
$("addMoreBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=e=>{addFiles(e.target.files);e.target.value="";};
$("autoBtn").onclick=autoCorrectCurrent;
$("autoAllBtn").onclick=autoCorrectBatch;
$("detectBtn").onclick=async()=>{const item=activeItem();if(item)await detectOnly(item);};
$("applyManualBtn").onclick=()=>{const item=activeItem();if(item)applyManual(item);};
$("exportCurrentBtn").onclick=()=>exportItem(activeItem());
$("exportAllBtn").onclick=exportAll;
$("resetBtn").onclick=()=>{
  const item=activeItem();if(!item)return;
  item.processed=null;item.brightness=0;item.contrast=0;item.rotation=0;item.done=false;item.detected=false;
  selectItem(state.active);status("Original image restored");
};
$("fitBtn").onclick=()=>{const item=activeItem();if(item)drawItem(item);};

const overlay=$("dropOverlay");
window.addEventListener("dragover",e=>{e.preventDefault();overlay.classList.add("visible");});
window.addEventListener("dragleave",e=>{if(e.clientX<=0||e.clientY<=0||e.clientX>=innerWidth||e.clientY>=innerHeight)overlay.classList.remove("visible");});
window.addEventListener("drop",e=>{e.preventDefault();overlay.classList.remove("visible");if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);});