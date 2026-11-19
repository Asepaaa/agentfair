// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal view interface of the SPACE ID Agent ID registry
///         (BNB Chain mainnet: 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F).
///         Verified on-chain 2026-11-19: balanceOf and handleOf exist;
///         there is no address -> tokenId resolver; transfers revert "Soulbound".
interface IAgentIDRegistry {
    function balanceOf(address owner) external view returns (uint256);
    function handleOf(address owner) external view returns (string memory);
}

/// @notice Minimal ERC-20 interface (only what AgentFair uses).
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title AgentFair
/// @notice Fair drops and daily check-ins gated by Agent ID.
///
///         Anyone can create a drop by depositing ERC-20 tokens. Every
///         Agent ID holder can claim exactly one share per drop, keyed by
///         their Agent ID identity (the keccak256 of their handle), never
///         by raw wallet alone. After the deadline, the drop's creator —
///         and only the creator — withdraws the unclaimed remainder.
///
///         Agent ID holders can also check in once per UTC day to build a
///         streak. Check-ins move no assets.
///
///         Permissions, in full: this contract has no owner, no admin, no
///         pause and no upgrade path. The deployer retains no powers. The
///         only privileged actor is a drop's own creator, and only over
///         their own drop: they set its terms at creation and may reclaim
///         their own unclaimed remainder after the deadline. Claimers are
///         never asked for any approval; tokens only ever flow out to them.
contract AgentFair {
    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------
    error NotAnAgentIDHolder();
    error MissingHandle();
    error ZeroAddress();
    error ZeroAmountPerClaim();
    error ZeroMaxClaims();
    error ZeroDuration();
    error DropNotFound();
    error DropExpired();
    error DropExhausted();
    error AlreadyClaimed();
    error NotDropCreator();
    error DropStillActive();
    error AlreadyWithdrawn();
    error AlreadyCheckedInToday();
    error DepositShortfall();
    error TransferFailed();
    error ReentrantCall();

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------
    event DropCreated(
        uint256 indexed dropId,
        address indexed creator,
        address indexed token,
        uint256 amountPerClaim,
        uint256 maxClaims,
        uint256 deadline
    );
    event Claimed(uint256 indexed dropId, address indexed claimer, bytes32 indexed identityKey, uint256 amount);
    event Withdrawn(uint256 indexed dropId, address indexed creator, uint256 amount);
    event CheckedIn(address indexed user, bytes32 indexed identityKey, uint256 streak, uint256 day);

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------
    struct Drop {
        address creator;
        address token;
        uint256 amountPerClaim;
        uint256 maxClaims;
        uint256 claimed;
        uint256 deadline;
        bool withdrawn;
    }

    /// @notice The Agent ID registry used for eligibility and identity.
    IAgentIDRegistry public immutable registry;

    Drop[] public drops;

    /// @notice dropId => identityKey => has claimed.
    mapping(uint256 => mapping(bytes32 => bool)) public hasClaimed;

    /// @notice identityKey => last check-in day (block.timestamp / 1 days).
    mapping(bytes32 => uint256) public lastCheckInDay;

    /// @notice identityKey => current consecutive-day streak.
    mapping(bytes32 => uint256) public streakOf;

    bool private _locked;

    modifier nonReentrant() {
        if (_locked) revert ReentrantCall();
        _locked = true;
        _;
        _locked = false;
    }

    /// @param registry_ The Agent ID registry. On BNB Chain mainnet:
    ///        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IAgentIDRegistry(registry_);
    }

    // ------------------------------------------------------------------
    // Identity
    // ------------------------------------------------------------------

    /// @notice The identity key of an Agent ID holder: keccak256 of their
    ///         handle (e.g. "asepaa"). Reverts for non-holders.
    /// @dev The registry has no address -> tokenId resolver, and the token
    ///      is soulbound with one handle enforced per address, so the
    ///      handle is the stable, unique Agent ID identity.
    function identityKeyOf(address user) public view returns (bytes32) {
        if (registry.balanceOf(user) == 0) revert NotAnAgentIDHolder();
        string memory handle = registry.handleOf(user);
        if (bytes(handle).length == 0) revert MissingHandle();
        return keccak256(bytes(handle));
    }

    // ------------------------------------------------------------------
    // Drops
    // ------------------------------------------------------------------

    function dropCount() external view returns (uint256) {
        return drops.length;
    }

    /// @notice Create a drop by depositing amountPerClaim * maxClaims of
    ///         `token`. The caller must have approved this contract for at
    ///         least that total in their own wallet first.
    function createDrop(address token, uint256 amountPerClaim, uint256 maxClaims, uint256 durationSeconds)
        external
        nonReentrant
        returns (uint256 dropId)
    {
        if (token == address(0)) revert ZeroAddress();
        if (amountPerClaim == 0) revert ZeroAmountPerClaim();
        if (maxClaims == 0) revert ZeroMaxClaims();
        if (durationSeconds == 0) revert ZeroDuration();

        uint256 total = amountPerClaim * maxClaims;
        uint256 deadline = block.timestamp + durationSeconds;

        dropId = drops.length;
        drops.push(
            Drop({
                creator: msg.sender,
                token: token,
                amountPerClaim: amountPerClaim,
                maxClaims: maxClaims,
                claimed: 0,
                deadline: deadline,
                withdrawn: false
            })
        );

        emit DropCreated(dropId, msg.sender, token, amountPerClaim, maxClaims, deadline);

        // Pull the deposit and verify what actually arrived, so a
        // fee-on-transfer token reverts instead of underfunding the drop.
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), total);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        if (received != total) revert DepositShortfall();
    }

    /// @notice Claim this caller's one share of a drop. Caller must hold
    ///         an Agent ID; each Agent ID identity may claim once per drop.
    function claim(uint256 dropId) external nonReentrant {
        if (dropId >= drops.length) revert DropNotFound();
        Drop storage drop = drops[dropId];
        if (block.timestamp >= drop.deadline) revert DropExpired();
        if (drop.claimed >= drop.maxClaims) revert DropExhausted();

        bytes32 identityKey = identityKeyOf(msg.sender);
        if (hasClaimed[dropId][identityKey]) revert AlreadyClaimed();

        // Effects before interaction.
        hasClaimed[dropId][identityKey] = true;
        drop.claimed += 1;

        emit Claimed(dropId, msg.sender, identityKey, drop.amountPerClaim);

        _safeTransfer(drop.token, msg.sender, drop.amountPerClaim);
    }

    /// @notice Withdraw a drop's unclaimed remainder. Only the drop's
    ///         creator, only after the deadline, only once.
    function withdrawUnclaimed(uint256 dropId) external nonReentrant {
        if (dropId >= drops.length) revert DropNotFound();
        Drop storage drop = drops[dropId];
        if (msg.sender != drop.creator) revert NotDropCreator();
        if (block.timestamp < drop.deadline) revert DropStillActive();
        if (drop.withdrawn) revert AlreadyWithdrawn();

        drop.withdrawn = true;
        uint256 remaining = (drop.maxClaims - drop.claimed) * drop.amountPerClaim;

        emit Withdrawn(dropId, msg.sender, remaining);

        if (remaining > 0) {
            _safeTransfer(drop.token, msg.sender, remaining);
        }
    }

    // ------------------------------------------------------------------
    // Daily check-in
    // ------------------------------------------------------------------

    /// @notice Check in for today (UTC). One check-in per Agent ID
    ///         identity per day; the streak grows on consecutive days and
    ///         resets to 1 after a missed day. Moves no assets.
    function checkIn() external {
        bytes32 identityKey = identityKeyOf(msg.sender);
        uint256 today = block.timestamp / 1 days;
        uint256 streak = streakOf[identityKey];

        if (streak > 0 && lastCheckInDay[identityKey] == today) {
            revert AlreadyCheckedInToday();
        }

        uint256 newStreak = 1;
        if (streak > 0 && today > 0 && lastCheckInDay[identityKey] == today - 1) {
            newStreak = streak + 1;
        }

        lastCheckInDay[identityKey] = today;
        streakOf[identityKey] = newStreak;

        emit CheckedIn(msg.sender, identityKey, newStreak, today);
    }

    // ------------------------------------------------------------------
    // Safe ERC-20 helpers (OpenZeppelin-style, hand-written)
    // ------------------------------------------------------------------

    function _safeTransfer(address token, address to, uint256 amount) internal {
        _callERC20(token, abi.encodeCall(IERC20.transfer, (to, amount)));
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        _callERC20(token, abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
    }

    /// @dev Requires the call to succeed and to return either nothing
    ///      (non-standard tokens) or boolean true.
    function _callERC20(address token, bytes memory data) internal {
        (bool success, bytes memory returnData) = token.call(data);
        if (!success) revert TransferFailed();
        if (returnData.length > 0 && !abi.decode(returnData, (bool))) {
            revert TransferFailed();
        }
    }
}
