// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BionTicket is ERC1155, AccessControl {
    uint public constant STANDARD = 0;
    uint public constant UNMERCHANTABLE = 1;

    string public constant name = "Bion Ticket";
    string public constant symbol = "BIONT";

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC1155("https://api.bionswap.com/ticket/metadata/{id}.json") {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "BionTicket: only admin");
        _;
    }

    modifier onlyMinter() {
        require(hasRole(MINTER_ROLE, msg.sender), "BionTicket: only minter");
        _;
    }

    function grantMinterRole(address account_) public onlyAdmin {
        grantRole(MINTER_ROLE, account_);
    }

    function mint(
        address account_,
        uint256 amount_,
        uint ticketType_
    ) external onlyMinter {
        _mint(account_, ticketType_, amount_, "");
    }

    function supportsInterface(bytes4 interfaceId_)
        public
        view
        virtual
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return
            interfaceId_ == type(IERC1155).interfaceId ||
            interfaceId_ == type(IERC1155MetadataURI).interfaceId ||
            interfaceId_ == type(IAccessControl).interfaceId;
    }
}
