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
exports.scrapePriceCharting = scrapePriceCharting;
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
async function scrapePriceCharting(url) {
    let browser = null;
    const timeout = 25000; // 25 seconds (leaving 5s buffer for Vercel's 30s limit)
    try {
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
        const result = await Promise.race([
            (async () => {
                await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
                // Wait for price table to appear
                try {
                    await page.waitForSelector('#price_data', { timeout: 12000 });
                }
                catch (_a) {
                    await page.waitForSelector('.price', { timeout: 8000 });
                }
                // Wait for product name
                try {
                    await page.waitForSelector('#product_name', { timeout: 10000 });
                }
                catch (_b) {
                    // Continue even if product name doesn't appear
                }
                const data = await page.evaluate(() => {
                    var _a, _b, _c, _d, _e, _f, _g, _h;
                    // Extract product name
                    const nameElement = document.querySelector('#product_name');
                    let name = '';
                    let setDisplay = '';
                    let cardNumber = '';
                    if (nameElement) {
                        const nameText = ((_a = nameElement.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
                        // Extract card number from name (e.g., "Mew ex #232")
                        const numberMatch = nameText.match(/#(\d+)/);
                        cardNumber = (numberMatch === null || numberMatch === void 0 ? void 0 : numberMatch[1]) || '';
                        // Extract set name from the link
                        const setLink = nameElement.querySelector('a');
                        setDisplay = ((_b = setLink === null || setLink === void 0 ? void 0 : setLink.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
                        // Clean up the name - remove set name from the end, keep card name and number
                        // The structure is typically "Card Name #Number Set Name"
                        let cleanName = nameText.trim();
                        // Remove the set name from the end if it's there
                        if (setDisplay && cleanName.endsWith(setDisplay)) {
                            cleanName = cleanName.replace(new RegExp(`\\s*${setDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim();
                        }
                        // Format as "Card Name #Number Set Name"
                        name = setDisplay ? `${cleanName} ${setDisplay}` : cleanName;
                    }
                    // Extract prices from the price table
                    const priceTable = document.querySelector('#price_data');
                    let ungradedPrice;
                    let grade7Price;
                    let grade8Price;
                    let grade9Price;
                    let grade95Price;
                    let grade10Price;
                    if (priceTable) {
                        // Ungraded price (used_price)
                        const ungradedElement = priceTable.querySelector('#used_price .price');
                        if (ungradedElement) {
                            const priceText = ((_c = ungradedElement.textContent) === null || _c === void 0 ? void 0 : _c.replace(/[^0-9.]/g, '')) || '';
                            ungradedPrice = priceText ? Number(priceText) : undefined;
                        }
                        // Grade 7 price (complete_price)
                        const grade7Element = priceTable.querySelector('#complete_price .price');
                        if (grade7Element) {
                            const priceText = ((_d = grade7Element.textContent) === null || _d === void 0 ? void 0 : _d.replace(/[^0-9.]/g, '')) || '';
                            grade7Price = priceText ? Number(priceText) : undefined;
                        }
                        // Grade 8 price (new_price)
                        const grade8Element = priceTable.querySelector('#new_price .price');
                        if (grade8Element) {
                            const priceText = ((_e = grade8Element.textContent) === null || _e === void 0 ? void 0 : _e.replace(/[^0-9.]/g, '')) || '';
                            grade8Price = priceText ? Number(priceText) : undefined;
                        }
                        // Grade 9 price (graded_price)
                        const grade9Element = priceTable.querySelector('#graded_price .price');
                        if (grade9Element) {
                            const priceText = ((_f = grade9Element.textContent) === null || _f === void 0 ? void 0 : _f.replace(/[^0-9.]/g, '')) || '';
                            grade9Price = priceText ? Number(priceText) : undefined;
                        }
                        // Grade 9.5 price (box_only_price)
                        const grade95Element = priceTable.querySelector('#box_only_price .price');
                        if (grade95Element) {
                            const priceText = ((_g = grade95Element.textContent) === null || _g === void 0 ? void 0 : _g.replace(/[^0-9.]/g, '')) || '';
                            grade95Price = priceText ? Number(priceText) : undefined;
                        }
                        // Grade 10 price (manual_only_price)
                        const grade10Element = priceTable.querySelector('#manual_only_price .price');
                        if (grade10Element) {
                            const priceText = ((_h = grade10Element.textContent) === null || _h === void 0 ? void 0 : _h.replace(/[^0-9.]/g, '')) || '';
                            grade10Price = priceText ? Number(priceText) : undefined;
                        }
                    }
                    // Extract image URL
                    let imageUrl = '';
                    const imageElement = document.querySelector('#extra-images img');
                    if (imageElement === null || imageElement === void 0 ? void 0 : imageElement.src) {
                        // Convert from 240px to 1600px version
                        imageUrl = imageElement.src.replace('/240.jpg', '/1600.jpg');
                    }
                    return {
                        name,
                        setDisplay,
                        cardNumber,
                        imageUrl,
                        ungradedPrice,
                        grade7Price,
                        grade8Price,
                        grade9Price,
                        grade95Price,
                        grade10Price
                    };
                });
                return {
                    url,
                    name: data.name || 'Unknown Card',
                    setDisplay: data.setDisplay || undefined,
                    cardNumber: data.cardNumber || undefined,
                    imageUrl: data.imageUrl || undefined,
                    ungradedPrice: data.ungradedPrice,
                    grade7Price: data.grade7Price,
                    grade8Price: data.grade8Price,
                    grade9Price: data.grade9Price,
                    grade95Price: data.grade95Price,
                    grade10Price: data.grade10Price
                };
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('PriceCharting scraping timed out')), timeout))
        ]);
        return result;
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
}
