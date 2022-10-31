// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IBionTicket is IERC1155 {
    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function MINTER_ROLE() external view returns (bytes32);

    function STANDARD() external view returns (uint256);

    function UNMERCHANTABLE() external view returns (uint256);
}
