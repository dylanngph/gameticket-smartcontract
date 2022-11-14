// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IBionTicket.sol";

contract BionGameSlot is AccessControl, IERC1155Receiver, VRFConsumerBaseV2 {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint public immutable STANDARD;
    uint public immutable UNMERCHANTABLE;

    IBionTicket public bionTicket;

    uint public lastDrawnTime;
    uint public delayDuration;
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
    // use for withdrawal when pool stops
    mapping(address => LatestUserDeposit) public latestUserDeposits;

    struct LatestUserDeposit {
        // uint roundId;
        uint32 nStandards;
        uint32 nUnmerchantables;
    }

    // roundId => prize => bool
    mapping(uint => mapping(uint => bool)) public isPrizeClaimed;

    // VRF
    VRFCoordinatorV2Interface public COORDINATOR;
    bytes32 public keyHash;
    uint64 public subscriptionId;
    uint32 public callbackGasLimit = 300000;
    uint32 public numWords = 1;
    uint16 public requestConfirmations = 3;
    uint public lastRequestId;
    bool public isDrawing;

    event Deposit(uint indexed roundId, address indexed user, uint amount, uint ticketType);
    event Claim(uint indexed roundId, address indexed user, uint[] prize, uint amount);
    event Withdraw(uint indexed roundId, address indexed user, uint nStandards, uint nUnmerchantables);
    event StartDrawSlots(uint roundId);
    event StopPool(uint roundId);
    event EndDrawSlots(uint roundId, uint randomResult);

    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "BionGameSlot: only admin");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "BionGameSlot: only operator");
        _;
    }

    modifier notStop() {
        require(!isStopped, "BionGameSlot: stopped");
        _;
    }

    constructor(
        IBionTicket bionTicket_,
        uint totalSlots_,
        uint nPrizes_,
        uint[] memory prizeDistribution_,
        address coordinator_,
        uint64 subscriptionId_,
        bytes32 keyHash_,
        uint delayDuration_
    ) VRFConsumerBaseV2(coordinator_) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantOperatorRole(msg.sender);

        bionTicket = bionTicket_;
        totalSlots = totalSlots_;
        nPrizes = nPrizes_;
        prizeDistributions = prizeDistribution_;
        nDrawDigits = calcNumberDigits(totalSlots_);

        STANDARD = bionTicket.STANDARD();
        UNMERCHANTABLE = bionTicket.UNMERCHANTABLE();

        COORDINATOR = VRFCoordinatorV2Interface(coordinator_);
        subscriptionId = subscriptionId_;
        keyHash = keyHash_;

        delayDuration = delayDuration_;
    }

    function setVRFConfig(
        address coordinator_,
        uint64 subscriptionId_,
        bytes32 keyHash_,
        uint32 callbackGasLimit_,
        uint32 numWords_,
        uint16 requestConfirmations_
    ) external onlyAdmin {
        COORDINATOR = VRFCoordinatorV2Interface(coordinator_);
        subscriptionId = subscriptionId_;
        keyHash = keyHash_;
        callbackGasLimit = callbackGasLimit_;
        numWords = numWords_;
        requestConfirmations = requestConfirmations_;
    }

    function setStop() external onlyAdmin {
        require(!isDrawing, "BionGameSlot: is drawing");
        require(!isStopped, "BionGameSlot: already stopped");

        isStopped = true;
        emit StopPool(currentRoundId);
    }

    function setDelayDuration(uint delayDuration_) external onlyAdmin {
        delayDuration = delayDuration_;
    }

    function grantOperatorRole(address operator) public onlyAdmin {
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

    function isDepositedAtRound(uint roundId, address user) public view returns (bool) {
        return shareOf[user][roundId] > 0;
    }

    function isRoundStart() public view returns (bool) {
        return block.timestamp >= lastDrawnTime + delayDuration && filledSlots < totalSlots;
    }

    function getPrizeDistributions() external view returns (uint[] memory) {
        return prizeDistributions;
    }

    function deposit(
        uint roundId_,
        uint ticketType_,
        uint amount_
    ) external notStop {
        require(block.timestamp > lastDrawnTime + delayDuration, "BionGameSlot: not yet");
        require(amount_ > 0, "BionGameSlot: amount must be greater than 0");
        require(roundId_ == currentRoundId, "BionGameSlot: invalid roundId");
        require(ticketType_ == STANDARD || ticketType_ == UNMERCHANTABLE, "BionGameSlot: invalid ticket type");
        require(filledSlots + amount_ <= totalSlots, "BionGameSlot: not enough available slots");

        bionTicket.safeTransferFrom(msg.sender, address(this), ticketType_, amount_, "");

        LatestUserDeposit memory latestUserDeposit = latestUserDeposits[msg.sender];
        if (shareOf[msg.sender][roundId_] == 0) {
            participants[roundId_].push(msg.sender);

            if (ticketType_ == STANDARD) {
                latestUserDeposit.nStandards = uint32(amount_);
                latestUserDeposit.nUnmerchantables = 0;
            } else {
                latestUserDeposit.nStandards = 0;
                latestUserDeposit.nUnmerchantables = uint32(amount_);
            }
        } else {
            if (ticketType_ == STANDARD) {
                latestUserDeposit.nStandards += uint32(amount_);
            } else {
                latestUserDeposit.nUnmerchantables += uint32(amount_);
            }
        }
        latestUserDeposits[msg.sender] = latestUserDeposit;
        shareOf[msg.sender][roundId_] += amount_;

        for (uint i = 0; i < amount_; i++) {
            holderOf[roundId_][filledSlots + i] = msg.sender;
        }

        unchecked {
            filledSlots += amount_;
        }

        emit Deposit(roundId_, msg.sender, amount_, ticketType_);
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
        uint roundId_,
        address user_,
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

    function isUserClaimedPrizes(uint roundId_, address user_) public view returns (bool) {
        uint[] memory prizesOfUser = getPrizesOfUser(roundId_, user_);

        for (uint i = 0; i < prizesOfUser.length; i++) {
            if (isPrizeClaimed[roundId_][prizesOfUser[i]]) {
                return true;
            }
        }

        return false;
    }

    function getPrizesOfUser(uint roundId_, address user_) public view returns (uint[] memory) {
        uint nPrizesOfUser = 0;
        bool[] memory isPrizesOfUser = new bool[](nPrizes);

        for (uint i = 0; i < nPrizes; i++) {
            if (isWinnerOfPrize(roundId_, user_, i)) {
                nPrizesOfUser++;
                isPrizesOfUser[i] = true;
            }
        }

        uint[] memory prizes = new uint[](nPrizesOfUser);
        uint j = 0;
        for (uint i = 0; i < nPrizes; i++) {
            if (isPrizesOfUser[i]) {
                prizes[j] = i;
                j++;
            }
        }

        return prizes;
    }

    function getClaimablePrizesOfUser(uint roundId_, address user_) public view returns (uint[] memory) {
        bool[] memory isWonAtPrizes = new bool[](nPrizes);
        if (roundId_ >= currentRoundId || shareOf[user_][roundId_] == 0) {
            return new uint[](0);
        }

        uint drawnNumber = snapshots[roundId_];

        uint nWonPrizes = 0;
        uint i = 0;
        for (; i < nPrizes; ) {
            uint digit = drawnNumber % (10**nDrawDigits);
            drawnNumber /= 10**nDrawDigits;
            if (holderOf[roundId_][digit] == user_ && !isPrizeClaimed[roundId_][i]) {
                isWonAtPrizes[i] = true;
                nWonPrizes++;
            }
            unchecked {
                i++;
            }
        }

        uint[] memory claimablePrizes = new uint[](nWonPrizes);
        uint j = 0;
        for (uint k = 0; k < nPrizes; k++) {
            if (isWonAtPrizes[k]) {
                claimablePrizes[j] = k;
                j++;
            }
        }

        return claimablePrizes;
    }

    function claim(uint roundId) external {
        uint[] memory claimablePrizes = getClaimablePrizesOfUser(roundId, msg.sender);
        require(claimablePrizes.length > 0, "BionGameSlot: no prize to claim");

        uint totalClaimable = 0;
        for (uint i = 0; i < claimablePrizes.length; i++) {
            totalClaimable += prizeDistributions[claimablePrizes[i]];
            isPrizeClaimed[roundId][claimablePrizes[i]] = true;
        }

        bionTicket.safeTransferFrom(address(this), msg.sender, STANDARD, totalClaimable, "");
        emit Claim(roundId, msg.sender, claimablePrizes, totalClaimable);
    }

    function withdraw() external {
        require(isStopped, "BionGameSlot: not stopped");
        require(shareOf[msg.sender][currentRoundId] > 0, "BionGameSlot: not deposited");

        LatestUserDeposit memory latestUserDeposit = latestUserDeposits[msg.sender];
        require(latestUserDeposit.nStandards > 0 || latestUserDeposit.nUnmerchantables > 0, "BionGameSlot: already withdrawn");

        bionTicket.safeTransferFrom(address(this), msg.sender, STANDARD, latestUserDeposit.nStandards, "");
        bionTicket.safeTransferFrom(address(this), msg.sender, UNMERCHANTABLE, latestUserDeposit.nUnmerchantables, "");

        latestUserDeposits[msg.sender] = LatestUserDeposit(0, 0);
        emit Withdraw(currentRoundId, msg.sender, latestUserDeposit.nStandards, latestUserDeposit.nUnmerchantables);
    }

    function drawSlots(uint randomNumber) public view returns (uint) {
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

        return drawnNumber;
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

    function requestRandom() external onlyOperator notStop {
        require(filledSlots == totalSlots, "BionGameSlot: not enough participants");
        require(snapshots[currentRoundId] == 0, "BionGameSlot: already drawn");
        require(!isDrawing, "BionGameSlot: is drawing");

        isDrawing = true;
        uint requestId = COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        lastRequestId = requestId;
        emit StartDrawSlots(currentRoundId);
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        require(requestId == lastRequestId, "BionGameSlot: invalid requestId");
        require(isDrawing, "BionGameSlot: not drawing");
        uint drawnNumber = drawSlots(randomWords[0]);

        isDrawing = false;
        snapshots[currentRoundId] = drawnNumber;
        filledSlots = 0;
        lastDrawnTime = block.timestamp;
        uint roundId = currentRoundId;
        unchecked {
            currentRoundId++;
        }

        emit EndDrawSlots(roundId, drawnNumber);
    }

    function canTriggerDraw() public view returns (bool) {
        return filledSlots == totalSlots && snapshots[currentRoundId] == 0 && !isDrawing && !isStopped;
    }

    function forceReturnTickets(uint ticketType_) external onlyAdmin {
        uint balance = bionTicket.balanceOf(address(this), ticketType_);
        bionTicket.safeTransferFrom(address(this), msg.sender, ticketType_, balance, "");
    }

    function recoverLostTokens(address token_, address to_) external onlyAdmin {
        IERC20(token_).transfer(to_, IERC20(token_).balanceOf(address(this)));
    }
}
