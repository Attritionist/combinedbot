const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const Web3 = require('web3');
const { ethers } = require('ethers');
require("dotenv").config();
const { BigNumber } = require('ethers');
const fs = require("fs");

// Environment variables
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const COINGECKO_API = process.env.COINGECKO_API;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = 'https://mainnet.base.org';
const VOID_CONTRACT_ADDRESS = '0x21eCEAf3Bf88EF0797E3927d855CA5bb569a47fc';
const YANG_CONTRACT_ADDRESS = '0x384C9c33737121c4499C85D815eA57D1291875Ab';
const ENTROPY_ADDRESS = '0x3ea7299b87deA5D7617a0D28C3879b4277CBDa67';

// Constants
const VOID_TOKEN_DECIMALS = 18;
const YANG_TOKEN_DECIMALS = 8;
const VOID_INITIAL_SUPPLY = 100000000;
const YANG_INITIAL_SUPPLY = 2500000;
const VOID_BURN_ANIMATION = "https://voidonbase.com/burn.jpg";
const YANG_BURN_ANIMATION = "https://fluxonbase.com/burn.jpg";

// Initialize Telegram bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize providers and contracts
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const VOID_ABI = [
    {
        "inputs": [],
        "name": "claimVoid",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "timeLeftCheck",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "timeLeft",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

const YANG_ABI = [
  {
    "inputs": [],
    "name": "doBurn",
    "outputs": [
      {
        "internalType": "bool",
        "name": "_success",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const voidContract = new ethers.Contract(ENTROPY_ADDRESS, VOID_ABI, wallet);
const yangContract = new ethers.Contract(YANG_CONTRACT_ADDRESS, YANG_ABI, wallet);

// Global variables
let voidTotalBurnedAmount = 0;
let yangTotalBurnedAmount = 0;
let currentVoidUsdPrice = null;
let currentYangPrice = 0;
const messageQueue = [];
let isSendingMessage = false;
let processedVoidTransactions = new Set();
let processedUniswapTransactions = new Set();

const processedTransactionsFilePath = "processed_transactions.json";

const POOL_MAPPING = {
  "0xb14e941d34d61ae251ccc08ac15b8455ae9f60a5": "VOID/ETH",
  "0x53a1d9ad828d2ac5f67007738cc5688a753241ba": "VOID/YIN"
};

const REVERSED_POOLS = [];

// Helper functions
function getVoidRank(voidBalance) {
  const VOID_RANKS = {
    "VOID Ultimate": 2000000,
    "VOID Omega": 1500000,
    "VOID Absolute": 1000000,
    // ... (rest of the ranks)
    "VOID Peasant": 1
  };

  let voidRank = "VOID Peasant";
  for (const [rank, threshold] of Object.entries(VOID_RANKS)) {
    if (voidBalance >= threshold) {
      voidRank = rank;
      break;
    }
  }

  return voidRank;
}

function getRankImageUrl(voidRank) {
  const rankToImageUrlMap = {
    "VOID Peasant": "https://voidonbase.com/rank1.png",
    "VOID Initiate": "https://voidonbase.com/rank2.png",
    // ... (rest of the rank images)
    "VOID Ultimate": "https://voidonbase.com/rank54.png"
  };

  return rankToImageUrlMap[voidRank] || "https://voidonbase.com/rank1.png";
}

// Message queue functions
function addToMessageQueue(message) {
  messageQueue.push(message);
}

function addToBurnQueue(photo, options) {
  messageQueue.push({ photo, options });
  sendBurnFromQueue();
}

async function sendBurnFromQueue() {
  if (messageQueue.length > 0 && !isSendingMessage) {
    isSendingMessage = true;
    const message = messageQueue.shift();
    try {
      message.options.disable_notification = true;

      const sentMessage = await bot.sendPhoto(
        TELEGRAM_CHAT_ID,
        message.photo,
        message.options
      );
      
      await bot.pinChatMessage(TELEGRAM_CHAT_ID, sentMessage.message_id, {
        disable_notification: true
      });

      console.log(`[${new Date().toISOString()}] Burn message sent and pinned successfully.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error sending or pinning message:`, error);
    }
    setTimeout(() => {
      isSendingMessage = false;
      sendBurnFromQueue();
    }, 500);
  }
}

async function sendMessageFromQueue() {
  if (messageQueue.length > 0 && !isSendingMessage) {
    isSendingMessage = true;
    const message = messageQueue.shift();
    try {
      await bot.sendPhoto(
        TELEGRAM_CHAT_ID,
        message.photo,
        message.options
      );
    } catch (error) {
      console.error("Error sending message:", error);
    }
    setTimeout(() => {
      isSendingMessage = false;
      sendMessageFromQueue();
    }, 500);
  }
}

async function sendPhotoMessage(photo, options) {
  addToMessageQueue({ photo, options });
  sendMessageFromQueue();
}

async function sendAnimationMessage(photo, options) {
  addToBurnQueue({ photo, options });
  sendBurnFromQueue();
}

// VOID-specific functions
async function getVoidPrice() {
  try {
    const response = await axios.get(
      `https://pro-api.coingecko.com/api/v3/onchain/simple/networks/base/token_price/0x21eCEAf3Bf88EF0797E3927d855CA5bb569a47fc?x_cg_pro_api_key=${COINGECKO_API}`
    );
    const tokenAddress = '0x21eceaf3bf88ef0797e3927d855ca5bb569a47fc'.toLowerCase();
    const voidPrice = response.data.data.attributes.token_prices[tokenAddress];
    return { voidPrice: parseFloat(voidPrice) };
  } catch (error) {
    console.error("Error fetching crypto prices:", error);
    return null;
  }
}

async function updateVoidTotalBurnedAmount() {
  try {
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows; Windows NT 10.4; WOW64; en-US) AppleWebKit/537.20 (KHTML, like Gecko) Chrome/53.0.3086.259 Safari/602.4 Edge/12.29796'
      },
      withCredentials: true
    };

    const apiUrl = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${VOID_CONTRACT_ADDRESS}&address=0x0000000000000000000000000000000000000000&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(apiUrl, config);

    if (response.data.status === "1") {
      const balance = Number(response.data.result) / 10 ** VOID_TOKEN_DECIMALS;
      voidTotalBurnedAmount = balance;
    }
  } catch (error) {
    console.error("Error updating total burned amount:", error);
  }
}

async function detectVoidBurnEvent() {
  try {
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows; Windows NT 10.4; WOW64; en-US) AppleWebKit/537.20 (KHTML, like Gecko) Chrome/53.0.3086.259 Safari/602.4 Edge/12.29796'
      },
      withCredentials: true
    };

    const apiUrl = `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${VOID_CONTRACT_ADDRESS}&address=0x0000000000000000000000000000000000000000&page=1&offset=1&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(apiUrl, config);

    if (response.data.status !== "1") {
      throw new Error("Failed to retrieve token transactions");
    }

    await updateVoidTotalBurnedAmount();

    const newBurnEvents = response.data.result.filter(
      (transaction) =>
        transaction.to.toLowerCase() ===
        "0x0000000000000000000000000000000000000000" &&
        !processedVoidTransactions.has(transaction.hash)
    );

    if (newBurnEvents.length === 0) {
      console.log("No new VOID burn events detected.");
      return;
    }

    newBurnEvents.forEach((transaction) => {
      processedVoidTransactions.add(transaction.hash);
      const amountBurned = Number(transaction.value) / 10 ** VOID_TOKEN_DECIMALS;
      const txHash = transaction.hash;
      const txHashLink = `https://basescan.org/tx/${txHash}`;
      const chartLink = "https://dexscreener.com/base/0x21eCEAf3Bf88EF0797E3927d855CA5bb569a47fc";
      const percentBurned = ((VOID_INITIAL_SUPPLY - voidTotalBurnedAmount) / VOID_INITIAL_SUPPLY) * 100;
      const burnMessage = `VOID Burned!\n\n💀💀💀💀💀\n🔥 Burned: ${amountBurned.toFixed(3)} VOID\nPercent Burned: ${percentBurned.toFixed(2)}%\n🔎 <a href="${chartLink}">Chart</a> | <a href="${txHashLink}">TX Hash</a>`;

      const burnMessageOptions = {
        caption: burnMessage,
        parse_mode: "HTML"
      };

      addToBurnQueue(VOID_BURN_ANIMATION, burnMessageOptions);
    });

    saveProcessedTransactions();
  } catch (error) {
    console.error("Error detecting VOID burn event:", error);
  }
}

async function detectUniswapLatestTransaction() {
  const poolAddresses = Object.keys(POOL_MAPPING);

  poolAddresses.forEach(async (poolAddress) => {
    try {
      const voidPrice = currentVoidUsdPrice;
      const apiUrl = `https://pro-api.coingecko.com/api/v3/onchain/networks/base/pools/${poolAddress}/trades`;
      const response = await axios.get(apiUrl, {
        headers: {
          "X-Cg-Pro-Api-Key": COINGECKO_API,
        }
      });

      if (response.status !== 200) {
        throw new Error("Failed to retrieve latest Uniswap transactions");
      }

      console.log(`Checking for new transactions on ${POOL_MAPPING[poolAddress]} pool...`);

      const transactionsToProcess = response.data.data.filter(
        (transaction) => !processedUniswapTransactions.has(transaction.id)
      );

      if (transactionsToProcess.length === 0) {
        console.warn("No new Uniswap transactions detected.");
        return;
      }

      transactionsToProcess.forEach(async (transaction) => {
        const isBuy = transaction.attributes.kind == 'buy';
        const fromAddress = transaction.attributes.tx_from_address;
        const addressLink = `https://debank.com/profile/${fromAddress}`;
        const txHashLink = `https://basescan.org/tx/${transaction.attributes.tx_hash}`;
        const chartLink = "https://dexscreener.com/base/0x21eCEAf3Bf88EF0797E3927d855CA5bb569a47fc";
        const amountTransferred = REVERSED_POOLS.includes(poolAddress)
          ? isBuy ? Number(transaction.attributes.from_token_amount) : Number(transaction.attributes.to_token_amount)
          : isBuy ? Number(transaction.attributes.to_token_amount) : Number(transaction.attributes.from_token_amount);

        const totalSupply = VOID_INITIAL_SUPPLY - voidTotalBurnedAmount;
        const percentBurned = voidTotalBurnedAmount / VOID_INITIAL_SUPPLY * 100;
        const transactionvalue = transaction.attributes.volume_in_usd;
        const marketCap = voidPrice * totalSupply;

        const balanceDetailsUrl = `https://api.basescan.org/api?module=account&action=tokenbalance&contractaddress=${VOID_CONTRACT_ADDRESS}&address=${fromAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;

const config = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows; Windows NT 10.0; x64) AppleWebKit/603.37 (KHTML, like Gecko) Chrome/53.0.2093.181 Safari/534.4 Edge/12.40330'
          },
          withCredentials: true
        };

        const balanceDetailResponse = await axios.get(balanceDetailsUrl, config);

        if (balanceDetailResponse.data.status === "1") {
          const voidBalance = balanceDetailResponse.data.result / 10 ** VOID_TOKEN_DECIMALS;

          if (isBuy && voidBalance > 1501 && Number(transaction.attributes.volume_in_usd) > 100) {
            // Handle normal buy transaction
            const emojiCount = Math.min(Math.ceil(transaction.attributes.volume_in_usd / 100), 96);
            let emojiString = "";

            for (let i = 0; i < emojiCount; i++) {
              emojiString += "🟣🔥";
            }

            const voidRank = getVoidRank(voidBalance);
            const imageUrl = getRankImageUrl(voidRank);

            const message = `${emojiString}
💸 Bought ${amountTransferred.toFixed(2)} VOID ($${transactionvalue}) (<a href="${addressLink}">View Address</a>)
🟣 VOID Price: $${voidPrice.toFixed(5)}
💰 Market Cap: $${marketCap.toFixed(0)}
🔥 Percent Burned: ${percentBurned.toFixed(3)}%
<a href="${chartLink}">📈 Chart</a>
<a href="${txHashLink}">💱 TX Hash</a>
⚖️ Remaining VOID Balance: ${voidBalance.toFixed(2)}
🛡️ VOID Rank: ${voidRank}
🚰 Pool: ${POOL_MAPPING[poolAddress]}`;

            const voidMessageOptions = {
              caption: message,
              parse_mode: "HTML",
            };

            sendPhotoMessage(imageUrl, voidMessageOptions);
            processedUniswapTransactions.add(transaction.id);
          } else if (isBuy && voidBalance < 1501 && Number(transaction.attributes.volume_in_usd) > 1000) {
            // Handle arbitrage buy transaction
            const emojiCount = Math.floor(Math.min(Math.ceil(transaction.attributes.volume_in_usd / 100), 96));
            let emojiString = "";

            for (let i = 0; i < emojiCount; i++) {
              emojiString += "🤖🔩";
            }

            const imageUrl = "https://voidonbase.com/arbitrage.jpg";

            const message = `${emojiString}
💸 Bought ${amountTransferred.toFixed(2)} VOID ($${transactionvalue}) (<a href="${addressLink}">View Address</a>)
🟣 VOID Price: $${voidPrice.toFixed(5)}
💰 Market Cap: $${marketCap.toFixed(0)}
🔥 Percent Burned: ${percentBurned.toFixed(3)}%
<a href="${chartLink}">📈 Chart</a>
<a href="${txHashLink}">💱 TX Hash</a>
⚠️ Arbitrage Transaction
🚰 Pool: ${POOL_MAPPING[poolAddress]}`;

            const voidMessageOptions = {
              caption: message,
              parse_mode: "HTML",
            };

            sendPhotoMessage(imageUrl, voidMessageOptions);
            processedUniswapTransactions.add(transaction.id);
          } else {
            processedUniswapTransactions.add(transaction.id);
            console.error("Transaction amount too low to process, tx hash:", transaction.attributes.tx_hash + " skipping...");
          }
        }
      });
    } catch (error) {
      console.error("Error in detectUniswapLatestTransaction:", error);
    }
  });
}

async function claimLoop() {
  try {
    console.log(`[${new Date().toISOString()}] Checking if it's time to claim VOID...`);

    let canClaim = false;
    let timeLeft;

    try {
      console.log(`[${new Date().toISOString()}] Attempting to call timeLeftCheck...`);
      const tx = await voidContract.timeLeftCheck();
      console.log(`[${new Date().toISOString()}] timeLeftCheck transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[${new Date().toISOString()}] timeLeftCheck transaction confirmed. Gas used: ${receipt.gasUsed.toString()}`);
      
      timeLeft = await voidContract.timeLeft();
      console.log(`[${new Date().toISOString()}] Raw time left until next claim: ${timeLeft.toString()} seconds`);
      
      const buffer = BigNumber.from(10);
      timeLeft = timeLeft.add(buffer);
      console.log(`[${new Date().toISOString()}] Time left with buffer: ${timeLeft.toString()} seconds (including ${buffer.toString()} seconds buffer)`);
    } catch (error) {
      console.log(`[${new Date().toISOString()}] timeLeftCheck reverted. This likely means it's time to claim.`);
      console.log(`[${new Date().toISOString()}] Error details:`, error.message);
      canClaim = true;
    }

    if (canClaim) {
      console.log(`[${new Date().toISOString()}] Claim time reached. Attempting to claim VOID...`);

      try {
        const claimTx = await voidContract.claimVoid();
        console.log(`[${new Date().toISOString()}] Claim transaction sent: ${claimTx.hash}`);
        const claimReceipt = await claimTx.wait();
        console.log(`[${new Date().toISOString()}] Claim transaction confirmed. Gas used: ${claimReceipt.gasUsed.toString()}`);
        
        timeLeft = await voidContract.timeLeft();
        console.log(`[${new Date().toISOString()}] Raw new time left until next claim: ${timeLeft.toString()} seconds`);
        
        const buffer = BigNumber.from(10);
        timeLeft = timeLeft.add(buffer);
        console.log(`[${new Date().toISOString()}] New time left with buffer: ${timeLeft.toString()} seconds (including ${buffer.toString()} seconds buffer)`);
      } catch (claimError) {
        console.error(`[${new Date().toISOString()}] Error claiming VOID:`, claimError.message);
        timeLeft = BigNumber.from(300); // Check again in 5 minutes
      }
    }

    timeLeft = BigNumber.from(timeLeft);

    const minWaitTime = BigNumber.from(30); // 30 seconds
    const maxWaitTime = BigNumber.from(173000); // ~48 hours in seconds
    const waitTime = timeLeft.gt(maxWaitTime) ? maxWaitTime : timeLeft.lt(minWaitTime) ? minWaitTime : timeLeft;

    console.log(`[${new Date().toISOString()}] Waiting ${waitTime.toString()} seconds before next check...`);
    const nextCheckTime = new Date(Date.now() + waitTime.toNumber() * 1000);
    console.log(`[${new Date().toISOString()}] Next check scheduled for: ${nextCheckTime.toISOString()}`);

    await new Promise(resolve => setTimeout(resolve, waitTime.toNumber() * 1000));

    claimLoop();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in claim loop:`, error.message);
    const retryTime = 60000; // 1 minute
    console.log(`[${new Date().toISOString()}] Retrying in ${retryTime / 1000} seconds...`);
    setTimeout(claimLoop, retryTime);
  }
}

// YANG-specific functions
async function updateYangTotalBurnedAmount() {
  try {
    const config = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows; Windows NT 10.4; WOW64; en-US) AppleWebKit/537.20 (KHTML, like Gecko) Chrome/53.0.3086.259 Safari/602.4 Edge/12.29796'
      },
      withCredentials: true
    };

    const apiUrl = `https://api.basescan.org/api?module=stats&action=tokensupply&contractaddress=${YANG_CONTRACT_ADDRESS}&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(apiUrl, config);

    if (response.data.status === "1") {
      const currentSupply = Number(response.data.result) / 10 ** YANG_TOKEN_DECIMALS;
      yangTotalBurnedAmount = YANG_INITIAL_SUPPLY - currentSupply;
      console.log(`Total YANG burned amount updated: ${yangTotalBurnedAmount.toFixed(8)}`);
    }
  } catch (error) {
    console.error("Error updating total YANG burned amount:", error);
  }
}

async function doBurn() {
  try {
    console.log('Calling YANG doBurn function...');
    const tx = await yangContract.doBurn();
    await tx.wait();
    console.log('YANG burn transaction successful:', tx.hash);
  } catch (error) {
    console.error('Error calling YANG doBurn:', error);
  }
}

async function getCurrentYangPrice() {
  try {
    const price = await yangContract.getCurrentPrice();
    return (price / 10**YANG_TOKEN_DECIMALS).toFixed(4);
  } catch (error) {
    console.error("Error getting current YANG price:", error);
    return null;
  }
}

async function checkYangTotalSupply() {
  try {
    const apiUrl = `https://api.basescan.org/api?module=stats&action=tokensupply&contractaddress=${YANG_CONTRACT_ADDRESS}&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(apiUrl);

    if (response.data.status === "1") {
      const newTotalSupply = Number(response.data.result) / 10 ** YANG_TOKEN_DECIMALS;
      const previousTotalSupply = YANG_INITIAL_SUPPLY - yangTotalBurnedAmount;
      
      if (newTotalSupply < previousTotalSupply) {
        const burnedAmount = previousTotalSupply - newTotalSupply;
        yangTotalBurnedAmount += burnedAmount;
        await reportYangBurn(burnedAmount, previousTotalSupply);
      }
    } else {
      throw new Error("Failed to retrieve YANG total supply");
    }
  } catch (error) {
    console.error("Error checking YANG total supply:", error);
  }
}

async function reportYangBurn(burnedAmount, previousTotalSupply) {
  const percentBurned = ((YANG_INITIAL_SUPPLY - (previousTotalSupply - burnedAmount)) / YANG_INITIAL_SUPPLY) * 100;
  const newlyBurnedPercent = (burnedAmount / YANG_INITIAL_SUPPLY) * 100;
  const currentPrice = await getCurrentYangPrice();
  
  const burnMessage = `YANG Burned!\n\n☀️☀️☀️☀️☀️\n🔥 Burned: ${burnedAmount.toFixed(8)} YANG (${newlyBurnedPercent.toFixed(4)}%)\n🔥 Total Burned: ${yangTotalBurnedAmount.toFixed(8)} YANG\n🔥 Total Percent Burned: ${percentBurned.toFixed(2)}%\n☯️ YANG to YIN ratio: ${currentPrice}`;

  const burnAnimationMessageOptions = {
    caption: burnMessage,
    parse_mode: "HTML",
  };
  
  sendAnimationMessage(YANG_BURN_ANIMATION, burnAnimationMessageOptions);
}

// Shared functions
function scheduleNextCall(callback, delay) {
  setTimeout(() => {
    callback().finally(() => {
      scheduleNextCall(callback, delay);
    });
  }, delay);
}

function saveProcessedTransactions() {
  try {
    const data = JSON.stringify(Array.from(processedVoidTransactions));
    fs.writeFileSync(processedTransactionsFilePath, data, "utf-8");
  } catch (error) {
    console.error("Error saving processed transactions to file:", error);
  }
}

async function fetchInitialUniswapTransactions() {
  const poolAddresses = Object.keys(POOL_MAPPING);

  for (const poolAddress of poolAddresses) {
    const apiUrl = `https://pro-api.coingecko.com/api/v3/onchain/networks/base/pools/${poolAddress}/trades`;
    const response = await axios.get(apiUrl, {
      headers: {
        "X-Cg-Pro-Api-Key": COINGECKO_API,
      }
    });

    if (response.status !== 200) {
      throw new Error("Failed to retrieve latest Uniswap transactions");
    }

    const transactions = response.data.data;
    for (const transaction of transactions) {
      processedUniswapTransactions.add(transaction.id);
    }
  }
}

function scheduleHourlyYangBurn() {
  const now = new Date();
  const delay = (60 * 60 * 1000) - (now.getMinutes() * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds()) + (10 * 1000);
  
  setTimeout(() => {
    doBurn().then(() => {
      console.log("Hourly YANG burn completed");
      scheduleHourlyYangBurn(); // Schedule next burn
    }).catch(error => {
      console.error("Error during hourly YANG burn:", error);
      scheduleHourlyYangBurn(); // Reschedule even if there was an error
    });
  }, delay);
}

// Initialize and start the combined script
async function initializeAndStart() {
  try {
    console.log("Initializing combined VOID and YANG bot...");

    // Load processed transactions
    if (fs.existsSync(processedTransactionsFilePath)) {
      const data = fs.readFileSync(processedTransactionsFilePath, "utf-8");
      if (data.trim()) {
        processedVoidTransactions = new Set(JSON.parse(data));
      }
    }

    // Initialize VOID-specific processes
    await updateVoidTotalBurnedAmount();
    scheduleNextCall(detectVoidBurnEvent, 20000);
    await fetchInitialUniswapTransactions();
    scheduleNextCall(detectUniswapLatestTransaction, 7500);
    claimLoop();

    // Initialize YANG-specific processes
    await updateYangTotalBurnedAmount();
    scheduleNextCall(checkYangTotalSupply, 15000);
    scheduleHourlyYangBurn();

    // Start updating VOID price
    setInterval(async () => {
      const priceInfo = await getVoidPrice();
      if (priceInfo !== null) {
        currentVoidUsdPrice = priceInfo.voidPrice;
        console.log(`Updated current VOID USD price to: ${currentVoidUsdPrice}`);
      }
    }, 45000);

    console.log("Combined VOID and YANG bot started successfully!");
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

// Start the combined bot
initializeAndStart();




