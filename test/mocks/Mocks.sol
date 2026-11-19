// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test double for the SPACE ID Agent ID registry. Mimics the
///         verified on-chain behaviour AgentFair relies on: balanceOf is
///         1 for a holder and 0 otherwise, handleOf returns the holder's
///         handle or "" for a non-holder, one handle per address and one
///         address per handle.
contract MockAgentIDRegistry {
    mapping(address => string) private _handles;
    mapping(bytes32 => address) private _owners;

    function register(address user, string calldata handle) external {
        require(bytes(_handles[user]).length == 0, "address already has handle");
        bytes32 key = keccak256(bytes(handle));
        require(_owners[key] == address(0), "handle taken");
        _handles[user] = handle;
        _owners[key] = user;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return bytes(_handles[owner]).length > 0 ? 1 : 0;
    }

    function handleOf(address owner) external view returns (string memory) {
        return _handles[owner];
    }
}

/// @notice Minimal mintable ERC-20 for tests.
contract MockERC20 {
    string public name = "Mock Token";
    string public symbol = "MOCK";
    uint8 public decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
