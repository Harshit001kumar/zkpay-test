// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IP2PIntegrator } from "../../interfaces/IP2PIntegrator.sol";
import { IB2BGateway } from "../../interfaces/IB2BGateway.sol";
import { UserProxy } from "../../base/UserProxy.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";

contract ZkPayIntegrator is IP2PIntegrator {
    using SafeERC20 for IERC20;

    error OnlyDiamond();
    error InvalidAddress();
    error ExceedsTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(address user, uint256 count, uint256 limit);

    event OrderPlaced(uint256 indexed orderId, address indexed user, uint256 amount);
    event OrderCompleted(uint256 indexed orderId, address indexed user, uint256 amount, uint256 fee);
    event OrderCancelled(uint256 indexed orderId);
    event UserProxyDeployed(address indexed user, address proxy);

    address public immutable diamond;
    IERC20 public immutable usdc;
    address public immutable owner;
    address public immutable proxyImpl;
    address public immutable treasury;

    uint256 public immutable baseTxLimit;
    uint256 public immutable dailyTxCountLimit;
    uint256 public immutable platformFeeBps;

    mapping(address => mapping(uint256 => uint256)) public dailyTxCount;
    mapping(uint256 => address) public orderUser;
    mapping(uint256 => uint256) public orderDay;

    constructor(
        address _diamond,
        address _usdc,
        address _treasury,
        uint256 _baseTxLimit,
        uint256 _dailyTxCountLimit,
        uint256 _platformFeeBps
    ) {
        if (_diamond == address(0) || _usdc == address(0)) revert InvalidAddress();
        diamond = _diamond;
        usdc = IERC20(_usdc);
        treasury = _treasury;
        baseTxLimit = _baseTxLimit;
        dailyTxCountLimit = _dailyTxCountLimit;
        platformFeeBps = _platformFeeBps;
        owner = msg.sender;
        
        proxyImpl = address(new UserProxy());
    }

    // ─── IP2PIntegrator ───────────────────────────────────────────────

    function validateOrder(
        address user,
        uint256 amount,
        bytes32 /*currency*/
    ) external returns (bool allowed) {
        if (msg.sender != diamond) revert OnlyDiamond();
        
        if (amount > baseTxLimit) revert ExceedsTxLimit(amount, baseTxLimit);

        uint256 today = block.timestamp / 1 days;
        uint256 count = dailyTxCount[user][today];
        if (count >= dailyTxCountLimit) revert ExceedsDailyLimit(user, count, dailyTxCountLimit);

        dailyTxCount[user][today] = count + 1;
        return true;
    }

    function onOrderComplete(
        uint256 orderId,
        address user,
        uint256 amount,
        address recipientAddr
    ) external {
        if (msg.sender != diamond) revert OnlyDiamond();

        address proxy = proxyAddress(user);
        UserProxy(payable(proxy)).transferERC20ToIntegrator(address(usdc), amount);

        uint256 merchantAmount = (amount * 10000) / (10000 + platformFeeBps);
        uint256 fee = amount - merchantAmount;

        if (fee > 0) {
            usdc.safeTransfer(treasury, fee);
        }
        usdc.safeTransfer(recipientAddr, merchantAmount);

        emit OrderCompleted(orderId, user, amount, fee);
    }

    function onOrderCancel(uint256 orderId) external {
        if (msg.sender != diamond) revert OnlyDiamond();
        
        address user = orderUser[orderId];
        uint256 day = orderDay[orderId];

        if (user != address(0) && dailyTxCount[user][day] > 0) {
            dailyTxCount[user][day] -= 1;
        }

        emit OrderCancelled(orderId);
    }

    // ─── Order entry point ────────────

    function userPlaceOrder(
        uint256 amount,
        bytes32 currency,
        uint256 circleId,
        string calldata pubKey,
        address merchantClient
    ) external returns (uint256 orderId) {
        
        // Front-run validation checks for better UX
        if (amount > baseTxLimit) revert ExceedsTxLimit(amount, baseTxLimit);
        
        uint256 today = block.timestamp / 1 days;
        if (dailyTxCount[msg.sender][today] >= dailyTxCountLimit) {
            revert ExceedsDailyLimit(msg.sender, dailyTxCount[msg.sender][today], dailyTxCountLimit);
        }

        address proxy = _ensureProxy(msg.sender);

        bytes memory placeData = abi.encodeCall(
            IB2BGateway.placeB2BOrder,
            (msg.sender, amount, currency, merchantClient, pubKey, circleId, 0, 0)
        );
        
        // The Diamond will assign orderId. We return 0 here since returning
        // exact orderId from external call routing is complex, but P2PKit
        // off-chain indexing picks it up from events anyway.
        UserProxy(payable(proxy)).execute(diamond, placeData, address(usdc), 0);
        
        emit OrderPlaced(0, msg.sender, amount); // Emitting 0 as orderId placeholder for front-end
        return 0;
    }

    // ─── Proxy helpers ─────────────

    function proxyAddress(address user) public view returns (address) {
        return Clones.predictDeterministicAddressWithImmutableArgs(
            proxyImpl,
            _proxyArgs(user),
            _salt(user),
            address(this)
        );
    }

    function _salt(address user) internal pure returns (bytes32) {
        return bytes32(uint256(uint160(user)));
    }

    function _proxyArgs(address user) internal view returns (bytes memory) {
        return abi.encodePacked(user, address(this));
    }

    function _ensureProxy(address user) internal returns (address proxy) {
        proxy = proxyAddress(user);
        if (proxy.code.length == 0) {
            address deployed = Clones.cloneDeterministicWithImmutableArgs(
                proxyImpl,
                _proxyArgs(user),
                _salt(user)
            );
            assert(deployed == proxy);
            emit UserProxyDeployed(user, proxy);
        }
    }
}
