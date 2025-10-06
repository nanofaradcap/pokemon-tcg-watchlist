"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWithPlaywright = scrapeWithPlaywright;
const test_1 = require("@playwright/test");
async function scrapeWithPlaywright(url, productId) {
    // Set a timeout for the entire Playwright operation
    const timeout = 25000; // 25 seconds (leaving 5s buffer for Vercel's 30s limit)
    const browser = await test_1.chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });
    try {
        // Wrap the entire Playwright operation in a timeout
        const result = await Promise.race([
            (async () => {
                var _a, _b, _c;
                const page = await browser.newPage({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                });
                const pageTimeout = Number((_a = process.env.SCRAPE_TIMEOUT_MS) !== null && _a !== void 0 ? _a : 15000);
                await page.goto(url, { waitUntil: 'networkidle', timeout: pageTimeout });
                // Wait for Market Price to appear
                try {
                    await page.waitForSelector('span.price-points__upper__price', {
                        timeout: 12000
                    });
                }
                catch (_d) {
                    // Fallback: wait for any price element
                    await page.waitForSelector('[class*="price"]', {
                        timeout: 8000
                    });
                }
                // Extract data with multiple fallbacks
                const data = await page.evaluate((pid) => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    // Market Price extraction
                    const priceElements = Array.from(document.querySelectorAll('span.price-points__upper__price'));
                    const marketPriceText = ((_b = (_a = priceElements[0]) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                    // Card name extraction
                    const nameElement = document.querySelector('h1[data-testid="product-detail__name"]') ||
                        document.querySelector('h1') ||
                        document.querySelector('[class*="product-name"]') ||
                        document.querySelector('[class*="card-name"]');
                    const name = ((_c = nameElement === null || nameElement === void 0 ? void 0 : nameElement.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
                    // Set display extraction
                    const setElement = document.querySelector('[data-testid="product-detail__set"]') ||
                        document.querySelector('[class*="set-name"]') ||
                        document.querySelector('[class*="product-set"]');
                    const setDisplay = ((_d = setElement === null || setElement === void 0 ? void 0 : setElement.textContent) === null || _d === void 0 ? void 0 : _d.trim()) || '';
                    // JP Number extraction
                    const jpNoMatch = (_e = document.body.textContent) === null || _e === void 0 ? void 0 : _e.match(/\b\d{3}\/\d{3}\b/);
                    const No = (jpNoMatch === null || jpNoMatch === void 0 ? void 0 : jpNoMatch[0]) || '';
                    // Rarity extraction
                    const rarityMatch = (_f = document.body.textContent) === null || _f === void 0 ? void 0 : _f.match(/Rarity\s*[:|-]\s*([A-Za-z ]+)/i);
                    const rarity = ((_g = rarityMatch === null || rarityMatch === void 0 ? void 0 : rarityMatch[1]) === null || _g === void 0 ? void 0 : _g.trim()) || '';
                    // Image URL extraction with multiple selectors
                    const imgSelectors = [
                        'img[data-testid="product-detail__image"]',
                        'img[alt*="product"]',
                        'img[src*="product-images.tcgplayer.com"]',
                        'img[src*="tcgplayer-cdn.tcgplayer.com/product/"]'
                    ];
                    // Collect candidate images
                    const candidates = [];
                    for (const selector of imgSelectors) {
                        const img = document.querySelector(selector);
                        if (img === null || img === void 0 ? void 0 : img.src)
                            candidates.push(img.src);
                    }
                    // Prefer product images that include the productId
                    const preferred = candidates.find(src => /tcgplayer-cdn\.tcgplayer\.com\/product\//.test(src) && src.includes(`${pid}`)) || candidates.find(src => /product-images\.tcgplayer\.com\/.*\/(?:fit-in\/\d+x\d+\/)?\d+\.jpg/.test(src) && src.includes(`${pid}`)) || '';
                    const imageUrl = preferred;
                    return {
                        marketPriceText,
                        name,
                        setDisplay,
                        No,
                        rarity,
                        imageUrl
                    };
                }, productId);
                // Normalize price
                const marketPrice = data.marketPriceText
                    ? Number(data.marketPriceText.replace(/[^0-9.]/g, ''))
                    : null;
                // Construct or normalize image URL to 1000x1000 product image
                let imageUrl = data.imageUrl || `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
                const cdnMatch = imageUrl.match(/^(https:\/\/tcgplayer-cdn\.tcgplayer\.com\/product\/)\d+_in_\d+x\d+(\.jpg)$/);
                if (cdnMatch) {
                    // Force 1000x1000 variant
                    imageUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
                }
                const result = {
                    url,
                    productId,
                    name: data.name || '',
                    setDisplay: data.setDisplay || undefined,
                    No: (_b = data.No) !== null && _b !== void 0 ? _b : undefined,
                    rarity: (_c = data.rarity) !== null && _c !== void 0 ? _c : undefined,
                    imageUrl,
                    marketPrice: marketPrice !== null && marketPrice !== void 0 ? marketPrice : undefined,
                };
                return result;
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Playwright operation timed out')), timeout))
        ]);
        return result;
    }
    finally {
        await browser.close();
    }
}
