import appHtml from './app.html' with { type: 'text' };

export default {
  async fetch(request) {
    return new Response(appHtml, {
      headers: {
        'Content-Type': 'text/html;charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
};
