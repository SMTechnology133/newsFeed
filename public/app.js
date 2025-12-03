// app.js — Fully fixed and real-time ready

const DB_NAME = "malawi_feed_db";
const DB_VERSION = 1;
let db = null;

// --- IndexedDB helpers ---
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const _db = e.target.result;
      if (!_db.objectStoreNames.contains("users")) _db.createObjectStore("users", { keyPath: "id" });
      if (!_db.objectStoreNames.contains("posts")) _db.createObjectStore("posts", { keyPath: "id" });
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = e => rej(e);
  });
}

function idbPut(store, obj) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => res(true);
    tx.onerror = e => rej(e);
  });
}

function idbGetAll(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// --- DOM elements ---
const feedList = document.getElementById("feedList");
const loadingMore = document.getElementById("loadingMore");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const openAccountBtn = document.getElementById("openAccountBtn");
const accountDialog = document.getElementById("accountDialog");
const acctName = document.getElementById("acctName");
const acctAvatar = document.getElementById("acctAvatar");
const saveAcctBtn = document.getElementById("saveAcctBtn");
const closeAcctBtn = document.getElementById("closeAcctBtn");
const createPostBtn = document.getElementById("createPostBtn");
const postDialog = document.getElementById("postDialog");
const publishPostBtn = document.getElementById("publishPostBtn");
const closePostBtn = document.getElementById("closePostBtn");
const postTitle = document.getElementById("postTitle");
const postBody = document.getElementById("postBody");
const postImage = document.getElementById("postImage");
const postYoutube = document.getElementById("postYoutube");
const postRegion = document.getElementById("postRegion");
const darkToggleBtn = document.getElementById("darkToggleBtn");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const createStoryBtn = document.getElementById("createStoryBtn");

// --- state ---
let currentUser = null;
let localPosts = [];
let offset = 0;
const PAGE_SIZE = 8;
let loading = false;
let activeTab = "malawi";
let searchQ = "";

// --- helpers ---
function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (typeof c === "string") e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

function fileToDataUrl(file) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });
}

function capitalize(s){ return s && s[0].toUpperCase() + s.slice(1); }

function placeholderAvatar(post) {
  const initials = (post.author && post.author.name) ? post.author.name.split(" ").map(s=>s[0]).slice(0,2).join("") : "MF";
  const bg = "#e6f6f4";
  const fg = "#0d9488";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='${bg}' rx='10'/><text x='50%' y='50%' font-family='Verdana' font-size='24' text-anchor='middle' fill='${fg}' dy='.35em'>${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function detectYouTubeLink(text) {
  if (!text) return null;
  const s = String(text);
  const yt1 = s.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return yt1 ? `https://www.youtube.com/embed/${yt1[1]}` : null;
}

// --- dark mode ---
function applyDarkClass(isDark){
  document.documentElement.classList.toggle("dark", !!isDark);
}
function loadDarkPreference(){
  const stored = localStorage.getItem("darkMode");
  if(stored !== null) return stored === "true";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function toggleDark(){
  const next = !document.documentElement.classList.contains("dark");
  applyDarkClass(next);
  localStorage.setItem("darkMode", next);
}
darkToggleBtn.addEventListener("click", toggleDark);

// --- render ---
function skeletonCard() {
  const card = el("div", { className: "post skeleton" }, [
    el("div", { style: "display:flex;gap:12px;align-items:center" }, [
      el("div", { style: "width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,0.06)" }),
      el("div", {}, [
        el("div", { className: "skeleton skeleton-line", style: "width:180px" }),
        el("div", { className: "skeleton skeleton-line", style: "width:100px;margin-top:8px" })
      ])
    ]),
    el("div", { className: "skeleton skeleton-line", style: "width:100%;height:120px;margin-top:12px;border-radius:8px" }),
    el("div", { className: "skeleton skeleton-line", style: "width:60%" }),
  ]);
  return card;
}

function renderPost(post){
  const container = el("article", { className:"post", id:"post_"+post.id });
  const meta = el("div",{className:"meta"});
  const avatar = el("img",{className:"avatar-small",src:post.author?.avatarDataUrl||placeholderAvatar(post)});
  const info = el("div",{});
  const title = el("div",{className:"title"},post.title||post.source||"news");
  const sub = el("div",{className:"sub"},`${capitalize(post.region||"world")} ${post.source||""}`);
  info.appendChild(title); info.appendChild(sub); meta.appendChild(avatar); meta.appendChild(info); container.appendChild(meta);

  if(post.body) container.appendChild(el("div",{className:"body"},post.body));

  if(post.media){
    const wrap = el("div",{className:"media-wrap"});
    if(post.media.type==="image") wrap.appendChild(el("img",{className:"media",src:post.media.url,loading:"lazy"}));
    else if(post.media.type==="video") wrap.appendChild(el("iframe",{className:"media-iframe",src:post.media.url,allow:"accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",allowFullscreen:true}));
    container.appendChild(wrap);
  }

  const actions = el("div",{className:"actions"});
  const likeBtn = el("button",{className:"action-btn like"},`Like ${(post.reactions?.like||0)}`);
  likeBtn.onclick = ()=>doAction({type:"reaction",postId:post.id,amount:1});

  const commentBtn = el("button",{className:"action-btn"},`Comment ${(post.comments?.length||0)}`);
  commentBtn.onclick = async ()=>{
    const text = prompt("Enter comment");
    if(text) doAction({type:"comment",postId:post.id,amount:text});
  };

  const shareBtn = el("button",{className:"action-btn"},`Share ${(post.shares||0)}`);
  shareBtn.onclick = ()=>doAction({type:"share",postId:post.id,amount:1});

  actions.appendChild(likeBtn); actions.appendChild(commentBtn); actions.appendChild(shareBtn);
  container.appendChild(actions);

  return container;
}

function refreshFeedUI(clear=false){
  if(clear) feedList.innerHTML="";
  const q = (searchInput.value||"").toLowerCase();
  const visible = localPosts.filter(p=>{
    if(activeTab==="trending") return true;
    if(activeTab && activeTab!=="trending" && p.region!==activeTab) return false;
    if(!q) return true;
    return (p.title||"").toLowerCase().includes(q)||(p.body||"").toLowerCase().includes(q)||(p.source||"").toLowerCase().includes(q);
  });
  feedList.innerHTML="";
  if(!visible.length){ for(let i=0;i<3;i++) feedList.appendChild(skeletonCard()); return; }
  visible.forEach(p=>feedList.appendChild(renderPost(p)));
}

// --- fetch posts ---
async function loadMore(reset=false){
  if(loading) return;
  loading=true;
  loadingMore.hidden=false;
  try{
    if(reset) offset=0;
    let url=`/posts?offset=${offset}&limit=${PAGE_SIZE}`;
    if(activeTab==="trending") url+="&region=trending";
    else url+=`&region=${encodeURIComponent(activeTab)}`;
    const res = await fetch(url);
    const data = await res.json();
    const newPosts = data.posts||[];
    for(const p of newPosts){
      if(!localPosts.find(x=>x.id===p.id)){
        localPosts.push(p);
        await idbPut("posts",p);
      } else {
        const idx = localPosts.findIndex(x=>x.id===p.id);
        localPosts[idx]={...localPosts[idx],...p};
        await idbPut("posts",localPosts[idx]);
      }
    }
    localPosts.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    offset+=newPosts.length;
    refreshFeedUI(true);
  }catch(e){ console.warn("Load more error",e); }
  finally{ loading=false; loadingMore.hidden=true; }
}

// --- do action ---
async function doAction(action){
  const p = localPosts.find(x=>x.id===action.postId);
  if(p){
    if(action.type==="reaction"){ p.reactions=p.reactions||{}; p.reactions.like=(p.reactions.like||0)+action.amount; }
    if(action.type==="comment"){ p.comments=p.comments||[]; p.comments.push({id:"c_local_"+Date.now(),text:action.amount,userId:currentUser?.id,createdAt:Date.now()}); }
    if(action.type==="share"){ p.shares=(p.shares||0)+action.amount; }
    refreshFeedUI(true);
  }
  try{
    await fetch("/update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(action)});
  }catch(e){ console.warn("Network error",e); }
}

// --- create post ---
createPostBtn.addEventListener("click", ()=> postDialog.showModal ? postDialog.showModal() : alert("Dialog unsupported"));
closePostBtn.addEventListener("click", ()=> postDialog.close());
publishPostBtn.addEventListener("click", async ()=>{
  const title = postTitle.value.trim();
  const body = postBody.value.trim();
  const region = postRegion.value;
  let media = null;
  if(postYoutube.value.trim()){ const yt=detectYouTubeLink(postYoutube.value.trim()); if(!yt) return alert("Invalid YouTube link"); media={type:"video",url:yt}; }
  else if(postImage.files[0]) media={type:"image",url:await fileToDataUrl(postImage.files[0])};
  const post={title,body,media,region,author:currentUser?{id:currentUser.id,name:currentUser.name,avatarDataUrl:currentUser.avatarDataUrl}:null};
  try{
    await fetch("/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"new_post",post})});
    postDialog.close(); postTitle.value=""; postBody.value=""; postImage.value=""; postYoutube.value="";
  }catch(e){ alert("Failed to publish"); }
});

// --- account ---
openAccountBtn.addEventListener("click", ()=> accountDialog.showModal ? accountDialog.showModal() : alert("Dialog unsupported"));
closeAcctBtn.addEventListener("click", ()=> accountDialog.close());
saveAcctBtn.addEventListener("click", async ()=>{
  const name = acctName.value.trim();
  if(!name) return alert("Enter name");
  let avatarDataUrl=null;
  if(acctAvatar.files[0]) avatarDataUrl = await fileToDataUrl(acctAvatar.files[0]);
  try{
    const res=await fetch("/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,avatarDataUrl})});
    const body=await res.json();
    if(body.ok && body.user){ currentUser=body.user; localStorage.setItem("currentUser",JSON.stringify(currentUser)); await idbPut("users",currentUser); accountDialog.close(); alert("Account saved"); }
    else alert("Server error");
  }catch(e){ currentUser={id:"local_"+Date.now(),name,avatarDataUrl}; localStorage.setItem("currentUser",JSON.stringify(currentUser)); await idbPut("users",currentUser); accountDialog.close(); alert("Saved locally (offline)"); }
});

// --- tabs ---
tabButtons.forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    tabButtons.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const region=btn.dataset.region;
    activeTab=region==="trending"?"trending":region;
    localPosts=[]; offset=0; feedList.innerHTML="";
    for(let i=0;i<3;i++) feedList.appendChild(skeletonCard());
    await loadMore(true);
  });
});

// --- search ---
searchClear.addEventListener("click", ()=>{ searchInput.value=""; searchInput.dispatchEvent(new Event("input")); });
searchInput.addEventListener("input", ()=> refreshFeedUI(true));

// --- infinite scroll ---
window.addEventListener("scroll", ()=>{
  if((window.innerHeight + window.scrollY) >= (document.body.offsetHeight-600)) loadMore();
});

// --- SSE ---
function initSSE(){
  const evtSource = new EventSource("/stream");
  evtSource.onmessage = e=>{
    const data = JSON.parse(e.data);
    if(data.type==="new_post"){ localPosts.unshift(data.post); refreshFeedUI(true); }
    else if(data.type==="update_post"){ const idx=localPosts.findIndex(p=>p.id===data.post.id); if(idx!==-1){ localPosts[idx]=data.post; refreshFeedUI(true); } }
  };
  evtSource.onerror = ()=> console.warn("SSE disconnected, retrying...");
}

// --- init ---
async function init(){
  await openDB();
  applyDarkClass(loadDarkPreference());
  try{
    const stored=localStorage.getItem("currentUser");
    if(stored) currentUser=JSON.parse(stored);
    else { const users=await idbGetAll("users"); if(users.length){ currentUser=users[0]; localStorage.setItem("currentUser",JSON.stringify(currentUser)); } }
  }catch(e){}
  try{
    const cached=await idbGetAll("posts");
    if(cached && cached.length){ localPosts=cached.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)); offset=localPosts.length; refreshFeedUI(true); }
  }catch(e){ console.warn("Cached posts load failed", e); }

  feedList.innerHTML=""; for(let i=0;i<3;i++) feedList.appendChild(skeletonCard());
  await loadMore(true);
  initSSE();
}

init();