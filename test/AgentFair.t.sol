// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentFair} from "../src/AgentFair.sol";
import {MockAgentIDRegistry, MockERC20} from "./mocks/Mocks.sol";

contract AgentFairTest is Test {
    uint256 internal constant START_TIME = 1_700_000_000; // realistic timestamp
    uint256 internal constant AMOUNT = 100;
    uint256 internal constant MAX_CLAIMS = 10;

    MockAgentIDRegistry internal registry;
    MockERC20 internal token;
    AgentFair internal fair;

    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice"); // holder, handle "alice"
    address internal bob = makeAddr("bob"); // holder, handle "bob"
    address internal carol = makeAddr("carol"); // holder, handle "carol"
    address internal stranger = makeAddr("stranger"); // no Agent ID

    function setUp() public {
        vm.warp(START_TIME);

        registry = new MockAgentIDRegistry();
        registry.register(alice, "alice");
        registry.register(bob, "bob");
        registry.register(carol, "carol");

        token = new MockERC20();
        token.mint(creator, 1_000_000);

        fair = new AgentFair(address(registry));
    }

    // --------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------

    function _createDrop(uint256 amountPerClaim, uint256 maxClaims, uint256 duration) internal returns (uint256) {
        vm.startPrank(creator);
        token.approve(address(fair), amountPerClaim * maxClaims);
        uint256 dropId = fair.createDrop(address(token), amountPerClaim, maxClaims, duration);
        vm.stopPrank();
        return dropId;
    }

    function _defaultDrop() internal returns (uint256) {
        return _createDrop(AMOUNT, MAX_CLAIMS, 1 days);
    }

    // --------------------------------------------------------------
    // Drop creation
    // --------------------------------------------------------------

    function testCreateDropPullsExactTotal() public {
        uint256 creatorBefore = token.balanceOf(creator);

        uint256 dropId = _defaultDrop();

        uint256 total = AMOUNT * MAX_CLAIMS;
        assertEq(token.balanceOf(creator), creatorBefore - total, "creator debited exact total");
        assertEq(token.balanceOf(address(fair)), total, "contract holds exact total");
        assertEq(fair.dropCount(), 1);

        (address dropCreator, address dropToken, uint256 perClaim, uint256 maxClaims, uint256 claimed, uint256 deadline, bool withdrawn) =
            fair.drops(dropId);
        assertEq(dropCreator, creator);
        assertEq(dropToken, address(token));
        assertEq(perClaim, AMOUNT);
        assertEq(maxClaims, MAX_CLAIMS);
        assertEq(claimed, 0);
        assertEq(deadline, START_TIME + 1 days);
        assertFalse(withdrawn);
    }

    // --------------------------------------------------------------
    // Claims
    // --------------------------------------------------------------

    function testNonHolderCannotClaim() public {
        uint256 dropId = _defaultDrop();
        vm.prank(stranger);
        vm.expectRevert(AgentFair.NotAnAgentIDHolder.selector);
        fair.claim(dropId);
    }

    function testHolderClaimsOnceAndSecondClaimReverts() public {
        uint256 dropId = _defaultDrop();

        vm.prank(alice);
        fair.claim(dropId);
        assertEq(token.balanceOf(alice), AMOUNT, "claimer received one share");
        assertTrue(fair.hasClaimed(dropId, fair.identityKeyOf(alice)));

        vm.prank(alice);
        vm.expectRevert(AgentFair.AlreadyClaimed.selector);
        fair.claim(dropId);
    }

    function testTwoDifferentHoldersCanEachClaim() public {
        uint256 dropId = _defaultDrop();

        vm.prank(alice);
        fair.claim(dropId);
        vm.prank(bob);
        fair.claim(dropId);

        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
        (,,,, uint256 claimed,,) = fair.drops(dropId);
        assertEq(claimed, 2);
    }

    function testClaimsStopAtMaxClaims() public {
        uint256 dropId = _createDrop(AMOUNT, 2, 1 days);

        vm.prank(alice);
        fair.claim(dropId);
        vm.prank(bob);
        fair.claim(dropId);

        vm.prank(carol);
        vm.expectRevert(AgentFair.DropExhausted.selector);
        fair.claim(dropId);
    }

    function testClaimAfterDeadlineReverts() public {
        uint256 dropId = _defaultDrop();
        vm.warp(START_TIME + 1 days); // exactly at the deadline: closed

        vm.prank(alice);
        vm.expectRevert(AgentFair.DropExpired.selector);
        fair.claim(dropId);
    }

    // --------------------------------------------------------------
    // Withdrawals
    // --------------------------------------------------------------

    function testCreatorCannotWithdrawBeforeDeadline() public {
        uint256 dropId = _defaultDrop();
        vm.prank(creator);
        vm.expectRevert(AgentFair.DropStillActive.selector);
        fair.withdrawUnclaimed(dropId);
    }

    function testNonCreatorCannotWithdraw() public {
        uint256 dropId = _defaultDrop();
        vm.warp(START_TIME + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert(AgentFair.NotDropCreator.selector);
        fair.withdrawUnclaimed(dropId);
    }

    function testCreatorWithdrawsExactRemainderAfterDeadline() public {
        uint256 dropId = _defaultDrop();

        // 3 of 10 shares claimed.
        vm.prank(alice);
        fair.claim(dropId);
        vm.prank(bob);
        fair.claim(dropId);
        vm.prank(carol);
        fair.claim(dropId);

        vm.warp(START_TIME + 1 days + 1);
        uint256 creatorBefore = token.balanceOf(creator);

        vm.prank(creator);
        fair.withdrawUnclaimed(dropId);

        uint256 expectedRemainder = (MAX_CLAIMS - 3) * AMOUNT; // 700
        assertEq(token.balanceOf(creator), creatorBefore + expectedRemainder, "exact remainder returned");
        assertEq(token.balanceOf(address(fair)), 0, "contract fully drained for this drop");

        // Second withdrawal reverts.
        vm.prank(creator);
        vm.expectRevert(AgentFair.AlreadyWithdrawn.selector);
        fair.withdrawUnclaimed(dropId);
    }

    // --------------------------------------------------------------
    // Check-ins
    // --------------------------------------------------------------

    function testNonHolderCannotCheckIn() public {
        vm.prank(stranger);
        vm.expectRevert(AgentFair.NotAnAgentIDHolder.selector);
        fair.checkIn();
    }

    function testCheckInTwiceInOneDayReverts() public {
        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(fair.identityKeyOf(alice)), 1);

        vm.prank(alice);
        vm.expectRevert(AgentFair.AlreadyCheckedInToday.selector);
        fair.checkIn();
    }

    function testStreakIncrementsOnConsecutiveDays() public {
        bytes32 key = fair.identityKeyOf(alice);

        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(key), 1);

        vm.warp(START_TIME + 1 days);
        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(key), 2);

        vm.warp(START_TIME + 2 days);
        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(key), 3);
    }

    function testStreakResetsAfterGap() public {
        bytes32 key = fair.identityKeyOf(alice);

        vm.prank(alice);
        fair.checkIn();

        vm.warp(START_TIME + 1 days);
        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(key), 2);

        // Skip two days: streak must reset to 1, not continue to 3.
        vm.warp(START_TIME + 4 days);
        vm.prank(alice);
        fair.checkIn();
        assertEq(fair.streakOf(key), 1);
    }

    // --------------------------------------------------------------
    // Identity
    // --------------------------------------------------------------

    function testIdentityKeyIsHandleHash() public view {
        assertEq(fair.identityKeyOf(alice), keccak256(bytes("alice")));
        assertEq(fair.identityKeyOf(bob), keccak256(bytes("bob")));
        assertTrue(fair.identityKeyOf(alice) != fair.identityKeyOf(bob));
    }
}
