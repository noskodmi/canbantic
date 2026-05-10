// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import { ECDSA } from "@openzeppelin/utils/cryptography/ECDSA.sol";

/// @title OffchainResolver
/// @notice EIP-3668 (CCIP-Read) + EIP-2544 (wildcard ENS) resolver. Reverts
///         every `resolve(name, data)` call with `OffchainLookup`, pointing
///         clients at Kanbantic's worker gateway. The gateway returns a
///         signed response which the client passes back into
///         `resolveWithProof`; we verify the signer and return the bytes.
///
/// @dev    Adapted from the canonical reference implementation
///         (`ensdomains/offchain-resolver`, MIT-licensed). Pinned to Solidity
///         0.8.27 + OpenZeppelin v5; uses OZ's `ECDSA` for signature
///         recovery instead of vendoring `SignatureVerifier`.
///
///         Signing digest (matches the reference):
///             keccak256(abi.encodePacked(
///                 hex"1900",
///                 address(this),     // the resolver
///                 expires,           // uint64 unix seconds
///                 keccak256(request),// the original resolve(name,data) calldata
///                 keccak256(result)  // the ABI-encoded resolver answer
///             ))
contract OffchainResolver {
    /// @notice EIP-3668 sentinel revert. Clients that understand CCIP-Read
    ///         catch this, follow `urls`, POST `callData`, then call
    ///         `callbackFunction` with the response.
    error OffchainLookup(
        address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData
    );

    /// @notice Signed response expired before `resolveWithProof` was called.
    error SignatureExpired();

    /// @notice Recovered signer is not the trusted gateway signer.
    error InvalidSignature();

    /// @notice Pre-encoded gateway URL (EIP-3668 substitution placeholders
    ///         `{sender}` and `{data}` are filled in by the client).
    string public url;

    /// @notice Address whose private key the worker uses to sign responses.
    address public signer;

    constructor(string memory url_, address signer_) {
        url = url_;
        signer = signer_;
    }

    /// @notice EIP-2544 wildcard resolution entrypoint. Always reverts with
    ///         `OffchainLookup`; the actual answer is computed off-chain by
    ///         the worker gateway.
    /// @param name DNS-wire-format ENS name (per EIP-2544)
    /// @param data Original resolver call (e.g. `addr(bytes32)`,
    ///        `text(bytes32,string)`) ABI-encoded
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        returns (bytes memory)
    {
        // Silence unused-variable warnings while keeping the external
        // signature exact. Both args are forwarded to the gateway in
        // `callData`; the resolver itself does no work.
        name;
        bytes memory callData = data;

        string[] memory urls = new string[](1);
        urls[0] = url;

        revert OffchainLookup(
            address(this),
            urls,
            callData,
            OffchainResolver.resolveWithProof.selector,
            // extraData is opaque to the client. We round-trip the original
            // callData so the signature digest can rebind it on the way back.
            abi.encode(callData, address(this))
        );
    }

    /// @notice EIP-3668 callback. Verifies the gateway's signature over
    ///         (this, expires, request, result) and returns the result bytes.
    /// @param response abi.encode(result, expires, signature)
    /// @param extraData abi.encode(callData, address(this)) — the same blob
    ///        we packed into the OffchainLookup revert.
    function resolveWithProof(bytes calldata response, bytes calldata extraData)
        external
        view
        returns (bytes memory)
    {
        (bytes memory result, uint64 expires, bytes memory sig) =
            abi.decode(response, (bytes, uint64, bytes));
        (bytes memory callData,) = abi.decode(extraData, (bytes, address));

        if (expires < block.timestamp) revert SignatureExpired();

        bytes32 digest = keccak256(
            abi.encodePacked(
                hex"1900", address(this), expires, keccak256(callData), keccak256(result)
            )
        );

        address recovered = ECDSA.recover(digest, sig);
        if (recovered != signer) revert InvalidSignature();
        return result;
    }

    /// @notice ENSIP / ERC-165 interface advertisement.
    ///         - `0x9061b923` — ENSIP-10 wildcard resolver (`resolve(bytes,bytes)`)
    ///         - `0x01ffc9a7` — ERC-165 itself
    ///         - `0x73302a25` — EIP-3668 / CCIP-Read sentinel
    ///           (`OffchainLookup` revert recognition; matches the reference
    ///           implementation's published constant)
    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        return interfaceID == 0x9061b923 // ENSIP-10
            || interfaceID == 0x01ffc9a7 // ERC-165
            || interfaceID == 0x73302a25; // EIP-3668 OffchainLookup
    }
}
