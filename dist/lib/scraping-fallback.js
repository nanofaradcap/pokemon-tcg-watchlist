"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeWithFallback = scrapeWithFallback;
async function scrapeWithFallback(url, productId) {
    // Enhanced fallback that extracts better data from URL patterns
    // Extract card name from URL - handle different patterns
    let name = 'Unknown Card';
    const namePatterns = [
        /pokemon-[^/]+-([^/]+)-(\d{3}-\d{3})/, // pokemon-japan-sv11b-black-bolt-emolga-116-086
        /pokemon-[^/]+-([^/]+)/, // pokemon-japan-sv2a-pokemon-card-151-bulbasaur-166-165
        /product\/\d+\/([^/]+)/ // fallback pattern
    ];
    for (const pattern of namePatterns) {
        const match = url.match(pattern);
        if (match) {
            name = match[1]
                .replace(/-/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .replace(/\bPokemon\b/g, 'Pokémon')
                .replace(/\bCard\b/g, '')
                .trim();
            break;
        }
    }
    // Extract set information from URL
    let setDisplay;
    const setPatterns = [
        /pokemon-japan-([^/]+)-/, // pokemon-japan-sv11b-black-bolt-emolga
        /pokemon-([^/]+)-/ // pokemon-sv2a-pokemon-card-151
    ];
    for (const pattern of setPatterns) {
        const match = url.match(pattern);
        if (match) {
            setDisplay = match[1]
                .replace(/-/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase())
                .replace(/\bSv/g, 'SV');
            break;
        }
    }
    // Extract card number from URL
    let No;
    const numberMatch = url.match(/(\d{3})-(\d{3})/);
    if (numberMatch) {
        No = `${numberMatch[1]}/${numberMatch[2]}`;
    }
    // Try to extract rarity from URL patterns
    let rarity;
    const rarityPatterns = [
        /-([a-z]+)-rarity/i,
        /-([a-z]+)-(\d{3}-\d{3})/i
    ];
    for (const pattern of rarityPatterns) {
        const match = url.match(pattern);
        if (match && !match[1].match(/\d/)) {
            rarity = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            break;
        }
    }
    return {
        url,
        productId,
        name,
        setDisplay,
        No,
        rarity,
        imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
        marketPrice: undefined, // Can't extract without JS
    };
}
