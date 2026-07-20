async function testLogin() {
  const url = 'http://localhost:5000/api/auth/login';
  
  // Test valid login
  const validResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com', password: 'password' })
  });
  if (validResponse.ok) {
    console.log('Valid login test passed');
  } else {
    console.error('Valid login test failed:', validResponse.statusText);
  }

  // Test missing password
  const missingResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@example.com' })
  });
  if (missingResponse.status === 400) {
    console.log('Missing password test passed');
  } else {
    console.error('Missing password test failed: Unexpected status', missingResponse.status);
  }
}

testLogin();
