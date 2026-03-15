# 🔮 ECHONAD — Radar-Style Micro Predictions on Monad

> **Monad Blitz Rio de Janeiro — March 2026**

ECHONAD is a gamified micro-prediction protocol where users bet on MON price direction using a sonar-style radar interface. Real-time MON/USD price from RedStone oracle drives a visual ping across directional sectors. Place your bet, watch the sweep — if the ping lands on your sector, you win the multiplier.

**Built exclusively for Monad.** Leverages `eth_sendRawTransactionSync` for instant tx confirmation and parallel execution for concurrent bets.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│              ECHONAD Frontend               │
│   (Next.js + React + Radar SVG Interface)   │
├──────────────┬──────────────────────────────┤
│  RedStone    │    Monad Testnet             │
│  MON/USD     │    EchoNad.sol               │
│  Price Feed  │    (bets + payouts)          │
│  (off-chain) │    eth_sendRawTransactionSync│
└──────────────┴──────────────────────────────┘
```

## 🚀 DEPLOY IN 15 MINUTES

### Step 1: Smart Contract (5 min)

```bash
# Install Monad Foundry
curl -L https://raw.githubusercontent.com/category-labs/foundry/monad/foundryup/install | bash
foundryup --network monad

# Clone and deploy
cd contracts
export PRIVATE_KEY=0xYOUR_KEY_HERE

# Get testnet MON: https://testnet.monad.xyz/faucet

# Deploy (sends 0.5 MON to fund the pool)
forge create src/EchoNad.sol:EchoNad \
    --rpc-url https://testnet-rpc.monad.xyz \
    --private-key $PRIVATE_KEY \
    --value 0.5ether

# Fund the house pool with more MON
cast send CONTRACT_ADDRESS "fundPool()" \
    --value 5ether \
    --rpc-url https://testnet-rpc.monad.xyz \
    --private-key $PRIVATE_KEY

# Save the contract address!
```

### Step 2: Frontend (5 min)

```bash
# Create Next.js app
npx create-next-app@latest echonad-app --typescript --tailwind --app
cd echonad-app

# Replace app/page.tsx with the content of frontend/app.jsx
# (wrap in default export, add "use client" at top)

# Set contract address
echo "NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_CONTRACT_ADDRESS" > .env.local

# Test locally
npm run dev
```

### Step 3: Deploy to Vercel (5 min)

```bash
# Push to GitHub (public repo required by hackathon rules)
git init && git add . && git commit -m "ECHONAD - Monad Blitz Rio"
gh repo create echonad --public --push

# Deploy to Vercel
npx vercel --prod

# Set env var on Vercel dashboard:
# NEXT_PUBLIC_CONTRACT_ADDRESS = your deployed address
```

## 📋 Contract ABI (for frontend integration)

```solidity
function placeBet(uint8 direction, uint256 multiplier, uint256 currentPrice) external payable returns (uint256)
function resolveBet(uint256 betId, uint256 resolvePrice) external
function getUserStats(address) external view returns (uint256 wins, uint256 losses, uint256 betCount)
// direction: 0 = BULLISH, 1 = BEARISH
// multiplier: 2, 5, 12, or 30
// currentPrice: MON/USD with 8 decimals
```

## 🎮 How It Works

1. **Connect wallet** (MetaMask → Monad Testnet auto-add)
2. **Choose bet size** (0.001 to 0.5 MON)
3. **Tap a radar sector** — top half = bullish, bottom = bearish, outer rings = higher multiplier
4. **Watch the sweep** — when it crosses your sector, if the gold ping is there = **WIN**
5. **Transaction confirms in <1 second** via Monad's parallel execution

## 🔗 Tech Stack

| Component | Technology |
|-----------|-----------|
| Chain | Monad Testnet (chainId: 10143) |
| Contract | Solidity 0.8.24 (Cancun) |
| Oracle | RedStone MON/USD (off-chain pull) |
| Frontend | Next.js 14 + React |
| Wallet | MetaMask (auto chain switch) |
| Deploy | Vercel |
| Tooling | Monad Foundry |

## 🏆 Why Monad?

- **400ms blocks + 800ms finality** → bets confirm before the sweep completes one rotation
- **`eth_sendRawTransactionSync`** → instant tx receipt, no loading spinners
- **Parallel execution** → hundreds of concurrent bets on isolated storage slots
- **Near-zero gas** → micro-bets of 0.001 MON are economically viable
- **Full EVM** → standard Solidity, standard tools, zero migration cost

## 📊 Hackathon Checklist

- [x] Working demo deployed to Vercel
- [x] Contract deployed to Monad Testnet
- [x] Live transaction during demo (<1s confirmation)
- [x] Public GitHub repository
- [x] RedStone oracle integration for real MON/USD price
- [x] Novel mechanic (radar/sonar prediction interface)

## 👤 Team

Built by **Isamar** at Monad Blitz Rio de Janeiro, March 2026.

---

*ECHONAD — Where your predictions echo across the Monad.*
