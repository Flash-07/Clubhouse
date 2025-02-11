// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title TaarakMehtaKaOoltahChashmash Token (TMKOC)
 * @dev A globally tradable ERC20 token with in-game utility, supporting permit-based approvals.
 * @notice This token is designed for seamless integration into gaming ecosystems and trading platforms.
 */

contract TaarakMehtaKaOoltahChashmash is ERC20, ERC20Permit {

    /**
     * @notice Deploys the TMKOC token with a predefined total supply.
     * @dev Mints the total supply to the contract deployer's address.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     * @param totalSupply_ The total supply of tokens to be minted initially.
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 totalSupply_
    ) ERC20(name, symbol) ERC20Permit(name) {
        _mint(msg.sender, totalSupply_);
    }
}