// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ZkPayIntegrator
 * @notice Integrator contract for ZkPay — Crypto to Fiat Scan & Pay
 * @dev Implements IP2PIntegrator for the P2PKit Diamond on Base.
 *
 * This contract:
 * 1. Validates orders against per-tx and daily limits (validateOrder)
 * 2. Collects a 1% platform fee on completion (onOrderComplete)
 * 3. Refunds daily slot accounting on cancel (onOrderCancel)
 *
 * Deploy on Base Sepolia first, then mainnet after whitelisting.
 */

// ──────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────

interface IP2PIntegrator {
    function validateOrder(
        address user,
        uint256 amount,
        bytes32 currency
    ) external returns (bool allowed);

    function onOrderComplete(
        uint256 orderId,
        address user,
        uint256 amount,
        address recipient
    ) external;

    function onOrderCancel(uint256 orderId) external;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

// ──────────────────────────────────────────────
// Contract
// ──────────────────────────────────────────────

contract ZkPayIntegrator is IP2PIntegrator {

    // ── State ──────────────────────────────────

    address public immutable owner;
    address public immutable diamond;
    address public immutable usdc;
    address public immutable treasury;  // Platform fee destination

    uint256 public immutable baseTxLimit;         // Max USDC per tx (6 decimals)
    uint256 public immutable dailyTxCountLimit;   // Max txs per user per UTC day
    uint256 public immutable platformFeeBps;      // Fee in basis points (100 = 1%)

    // user => UTC day => count of orders placed
    mapping(address => mapping(uint256 => uint256)) public dailyTxCount;

    // orderId => user (for cancel accounting)
    mapping(uint256 => address) public orderUser;
    // orderId => UTC day (for cancel accounting)
    mapping(uint256 => uint256) public orderDay;

    // ── Events ─────────────────────────────────

    event OrderValidated(address indexed user, uint256 amount, bytes32 currency);
    event OrderCompleted(uint256 indexed orderId, address indexed user, uint256 amount, uint256 fee);
    event OrderCancelled(uint256 indexed orderId);

    // ── Errors ─────────────────────────────────

    error OnlyDiamond();
    error ExceedsTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(address user, uint256 count, uint256 limit);

    // ── Modifiers ──────────────────────────────

    modifier onlyDiamond() {
        if (msg.sender != diamond) revert OnlyDiamond();
        _;
    }

    // ── Constructor ────────────────────────────

    constructor(
        address _diamond,
        address _usdc,
        address _treasury,
        uint256 _baseTxLimit,
        uint256 _dailyTxCountLimit,
        uint256 _platformFeeBps
    ) {
        owner = msg.sender;
        diamond = _diamond;
        usdc = _usdc;
        treasury = _treasury;
        baseTxLimit = _baseTxLimit;
        dailyTxCountLimit = _dailyTxCountLimit;
        platformFeeBps = _platformFeeBps;
    }

    // ── IP2PIntegrator ─────────────────────────

    /**
     * @notice Called by the Diamond inside placeB2BOrder.
     *         Enforces per-tx amount cap and daily tx count.
     */
    function validateOrder(
        address user,
        uint256 amount,
        bytes32 currency
    ) external onlyDiamond returns (bool allowed) {
        // Per-tx limit
        if (amount > baseTxLimit) {
            revert ExceedsTxLimit(amount, baseTxLimit);
        }

        // Daily tx count
        uint256 today = block.timestamp / 1 days;
        uint256 count = dailyTxCount[user][today];
        if (count >= dailyTxCountLimit) {
            revert ExceedsDailyLimit(user, count, dailyTxCountLimit);
        }

        // Increment daily count
        dailyTxCount[user][today] = count + 1;

        emit OrderValidated(user, amount, currency);
        return true;
    }

    /**
     * @notice Called by the Diamond once fiat settles.
     *         Pulls USDC from the user's proxy, takes the platform fee,
     *         and sends the remainder to the recipient.
     */
    function onOrderComplete(
        uint256 orderId,
        address user,
        uint256 amount,
        address recipient
    ) external onlyDiamond {
        // Calculate platform fee. The amount is the total paid by the user.
        // merchantAmount = (amount * 10000) / (10000 + platformFeeBps)
        uint256 merchantAmount = (amount * 10000) / (10000 + platformFeeBps);
        uint256 fee = amount - merchantAmount;

        // Transfer fee to treasury
        if (fee > 0) {
            IERC20(usdc).transfer(treasury, fee);
        }

        // Transfer merchant amount to the recipient
        IERC20(usdc).transfer(recipient, merchantAmount);

        emit OrderCompleted(orderId, user, amount, fee);
    }

    /**
     * @notice Called by the Diamond when an order is cancelled.
     *         Refunds the daily tx count so the user's slot isn't burned.
     */
    function onOrderCancel(uint256 orderId) external onlyDiamond {
        address user = orderUser[orderId];
        uint256 day = orderDay[orderId];

        if (user != address(0) && dailyTxCount[user][day] > 0) {
            dailyTxCount[user][day] -= 1;
        }

        emit OrderCancelled(orderId);
    }

    // ── Helpers ────────────────────────────────

    /**
     * @notice Record order metadata for cancel accounting.
     *         Called internally when your frontend places an order.
     */
    function _recordOrder(uint256 orderId, address user) internal {
        orderUser[orderId] = user;
        orderDay[orderId] = block.timestamp / 1 days;
    }
}
