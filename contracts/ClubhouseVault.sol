// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title ClubhouseVault
/// @author Neela Mediatech Private Limited
/// @notice Manages ERC20 token deposits, withdrawals with off-chain signatures,
/// and multi-signature emergency withdrawals.
/// @dev Designed for secure and scalable tournament fee collection and payouts.
contract ClubhouseVault is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;

    /// @notice ERC20 token managed by the vault
    IERC20 public tmkocToken;

    /// @notice Address authorized to sign off-chain user withdrawal requests
    address public trustedSigner;

    /// @notice Total tournament fees collected
    uint256 public totalTournamentFees;

    /// @dev Tracks used nonces for user withdrawals to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @dev Mapping of valid multi-signature signers
    mapping(address => bool) public isMultiSigOwner;

    /// @notice Multi-signature owners for emergency withdrawals
    address[] public multiSigOwners;

    /// @notice Minimum number of approvals required for multi-signature actions
    uint256 public minApprovals;

    /// @notice Event emitted when tokens are deposited into the vault
    /// @param user The address of the user depositing the tokens
    /// @param amount The amount of tokens deposited
    event TokensDeposited(address indexed user, uint256 amount);

    /// @notice Event emitted when a user withdraws tokens using a signature
    /// @param user The address of the user withdrawing tokens
    /// @param amount The amount withdrawn
    /// @param nonce The nonce used in the withdrawal
    event WithdrawalWithSignature(
        address indexed user,
        uint256 amount,
        uint256 nonce
    );

    /// @notice Event emitted when tournament fees are collected
    /// @param amount The amount of tournament fees collected
    event TournamentFeesCollected(uint256 amount);

    /// @notice Event emitted when tournament fees are withdrawn
    /// @param to The address receiving the tournament fees
    /// @param amount The amount of tournament fees withdrawn
    event TournamentFeesWithdrawn(address indexed to, uint256 amount);

    /// @notice Event emitted during an emergency withdrawal
    /// @param to The address receiving the withdrawn tokens
    /// @param amount The amount of tokens withdrawn
    event EmergencyWithdrawal(address indexed to, uint256 amount);

    /// @notice Event emitted when the trusted signer is updated
    /// @param oldSigner The address of the previous trusted signer
    /// @param newSigner The address of the new trusted signer
    event TrustedSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );

    /// @notice Event emitted when multi-signature owners are updated
    /// @param newOwners The list of updated multi-signature owners
    /// @param minApprovals The minimum number of approvals required
    event MultiSigOwnersUpdated(address[] newOwners, uint256 minApprovals);

    /// @param _tokenAddress Address of the ERC20 token managed by this vault
    /// @dev Sets the token address and initializes ownership
    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
        tmkocToken = IERC20(_tokenAddress);
    }

    /// @notice Sets multi-signature owners and minimum approvals
    /// @dev Resets previous owners and sets the new ones
    /// @param owners List of multi-signature owners
    /// @param _minApprovals Minimum number of required approvals
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

        for (uint256 i = 0; i < multiSigOwners.length; i++) {
            isMultiSigOwner[multiSigOwners[i]] = false;
        }

        for (uint256 i = 0; i < owners.length; i++) {
            isMultiSigOwner[owners[i]] = true;
        }

        multiSigOwners = owners;
        minApprovals = _minApprovals;

        emit MultiSigOwnersUpdated(owners, _minApprovals);
    }

    /// @notice Updates the trusted signer for withdrawals
    /// @dev This function allows the owner to update the address of the trusted signer
    /// used to validate off-chain withdrawal requests.
    /// @param _trustedSigner Address of the new trusted signer
    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        require(_trustedSigner != address(0), "Invalid signer address");
        emit TrustedSignerUpdated(trustedSigner, _trustedSigner);
        trustedSigner = _trustedSigner;
    }

    /// @notice Allows users to deposit tokens into the vault
    /// @dev This function securely transfers tokens from the caller (msg.sender) to the vault contract.
    /// It requires the contract to be unpaused and ensures the deposit amount is greater than zero.
    /// @param amount Amount of tokens being deposited
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(msg.sender != address(0), "Invalid sender address");
        require(amount > 0, "Amount must be greater than 0");

        // Transfer tokens from msg.sender to the vault
        bool success = tmkocToken.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Transfer failed");

        emit TokensDeposited(msg.sender, amount);
    }

    /// @notice Collects tournament fees into the contract
    /// @dev This function increments the total tournament fees by the specified amount.
    /// Only the contract owner can call this function, and the amount must be greater than zero.
    /// @param amount Amount to collect as tournament fees
    function collectTournamentFee(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        totalTournamentFees += amount;
        emit TournamentFeesCollected(amount);
    }

    /// @notice Generates a hash for a withdrawal request
    /// @dev This function creates a unique hash for a withdrawal request by encoding
    /// the caller address, amount, message, and nonce. It is used to verify off-chain signatures.
    /// @param _caller Address requesting withdrawal
    /// @param _amount Amount to withdraw
    /// @param _message Additional withdrawal details
    /// @param _nonce Unique nonce to prevent replay attacks
    /// @return The hash of the withdrawal message
    function getMessageHash(
        address _caller,
        uint256 _amount,
        string memory _message,
        uint256 _nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_caller, _amount, _message, _nonce));
    }

    /// @notice Converts a hash into the Ethereum Signed Message hash format
    /// @dev Converts a hash into an Ethereum Signed Message hash.
    /// @param _messageHash The original hash.
    /// @return The Ethereum Signed Message hash.
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

    /// @notice Allows users to withdraw tokens using an off-chain signature.
    /// @dev This function verifies the off-chain signature using the trusted signer,
    /// ensures the nonce is unique, and checks that the signature has not expired.
    /// It also validates the contract's token balance before transferring the tokens.
    /// @param recipient Address of the user withdrawing tokens.
    /// @param amount Amount of tokens to withdraw.
    /// @param nonce Unique nonce for the withdrawal.
    /// @param message Additional withdrawal details.
    /// @param expiry Expiry timestamp for the signature.
    /// @param signature Off-chain signature validating the withdrawal.
    function withdrawWithSignature(
        address recipient,
        uint256 amount,
        uint256 nonce,
        string memory message,
        uint256 expiry,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(block.timestamp <= expiry, "Signature expired");
        require(!usedNonces[recipient][nonce], "Nonce already used");
        require(
            tmkocToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        require(trustedSigner != address(0), "Trusted signer not set");

        usedNonces[recipient][nonce] = true;

        bytes32 messageHash = getMessageHash(recipient, amount, message, nonce);
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);
        address recoverSigner = ECDSA.recover(ethSignedHash, signature);

        require(recoverSigner == trustedSigner, "Invalid signature");
        require(tmkocToken.transfer(recipient, amount), "Transfer failed");

        emit WithdrawalWithSignature(recipient, amount, nonce);
    }

    /// @notice Generates a hash of the withdrawal message.
    /// @dev This function creates a unique hash for an owner-authorized withdrawal
    /// by encoding the recipient address, amount, and the contract address.
    /// @param _to Address of the user where amount is withdrawing.
    /// @param _amount Amount of tokens to withdraw.
    /// @param _thisContract Address of the contract initiating the withdrawal.
    /// @return The hashed withdrawal message.
    function getMessageHashForOwnerWithdrawal(
        address _to,
        uint256 _amount,
        address _thisContract
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_to, _amount, _thisContract));
    }

    /// @notice Allows emergency withdrawal of tokens with multi-signature approval
    /// @dev This function facilitates emergency withdrawals by requiring a minimum number
    /// of valid signatures from multi-signature owners. It validates the recipient address,
    /// ensures the contract has sufficient balance, and verifies the signatures.
    /// @param to Address receiving the withdrawn tokens
    /// @param amount Amount to withdraw
    /// @param signatures Signatures from multi-signature owners
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

        bytes32 messageHash = getMessageHashForOwnerWithdrawal(
            to,
            amount,
            address(this)
        );
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);

        uint256 validSignatures = 0;
        bool[] memory hasSigned = new bool[](multiSigOwners.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ECDSA.recover(ethSignedHash, signatures[i]);
            for (uint256 j = 0; j < multiSigOwners.length; j++) {
                if (multiSigOwners[j] == signer && !hasSigned[j]) {
                    hasSigned[j] = true;
                    validSignatures++;
                    break;
                }
            }
        }

        require(validSignatures >= minApprovals, "Not enough valid signatures");

        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        emit EmergencyWithdrawal(to, amount);
    }

    /// @notice Allows the owner to withdraw tournament fees with multi-signature approval.
    /// @dev This function ensures that the withdrawal of tournament fees is secure by
    /// requiring a minimum number of valid signatures from multi-signature owners.
    /// It also checks the contract's tournament fee balance and verifies the recipient address.
    /// @param to Address receiving the withdrawn tokens.
    /// @param amount Amount of tournament fees to withdraw.
    /// @param signatures Array of signatures from approved multi-signature owners.
    function withdrawTournamentFee(
        address to,
        uint256 amount,
        bytes[] calldata signatures
    ) external onlyOwner nonReentrant whenNotPaused {
        require(to != address(0), "Invalid recipient address");
        require(amount > 0, "Amount must be > 0");
        require(totalTournamentFees >= amount, "Insufficient tournament fees");
        require(
            signatures.length >= minApprovals,
            "Not enough valid owner signatures"
        );

        bytes32 messageHash = getMessageHashForOwnerWithdrawal(
            to,
            amount,
            address(this)
        );
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);

        uint256 validSignatures = 0;
        bool[] memory hasSigned = new bool[](multiSigOwners.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ECDSA.recover(ethSignedHash, signatures[i]);
            for (uint256 j = 0; j < multiSigOwners.length; j++) {
                if (signer == multiSigOwners[j] && !hasSigned[j]) {
                    hasSigned[j] = true;
                    validSignatures++;
                    break;
                }
            }
        }

        require(validSignatures >= minApprovals, "Not enough valid signatures");

        totalTournamentFees -= amount;

        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        emit TournamentFeesWithdrawn(to, amount);
    }

    /// @notice Pauses the contract
    /// @dev This function disables critical operations by activating the Pausable mechanism.
    /// Only callable by the contract owner.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    /// @dev This function re-enables critical operations by deactivating the Pausable mechanism.
    /// Only callable by the contract owner.
    function unpause() external onlyOwner {
        _unpause();
    }
}
