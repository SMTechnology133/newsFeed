// JavaScript Document
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

let clients = [];

// SSE endpoint
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res,
  };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
  });
});

// Fetch trending news from public RSS feeds
async function fetchNews() {
  const feeds = {
    malawi: 'https://www.nyasatimes.com/feed/',
    africa: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    world: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  };

  const newsData = {};

  for (let region in feeds) {
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feeds[region])}`);
      const data = await response.json();
      newsData[region] = data.items.slice(0, 5); // top 5 news
    } catch (error) {
      console.error(`Error fetching ${region} news:`, error);
      newsData[region] = [];
    }
  }

  return newsData;
}

// Broadcast news to all connected clients every 30 seconds
async function broadcastNews() {
  const news = await fetchNews();
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify(news)}+AFw-n+AFw-n`);
  });
}

setInterval(broadcastNews, 30000); // every 30 seconds
broadcastNews(); // initial push

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));