import express from "express";
import fetch from "node-fetch";
import cheerio from "cheerio";
import urlParser from "url";
import { promises as fs } from "fs";

const app = express();
const port = 3000; // Set your desired port number

app.get("/crawl", async (req, res) => {
  const { url, maxDepth } = req.query;
  const results = await crawl(url, 0, parseInt(maxDepth));
  await writeJsonToFile(results);
  res.send("Crawling completed successfully.");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const seenUrls = {};

async function crawl(currentPageUrl, currentDepth, maxDepth) {
  if (seenUrls[currentPageUrl] && currentDepth === maxDepth) return [];
  seenUrls[currentPageUrl] = true;
  const { host, protocol } = urlParser.parse(currentPageUrl);

  const data = [];
  const sourcePage = await fetch(currentPageUrl);
  const html = await sourcePage.text();
  const $ = cheerio.load(html);
  const currentDepthUrls = $("a")
    .map((i, link) => link.attribs.href)
    .get();

  const images = $("img")
    .map((i, link) => {
      if (link.attribs.src?.startsWith("//")) {
        return `${protocol}${link.attribs.src}`;
      } else {
        return link.attribs.src;
      }
    })
    .get();

  for (let i = 0; i < images.length; i++) {
    data.push({
      imageUrl: images[i],
      sourceUrl: currentPageUrl,
      depth: currentDepth,
    });
  }

  const urls = await filterValidUrls(currentDepthUrls, host, protocol);
  for (let i = 0; i < urls.length; i++) {
    if (currentDepth < maxDepth) {
      const childData = await crawl(urls[i], currentDepth + 1, maxDepth);
      data.push(...childData);
    }
  }

  return data;
}

async function filterValidUrls(links, host, protocol) {
  return links
    .filter((link) => {
      return (
        link.startsWith("http") || link.startsWith("/") || link.startsWith("//")
      );
    })
    .map((link) => {
      if (link.startsWith("/") || link.startsWith("//")) {
        return `${protocol}//${host}${link}`;
      } else return link;
    });
}

async function writeJsonToFile(data) {
  const filePath = "./results.json";
  let existingData = [];
  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    existingData = JSON.parse(fileContent).results;
  } catch (err) {
    console.log(err);
  }

  const newData = [...existingData, ...data];
  newData.sort((a, b) => a.depth - b.depth);
  const json = { results: newData };
  await fs.writeFile(filePath, JSON.stringify(json));
}
