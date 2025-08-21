import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { URL } from 'url';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

//Extraction des produits

//CNN
function extractProductsCNN($) {
  let products = [];
  $('div[data-type="product"]').each((i, el) => {
    const productImages = $(el).find('img').length;
    const descriptionWordCount = $(el).text().trim().split(/\s+/).length;

    let buyLinks = [];
    $(el).find('a').each((j, link) => {
      const href = $(link).attr('href') || '';
      const priceMatch = $(link).text().match(/(\$|€)(\d+(\.\d+)?)/);

      buyLinks.push({
        price: priceMatch ? priceMatch[0] : null,
        currency: priceMatch ? priceMatch[1] : null,
        url: href.startsWith('http') ? href : null
      });
    });

    products.push({
      images: productImages,
      descriptionLength: descriptionWordCount,
      buyLinksCount: buyLinks.length,
      buyLinks
    });
  });
  return products;
}

//Global
function extractProductsGeneric($, selector) {
  let products = [];
  $(selector).each((i, el) => {
    const productImages = $(el).find('img').length;
    const descriptionWordCount = $(el).text().trim().split(/\s+/).length;

    let buyLinks = [];
    $(el).find('a').each((j, link) => {
      const href = $(link).attr('href') || '';
      const priceMatch = $(link).text().match(/(\$|€)(\d+(\.\d+)?)/);

      buyLinks.push({
        price: priceMatch ? priceMatch[0] : null,
        currency: priceMatch ? priceMatch[1] : null,
        url: href.startsWith('http') ? href : null
      });
    });

    products.push({
      images: productImages,
      descriptionLength: descriptionWordCount,
      buyLinksCount: buyLinks.length,
      buyLinks
    });
  });
  return products;
}

//Extraction domaine par domaine
function extractByDomain(domain, $) {
  switch (domain) {
    case 'edition.cnn.com':
      return {
        title: $('h1').first().text().trim(),
        date: $('meta[name="pubdate"]').attr('content') ||
          $('meta[property="article:published_time"]').attr('content') ||
          $('time').attr('datetime') || null,
        mainImage: $('picture img').first().attr('src') ||
          $('meta[property="og:image"]').attr('content') || null,
        products: extractProductsCNN($)
      };

    case 'mashable.com':
      return {
        title: $('h1').first().text().trim(),
        date: $('meta[property="article:published_time"]').attr('content') ||
          $('time').attr('datetime') || null,
        mainImage: $('figure img').first().attr('src') ||
          $('meta[property="og:image"]').attr('content') || null,
        products: extractProductsGeneric($, '.product, [class*="Product"], section')
      };

    case 'www.nytimes.com':
      return {
        title: $('h1').first().text().trim(),
        date: $('meta[name="ptime"]').attr('content') ||
          $('meta[property="article:published"]').attr('content') ||
          $('time').attr('datetime') || null,
        mainImage: $('figure img').first().attr('src') ||
          $('meta[property="og:image"]').attr('content') || null,
        products: extractProductsGeneric($, '.product, [class*="Product"], section')
      };

    default:
      return {
        title: $('h1').first().text().trim(),
        date: $('time').attr('datetime') || null,
        mainImage: $('img').first().attr('src') || null,
        products: extractProductsGeneric($, '.product, article, section')
      };
  }
}

async function scrapeUrl(page, url) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  const html = await page.content();
  const $ = cheerio.load(html);

  const domain = new URL(url).hostname;
  const baseData = extractByDomain(domain, $);
  const totalImages = $('img').length;

  return {
    title: baseData.title || null,
    date: baseData.date || null,
    mainImage: baseData.mainImage || null,
    totalImages,
    totalProducts: baseData.products.length,
    products: baseData.products
  };
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node index.mjs <url1> <url2> ...");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  let results = {};

  for (let url of args) {
    console.log(`Navigating to: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      console.log("Vérifie si un Captcha est présent. Appuie sur Entrée après l’avoir validé.");
      await new Promise(resolve => process.stdin.once("data", resolve));

      results[url] = await scrapeUrl(page, url);

      await sleep(15000);
    } catch (err) {
      console.error(`Erreur sur ${url}:`, err.message);
      results[url] = null;
    }
  }

  await browser.close();

  fs.writeFileSync('results.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log("Résultats enregistrés dans results.json");
})();