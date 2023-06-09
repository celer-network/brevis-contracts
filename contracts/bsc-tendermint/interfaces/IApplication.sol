// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

interface IApplication {
    /**
     * @dev Handle syn package
     */
    function handleSynPackage(uint8 channelId, bytes calldata msgBytes) external returns (bytes memory responsePayload);

    /**
     * @dev Handle ack package
     */
    function handleAckPackage(uint8 channelId, bytes calldata msgBytes) external;

    /**
     * @dev Handle fail ack package
     */
    function handleFailAckPackage(uint8 channelId, bytes calldata msgBytes) external;
}
