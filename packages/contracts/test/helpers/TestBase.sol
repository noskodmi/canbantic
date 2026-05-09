// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { Test } from "forge-std/Test.sol";

/// @notice Shared test base. Pre-funds standard actors (alice, bob, carol,
///         dave, eve, frank — 100 ETH each) and exposes labelled namehash
///         constants used across multiple test suites.
abstract contract TestBase is Test {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal eve = makeAddr("eve");
    address internal frank = makeAddr("frank");
    address internal admin = makeAddr("admin");
    address internal poster = makeAddr("poster");
    address internal worker = makeAddr("worker");

    bytes32 internal constant ROOT_PARENT = bytes32(0);
    bytes32 internal constant CANBANTIC_ETH =
        keccak256(abi.encodePacked(bytes32(0), keccak256(bytes("kanbantic.eth"))));
    bytes32 internal constant ACME_PARENT =
        keccak256(abi.encodePacked(CANBANTIC_ETH, keccak256(bytes("acme"))));

    function setUp() public virtual {
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(eve, 100 ether);
        vm.deal(frank, 100 ether);
        vm.deal(admin, 100 ether);
        vm.deal(poster, 100 ether);
        vm.deal(worker, 100 ether);
    }

    function namehashChild(bytes32 parent, string memory label) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(parent, keccak256(bytes(label))));
    }
}
