#!/bin/bash
# ============================================
# ECHONAD - Deploy to Monad Testnet
# ============================================
# Prerequisites:
#   1. Install Monad Foundry:
#      curl -L https://raw.githubusercontent.com/category-labs/foundry/monad/foundryup/install | bash
#      foundryup --network monad
#
#   2. Get testnet MON from faucet:
#      https://testnet.monad.xyz/faucet
#
#   3. Export your private key:
#      export PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

set -e

echo "🔮 ECHONAD - Deploying to Monad Testnet..."

# Check private key
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Set PRIVATE_KEY first: export PRIVATE_KEY=0x..."
    exit 1
fi

MONAD_TESTNET_RPC="https://testnet-rpc.monad.xyz"

# Deploy
echo "📡 Deploying EchoNad contract..."
forge create src/EchoNad.sol:EchoNad \
    --rpc-url $MONAD_TESTNET_RPC \
    --private-key $PRIVATE_KEY \
    --value 0.5ether \
    --broadcast

echo ""
echo "✅ Contract deployed! Copy the address above."
echo ""
echo "📋 Next steps:"
echo "   1. Copy the contract address"
echo "   2. Paste it in frontend/.env.local as NEXT_PUBLIC_CONTRACT_ADDRESS"
echo "   3. Fund the pool: cast send <CONTRACT> 'fundPool()' --value 5ether --rpc-url $MONAD_TESTNET_RPC --private-key $PRIVATE_KEY"
echo "   4. Deploy frontend to Vercel"
echo ""
echo "🔗 Verify on explorer:"
echo "   https://testnet.monadexplorer.com/address/<CONTRACT>"
