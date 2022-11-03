// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IBionTicket.sol";

contract TicketVendingMachine is Ownable, ReentrancyGuard {
    IBionTicket public immutable bionTicket;

    uint public immutable STANDARD;

    mapping(address => uint) public prices;
    mapping(address => bool) public supportedCurrencies;

    event PurchaseTickets(address indexed account_, uint amount_, address currency_);

    constructor(
        IBionTicket bionTicket_,
        address currency_,
        uint price_
    ) {
        bionTicket = bionTicket_;
        supportedCurrencies[currency_] = true;
        prices[currency_] = price_;
        STANDARD = bionTicket.STANDARD();
    }

    function supportCurrency(address currency_, uint price_) external onlyOwner {
        supportedCurrencies[currency_] = true;
        prices[currency_] = price_;
    }

    function buyTicketsByToken(address currency_, uint amount_) external {
        require(supportedCurrencies[currency_], "TicketVendingMachine: unsupported currency");

        IERC20(currency_).transferFrom(msg.sender, address(this), amount_ * prices[currency_]);
        bionTicket.mint(msg.sender, amount_, STANDARD);

        emit PurchaseTickets(msg.sender, amount_, currency_);
    }

    function buyTicketsByETH(uint amount_) external payable nonReentrant {
        require(supportedCurrencies[address(0)], "TicketVendingMachine: unsupported currency");
        require(msg.value == amount_ * prices[address(0)], "TicketVendingMachine: not enough balance");

        bionTicket.mint(msg.sender, amount_, STANDARD);

        emit PurchaseTickets(msg.sender, amount_, address(0));
    }
}
