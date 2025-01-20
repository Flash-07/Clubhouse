// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ClubhouseVault is ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    IERC20 public tmkocToken;

    // Address that signs off-chain user withdrawals
    address public trustedSigner;

    // Additional multi-sig owners for emergency withdraw
    address[] public multiSigOwners;
    uint256 public minApprovals; // e.g., 2 out of 3

    uint256 public totalTournamentFees; // Tracks total tournament fees collected
    mapping(address => uint256) public depositedTokens;
    mapping(uint256 => bool) public usedNonces;

    event TokensDeposited(address indexed user, uint256 amount);
    event WinningWithdrawn(address indexed user, uint256 amount);
    event WithdrawalWithSignature(address indexed user, uint256 amount, uint256 nonce);
    event TournamentFeesCollected(uint256 amount);
    event TournamentFeesWithdrawn(address indexed admin, uint256 amount);
    event DebugRecoveredSigner(address recoveredSigner);
    event DebugMessageHash(bytes32 messageHash);
    event DebugEthSignedHash(bytes32 ethSignedHash);

    // event EmergencyWithdrawal(address indexed to, uint256 amount);
    // event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);

    // Multi-sig events
    event EmergencyWithdrawal(address indexed to, uint256 amount);
    event TrustedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event MultiSigOwnersUpdated(address[] newOwners, uint256 minApprovals);

    constructor(address _tokenAddress) Ownable(msg.sender) {
        tmkocToken = IERC20(_tokenAddress);
    }

    /**
     * @dev Sets the addresses for multi-sig owners and the minimum approvals needed.
     *      Callable only by the primary owner (from Ownable).
     */
    function setMultiSigOwners(address[] calldata owners, uint256 _minApprovals) 
        external 
        onlyOwner 
    {
        require(owners.length > 0, "No owners provided");
        require(_minApprovals > 0 && _minApprovals <= owners.length, "Invalid minApprovals");
        
        // In practice, you'd likely clean up old owners or handle carefully
        multiSigOwners = owners;
        minApprovals = _minApprovals;

        emit MultiSigOwnersUpdated(owners, _minApprovals);
    }

    /**
     * @dev Utility to check if an address is in multiSigOwners
     */
    function _isMultiSigOwner(address account) internal view returns (bool) {
        for (uint256 i = 0; i < multiSigOwners.length; i++) {
            if (multiSigOwners[i] == account) {
                return true;
            }
        }
        return false;
    }

    // Setting the Trusted Signer
    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        require(_trustedSigner != address(0), "Invalid signer address");
        emit TrustedSignerUpdated(trustedSigner, _trustedSigner);
        trustedSigner = _trustedSigner;
    }

    // Deposit Tokens
    function deposit(address caller, uint256 amount) external nonReentrant{
        require(amount > 0, "Amount must be greater than 0");
        require(caller != address(0), "Invalid recipient address");
        bool success = tmkocToken.transferFrom(caller, address(this), amount);
        require(success, "Transfer failed");
        depositedTokens[caller] += amount;
        emit TokensDeposited(caller, amount);
    }

    // Collect Tournament Fee
    function collectTournamentFee(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be greater than 0");
        totalTournamentFees += amount;
        emit TournamentFeesCollected(amount);
    }

    // Withdraw Tournament Tokens
    function withdrawTournamentFees(address to, uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= totalTournamentFees, "Insufficient tournament fees");
        totalTournamentFees -= amount;
        // depositedTokens[to] -= amount;
        tmkocToken.transfer(to, amount);
        emit TournamentFeesWithdrawn(to, amount);
    }

    // Helper function to convert a hash to Ethereum signed message hash
    function toEthSignedMessageHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
        );
    }

    // Helper function to replicate the exact hash required by withdrawWithSignature
    //-------------------------------------------------------------------------

    /**
     * @dev Returns the Ethereum Signed Message hash that must be signed off-chain
     *      by the `trustedSigner` to authorize a withdrawal.
     *
     * @param user   The address that will call `withdrawWithSignature`.
     * @param amount The token amount to withdraw.
     * @param nonce  A unique nonce to prevent replay attacks.
     * @param expiry The timestamp by which this signature expires.
     *
     * Off-chain, the `trustedSigner` should sign this returned hash. Then the user
     * passes that signature to `withdrawWithSignature(...)`.
     */
    function getWithdrawWithSignatureHash(
        address user,
        uint256 amount,
        uint256 nonce,
        uint256 expiry
    ) external view returns (bytes32) {
        // Step 1: Same raw message as `withdrawWithSignature` uses
        bytes32 messageHash = keccak256(
            abi.encodePacked(user, amount, nonce, expiry, address(this))
        );

        // Step 2: Convert to an Ethereum Signed Message
        return toEthSignedMessageHash(messageHash);
    }

    // Withdraw Winnings
    function withdrawWithdrawableWinning(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(
            tmkocToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        require(tmkocToken.transfer(msg.sender, amount), "Transfer failed");
        emit WinningWithdrawn(msg.sender, amount);
    }

    // Withdraw Winning by Signature
    function withdrawWithSignature(
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= expiry, "Signature expired");
        require(!usedNonces[nonce], "Nonce already used");
        require(
            tmkocToken.balanceOf(address(this)) >= amount,
            "Insufficient contract balance"
        );
        require(trustedSigner != address(0), "Trusted signer not set");

        usedNonces[nonce] = true;

        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, amount, nonce, expiry, address(this))
        );

        bytes32 ethSignedHash = toEthSignedMessageHash(messageHash);

        // Recover the signer using ECDSA.recover
        address signer = ECDSA.recover(ethSignedHash, signature);
        emit DebugRecoveredSigner(signer); // Log recovered signer
        require(signer == trustedSigner, "Invalid signature");

        require(tmkocToken.transfer(msg.sender, amount), "Transfer failed");

        emit WithdrawalWithSignature(msg.sender, amount, nonce);
    }

    // Emergency Withdrawal
    // function emergencyWithdraw(address to, uint256 amount) external onlyOwner nonReentrant{
    //     require(amount > 0, "Amount must be greater than 0");
    //     require(tmkocToken.balanceOf(address(this)) >= amount, "Insufficient balance");
    //     tmkocToken.transfer(to, amount);
    //     emit EmergencyWithdrawal(to, amount);
    // }

    /**
     * @dev Multi-sig version of emergencyWithdraw. Instead of letting a single
     *      owner call it, we require multiple owners to sign off-chain, then 
     *      submit their signatures on-chain.
     */
    function emergencyWithdrawMultiSig(
        address to,
        uint256 amount,
        bytes[] calldata signatures
    ) external nonReentrant {
        require(to != address(0), "Invalid 'to' address");
        require(amount > 0, "Amount must be > 0");
        require(tmkocToken.balanceOf(address(this)) >= amount, "Insufficient balance");
        require(minApprovals > 0 && minApprovals <= multiSigOwners.length, "Multi-sig not set");

        // Create the message hash that owners must have signed:
        // We might include the contract address to avoid cross-contract replay
        bytes32 messageHash = keccak256(
            abi.encodePacked("EMERGENCY_WITHDRAW", to, amount, address(this))
        );
        bytes32 ethSignedHash = toEthSignedMessageHash(messageHash);

        // Track which owners have signed (avoid double-counting the same owner)
        uint256 validSignatures;
        address[] memory seenOwners = new address[](multiSigOwners.length);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ECDSA.recover(ethSignedHash, signatures[i]);
            // Must be one of the multiSigOwners
            if (_isMultiSigOwner(signer)) {
                // Check we haven't already counted this owner
                bool alreadyCounted = false;
                for (uint256 j = 0; j < validSignatures; j++) {
                    if (seenOwners[j] == signer) {
                        alreadyCounted = true;
                        break;
                    }
                }
                if (!alreadyCounted) {
                    seenOwners[validSignatures] = signer;
                    validSignatures++;
                }
            }
        }

        require(validSignatures >= minApprovals, "Not enough valid owner signatures");

        // Now execute the emergency withdrawal
        bool success = tmkocToken.transfer(to, amount);
        require(success, "Transfer failed");

        emit EmergencyWithdrawal(to, amount);
    }

    // Helper function for testing of emergencyWithdrwal
    function getEmergencyWithdrawHash(
    address to,
    uint256 amount
    ) external view returns (bytes32) {
    // Create the same messageHash as in emergencyWithdrawMultiSig
    bytes32 messageHash = keccak256(
        abi.encodePacked("EMERGENCY_WITHDRAW", to, amount, address(this))
    );

    // Convert it to the Ethereum Signed Message Hash
    return toEthSignedMessageHash(messageHash);
}

function getBalance(address user) external view returns (uint256) {
        return tmkocToken.balanceOf(user);
    }

    function contractBalance() external view returns (uint256) {
        return tmkocToken.balanceOf(address(this));
    }

}