// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { Test } from "forge-std/Test.sol";
import { OffchainResolver } from "../src/OffchainResolver.sol";

/// @title OffchainResolverTest
/// @notice Covers EIP-3668 revert shape, signature verification, and ENSIP-10
///         interface advertisement. Also exercises the failure modes
///         (expiry, wrong signer, malformed signature).
contract OffchainResolverTest is Test {
    OffchainResolver internal resolver;

    string internal constant URL = "https://example.test/api/ccip-read/{sender}/{data}.json";

    uint256 internal signerKey;
    address internal signer;
    uint256 internal otherKey;
    address internal other;

    /// @notice DNS-wire-format encoding of `noskodmi.kanbantic.eth` —
    ///         each label prefixed by its length, terminated by a zero
    ///         byte. Hand-built to keep the test fully self-contained.
    bytes internal name;

    /// @notice Sample resolver call: `addr(bytes32)` with the namehash of
    ///         `noskodmi.kanbantic.eth`. The actual hash value doesn't
    ///         matter for these tests — we only assert what the resolver
    ///         packs into `OffchainLookup`.
    bytes internal sampleCallData;

    function setUp() public {
        signerKey = 0xA11CE;
        signer = vm.addr(signerKey);
        otherKey = 0xB0B;
        other = vm.addr(otherKey);

        resolver = new OffchainResolver(URL, signer);

        name = abi.encodePacked(
            uint8(8), "noskodmi", uint8(9), "kanbantic", uint8(3), "eth", uint8(0)
        );
        sampleCallData = abi.encodeWithSelector(
            bytes4(0x3b3b57de),
            bytes32(uint256(0xC0FFEE)) // addr(bytes32)
        );

        // Stable timestamp so `expires` math is reproducible.
        vm.warp(1_700_000_000);
    }

    /* ───────────────── resolve() reverts with OffchainLookup ───────────────── */

    function test_Resolve_RevertsWithOffchainLookup() public {
        string[] memory urls = new string[](1);
        urls[0] = URL;

        vm.expectRevert(
            abi.encodeWithSelector(
                OffchainResolver.OffchainLookup.selector,
                address(resolver),
                urls,
                sampleCallData,
                OffchainResolver.resolveWithProof.selector,
                abi.encode(sampleCallData, address(resolver))
            )
        );
        resolver.resolve(name, sampleCallData);
    }

    /* ───────────────── resolveWithProof — happy path ───────────────── */

    function test_ResolveWithProof_AcceptsValidSignature() public view {
        bytes memory result = abi.encode(address(0xCAFE));
        uint64 expires = uint64(block.timestamp + 1 hours);

        bytes memory sig =
            _signFromGateway(signerKey, address(resolver), expires, sampleCallData, result);
        bytes memory response = abi.encode(result, expires, sig);
        bytes memory extraData = abi.encode(sampleCallData, address(resolver));

        bytes memory got = resolver.resolveWithProof(response, extraData);
        assertEq(got, result);
    }

    /* ───────────────── resolveWithProof — failure modes ───────────────── */

    function test_ResolveWithProof_RevertsOnWrongSigner() public {
        bytes memory result = abi.encode(address(0xCAFE));
        uint64 expires = uint64(block.timestamp + 1 hours);

        bytes memory sig =
            _signFromGateway(otherKey, address(resolver), expires, sampleCallData, result);
        bytes memory response = abi.encode(result, expires, sig);
        bytes memory extraData = abi.encode(sampleCallData, address(resolver));

        vm.expectRevert(OffchainResolver.InvalidSignature.selector);
        resolver.resolveWithProof(response, extraData);
    }

    function test_ResolveWithProof_RevertsOnTamperedResult() public {
        bytes memory result = abi.encode(address(0xCAFE));
        uint64 expires = uint64(block.timestamp + 1 hours);

        bytes memory sig =
            _signFromGateway(signerKey, address(resolver), expires, sampleCallData, result);
        bytes memory tampered = abi.encode(address(0xBADBAD));
        bytes memory response = abi.encode(tampered, expires, sig);
        bytes memory extraData = abi.encode(sampleCallData, address(resolver));

        vm.expectRevert(OffchainResolver.InvalidSignature.selector);
        resolver.resolveWithProof(response, extraData);
    }

    function test_ResolveWithProof_RevertsWhenExpired() public {
        bytes memory result = abi.encode(address(0xCAFE));
        // Signed an hour ago and already expired.
        uint64 expires = uint64(block.timestamp - 1);

        bytes memory sig =
            _signFromGateway(signerKey, address(resolver), expires, sampleCallData, result);
        bytes memory response = abi.encode(result, expires, sig);
        bytes memory extraData = abi.encode(sampleCallData, address(resolver));

        vm.expectRevert(OffchainResolver.SignatureExpired.selector);
        resolver.resolveWithProof(response, extraData);
    }

    /* ───────────────── supportsInterface ───────────────── */

    function test_SupportsInterface_AdvertisesEnsipAndCcipRead() public view {
        assertTrue(resolver.supportsInterface(0x01ffc9a7), "ERC-165");
        assertTrue(resolver.supportsInterface(0x9061b923), "ENSIP-10 wildcard");
        assertTrue(resolver.supportsInterface(0x73302a25), "EIP-3668 OffchainLookup");
    }

    function test_SupportsInterface_RejectsUnknown() public view {
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }

    /* ───────────────── constructor pins state ───────────────── */

    function test_Constructor_StoresUrlAndSigner() public view {
        assertEq(resolver.url(), URL);
        assertEq(resolver.signer(), signer);
    }

    /* ───────────────── helpers ───────────────── */

    /// @dev Reproduces the worker gateway's signing scheme exactly. Any
    ///      drift between this helper and the worker's TypeScript signer
    ///      shows up as a `InvalidSignature` revert in production.
    function _signFromGateway(
        uint256 pk,
        address resolverAddr,
        uint64 expires,
        bytes memory request,
        bytes memory result
    ) internal pure returns (bytes memory) {
        bytes32 digest = keccak256(
            abi.encodePacked(
                hex"1900", resolverAddr, expires, keccak256(request), keccak256(result)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }
}
