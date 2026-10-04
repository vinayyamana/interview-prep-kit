// Local fake company sites for testing the crawler. No dependencies.
// Run from the repo root:  node test-sites/server.js
// Sites:
//   http://127.0.0.1:8099/        (same as /acme/) - has a hiring page at a buried path
//   http://127.0.0.1:8099/acme/   - homepage, about, and a hiring process page
//   http://127.0.0.1:8099/plain/  - homepage and about only, NO hiring page
const http = require('http');

const page = (title, body) =>
  `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>`;

// All links are RELATIVE on purpose, to test relative-link following.
const sites = {
  acme: {
    '': page(
      'Acme Forecasting',
      `<p>Acme builds forecasting APIs for retailers.</p>
       <nav><a href="about.html">About us</a> | <a href="handbook/people/how-we-interview.html">Working here</a></nav>`
    ),
    'about.html': page(
      'About Acme',
      '<p>Acme is a 60-person company building demand forecasting APIs. We value ownership and clear writing.</p>'
    ),
    'handbook/people/how-we-interview.html': page(
      'How we interview',
      `<p>Our process has 3 stages: a recruiter chat, a take-home exercise (about 3 hours),
       then a system design round with two engineers, and a final values conversation.</p>`
    ),
  },
  plain: {
    '': page(
      'Plain Co',
      '<p>Plain Co sells paper.</p><a href="about.html">About</a>'
    ),
    'about.html': page('About Plain Co', '<p>Plain Co is a small paper supplier founded in 1998.</p>'),
  },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let parts = url.pathname.split('/').filter(Boolean);
  let siteName = 'acme'; // root serves acme
  if (parts[0] && sites[parts[0]]) siteName = parts.shift();
  const file = parts.join('/');

  if (url.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('User-agent: *\nAllow: /\n');
  }

  const html = sites[siteName][file];
  if (html === undefined) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(8099, '127.0.0.1', () => {
  console.log('Test sites running at http://127.0.0.1:8099/');
});