// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
// import "hardhat/con"

import "hardhat/console.sol";

/**
 * @title ClubhouseVault
 * @dev A contract for managing ERC20 token deposits, withdrawals via off-chain signatures, and multi-signature emergency withdrawals.
 */
contract ClubhouseVault is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;

    // ERC20 token managed by the vault
    IERC20 public tmkocToken;

    // Address authorized to sign off-chain user withdrawal requests
    address public trustedSigner;

    // Total tournament fees collected
    uint256 public totalTournamentFees;

    // Nonce tracking to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    mapping(address => bool) validSigners;
    mapping(address => bool) public isMultiSigOwner;

    // Multi-signature owners for emergency withdrawals
    address[] public multiSigOwners;

    // Minimum number of approvals required for multi-signature actions
    uint256 public minApprovals;

    // Events for logging key actions and changes
    event TokensDeposited(address indexed user, uint256 amount);
    event WinningWithdrawn(address indexed user, uint256 amount);
    event WithdrawalWithSignature(
        address indexed user,
        uint256 amount,
        uint256 nonce
    );
    event TournamentFeesCollected(uint256 amount);
    event TournamentFeesWithdrawn(address indexed admin, uint256 amount);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event TrustedSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );
    event MultiSigOwnersUpdated(address[] newOwners, uint256 minApprovals);
    event DebugSigner(address signer); // Add a debug event for recovered signer

    /**
     * @dev Initializes the contract with the specified ERC20 token address.
     * @param _tokenAddress Address of the ERC20 token contract.
     */
    constructor(address _tokenAddress) Ownable(msg.sender) {
        tmkocToken = IERC20(_tokenAddress);
    }

    /**
     * @dev Updates the list of multi-signature owners and the minimum approval count.
     * @param owners List of new multi-signature owners.
     * @param _minApprovals Minimum number of approvals required for multi-signature actions.
     */
    function setMultiSigOwners(
        address[] calldata owners,
        uint256 _minApprovals
    ) external onlyOwner {
        require(owners.length > 0, "No owners provided");
        require(owners.length <= 10, "Too many owners");
        require(
            _minApprovals > 0 && _minApprovals <= owners.length,
            "Invalid minApprovals"
        );

        // Clear previous multi-signature owners
        for (uint256 i = 0; i < multiSigOwners.length; i++) {
            isMultiSigOwner[multiSigOwners[i]] = false;
        }

        // Update the owners and mapping
        for (uint256 i = 0; i < owners.length; i++) {
            isMultiSigOwner[owners[i]] = true;
        }

        multiSigOwners = owners;
        minApprovals = _minApprovals;

        emit MultiSigOwnersUpdated(owners, _minApprovals);
    }

    /**
     * @dev Internal helper function to check if an address is a valid multi-signature owner.
     * @param account Address to check.
     * @return True if the address is a multi-signature owner, otherwise false.
     */
    function _isMultiSigOwner(address account) internal view returns (bool) {
        for (uint256 i = 0; i < multiSigOwners.length; i++) {
            if (multiSigOwners[i] == account) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Updates the trusted signer for off-chain signature verification.
     * @param _trustedSigner Address of the new trusted signer.
     */
    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        require(_trustedSigner != address(0), "Invalid signer address");
        emit TrustedSignerUpdated(trustedSigner, _trustedSigner);
        trustedSigner = _trustedSigner;
    }

    /**
     * @dev Allows users to deposit ERC20 tokens into the vault.
     * @param caller Address of the user making the deposit.
     * @param amount Amount of tokens to deposit.
     */
    function deposit(address caller, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(caller != address(0), "Invalid recipient address");
        bool success = tmkocToken.transferFrom(caller, address(this), amount);
        require(success, "Transfer failed");
        // depositedTokens[caller] += amount;
        emit TokensDeposited(caller, amount);
    }

    /**
     * @dev Collects tournament fees from the vault's token balance.
     * @param amount Amount of tokens to collect as fees.
     */
    function collectTournamentFee(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        totalTournamentFees += amount;
        emit TournamentFeesCollected(amount);
    }

    /**
     * @dev Generates a hash of the withdrawal message.
     * @param _caller Address of the user initiating the withdrawal.
     * @param _amount Amount of tokens to withdraw.
     * @param _message Additional withdrawal details.
     * @param _nonce Unique nonce to prevent replay attacks.
     * @return The hashed withdrawal message.
     */
    function getMessageHash(
        address _caller,
        uint256 _amount,
        string memory _message,
        uint256 _nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_caller, _amount, _message, _nonce));
    }

    /**
     * @dev Converts a hash into an Ethereum Signed Message hash.
     * @param _messageHash The original hash.
     * @return The Ethereum Signed Message hash.
     */
    function getEthSignedMessageHash(
        bytes32 _messageHash
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    _messageHash
                )
            );
    }

    /**
     * @dev Allows users to withdraw tokens using an off-chain signature.
     * @param caller Address of the user withdrawing tokens.
     * @param amount Amount of tokens to withdraw.
     * @param nonce Unique nonce for the withdrawal.
     * @param message Additional withdrawal details.
     * @param expiry Expiry timestamp for the signature.
     * @param signature Off-chain signature validating the withdrawal.
     */
    function withdrawWithSignature(
        address caller,
        uint256 amount,
        uint256 nonce,
        string memory message,
        uint256 expiry,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(block.timestamp <= expiry, "Signature expired");
        require(!usedNonces[caller][nonce], "Nonce already used");
        require(
            tmkocToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        require(trustedSigner != address(0), "Trusted signer not set");

        usedNonces[caller][nonce] = true;

        bytes32 messageHash = getMessageHash(caller, amount, message, nonce);

        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);

        // Recover the signer using ECDSA.recover
        // ECDSA.recover(ethSignedHash, signature) == trustedSigner;
        address recoverSinger = ECDSA.recover(ethSignedHash, signature);
        require(recoverSinger == trustedSigner,"Invalid signature");

        require(tmkocToken.transfer(caller, amount), "Transfer failed");
        emit WithdrawalWithSignature(caller, amount, nonce);
    }

      /**
     * @dev Generates a hash of the withdrawal message.
     * @param _to Address of the user where amount is withdrawing.
     * @param _amount Amount of tokens to withdraw.
     * @return The hashed withdrawal message.
     */
    function getMessageHashForOwnerWithdrawal(
        address _to,
        uint256 _amount,
        address _thisContract
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_to, _amount, _thisContract));
    }

   
    // function emergencyWithdrawMultiSig(
    //     address to,
    //     uint256 amount,
    //     uint256 expiry,
    //     bytes[] calldata signatures
    // ) external nonReentrant whenNotPaused {
    //     require(to != address(0), "Invalid 'to' address");
    //     require(amount > 0, "Amount must be > 0");
    //     require(
    //         tmkocToken.balanceOf(address(this)) >= amount,
    //         "Insufficient balance"
    //     );
 
    //     require(block.timestamp <= expiry, "Signature expired");

    //     // Create the message hash that owners must have signed:
    //     // Contract address to avoid cross-contract replay
    //     bytes32 messageHash = keccak256(
    //         abi.encodePacked("EMERGENCY_WITHDRAW", to, amount, address(this))
    //     );
    //     bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);

    //     // Track which owners have signed (avoid double-counting the same owner)
    //     uint256 validSignatures = 0;
       
    //     bool[] memory seenSigners = new bool[](multiSigOwners.length);

    //     // Limit the number of signatures to the number of multi-sig owners
    //     require(
    //         signatures.length <= multiSigOwners.length,
    //         "Too many signatures"
    //     );

    //     for (uint256 i = 0; i < signatures.length; i++) {
    //         address signer = ECDSA.recover(ethSignedHash, signatures[i]);
    //         for (uint256 j = 0; j < multiSigOwners.length; j++) {
    //             if (multiSigOwners[j] == signer && !seenSigners[j]) {
    //                 seenSigners[j] = true;
    //                 validSignatures++;
    //                 break; // Exit inner loop early for efficiency
    //             }
    //         }
    //     }

    //     require(
    //         validSignatures >= minApprovals,
    //         "Not enough valid owner signatures"
    //     );

    //     // Now execute the emergency withdrawal
    //     bool success = tmkocToken.transfer(to, amount);
    //     require(success, "Transfer failed");

    //     emit EmergencyWithdrawal(to, amount);
    // }

     // Emergency Withdraw with Multi-Signature Approval
    function emergencyWithdraw(
        address to,
        uint256 amount,
        bytes[] calldata signatures
    ) external onlyOwner nonReentrant whenNotPaused {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be > 0");
        require(
            tmkocToken.balanceOf(address(this)) >= amount,
            "Insufficient balance"
        );
        require(
            signatures.length >= minApprovals,
            "Not enough valid owner signatures"
        );

        // bytes32 messageHash = keccak256(
        //     abi.encodePacked(to, amount, address(this))
        // );
        // bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(messageHash);

        bytes32 messageHash = getMessageHashForOwnerWithdrawal(to, amount, address(this));
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);

        // Validate signatures
        uint256 validSignatures = 0;
        bool[] memory hasSigned = new bool[](multiSigOwners.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ECDSA.recover(ethSignedHash, signatures[i]);
            for (uint256 j = 0; j < multiSigOwners.length; j++) {
                if (
                    multiSigOwners[j] == signer &&
                    !hasSigned[j]
                ) {
                    hasSigned[j] = true;
                    validSignatures++;
                    break;
                }
            }
        }

        require(validSignatures >= minApprovals, "Not enough valid signatures");

        // Execute the withdrawal
        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        emit EmergencyWithdrawal(to, amount);
    }

    // Withdraw Tournament Fee with Multi-Signature Approval
    function withdrawTournamentFee(
        address to,
        uint256 amount,
        bytes[] calldata signatures
    ) external onlyOwner nonReentrant whenNotPaused {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be > 0");
        require(
            totalTournamentFees >= amount,
            "Insufficient tournament fees"
        );
        require(
            signatures.length >= minApprovals,
            "Not enough valid owner signatures"
        );

        // bytes32 messageHash = keccak256(
        //     abi.encodePacked(to, amount, address(this))
        // );
        // bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(messageHash);
        bytes32 messageHash = getMessageHashForOwnerWithdrawal(to, amount, address(this));
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);
        console.log("hash ");
        console.logBytes32(ethSignedHash);

        // Validate signatures
        uint256 validSignatures = 0;
        bool[] memory hasSigned = new bool[](multiSigOwners.length);


        console.log("valid signature");
        console.log(validSignatures);

        for (uint256 i = 0; i < signatures.length; i++) {
        console.log("sig");
        console.logBytes(signatures[i]);
        // address signer = recoverSigner(ethSignedHash, signatures[i]);
        address signer = ECDSA.recover(ethSignedHash, signatures[i]);
            // address signer = ;
            console.log("singer");
            console.log(signer);
            for (uint256 j = 0; j < multiSigOwners.length; j++) {
                if (
                     signer == multiSigOwners[j] &&
                    !hasSigned[j]
                ) {
                    console.log("inside if");
                    hasSigned[j] = true;
                    validSignatures++;
                    break;
                }
            }
        }
        console.log("valid signature");
        console.log(validSignatures);
        console.log(minApprovals);
        require(validSignatures >= minApprovals, "Not enough valid signatures");

        // Deduct from tournament fees
        totalTournamentFees -= amount;

        // Execute the withdrawal
        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        // emit TournamentFeeWithdrawal(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // function verify(
    //     address _signer,
    //     address _to,
    //     uint256 _amount,
    //     string memory _message,
    //     uint256 _nonce,
    //     bytes memory signature
    // ) public pure returns (bool) {
    //     bytes32 messageHash = getMessageHash(_to, _amount, _message, _nonce);
    //     bytes32 ethSignedMessageHash = getEthSignedMessageHash(messageHash);

    //     return recoverSigner(ethSignedMessageHash, signature) == _signer;
    // }

    // function recoverSigner(
    //     bytes32 _ethSignedMessageHash,
    //     bytes memory _signature
    // ) public pure returns (address) {
    //     (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);

    //     return ecrecover(_ethSignedMessageHash, v, r, s);
    // }

    // function splitSignature(bytes memory sig)
    //     public
    //     pure
    //     returns (bytes32 r, bytes32 s, uint8 v)
    // {
    //     require(sig.length == 65, "invalid signature length");

    //     assembly {
    //         /*
    //         First 32 bytes stores the length of the signature

    //         add(sig, 32) = pointer of sig + 32
    //         effectively, skips first 32 bytes of signature

    //         mload(p) loads next 32 bytes starting at the memory address p into memory
    //         */

    //         // first 32 bytes, after the length prefix
    //         r := mload(add(sig, 32))
    //         // second 32 bytes
    //         s := mload(add(sig, 64))
    //         // final byte (first byte of the next 32 bytes)
    //         v := byte(0, mload(add(sig, 96)))
    //     }

    //     // implicitly return (r, s, v)
    // }
}
