//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract CalculatorV1 is Initializable {
    uint256 public val;

    function initialize(uint256 _val) external initializer {
        val = _val;
    }

    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }

    function getVal() public view returns (uint256) {
        return val;
    }
}
