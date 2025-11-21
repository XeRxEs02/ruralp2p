// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/*
 * @title RuralConnectLoan
 * @dev A blockchain-based peer-to-peer loan management contract
 * designed for rural finance — includes document verification,
 * loan creation, repayment, and event logging.
 */

contract RuralConnectLoan {

    // Structure to store loan details
    struct Loan {
        uint256 loanId;
        address borrower;
        address lender;
        uint256 amount;
        uint256 dueDate;
        bool repaid;
        string documentHash;
        uint256 createdAt;
        uint256 repaidAt;
        string purpose;
        uint256 interestRate;
    }

    // Structure to store asset details
    struct Asset {
        uint256 assetId;
        address owner;
        string assetType;
        uint256 estimatedValue;
        string assetHash;
        bool isTokenized;
        uint256 tokenId;
        uint256 createdAt;
    }

    // Structure to store identity details
    struct Identity {
        address userAddress;
        string identityHash;
        string documentType;
        bool isVerified;
        uint256 verifiedAt;
    }

    // Structure to store payment details
    struct Payment {
        uint256 paymentId;
        uint256 loanId;
        address payer;
        uint256 amount;
        uint256 timestamp;
        string transactionHash;
        string paymentType;
    }

    // Counters and storage
    uint256 public loanCounter;
    uint256 public assetCounter;
    uint256 public identityCounter;
    uint256 public paymentCounter;

    mapping(uint256 => Loan) public loans;
    mapping(uint256 => Asset) public assets;
    mapping(bytes32 => Identity) public identities;
    mapping(uint256 => Payment) public payments;

    // Events for frontend/backend listening
    event LoanCreated(uint256 indexed loanId, address indexed borrower, address indexed lender, uint256 amount, string purpose);
    event LoanRepaid(uint256 indexed loanId, address indexed lender, uint256 amount);
    event DocumentVerified(string documentHash, bool verified);
    event AssetTokenized(uint256 indexed assetId, address indexed owner, uint256 tokenId, uint256 value);
    event IdentityVerified(address indexed userAddress, string identityHash, string documentType);
    event PaymentRecorded(uint256 indexed paymentId, uint256 indexed loanId, address indexed payer, uint256 amount, string paymentType);

    /**
     * @dev Create a new loan
     * @param _borrower The borrower’s wallet address
     * @param _lender The lender’s wallet address
     * @param _amount Loan amount (in wei)
     * @param _dueDate UNIX timestamp for due date
     * @param _docHash Hashed value of uploaded document
     * @param _purpose Loan purpose
     * @param _interestRate Interest rate in basis points
     */
    function createLoan(
        address _borrower,
        address _lender,
        uint256 _amount,
        uint256 _dueDate,
        string memory _docHash,
        string memory _purpose,
        uint256 _interestRate
    ) public {
        require(_borrower != address(0), "Invalid borrower address");
        require(_lender != address(0), "Invalid lender address");
        require(_amount > 0, "Loan amount must be positive");

        loanCounter++;
        loans[loanCounter] = Loan({
            loanId: loanCounter,
            borrower: _borrower,
            lender: _lender,
            amount: _amount,
            dueDate: _dueDate,
            repaid: false,
            documentHash: _docHash,
            createdAt: block.timestamp,
            repaidAt: 0,
            purpose: _purpose,
            interestRate: _interestRate
        });

        emit LoanCreated(loanCounter, _borrower, _lender, _amount, _purpose);
    }

    /**
     * @dev Approve a loan - can be called by anyone (in real implementation, would be restricted)
     * @param _loanId ID of the loan to approve
     */
    function approveLoan(uint256 _loanId) public {
        Loan storage loan = loans[_loanId];
        require(!loan.repaid, "Loan already repaid");
        // In a real implementation, you might want to add approval logic here
        // For now, anyone can approve any loan
        emit LoanRepaid(_loanId, msg.sender, 0); // Using existing event for compatibility
    }

    /**
     * @dev Mark a loan as repaid — only the lender can do this.
     * @param _loanId ID of the loan
     * @param _repaymentAmount Amount being repaid
     */
    function markRepaid(uint256 _loanId, uint256 _repaymentAmount) public {
        Loan storage loan = loans[_loanId];
        require(loan.lender == msg.sender, "Only lender can mark as repaid");
        require(!loan.repaid, "Loan already repaid");

        loan.repaid = true;
        loan.repaidAt = block.timestamp;
        emit LoanRepaid(_loanId, msg.sender, _repaymentAmount);
    }

    /**
     * @dev Get loan details by ID
     * @param _loanId Loan ID
     * @return Loan struct containing all details
     */
    function getLoan(uint256 _loanId) public view returns (Loan memory) {
        require(_loanId > 0 && _loanId <= loanCounter, "Invalid loan ID");
        return loans[_loanId];
    }

    /**
     * @dev Verify a document hash against stored loan documents.
     * Emits event for logging.
     * @param _documentHash Hash of document to verify
     * @return bool Whether document exists or not
     */
    function verifyDocument(string memory _documentHash) public returns (bool) {
        bool exists = false;
        for (uint256 i = 1; i <= loanCounter; i++) {
            if (
                keccak256(abi.encodePacked(loans[i].documentHash))
                == keccak256(abi.encodePacked(_documentHash))
            ) {
                exists = true;
                break;
            }
        }
        emit DocumentVerified(_documentHash, exists);
        return exists;
    }

    /**
     * @dev View-only version of verifyDocument (no gas, no event)
     */
    function checkDocument(string memory _documentHash) public view returns (bool) {
        for (uint256 i = 1; i <= loanCounter; i++) {
            if (
                keccak256(abi.encodePacked(loans[i].documentHash))
                == keccak256(abi.encodePacked(_documentHash))
            ) {
                return true;
            }
        }
        return false;
    }
}
