const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const Web3 = require('web3');
const { ethers } = require('ethers');
require("dotenv").config();
const { BigNumber } = require('ethers');
const fs = require("fs");

// Environment variables
const VOID_TELEGRAM_CHAT_ID = process.env.VOID_TELEGRAM_CHAT_ID;
const VOID_TELEGRAM_BOT_TOKEN = process.env.VOID_TELEGRAM_BOT_TOKEN;
const YANG_TELEGRAM_CHAT_ID = process.env.YANG_TELEGRAM_CHAT_ID;
const YANG_TELEGRAM_BOT_TOKEN = process.env.YANG_TELEGRAM_BOT_TOKEN;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const COINGECKO_API = process.env.COINGECKO_API;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = 'https://mainnet.base.org';
const VOID_CONTRACT_ADDRESS = process.env.VOID_CONTRACT_ADDRESS;
const YANG_CONTRACT_ADDRESS = process.env.YANG_CONTRACT_ADDRESS;
const ENTROPY_ADDRESS = process.env.ENTROPY_ADDRESS;

// Constants
const VOID_TOKEN_DECIMALS = 18;
const YANG_TOKEN_DECIMALS = 8;
const VOID_INITIAL_SUPPLY = 100000000;
const YANG_INITIAL_SUPPLY = 2500000;
const VOID_BURN_ANIMATION = "https://voidonbase.com/burn.jpg";
const YANG_BURN_ANIMATION = "https://fluxonbase.com/burn.jpg";

// Initialize separate Telegram bots
const voidBot = new TelegramBot(VOID_TELEGRAM_BOT_TOKEN, { polling: true });
const yangBot = new TelegramBot(YANG_TELEGRAM_BOT_TOKEN, { polling: true });

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
const voidMessageQueue = [];
const yangMessageQueue = [];
let isVoidSendingMessage = false;
let isYangSendingMessage = false;
let processedVoidTransactions = new Set();
let processedUniswapTransactions = new Set();

const processedTransactionsFilePath = "processed_transactions.json";

const POOL_MAPPING = {
  "0xb14e941d34d61ae251ccc08ac15b8455ae9f60a5": "VOID/ETH",
  "0x53a1d9ad828d2ac5f67007738cc5688a753241ba": "VOID/YIN"
};

const REVERSED_POOLS = [];

// Gas Price Optimizer Function
async function getOptimizedGasPrice() {
  try {
    const gasPrice = await provider.getGasPrice();
    const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
    console.log(`Current network gas price: ${gasPriceGwei} Gwei`);
    
    const optimizedGasPrice = gasPrice.mul(110).div(100); // 110% of current gas price
    console.log(`Optimized gas price: ${ethers.utils.formatUnits(optimizedGasPrice, 'gwei')} Gwei`);
    
    return optimizedGasPrice;
  } catch (error) {
    console.error('Error fetching gas price:', error);
    return ethers.utils.parseUnits('0.1', 'gwei');
  }
}
function getVoidRank(voidBalance) {
  const VOID_RANKS = {
    "VOID Ultimate": 2000000,
    "VOID Omega": 1500000,
    "VOID Absolute": 1000000,
    "VOID Singularity": 900000,
    "VOID Omnipotence": 850000,
    "VOID Eternity": 800000,
    "VOID Apotheosis": 750000,
    "VOID Cosmic Blazer": 696969,
    "VOID Divine": 650000,
    "VOID Celestial": 600000,
    "VOID Exalted": 550000,
    "VOID Transcendent": 500000,
    "VOID Majesty": 450000,
    "VOID Sovereign": 400000,
    "VOID Monarch": 350000,
    "VOID Admiral": 275000,
    "VOID Warden": 250000,
    "VOID Harbinger": 225000,
    "VOID Evoker": 200000,
    "VOID Emperor": 175000,
    "VOID Assassin": 162500,
    "VOID Overlord": 150000,
    "VOID Creature": 140000,
    "VOID Hierophant": 130000,
    "VOID Juggernaut": 120000,
    "VOID Grandmaster": 110000,
    "VOID Lord": 100000,
    "VOID Alchemist": 92500,
    "VOID Clairvoyant": 85000,
    "VOID Conjurer": 80000,
    "VOID Archdruid": 75000,
    "VOID Dank Mystic": 69420,
    "VOID Archmage": 65000,
    "VOID Warlock": 60000,
    "VOID Sorcerer": 55000,
    "VOID Knight": 50000,
    "VOID Shaman": 45000,
    "VOID Sage": 40000,
    "VOID Warrior": 35000,
    "VOID Enchanter": 30000,
    "VOID Seer": 27500,
    "VOID Necromancer": 25000,
    "VOID Summoner": 22500,
    "VOID Master": 20000,
    "VOID Disciple": 15000,
    "VOID Acolyte": 12500,
    "VOID Expert": 10000,
    "VOID Apprentice": 7500,
    "VOID Rookie": 5000,
    "VOID Learner": 2500,
    "VOID Initiate": 1000,
    "VOID Peasant": 1
  };

  let voidRank = "Void Peasant";
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
    "VOID Learner": "https://voidonbase.com/rank3.png",
    "VOID Rookie": "https://voidonbase.com/rank4.png",
    "VOID Apprentice": "https://voidonbase.com/rank5.png",
    "VOID Expert": "https://voidonbase.com/rank6.png",
    "VOID Acolyte": "https://voidonbase.com/rank10.png",
    "VOID Disciple": "https://voidonbase.com/rank11.png",
    "VOID Master": "https://voidonbase.com/rank12.png",
    "VOID Summoner": "https://voidonbase.com/rank14.png",
    "VOID Necromancer": "https://voidonbase.com/rank15.png",
    "VOID Seer": "https://voidonbase.com/rank16.png",
    "VOID Enchanter": "https://voidonbase.com/rank17.png",
    "VOID Warrior": "https://voidonbase.com/rankwar.png",
    "VOID Sage": "https://voidonbase.com/rank18.png",
    "VOID Shaman": "https://voidonbase.com/rank19.png",
    "VOID Knight": "https://voidonbase.com/rank20.png",
    "VOID Sorcerer": "https://voidonbase.com/rank21.png",
    "VOID Warlock": "https://voidonbase.com/rank22.png",
    "VOID Archmage": "https://voidonbase.com/rank24.png",
    "VOID Dank Mystic": "https://voidonbase.com/420.png",
    "VOID Archdruid": "https://voidonbase.com/rank25.png",
    "VOID Conjurer": "https://voidonbase.com/rank26.png",
    "VOID Clairvoyant": "https://voidonbase.com/rank27.png",
    "VOID Alchemist": "https://voidonbase.com/rank28.png",
    "VOID Lord": "https://voidonbase.com/rank29.png",
    "VOID Grandmaster": "https://voidonbase.com/rankgm.png",
    "VOID Juggernaut": "https://voidonbase.com/rankjug.png",
    "VOID Hierophant": "https://voidonbase.com/rank30.png",
    "VOID Creature": "https://voidonbase.com/rank32.png",
    "VOID Overlord": "https://voidonbase.com/rank33.png",
    "VOID Assassin": "https://voidonbase.com/assassin.png",
    "VOID Emperor": "https://voidonbase.com/rank34.png",
    "VOID Evoker": "https://voidonbase.com/rank35.png",
    "VOID Harbinger": "https://voidonbase.com/rank36.png",
    "VOID Warden": "https://voidonbase.com/rank39.png",
    "VOID Admiral": "https://voidonbase.com/rank40.png",
    "VOID Monarch": "https://voidonbase.com/rank41.png",
    "VOID Sovereign": "https://voidonbase.com/rank42.png",
    "VOID Majesty": "https://voidonbase.com/rank43.png",
    "VOID Transcendent": "https://voidonbase.com/rank44.png",
    "VOID Exalted": "https://voidonbase.com/rank45.png",
    "VOID Celestial": "https://voidonbase.com/rank46.png",
    "VOID Divine": "https://voidonbase.com/rank47.png",
    "VOID Cosmic Blazer": "https://voidonbase.com/696969.png",
    "VOID Apotheosis": "https://voidonbase.com/rank48.png",
    "VOID Eternity": "https://voidonbase.com/rank49.png",
    "VOID Omnipotence": "https://voidonbase.com/rank50.png",
    "VOID Singularity": "https://voidonbase.com/rank51.png",
    "VOID Absolute": "https://voidonbase.com/rank52.png",
    "VOID Omega": "https://voidonbase.com/rank53.png",
    "VOID Ultimate": "https://voidonbase.com/rank54.png"
  };

  return rankToImageUrlMap[voidRank] || "https://voidonbase.com/rank1.png";
}

// Message queue functions
function addToVoidMessageQueue(message) {
  voidMessageQueue.push(message);
}

function addToVoidBurnQueue(photo, options) {
  voidMessageQueue.push({ photo, options });
  sendVoidBurnFromQueue();
}

function addToYangBurnQueue(photo, options) {
  yangMessageQueue.push({ photo, options });
  sendYangBurnFromQueue();
}

async function sendVoidBurnFromQueue() {
  if (voidMessageQueue.length > 0 && !isVoidSendingMessage) {
    isVoidSendingMessage = true;
    const message = voidMessageQueue.shift();
    try {
      message.options.disable_notification = true;

      const sentMessage = await voidBot.sendPhoto(
        VOID_TELEGRAM_CHAT_ID,
        message.photo,
        message.options
      );
      
      await voidBot.pinChatMessage(VOID_TELEGRAM_CHAT_ID, sentMessage.message_id, {
        disable_notification: true
      });

      console.log(`[${new Date().toISOString()}] VOID burn message sent and pinned successfully.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error sending or pinning VOID message:`, error);
    }
    setTimeout(() => {
      isVoidSendingMessage = false;
      sendVoidBurnFromQueue();
    }, 500);
  }
}

async function sendYangBurnFromQueue() {
  if (yangMessageQueue.length > 0 && !isYangSendingMessage) {
    isYangSendingMessage = true;
    const message = yangMessageQueue.shift();
    try {
      message.options.disable_notification = true;

      const sentMessage = await yangBot.sendPhoto(
        YANG_TELEGRAM_CHAT_ID,
        message.photo,
        message.options
      );
      
      await yangBot.pinChatMessage(YANG_TELEGRAM_CHAT_ID, sentMessage.message_id, {
        disable_notification: true
      });

      console.log(`[${new Date().toISOString()}] YANG burn message sent and pinned successfully.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error sending or pinning YANG message:`, error);
    }
    setTimeout(() => {
      isYangSendingMessage = false;
      sendYangBurnFromQueue();
    }, 500);
  }
}

async function sendVoidPhotoMessage(photo, options) {
  addToVoidMessageQueue({ photo, options });
  sendVoidMessageFromQueue();
}


async function sendVoidMessageFromQueue() {
  if (voidMessageQueue.length > 0 && !isVoidSendingMessage) {
    isVoidSendingMessage = true;
    const message = voidMessageQueue.shift();
    try {
      await voidBot.sendPhoto(
        VOID_TELEGRAM_CHAT_ID,
        message.photo,
        message.options
      );
    } catch (error) {
      console.error("Error sending VOID message:", error);
    }
    setTimeout(() => {
      isVoidSendingMessage = false;
      sendVoidMessageFromQueue();
    }, 500);
  }
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
      const percentBurned = (voidTotalBurnedAmount / VOID_INITIAL_SUPPLY) * 100;
      const burnMessage = `VOID Burned!\n\n💀💀💀💀💀\n🔥 Burned: ${amountBurned.toFixed(3)} VOID\nPercent Burned: ${percentBurned.toFixed(2)}%\n🔎 <a href="${chartLink}">Chart</a> | <a href="${txHashLink}">TX Hash</a>`;

      const burnMessageOptions = {
        caption: burnMessage,
        parse_mode: "HTML"
      };

      addToVoidBurnQueue(VOID_BURN_ANIMATION, burnMessageOptions);
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

            sendVoidPhotoMessage(imageUrl, voidMessageOptions);
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

            sendVoidPhotoMessage(imageUrl, voidMessageOptions);
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

async function claimVoidWithRetry(maxRetries = 5, initialDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log(`[${new Date().toISOString()}] Attempting to claim VOID (attempt ${retries + 1})...`);
      
      const optimizedGasPrice = await getOptimizedGasPrice();
      
      const claimTx = await voidContract.claimVoid({ gasPrice: optimizedGasPrice });
      console.log(`[${new Date().toISOString()}] Claim transaction sent: ${claimTx.hash}`);
      const claimReceipt = await claimTx.wait();
      console.log(`[${new Date().toISOString()}] Claim transaction confirmed. Gas used: ${claimReceipt.gasUsed.toString()}`);
      return claimReceipt;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error claiming VOID (attempt ${retries + 1}):`, error.message);
      if (error.message.includes('network block skew detected') || error.message.includes('transaction failed')) {
        const delay = initialDelay * Math.pow(2, retries);
        console.log(`[${new Date().toISOString()}] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached for VOID claim');
}

async function claimLoop() {
  try {
    console.log(`[${new Date().toISOString()}] Checking if it's time to claim VOID...`);

    let canClaim = false;
    let timeLeft;

    try {
      console.log(`[${new Date().toISOString()}] Attempting to call timeLeftCheck...`);
      const optimizedGasPrice = await getOptimizedGasPrice();
      const tx = await voidContract.timeLeftCheck({ gasPrice: optimizedGasPrice });
      console.log(`[${new Date().toISOString()}] timeLeftCheck transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[${new Date().toISOString()}] timeLeftCheck transaction confirmed. Gas used: ${receipt.gasUsed.toString()}`);
      
      timeLeft = await voidContract.timeLeft();
      console.log(`[${new Date().toISOString()}] Raw time left until next claim: ${timeLeft.toString()} seconds`);
      
      const buffer = BigNumber.from(40);
      timeLeft = timeLeft.add(buffer);
      console.log(`[${new Date().toISOString()}] Time left with buffer: ${timeLeft.toString()} seconds (including ${buffer.toString()} seconds buffer)`);
    } catch (error) {
      console.log(`[${new Date().toISOString()}] timeLeftCheck reverted. This likely means it's time to claim.`);
      console.log(`[${new Date().toISOString()}] Error details:`, error.message);
      canClaim = true;
    }

    if (canClaim) {
      try {
        await claimVoidWithRetry();
        timeLeft = await voidContract.timeLeft();
        console.log(`[${new Date().toISOString()}] Raw new time left until next claim: ${timeLeft.toString()} seconds`);
        
        const buffer = BigNumber.from(40);
        timeLeft = timeLeft.add(buffer);
        console.log(`[${new Date().toISOString()}] New time left with buffer: ${timeLeft.toString()} seconds (including ${buffer.toString()} seconds buffer)`);
      } catch (claimError) {
        console.error(`[${new Date().toISOString()}] Error claiming VOID after retries:`, claimError.message);
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
async function doBurnWithRetry(maxRetries = 5, initialDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      console.log('Calling YANG doBurn function...');
      
      const optimizedGasPrice = await getOptimizedGasPrice();
      
      const tx = await yangContract.doBurn({ gasPrice: optimizedGasPrice });
      await tx.wait();
      console.log('YANG burn transaction successful:', tx.hash);
      return;
    } catch (error) {
      console.error(`Error calling YANG doBurn (attempt ${retries + 1}):`, error.message);
      if (error.message.includes('network block skew detected')) {
        const delay = initialDelay * Math.pow(2, retries);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached for YANG doBurn');
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
  
  addToYangBurnQueue(YANG_BURN_ANIMATION, burnAnimationMessageOptions);
}

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
  const buffer = 40000; // 40 seconds buffer
  const delay = (60 * 60 * 1000) - (now.getMinutes() * 60 * 1000 + now.getSeconds() * 1000 + now.getMilliseconds()) + buffer;
  
  setTimeout(() => {
    doBurnWithRetry().then(() => {
      console.log(`[${new Date().toISOString()}] Hourly YANG burn completed`);
      scheduleHourlyYangBurn(); // Schedule next burn
    }).catch(error => {
      console.error(`[${new Date().toISOString()}] Error during hourly YANG burn:`, error);
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


