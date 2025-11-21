const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

async function testDualRegistration() {
  console.log('🧪 Testing Dual Registration (Same user as both Lender and Borrower)\n');

  const testUser = {
    fullName: 'Rajesh Kumar',
    email: 'rajesh.kumar@example.com',
    phone: '+919876543210',
    aadharNumber: '123456789012'
  };

  try {
    // Test 1: Register as Lender
    console.log('📝 Test 1: Registering as Lender...');
    const lenderResponse = await axios.post(`${BASE_URL}/auth/register`, {
      ...testUser,
      role: 'Lender'
    });

    console.log('✅ Lender Registration Success:', lenderResponse.data.message);
    console.log('   User ID:', lenderResponse.data.data.userId);
    console.log('   Role:', lenderResponse.data.data.role);

    // Test 2: Try to register same email as Lender again (should fail)
    console.log('\n📝 Test 2: Attempting duplicate Lender registration (should fail)...');
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        ...testUser,
        role: 'Lender'
      });
      console.log('❌ ERROR: Duplicate registration should have failed!');
    } catch (error) {
      console.log('✅ Correctly blocked duplicate Lender registration:', error.response.data.error);
    }

    // Test 3: Register same email as Borrower (should succeed)
    console.log('\n📝 Test 3: Registering same email as Borrower...');
    const borrowerResponse = await axios.post(`${BASE_URL}/auth/register`, {
      ...testUser,
      role: 'Borrower'
    });

    console.log('✅ Borrower Registration Success:', borrowerResponse.data.message);
    console.log('   User ID:', borrowerResponse.data.data.userId);
    console.log('   Role:', borrowerResponse.data.data.role);

    // Test 4: Try to register same email as Borrower again (should fail)
    console.log('\n📝 Test 4: Attempting duplicate Borrower registration (should fail)...');
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        ...testUser,
        role: 'Borrower'
      });
      console.log('❌ ERROR: Duplicate registration should have failed!');
    } catch (error) {
      console.log('✅ Correctly blocked duplicate Borrower registration:', error.response.data.error);
    }

    // Test 5: Generate credentials for Lender account
    console.log('\n📝 Test 5: Generating credentials for Lender account...');
    const lenderCredResponse = await axios.post(`${BASE_URL}/auth/generate-credentials`, {
      uniqueId: 'rajesh_lender_001',
      password: 'password123',
      role: 'Lender',
      email: testUser.email
    }, {
      headers: {
        'x-user-email': testUser.email
      }
    });

    console.log('✅ Lender Credentials Generated:', lenderCredResponse.data.message);

    // Test 6: Generate credentials for Borrower account
    console.log('\n📝 Test 6: Generating credentials for Borrower account...');
    const borrowerCredResponse = await axios.post(`${BASE_URL}/auth/generate-credentials`, {
      uniqueId: 'rajesh_borrower_001',
      password: 'password123',
      role: 'Borrower',
      email: testUser.email
    }, {
      headers: {
        'x-user-email': testUser.email
      }
    });

    console.log('✅ Borrower Credentials Generated:', borrowerCredResponse.data.message);

    // Test 7: Login as Lender
    console.log('\n📝 Test 7: Logging in as Lender...');
    const lenderLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      uniqueId: 'rajesh_lender_001',
      password: 'password123'
    });

    console.log('✅ Lender Login Success:', lenderLoginResponse.data.data.user.fullName);
    console.log('   Role:', lenderLoginResponse.data.data.user.role);

    // Test 8: Login as Borrower
    console.log('\n📝 Test 8: Logging in as Borrower...');
    const borrowerLoginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      uniqueId: 'rajesh_borrower_001',
      password: 'password123'
    });

    console.log('✅ Borrower Login Success:', borrowerLoginResponse.data.data.user.fullName);
    console.log('   Role:', borrowerLoginResponse.data.data.user.role);

    console.log('\n🎉 All tests passed! Dual registration system working correctly.');
    console.log('\n📊 Summary:');
    console.log('   - Same email can have both Lender and Borrower accounts');
    console.log('   - Each role requires separate registration');
    console.log('   - Separate credentials for each role');
    console.log('   - Independent login for each role');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testDualRegistration();
