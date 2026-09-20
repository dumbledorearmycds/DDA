const { execSync } = require('child_process');

const tests = [
  'tests/test_optimistic_runner.js',
  'tests/test_optimistic_suggestions.js',
  'tests/test_optimistic_comments.js',
  'tests/test_optimistic_extended.js',
  'tests/test_fragment_caching.js',
  'tests/test_page_visibility_refresh.js',
  'tests/test_security_audit_fixes.js',
  'tests/test_card_requests_audit.js'
];

console.log('Running Master Test Suite for Optimistic UI & Graceful Rollbacks...\n');

let passed = 0;
for (const test of tests) {
  try {
    const output = execSync(`node "${test}"`, { encoding: 'utf-8' });
    process.stdout.write(output);
    passed++;
  } catch (err) {
    console.error(`❌ Test failed: ${test}`);
    console.error(err.stdout || err.message);
    process.exit(1);
  }
}

console.log(`\n🎉 ALL ${passed}/${tests.length} TEST SUITES PASSED CLEANLY!`);
