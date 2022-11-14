// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IBionTicket.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract TicketMachine is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    IBionTicket public immutable bionTicket;
    uint public immutable STANDARD;

    address public signer;
    address public payTo;

    event PurchaseTickets(
        address indexed user_,
        address currency_,
        uint amount_,
        uint totalPay_,
        address indexed referrer_,
        uint refReward_,
        uint deadline_
    );

    constructor(
        IBionTicket bionTicket_,
        address signer_,
        address payTo_
    ) {
        bionTicket = bionTicket_;
        STANDARD = bionTicket.STANDARD();

        signer = signer_;
        payTo = payTo_;
    }

    function setSigner(address signer_) public onlyOwner {
        signer = signer_;
    }

    function setPayTo(address payTo_) public onlyOwner {
        payTo = payTo_;
    }

    function buyTicketsByTokenBySig(
        address currency_,
        uint amount_,
        uint totalPay_,
        address referrer_,
        uint refReward_,
        uint deadline_,
        bytes memory adminSignature
    ) external {
        require(block.timestamp <= deadline_, "TicketMachine: expired");

        address user = msg.sender;

        bytes32 hash = keccak256(
            abi.encodePacked(block.chainid, user, currency_, amount_, totalPay_, referrer_, refReward_, deadline_)
        );
        address signer_ = hash.toEthSignedMessageHash().recover(adminSignature);
        require(signer_ == signer, "TicketMachine: invalid signer");

        IERC20(currency_).transferFrom(user, payTo, totalPay_ - refReward_);
        if (referrer_ != address(0)) {
            IERC20(currency_).transferFrom(user, referrer_, refReward_);
        }

        bionTicket.mint(user, amount_, STANDARD);

        emit PurchaseTickets(user, currency_, amount_, totalPay_, referrer_, refReward_, deadline_);
    }

    function buyTicketsByETHBySig(
        address currency_,
        uint amount_,
        uint totalPay_,
        address referrer_,
        uint refReward_,
        uint deadline_,
        bytes memory adminSignature
    ) external payable nonReentrant {
        address user = msg.sender;

        bytes32 hash = keccak256(
            abi.encodePacked(block.chainid, user, currency_, amount_, totalPay_, referrer_, refReward_, deadline_)
        );
        address signer_ = hash.toEthSignedMessageHash().recover(adminSignature);
        require(signer_ == signer, "TicketMachine: invalid signer");
        require(msg.value == totalPay_ + refReward_, "TicketMachine: not enough balance");

        payable(payTo).transfer(totalPay_ - refReward_);
        if (referrer_ != address(0)) {
            payable(referrer_).transfer(refReward_);
        }

        bionTicket.mint(user, amount_, STANDARD);

        emit PurchaseTickets(user, currency_, amount_, totalPay_, referrer_, refReward_, deadline_);
    }
}
