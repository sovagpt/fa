// Configuration
const CONFIG = {
    // Your GitHub raw JSON file URL
    POLYMARKET_DATA_URL: 'https://raw.githubusercontent.com/sovagpt/fa/main/polymarket_markets_full.json',
    
    // OpenRouter API configuration
    OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
    
    // Model to use for AI responses
    MODEL: 'anthropic/claude-3.5-sonnet:beta'
};

// Global variables
let polymarketData = null;
let chatHistory = [];
let isLoading = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    try {
        await loadPolymarketData();
        setupEventListeners();
        updateStatus('✅ Market data loaded - Ready to chat!', true);
    } catch (error) {
        console.error('Failed to initialize app:', error);
        updateStatus('❌ Failed to load market data', false);
    }
}

async function loadPolymarketData() {
    try {
        updateStatus('📡 Loading market data...', false);
        const response = await fetch(CONFIG.POLYMARKET_DATA_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        polymarketData = await response.json();
        console.log(`Loaded ${polymarketData.markets?.length || 0} markets`);
        
    } catch (error) {
        console.error('Error loading Polymarket data:', error);
        throw error;
    }
}

function updateStatus(text, isReady) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.querySelector('.status-dot');
    
    statusText.textContent = text;
    statusDot.style.background = isReady ? '#10b981' : '#f59e0b';
}

function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    // Input handling
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Send button
    sendButton.addEventListener('click', sendMessage);
}

function askQuestion(question) {
    const messageInput = document.getElementById('messageInput');
    messageInput.value = question;
    sendMessage();
}

async function sendMessage() {
    if (isLoading) return;
    
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!polymarketData) {
        alert('Market data is still loading. Please wait a moment and try again.');
        return;
    }

    // Clear welcome message if it exists
    const welcomeMsg = document.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Add user message
    addMessage('user', message);
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        isLoading = true;
        const response = await getAIResponse(message);
        hideTypingIndicator();
        addMessage('bot', response);
    } catch (error) {
        console.error('Error getting AI response:', error);
        hideTypingIndicator();
        addMessage('bot', '❌ Sorry, I encountered an error while processing your request. Please try again.');
    } finally {
        isLoading = false;
    }
}

async function getAIResponse(userMessage) {
    // Find relevant markets based on user query
    const relevantMarkets = findRelevantMarkets(userMessage);
    
    // Create context for AI
    const context = createAIContext(userMessage, relevantMarkets);
    
    // Get AI response using OpenRouter
    const aiResponse = await callOpenRouterAPI(context);
    
    // Format response with market cards
    return formatResponseWithMarkets(aiResponse, relevantMarkets);
}

function findRelevantMarkets(query) {
    const queryLower = query.toLowerCase();
    const markets = polymarketData.markets || [];
    
    // Define search keywords and categories
    const categories = {
        'premier_league': ['premier league', 'epl', 'english premier', 'manchester', 'liverpool', 'chelsea', 'arsenal', 'tottenham'],
        'football': ['football', 'soccer', 'fifa', 'world cup', 'uefa', 'champions league'],
        'american_football': ['nfl', 'super bowl', 'american football', 'chiefs', 'cowboys', 'patriots'],
        'basketball': ['nba', 'basketball', 'lakers', 'warriors', 'lebron', 'finals'],
        'baseball': ['mlb', 'baseball', 'yankees', 'dodgers', 'world series'],
        'fed_rates': ['fed', 'federal reserve', 'interest rate', 'fomc', 'jerome powell'],
        'politics': ['election', 'president', 'biden', 'trump', 'congress', 'senate'],
        'crypto': ['bitcoin', 'ethereum', 'crypto', 'btc', 'eth', 'binance', 'coinbase'],
        'stocks': ['stock', 'nasdaq', 'dow', 'sp500', 's&p', 'apple', 'tesla', 'nvidia'],
        'entertainment': ['oscar', 'emmy', 'grammy', 'movie', 'netflix', 'disney']
    };
    
    let relevantMarkets = [];
    let searchScore = {};
    
    // Score markets based on relevance
    markets.forEach((market, index) => {
        const title = market.title.toLowerCase();
        const description = market.description.toLowerCase();
        let score = 0;
        
        // Direct keyword matching
        const queryWords = queryLower.split(' ').filter(word => word.length > 2);
        queryWords.forEach(word => {
            if (title.includes(word)) score += 10;
            if (description.includes(word)) score += 5;
        });
        
        // Category matching
        Object.entries(categories).forEach(([category, keywords]) => {
            keywords.forEach(keyword => {
                if (queryLower.includes(keyword)) {
                    if (title.includes(keyword) || description.includes(keyword)) {
                        score += 15;
                    }
                }
            });
        });
        
        // Volume weighting (popular markets are more relevant)
        if (market.volume24h > 1000000) score += 3;
        if (market.volume24h > 5000000) score += 2;
        
        if (score > 0) {
            searchScore[index] = score;
        }
    });
    
    // Sort by relevance score and get top results
    relevantMarkets = Object.entries(searchScore)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([index]) => markets[parseInt(index)]);
    
    // If no relevant markets found, show highest volume markets
    if (relevantMarkets.length === 0) {
        relevantMarkets = markets
            .filter(m => m.volume24h > 0)
            .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
            .slice(0, 5);
    }
    
    return relevantMarkets;
}

function createAIContext(userMessage, relevantMarkets) {
    const marketData = relevantMarkets.map(market => ({
        title: market.title,
        description: market.description,
        outcomes: market.outcomes,
        volume24h: market.volume24h,
        volumeTotal: market.volumeTotal,
        liquidity: market.liquidity,
        favoredOutcome: market.favoredOutcome
    }));
    
    return `
User Question: "${userMessage}"

Relevant Betting Markets Data:
${JSON.stringify(marketData, null, 2)}

Instructions:
1. Analyze the provided betting markets data that are relevant to the user's question
2. Give your expert opinion on the most likely outcomes based on the market data
3. Explain your reasoning using the odds, volume, and market sentiment
4. Be conversational and engaging
5. If asked about who will win something, look at the market odds and give your prediction
6. Consider volume and liquidity as indicators of market confidence
7. Keep your response concise but informative
8. Don't mention that you're looking at JSON data - just analyze the markets naturally

Please provide your analysis and predictions based on this market data.
`;
}

async function callOpenRouterAPI(context) {
    const response = await fetch(CONFIG.OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Polymarket AI Advisor'
        },
        body: JSON.stringify({
            model: CONFIG.MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert betting analyst who provides intelligent insights on prediction markets. Analyze market data and give clear, confident predictions with reasoning.'
                },
                {
                    role: 'user',
                    content: context
                }
            ],
            max_tokens: 1000,
            temperature: 0.7
        })
    });
    
    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

function formatResponseWithMarkets(aiResponse, relevantMarkets) {
    let formattedResponse = aiResponse;
    
    if (relevantMarkets.length > 0) {
        formattedResponse += '<br><br><strong>📊 Relevant Markets:</strong><br>';
        
        relevantMarkets.forEach((market, index) => {
            formattedResponse += createMarketCard(market, index);
        });
    }
    
    return formattedResponse;
}

function createMarketCard(market, index) {
    const formatVolume = (vol) => {
        if (!vol || vol === 0) return '$0';
        if (vol > 1000000) return `$${(vol / 1000000).toFixed(1)}M`;
        if (vol > 1000) return `$${(vol / 1000).toFixed(1)}K`;
        return `$${vol.toFixed(0)}`;
    };
    
    const formatPrice = (price) => `${(price * 100).toFixed(1)}%`;
    
    const outcome1 = market.outcomes[0];
    const outcome2 = market.outcomes[1];
    
    // Determine which outcome is favored
    const outcome1Class = outcome1.price > 0.6 ? 'favored' : outcome1.price < 0.4 ? 'underdog' : 'neutral';
    const outcome2Class = outcome2.price > 0.6 ? 'favored' : outcome2.price < 0.4 ? 'underdog' : 'neutral';
    
    return `
        <div class="market-card" onclick="analyzeSpecificMarket('${market.id}', '${market.title.replace(/'/g, "\\'")}')">
            <div class="market-title">${market.title}</div>
            <div class="market-outcomes">
                <div class="outcome ${outcome1Class}">
                    ${outcome1.name}: ${formatPrice(outcome1.price)}
                </div>
                <div class="outcome ${outcome2Class}">
                    ${outcome2.name}: ${formatPrice(outcome2.price)}
                </div>
            </div>
            <div class="market-stats">
                <div class="stat-item">
                    <span class="stat-label">24h Volume</span>
                    <span class="stat-value">${formatVolume(market.volume24h)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Total Volume</span>
                    <span class="stat-value">${formatVolume(market.volumeTotal)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Liquidity</span>
                    <span class="stat-value">${formatVolume(market.liquidity)}</span>
                </div>
            </div>
        </div>
    `;
}

async function analyzeSpecificMarket(marketId, marketTitle) {
    const market = polymarketData.markets.find(m => m.id === marketId);
    if (!market) return;
    
    // Add user message showing they clicked on this market
    addMessage('user', `Tell me more about: ${marketTitle}`);
    
    showTypingIndicator();
    
    try {
        const detailedAnalysis = await getDetailedMarketAnalysis(market);
        hideTypingIndicator();
        addMessage('bot', detailedAnalysis);
    } catch (error) {
        console.error('Error getting detailed analysis:', error);
        hideTypingIndicator();
        addMessage('bot', '❌ Sorry, I couldn\'t analyze this specific market right now.');
    }
}

async function getDetailedMarketAnalysis(market) {
    const context = `
Provide a detailed analysis of this specific betting market:

Title: ${market.title}
Description: ${market.description}
Outcomes: ${JSON.stringify(market.outcomes)}
24h Volume: ${market.volume24h}
Total Volume: ${market.volumeTotal}
Liquidity: ${market.liquidity}
Favored Outcome: ${market.favoredOutcome}
End Date: ${market.endTime}

Please provide:
1. What this market is betting on (in simple terms)
2. Current odds analysis
3. Your prediction and confidence level
4. Key factors that could influence the outcome
5. Risk assessment

Be detailed and specific in your analysis.
`;

    const aiResponse = await callOpenRouterAPI(context);
    
    return `
        <div class="ai-analysis">
            <div class="ai-analysis-header">
                🤖 Detailed Market Analysis
            </div>
            <div class="ai-analysis-content">
                ${aiResponse}
            </div>
        </div>
        
        ${createMarketCard(market, 0)}
    `;
}

function addMessage(sender, content) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = sender === 'user' ? 'You' : 'AI';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = content;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add to chat history
    chatHistory.push({ sender, content });
}

function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    const messagesContainer = document.getElementById('chatMessages');
    indicator.style.display = 'flex';
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = 'none';
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Error handling
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
});

// Export functions for global access
window.askQuestion = askQuestion;
window.analyzeSpecificMarket = analyzeSpecificMarket;
