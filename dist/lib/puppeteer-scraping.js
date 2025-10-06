"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWithPuppeteer = scrapeWithPuppeteer;
const chromium_min_1 = __importDefault(require("@sparticuz/chromium-min"));
const DEFAULT_CHROMIUM_VERSION = 'v138.0.2';
function resolveChromiumPackUrl() {
    if (process.env.CHROMIUM_PACK_URL) {
        return process.env.CHROMIUM_PACK_URL;
    }
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return `https://github.com/Sparticuz/chromium/releases/download/${DEFAULT_CHROMIUM_VERSION}/chromium-${DEFAULT_CHROMIUM_VERSION}-pack.${arch}.tar`;
}
let cachedPuppeteer = null;
async function loadPuppeteer() {
    if (cachedPuppeteer)
        return cachedPuppeteer;
    const importedModule = process.env.VERCEL
        ? await Promise.resolve().then(() => __importStar(require('puppeteer-core')))
        : await Promise.resolve().then(() => __importStar(require('puppeteer')));
    const puppeteer = (importedModule && 'default' in importedModule ? importedModule.default : importedModule);
    cachedPuppeteer = puppeteer;
    return puppeteer;
}
async function scrapeWithPuppeteer(url, productId) {
    let browser = null;
    try {
        // Configure Puppeteer for Vercel
        const puppeteer = await loadPuppeteer();
        const launchOptions = {
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
                '--disable-features=VizDisplayCompositor',
                '--single-process',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ],
        };
        if (process.env.VERCEL) {
            const chromiumPackUrl = resolveChromiumPackUrl();
            const executablePath = await chromium_min_1.default.executablePath(chromiumPackUrl);
            if (!executablePath) {
                throw new Error('Failed to resolve Chromium executable path in Vercel environment');
            }
            launchOptions.headless = 'shell';
            launchOptions.args = chromium_min_1.default.args || launchOptions.args;
            launchOptions.defaultViewport = { width: 1280, height: 720 };
            launchOptions.executablePath = executablePath;
        }
        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        // Set viewport
        await page.setViewport({ width: 1280, height: 720 });
        // Navigate to the page with timeout
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 15000
        });
        // Wait for content to load
        try {
            await page.waitForSelector('h1', { timeout: 10000 });
        }
        catch (_a) {
            // Continue even if h1 doesn't appear
        }
        // Extract data with structured return shape that serializes cleanly
        const data = await page.evaluate(() => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
            const parseNextData = () => {
                const nextDataEl = document.querySelector('#__NEXT_DATA__');
                if (!(nextDataEl === null || nextDataEl === void 0 ? void 0 : nextDataEl.textContent))
                    return null;
                try {
                    return JSON.parse(nextDataEl.textContent);
                }
                catch (err) {
                    console.warn('Failed to parse __NEXT_DATA__ JSON:', err);
                    return null;
                }
            };
            const nextData = parseNextData();
            // Market Price extraction - try multiple selectors
            let marketPriceText = '';
            // Try different price selectors
            const priceSelectors = [
                'span.price-points__upper__price',
                '[data-testid="price-points__upper__price"]',
                '.price-points__upper__price',
                '.market-price',
                '.price-points .price',
                '[class*="price-points"] [class*="price"]',
                '.product-details__pricing .price',
                '.pricing .price'
            ];
            for (const selector of priceSelectors) {
                const elements = Array.from(document.querySelectorAll(selector));
                if (elements.length > 0) {
                    marketPriceText = ((_b = (_a = elements[0]) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                    if (marketPriceText && marketPriceText.includes('$')) {
                        break;
                    }
                }
            }
            // Card name extraction from H1 element
            const nameElement = document.querySelector('h1[data-testid="lblProductDetailsProductName"]') ||
                document.querySelector('h1[data-testid="product-detail__name"]') ||
                document.querySelector('h1') ||
                document.querySelector('[class*="product-name"]') ||
                document.querySelector('[class*="card-name"]');
            const name = ((_c = nameElement === null || nameElement === void 0 ? void 0 : nameElement.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '';
            // Extract card number from H1 element (e.g., "Magikarp - 080/073 - SV1a: Triplet Beat (SV1a)")
            let cardNumber = '';
            if (name) {
                const numberMatch = name.match(/- (\d+)\/\d+ -/);
                if (numberMatch) {
                    cardNumber = numberMatch[1];
                }
            }
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
            // Image URL extraction
            let imageUrl = '';
            if ((_j = (_h = nextData === null || nextData === void 0 ? void 0 : nextData.props) === null || _h === void 0 ? void 0 : _h.pageProps) === null || _j === void 0 ? void 0 : _j.product) {
                const product = nextData.props.pageProps.product;
                const candidateUrls = [
                    (_m = (_l = (_k = product.media) === null || _k === void 0 ? void 0 : _k.images) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.url,
                    (_q = (_p = (_o = product.media) === null || _o === void 0 ? void 0 : _o.cardImages) === null || _p === void 0 ? void 0 : _p[0]) === null || _q === void 0 ? void 0 : _q.url,
                    (_r = product.image) === null || _r === void 0 ? void 0 : _r.url,
                    (_s = product.productImage) === null || _s === void 0 ? void 0 : _s.url,
                    (_u = (_t = product.images) === null || _t === void 0 ? void 0 : _t[0]) === null || _u === void 0 ? void 0 : _u.url,
                ];
                imageUrl = candidateUrls.find((candidate) => typeof candidate === 'string' && candidate.length > 0) || '';
            }
            if (!imageUrl) {
                const imgSelectors = [
                    'img[data-testid="product-detail__image"]',
                    'img[alt*="product"]',
                    'img[src*="product-images.tcgplayer.com"]',
                    'img[src*="tcgplayer-cdn.tcgplayer.com/product/"]'
                ];
                for (const selector of imgSelectors) {
                    const img = document.querySelector(selector);
                    if (img === null || img === void 0 ? void 0 : img.src) {
                        imageUrl = img.src;
                        break;
                    }
                }
            }
            return {
                marketPriceText,
                name,
                setDisplay,
                No,
                cardNumber,
                rarity,
                imageUrl,
            };
        });
        // Normalize price
        const marketPrice = data.marketPriceText
            ? Number(data.marketPriceText.replace(/[^0-9.]/g, ''))
            : null;
        const canonicalImageUrl = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`;
        // Prefer canonical CDN image; fall back only if scraping produced a URL on a different host.
        const scrapedImage = data.imageUrl || undefined;
        const imageUrl = scrapedImage && !scrapedImage.includes('tcgplayer-cdn.tcgplayer.com/')
            ? scrapedImage
            : canonicalImageUrl;
        return {
            url,
            productId,
            name: data.name || '',
            setDisplay: data.setDisplay || undefined,
            No: data.No || undefined,
            cardNumber: data.cardNumber || undefined,
            rarity: data.rarity || undefined,
            imageUrl,
            marketPrice: marketPrice || undefined,
        };
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
