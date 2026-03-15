// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EchoNad
 * @notice Radar-style micro prediction bets on MON price direction
 * @dev Deployed on Monad Testnet. Uses native MON for bets.
 *      Oracle resolution via RedStone off-chain price verification.
 *      Designed for Monad Blitz Rio hackathon - March 2026
 */
contract EchoNad {

    enum Direction { BULLISH, BEARISH }
    enum BetStatus { PENDING, WON, LOST, CLAIMED }

    struct Bet {
        address bettor;
        Direction direction;
        uint256 amount;
        uint256 strikePrice;    // MON/USD price at bet time (8 decimals)
        uint256 resolvePrice;   // MON/USD price at resolution (8 decimals)
        uint256 multiplier;     // 2x, 5x, 12x, 30x (ring selection)
        uint256 timestamp;
        BetStatus status;
    }

    // State
    address public owner;
    uint256 public nextBetId;
    uint256 public totalBets;
    uint256 public totalVolume;
    uint256 public constant MIN_BET = 0.001 ether;   // 0.001 MON
    uint256 public constant MAX_BET = 1 ether;        // 1 MON
    uint256 public constant FEE_BPS = 200;             // 2%
    uint256[] public VALID_MULTIPLIERS = [2, 5, 12, 30];

    mapping(uint256 => Bet) public bets;
    mapping(address => uint256[]) public userBets;
    mapping(address => uint256) public userWins;
    mapping(address => uint256) public userLosses;

    // Events
    event BetPlaced(
        uint256 indexed betId,
        address indexed bettor,
        Direction direction,
        uint256 amount,
        uint256 multiplier,
        uint256 strikePrice
    );
    event BetResolved(
        uint256 indexed betId,
        address indexed bettor,
        bool won,
        uint256 payout,
        uint256 resolvePrice
    );
    event FundsDeposited(address indexed from, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() payable {
        owner = msg.sender;
    }

    /**
     * @notice Place a bet on MON price direction
     * @param direction 0=BULLISH (price goes up), 1=BEARISH (price goes down)
     * @param multiplier Must be 2, 5, 12, or 30 (corresponds to radar ring)
     * @param currentPrice Current MON/USD price from RedStone (8 decimals)
     */
    function placeBet(
        Direction direction,
        uint256 multiplier,
        uint256 currentPrice
    ) external payable returns (uint256) {
        require(msg.value >= MIN_BET, "Below min bet");
        require(msg.value <= MAX_BET, "Above max bet");
        require(currentPrice > 0, "Invalid price");
        require(_isValidMultiplier(multiplier), "Invalid multiplier");

        uint256 betId = nextBetId++;
        bets[betId] = Bet({
            bettor: msg.sender,
            direction: direction,
            amount: msg.value,
            strikePrice: currentPrice,
            resolvePrice: 0,
            multiplier: multiplier,
            timestamp: block.timestamp,
            status: BetStatus.PENDING
        });

        userBets[msg.sender].push(betId);
        totalBets++;
        totalVolume += msg.value;

        emit BetPlaced(betId, msg.sender, direction, msg.value, multiplier, currentPrice);
        return betId;
    }

    /**
     * @notice Resolve a bet with the current price from RedStone oracle
     * @dev In production, this would verify RedStone signed data on-chain.
     *      For hackathon MVP, the resolver passes the verified price.
     *      Anyone can resolve (keeper pattern).
     */
    function resolveBet(uint256 betId, uint256 resolvePrice) external {
        Bet storage bet = bets[betId];
        require(bet.status == BetStatus.PENDING, "Not pending");
        require(resolvePrice > 0, "Invalid price");
        // Minimum 10 seconds between bet and resolution
        require(block.timestamp >= bet.timestamp + 10, "Too early");

        bet.resolvePrice = resolvePrice;

        bool won;
        if (bet.direction == Direction.BULLISH) {
            won = resolvePrice > bet.strikePrice;
        } else {
            won = resolvePrice < bet.strikePrice;
        }

        if (won) {
            bet.status = BetStatus.WON;
            uint256 grossPayout = bet.amount * bet.multiplier;
            uint256 fee = (grossPayout * FEE_BPS) / 10000;
            uint256 netPayout = grossPayout - fee;

            // Cap payout to contract balance
            if (netPayout > address(this).balance) {
                netPayout = address(this).balance;
            }

            userWins[bet.bettor]++;
            (bool sent, ) = bet.bettor.call{value: netPayout}("");
            require(sent, "Payout failed");

            emit BetResolved(betId, bet.bettor, true, netPayout, resolvePrice);
        } else {
            bet.status = BetStatus.LOST;
            userLosses[bet.bettor]++;
            emit BetResolved(betId, bet.bettor, false, 0, resolvePrice);
        }
    }

    /**
     * @notice Batch resolve multiple bets (gas efficient on Monad parallel exec)
     */
    function resolveBets(uint256[] calldata betIds, uint256 resolvePrice) external {
        for (uint256 i = 0; i < betIds.length; i++) {
            if (bets[betIds[i]].status == BetStatus.PENDING &&
                block.timestamp >= bets[betIds[i]].timestamp + 10) {
                this.resolveBet(betIds[i], resolvePrice);
            }
        }
    }

    // View functions
    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }

    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    function getUserStats(address user) external view returns (
        uint256 wins, uint256 losses, uint256 betCount
    ) {
        return (userWins[user], userLosses[user], userBets[user].length);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Internal
    function _isValidMultiplier(uint256 m) internal pure returns (bool) {
        return m == 2 || m == 5 || m == 12 || m == 30;
    }

    // Fund the house pool
    function fundPool() external payable {
        require(msg.value > 0, "Send MON");
        emit FundsDeposited(msg.sender, msg.value);
    }

    // Owner withdraw (for hackathon)
    function withdraw(uint256 amount) external onlyOwner {
        (bool sent, ) = owner.call{value: amount}("");
        require(sent, "Withdraw failed");
    }

    receive() external payable {
        emit FundsDeposited(msg.sender, msg.value);
    }
}
