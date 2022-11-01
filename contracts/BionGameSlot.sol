// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "./interfaces/IBionTicket.sol";

contract BionGameSlot is AccessControl, IERC1155Receiver {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint public immutable STANDARD;
    uint public immutable UNMERCHANTABLE;

    address public randomGenerator;
    IBionTicket public bionTicket;

    uint public totalSlots;
    uint public filledSlots;
    uint public currentRoundId;
    uint public nPrizes;
    uint public nDrawDigits;
    uint[] public prizeDistributions;
    bool public isStopped;
    // roundId => drawnNumber
    mapping(uint => uint) public snapshots;
    // roundId => user[]
    mapping(uint => address[]) public participants;
    // roundId => seatId => user
    mapping(uint => mapping(uint => address)) public holderOf;
    // user => roundId => amount
    mapping(address => mapping(uint => uint)) public shareOf;
    // roundId => prize => bool
    mapping(uint => mapping(uint => bool)) public isPrizeClaimed;

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "BionGameSlot: only admin");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "BionGameSlot: only operator");
        _;
    }

    constructor(
        IBionTicket bionTicket_,
        address randomGenerator_,
        uint totalSlots_,
        uint nPrizes_,
        uint[] memory prizeDistribution_
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        randomGenerator = randomGenerator_;
        bionTicket = bionTicket_;
        totalSlots = totalSlots_;
        nPrizes = nPrizes_;
        prizeDistributions = prizeDistribution_;
        nDrawDigits = calcNumberDigits(totalSlots_);

        STANDARD = bionTicket.STANDARD();
        UNMERCHANTABLE = bionTicket.UNMERCHANTABLE();
    }

    function grantOperatorRole(address operator) external onlyAdmin {
        grantRole(OPERATOR_ROLE, operator);
    }

    function calcNumberDigits(uint number) public pure returns (uint) {
        uint digits = 0;
        while (number > 0) {
            number /= 10;
            digits++;
        }
        return digits;
    }

    function deposit(
        uint roundId_,
        uint ticketType_,
        uint amount_
    ) external {
        require(!isStopped, "BionGameSlot: stopped");
        require(roundId_ == currentRoundId, "BionGameSlot: invalid roundId");
        require(ticketType_ == STANDARD || ticketType_ == UNMERCHANTABLE, "BionGameSlot: invalid ticket type");
        require(filledSlots + amount_ <= totalSlots, "BionGameSlot: not enough available slots");
        // require(shareOf[msg.sender][roundId_] == 0, "BionGameSlot: already deposited");

        bionTicket.safeTransferFrom(msg.sender, address(this), ticketType_, amount_, "");

        if (shareOf[msg.sender][roundId_] == 0) {
            participants[roundId_].push(msg.sender);
        }

        shareOf[msg.sender][roundId_] += amount_;

        for (uint i = 0; i < amount_; i++) {
            holderOf[roundId_][filledSlots + i] = msg.sender;
        }

        unchecked {
            filledSlots += amount_;
        }
    }

    function getParticipantsAtRound(uint roundId_) external view returns (address[] memory) {
        return participants[roundId_];
    }

    function getWinnersAtRound(uint roundId_) public view returns (address[] memory) {
        uint drawnNumber = snapshots[roundId_];

        address[] memory winners = new address[](nPrizes);

        for (uint i = 0; i < nPrizes; ) {
            uint parsedSeat = drawnNumber % (10**nDrawDigits);
            drawnNumber /= 10**nDrawDigits;

            winners[i] = holderOf[roundId_][parsedSeat];

            unchecked {
                i++;
            }
        }

        return winners;
    }

    function isWinnerOfPrize(
        address user_,
        uint roundId_,
        uint prize_
    ) public view returns (bool isWinner) {
        uint drawnNumber = snapshots[roundId_];

        for (uint i = 0; i < nPrizes; ) {
            uint parsedSeat = drawnNumber % (10**nDrawDigits);
            drawnNumber /= 10**nDrawDigits;

            if (holderOf[roundId_][parsedSeat] == user_ && prize_ == i) {
                return true;
            }

            unchecked {
                i++;
            }
        }
    }

    function getClaimablePrizesOfUser(address user_, uint roundId_) public view returns (bool[] memory) {
        bool[] memory prizes = new bool[](nPrizes);
        if (roundId_ >= currentRoundId || shareOf[user_][roundId_] == 0) {
            return prizes;
        }

        uint drawnNumber = snapshots[roundId_];

        uint i = 0;
        for (; i < nPrizes; ) {
            uint digit = drawnNumber % (10**nDrawDigits);
            drawnNumber /= 10**nDrawDigits;
            if (holderOf[roundId_][digit] == user_ && !isPrizeClaimed[roundId_][i]) {
                prizes[i] = true;
            }
            unchecked {
                i++;
            }
        }

        return prizes;
    }

    function claim(uint roundId_, uint prize) external {
        require(isWinnerOfPrize(msg.sender, roundId_, prize), "BionGameSlot: not winner");
        require(!isPrizeClaimed[roundId_][prize], "BionGameSlot: already claimed");

        bionTicket.safeTransferFrom(address(this), msg.sender, STANDARD, prizeDistributions[prize], "");
        isPrizeClaimed[roundId_][prize] = true;
    }

    function onRandomReceived(uint randomNumber) external onlyOperator {
        uint lastIndex = totalSlots - 1;
        uint drawnNumber = 10**((nPrizes * nDrawDigits));
        uint[] memory availableSlots = new uint[](totalSlots);

        for (uint i = 0; i < nPrizes; ) {
            uint draw = uint(keccak256(abi.encodePacked(randomNumber, i))) % (lastIndex + 1);

            uint result;
            uint valAtIndex = availableSlots[draw];
            if (valAtIndex == 0) {
                // This means the index itself is still an available token
                result = draw;
            } else {
                // This means the index itself is not an available token, but the val at that index is.
                result = valAtIndex;
            }

            drawnNumber = drawnNumber + uint(result * (10**(i * nDrawDigits)));
            uint lastValInArray = availableSlots[lastIndex];
            if (draw != lastIndex) {
                // Replace the value at draw, now that it's been used.
                // Replace it with the data from the last index in the array, since we are going to decrease the array size afterwards.
                if (lastValInArray == 0) {
                    // This means the index itself is still an available token
                    availableSlots[draw] = lastIndex;
                } else {
                    // This means the index itself is not an available token, but the val at that index is.
                    availableSlots[draw] = lastValInArray;
                }
            }

            unchecked {
                lastIndex--;
                i++;
            }
        }

        snapshots[currentRoundId] = drawnNumber;

        // reset pool
        // state = PoolState.RESULT_DRAWN;
        filledSlots = 0;
        unchecked {
            currentRoundId++;
        }
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"));
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"));
    }
}
