// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClubhouseVault
 * @dev Manages ERC20 token deposits, withdrawals with off-chain signatures,
 * and multi-signature emergency withdrawals. Designed for secure and scalable
 * tournament fee collection and payouts.
 */
contract ClubhouseVault is ReentrancyGuard, Ownable, Pausable {
    using ECDSA for bytes32;

    /// ERC20 token managed by the vault
    IERC20 public tmkocToken;

    /// Authorized signer for user withdrawals
    address public trustedSigner;

    /// Total tournament fees collected
    uint256 public totalTournamentFees;

    /// Tracks used nonces to prevent replay attacks
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// Mapping of valid multi-signature signers
    mapping(address => bool) public isMultiSigOwner;

    /// Multi-signature owners for emergency withdrawals
    address[] public multiSigOwners;

    /// Minimum number of approvals required for multi-signature actions
    uint256 public minApprovals;

    /// Events for logging key actions and changes
    event TokensDeposited(address indexed user, uint256 amount);
    event WithdrawalWithSignature(
        address indexed user,
        uint256 amount,
        uint256 nonce
    );
    event TournamentFeesCollected(uint256 amount);
    event TournamentFeesWithdrawn(address indexed to, uint256 amount);
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event TrustedSignerUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );
    event MultiSigOwnersUpdated(address[] newOwners, uint256 minApprovals);

    /**
     * @dev Initializes the contract with the specified ERC20 token address.
     * @param _tokenAddress Address of the ERC20 token contract.
     */
    constructor(address _tokenAddress) Ownable(msg.sender) {
        require(_tokenAddress != address(0), "Invalid token address");
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

        /// Clear previous multi-signature owners
        for (uint256 i = 0; i < multiSigOwners.length; i++) {
            isMultiSigOwner[multiSigOwners[i]] = false;
        }

        /// Update the owners and mapping
        for (uint256 i = 0; i < owners.length; i++) {
            isMultiSigOwner[owners[i]] = true;
        }

        multiSigOwners = owners;
        minApprovals = _minApprovals;

        emit MultiSigOwnersUpdated(owners, _minApprovals);
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
    function deposit(
        address caller,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(caller != address(0), "Invalid recipient address");

        bool success = tmkocToken.transferFrom(caller, address(this), amount);
        require(success, "Transfer failed");

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

        /// Generate and verify the signature hash
        bytes32 messageHash = getMessageHash(caller, amount, message, nonce);
        bytes32 ethSignedHash = getEthSignedMessageHash(messageHash);
        address recoverSigner = ECDSA.recover(ethSignedHash, signature);
        require(recoverSigner == trustedSigner, "Invalid signature");

        /// Execute the token transfer
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

    /**
     * @dev Allows the owner to perform an emergency withdrawal with multi-signature approval.
     * @param to Address receiving the withdrawn tokens.
     * @param amount Amount to withdraw.
     * @param signatures Array of signatures from approved multi-signature owners.
     */
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

        /// Verify the multi-signature approvals
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

        /// Execute the withdrawal
        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        emit EmergencyWithdrawal(to, amount);
    }

    /**
     * @dev Allows the owner to withdraw tournament fees with multi-signature approval.
     * @param to Address receiving the withdrawn tokens.
     * @param amount Amount of tournament fees to withdraw.
     * @param signatures Array of signatures from approved multi-signature owners.
     */
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

        /// Validate signatures
        uint256 validSignatures = 0;
        bool[] memory hasSigned = new bool[](multiSigOwners.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            /// address signer = recoverSigner(ethSignedHash, signatures[i]);
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

        /// Deduct from tournament fees
        totalTournamentFees -= amount;

        /// Execute the withdrawal
        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        /// Emit an event to log the successful withdrawal
        emit TournamentFeesWithdrawn(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
