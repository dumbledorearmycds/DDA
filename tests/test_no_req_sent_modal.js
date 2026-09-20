const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let errors = 0;

if (html.includes('id="overlayReqSent"')) {
  console.error('FAIL: overlayReqSent still exists in HTML');
  errors++;
}

if (html.includes('showOverlay("overlayReqSent")')) {
  console.error('FAIL: showOverlay("overlayReqSent") still called');
  errors++;
}

if (!html.includes('showToast(`📬 Request sent for')) {
  console.error('FAIL: showToast notification for request sent not found');
  errors++;
}

if (errors === 0) {
  console.log('✅ Request Sent modal successfully removed and replaced with seamless toast!');
} else {
  process.exit(1);
}
