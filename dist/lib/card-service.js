"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardService = exports.CardService = void 0;
const client_1 = require("@prisma/client");
const card_matching_1 = require("./card-matching");
const puppeteer_scraping_1 = require("./puppeteer-scraping");
const pricecharting_scraping_1 = require("./pricecharting-scraping");
const scraping_fallback_1 = require("./scraping-fallback");
const prisma = new client_1.PrismaClient();
class CardService {
    constructor() {
        this.cache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }
    async addCard(url, profileName) {
        console.log('🔍 CardService.addCard called with:', { url, profileName });
        try {
            // 1. Extract card metadata and scrape data OUTSIDE transaction
            console.log('🔍 Extracting card metadata...');
            let cardName = '';
            let cardNumber = '';
            if (url.includes('tcgplayer.com')) {
                // Remove query parameters before parsing
                const cleanUrl = url.split('?')[0];
                // More flexible regex to handle different TCGplayer URL formats
                const urlMatch = cleanUrl.match(/\/product\/\d+\/([^\/\?]+)/);
                if (urlMatch) {
                    const urlSegment = urlMatch[1];
                    cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '));
                    // Try to extract card number from URL segment
                    // Look for patterns like "tatsugiri-112", "tatsugiri-112101", or "magikarp-080-073"
                    const numberMatch = urlSegment.match(/-(\d+)$/);
                    if (numberMatch) {
                        const fullNumber = numberMatch[1];
                        // If the number is 6 digits (like 112101), extract the first 3 digits (112)
                        if (fullNumber.length === 6) {
                            cardNumber = fullNumber.substring(0, 3);
                        }
                        else {
                            cardNumber = fullNumber;
                        }
                    }
                    // Also try to match patterns like "magikarp-080-073" where we want the first number
                    const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/);
                    if (multiNumberMatch) {
                        const firstNumber = multiNumberMatch[1];
                        const secondNumber = multiNumberMatch[2];
                        // Use the first number as the card number
                        cardNumber = firstNumber;
                        console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`);
                    }
                }
                else {
                    // Fallback: try to extract from the end of the URL
                    const fallbackMatch = cleanUrl.match(/\/([^\/\?]+)$/);
                    if (fallbackMatch) {
                        const urlSegment = fallbackMatch[1];
                        cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '));
                        // Try to extract card number from URL segment
                        const numberMatch = urlSegment.match(/-(\d+)$/);
                        if (numberMatch) {
                            const fullNumber = numberMatch[1];
                            // If the number is 6 digits (like 112101), extract the first 3 digits (112)
                            if (fullNumber.length === 6) {
                                cardNumber = fullNumber.substring(0, 3);
                            }
                            else {
                                cardNumber = fullNumber;
                            }
                        }
                        // Also try to match patterns like "magikarp-080-073" where we want the first number
                        const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/);
                        if (multiNumberMatch) {
                            const firstNumber = multiNumberMatch[1];
                            const secondNumber = multiNumberMatch[2];
                            // Use the first number as the card number
                            cardNumber = firstNumber;
                            console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`);
                        }
                    }
                }
            }
            else if (url.includes('pricecharting.com')) {
                // Remove query parameters before parsing
                const cleanUrl = url.split('?')[0];
                // More flexible regex to handle different PriceCharting URL formats
                const urlMatch = cleanUrl.match(/\/game\/[^\/]+\/([^\/\?]+)/);
                if (urlMatch) {
                    const urlSegment = urlMatch[1];
                    cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '));
                    // Try to extract card number from URL segment
                    const numberMatch = urlSegment.match(/-(\d+)$/);
                    if (numberMatch) {
                        cardNumber = numberMatch[1];
                    }
                }
                else {
                    // Fallback: try to extract from the end of the URL
                    const fallbackMatch = cleanUrl.match(/\/([^\/\?]+)$/);
                    if (fallbackMatch) {
                        const urlSegment = fallbackMatch[1];
                        cardName = decodeURIComponent(urlSegment.replace(/-/g, ' '));
                        // Try to extract card number from URL segment
                        const numberMatch = urlSegment.match(/-(\d+)$/);
                        if (numberMatch) {
                            const fullNumber = numberMatch[1];
                            // If the number is 6 digits (like 112101), extract the first 3 digits (112)
                            if (fullNumber.length === 6) {
                                cardNumber = fullNumber.substring(0, 3);
                            }
                            else {
                                cardNumber = fullNumber;
                            }
                        }
                        // Also try to match patterns like "magikarp-080-073" where we want the first number
                        const multiNumberMatch = urlSegment.match(/-(\d+)-(\d+)$/);
                        if (multiNumberMatch) {
                            const firstNumber = multiNumberMatch[1];
                            const secondNumber = multiNumberMatch[2];
                            // Use the first number as the card number
                            cardNumber = firstNumber;
                            console.log(`🔍 Found multi-number pattern: ${firstNumber}-${secondNumber}, using ${firstNumber}`);
                        }
                    }
                }
            }
            // 2. Scrape card data OUTSIDE transaction
            console.log('🔍 Scraping card data...');
            const sourceData = await this.scrapeCardData(url);
            console.log('🔍 Scraped data:', sourceData);
            // 3. Use scraped card name if available, otherwise use URL-extracted name
            let finalCardName = cardName;
            if (sourceData && sourceData.name && typeof sourceData.name === 'string') {
                finalCardName = sourceData.name;
                console.log('🔍 Using card name from scraped data:', finalCardName);
            }
            else {
                console.log('🔍 Using card name from URL:', finalCardName);
            }
            // 4. Extract card number from scraped data if available
            if (sourceData && sourceData.cardNumber && typeof sourceData.cardNumber === 'string') {
                // Use the card number extracted from H1 element
                cardNumber = sourceData.cardNumber;
                console.log('🔍 Using card number from H1 element:', cardNumber);
            }
            else if (sourceData && sourceData.No && typeof sourceData.No === 'string') {
                // Fallback: Extract number from No (e.g., "112/101" -> "112")
                const jpNoMatch = sourceData.No.match(/^(\d+)\/\d+$/);
                if (jpNoMatch) {
                    cardNumber = jpNoMatch[1];
                    console.log('🔍 Using card number from No:', cardNumber);
                }
            }
            // 5. Extract card match with final card name and updated card number
            const cardMatch = (0, card_matching_1.extractCardMatch)(finalCardName, url, cardNumber);
            console.log('🔍 Card match result:', cardMatch);
            if (!cardMatch) {
                throw new Error('Could not extract card information from URL');
            }
            // Validate scraped data
            if (!sourceData || typeof sourceData !== 'object') {
                throw new Error('Failed to scrape card data - no data returned');
            }
            if (!sourceData.sourceType) {
                throw new Error('Failed to scrape card data - missing sourceType');
            }
            // 6. Now do database operations in transaction
            return await prisma.$transaction(async (tx) => {
                try {
                    console.log('🔍 Starting transaction');
                    // 0. Ensure profile exists
                    let profile = await tx.profile.findUnique({ where: { name: profileName } });
                    if (!profile) {
                        console.log('🔍 Creating new profile:', profileName);
                        profile = await tx.profile.create({ data: { name: profileName } });
                    }
                    console.log('🔍 Profile found/created:', profile.id);
                    // 4. Find existing cards with same name and number
                    console.log('🔍 Looking for existing cards...');
                    const existingCards = await this.findMatchingCards(tx, cardMatch);
                    console.log('🔍 Found existing cards:', existingCards.length);
                    if (existingCards.length > 0) {
                        // 5. Merge with existing card
                        const mergedCard = await this.mergeWithExisting(tx, existingCards[0], url, profile.id, sourceData);
                        return this.getCardDisplayData(mergedCard);
                    }
                    else {
                        // 6. Create new card
                        console.log('🔍 Creating new card...');
                        const newCard = await this.createNewCard(tx, cardMatch, url, profile.id, sourceData);
                        console.log('🔍 New card created:', newCard.id);
                        return this.getCardDisplayData(newCard);
                    }
                }
                catch (error) {
                    console.error('❌ Error in transaction:', error);
                    throw error;
                }
            });
        }
        catch (error) {
            console.error('❌ Error adding card:', error);
            console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
            throw error;
        }
    }
    async getCardsForProfile(profileName) {
        // Ensure profile exists
        let profile = await prisma.profile.findUnique({ where: { name: profileName } });
        if (!profile) {
            profile = await prisma.profile.create({ data: { name: profileName } });
        }
        const userCards = await prisma.userCard.findMany({
            where: { userId: profile.id },
            include: {
                card: {
                    include: {
                        sources: {
                            include: {
                                prices: true
                            }
                        }
                    }
                }
            }
        });
        return userCards.map(uc => this.getCardDisplayData(uc.card));
    }
    async refreshCard(cardId) {
        // First, get the card to find its sources
        const card = await this.getCardWithSources(prisma, cardId);
        if (!card) {
            throw new Error('Card not found');
        }
        // Scrape all sources OUTSIDE transaction to avoid timeout
        const refreshPromises = card.sources.map(async (source) => {
            try {
                console.log(`🔍 Refreshing source: ${source.sourceType} - ${source.url}`);
                const newData = await this.scrapeCardData(source.url);
                console.log(`✅ Scraped data for ${source.sourceType}:`, newData);
                return { source, newData };
            }
            catch (error) {
                console.error(`❌ Failed to refresh source ${source.id}:`, error);
                return { source, newData: null, error };
            }
        });
        const refreshResults = await Promise.all(refreshPromises);
        // Now update the database in a transaction
        return await prisma.$transaction(async (tx) => {
            for (const result of refreshResults) {
                if (result.newData) {
                    await this.refreshCardSource(tx, result.source.id, result.newData);
                }
                // If scraping failed, we just skip updating that source
            }
            // Return updated card
            const updatedCard = await this.getCardWithSources(tx, cardId);
            return this.getCardDisplayData(updatedCard);
        });
    }
    async deleteCard(cardId, profileName) {
        await prisma.$transaction(async (tx) => {
            // Get profile ID
            const profile = await tx.profile.findUnique({ where: { name: profileName } });
            if (!profile) {
                throw new Error('Profile not found');
            }
            // Remove user relationship
            await tx.userCard.deleteMany({
                where: {
                    userId: profile.id,
                    cardId: cardId
                }
            });
            // Check if other users have this card
            const hasOtherUsers = await tx.userCard.findFirst({
                where: { cardId: cardId }
            });
            if (!hasOtherUsers) {
                // No other users, delete everything
                await tx.cardPrice.deleteMany({
                    where: {
                        source: {
                            cardId: cardId
                        }
                    }
                });
                await tx.cardSource.deleteMany({
                    where: { cardId: cardId }
                });
                await tx.card.delete({
                    where: { id: cardId }
                });
            }
        });
    }
    async findMatchingCards(tx, cardMatch) {
        // Get all cards and use the improved matching logic
        const allCards = await tx.card.findMany({
            include: {
                sources: {
                    include: {
                        prices: true
                    }
                }
            }
        });
        // Filter cards using the improved matching logic
        const matchingCards = allCards.filter(card => {
            // Use the improved card matching logic
            const existingCardMatch = {
                name: card.name,
                number: card.No || ''
            };
            return (0, card_matching_1.areCardsSame)(existingCardMatch, cardMatch);
        });
        return matchingCards;
    }
    async mergeWithExisting(tx, existingCard, newUrl, profileId, newSourceData) {
        // 1. Use pre-scraped data (no need to scrape again)
        // 2. Check if source already exists
        const sourceType = typeof newSourceData.sourceType === 'string' ? newSourceData.sourceType : 'unknown';
        const existingSource = await tx.cardSource.findUnique({
            where: {
                cardId_sourceType: {
                    cardId: existingCard.id,
                    sourceType: sourceType
                }
            }
        });
        if (existingSource) {
            // Update existing source
            await this.updateCardSource(tx, existingSource.id, newSourceData);
        }
        else {
            // Create new source
            await this.createCardSource(tx, existingCard.id, newSourceData);
        }
        // 3. Ensure user relationship exists
        await tx.userCard.upsert({
            where: {
                userId_cardId: {
                    userId: profileId,
                    cardId: existingCard.id
                }
            },
            update: {},
            create: {
                userId: profileId,
                cardId: existingCard.id
            }
        });
        // 4. Return updated card
        const updatedCard = await this.getCardWithSources(tx, existingCard.id);
        if (!updatedCard) {
            throw new Error('Failed to retrieve updated card');
        }
        return updatedCard;
    }
    async createNewCard(tx, cardMatch, url, profileId, sourceData) {
        console.log('🔍 createNewCard called with:', { cardMatch, url, profileId });
        // 1. Use pre-scraped data (no need to scrape again)
        console.log('🔍 Using pre-scraped data:', sourceData);
        // 2. Create card record
        console.log('🔍 Creating card record...');
        const card = await tx.card.create({
            data: {
                name: cardMatch.name, // Use the card match name, not the scraped data name
                setDisplay: typeof sourceData.setDisplay === 'string' ? sourceData.setDisplay : undefined,
                No: cardMatch.number,
                rarity: typeof sourceData.rarity === 'string' ? sourceData.rarity : undefined,
                imageUrl: typeof sourceData.imageUrl === 'string' ? sourceData.imageUrl : undefined
            }
        });
        console.log('🔍 Card created with ID:', card.id);
        // 3. Add source data
        await this.createCardSource(tx, card.id, sourceData);
        // 4. Add user relationship
        await tx.userCard.create({
            data: {
                userId: profileId,
                cardId: card.id
            }
        });
        // 5. Return complete card
        const newCard = await this.getCardWithSources(tx, card.id);
        if (!newCard) {
            throw new Error('Failed to retrieve created card');
        }
        return newCard;
    }
    async createCardSource(tx, cardId, sourceData) {
        // Validate sourceData
        if (!sourceData || typeof sourceData !== 'object') {
            throw new Error('Invalid sourceData provided to createCardSource');
        }
        const source = await tx.cardSource.create({
            data: {
                cardId: cardId,
                sourceType: typeof sourceData.sourceType === 'string' ? sourceData.sourceType : 'unknown',
                url: typeof sourceData.url === 'string' ? sourceData.url : '',
                productId: typeof sourceData.productId === 'string' ? sourceData.productId : '',
                currency: typeof sourceData.currency === 'string' ? sourceData.currency : 'USD',
                lastCheckedAt: new Date()
            }
        });
        // Create prices
        const prices = this.extractPrices(sourceData);
        for (const price of prices) {
            await tx.cardPrice.create({
                data: {
                    sourceId: source.id,
                    priceType: price.priceType,
                    price: price.price
                }
            });
        }
    }
    async updateCardSource(tx, sourceId, sourceData) {
        // Validate sourceData
        if (!sourceData || typeof sourceData !== 'object') {
            throw new Error('Invalid sourceData provided to updateCardSource');
        }
        // Update source metadata
        await tx.cardSource.update({
            where: { id: sourceId },
            data: {
                url: typeof sourceData.url === 'string' ? sourceData.url : '',
                productId: typeof sourceData.productId === 'string' ? sourceData.productId : '',
                currency: typeof sourceData.currency === 'string' ? sourceData.currency : 'USD',
                lastCheckedAt: new Date()
            }
        });
        // Update prices
        const prices = this.extractPrices(sourceData);
        for (const price of prices) {
            await tx.cardPrice.upsert({
                where: {
                    sourceId_priceType: {
                        sourceId: sourceId,
                        priceType: price.priceType
                    }
                },
                update: {
                    price: price.price
                },
                create: {
                    sourceId: sourceId,
                    priceType: price.priceType,
                    price: price.price
                }
            });
        }
    }
    async refreshCardSource(tx, sourceId, sourceData) {
        // Validate sourceData
        if (!sourceData || typeof sourceData !== 'object') {
            throw new Error('Invalid sourceData provided to refreshCardSource');
        }
        // Only update lastCheckedAt timestamp for refresh
        await tx.cardSource.update({
            where: { id: sourceId },
            data: {
                lastCheckedAt: new Date()
            }
        });
        // Update prices only
        const prices = this.extractPrices(sourceData);
        for (const price of prices) {
            await tx.cardPrice.upsert({
                where: {
                    sourceId_priceType: {
                        sourceId: sourceId,
                        priceType: price.priceType
                    }
                },
                update: {
                    price: price.price
                },
                create: {
                    sourceId: sourceId,
                    priceType: price.priceType,
                    price: price.price
                }
            });
        }
    }
    async getCardWithSources(tx, cardId) {
        const card = await tx.card.findUnique({
            where: { id: cardId },
            include: {
                sources: {
                    include: {
                        prices: true
                    }
                }
            }
        });
        return card;
    }
    async scrapeCardData(url) {
        // Validate URL
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid URL provided to scrapeCardData');
        }
        if (url.includes('tcgplayer.com')) {
            // Strip query parameters for consistent storage
            const cleanUrl = url.split('?')[0];
            try {
                const productIdMatch = url.match(/\/product\/(\d+)(?:\/|$|\?)/);
                if (!productIdMatch) {
                    throw new Error('Invalid TCGplayer URL format');
                }
                const scrapedData = await (0, puppeteer_scraping_1.scrapeWithPuppeteer)(url, productIdMatch[1]);
                return Object.assign(Object.assign({}, scrapedData), { sourceType: 'tcgplayer', productId: productIdMatch[1], currency: 'USD', url: cleanUrl });
            }
            catch (error) {
                console.warn('Puppeteer scraping failed, using fallback:', error);
                const fallbackData = await (0, scraping_fallback_1.scrapeWithFallback)(url, '');
                return Object.assign(Object.assign({}, fallbackData), { sourceType: 'tcgplayer', productId: '', currency: 'USD', url: cleanUrl });
            }
        }
        else if (url.includes('pricecharting.com')) {
            // Strip query parameters for consistent storage
            const cleanUrl = url.split('?')[0];
            const scrapedData = await (0, pricecharting_scraping_1.scrapePriceCharting)(url);
            return Object.assign(Object.assign({}, scrapedData), { sourceType: 'pricecharting', productId: '', currency: 'USD', url: cleanUrl });
        }
        else {
            throw new Error('Unsupported URL format');
        }
    }
    extractPrices(sourceData) {
        // Validate sourceData
        if (!sourceData || typeof sourceData !== 'object') {
            console.warn('Invalid sourceData provided to extractPrices:', sourceData);
            return [];
        }
        const prices = [];
        if (typeof sourceData.marketPrice === 'number') {
            prices.push({ priceType: 'market', price: sourceData.marketPrice });
        }
        if (typeof sourceData.ungradedPrice === 'number') {
            prices.push({ priceType: 'ungraded', price: sourceData.ungradedPrice });
        }
        if (typeof sourceData.grade7Price === 'number') {
            prices.push({ priceType: 'grade7', price: sourceData.grade7Price });
        }
        if (typeof sourceData.grade8Price === 'number') {
            prices.push({ priceType: 'grade8', price: sourceData.grade8Price });
        }
        if (typeof sourceData.grade9Price === 'number') {
            prices.push({ priceType: 'grade9', price: sourceData.grade9Price });
        }
        if (typeof sourceData.grade95Price === 'number') {
            prices.push({ priceType: 'grade95', price: sourceData.grade95Price });
        }
        if (typeof sourceData.grade10Price === 'number') {
            prices.push({ priceType: 'grade10', price: sourceData.grade10Price });
        }
        return prices;
    }
    getCardDisplayData(card) {
        var _a, _b, _c, _d, _e;
        const consolidatedPricing = this.consolidatePricing(card.sources);
        return {
            id: card.id,
            name: card.name,
            url: ((_a = card.sources[0]) === null || _a === void 0 ? void 0 : _a.url) || '',
            isMerged: card.sources.length > 1,
            sourceCount: card.sources.length,
            sources: card.sources.map(s => ({
                type: s.sourceType,
                url: s.url,
                displayName: s.sourceType === 'tcgplayer' ? 'TCGplayer' : 'PriceCharting'
            })),
            pricing: consolidatedPricing,
            // Flatten pricing data for frontend compatibility
            marketPrice: consolidatedPricing.marketPrice,
            ungradedPrice: consolidatedPricing.ungradedPrice,
            grade7Price: consolidatedPricing.grade7Price,
            grade8Price: consolidatedPricing.grade8Price,
            grade9Price: consolidatedPricing.grade9Price,
            grade95Price: consolidatedPricing.grade95Price,
            grade10Price: consolidatedPricing.grade10Price,
            setDisplay: (_b = card.setDisplay) !== null && _b !== void 0 ? _b : undefined,
            No: (_c = card.No) !== null && _c !== void 0 ? _c : undefined,
            rarity: (_d = card.rarity) !== null && _d !== void 0 ? _d : undefined,
            imageUrl: (_e = card.imageUrl) !== null && _e !== void 0 ? _e : undefined,
            lastCheckedAt: card.sources.reduce((latest, source) => {
                if (!source.lastCheckedAt)
                    return latest;
                if (!latest)
                    return source.lastCheckedAt;
                return source.lastCheckedAt > latest ? source.lastCheckedAt : latest;
            }, null) || undefined,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
            // Merged card fields
            mergedUrls: card.sources.map(s => s.url),
            mergedSources: card.sources.map(s => s.sourceType)
        };
    }
    consolidatePricing(sources) {
        const pricing = {};
        for (const source of sources) {
            for (const price of source.prices) {
                // Map price types to the expected keys
                let key;
                switch (price.priceType) {
                    case 'market':
                        key = 'marketPrice';
                        break;
                    case 'ungraded':
                        key = 'ungradedPrice';
                        break;
                    case 'grade7':
                        key = 'grade7Price';
                        break;
                    case 'grade8':
                        key = 'grade8Price';
                        break;
                    case 'grade9':
                        key = 'grade9Price';
                        break;
                    case 'grade95':
                        key = 'grade95Price';
                        break;
                    case 'grade10':
                        key = 'grade10Price';
                        break;
                    default:
                        continue;
                }
                if (pricing[key] === undefined) {
                    pricing[key] = Number(price.price);
                }
            }
        }
        return pricing;
    }
    /**
     * Refresh multiple cards for a specific profile
     */
    async refreshCards(cardIds, profileId) {
        console.log(`🔄 Refreshing ${cardIds.length} cards for profile ${profileId}`);
        const errors = [];
        let refreshed = 0;
        for (const cardId of cardIds) {
            try {
                await this.refreshCard(cardId);
                refreshed++;
                console.log(`✅ Refreshed card ${cardId}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`Card ${cardId}: ${errorMessage}`);
                console.error(`❌ Failed to refresh card ${cardId}:`, error);
            }
        }
        console.log(`🔄 Refresh completed: ${refreshed}/${cardIds.length} cards refreshed`);
        return { refreshed, errors };
    }
    /**
     * Get all cards for daily refresh (with profile information)
     */
    async getAllCardsForRefresh() {
        console.log('🔍 Fetching all cards for daily refresh...');
        const cards = await prisma.card.findMany({
            select: {
                id: true,
                name: true,
                No: true,
                userCards: {
                    select: {
                        userId: true
                    }
                }
            }
        });
        // Flatten the userCards relationship to get profile IDs
        const cardsWithProfiles = cards.flatMap(card => card.userCards.map(userCard => ({
            id: card.id,
            profileId: userCard.userId,
            name: card.name,
            No: card.No
        })));
        console.log(`🔍 Found ${cardsWithProfiles.length} cards across all profiles`);
        return cardsWithProfiles;
    }
}
exports.CardService = CardService;
exports.cardService = new CardService();
