import Loan from "../../models/Loan.js";

function testRepayment() {
    const loan = new Loan({
        totalAmount: 2000,
        averageInterestRate: 12,
        duration: 6
    });

    const total = loan.getTotalAmount();
    console.log("Total repayable:", total);

    let paid = 0;
    while (paid < total) {
        paid += 500;
        console.log(`Paid: ${paid}, Remaining: ${total - paid}`);
    }
}

testRepayment();
