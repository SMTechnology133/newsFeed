import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
const PORT = process.env.PORT||3000;

app.use(cors());
app.use(bodyParser.json({limit:"10mb"}));
app.use(express.static("public"));

let posts = [];
let users = [];
let sseClients = []; // <-- Keep track of SSE clients

function generateId(prefix="") { return prefix+Math.random().toString(36).substr(2,10); }
function computeTrendingScore(post){
  const reactions = post.reactions?Object.values(post.reactions).reduce((a,b)=>a+b,0):0;
  const comments = post.comments?post.comments.length:0;
  const shares = post.shares||0;
  return comments*2 + reactions + shares*3;
}

// --- SSE endpoint ---
app.get("/stream", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });
  res.flushHeaders();

  sseClients.push(res);
  res.write("retry: 10000\n\n");

  req.on("close", () => {
    sseClients = sseClients.filter(c => c !== res);
  });
});

// --- broadcast helper ---
function broadcastSSE(data){
  sseClients.forEach(c => {
    c.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// --- post actions ---
app.post("/action",(req,res)=>{
  const action=req.body;
  if(action.type==="new_post" && action.post){
    const p={...action.post,reactions:{},comments:[],shares:0,id:generateId("p_"),trendingScore:0};
    posts.unshift(p);
    broadcastSSE({type:"new_post",post:p}); // notify clients
    res.json({ok:true});
  }else res.json({ok:false,error:"Invalid action"});
});

// --- get posts ---
app.get("/posts",(req,res)=>{
  const offset=parseInt(req.query.offset||"0",10);
  const limit=Math.min(50,parseInt(req.query.limit||"10",10));
  const region=req.query.region;

  posts.forEach(p=>{p.trendingScore=computeTrendingScore(p);});

  let list=posts.slice();
  if(region && region!=="trending") list=list.filter(p=>p.region===region);
  if(region==="trending") list.sort((a,b)=> (b.trendingScore||0)-(a.trendingScore||0));
  else list.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));

  res.json({posts:list.slice(offset,offset+limit),total:list.length});
});

// --- update reactions/comments ---
app.post("/update",(req,res)=>{
  const {id,type,amount} = req.body;
  const post = posts.find(p=>p.id===id);
  if(!post) return res.json({ok:false,error:"Post not found"});
  if(type==="reaction"){ post.reactions["like"]=(post.reactions["like"]||0)+amount; }
  if(type==="comment"){ post.comments.push({text:amount}); }
  post.trendingScore = computeTrendingScore(post);
  broadcastSSE({type:"update_post",post});
  res.json({ok:true});
});

app.listen(PORT,()=>console.log(`Server running on ${PORT}`));