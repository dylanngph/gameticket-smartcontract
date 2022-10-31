// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "./interfaces/IBionTicket.sol";
import "hardhat/console.sol";

contract BionGameSlot is AccessControl, IERC1155Receiver {
    struct SnapShot {
        // try to packed all data into 32 bytes
        uint128 roundId;
        uint64 drawnNumber;
    }

    // enum PoolState {
    //     OPENING,
    //     RESULT_DRAWING,
    //     RESULT_DRAWN
    // }
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
    SnapShot[] public snapshots;
    // PoolState public state;
    // roundId => user[]
    mapping(uint => address[]) public participants;
    // user => roundId => seatId
    mapping(address => mapping(uint => uint)) public seatOf; // start from 1
    // roundId => seatId => user
    mapping(uint => mapping(uint => address)) public holderOf;
    // roundId => winner => prize distribution
    // mapping(uint => mapping(address => uint)) public isWinner;
    mapping(uint => mapping(address => bool)) public isClaimed;

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "BionGameSlot: only admin");
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

    function calcNumberDigits(uint number) public pure returns (uint) {
        uint digits = 0;
        while (number > 0) {
            number /= 10;
            digits++;
        }
        return digits;
    }

    function deposit(uint roundId_, uint ticketType_) external {
        require(!isStopped, "BionGameSlot: stopped");
        require(roundId_ == currentRoundId, "BionGameSlot: invalid roundId");
        require(ticketType_ == STANDARD || ticketType_ == UNMERCHANTABLE, "BionGameSlot: invalid ticket type");
        // require(state == PoolState.OPENING, "BionGameSlot: not opening");
        require(filledSlots < totalSlots, "BionGameSlot: full");

        bionTicket.safeTransferFrom(msg.sender, address(this), ticketType_, 1, "");

        if (seatOf[msg.sender][roundId_] == 0) {
            participants[roundId_].push(msg.sender);
        }
        uint seatId = filledSlots + 1;
        seatOf[msg.sender][roundId_] = seatId;
        holderOf[roundId_][seatId] = msg.sender;
        unchecked {
            filledSlots++;
        }
    }

    function getParticipantsAtRound(uint roundId_) external view returns (address[] memory) {
        return participants[roundId_];
    }

    function getWinnersAtRound(uint roundId_) public view returns (address[] memory) {
        SnapShot memory snapshot = snapshots[roundId_];

        address[] memory winners = new address[](nPrizes);

        for (uint i = 1; i < nPrizes + 1; ) {
            uint curNoDigits = (10**(i * nDrawDigits));
            uint parsedSeat = snapshot.drawnNumber % curNoDigits;
            snapshot.drawnNumber /= uint64(curNoDigits);

            winners[i - 1] = holderOf[roundId_][parsedSeat];

            unchecked {
                i++;
            }
        }

        return winners;
    }

    function isWinnerAtRound(address user_, uint roundId_) public view returns (bool isWinner) {
        uint seatId = seatOf[user_][roundId_];
        SnapShot memory snapshot = snapshots[roundId_];

        for (uint i = 1; i < nPrizes + 1; ) {
            uint curNoDigits = (10**(i * nDrawDigits));
            uint parsedSeat = snapshot.drawnNumber % curNoDigits;
            snapshot.drawnNumber /= uint64(curNoDigits);

            if (parsedSeat == seatId) {
                isWinner = true;
                break;
            }
            unchecked {
                i++;
            }
        }
    }

    function calcClaimablePrize(address user_, uint roundId_) public view returns (uint) {
        uint seatId = seatOf[user_][roundId_];
        if (isClaimed[roundId_][user_] || roundId_ >= currentRoundId || seatId == 0) {
            return 0;
        }

        SnapShot memory snapshot = snapshots[roundId_];

        bool isWinner = false;
        uint i = 1;
        for (; i < nPrizes + 1; ) {
            uint curNoDigits = (10**(i * nDrawDigits));
            uint digit = snapshot.drawnNumber % curNoDigits;
            snapshot.drawnNumber /= uint64(curNoDigits);
            if (digit == seatId) {
                isWinner = true;
                break;
            }
            unchecked {
                i++;
            }
        }

        if (!isWinner) {
            return 0;
        }
        return prizeDistributions[i - 1];
    }

    function claim(uint roundId_) external {
        uint claimablePrize = calcClaimablePrize(msg.sender, roundId_);
        require(claimablePrize > 0, "BionGameSlot: nothing to claim");

        bionTicket.safeTransferFrom(address(this), msg.sender, STANDARD, claimablePrize, "");

        isClaimed[roundId_][msg.sender] = true;
    }

    function onRandomReceived(uint randomNumber) external {
        require(msg.sender == randomGenerator, "BionGameSlot: invalid random generator");

        uint[] memory availableSlots = new uint[](totalSlots + 1);
        // SnapShot memory snapshot = SnapShot({roundId: currentRoundId, winners: new address[](nPrizes)});
        uint lastIndex = totalSlots;

        uint drawnNumber = 10**((nPrizes * nDrawDigits));
`
        for (uint i = 0; i < nPrizes; ) {
            uint draw = uint((uint(keccak256(abi.encodePacked(randomNumber, i))) % lastIndex) + 1);
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
            // isWinner[currentRoundId][holderOf[currentRoundId][result]] = prizeDistributions[i];
            console.log("draw: %s, result: %s, drawnNumber: %s", draw, result, drawnNumber);

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
        snapshots.push(SnapShot({roundId: uint128(currentRoundId), drawnNumber: uint64(drawnNumber)}));

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
