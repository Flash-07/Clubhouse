// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title ClubhouseVault
/// @author Neela Mediatech Private Limited
/// @notice Manages ERC20 token deposits and withdrawals with off-chain signatures.
/// @dev Designed for secure and scalable tournament fee collection and payouts.
contract ClubhouseLogic is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;

    /// @notice ERC20 token managed by the vault
    IERC20 public tmkocToken;

    /// @notice Address authorized to sign off-chain user withdrawal requests
    address public trustedSigner;

    /// @dev Tracks used nonces for user withdrawals to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) public usedNonces;

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

    /// @notice Event emitted when the trusted signer is updated
    /// @param oldSigner The address of the previous trusted signer
    /// @param newSigner The address of the new trusted signer
    event TrustedSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );

    /// @param _tokenAddress Address of the ERC20 token managed by this vault
    /// @dev Sets the token address and initializes ownership
    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
        tmkocToken = IERC20(_tokenAddress);
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
