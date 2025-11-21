/**
 * Gale-Shapley Stable Matching Algorithm
 * For matching lenders with borrowers based on preferences
 * Ensures stable matching where no lender-borrower pair would prefer each other over their current matches
 */

/**
 * Borrower class for matching algorithm
 */
class Borrower {
  constructor(id, name, loanAmount, interestRate, riskScore, preferences = []) {
    this.id = id;
    this.name = name;
    this.loanAmount = loanAmount;
    this.interestRate = interestRate;
    this.riskScore = riskScore; // 0-1, lower is better
    this.preferences = preferences; // Array of lender IDs in order of preference
    this.currentMatch = null;
    this.matchHistory = [];
  }

  /**
   * Calculate compatibility score with a lender
   */
  getCompatibilityScore(lender) {
    let score = 0;

    // Amount compatibility - lender must be able to cover at least some portion
    const canCoverAmount = lender.availableAmount >= this.loanAmount * 0.1; // Can cover at least 10%
    const amountScore = canCoverAmount ? 1.0 : 0.0;
    score += amountScore * 0.4;

    // Interest rate compatibility (similar rates = higher score)
    const rateDiff = Math.abs(this.interestRate - lender.preferredRate);
    const rateScore = Math.max(0, 1 - (rateDiff / 5.0)); // 5% max difference for better matching
    score += rateScore * 0.3;

    // Risk compatibility (lender risk tolerance vs borrower risk)
    const riskScore = 1 - Math.abs(lender.riskTolerance - this.riskScore);
    score += riskScore * 0.3;

    return score;
  }

  /**
   * Check if this borrower prefers lender A over lender B
   */
  prefers(lenderA, lenderB) {
    const indexA = this.preferences.indexOf(lenderA.id);
    const indexB = this.preferences.indexOf(lenderB.id);

    if (indexA === -1 && indexB === -1) return false;
    if (indexA === -1) return false;
    if (indexB === -1) return true;

    return indexA < indexB; // Lower index = higher preference
  }
}

/**
 * Lender class for matching algorithm
 */
class Lender {
  constructor(id, name, availableAmount, preferredRate, riskTolerance, preferences = []) {
    this.id = id;
    this.name = name;
    this.availableAmount = availableAmount;
    this.preferredRate = preferredRate;
    this.riskTolerance = riskTolerance; // 0-1, higher means more risk tolerant
    this.preferences = preferences; // Array of borrower IDs in order of preference
    this.currentMatches = [];
    this.remainingCapacity = availableAmount;
  }

  /**
   * Check if lender can accept more loans
   */
  canAcceptMore() {
    return this.remainingCapacity > 0;
  }

  /**
   * Accept a borrower match
   */
  acceptMatch(borrower, loanAmount) {
    this.currentMatches.push({
      borrowerId: borrower.id,
      loanAmount: loanAmount,
      timestamp: new Date(),
    });
    this.remainingCapacity -= loanAmount;
  }

  /**
   * Replace current match with better one
   */
  replaceMatch(currentBorrower, newBorrower, loanAmount) {
    // Remove current borrower
    this.currentMatches = this.currentMatches.filter(
      match => match.borrowerId !== currentBorrower.id
    );
    this.remainingCapacity += currentBorrower.loanAmount;

    // Add new borrower
    this.acceptMatch(newBorrower, loanAmount);
  }
}

/**
 * Gale-Shapley Stable Matching Algorithm
 * Returns stable matching between lenders and borrowers
 */
function galeShapleyMatching(borrowers, lenders) {
  console.log('\n=== 🔄 GALE-SHAPLEY STABLE MATCHING ===');
  console.log(`📊 Processing ${borrowers.length} borrowers and ${lenders.length} lenders`);

  // Initialize all borrowers as unmatched
  const unmatchedBorrowers = [...borrowers];
  const matchedPairs = [];

  // Continue until all borrowers are matched or no more matches possible
  while (unmatchedBorrowers.length > 0) {
    const borrower = unmatchedBorrowers.shift();

    // Try to match with preferred lenders
    for (const lenderId of borrower.preferences) {
      const lender = lenders.find(l => l.id === lenderId);

      if (!lender || !lender.canAcceptMore()) {
        continue;
      }

      // Check if lender prefers this borrower over current matches
      let shouldAccept = false;

      if (lender.currentMatches.length === 0) {
        shouldAccept = true;
      } else {
        // Compare with current matches using compatibility score
        const currentBestMatch = lender.currentMatches.reduce((best, current) => {
          const currentBorrower = borrowers.find(b => b.id === current.borrowerId);
          const bestBorrower = borrowers.find(b => b.id === best.borrowerId);

          const currentScore = currentBorrower.getCompatibilityScore(lender);
          const bestScore = bestBorrower.getCompatibilityScore(lender);

          return currentScore > bestScore ? current : best;
        });

        const currentBestBorrower = borrowers.find(b => b.id === currentBestMatch.borrowerId);
        const currentScore = currentBestBorrower.getCompatibilityScore(lender);
        const newScore = borrower.getCompatibilityScore(lender);

        if (newScore > currentScore) {
          shouldAccept = true;
        }
      }

      if (shouldAccept) {
        // Match found
        lender.acceptMatch(borrower, borrower.loanAmount);
        borrower.currentMatch = lender;

        matchedPairs.push({
          borrowerId: borrower.id,
          lenderId: lender.id,
          loanAmount: borrower.loanAmount,
          compatibilityScore: borrower.getCompatibilityScore(lender),
          timestamp: new Date(),
        });

        console.log(`✅ Match: ${borrower.name} → ${lender.name} (₹${borrower.loanAmount})`);
        break;
      }
    }

    // If no match found, borrower remains unmatched
    if (!borrower.currentMatch) {
      console.log(`❌ No match for: ${borrower.name}`);
    }
  }

  console.log(`\n📋 Matching Complete: ${matchedPairs.length} pairs formed\n`);

  return {
    matchedPairs,
    unmatchedBorrowers: unmatchedBorrowers.map(b => b.id),
    totalMatchedAmount: matchedPairs.reduce((sum, pair) => sum + pair.loanAmount, 0),
    averageCompatibility: matchedPairs.length > 0
      ? matchedPairs.reduce((sum, pair) => sum + pair.compatibilityScore, 0) / matchedPairs.length
      : 0,
  };
}

/**
 * Enhanced matching with risk assessment and partial allocation support
 */
function enhancedMatching(borrowers, lenders, options = {}) {
  const {
    maxRiskTolerance = 0.7,
    minCompatibilityScore = 0.5,
    maxLoanAmount = 1000000,
  } = options;

  console.log('\n=== 🎯 ENHANCED MATCHING WITH PARTIAL ALLOCATION ===');

  // Filter eligible participants
  const eligibleBorrowers = borrowers.filter(b =>
    b.riskScore <= maxRiskTolerance &&
    b.loanAmount <= maxLoanAmount
  );

  const eligibleLenders = lenders.filter(l =>
    l.riskTolerance >= 0.3 // Minimum risk tolerance
  );

  console.log(`📊 Eligible: ${eligibleBorrowers.length} borrowers, ${eligibleLenders.length} lenders`);

  // Generate preferences based on compatibility scores
  eligibleBorrowers.forEach(borrower => {
    borrower.preferences = eligibleLenders
      .map(lender => ({
        lender,
        score: borrower.getCompatibilityScore(lender),
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.lender.id);
  });

  eligibleLenders.forEach(lender => {
    lender.preferences = eligibleBorrowers
      .map(borrower => ({
        borrower,
        score: borrower.getCompatibilityScore(lender),
      }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.borrower.id);
  });

  return partialAllocationMatching(eligibleBorrowers, eligibleLenders);
}

/**
 * Partial allocation matching algorithm
 * Allows multiple lenders to combine and fulfill one borrower's request
 */
function partialAllocationMatching(borrowers, lenders) {
  console.log('\n=== 🔄 PARTIAL ALLOCATION MATCHING ===');
  console.log(`📊 Processing ${borrowers.length} borrowers and ${lenders.length} lenders`);

  const matchedPairs = [];
  const unmatchedBorrowers = [...borrowers];

  // Sort lenders by available amount (largest first) for better allocation
  const sortedLenders = [...lenders].sort((a, b) => b.availableAmount - a.availableAmount);

  while (unmatchedBorrowers.length > 0) {
    const borrower = unmatchedBorrowers.shift();
    console.log(`\n🔍 Matching borrower: ${borrower.name} (₹${borrower.loanAmount})`);

    const allocatedLenders = [];
    let totalAllocated = 0;
    let weightedInterestRate = 0;
    let totalWeight = 0;

    // Try to fulfill the borrower's request with multiple lenders
    // Use sorted lenders (by capacity) but check compatibility
    for (const lender of sortedLenders) {
      console.log(`Checking lender: ${lender.name}, canAcceptMore: ${lender.canAcceptMore()}, remainingCapacity: ${lender.remainingCapacity}`);

      if (!lender.canAcceptMore()) {
        console.log(`Skipping ${lender.name} - cannot accept more`);
        continue;
      }

      // Calculate how much this lender can contribute
      const maxContribution = Math.min(
        borrower.loanAmount - totalAllocated,
        lender.remainingCapacity
      );

      console.log(`Max contribution for ${lender.name}: ${maxContribution}`);

      if (maxContribution <= 0) {
        console.log(`Skipping ${lender.name} - max contribution <= 0`);
        continue;
      }

      // Calculate compatibility score for this allocation
      const compatibilityScore = borrower.getCompatibilityScore(lender);
      console.log(`Compatibility score for ${lender.name}: ${compatibilityScore}`);

      if (compatibilityScore >= 0.3) { // Minimum compatibility threshold
        const allocation = {
          lenderId: lender.id,
          amount: maxContribution,
          interestRate: lender.preferredRate,
          compatibilityScore: compatibilityScore,
        };

        allocatedLenders.push(allocation);
        totalAllocated += maxContribution;

        // Update weighted average interest rate
        weightedInterestRate += (lender.preferredRate * maxContribution);
        totalWeight += maxContribution;

        // Update lender's remaining capacity
        lender.remainingCapacity -= maxContribution;

        console.log(`✅ Allocated: ${lender.name} → ₹${maxContribution} @ ${lender.preferredRate}%`);

        // Check if borrower's request is fully satisfied
        if (totalAllocated >= borrower.loanAmount) {
          break;
        }
      } else {
        console.log(`Skipping ${lender.name} - compatibility score too low: ${compatibilityScore}`);
      }
    }

    // Check if we successfully allocated enough
    if (totalAllocated >= borrower.loanAmount * 0.8) { // At least 80% of requested amount
      const averageInterestRate = totalWeight > 0 ? weightedInterestRate / totalWeight : borrower.interestRate;
      const overallCompatibility = allocatedLenders.reduce((sum, alloc) =>
        sum + alloc.compatibilityScore, 0) / allocatedLenders.length;

      matchedPairs.push({
        borrowerId: borrower.id,
        borrowerName: borrower.name,
        requestedAmount: borrower.loanAmount,
        allocatedAmount: totalAllocated,
        lenders: allocatedLenders,
        averageInterestRate: averageInterestRate,
        overallCompatibility: overallCompatibility,
        allocationPercentage: (totalAllocated / borrower.loanAmount) * 100,
        timestamp: new Date(),
      });

      console.log(`🎉 Successfully matched: ${borrower.name} with ${allocatedLenders.length} lenders`);
      console.log(`💰 Allocated: ₹${totalAllocated}/${borrower.loanAmount} (${((totalAllocated / borrower.loanAmount) * 100).toFixed(1)}%)`);
      console.log(`📊 Average Interest: ${averageInterestRate.toFixed(2)}%`);

    } else {
      console.log(`❌ Insufficient allocation for: ${borrower.name} (₹${totalAllocated}/${borrower.loanAmount})`);
    }
  }

  console.log(`\n📋 Matching Complete: ${matchedPairs.length} pairs formed`);
  console.log(`💰 Total Allocated: ₹${matchedPairs.reduce((sum, pair) => sum + pair.allocatedAmount, 0)}`);

  return {
    matchedPairs,
    unmatchedBorrowers: unmatchedBorrowers.map(b => b.id),
    totalAllocatedAmount: matchedPairs.reduce((sum, pair) => sum + pair.allocatedAmount, 0),
    averageCompatibility: matchedPairs.length > 0
      ? matchedPairs.reduce((sum, pair) => sum + pair.overallCompatibility, 0) / matchedPairs.length
      : 0,
    partialAllocations: matchedPairs.filter(pair => pair.lenders.length > 1).length,
  };
}

/**
 * Generate sample data for testing
 */
function generateSampleData() {
  const borrowers = [
    new Borrower('B1', 'Rajesh Kumar', 50000, 12, 0.3),
    new Borrower('B2', 'Priya Sharma', 75000, 10, 0.2),
    new Borrower('B3', 'Amit Patel', 100000, 15, 0.5),
    new Borrower('B4', 'Sunita Devi', 30000, 8, 0.1),
    new Borrower('B5', 'Vikram Singh', 150000, 18, 0.6),
  ];

  const lenders = [
    new Lender('L1', 'HDFC Bank', 500000, 12, 0.4),
    new Lender('L2', 'SBI Rural', 300000, 10, 0.3),
    new Lender('L3', 'ICICI Agri', 200000, 14, 0.5),
    new Lender('L4', 'Rural Finance Corp', 100000, 8, 0.2),
  ];

  return { borrowers, lenders };
}

module.exports = {
  Borrower,
  Lender,
  galeShapleyMatching,
  enhancedMatching,
  generateSampleData,
};
